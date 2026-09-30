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
		version: 3, /* 3: multi-version project { profiles, activeProfile, activeVersion, versions[] }; versions before 3 are no longer accepted */
		extension: '.json',
		mimeType: 'application/json',
		defaultName: 'novadm-action-tree',

		/**
		 * `project` is { profiles, activeProfile, activeVersion, versions } –
		 * see tree-io.js for how it's assembled from the live model.
		 */
		serialize: function (project) {
			return JSON.stringify({
				format: TREE_FILE_FORMAT.id,
				version: TREE_FILE_FORMAT.version,
				profiles: project.profiles,
				activeProfile: project.activeProfile,
				activeVersion: project.activeVersion,
				versions: project.versions
			}, null, '\t');
		},

		parse: function (text) {
			var data;
			try {
				data = JSON.parse(text.replace(/^\uFEFF/, '')); // tolerate a UTF-8 BOM
			} catch (err) {
				throw new Error('The file is not valid JSON (' + err.message + ').');
			}
			if (!data || typeof data !== 'object' || Array.isArray(data) || data.format !== TREE_FILE_FORMAT.id) {
				throw new Error('This does not look like a NovaDM action tree file.');
			}
			if (typeof data.version !== 'number' || data.version > TREE_FILE_FORMAT.version) {
				throw new Error('This file was saved by a newer version of the editor (file version ' + data.version + ').');
			}
			if (data.version < 3) {
				throw new Error('This file is in the old (pre-versioning) format and cannot be opened by this build.');
			}
			if (!Array.isArray(data.versions) || data.versions.length === 0) {
				throw new Error('The file has no versions.');
			}
			var problem = validateProject(data);
			if (problem) throw new Error(problem);
			return {
				profiles: data.profiles,
				activeProfile: data.activeProfile,
				activeVersion: data.activeVersion,
				versions: data.versions
			};
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

	function validateProject(data) {
		if (!Array.isArray(data.profiles) || data.profiles.length === 0) {
			return 'The file has no profiles.';
		}
		for (var p = 0; p < data.profiles.length; p++) {
			var prof = data.profiles[p];
			if (!prof || typeof prof.name !== 'string' || !prof.name.trim()) {
				return 'Profile #' + (p + 1) + ' has no name.';
			}
		}
		if (data.activeProfile !== undefined && !data.profiles.some(function (x) { return x.name === data.activeProfile; })) {
			return 'The active profile "' + data.activeProfile + '" is not in the profile list.';
		}

		var seen = {};
		for (var i = 0; i < data.versions.length; i++) {
			var v = data.versions[i];
			var where = 'Version #' + (i + 1);
			if (!v || typeof v !== 'object') return where + ' is not a version.';
			if (typeof v.id !== 'string' || !v.id.trim()) return where + ' has no id.';
			if (seen[v.id]) return 'Duplicate version id "' + v.id + '".';
			seen[v.id] = true;
			if (!Array.isArray(v.parents)) return where + ' ("' + v.id + '") has no parents list.';
			if (v.comments !== undefined && (typeof v.comments !== 'object' || v.comments === null || Array.isArray(v.comments))) {
				return where + ' ("' + v.id + '") has a malformed comments map.';
			}
			var treeProblem = validateSpecs(v.tree || []);
			if (treeProblem) return where + ' ("' + v.id + '"): ' + treeProblem;
		}
		/**
		 * Second pass to check that all parents (and the active version) exist.
		 */
		for (var j = 0; j < data.versions.length; j++) {
			var vv = data.versions[j];
			for (var k = 0; k < vv.parents.length; k++) {
				if (!seen[vv.parents[k]]) {
					return 'Version "' + vv.id + '" lists a parent "' + vv.parents[k] + '" that does not exist.';
				}
			}
		}
		if (data.activeVersion !== undefined && !seen[data.activeVersion]) {
			return 'The active version "' + data.activeVersion + '" is not in the version list.';
		}
		return null;
	}

	return {
		TREE_FILE_FORMAT: TREE_FILE_FORMAT,
		validateSpecs: validateSpecs,
		validateProject: validateProject
	};
})(NovaDM.Model);
