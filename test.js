'use strict';

var utils = require('./lib/utils')
  , path = require('path')
  , assert = require('assert')
  , request = require('supertest')
  , refract = require('./index')
  , fs = require('fs')
  , gm = require('gm')
  , stream = require('stream')
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
  var app = refract({
    source: function (opts, next) {
      var fname = path.join(__dirname, '/test/doge.jpg');
      next(null, fs.createReadStream(fname), new Date(date.toUTCString()));
    }
  , cacheDuration: 1000
  , clientCacheDuration: 30
  });
  var srcBuffer = refract({
    source: function (opts, next) {
      fs.readFile('./test/doge.jpg', function (err, data) {
        next(err, data, new Date(date.toUTCString()));
      });
    }
  });

  it('should resize to square image', function (done) {
    request(app)
      .get('/200x200.jpg')
      .expect('Content-Type', 'image/jpeg')
      .expect('Cache-Control', 'public, s-maxage=1000, max-age=30')
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

  it('should resize from source buffer', function (done) {
    request(srcBuffer)
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

  var srcError = refract({
    source: function (opts, next) {
      next(null, fs.createReadStream('./test/nonexistantfile.jpg'), new Date(date.toUTCString()));
    }
  });
  var throughError = refract({
    source: function (opts, next) {
      next(null, fs.createReadStream('./test/doge.jpg'), new Date(date.toUTCString()));
    }
  , through: function (opts) {
      var ts = new stream.Transform();
      ts._transform = function(chunk, encoding, callback) {
        callback(new Error('Through Error'));
      };
      return ts;
    }
  });
  var destError = refract({
    source: function (opts, next) {
      next(null, fs.createReadStream('./test/doge.jpg'), new Date(date.toUTCString()));
    }
  , dest: function (opts, next) {
      var ws = new stream.Writable();
      ws._write = function(chunk, encoding, callback) {
        callback(new Error('Destination Error'));
      };
      next(null, ws);
    }
  });

  it('should return 500 for source stream error', function (done) {
    this.timeout(5000);

    request(srcError)
      .get('/x200.jpg')
      .expect(500, done);
  });

  it('should return 500 for through stream error', function (done) {
    request(throughError)
      .get('/x200.jpg')
      .expect(500)
      .end(function (err, res) {
        if (err) return done(err);
        if (res.header['cache-control']) return done(new Error('Cache-Control should be empty'));
        done();
      });
  });

  it('should return 500 for destination stream error', function (done) {
    request(destError)
      .get('/x200.jpg')
      .expect(500)
      .end(function (err, res) {
        if (err) return done(err);
        if (res.header['cache-control']) return done(new Error('Cache-Control should be empty'));
        done();
      });
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
