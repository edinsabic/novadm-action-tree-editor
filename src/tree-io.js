window.NovaDM = window.NovaDM || {};

/**
 * Getting a document in and out of the live model: the example/clear buttons,
 * and file import/export (via parser.js's TREE_FILE_FORMAT). A document is
 * the tree, the profiles and the version history (see parser.js and
 * history.js), plus the Calculations tab's data, which files don't hold yet.
 */
NovaDM.TreeIO = (function (Model, History, Render, EditorForm, Popovers, CalculationsTab, Parser) {
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

	function newDocument(specs, calculations) {
		Model.replaceTree(specs);
		Model.resetProfiles();
		History.reset();
		CalculationsTab.reset(calculations);
		refreshAll();
	}

	function loadExample() {
		var specs = sampleSpecs();
		if (!specs) {
			alert('sample-tree.js was not found or did not load – check that it sits next to index.html.');
			return;
		}
		newDocument(specs, CalculationsTab.exampleData());
	}

	/* ---------- Example and clear buttons ---------- */

	document.getElementById('load-example-btn').addEventListener('click', function () {
		if (!treeIsEmpty() && !confirm('Replace the current tree, and the numbers and calculated values in the' +
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
		if (!treeIsEmpty() && !confirm('Clear the whole tree?\n\nThe Calculations tab starts over too, with no' +
			' numbers, only Total cost and CO₂.')) {
			return;
		}
		newDocument([], null);
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
		if (History.isDirty() && !History.canUpdateHead()) {
			alert('"' + History.getHead() + '" has unsaved changes, but other versions are based on it, so it' +
				' cannot store them. Save them as a new version first (Version history → Save as new version…).');
			return;
		}
		var hasOtherVersions = History.snapshotCount() > 1;
		if (History.isDirty() && hasOtherVersions && !confirm('"' + History.getHead() + '" has unsaved changes.' +
			' The file will store them as that version (the other versions are kept as they are).' +
			'\n\nExport anyway?')) {
			return;
		}
		var tree = Model.treeSpecs();
		var history = History.getState();
		var fileTrees = history.snapshots.map(function (s) { return s.id === history.head ? tree : s.tree; });
		var text = FORMAT.serialize({
			tree: tree,
			profile: Model.getProfileState(fileTrees),
			history: history
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
		if (!treeIsEmpty() && !confirm('Replace the current tree with "' + fileName + '"?\n\nThe Calculations tab' +
			' starts over too, with no numbers, only Total cost and CO₂, because files don\'t hold its data yet.')) {
			return;
		}

		Model.replaceTree(doc.tree);
		Model.applyProfileState(doc.profile, doc.history.snapshots.map(function (s) { return s.tree; }));
		History.load(doc.history);
		CalculationsTab.reset(null);
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
})(NovaDM.Model, NovaDM.History, NovaDM.Render, NovaDM.EditorForm, NovaDM.Popovers, NovaDM.CalculationsTab,
	NovaDM.Parser);
