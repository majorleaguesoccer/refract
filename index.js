'use strict';

var http = require('http')
  , url = require('url')
  , gm = require('gm')
  , utils = require('./lib/utils')
  , stream = require('stream')
  , allowedExtensions = ['.png', '.jpg']
  ;

  var mimeTypes = {
    '.png': 'image/png'
  , '.jpg': 'image/jpeg'
  };

function defaults(options) {
  var opt = {
    parse: utils.parseRequest
  , cacheDuration: 2628000
  };
  for (var x in options) opt[x] = options[x];
  return opt;
}

module.exports = function(options) {
  options = defaults(options);
  if (!options.source) throw new Error('You must provide a source stream function');
  if (!options.parse) throw new Error('You must provide a request parsing function');

  return http.createServer(function (req, res) {
    var uri = url.parse(req.url);
    var resizeOptions = options.parse(uri.pathname);
    resizeOptions.cacheDuration = options.cacheDuration;

    if (allowedExtensions.indexOf(resizeOptions.ext) === -1) {
      res.statusCode = 400;
      return res.end();
    }

    var modifiedSince = req.headers['if-modified-since'];
    if (modifiedSince) resizeOptions.modifiedSince = new Date(modifiedSince);

    options.source(resizeOptions, function (err, src, lastModified) {
      if (err) {
        res.statusCode = 500;
        return res.end();
      }

      if (resizeOptions.modifiedSince && 
        +resizeOptions.modifiedSince >= +lastModified) {
        res.statusCode = 304;
        return res.end();
      }

      if (!src) {
        res.statusCode = 404;
        return res.end();
      }

      if (src instanceof stream.Readable) {
        src.on('error', function (resp) {
          res.statusCode = 500;
          return res.end();
        });
      }

      gm(src, 'img'+resizeOptions.ext).size({ bufferStream: true }, function (err, size) {
        var imgStream = this;
        if (err) {
          res.statusCode = 500;
          return res.end();
        }

        var ops = utils.calculateOps(size, resizeOptions);
        if (!ops) {
          res.statusCode = 404;
          return res.end();
        }

        res.writeHead(200, {
          'Content-Type': mimeTypes[resizeOptions.ext]
        , 'Cache-Control': 'public, max-age='+options.cacheDuration // one month
        , 'Last-Modified': (lastModified || new Date()).toUTCString()
        });
        var midStream = imgStream;
        if (ops.resize) {
          midStream = imgStream
            .resize(ops.resize.width, ops.resize.height)
            .quality(resizeOptions.ext === '.png' ? 100 : 85);
        }
        if (ops.crop) {
          midStream = midStream.crop(resizeOptions.width, resizeOptions.height, ops.crop.x, ops.crop.y);
          resizeOptions.cropped = true;
        }

        // remove EXIF data
        var finalStream = midStream.noProfile().stream();
        if (options.through) {
          var throughStream = options.through(resizeOptions);
          if (throughStream) finalStream = finalStream.pipe(throughStream);
        }
        finalStream.pause();

        finalStream.pipe(res);
        
        if (options.dest) {
          options.dest(resizeOptions, function (err, destStream) {
            if (err) {
              res.statusCode = 500;
              return res.end();
            }
            if (destStream) finalStream.pipe(destStream);
            finalStream.resume();
          });
          return;
        }

        finalStream.resume();
      });
    });
  });
};