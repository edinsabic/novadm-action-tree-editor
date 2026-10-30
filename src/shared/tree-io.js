window.NovaDM = window.NovaDM || {};

/**
 * Getting a document in and out of the live model: the example/clear buttons,
 * and file import/export on both tabs (via parser.js's TREE_FILE_FORMAT). A
 * document is the tree, the profiles, the Calculations tab's data and the
 * version history (see parser.js and history.js). `download` also saves the
 * report's CSV file and PNG images.
 */
NovaDM.TreeIO = (function (Model, History, Render, EditorForm, Popovers, CalculationsTab, Parser) {
	'use strict';

	var FORMAT = Parser.TREE_FILE_FORMAT;

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

	function readDocument(text) {
		try {
			var doc = FORMAT.parse(text);
			var problem = Parser.validateDocument(doc);
			JSON.stringify(doc);
			return problem ? { problem: problem } : { doc: doc };
		} catch (err) {
			return { problem: err instanceof RangeError ? 'the file is nested too deeply to read.' : err.message };
		}
	}

	function headSnapshot(history) {
		return history.snapshots.filter(function (s) { return s.id === history.head; })[0] || {};
	}

	function newDocument(specs, source, history, name) {
		Model.replaceTree(specs);
		Model.setSource(source);
		Model.setDocumentName(name);
		if (history) {
			Model.applyProfileState(headSnapshot(history).profile, [specs]);
			CalculationsTab.reset(headSnapshot(history).calculations);
			History.load(history);
		} else {
			Model.resetProfiles();
			CalculationsTab.reset();
			History.reset();
		}
		refreshAll();
	}

	function loadExample(onStart) {
		var read = typeof NOVADM_SAMPLE_DOCUMENT === 'undefined'
			? { problem: 'it was not found or did not load – check that the examples folder sits next to index.html.' }
			: readDocument(JSON.stringify(NOVADM_SAMPLE_DOCUMENT));
		if (read.doc) newDocument(read.doc.tree, read.doc.source, read.doc.history);
		else if (onStart) newDocument([], '');
		else alert('Could not load the example tree (sample-tree.js):\n' + read.problem);
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
			' numbers, only Cost and GWP.')) {
			return;
		}
		newDocument([], '');
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
		download(text, (Model.getDocumentName() || FORMAT.defaultName) + FORMAT.extension, FORMAT.mimeType);
	}

	exportBtns.forEach(function (btn) {
		btn.title = 'Save the tree, its versions, profiles and numbers as a ' + FORMAT.extension + ' file';
		btn.addEventListener('click', exportFile);
	});

	/* ---------- Import ---------- */

	importInput.accept = FORMAT.extension;

	function nameOf(fileName) {
		var extension = FORMAT.extension;
		var hasExtension = fileName.toLowerCase().slice(-extension.length) === extension;
		return hasExtension ? fileName.slice(0, -extension.length) : fileName;
	}

	function importDocument(fileName, text) {
		var read = readDocument(text);
		if (read.problem) {
			alert('Could not import "' + fileName + '":\n' + read.problem);
			return;
		}
		var doc = read.doc;
		if (!nothingToLose() && !confirm('Replace the current tree with "' + fileName + '"?\n\nIts versions, profiles' +
			' and the numbers in the Calculations tab replace the ones on screen too.')) {
			return;
		}

		newDocument(doc.tree, doc.source, doc.history, nameOf(fileName));
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

	return {
		loadExample: loadExample,
		download: download
	};
})(NovaDM.Model, NovaDM.History, NovaDM.Render, NovaDM.EditorForm, NovaDM.Popovers, NovaDM.CalculationsTab,
	NovaDM.Parser);
