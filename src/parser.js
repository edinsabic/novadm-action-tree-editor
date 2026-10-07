window.NovaDM = window.NovaDM || {};

/**
 * NovaDM file format: the ONLY place that knows how a document looks on
 * disk. Format background and version history: ../spec/action-tree-grammar.md
 * To switch to a different file type, edit TREE_FILE_FORMAT below
 * (extension / mimeType / defaultName) and rewrite serialize()/parse();
 * nothing else needs to change.
 */
NovaDM.Parser = (function (Model) {
	'use strict';

	var DEFAULT_SNAPSHOT_ID = 'Initial version';

	function isBareRoot(spec) {
		return !!spec && typeof spec === 'object' && spec.kind === Model.TOP_LEVEL_KIND &&
			!spec.nodeClass && !spec.label && Model.parseValues(spec.value).length === 0;
	}

	/**
	 * Files written before version 5 list the top-level nodes directly and leave the AND root implicit.
	 * This wraps them in an explicit root. */
	function ensureRoot(specs) {
		if (!Array.isArray(specs) || specs.length === 0) return specs;
		if (specs.length === 1 && isBareRoot(specs[0])) return specs;
		return [{ kind: Model.TOP_LEVEL_KIND, nodeClass: '', label: '', value: [], children: specs }];
	}

	function withRootedTree(snapshot) {
		if (!snapshot || typeof snapshot !== 'object') return snapshot;
		var copy = {};
		Object.keys(snapshot).forEach(function (k) { copy[k] = snapshot[k]; });
		copy.tree = ensureRoot(snapshot.tree);
		return copy;
	}

	function emptyHistory() {
		return { head: DEFAULT_SNAPSHOT_ID, edges: [], snapshots: [] };
	}

	/* ---------- Writing ---------- */

	function isPrimitive(v) { return v === null || typeof v !== 'object'; }

	function formatJson(value, depth) {
		depth = depth || 0;
		if (isPrimitive(value)) return JSON.stringify(value);
		var pad = new Array(depth + 2).join('\t');
		var closePad = new Array(depth + 1).join('\t');
		var airy = depth === 0 || (depth === 1 && Array.isArray(value));

		if (Array.isArray(value)) {
			if (value.length === 0) return '[]';
			if (value.every(isPrimitive)) return '[' + value.map(function (v) { return JSON.stringify(v); }).join(', ') + ']';
			return '[\n' + value.map(function (v) { return pad + formatJson(v, depth + 1); }).join(airy ? ',\n\n' : ',\n') + '\n' + closePad + ']';
		}

		var keys = Object.keys(value);
		if (keys.length === 0) return '{}';
		if (keys.every(function (k) { return isPrimitive(value[k]); })) {
			var flat = '{ ' + keys.map(function (k) { return JSON.stringify(k) + ': ' + JSON.stringify(value[k]); }).join(', ') + ' }';
			if (flat.length <= 110) return flat;
		}
		var out = '{\n';
		keys.forEach(function (k, i) {
			if (i > 0) {
				var blank = airy && !(isPrimitive(value[keys[i - 1]]) && isPrimitive(value[k]));
				out += blank ? ',\n\n' : ',\n';
			}
			out += pad + JSON.stringify(k) + ': ' + formatJson(value[k], depth + 1);
		});
		return out + '\n' + closePad + '}';
	}

	/* ---------- Reading ---------- */

	function parseJson(text) {
		try {
			return JSON.parse(text.replace(/^\uFEFF/, '')); // tolerate a UTF-8 BOM
		} catch (err) {
			throw new Error('The file is not valid JSON (' + err.message + ').');
		}
	}

	function sectionParsers() {
		return {
			versionControl: function (section) {
				section = section || {};
				return {
					head: typeof section.head === 'string' ? section.head : null,
					edges: Array.isArray(section.edges) ? section.edges : []
				};
			},
			profile: function (section) {
				if (section === undefined || section === null) return null;
				return {
					active: section.active === undefined ? null : section.active,
					current: section.current === undefined ? {} : section.current,
					currentValues: section.currentValues === undefined ? {} : section.currentValues,
					saved: section.saved === undefined ? [] : section.saved
				};
			},
			actionTree: function (section) {
				if (!Array.isArray(section)) throw new Error('The "actionTree" section is missing or is not a list of snapshots.');
				return section;
			}
		};
	}

	var TREE_FILE_FORMAT = {
		id: 'novadm-action-tree',
		version: 5, /* 5: the tree is a single AND root node (older files get one added on import).
					** 4: profiles also hold per-value constraints (currentValues / valueConstraints).
					** 3: versionControl / profile / actionTree sections. 
					** 2: single `tree`, value is an array of strings. 
					** 1: text values. Older files still import. */
		extension: '.json',
		mimeType: 'application/json',
		defaultName: 'novadm-action-tree',

		/**
		 * @param {{tree: Array, profile: Object, history: Object}} doc
		 * @returns {string} the file's text
		 */
		serialize: function (doc) {
			var history = doc.history || emptyHistory();
			var head = history.head || DEFAULT_SNAPSHOT_ID;

			var snapshots = history.snapshots.map(function (s) { return s.id === head ? { id: head, tree: doc.tree } : s; });
			if (!snapshots.some(function (s) { return s.id === head; })) snapshots.unshift({ id: head, tree: doc.tree });

			return formatJson({
				format: TREE_FILE_FORMAT.id,
				version: TREE_FILE_FORMAT.version,
				versionControl: { head: head, edges: history.edges },
				profile: doc.profile || { active: null, current: {}, currentValues: {}, saved: [] },
				actionTree: snapshots
			}) + '\n';
		},

		/**
		 * @param {string} text the file's text
		 * @returns {{tree: Array, profile: Object|null, history: Object, addedRoot: boolean}}
		 * Throws an Error with a readable message if this is not a NovaDM file.
		 */
		parse: function (text) {
			var data = parseJson(text);

			// A bare array of nodes (like examples/sample-tree.js, as JSON) is accepted too.
			if (Array.isArray(data)) {
				var rooted = ensureRoot(data);
				return { tree: rooted, profile: null, history: emptyHistory(), addedRoot: rooted !== data };
			}

			if (!data || data.format !== TREE_FILE_FORMAT.id) {
				throw new Error('This does not look like a NovaDM action tree file.');
			}
			if (typeof data.version !== 'number' || data.version > TREE_FILE_FORMAT.version) {
				throw new Error('This file was saved by a newer version of the editor (file version ' + data.version + ').');
			}

			// Versions 1 and 2: one tree, no profiles, no history.
			if (data.version < 3) {
				var rootedTree = ensureRoot(data.tree);
				return { tree: rootedTree, profile: null, history: emptyHistory(), addedRoot: rootedTree !== data.tree };
			}

			var parsers = sectionParsers();
			var versionControl = parsers.versionControl(data.versionControl);
			var profile = parsers.profile(data.profile);
			var snapshots = parsers.actionTree(data.actionTree);
			var rawSnapshots = snapshots;
			if (data.version < 5) snapshots = snapshots.map(withRootedTree);
			if (snapshots.length === 0) throw new Error('The "actionTree" section holds no snapshots.');

			var head = versionControl.head === null ? snapshots[snapshots.length - 1].id : versionControl.head;
			var headSnapshot = snapshots.filter(function (s) { return s && s.id === head; })[0];
			if (!headSnapshot) throw new Error('The head snapshot ' + JSON.stringify(head) + ' is not in the "actionTree" section.');

			var rawHead = rawSnapshots.filter(function (s) { return s && s.id === head; })[0];
			return {
				tree: headSnapshot.tree,
				profile: profile,
				history: { head: head, edges: versionControl.edges, snapshots: snapshots },
				addedRoot: headSnapshot.tree !== rawHead.tree 
			};
		}
	};

	/* ---------- Validation ---------- */

	function validateDocument(doc) {
		var problem = validateSpecs(doc.tree);
		if (problem) return problem;
		problem = validateProfile(doc.profile);
		if (problem) return problem;
		return validateHistory(doc.history);
	}

	function validateProfile(profile) {
		if (profile === null) return null;
		if (typeof profile !== 'object') return 'The "profile" section is not an object.';
		if (profile.active !== null && typeof profile.active !== 'string') return 'Profile: "active" must be a profile name or null.';
		var problem = validateConstraints(profile.current, 'Profile > current');
		if (problem) return problem;
		problem = validateValueConstraints(profile.currentValues, 'Profile > currentValues');
		if (problem) return problem;
		if (!Array.isArray(profile.saved)) return 'Profile: "saved" is not a list.';
		var names = {};
		for (var i = 0; i < profile.saved.length; i++) {
			var p = profile.saved[i];
			var here = 'Profile > saved #' + (i + 1);
			if (!p || typeof p.name !== 'string' || !p.name.trim()) return here + ' has no name.';
			if (names[p.name]) return here + ': there are two profiles called ' + JSON.stringify(p.name) + '.';
			names[p.name] = true;
			problem = validateConstraints(p.constraints, here);
			if (problem) return problem;
			problem = validateValueConstraints(p.valueConstraints, here + ' > valueConstraints');
			if (problem) return problem;
		}
		return null;
	}

	/* Per-value constraints: { nodeId: { valueText: "always" | "never" } }. Optional, so files without it still import. */
	function validateValueConstraints(byNode, where) {
		if (byNode === undefined) return null;
		if (!byNode || typeof byNode !== 'object' || Array.isArray(byNode)) return where + ' is not a map of node id to {value: "always"/"never"}.';
		var ids = Object.keys(byNode);
		for (var i = 0; i < ids.length; i++) {
			var problem = validateConstraints(byNode[ids[i]], where + ' > node ' + JSON.stringify(ids[i]));
			if (problem) return problem;
		}
		return null;
	}

	function validateConstraints(constraints, where) {
		if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) return where + ' is not a map of node id to "always"/"never".';
		var ids = Object.keys(constraints);
		for (var i = 0; i < ids.length; i++) {
			if (constraints[ids[i]] !== 'always' && constraints[ids[i]] !== 'never') {
				return where + ': node ' + JSON.stringify(ids[i]) + ' has constraint ' + JSON.stringify(constraints[ids[i]]) + '; expected "always" or "never".';
			}
		}
		return null;
	}

	function validateHistory(history) {
		var known = {};
		for (var i = 0; i < history.snapshots.length; i++) {
			var s = history.snapshots[i];
			if (!s || typeof s.id !== 'string' || !s.id.trim()) return 'Snapshot #' + (i + 1) + ' has no id.';
			if (known[s.id]) return 'There are two snapshots called ' + JSON.stringify(s.id) + '.';
			known[s.id] = true;
			var problem = validateSpecs(s.tree);
			if (problem) return 'Snapshot ' + JSON.stringify(s.id) + ': ' + problem;
		}
		for (var j = 0; j < history.edges.length; j++) {
			var e = history.edges[j];
			var here = 'Version control > edge #' + (j + 1);
			if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') return here + ' needs a "from" and a "to" snapshot id.';
			if (e.comment !== undefined && typeof e.comment !== 'string') return here + ' has a comment that is not text.';
			if (history.snapshots.length > 0 && (!known[e.from] || !known[e.to])) {
				return here + ' (' + e.from + ' -> ' + e.to + ') points at a snapshot that is not in the "actionTree" section.';
			}
		}
		return null;
	}

	function validateSpecs(specs) {
		if (!Array.isArray(specs)) return 'The tree data is not a list of nodes.';
		if (specs.length > 1) {
			return 'The tree has ' + specs.length + ' top-level nodes, but it must have a single ' + Model.TOP_LEVEL_KIND + ' root node that holds the rest.';
		}
		return validateSiblingSpecs(specs, 'Root', 0, {});
	}
	
	function validateSiblingSpecs(list, where, depth, seenIds) {
		var seenKind = null;
		for (var i = 0; i < list.length; i++) {
			var spec = list[i];
			var here = where + ' > node #' + (i + 1);
			if (!spec || typeof spec !== 'object') return here + ' is not a node.';
			if (spec.id !== undefined) {
				if (typeof spec.id !== 'string' || !spec.id) return here + ' has an id that is not text.';
				if (seenIds[spec.id]) return here + ' has the id ' + JSON.stringify(spec.id) + ', which another node already uses.';
				seenIds[spec.id] = true;
			}
			if (Model.KINDS.indexOf(spec.kind) === -1) {
				return here + ' has an unknown kind (' + JSON.stringify(spec.kind) + '); expected ' + Model.KINDS.join(' or ') + '.';
			}
			if (depth <= 1 && spec.kind !== Model.TOP_LEVEL_KIND) {
				return here + ' is ' + spec.kind + ', but ' + (depth === 0 ? 'the root' : 'the root\'s children') + ' must be ' + Model.TOP_LEVEL_KIND + '.';
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
			var problem = validateSiblingSpecs(spec.children || [], here, depth + 1, seenIds);
			if (problem) return problem;
		}
		return null;
	}

	return {
		TREE_FILE_FORMAT: TREE_FILE_FORMAT,
		emptyHistory: emptyHistory,
		ensureRoot: ensureRoot,
		validateDocument: validateDocument,
		validateSpecs: validateSpecs
	};
})(NovaDM.Model);
