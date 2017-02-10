var FS = require('fs')
var Path = require('path')
var mkdirp = require('mkdirp')
var compileToHTML = require('./lib/compile-to-html')
var cheerio = require('cheerio')
var exec = require('child_process').exec

function SimpleHtmlPrecompiler (staticDir, pathsGetter, options) {
  this.staticDir = staticDir
  this.pathsGetter = pathsGetter
  this.options = options || {}
}

SimpleHtmlPrecompiler.prototype.apply = function (compiler) {
  var self = this
  compiler.plugin('compilation', function(compilation) {
    compilation.plugin('html-webpack-plugin-after-html-processing', function (htmlPluginData, callback) {
      var processedIndexHtml = htmlPluginData.html
      callback(null, htmlPluginData)

      compiler.plugin('after-emit', function (compilation, done) {
        exec('php ' + self.pathsGetter, function (error, stdout, stderr) {
          let paths = JSON.parse(stdout)
          Promise.all(
            paths.map(function (outputPath) {
              return new Promise(function (resolve, reject) {
                compileToHTML(self.staticDir, outputPath, self.options, function (prerenderedHTML) {
                  if (self.options.postProcessHtml) {
                    prerenderedHTML = self.options.postProcessHtml({
                      html: prerenderedHTML,
                      route: outputPath
                    })
                  }

                  // insert the rendered html from phantomjs into the body of index.html
                  let cheerioPhantomHTML = cheerio.load(prerenderedHTML)
                  let cheerioProcessedIndexHtml = cheerio.load(processedIndexHtml)
                  let siteWrapper = cheerioPhantomHTML('#app').html()
                  cheerioProcessedIndexHtml('#app').append(siteWrapper)
                  let mergedHTML = cheerioProcessedIndexHtml.root()

                  var folder = Path.join(self.staticDir, outputPath)
                  mkdirp(folder, function (error) {
                    if (error) {
                      return reject('Folder could not be created: ' + folder + '\n' + error)
                    }
                    var file = Path.join(folder, 'index.html')
                    FS.writeFile(
                      file,
                      mergedHTML.html(),
                      function (error) {
                        if (error) {
                          return reject('Could not write file: ' + file + '\n' + error)
                        }
                        resolve()
                      }
                    )
                  })
                })
              })
            })
          )
          .then(function () { done() })
          .catch(function (error) {
            // setTimeout prevents the Promise from swallowing the throw
            setTimeout(function () { throw error })
          })
        })
      })
    })
  })
}

module.exports = SimpleHtmlPrecompiler
