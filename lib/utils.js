'use strict';

var path = require('path');

module.exports = {
  parseRequest: function (pathname) {
    var opts = {
      filename: path.basename(pathname)
    , folder: path.dirname(pathname)
    , ext: path.extname(pathname).toLowerCase()
    , original: false
    , width: null
    , height: null
    };
    var nameParts = opts.filename.match(/^(\d*)x(\d*)\.\w+$/i);
    if (!nameParts) {
      opts.original = true;
    } else {
      if (nameParts[1]) opts.width = +nameParts[1];
      if (nameParts[2]) opts.height = +nameParts[2];
    }
    return opts;
  }

, calculateOps: function (src, dest) {
    var ops = {
      resize: { 
        width: dest.width || null
      , height: dest.height || null
      }
    };

    if (dest.width > src.width || dest.height > src.height) return null;

    if (dest.width && dest.height) {
      var srcAR = src.width / src.height;
      var destAR = dest.width / dest.height;

      // trying to make it wider. We must crop some height
      if (destAR > srcAR) {
        var newHeight = Math.floor(dest.width / srcAR);

        ops.resize.height = null;
        ops.crop = { x: 0, y: Math.floor((newHeight - dest.height) / 2) };

      } else if (destAR < srcAR) { // making it narrower. Crop some width
        var newWidth = Math.floor(dest.height * srcAR);

        ops.resize.width = null;
        ops.crop = { x : Math.floor((newWidth - dest.width) / 2), y: 0 };
      }
    }
    return ops;
  }
};