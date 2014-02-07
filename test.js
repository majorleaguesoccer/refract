'use strict';

var utils = require('./lib/utils')
  , assert = require('assert')
  , request = require('supertest')
  , fs = require('fs')
  , gm = require('gm')
  , ase = assert.strictEqual
  ;

function binaryParser(res, callback) {
    res.setEncoding('binary');
    res.data = '';
    res.on('data', function (chunk) {
        res.data += chunk;
    });
    res.on('end', function () {
        callback(null, new Buffer(res.data, 'binary'));
    });
}

describe('server', function () {
  var date = new Date();
  var app = require('./index')({
    source: function (opts, next) {
      next(null, fs.createReadStream('./test/doge.jpg'), new Date(date.toUTCString()));
    }
  , cacheDuration: 1000
  });

  it('should resize to square image', function (done) {
    request(app)
      .get('/200x200.jpg')
      .expect('Content-Type', 'image/jpeg')
      .expect('Cache-Control', 'public, max-age=1000')
      .expect('Last-Modified', date.toUTCString())
      .expect(200)
      .parse(binaryParser)
      .end(function (err, res) {
        if (err) return done(err);

        gm(res.body, 'img.jpg').size({ bufferStream: true }, function (err, size) {
          if (err) return done(err);
          ase(size.width, 200);
          ase(size.height, 200);
          done();
        });
      });
  });

  it('should return 304 if not modified', function (done) {
    request(app)
      .get('/200x200.jpg')
      .set('If-Modified-Since', date.toUTCString())
      .expect(304, done);
  });

  it('should return resized if modified', function (done) {
    request(app)
      .get('/200x200.jpg')
      .set('If-Modified-Since', new Date(+date - 1000).toUTCString())
      .expect(200, done);
  });

  it('should resize height only image', function (done) {
    request(app)
      .get('/x200.jpg')
      .expect('Content-Type', 'image/jpeg')
      .expect(200)
      .parse(binaryParser)
      .end(function (err, res) {
        if (err) return done(err);

        gm(res.body, 'img.jpg').size({ bufferStream: true }, function (err, size) {
          if (err) return done(err);
          ase(size.width, 203);
          ase(size.height, 200);
          done();
        });
      });
  });

  it('should resize width only image', function (done) {
    request(app)
      .get('/200x.jpg')
      .expect('Content-Type', 'image/jpeg')
      .parse(binaryParser)
      .end(function (err, res) {
        if (err) return done(err);

        gm(res.body, 'img.jpg').size({ bufferStream: true }, function (err, size) {
          if (err) return done(err);
          ase(size.width, 200);
          ase(size.height, 197);
          done();
        });
      });
  });

  it('should return 404 for upscaling', function (done) {
    request(app)
      .get('/300x300.jpg')
      .expect(404, done);
  });

  it('should return 400 for unsupported extension', function (done) {
    request(app)
      .get('/300x300.svg')
      .expect(400, done);
  });
});

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
      var ops = utils.calculateOps({ width: 226, height: 223}, { width: 200, height: 200 });
      ase(ops.resize.width, null);
      ase(ops.resize.height, 200);
      ase(ops.crop.x, 1);
      ase(ops.crop.y, 0);
    });

    it('should handle same aspect ratio', function () {
      var ops = utils.calculateOps({ width: 600, height: 400 }, { width: 300, height: 200 });
      ase(ops.resize.width, 300);
      ase(ops.resize.height, 200);
    });
  });
});