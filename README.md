refract
=======

[![Build Status](https://travis-ci.org/majorleaguesoccer/refract.png?branch=master)](https://travis-ci.org/majorleaguesoccer/refract)
[![devDependency Status](https://david-dm.org/majorleaguesoccer/refract.png)](https://david-dm.org/majorleaguesoccer/refract#info=dependencies)

[![NPM](https://nodei.co/npm/refract.png?downloads=true&stars=true)](https://nodei.co/npm/refract/)

refract is a simple image resizing server. By default it will respond to convention based filenames to specify the output image size.

Installation
------------

```
npm install refract
```

Usage
-----

```
var server = require('refract')(options);
server.listen(8080);
```

refract returns an instance of `http.Server`, so make sure to call `listen`.


Options
-------

The following options may be passed in when you create the server:

* source - **required** `function(info)` - a function which returns a readable stream for the original image. 
* dest - _optional_ `function(info)` - a function which returns a writable stream to store the resized image. This is in addition to returning the resized image.
* parse - _optional_ `function(path)` - overrides the default filename parsing logic to specify output image size. Must return an instance of `info`.

`info` is on object defined as follows
```
{
  filename: // filename part of the request url
, folder: // folder part of the request url
, ext: // file extension of the request url, lowercased. Must currently be .png or .jpg
, original: // boolean indicating whether this request is for the original image or a resized version
, width: // requested output width
, height: // requested output height
}
```

Filename parsing
----------------

By default refract uses the following filename convention for the filename:

* `<width>x.ext` - resize to `width` while maintaining aspect ratio. Ex: `100x.png`
* `x<height>.ext` - resize to `height` while maintaining aspect ratio. Ex: `x200.png`
* `<width>x<height>.ext` - resize to `width` x `height` while maintaining aspect ratio. If the source and destination aspects don't match, then refract will center-crop to fully fill the output image size. Ex: `300x200.png`

Anything else is considered a request for the original image. This logic may be changed by providing a function to the `parse` option that returns the `info` object.


Dependencies
------------

refract depends upon the `gm` module which requires you have GraphicsMagick or ImageMagick installed. For more information, look at the [gm docs](https://github.com/aheckmann/gm#getting-started).


License
-------

The MIT License (MIT)

Copyright (c) 2014 Major League Soccer, LLC.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
