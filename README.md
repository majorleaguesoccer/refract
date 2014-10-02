# refract

[![Build Status](https://travis-ci.org/majorleaguesoccer/refract.png?branch=master)](https://travis-ci.org/majorleaguesoccer/refract)
[![devDependency Status](https://david-dm.org/majorleaguesoccer/refract.png)](https://david-dm.org/majorleaguesoccer/refract#info=dependencies)

[![NPM](https://nodei.co/npm/refract.png)](https://nodei.co/npm/refract/)

refract is a simple image resizing server. By default it will respond to convention based filenames to specify the output image size.

# Installation

```
npm install refract
```

**Note:** refract depends upon the `gm` module which requires you have GraphicsMagick or ImageMagick installed. For instructions, consult the [gm docs](https://github.com/aheckmann/gm#getting-started).

# Usage

```
var server = require('refract')(options);
server.listen(8080);
```

refract returns an instance of `http.Server`, so make sure to call `listen`.


# Options

The following options may be passed in when you create the server:

* source - **required** `function(info)` - a function which calls a callback `function(err, stream, dateModified)` with a readable stream for the original image and the last date modified. 
* through - _optional_ `function(info)` - a function which returns a writeable stream that will be used to perform modifications after the resize/crop operations. 
* dest - _optional_ `function(info)` - a function which calls a callback `function(err, stream)` with a writable stream to store the resized image. This is in addition to returning the resized image as the HTTP response.
* parse - _optional_ `function(path)` - overrides the default filename parsing logic to specify output image size. Must return an instance of `info`.
* cacheDuration - _optional_ `Number` (default 2628000s) - duration to set in the Cache-Control header for client caching duration.
* memoryCache - _optional_ `Boolean` (default true) - cache in memory the resized image output. See more information about memory cache below.
* memoryCacheDuration - _optional_ `Number` (default 30000ms) - duration to cache in memory resized image output

`info` is on object defined as follows
```
{
  filename: // filename part of the request url
, folder: // folder part of the request url
, ext: // file extension of the request url, lowercased. Must currently be .png or .jpg
, original: // boolean indicating whether this request is for the original image or a resized version
, width: // requested output width
, height: // requested output height
, cropped: // boolean - true if the source image had to be cropped to fit the output dimensions
, modifiedSince: // `Date` object of the `if-modified-since` header sent by the client
, cacheDuration : // cache duration in seconds. You may override this per request.
}
```

## Memory Cache

Turning on the memory cache option increases performance at the cost of memory size. This happens in two ways:

1. If the server still contains the resized output in cache, it can serve it without contacting the origin and performing an expensive resize.
1. If a large number of requests for the same output are received very close together, the server will delay the responses beyond the first until the resize has completed. This helps alleviate the stampeding herd problem before a CDN can cache the result.


# Filename parsing

By default refract uses the following filename convention for the filename:

* `<width>x.ext` - resize to `width` while maintaining aspect ratio. Ex: `100x.png`
* `x<height>.ext` - resize to `height` while maintaining aspect ratio. Ex: `x200.png`
* `<width>x<height>.ext` - resize to `width` x `height` while maintaining aspect ratio. If the source and destination aspects don't match, then refract will center-crop to fully fill the output image size. Ex: `300x200.png`

Anything else is considered a request for the original image. This logic may be changed by providing a function to the `parse` option that returns the `info` object.


# License

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
