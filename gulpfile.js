var gulp = require('gulp');
var $ = require('gulp-load-plugins')({
  replaceString: /^gulp(-|\.)([0-9]+)?/
});
const fs = require('fs');
const del = require('del');
const glob = require('glob');
const path = require('path');
const mkdirp = require('mkdirp');
const to5ify = require('6to5ify');
const isparta = require('isparta');
const esperanto = require('esperanto');
const browserify = require('browserify');
const runSequence = require('run-sequence');
const source = require('vinyl-source-stream');

const manifest = require('./package.json');
const config = manifest.to5BoilerplateOptions;
const mainFile = manifest.main;
const destinationFolder = path.dirname(mainFile);
const exportFileName = path.basename(mainFile, path.extname(mainFile));

// Remove the built files
gulp.task('clean', function(cb) {
  del([destinationFolder], cb);
});

// Remove our temporary files
gulp.task('clean-tmp', function(cb) {
  del(['tmp'], cb);
});

// Send a notification when JSHint fails,
// so that you know your changes didn't build
function jshintNotify(file) {
  if (!file.jshint) { return; }
  return file.jshint.success ? false : 'JSHint failed';
}

function jscsNotify(file) {
  if (!file.jscs) { return; }
  return file.jscs.success ? false : 'JSRC failed';
}

// Lint our source code
gulp.task('lint-src', function() {
  return gulp.src(['src/**/*.js'])
    .pipe($.plumber())
    .pipe($.jshint())
    .pipe($.jshint.reporter('jshint-stylish'))
    .pipe($.notify(jshintNotify))
    .pipe($.jscs())
    .pipe($.notify(jscsNotify))
    .pipe($.jshint.reporter('fail'));
});

// Lint our test code
gulp.task('lint-test', function() {
  return gulp.src(['test/**/*.js'])
    .pipe($.plumber())
    .pipe($.jshint())
    .pipe($.jshint.reporter('jshint-stylish'))
    .pipe($.notify(jshintNotify))
    .pipe($.jscs())
    .pipe($.notify(jscsNotify))
    .pipe($.jshint.reporter('fail'));
});

// Build two versions of the library
gulp.task('build', ['lint-src', 'clean'], function(done) {
  esperanto.bundle({
    base: 'src',
    entry: config.entryFileName,
  }).then(function(bundle) {
    var res = bundle.toUmd({
      sourceMap: true,
      sourceMapSource: config.entryFileName + '.js',
      sourceMapFile: exportFileName + '.js',
      name: config.exportVarName
    });

    // Write the generated sourcemap
    mkdirp.sync(destinationFolder);
    fs.writeFileSync(path.join(destinationFolder, exportFileName + '.js'), res.map.toString());

    $.file(exportFileName + '.js', res.code, { src: true })
      .pipe($.plumber())
      .pipe($.sourcemaps.init({ loadMaps: true }))
      .pipe($.to5({ blacklist: ['useStrict'] }))
      .pipe($.sourcemaps.write('./', {addComment: false}))
      .pipe(gulp.dest(destinationFolder))
      .pipe($.filter(['*', '!**/*.js.map']))
      .pipe($.rename(exportFileName + '.min.js'))
      .pipe($.uglifyjs({
        outSourceMap: true,
        inSourceMap: destinationFolder + '/' + exportFileName + '.js.map',
      }))
      .pipe(gulp.dest(destinationFolder))
      .on('end', done);
  });
});

// Bundle our app for our unit tests
gulp.task('browserify', function() {
  var testFiles = glob.sync('./test/unit/**/*');
  var allFiles = ['./test/setup/browserify.js'].concat(testFiles);
  var bundler = browserify(allFiles);
  bundler.transform(to5ify.configure({
    sourceMapRelative: __dirname + '/src',
    blacklist: ['useStrict']
  }));
  var bundleStream = bundler.bundle();
  return bundleStream
    .on('error', function(err){
      console.log(err.message);
      this.emit('end');
    })
    .pipe($.plumber())
    .pipe(source('./tmp/__spec-build.js'))
    .pipe(gulp.dest(''))
    .pipe($.livereload());
});

function test() {
  return gulp.src(['test/setup/node.js', 'test/unit/**/*.js'], {read: false})
    .pipe($.plumber())
    .pipe($.mocha({reporter: 'dot', globals: config.mochaGlobals}));
}

gulp.task('coverage', function(done) {
  gulp.src(['src/*.js'])
    .pipe($.plumber())
    .pipe($.istanbul({ instrumenter: isparta.Instrumenter }))
    .pipe($.istanbul.hookRequire())
    .on('finish', function() {
      return test()
      .pipe($.istanbul.writeReports())
      .on('end', done);
    });
});

// Lint and run our tests
gulp.task('test', ['lint-src', 'lint-test'], function() {
  require('6to5/register')({modules: 'common'});
  return test();
});

// Ensure that linting occurs before browserify runs. This prevents
// the build from breaking due to poorly formatted code.
gulp.task('build-in-sequence', function(callback) {
  runSequence(['lint-src', 'lint-test'], 'browserify', callback);
});

// Run the headless unit tests as you make changes.
gulp.task('watch', function() {
  gulp.watch(['src/**/*', 'test/**/*', '.jshintrc', 'test/.jshintrc'], ['test']);
});

// Set up a livereload environment for our spec runner
gulp.task('test-browser', ['build-in-sequence'], function() {
  $.livereload.listen({port: 35729, host: 'localhost', start: true});
  return gulp.watch(
    ['src/**/*.js', 'test/**/*', '.jshintrc', 'test/.jshintrc'],
    ['build-in-sequence']
  );
});

// An alias of test
gulp.task('default', ['test']);
