window.NovaDM = window.NovaDM || {};

/**
 * NovaDM tree file format: the ONLY place that knows how a tree looks on
 * disk. Format background and version history: ../spec/action-tree-grammar.md
 * To switch to a different file type, edit TREE_FILE_FORMAT below
 * (extension / mimeType / defaultName) and rewrite serialize()/parse();
 * nothing else needs to change.
 */
NovaDM.Parser = (function (Model) {
	'use strict';

	var TREE_FILE_FORMAT = {
		id: 'novadm-action-tree',
		version: 2, /* 2 – array of strings; files with '1' and text values still import */
		extension: '.json',
		mimeType: 'application/json',
		defaultName: 'novadm-action-tree',

		serialize: function (specs) {
			return JSON.stringify({
				format: TREE_FILE_FORMAT.id,
				version: TREE_FILE_FORMAT.version,
				tree: specs
			}, null, '\t');
		},

		parse: function (text) {
			var data;
			try {
				data = JSON.parse(text.replace(/^\uFEFF/, '')); // tolerate a UTF-8 BOM
			} catch (err) {
				throw new Error('The file is not valid JSON (' + err.message + ').');
			}
			// A bare array of nodes (like examples/sample-tree.js, as JSON) is accepted too.
			if (Array.isArray(data)) return data;
			if (!data || data.format !== TREE_FILE_FORMAT.id) {
				throw new Error('This does not look like a NovaDM action tree file.');
			}
			if (typeof data.version !== 'number' || data.version > TREE_FILE_FORMAT.version) {
				throw new Error('This file was saved by a newer version of the editor (file version ' + data.version + ').');
			}
			return data.tree;
		}
	};

	/**
	 * Checks specs against the structural rules before they touch the live
	 * tree. Returns a readable problem description, or null if everything is fine.
	 */
	function validateSpecs(specs) {
		if (!Array.isArray(specs)) return 'The tree data is not a list of nodes.';
		return validateSiblingSpecs(specs, 'Top level', true);
	}
	function validateSiblingSpecs(list, where, isTopLevel) {
		var seenKind = null;
		for (var i = 0; i < list.length; i++) {
			var spec = list[i];
			var here = where + ' > node #' + (i + 1);
			if (!spec || typeof spec !== 'object') return here + ' is not a node.';
			if (Model.KINDS.indexOf(spec.kind) === -1) {
				return here + ' has an unknown kind (' + JSON.stringify(spec.kind) + '); expected ' + Model.KINDS.join(' or ') + '.';
			}
			if (isTopLevel && spec.kind !== Model.TOP_LEVEL_KIND) {
				return here + ' is ' + spec.kind + ', but top-level nodes must be ' + Model.TOP_LEVEL_KIND + ' (the project root is an implicit ' + Model.TOP_LEVEL_KIND + ').';
			}
			if (seenKind !== null && spec.kind !== seenKind) {
				return here + ' is ' + spec.kind + ', but its siblings are ' + seenKind + ' (all siblings must share the same kind).';
			}
			seenKind = spec.kind;
			if (spec.nodeClass !== undefined && Model.NODE_CLASSES.indexOf(spec.nodeClass) === -1) {
				return here + ' has an unknown class (' + JSON.stringify(spec.nodeClass) + '); expected one of: ' + Model.NODE_CLASSES.filter(Boolean).join(', ') + ' or empty.';
			}
			if (spec.label !== undefined && typeof spec.label !== 'string') {
				return here + ' has a label that is not text.';
			}
			if (spec.value !== undefined && typeof spec.value !== 'string' &&
				!(Array.isArray(spec.value) && spec.value.every(function (v) { return typeof v === 'string'; }))) {
				return here + ' has a value that is neither text nor a list of text.';
			}
			if (spec.children !== undefined && !Array.isArray(spec.children)) {
				return here + ' has children that are not a list.';
			}
			var problem = validateSiblingSpecs(spec.children || [], here, false);
			if (problem) return problem;
		}
		return null;
	}

	return {
		TREE_FILE_FORMAT: TREE_FILE_FORMAT,
		validateSpecs: validateSpecs
	};
})(NovaDM.Model);
