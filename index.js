'use strict';

var http = require('http')
  , url = require('url')
  , gm = require('gm')
  , utils = require('./lib/utils')
  , async = require('async')
  , domain = require('domain')
  , Stream = require('stream').Stream
  , allowedExtensions = ['.png', '.jpg']
  , cache = require('memory-cache')
  , concat = require('concat-stream')
  , inProgress = {}
  , Q = require('q')
  ;

  var mimeTypes = {
    '.png': 'image/png'
  , '.jpg': 'image/jpeg'
  };

function defaults(options) {
  var opt = {
    parse: utils.parseRequest
  , cacheDuration: 2628000
  , memoryCache: true
  , memoryCacheDuration: 30000
  };
  for (var x in options) opt[x] = options[x];
  return opt;
}

module.exports = function(options) {
  options = defaults(options);
  if (!options.source) throw new Error('You must provide a source stream function');
  if (!options.parse) throw new Error('You must provide a request parsing function');

  var server = http.createServer(function (req, res) {
    var d = domain.create();
    d.on('error', function (er) {
      res.removeHeader('Cache-Control');
      res.removeHeader('Last-Modified');
      res.removeHeader('Content-Type');
      res.statusCode = 500;
      res.end();      
    });
    d.add(req);
    d.add(res);

    d.run(function () {
      // if we are doing memory caching and we haven't cached yet
      // queue up requests after the first one, and then resolve them 
      // with that result
      var uri = url.parse(req.url);
      if (options.memoryCache && !cache.get(uri.pathname)) {
        var otherReq = inProgress[uri.pathname];
        if (otherReq) {
          otherReq.then(function () {
            handleRequest(options, req, res, d);
          });
        } else {
          var deferred = Q.defer();
          inProgress[uri.pathname] = deferred.promise;

          res.on('finish', function () {
            deferred.resolve();
            delete inProgress[uri.pathname];
          });
          // not the greatest way to handle this, but works
          // all the queued requests will stomp
          res.on('close', function () {
            inProgress[uri.pathname].resolve();
            delete inProgress[uri.pathname];
          });

          handleRequest(options, req, res, d);
        }
        return;
      }

      handleRequest(options, req, res, d);
    });
  });
  return server;
};

function handleRequest(options, req, res, d) {
  var uri = url.parse(req.url);
  var resizeOptions = options.parse(uri.pathname);
  resizeOptions.cacheDuration = options.cacheDuration;

  if (allowedExtensions.indexOf(resizeOptions.ext) === -1) {
    res.statusCode = 400;
    return res.end();
  }

  if (options.memoryCache) {
    var cachedResponse = cache.get(uri.pathname);
    if (cachedResponse) {
      res.setHeader('Content-Type', mimeTypes[resizeOptions.ext]);
      res.setHeader('Cache-Control', 'public, max-age='+options.cacheDuration); // one month
      res.setHeader('Last-Modified', cachedResponse.lastModified.toUTCString());
      return res.end(cachedResponse.buffer);
    }
  }

  var modifiedSince = req.headers['if-modified-since'];
  if (modifiedSince) resizeOptions.modifiedSince = new Date(modifiedSince);

  async.waterfall([
    function (cb) {
      options.source(resizeOptions, function (err, src, lastModified) {
        if (err) return cb(500);
        if (resizeOptions.modifiedSince && 
          +resizeOptions.modifiedSince >= +lastModified) {
          return cb(304);
        }
        if (!src) return cb(404);

        if (src instanceof Stream) d.add(src);
        return cb(null, src, lastModified);
      });
    }
  , function (src, lastModified, cb) {
      gm(src, 'img'+resizeOptions.ext).size({ bufferStream: true }, function (err, size) {
        if (err) return cb(500);
        
        var ops = utils.calculateOps(size, resizeOptions);
        if (!ops) return cb(404);

        return cb(null, this, lastModified, ops);
      });
    }
  , function (midStream, lastModified, ops, cb) {
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
        options.dest(resizeOptions, function (err, destStream) {
          if (err) return cb(500);
          if (destStream) {
            d.add(finalStream.pipe(destStream));
          }
          cb(null, finalStream, lastModified);
        });
        return;
      }

      cb(null, finalStream, lastModified);
    }
  ], function (err, finalStream, lastModified) {
    if (err) {
      res.removeHeader('Cache-Control');
      res.removeHeader('Last-Modified');
      res.removeHeader('Content-Type');
      res.statusCode = err;
      return res.end();
    }

    var modified = lastModified || new Date();
    res.setHeader('Content-Type', mimeTypes[resizeOptions.ext]);
    res.setHeader('Cache-Control', 'public, max-age='+options.cacheDuration); // one month
    res.setHeader('Last-Modified', modified.toUTCString());

    if (options.memoryCache && !cache.get(uri.pathname)) {
      d.add(finalStream.pipe(concat(function (buffer) {
        cache.put(uri.pathname, { buffer: buffer, lastModified: modified }, options.memoryCacheDuration);
      })));
    }

    finalStream.pipe(res);
  });
}