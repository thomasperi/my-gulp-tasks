// options:
// .pretty_name: the name of the library
// .export_var: the variable to export
// .dependencies: for gulp-umd
// .gulp: the gulp from the gulpfile
// .runSequence: the runSequence from the gulpfile
module.exports = function (options) {
	const gulp = options.gulp;
	const runSequence = options.runSequence;
	const watch = require('gulp-watch');
	const rename = require('gulp-regex-rename')
	const fs = require("fs");

	const umd = require('gulp-umd');
	const pullup = require('@thomasperi/umd-pullup');
	const jshint = require('gulp-jshint');

	// Use both uglify and terser. Terser mistakenly bases its collapsing
	// decisions on the length of the original variable names instead of the
	// mangled ones. So I'm using uglify to mangle, and then terser to optimize
	// the rest, once the variable names are short enough not to mess up
	// collapsing. Terser also leaves in some unnecessary function parameters
	// after collapsing.
	const uglify = require('gulp-uglify');
	const terser = require('gulp-terser');

	const mocha = require('gulp-mocha');
	const raiseComments = require('@thomasperi/raise-comments').gulp;

	// Patterns for reading files
	var files = {
		'src': 'src/*.src.js',
		'test': 'test/*.js',
		'debug': 'dist/*.debug.js',
		'min': 'dist/*.min.js',
		'examples': 'examples/*.js'
	};

	// Directories for writing files
	var dir = {
		'dist': 'dist',
		'examples': 'examples'
	};

	// Make it easier to run tasks from inside other tasks.
	var tasks = {},
		buildQueue = [];
	function task(name, enqueue, fn) {
		tasks[name] = fn;
		if (enqueue) {
			buildQueue.push(name);
		}
	}

	// Universal Module Definition
	//
	// Adds a wrapper for deciding in real time whether the module needs to be
	// defined for AMD, exported for CommonJS (node), or assigned as a property
	// to the window object in a browser.
	//
	// The "pullup" UMD template keeps the library code at the top, preserving
	// line numbers for easy reading of the lint messages.
	task('umd', true, function() {
		return (gulp
			.src(files.src)
			.pipe(umd({
				'dependencies': function(file) {
					return options.dependencies;
				},
				'exports': function(file) {
					return options.export_var;
				},
				'namespace': function(file) {
					return options.export_var;
				},
				'template': pullup
			}))
			.pipe(rename(/\.src\.js$/, '.debug.js'))
			.pipe(gulp.dest(dir.dist))
		);
	});

	// Lint the debug file written by the 'umd' task.
	task('lint', true, function() {
		return (gulp
			.src(files.debug)
			.pipe(jshint({
				'undef': true,
				'unused': true
			}))
			.pipe(jshint.reporter('default'))
		);
	});

	// Minify the debug file and save the result without the .debug extension.
	task('min', true, function () {
		return (gulp
			.src(files.debug)
		
			// See comments at the top regarding why this uses both uglify and terser.
			.pipe(uglify({
				'output': {
					'comments': '/^!/'
				}
			}))
			.pipe(terser({
				'ecma': 5,
				'mangle': {
					'properties': {
						'regex': /^_\w+/
					}
				}
			}))
			.pipe(rename(/\.debug\.js$/, '.min.js'))
			.pipe(gulp.dest(dir.dist))
		);
	});

	// Move the library's license comment to the beginning of the minified file.
	task('comments', true, function () {
		return (gulp
			.src(files.min)
			.pipe(raiseComments())
			.pipe(gulp.dest(dir.dist))
		);
	});

	// Do the tests last so we're testing against the actual built, minified file.
	// Individual tests can be changed to use the debug file in dist if tests fail.
	task('test', true, function () {
		return (gulp
			.src(files.test)
			.pipe(mocha({
				'reporter': 'nyan',
			}))
		);
	});

	// Run the tasks in series, in the order they were defined. 
	task('build', false, function (callback) {
		runSequence(...buildQueue, callback);
	});

	// Lint the example scripts.
	task('examples-lint', false, function () {
		var globals = {
			'console': true,
			'require': true
		};
		globals[options.export_var] = true;
		return (gulp
			.src(files.examples)
			.pipe(jshint({
				'esversion': 6,
				'undef': true,
				'unused': true,
				'globals': globals
			}))
			.pipe(jshint.reporter('default'))
		);
	});

	// Generate the javascript code for setting the list array in _index.html
	task('examples-catalog', false, function (callback) {
		if (fs.existsSync(dir.examples)) {
			// Read the package.json of the package using this script
			var pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
			
			// Read the .js files from the examples directory.
			var jsfiles = fs.readdirSync(dir.examples)
				.filter(name => name.slice(-3) === '.js')
				.sort();
	
			// Read the contents of all the files
			var js = {};
			for (var i = 0; i < jsfiles.length; i++) {
				var name = jsfiles[i],
					content = fs.readFileSync(dir.examples + '/' + name, 'utf-8');
		
				// Remove the node require line
				js[name] = content.replace(
					`var ${options.export_var} = require('../${pkg.main}');`,
					''
				).trim();
			}
	
			// Write the file to _list.jsonp
			var jsonp = 
				'// This file is auto-generated. Do not edit.\n' +
				'var examples=' + JSON.stringify(js) + ';';
			fs.writeFileSync(dir.examples + '/_list.jsonp', jsonp);

			// Copy the examples index file if it doesn't exist.
			var indexfile = dir.examples + '/_index.html';
			if (!fs.existsSync(indexfile)) {
				var index = (fs
					.readFileSync(__dirname + '/examples-index.tpl', 'utf-8')
					// Populate template using function arguments to .replace()
					// so that dollar signs don't need to be escaped.
					.replace('{%pretty_name%}', ()=>options.pretty_name)
					.replace('{%export_var%}', ()=>options.export_var)
					.replace('{%pkg_main%}', ()=>pkg.main)
				);
				fs.writeFileSync(indexfile, index);
			}
		}
	
		callback();
	});

	task('examples', false, function (callback) {
		runSequence(
			'examples-lint',
			'examples-catalog',
			callback
		);
	});

	// Run tasks when changes are detected on certain files.
	task('watch', false, function () {
		// On 'src' changes, run the 'build' task.
		watch(files.src, tasks.build);

		// On 'test' changes, run just the 'test' task.
		watch(files.test, function (callback) {
			// Do it through runSequence so it runs as a task, for nice output.
			runSequence('test', callback);
		});
	
		// On 'examples' changes, run the examples task.
		watch(files.examples, tasks.examples);
	});

	// Make `gulp` run the build task.
	task('default', false, tasks.build);

	// Let the gulpfile using this script actually create all the tasks.
	return tasks;
};