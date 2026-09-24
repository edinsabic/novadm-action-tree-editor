window.NovaDM = window.NovaDM || {};

/**
 * Getting a tree in and out of the live model: the example/clear buttons,
 * and file import/export (via parser.js's TREE_FILE_FORMAT).
 */
NovaDM.TreeIO = (function (Model, Render, EditorForm, Parser) {
	'use strict';

	function loadSampleTree() {
		if (typeof NOVADM_SAMPLE_TREE === 'undefined') {
			alert('sample-tree.js was not found or did not load – check that it sits next to index.html.');
			return;
		}
		Model.replaceTree(NOVADM_SAMPLE_TREE);
		Render.renderTree(); EditorForm.renderEditorForm();
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
			Render.renderTree(); EditorForm.renderEditorForm();
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
		var text = Parser.TREE_FILE_FORMAT.serialize(Model.root.children.map(Model.nodeToSpec));
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
			var specs;
			try {
				specs = Parser.TREE_FILE_FORMAT.parse(String(reader.result));
			} catch (err) {
				alert('Could not import "' + file.name + '":\n' + err.message);
				return;
			}
			var problem = Parser.validateSpecs(specs);
			if (problem) {
				alert('Could not import "' + file.name + '":\n' + problem);
				return;
			}
			if (Model.root.children.length === 0 || confirm('Replace the current tree with "' + file.name + '"?')) {
				Model.replaceTree(specs);
				Render.renderTree(); EditorForm.renderEditorForm();
			}
		};
		reader.readAsText(file);
	});

	return { loadSampleTree: loadSampleTree };
})(NovaDM.Model, NovaDM.Render, NovaDM.EditorForm, NovaDM.Parser);
