window.NovaDM = window.NovaDM || {};

/**
 * Getting a document in and out of the live model: the example/clear buttons,
 * and file import/export (via parser.js's TREE_FILE_FORMAT). A document is
 * the tree, the profiles and the version history (see parser.js and
 * history.js).
 */
NovaDM.TreeIO = (function (Model, History, Render, EditorForm, Popovers, Parser) {
	'use strict';

	var FORMAT = Parser.TREE_FILE_FORMAT;

	var exportBtn = document.getElementById('export-tree-btn');
	var importBtn = document.getElementById('import-tree-btn');
	var importInput = document.getElementById('import-file-input');

	function treeIsEmpty() { return Model.root.children.length === 0; }

	function refreshAll() {
		Render.renderTree();
		EditorForm.renderEditorForm();
		Popovers.updatePillLabels();
		Popovers.resetVersionView();
		Popovers.renderFlyout();
		Render.fitTraditionalView();
	}

	function sampleSpecs() {
		if (typeof NOVADM_SAMPLE_TREE === 'undefined') return null;
		return Parser.ensureRoot(NOVADM_SAMPLE_TREE);
	}

	function newDocument(specs) {
		Model.replaceTree(specs);
		Model.resetProfiles();
		History.reset();
		refreshAll();
	}

	/* ---------- Example and clear buttons ---------- */

	document.getElementById('load-example-btn').addEventListener('click', function () {
		if (!treeIsEmpty() && !confirm('Replace the current tree with the example tree?')) return;
		var specs = sampleSpecs();
		if (!specs) {
			alert('sample-tree.js was not found or did not load – check that it sits next to index.html.');
			return;
		}
		newDocument(specs);
	});

	document.getElementById('clear-tree-btn').addEventListener('click', function () {
		if (!treeIsEmpty() && !confirm('Clear the whole tree?')) return;
		newDocument([]);
	});

	/* ---------- Export ---------- */

	exportBtn.title = 'Save the current tree as a ' + FORMAT.extension + ' file';

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

	exportBtn.addEventListener('click', function () {
		var hasOtherVersions = History.snapshotCount() > 1;
		if (History.isDirty() && hasOtherVersions && !confirm('"' + History.getHead() + '" has unsaved changes.' +
			' The file will store them as that version (the other versions are kept as they are).' +
			'\n\nExport anyway?')) {
			return;
		}
		var text = FORMAT.serialize({
			tree: Model.treeSpecs(),
			profile: Model.getProfileState(),
			history: History.getState()
		});
		download(text, FORMAT.defaultName + FORMAT.extension, FORMAT.mimeType);
	});

	/* ---------- Import ---------- */

	importInput.accept = FORMAT.extension;
	importBtn.title = 'Load a tree from a ' + FORMAT.extension + ' file on your computer';

	function importDocument(fileName, text) {
		var doc;
		try {
			doc = FORMAT.parse(text);
		} catch (err) {
			alert('Could not import "' + fileName + '":\n' + err.message);
			return;
		}
		var problem = Parser.validateDocument(doc);
		if (problem) {
			alert('Could not import "' + fileName + '":\n' + problem);
			return;
		}
		if (!treeIsEmpty() && !confirm('Replace the current tree with "' + fileName + '"?')) return;

		Model.replaceTree(doc.tree);
		Model.applyProfileState(doc.profile);
		History.load(doc.history);
		refreshAll();
		if (doc.addedRoot) {
			setTimeout(function () {
				alert('"' + fileName + '" has no root node, so an empty ' + Model.TOP_LEVEL_KIND + ' root node' +
					' was added above its top-level nodes. The scenario space is unchanged.');
			}, 0);
		}
	}

	importBtn.addEventListener('click', function () { importInput.click(); });

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
		sampleSpecs: sampleSpecs,
		newDocument: newDocument
	};
})(NovaDM.Model, NovaDM.History, NovaDM.Render, NovaDM.EditorForm, NovaDM.Popovers, NovaDM.Parser);
