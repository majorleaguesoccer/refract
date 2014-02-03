'use strict';

var utils = require('./lib/utils')
  , assert = require('assert')
  , ase = assert.strictEqual
  ;

describe('utils', function () {
  describe('parseRequest', function () {
    it('should parse width only request', function () {
      var opts = utils.parseRequest('/test/300x.png');

      ase(opts.width, 300);
      ase(opts.height, null);
      ase(opts.original, false);
    });

    it('should parse height only request', function () {
      var opts = utils.parseRequest('/test/x300.png');

      ase(opts.width, null);
      ase(opts.height, 300);
      ase(opts.original, false);
    });

    it('should parse width and height request', function () {
      var opts = utils.parseRequest('/test/200x300.png');

      ase(opts.width, 200);
      ase(opts.height, 300);
      ase(opts.original, false);
    });

    it('should parse original request', function () {
      var opts = utils.parseRequest('/test/asdf.png');

      ase(opts.width, null);
      ase(opts.height, null);
      ase(opts.original, true);
    });

    it('should lowercase extension', function () {
      var opts = utils.parseRequest('/test/asdf.PNG');

      ase(opts.ext, '.png');
    });

    it('should parse folder', function () {
      var opts = utils.parseRequest('/test/asdf.PNG');

      ase(opts.folder, '/test');
    });

    it('should parse filename', function () {
      var opts = utils.parseRequest('/test/asdf.PNG');

      ase(opts.filename, 'asdf.PNG');
    });
  });

  describe('calculateOps', function () {
    var src = { width: 500, height: 500 };

    it('should handle height only', function () {
      var ops = utils.calculateOps(src, { height: 250 });
      ase(ops.resize.height, 250);
      ase(ops.resize.width, null);
      ase(ops.crop, undefined);
    });

    it('should handle width only', function () {
      var ops = utils.calculateOps(src, { width: 250 });
      ase(ops.resize.width, 250);
      ase(ops.resize.height, null);
      ase(ops.crop, undefined);
    });

    it('should prevent upscaling', function () {
      var ops = utils.calculateOps(src, { width: 600 });
      ase(ops, null);
    });

    it('should center crop width-wise', function () {
      var ops = utils.calculateOps(src, { width: 250, height: 300 });
      ase(ops.resize.width, null);
      ase(ops.resize.height, 300);
      ase(ops.crop.x, 25);
      ase(ops.crop.y, 0);
    });

    it('should center crop height-wise', function () {
      var ops = utils.calculateOps(src, { width: 300, height: 250 });
      ase(ops.resize.width, 300);
      ase(ops.resize.height, null);
      ase(ops.crop.x, 0);
      ase(ops.crop.y, 25);
    });

    it('should handle odd sizing', function () {
      var ops = utils.calculateOps(src, { width: 300, height: 251 });
      ase(ops.resize.width, 300);
      ase(ops.resize.height, null);
      ase(ops.crop.x, 0);
      ase(ops.crop.y, 24);
    });

    it('should handle same aspect ratio', function () {
      var ops = utils.calculateOps({ width: 600, height: 400 }, { width: 300, height: 200 });
      ase(ops.resize.width, 300);
      ase(ops.resize.height, 200);
    });
  });
});