'use strict';

var http = require('http')
  , url = require('url')
  , gm = require('gm')
  , utils = require('./lib/utils')
  , allowedExtensions = ['.png', '.jpg']
  ;

  var mimeTypes = {
    '.png': 'image/png'
  , '.jpg': 'image/jpeg'
  };

function defaults(options) {
  var opt = {
    parse: utils.parseRequest
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
    if (allowedExtensions.indexOf(resizeOptions.ext) === -1) return res.send(400);

    gm(options.source(resizeOptions), 'img'+resizeOptions.ext).size({ bufferStream: true }, function (err, size) {
      var imgStream = this;
      if (err) return res.send(500);

      // fast path for original file
      if (resizeOptions.original) {
        res.setHeader('Content-Type', mimeTypes[resizeOptions.ext]);
        imgStream.pipe(res);
        return;
      }

      var ops = utils.calculateOps(size, resizeOptions);
      if (!ops) return res.send(404);

      res.setHeader('Content-Type', mimeTypes[resizeOptions.ext]);

      imgStream = imgStream.resize(ops.resize.width, ops.resize.height);
      if (ops.crop) imgStream = imgStream.crop(resizeOptions.width, resizeOptions.height, ops.crop.x, ops.crop.y);

      // remove EXIF data
      var finalStream = imgStream.noProfile().stream();
      finalStream.pause();

      finalStream.pipe(res);
      if (options.dest) finalStream.pipe(options.dest(resizeOptions));

      finalStream.resume();
    });
  });
};