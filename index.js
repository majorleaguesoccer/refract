'use strict';

var http = require('http')
  , url = require('url')
  , gm = require('gm')
  , Promise = require('bluebird')
  , utils = require('./lib/utils')
  , async = require('async')
  , domain = require('domain')
  , Stream = require('stream').Stream
  , allowedExtensions = ['.png', '.jpg']
  , concat = require('concat-stream')
  , debug = require('debug')('refract')
  ;

  var mimeTypes = {
    '.png': 'image/png'
  , '.jpg': 'image/jpeg'
  };

function defaults(options) {
  var opt = {
    parse: utils.parseRequest
  , calculateImageOptions: utils.calculateOps
  , cacheDuration: 2628000
  , clientCacheDuration: 3600
  , memoryCache: true
  , memoryCacheDuration: 30000
  , imageMagick: false
  };
  for (var x in options) opt[x] = options[x];
  return opt;
}

/**
 * Refract constructor
 *
 * @param {Object} options
 */

module.exports = function Refract(options) {
  var inProgress = {}
    , cache = require('memory-cache')
    ;
  delete require.cache[require.resolve('memory-cache')];

  options = defaults(options);
  if (!options.source) throw new Error('You must provide a source stream function');
  if (!options.parse) throw new Error('You must provide a request parsing function');

  debug('[init] starting: options=`%j`', options);

  return http.createServer(function(req, res) {
    var d = domain.create();
    d.on('error', function(err) {
      debug('[request] domain error: err=`%s` \n%s\n', err, err.stack);

      if (!res.headersSent) {
        res.removeHeader('Cache-Control');
        res.removeHeader('Last-Modified');
        res.removeHeader('Content-Type');
        res.statusCode = 500;
      }

      // Check that the response has not already finished elsewhere
      if (!res.finished) res.end();
    });
    d.add(req);
    d.add(res);

    d.run(function() {
      // if we are doing memory caching and we haven't cached yet
      // queue up requests after the first one, and then resolve them
      // with that result
      var uri = url.parse(req.url)
        , path = uri.pathname
        ;

      debug('[request] starting: url=`%s`', path);

      var handler = function() {
        debug('[request] running handler');

        handleRequest(options, req, res, d, cache);
      };

      // Short out if no memory caching or already cached
      if (!options.memoryCache || cache.get(path)) {
        debug('[request] not cachable: url=`%s`', path);
        return handler();
      }

      // Find the initial request, then tack on resolution
      var otherReq = inProgress[path];
      if (otherReq) {
        debug('[request] req in progress, waiting: url=`%s`', path);
        return otherReq.then(handler);
      }


      // Create a new promise chain to allow subsequent requests to
      // tag onto the initial one, preventing parallell processing
      debug('[request] creating promise');
      inProgress[path] = new Promise(function(resolve, reject) {

        // Response ended before the `end` event, cleanup
        res.on('finish', function(e) {
          debug('[request] res finished: url=`%s`', path, e);
          if (inProgress[path]) delete inProgress[path];
          resolve();
        });

        // not the greatest way to handle this, but works
        // all the queued requests will stomp
        res.on('close', function(e) {
          debug('[request] res closed: url=`%s`', path, e);
          if (inProgress[path]) delete inProgress[path];
          resolve();
        });
      });

      handler();
    });
  });
};

