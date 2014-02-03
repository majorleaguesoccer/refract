'use strict';

var fs = require('fs');

var app = require('../index')({
  source: function (opts) {
    return fs.createReadStream('../test/doge.jpg');
  }
});
app.listen(9090);