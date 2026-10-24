window.NovaDM = window.NovaDM || {};

/**
 * Getting a document in and out of the live model: the example/clear buttons,
 * and file import/export on both tabs (via parser.js's TREE_FILE_FORMAT). A
 * document is the tree, the profiles, the Calculations tab's data and the
 * version history (see parser.js and history.js). Its download also saves the CSV file, and `savePng`
 * the PNG images.
 */
NovaDM.TreeIO = (function (Model, History, Render, EditorForm, Popovers, CalculationsTab, Parser) {
	'use strict';

	var FORMAT = Parser.TREE_FILE_FORMAT;
	var PNG_SCALE = 2;

	var exportBtns = document.querySelectorAll('[data-file-action="export"]');
	var importBtns = document.querySelectorAll('[data-file-action="import"]');
	var importInput = document.getElementById('import-file-input');

	function nothingToLose() {
		return Model.root.children.length === 0 && CalculationsTab.isUntouched() &&
			Model.getProfiles().length === 0 && History.snapshotCount() === 1;
	}

	function refreshAll() {
		Render.renderTree();
		EditorForm.renderEditorForm();
		Popovers.resetVersionView();
		Popovers.renderFlyout();
		Render.fitTraditionalView();
	}

	function sampleSpecs() {
		if (typeof NOVADM_SAMPLE_TREE === 'undefined') return null;
		return Parser.ensureRoot(NOVADM_SAMPLE_TREE);
	}

	function sampleSource() {
		return typeof NOVADM_SAMPLE_SOURCE === 'undefined' ? '' : NOVADM_SAMPLE_SOURCE;
	}

	function headSnapshot(history) {
		return history.snapshots.filter(function (s) { return s.id === history.head; })[0] || {};
	}

	function newDocument(specs, calculations, source, history) {
		Model.replaceTree(specs);
		Model.setSource(source);
		if (history) {
			Model.applyProfileState(headSnapshot(history).profile, [specs]);
			CalculationsTab.reset(headSnapshot(history).calculations);
			History.load(history);
		} else {
			Model.resetProfiles();
			CalculationsTab.reset(calculations);
			History.reset();
		}
		refreshAll();
	}

	function loadExample() {
		var specs = sampleSpecs();
		if (!specs) {
			alert('sample-tree.js was not found or did not load – check that it sits next to index.html.');
			return;
		}
		newDocument(specs, CalculationsTab.exampleData(), sampleSource());
	}

	/* ---------- Example and clear buttons ---------- */

	document.getElementById('load-example-btn').addEventListener('click', function () {
		if (!nothingToLose() && !confirm('Replace the current tree, and the numbers and calculated values in the' +
			' Calculations tab, with the example?')) {
			return;
		}
		loadExample();
	});

	document.getElementById('calc-load-example-btn').addEventListener('click', function () {
		if (!confirm('Load the example? It replaces the tree in the Action tree tab too, along with the numbers' +
			' and calculated values here. You can undo this.')) {
			return;
		}
		loadExample();
	});

	document.getElementById('clear-tree-btn').addEventListener('click', function () {
		if (!nothingToLose() && !confirm('Clear the whole tree?\n\nThe Calculations tab starts over too, with no' +
			' numbers, only Sum and GWP.')) {
			return;
		}
		newDocument([], null, '');
	});

	/* ---------- Export ---------- */


	function download(text, fileName, mimeType) {
		var url = URL.createObjectURL(new Blob([text], { type: mimeType }));
		var link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
	}

	function exportFile() {
		if (History.isDirty() && !History.canUpdateHead()) {
			alert('"' + History.getHead() + '" has unsaved changes, but other versions are based on it, so it' +
				' cannot store them. Save them as a new version first (Version history → Save as new version…).');
			return;
		}
		var others = History.snapshotCount() > 1 ? ' (the other versions are kept as they are)' : '';
		if (History.isDirty() && !confirm('"' + History.getHead() + '" has unsaved changes. The file will store' +
			' them as that version' + others + '.\n\nExport anyway?')) {
			return;
		}
		var tree = Model.treeSpecs();
		var text = FORMAT.serialize({
			tree: tree,
			profile: Model.getProfileState([tree]),
			calculations: CalculationsTab.getState(),
			history: History.getState(),
			source: Model.getSource()
		});
		download(text, FORMAT.defaultName + FORMAT.extension, FORMAT.mimeType);
	}

	exportBtns.forEach(function (btn) {
		btn.title = 'Save the tree, its versions, profiles and numbers as a ' + FORMAT.extension + ' file';
		btn.addEventListener('click', exportFile);
	});

	/* ---------- Import ---------- */

	importInput.accept = FORMAT.extension;

	function importDocument(fileName, text) {
		var doc;
		var problem;
		try {
			doc = FORMAT.parse(text);
			problem = Parser.validateDocument(doc);
			JSON.stringify(doc);
		} catch (err) {
			alert('Could not import "' + fileName + '":\n' +
				(err instanceof RangeError ? 'the file is nested too deeply to read.' : err.message));
			return;
		}
		if (problem) {
			alert('Could not import "' + fileName + '":\n' + problem);
			return;
		}
		if (!nothingToLose() && !confirm('Replace the current tree with "' + fileName + '"?\n\nIts versions, profiles' +
			' and the numbers in the Calculations tab replace the ones on screen too.')) {
			return;
		}

		newDocument(doc.tree, null, doc.source, doc.history);
		if (doc.addedRoot) {
			setTimeout(function () {
				alert('"' + fileName + '" has no root node, so an empty ' + Model.TOP_LEVEL_KIND + ' root node' +
					' was added above its top-level nodes. The scenario space is unchanged.');
			}, 0);
		}
	}

	importBtns.forEach(function (btn) {
		btn.title = 'Open a tree, with its versions, profiles and numbers, from a ' + FORMAT.extension + ' file';
		btn.addEventListener('click', function () { importInput.click(); });
	});

	importInput.addEventListener('change', function () {
		var file = importInput.files && importInput.files[0];
		if (!file) return;
		var reader = new FileReader();
		reader.onerror = function () {
			importInput.value = '';
			alert('Could not read "' + file.name + '".');
		};
		reader.onload = function () {
			importInput.value = '';
			importDocument(file.name, String(reader.result));
		};
		reader.readAsText(file);
	});

	/* ---------- Images ---------- */

	function copyStyles(source, copy) {
		var computed = getComputedStyle(source);
		var text = '';
		for (var i = 0; i < computed.length; i++) {
			text += computed[i] + ':' + computed.getPropertyValue(computed[i]) + ';';
		}
		copy.setAttribute('style', text);
		for (var c = 0; c < source.children.length; c++) copyStyles(source.children[c], copy.children[c]);
	}

	function imageFailed() {
		alert('This browser could not make the image. Try Chrome, Edge, Firefox or Safari.');
	}

	function savePng(element, fileName, leaveOut) {
		var box = element.getBoundingClientRect();
		var width = box.width;
		var height = box.height;
		var copy = element.cloneNode(true);
		copyStyles(element, copy);
		copy.style.margin = '0';
		if (leaveOut) {
			Array.prototype.forEach.call(copy.querySelectorAll(leaveOut), function (el) {
				el.parentNode.removeChild(el);
			});
		}
		var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
			'<foreignObject width="100%" height="100%">' + new XMLSerializer().serializeToString(copy) +
			'</foreignObject></svg>';
		var image = new Image();
		image.onerror = imageFailed;
		image.onload = function () {
			var canvas = document.createElement('canvas');
			canvas.width = Math.round(width * PNG_SCALE);
			canvas.height = Math.round(height * PNG_SCALE);
			var context = canvas.getContext('2d');
			context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-surface');
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.scale(PNG_SCALE, PNG_SCALE);
			context.drawImage(image, 0, 0);
			try {
				canvas.toBlob(function (blob) {
					if (blob) download(blob, fileName, 'image/png');
					else imageFailed();
				}, 'image/png');
			} catch (e) {
				imageFailed();
			}
		};
		image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
	}

	return {
		sampleSpecs: sampleSpecs,
		sampleSource: sampleSource,
		newDocument: newDocument,
		download: download,
		savePng: savePng
	};
})(NovaDM.Model, NovaDM.History, NovaDM.Render, NovaDM.EditorForm, NovaDM.Popovers, NovaDM.CalculationsTab,
	NovaDM.Parser);
