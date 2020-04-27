<!DOCTYPE html>
<!--
This is a pretty basic example viewer. No syntax coloring,
no editing in place. It just runs the example file you choose
and hijacks console.log to display in the body of the page.
It's barely been tested at all. If it doesn't work, just load
the example file on a page yourself (you'll have to look in the
real console for the output) or run it in nodejs.
-->
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>{%pretty_name%} Examples</title>
	<script src="../{%pkg_main%}"></script>
	<script src="_list.jsonp"></script>
	<script>
		// A fake require function so node scripts work.
		function require() {
			return {%export_var%};
		}
		
		// Shortcuts
		function onready(fn) {
			document.addEventListener("DOMContentLoaded", fn);
		}
		function get(el) {
			return document.getElementById(el);
		}
		
		// Convert entities
		function encode(str) {
			return String(str).replace(
				/[\u00A0-\u9999<>\&]/gim,
				function (c) {
				   return '&#' + c.charCodeAt(0) + ';';
				}
			);
		}
		
		// Hijack console.log
		onready(function() {
			var real_log = console.log,
				log_div = get('log');
			console.log = function (val) {
				log_div.innerHTML += '<code>' + encode(val) + '</code>';
				return real_log.apply(console, arguments);
			};
		});
		
		// Set up the script loader UI
		onready(function(event) {
		
			// Load the selected file
			var file = String(location.search).substring(1),
				unescaped = unescape(file);
			
			// If a file is selected...
			if (file) {
				document.getElementById('src').innerHTML =
					 encode(examples[unescaped]);

				var script = document.createElement('script');
				script.src = file + '?t=' + Date.now();
				document.getElementsByTagName('head')[0].appendChild(script);
				
				get('choose').innerHTML = 'Choose another example';
				get('file').innerHTML = '"' + unescaped + '"';
			}

			// Populate the menu
			var select = get('list');
			for (var key in examples) {
				select.innerHTML +=
					'<option' + ((key === unescaped) ? ' disabled' : '') + '>'
					+ key + 
					'</option>';
			}
			select.onchange = function() {
				var value = this.value;
				select.selectedIndex = 0;
				location = '?' + escape(value);
			};
			
		});

	</script>
	<style>
		html, body {
			--header-height: 3em;
			height: 100%;
			margin: 0;
			padding: 0;
			background: #fff;
			font-family: sans-serif;
		}
		heading {
			position: absolute;
			top: 0;
			height: var(--header-height);
			width: 50%;
			margin: 0;
			padding: 0 20px;
			line-height: 100%;
			border-bottom: 1px dashed #999;
			box-sizing: border-box;
			display: flex;
			align-items: center;
			justify-content: space-between;
		}
		.pane {
			width: 50%;
			position: absolute;
			top: var(--header-height);
			height: calc(100vh - var(--header-height));
			overflow: scroll;
		}
		.left {
			left: 0;
			background: #ececec;
		}
		.right {
			right: 0;
			background: #f6f6f6;
		}
		pre {
			margin: 0;
			padding: 1em 20px;
			box-sizing: content-box;
			tab-size: 4;
		}
		code {
			display: block;
			border-bottom: 1px solid #ddd;
			padding: 0.3em 20px;
		}
	</style>
</head>
<body>
<heading id="src_head" class="left">
	<label id="file">The example code will appear below.</label>
	<select id="list">
		<option id="choose">Choose an example</option>
	</select>
</heading>
<div class="pane left"><pre id="src"></pre></div>

<heading id="log_head" class="right"><label>Console</label></heading>
<div id="log" class="pane right"></div>
</body>
</html>