function handleRequest(options, req, res, d, cache) {
  var uri = url.parse(req.url)
    , resizeOptions = options.parse(uri.pathname)
    ;

  debug('[handleRequest] url=`%s`', req.url);

  resizeOptions.cacheDuration = options.cacheDuration;
  resizeOptions.clientCacheDuration = options.clientCacheDuration;

  if (allowedExtensions.indexOf(resizeOptions.ext) === -1) {
    res.statusCode = 400;
    return res.end();
  }

  var modifiedSince = req.headers['if-modified-since'];
  if (modifiedSince) resizeOptions.modifiedSince = new Date(modifiedSince);

  if (options.memoryCache) {
    var cachedResponse = cache.get(uri.pathname);
    if (cachedResponse) {
      // handle 304s even from memory cache
      if (resizeOptions.modifiedSince && +resizeOptions.modifiedSince >= +cachedResponse.lastModified) {
        res.removeHeader('Cache-Control');
        res.removeHeader('Last-Modified');
        res.removeHeader('Content-Type');
        res.statusCode = 304;
        return res.end();
      }

      res.setHeader('Content-Type', mimeTypes[resizeOptions.ext]);
      res.setHeader('Cache-Control', 'public, s-maxage='+cachedResponse.cacheDuration + ', max-age=' + cachedResponse.clientCacheDuration); // one month
      res.setHeader('Last-Modified', cachedResponse.lastModified.toUTCString());

      return res.end(cachedResponse.buffer);
    }
  }

  async.waterfall([
    function source(cb) {
      debug('[handleRequest.source] starting: options=`%j`', resizeOptions);

      options.source(resizeOptions, function(err, src, lastModified) {
        if (err) {
          debug('[source] error:', err, err.stack);
          return cb(500);
        }
        if (resizeOptions.modifiedSince &&
          +resizeOptions.modifiedSince >= +lastModified) {
          return cb(304);
        }
        if (!src) return cb(404);

        if (src instanceof Stream) d.add(src);
        return cb(null, src, lastModified);
      });
    }

  , function convert(src, lastModified, cb) {
      var imOpts = { imageMagick: options.imageMagick }
        , sizeOpts = { bufferStream: true }
        ;

      debug('[handleRequest.convert] starting', typeof src);

      gm(src, 'img'+resizeOptions.ext).options(imOpts).size(sizeOpts, function(err, size) {
        if (err) {
          debug('[convert] error:', err, err.stack);
          return cb(500);
        }
        var ops = options.calculateImageOptions(size, resizeOptions);
        if (!ops) return cb(404);

        return cb(null, this, lastModified, ops);
      });
    }

  , function destination(midStream, lastModified, ops, cb) {
      debug('[handleRequest.destination] starting: opts=`%j`', ops);

      if (ops.resize) {
        midStream = midStream
          .resize(ops.resize.width, ops.resize.height)
          .quality(resizeOptions.ext === '.png' ? 100 : 85);
      }
      if (ops.crop) {
        midStream = midStream.crop(resizeOptions.width, resizeOptions.height, ops.crop.x, ops.crop.y);
        resizeOptions.cropped = true;
      }

      var finalStream = midStream.noProfile().stream();
      d.add(finalStream);

      if (options.through) {
        var throughStream = options.through(resizeOptions);
        if (throughStream) {
          finalStream = finalStream.pipe(throughStream);
          d.add(finalStream);
        }
      }

      if (options.dest) {
        return options.dest(resizeOptions, function(err, destStream) {
          if (err) {
            debug('[handleRequest.destination] error:', err, err.stack);
            return cb(500);
          }
          if (destStream) {
            d.add(finalStream.pipe(destStream));
          }
          cb(null, finalStream, lastModified);
        });
      }

      cb(null, finalStream, lastModified);
    }
  ], function finish(err, finalStream, lastModified) {
    if (err) {
      debug('[handleRequest.finish] error, ending: url=`%s` err=`%s`', req.url, err, err.stack);

      if (!res.headersSent) {
        res.removeHeader('Cache-Control');
        res.removeHeader('Last-Modified');
        res.removeHeader('Content-Type');
        res.statusCode = err;
      }

      // Ensure the response has not ended via domain erroring
      if (!res.finished) res.end();
      return;
    }
    debug('[handleRequest.finish] ending: url=`%s`', req.url);

    var modified = lastModified || new Date();

    if (!res.headersSent) {
      res.setHeader('Content-Type', mimeTypes[resizeOptions.ext]);
      res.setHeader('Cache-Control', 'public, s-maxage='+resizeOptions.cacheDuration+', max-age='+resizeOptions.clientCacheDuration);
      res.setHeader('Last-Modified', modified.toUTCString());
    }

    if (options.memoryCache && !cache.get(uri.pathname)) {
      d.add(finalStream.pipe(concat(function(buffer) {
        cache.put(uri.pathname, {
          buffer: buffer
        , lastModified: modified
        , cacheDuration: resizeOptions.cacheDuration
        , clientCacheDuration: resizeOptions.clientCacheDuration
        }, options.memoryCacheDuration);
      })));
    }

    finalStream.pipe(res);
  });
}
