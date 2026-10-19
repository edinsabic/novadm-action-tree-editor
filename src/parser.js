window.NovaDM = window.NovaDM || {};

/**
 * NovaDM file format: the ONLY place that knows how a document looks on
 * disk. Format background and version history: ../spec/action-tree-grammar.md
 * To switch to a different file type, edit TREE_FILE_FORMAT below
 * (extension / mimeType / defaultName) and rewrite serialize() / parse();
 * nothing else needs to change.
 */
NovaDM.Parser = (function (Model, Calculations, Util) {
	'use strict';

	var DEFAULT_SNAPSHOT_ID = 'Initial version';
	var MAX_FLAT_OBJECT_WIDTH = 110;
	var MAX_SHOWN_CHARS = 40;
	var NAME_RULE = 'use letters, digits and _, start with a letter or _, and avoid if, then, else, total and selected';

	/* ---------- Root node and empty history ---------- */

	function isBareRoot(spec) {
		return !!spec && typeof spec === 'object' && spec.kind === Model.TOP_LEVEL_KIND &&
			!spec.nodeClass && !spec.label && Model.parseValues(spec.value).length === 0;
	}

	function ensureRoot(specs) {
		if (!Array.isArray(specs) || specs.length === 0) return specs;
		if (specs.length === 1 && isBareRoot(specs[0])) return specs;
		return [{ kind: Model.TOP_LEVEL_KIND, nodeClass: '', label: '', value: [], children: specs }];
	}

	function emptyHistory() {
		return { head: DEFAULT_SNAPSHOT_ID, edges: [], snapshots: [] };
	}

	/* ---------- Missing node ids ---------- */

	function eachSpec(list, visit) {
		if (!Array.isArray(list)) return;
		list.forEach(function (spec) {
			if (!spec || typeof spec !== 'object') return;
			visit(spec);
			eachSpec(spec.children, visit);
		});
	}

	function constraintIds(profile) {
		if (!profile || typeof profile !== 'object') return [];
		var maps = [profile.current, profile.currentValues];
		(Array.isArray(profile.saved) ? profile.saved : []).forEach(function (p) {
			if (p) maps.push(p.constraints, p.valueConstraints);
		});
		return maps.reduce(function (ids, map) {
			return map && typeof map === 'object' ? ids.concat(Object.keys(map)) : ids;
		}, []);
	}

	function fillMissingIds(trees, profiles) {
		var taken = {};
		var next = 1;
		var rootId = null;

		function freshId() {
			while (taken['n' + next]) next++;
			taken['n' + next] = true;
			return 'n' + next;
		}

		trees.forEach(function (tree) {
			eachSpec(tree, function (spec) { if (typeof spec.id === 'string') taken[spec.id] = true; });
		});
		profiles.forEach(function (profile) {
			constraintIds(profile).forEach(function (id) { taken[id] = true; });
		});
		trees.forEach(function (tree) {
			eachSpec(tree, function (spec) {
				if (spec.id !== undefined) return;
				if (spec === tree[0]) {
					rootId = rootId || freshId();
					spec.id = rootId;
				} else {
					spec.id = freshId();
				}
			});
		});
	}

	/* ---------- Calculations data ---------- */

	function isPlainObject(value) {
		return !!value && typeof value === 'object' && !Array.isArray(value);
	}

	function attributesInValues(values) {
		var names = [];
		if (!isPlainObject(values)) return names;
		Object.keys(values).forEach(function (label) {
			if (!isPlainObject(values[label])) return;
			Object.keys(values[label]).forEach(function (a) { if (names.indexOf(a) === -1) names.push(a); });
		});
		return names;
	}

	function readCalculations(raw) {
		if (raw === undefined || raw === null) return Calculations.starterData();
		if (!isPlainObject(raw)) return raw;
		return {
			attributes: raw.attributes === undefined ? attributesInValues(raw.values) : raw.attributes,
			units: raw.units === undefined ? {} : raw.units,
			values: raw.values === undefined ? {} : raw.values,
			derived: raw.derived === undefined ? [] : raw.derived
		};
	}

	function fileValues(values) {
		var out = {};
		Object.keys(values || {}).forEach(function (label) {
			var byAttribute = {};
			var stored = values[label] || {};
			Object.keys(stored).forEach(function (a) {
				if (typeof stored[a] === 'number') {
					Util.setOwn(byAttribute, a, stored[a]);
					return;
				}
				var options = {};
				Object.keys(stored[a] || {}).forEach(function (o) {
					if (typeof stored[a][o] === 'number') Util.setOwn(options, o, stored[a][o]);
				});
				if (Object.keys(options).length) Util.setOwn(byAttribute, a, options);
			});
			if (Object.keys(byAttribute).length) Util.setOwn(out, label, byAttribute);
		});
		return out;
	}

	function fileCalculations(data) {
		data = data || Calculations.starterData();
		var units = {};
		Object.keys(data.units || {}).forEach(function (a) {
			if (data.units[a]) Util.setOwn(units, a, data.units[a]);
		});
		return {
			attributes: (data.attributes || []).slice(),
			units: units,
			values: fileValues(data.values),
			derived: (data.derived || []).map(function (d) {
				var copy = { name: d.name };
				if (d.displayName) copy.displayName = d.displayName;
				copy.formula = d.formula;
				if (d.unit) copy.unit = d.unit;
				if (d.kpi) copy.kpi = true;
				return copy;
			})
		};
	}

	/* ---------- Writing ---------- */

	function isPrimitive(v) { return v === null || typeof v !== 'object'; }

	function formatJson(value, depth) {
		depth = depth || 0;
		if (isPrimitive(value)) return JSON.stringify(value);
		var pad = '\t'.repeat(depth + 1);
		var closePad = '\t'.repeat(depth);
		var airy = depth === 0 || (depth === 1 && Array.isArray(value));

		if (Array.isArray(value)) {
			if (value.length === 0) return '[]';
			if (value.every(isPrimitive)) {
				return '[' + value.map(function (v) { return JSON.stringify(v); }).join(', ') + ']';
			}
			var items = value.map(function (v) { return pad + formatJson(v, depth + 1); });
			return '[\n' + items.join(airy ? ',\n\n' : ',\n') + '\n' + closePad + ']';
		}

		var keys = Object.keys(value);
		if (keys.length === 0) return '{}';
		if (keys.every(function (k) { return isPrimitive(value[k]); })) {
			var pairs = keys.map(function (k) { return JSON.stringify(k) + ': ' + JSON.stringify(value[k]); });
			var flat = '{ ' + pairs.join(', ') + ' }';
			if (flat.length <= MAX_FLAT_OBJECT_WIDTH) return flat;
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
			return JSON.parse(text.replace(/^﻿/, ''));
		} catch (err) {
			throw new Error('The file is not valid JSON (' + err.message + ').');
		}
	}

	var SECTION_PARSERS = {
		versionControl: function (section) {
			section = section || {};
			return {
				head: typeof section.head === 'string' ? section.head : null,
				edges: Array.isArray(section.edges) ? section.edges : []
			};
		},
		profile: function (section) {
			if (section === undefined || section === null) return null;
			if (typeof section !== 'object' || Array.isArray(section)) return section;
			return {
				active: section.active === undefined ? null : section.active,
				current: section.current === undefined ? {} : section.current,
				currentValues: section.currentValues === undefined ? {} : section.currentValues,
				saved: section.saved === undefined ? [] : section.saved
			};
		},
		actionTree: function (section) {
			if (!Array.isArray(section)) {
				throw new Error('The "actionTree" section is missing or is not a list of snapshots.');
			}
			return section;
		}
	};

	function findSnapshot(snapshots, id) {
		return snapshots.filter(function (s) { return s && s.id === id; })[0];
	}

	function singleTreeDocument(tree) {
		var rooted = ensureRoot(tree);
		fillMissingIds([rooted], []);
		return { tree: rooted, history: emptyHistory(), source: '', addedRoot: rooted !== tree };
	}

	function readSnapshot(raw, fileVersion, sharedProfile) {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
		return {
			id: raw.id,
			created: raw.created,
			tree: fileVersion < 5 ? ensureRoot(raw.tree) : raw.tree,
			profile: fileVersion < 6 ? Util.clone(sharedProfile) : SECTION_PARSERS.profile(raw.profile),
			calculations: fileVersion < 6 ? Calculations.starterData() : readCalculations(raw.calculations)
		};
	}

	function readSnapshots(data) {
		var sharedProfile = null;
		if (data.version < 6) {
			sharedProfile = SECTION_PARSERS.profile(data.profile);
			var problem = validateProfile(sharedProfile, 'Profile');
			if (problem) throw new Error(problem);
		}
		return SECTION_PARSERS.actionTree(data.actionTree).map(function (raw) {
			return readSnapshot(raw, data.version, sharedProfile);
		});
	}

	var TREE_FILE_FORMAT = {
		id: 'novadm-action-tree',
		version: 6, /* 6: each snapshot holds its own profiles and the Calculations data; no global `profile`.
					** 5: the tree is a single AND root node (older files get one added on import).
					** 4: profiles also hold per-value constraints (currentValues / valueConstraints).
					** 3: versionControl / profile / actionTree sections. 
					** 2: single `tree`, value is an array of strings. 
					** 1: text values. Older files still import. */
		extension: '.json',
		mimeType: 'application/json',
		defaultName: 'novadm-action-tree',

		/**
		 * @param {{tree: Array, profile: Object, calculations: Object, history: Object, source: string}} doc
		 * @returns {string} the file's text
		 */
		serialize: function (doc) {
			var history = doc.history || emptyHistory();
			var head = history.head || DEFAULT_SNAPSHOT_ID;

			function fileSnapshot(s) {
				var isHead = s.id === head;
				var snap = { id: s.id };
				if (s.created) snap.created = s.created;
				snap.profile = (isHead ? doc.profile : s.profile) || Model.emptyProfileState();
				snap.tree = isHead ? doc.tree : s.tree;
				snap.calculations = fileCalculations(isHead ? doc.calculations : s.calculations);
				return snap;
			}

			var snapshots = history.snapshots.map(fileSnapshot);
			if (!snapshots.some(function (s) { return s.id === head; })) snapshots.unshift(fileSnapshot({ id: head }));

			var file = { format: TREE_FILE_FORMAT.id, version: TREE_FILE_FORMAT.version };
			file.source = doc.source || '';
			file.versionControl = { head: head, edges: history.edges };
			file.actionTree = snapshots;
			return formatJson(file) + '\n';
		},

		/**
		 * @param {string} text the file's text
		 * @returns {{tree: Array, history: Object, source: string, addedRoot: boolean}}
		 * Throws an Error with a readable message if this is not a NovaDM file.
		 */
		parse: function (text) {
			var data = parseJson(text);

			if (Array.isArray(data)) return singleTreeDocument(data);

			if (!data || data.format !== TREE_FILE_FORMAT.id) {
				throw new Error('This does not look like a NovaDM action tree file.');
			}
			if (typeof data.version !== 'number' || data.version > TREE_FILE_FORMAT.version) {
				throw new Error('This file was saved by a newer version of the editor (file version ' +
					data.version + ').');
			}

			if (data.version < 3) return singleTreeDocument(data.tree);

			var versionControl = SECTION_PARSERS.versionControl(data.versionControl);
			var snapshots = readSnapshots(data);
			if (snapshots.length === 0) throw new Error('The "actionTree" section holds no snapshots.');
			fillMissingIds(snapshots.map(function (s) { return s && s.tree; }),
				snapshots.map(function (s) { return s && s.profile; }));

			var head = versionControl.head === null ? snapshots[snapshots.length - 1].id : versionControl.head;
			var headSnapshot = findSnapshot(snapshots, head);
			if (!headSnapshot) {
				throw new Error('The head snapshot ' + JSON.stringify(head) +
					' is not in the "actionTree" section.');
			}

			return {
				tree: headSnapshot.tree,
				history: { head: head, edges: versionControl.edges, snapshots: snapshots },
				source: typeof data.source === 'string' ? data.source : '',
				addedRoot: headSnapshot.tree !== findSnapshot(data.actionTree, head).tree
			};
		}
	};

	/* ---------- Validation ---------- */

	function validateDocument(doc) {
		return validateSpecs(doc.tree) || validateHistory(doc.history);
	}

	function validateProfile(profile, where) {
		if (profile === null) return null;
		if (typeof profile !== 'object' || Array.isArray(profile)) return where + ' is not an object.';
		if (profile.active !== null && typeof profile.active !== 'string') {
			return where + ': "active" must be a profile name or null.';
		}
		var problem = validateConstraints(profile.current, where + ' > current') ||
			validateValueConstraints(profile.currentValues, where + ' > currentValues');
		if (problem) return problem;
		if (!Array.isArray(profile.saved)) return where + ': "saved" is not a list.';

		var names = Object.create(null);
		for (var i = 0; i < profile.saved.length; i++) {
			var p = profile.saved[i];
			var here = where + ' > saved #' + (i + 1);
			if (!p || typeof p.name !== 'string' || !p.name.trim()) return here + ' has no name.';
			if (names[p.name]) return here + ': there are two profiles called ' + JSON.stringify(p.name) + '.';
			names[p.name] = true;
			problem = validateConstraints(p.constraints, here) ||
				validateValueConstraints(p.valueConstraints, here + ' > valueConstraints');
			if (problem) return problem;
		}
		return null;
	}

	function validateConstraints(constraints, where) {
		if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) {
			return where + ' is not a map of node id to "always"/"never".';
		}
		var ids = Object.keys(constraints);
		for (var i = 0; i < ids.length; i++) {
			var c = constraints[ids[i]];
			if (c !== 'always' && c !== 'never') {
				return where + ': node ' + JSON.stringify(ids[i]) + ' has constraint ' + JSON.stringify(c) +
					'; expected "always" or "never".';
			}
		}
		return null;
	}

	function validateValueConstraints(byNode, where) {
		if (byNode === undefined) return null;
		if (!byNode || typeof byNode !== 'object' || Array.isArray(byNode)) {
			return where + ' is not a map of node id to {value: "always"/"never"}.';
		}
		var ids = Object.keys(byNode);
		for (var i = 0; i < ids.length; i++) {
			var problem = validateConstraints(byNode[ids[i]], where + ' > node ' + JSON.stringify(ids[i]));
			if (problem) return problem;
		}
		return null;
	}

	function shown(value) { return Util.shorten(JSON.stringify(value) || String(value), MAX_SHOWN_CHARS); }

	function nameProblem(name, here) {
		if (typeof name === 'string' && Calculations.isName(name)) return null;
		return here + ' ' + shown(name) + ' cannot be used in formulas (' + NAME_RULE + ').';
	}

	function numberProblem(value, here) {
		return typeof value === 'number' && isFinite(value) ? null : here + ': ' + shown(value) + ' is not a number.';
	}

	function unitProblem(value, here) {
		if (typeof value !== 'string') return here + ': ' + shown(value) + ' is not text.';
		if (value.length > Calculations.MAX_UNIT_LENGTH) {
			return here + ' is longer than ' + Calculations.MAX_UNIT_LENGTH + ' characters.';
		}
		return null;
	}

	function validateAttributes(list, where) {
		if (!Array.isArray(list)) return where + ' is not a list of names.';
		var seen = Object.create(null);
		for (var i = 0; i < list.length; i++) {
			var problem = nameProblem(list[i], where + ': the attribute');
			if (problem) return problem;
			if (seen[list[i]]) return where + ': ' + shown(list[i]) + ' is listed twice.';
			seen[list[i]] = true;
		}
		return null;
	}

	function validateUnits(units, where) {
		if (!isPlainObject(units)) return where + ' is not a map of attribute to unit.';
		var names = Object.keys(units);
		for (var i = 0; i < names.length; i++) {
			var problem = unitProblem(units[names[i]], where + ' > ' + names[i]);
			if (problem) return problem;
		}
		return null;
	}

	function validateValues(values, where) {
		if (!isPlainObject(values)) return where + ' is not a map of label to numbers.';
		var labels = Object.keys(values);
		for (var i = 0; i < labels.length; i++) {
			var byAttribute = values[labels[i]];
			var here = where + ' > ' + labels[i];
			if (!isPlainObject(byAttribute)) return here + ' is not a map of attribute to numbers.';
			var attributes = Object.keys(byAttribute);
			for (var j = 0; j < attributes.length; j++) {
				var stored = byAttribute[attributes[j]];
				var at = here + ' > ' + attributes[j];
				var problem = nameProblem(attributes[j], here + ': the attribute');
				if (!problem && isPlainObject(stored)) {
					var options = Object.keys(stored);
					for (var k = 0; k < options.length && !problem; k++) {
						problem = numberProblem(stored[options[k]], at + ' > ' + options[k]);
					}
				} else if (!problem) {
					problem = numberProblem(stored, at);
				}
				if (problem) return problem;
			}
		}
		return null;
	}

	function validateDerived(list, where) {
		if (!Array.isArray(list)) return where + ' is not a list of calculated values.';
		var seen = Object.create(null);
		for (var i = 0; i < list.length; i++) {
			var d = list[i];
			if (!isPlainObject(d)) return where + ' #' + (i + 1) + ' is not an object.';
			var problem = nameProblem(d.name, where + ' #' + (i + 1) + ': the name');
			if (problem) return problem;
			var here = where + ' > ' + d.name;
			if (seen[d.name]) return where + ': there are two calculated values called ' + shown(d.name) + '.';
			seen[d.name] = true;
			if (typeof d.formula !== 'string') return here + ' has no formula (text).';
			if (d.displayName !== undefined && typeof d.displayName !== 'string') {
				return here + ' > displayName: ' + shown(d.displayName) + ' is not text.';
			}
			problem = d.unit === undefined ? null : unitProblem(d.unit, here + ' > unit');
			if (problem) return problem;
			if (d.kpi !== undefined && typeof d.kpi !== 'boolean') return here + ' > kpi must be true or false.';
		}
		return null;
	}

	function validateCalculations(data, where) {
		if (!isPlainObject(data)) return where + ' is not an object.';
		return validateAttributes(data.attributes, where + ' > attributes') ||
			validateUnits(data.units, where + ' > units') ||
			validateValues(data.values, where + ' > values') ||
			validateDerived(data.derived, where + ' > derived');
	}

	function validateHistory(history) {
		var known = {};
		for (var i = 0; i < history.snapshots.length; i++) {
			var s = history.snapshots[i];
			if (!s || typeof s.id !== 'string' || !s.id.trim()) return 'Snapshot #' + (i + 1) + ' has no id.';
			var name = 'Snapshot ' + JSON.stringify(s.id);
			if (known[s.id]) return 'There are two snapshots called ' + JSON.stringify(s.id) + '.';
			known[s.id] = true;
			if (s.created !== undefined && typeof s.created !== 'string') {
				return name + ' has a "created" date that is not text.';
			}
			var problem = validateSpecs(s.tree);
			if (problem) return name + ': ' + problem;
			problem = validateProfile(s.profile, name + ' > profile') ||
				validateCalculations(s.calculations, name + ' > calculations');
			if (problem) return problem;
		}
		for (var j = 0; j < history.edges.length; j++) {
			var e = history.edges[j];
			var here = 'Version control > edge #' + (j + 1);
			if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') {
				return here + ' needs a "from" and a "to" snapshot id.';
			}
			if (e.comment !== undefined && typeof e.comment !== 'string') {
				return here + ' has a comment that is not text.';
			}
			if (history.snapshots.length > 0 && (!known[e.from] || !known[e.to])) {
				return here + ' (' + e.from + ' -> ' + e.to +
					') points at a snapshot that is not in the "actionTree" section.';
			}
			if (e.from === e.to) return here + ' (' + e.from + ' -> ' + e.to + ') points from a snapshot to itself.';
		}
		if (hasCycle(history.edges)) {
			return 'Version control: the edges go round in a circle, so a snapshot would be based on itself.';
		}
		return null;
	}

	function hasCycle(edges) {
		var incoming = {};
		var outgoing = {};
		edges.forEach(function (e) {
			incoming[e.from] = incoming[e.from] || 0;
			incoming[e.to] = (incoming[e.to] || 0) + 1;
			(outgoing[e.from] = outgoing[e.from] || []).push(e.to);
		});
		var ready = Object.keys(incoming).filter(function (id) { return incoming[id] === 0; });
		var visited = 0;
		while (ready.length) {
			var id = ready.pop();
			visited++;
			(outgoing[id] || []).forEach(function (to) {
				incoming[to]--;
				if (incoming[to] === 0) ready.push(to);
			});
		}
		return visited < Object.keys(incoming).length;
	}

	function validateSpecs(specs) {
		if (!Array.isArray(specs)) return 'The tree data is not a list of nodes.';
		if (specs.length > 1) {
			return 'The tree has ' + specs.length + ' top-level nodes, but it must have a single' +
				' root node that holds the rest.';
		}
		return validateSiblingSpecs(specs, 'Root', {});
	}

	function validateSiblingSpecs(list, where, seenIds) {
		var seenKind = null;
		for (var i = 0; i < list.length; i++) {
			var spec = list[i];
			var here = where + ' > node #' + (i + 1);
			if (!spec || typeof spec !== 'object') return here + ' is not a node.';
			if (spec.id !== undefined) {
				if (typeof spec.id !== 'string' || !spec.id) return here + ' has an id that is not text.';
				if (seenIds[spec.id]) {
					return here + ' has the id ' + JSON.stringify(spec.id) + ', which another node already uses.';
				}
				seenIds[spec.id] = true;
			}
			if (Model.KINDS.indexOf(spec.kind) === -1) {
				return here + ' has an unknown kind (' + JSON.stringify(spec.kind) + '); expected ' +
					Model.KINDS.join(' or ') + '.';
			}
			if (seenKind !== null && spec.kind !== seenKind) {
				return here + ' is ' + spec.kind + ', but its siblings are ' + seenKind +
					' (all siblings must share the same kind).';
			}
			seenKind = spec.kind;
			if (spec.nodeClass !== undefined && Model.NODE_CLASSES.indexOf(spec.nodeClass) === -1) {
				return here + ' has an unknown class (' + JSON.stringify(spec.nodeClass) + '); expected one of: ' +
					Model.NODE_CLASSES.filter(Boolean).join(', ') + ' or empty.';
			}
			if (spec.label !== undefined && typeof spec.label !== 'string') {
				return here + ' has a label that is not text.';
			}
			var isTextList = Array.isArray(spec.value) &&
				spec.value.every(function (v) { return typeof v === 'string'; });
			if (spec.value !== undefined && typeof spec.value !== 'string' && !isTextList) {
				return here + ' has a value that is neither text nor a list of text.';
			}
			if (spec.children !== undefined && !Array.isArray(spec.children)) {
				return here + ' has children that are not a list.';
			}
			var problem = validateSiblingSpecs(spec.children || [], here, seenIds);
			if (problem) return problem;
		}
		return null;
	}

	return {
		DEFAULT_SNAPSHOT_ID: DEFAULT_SNAPSHOT_ID,
		TREE_FILE_FORMAT: TREE_FILE_FORMAT,
		ensureRoot: ensureRoot,
		validateDocument: validateDocument,
		validateSpecs: validateSpecs
	};
})(NovaDM.Model, NovaDM.Calculations, NovaDM.Util);
