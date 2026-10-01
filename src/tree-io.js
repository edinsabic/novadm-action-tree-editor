window.NovaDM = window.NovaDM || {};

/**
 * Getting a document in and out of the live model: the example/clear buttons,
 * and file import/export (via parser.js's TREE_FILE_FORMAT). A document is
 * the tree, the profiles and the version history (see parser.js).
 */
NovaDM.TreeIO = (function (Model, Render, EditorForm, Popovers, Parser) {
	'use strict';

	/**
	 * Version history is not editable yet, so whatever an imported file
	 * carried is held here and written back on export, with the live tree
	 * standing in for the head snapshot.
	 */
	var history = Parser.emptyHistory();

	function refreshAll() {
		Render.renderTree(); EditorForm.renderEditorForm();
		Popovers.updatePillLabels(); Popovers.renderFlyout();
	}

	function loadSampleTree() {
		if (typeof NOVADM_SAMPLE_TREE === 'undefined') {
			alert('sample-tree.js was not found or did not load – check that it sits next to index.html.');
			return;
		}
		Model.replaceTree(NOVADM_SAMPLE_TREE);
		Model.resetProfiles();
		history = Parser.emptyHistory();
		refreshAll();
	}

	document.getElementById('load-example-btn').addEventListener('click', function () {
		if (Model.root.children.length === 0 || confirm('Replace the current tree with the example tree?')) {
			loadSampleTree();
		}
	});
	document.getElementById('clear-tree-btn').addEventListener('click', function () {
		if (Model.root.children.length === 0 || confirm('Clear the whole tree?')) {
			Model.root.children = [];
			Model.setSelectedId(null);
			Model.resetProfiles();
			history = Parser.emptyHistory();
			refreshAll();
		}
	});

	/* ---------- Export / Import buttons ---------- */
	var exportBtn = document.getElementById('export-tree-btn');
	var importBtn = document.getElementById('import-tree-btn');
	var importInput = document.getElementById('import-file-input');
	importInput.accept = Parser.TREE_FILE_FORMAT.extension;
	exportBtn.title = 'Save the current tree as a ' + Parser.TREE_FILE_FORMAT.extension + ' file';
	importBtn.title = 'Load a tree from a ' + Parser.TREE_FILE_FORMAT.extension + ' file on your computer';

	exportBtn.addEventListener('click', function () {
		var text = Parser.TREE_FILE_FORMAT.serialize({
			tree: Model.root.children.map(Model.nodeToSpec),
			profile: Model.getProfileState(),
			history: history
		});
		var blob = new Blob([text], { type: Parser.TREE_FILE_FORMAT.mimeType });
		var url = URL.createObjectURL(blob);
		var link = document.createElement('a');
		link.href = url;
		link.download = Parser.TREE_FILE_FORMAT.defaultName + Parser.TREE_FILE_FORMAT.extension;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
	});

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
			importInput.value = ''; // so picking the same file again still fires "change"
			var doc;
			try {
				doc = Parser.TREE_FILE_FORMAT.parse(String(reader.result));
			} catch (err) {
				alert('Could not import "' + file.name + '":\n' + err.message);
				return;
			}
			var problem = Parser.validateDocument(doc);
			if (problem) {
				alert('Could not import "' + file.name + '":\n' + problem);
				return;
			}
			if (Model.root.children.length === 0 || confirm('Replace the current tree with "' + file.name + '"?')) {
				Model.replaceTree(doc.tree);
				Model.applyProfileState(doc.profile);
				history = doc.history;
				refreshAll();
			}
		};
		reader.readAsText(file);
	});

	return { loadSampleTree: loadSampleTree };
})(NovaDM.Model, NovaDM.Render, NovaDM.EditorForm, NovaDM.Popovers, NovaDM.Parser);
