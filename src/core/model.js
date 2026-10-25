window.NovaDM = window.NovaDM || {};

/**
 * NovaDM action-tree data model: the node shape, tree queries and mutations,
 * always/never constraints, profiles, the file's source line and name, the nodes per
 * class and the scenario space size. No DOM references live here: render.js and the
 * interaction modules read and write this state and redraw.
 * Grammar background: ../../spec/action-tree-grammar.md
 */
NovaDM.Model = (function (Util) {
	'use strict';

	var KINDS = ['AND', 'XOR'];
	var NODE_CLASSES = ['', 'Subject', 'Approach', 'Feature'];
	var TOP_LEVEL_KIND = 'AND';
	var LEAF_ONLY_CONSTRAINTS = false;

	var root = { id: 'root', children: [] };
	var selectedId = null;

	var nodeConstraints = {};
	var valueConstraints = {};
	var profiles = [];
	var activeProfileName = null;
	var source = '';
	var documentName = '';

	/* ---------- Ids ---------- */

	var nextId = 1;
	var usedIds = {};

	function makeId() {
		var id;
		do {
			id = 'n' + (nextId++);
		} while (usedIds[id]);
		usedIds[id] = true;
		return id;
	}

	function reserveSpecIds(specs) {
		specs.forEach(function (spec) {
			if (spec.id) usedIds[spec.id] = true;
			reserveSpecIds(spec.children || []);
		});
	}

	function reserveIds(trees) {
		(trees || []).forEach(reserveSpecIds);
	}

	/* ---------- Tree queries and mutations ---------- */

	function isRootNode(node) { return root.children[0] === node; }

	function hasOptions(node) { return node.value.length > 1; }

	function findNode(node, id) {
		if (node.id === id) return node;
		for (var i = 0; i < node.children.length; i++) {
			var found = findNode(node.children[i], id);
			if (found) return found;
		}
		return null;
	}

	function findParent(node, id) {
		for (var i = 0; i < node.children.length; i++) {
			if (node.children[i].id === id) return node;
			var found = findParent(node.children[i], id);
			if (found) return found;
		}
		return null;
	}

	function eachNode(visit) {
		(function walk(nodes) {
			nodes.forEach(function (n) {
				visit(n);
				walk(n.children);
			});
		})(root.children);
	}

	function isDescendant(ancestor, node) {
		for (var i = 0; i < ancestor.children.length; i++) {
			if (ancestor.children[i].id === node.id) return true;
			if (isDescendant(ancestor.children[i], node)) return true;
		}
		return false;
	}

	function removeNode(id) {
		var parent = findParent(root, id);
		if (!parent) return;
		parent.children = parent.children.filter(function (c) { return c.id !== id; });
	}

	function siblingKind(parentNode, excludeId) {
		for (var i = 0; i < parentNode.children.length; i++) {
			if (parentNode.children[i].id !== excludeId) return parentNode.children[i].kind;
		}
		return null;
	}

	function canAcceptKind(parentNode, kind, excludeId) {
		if (parentNode === root) {
			return !parentNode.children.some(function (c) { return c.id !== excludeId; });
		}
		var existing = siblingKind(parentNode, excludeId);
		return existing === null || existing === kind;
	}

	/* ---------- Nodes and specs ---------- */

	function createNode(kind) {
		return {
			id: makeId(),
			kind: kind,
			nodeClass: '',
			label: '',
			value: [],
			expanded: true,
			children: []
		};
	}

	function parseValues(input) {
		if (Array.isArray(input)) {
			return input.map(function (v) { return String(v).trim(); }).filter(Boolean);
		}
		var text = String(input === undefined || input === null ? '' : input).trim();
		var wrapped = /^\(([^()]*)\)$/.exec(text);
		if (wrapped) text = wrapped[1];
		return text.split(/[;,]/).map(function (v) { return v.trim(); }).filter(Boolean);
	}

	function formatValues(values) {
		if (!values || values.length === 0) return '';
		return values.length === 1 ? values[0] : '(' + values.join('; ') + ')';
	}

	function instantiateNode(spec) {
		return {
			id: spec.id ? spec.id : makeId(),
			kind: spec.kind,
			nodeClass: spec.nodeClass || '',
			label: spec.label || '',
			value: parseValues(spec.value),
			expanded: true,
			children: (spec.children || []).map(instantiateNode)
		};
	}

	function nodeToSpec(node) {
		return {
			id: node.id,
			kind: node.kind,
			nodeClass: node.nodeClass,
			label: node.label,
			value: node.value.slice(),
			children: node.children.map(nodeToSpec)
		};
	}

	function treeSpecs() {
		return root.children.map(nodeToSpec);
	}

	/** Replaces the live tree. Ids used in `otherTrees` (e.g. other versions) stay reserved. */
	function replaceTree(specs, otherTrees) {
		usedIds = {};
		reserveSpecIds(specs);
		reserveIds(otherTrees);
		root.children = specs.map(instantiateNode);
		selectedId = null;
	}

	/* ---------- Always/never constraints ---------- */

	function isConstrainable(node) {
		if (isRootNode(node) || hasOptions(node)) return false;
		return !LEAF_ONLY_CONSTRAINTS || node.children.length === 0;
	}

	function activeNodeConstraint(node) {
		return isConstrainable(node) ? nodeConstraints[node.id] : undefined;
	}

	function cycleConstraint(map, key) {
		if (!Util.own(map, key)) Util.setOwn(map, key, 'always');
		else if (map[key] === 'always') map[key] = 'never';
		else delete map[key];
	}

	function getNodeConstraint(nodeId) {
		return Util.own(nodeConstraints, nodeId) ? nodeConstraints[nodeId] : 'default';
	}

	function cycleNodeConstraint(nodeId) {
		cycleConstraint(nodeConstraints, nodeId);
	}

	function getValueConstraint(nodeId, value) {
		var byValue = Util.own(valueConstraints, nodeId) ? valueConstraints[nodeId] : null;
		return Util.own(byValue, value) ? byValue[value] : 'default';
	}

	function cycleValueConstraint(nodeId, value) {
		var byValue = Util.own(valueConstraints, nodeId)
			? valueConstraints[nodeId]
			: Util.setOwn(valueConstraints, nodeId, {});
		cycleConstraint(byValue, value);
		if (Object.keys(byValue).length === 0) delete valueConstraints[nodeId];
	}

	function hasNodeConstraints() {
		var nodeLevel = Object.keys(nodeConstraints).some(function (id) {
			var node = findNode(root, id);
			return node && isConstrainable(node);
		});
		return nodeLevel || Object.keys(valueConstraints).length > 0;
	}

	function resetNodeConstraints() {
		nodeConstraints = {};
		valueConstraints = {};
		activeProfileName = null;
	}

	/* ---------- Profiles ---------- */

	function findProfile(name) {
		return profiles.filter(function (p) { return p.name === name; })[0] || null;
	}

	function getActiveProfileName() { return activeProfileName; }

	function profileChanged() {
		var profile = findProfile(activeProfileName);
		if (!profile) return hasNodeConstraints();
		return Util.sortedJson(profile.constraints) !== Util.sortedJson(nodeConstraints) ||
			Util.sortedJson(profile.valueConstraints || {}) !== Util.sortedJson(valueConstraints);
	}

	function getProfiles() { return profiles; }

	function saveProfile(name) {
		if (findProfile(name)) return false;
		profiles.push({
			name: name,
			constraints: Util.clone(nodeConstraints),
			valueConstraints: Util.clone(valueConstraints)
		});
		activeProfileName = name;
		return true;
	}

	function deleteProfile(name) {
		profiles = profiles.filter(function (p) { return p.name !== name; });
		if (activeProfileName === name) activeProfileName = null;
	}

	function loadProfile(name) {
		var profile = findProfile(name);
		if (!profile) return;
		nodeConstraints = Util.clone(profile.constraints);
		valueConstraints = Util.clone(profile.valueConstraints || {});
		activeProfileName = name;
	}

	function resetProfiles() {
		profiles = [];
		resetNodeConstraints();
	}

	function getSource() { return source; }

	function setSource(text) { source = text || ''; }

	function getDocumentName() { return documentName; }

	function setDocumentName(name) { documentName = name || ''; }

	function emptyProfileState() {
		return { active: null, current: {}, currentValues: {}, saved: [] };
	}

	function getProfileState(trees) {
		var state = {
			active: activeProfileName,
			current: Util.clone(nodeConstraints),
			currentValues: Util.clone(valueConstraints),
			saved: Util.clone(profiles)
		};
		return trees ? prunedProfileState(state, trees) : state;
	}

	function prunedProfileState(state, trees) {
		var valuesById = {};

		function collect(specs) {
			specs.forEach(function (s) {
				Util.setOwn(valuesById, s.id, valuesOf(s.id).concat(parseValues(s.value)));
				collect(s.children || []);
			});
		}

		function valuesOf(id) { return Util.own(valuesById, id) ? valuesById[id] : []; }

		function isAlwaysOrNever(c) { return c === 'always' || c === 'never'; }

		function prune(constraints) {
			var out = {};
			Object.keys(constraints || {}).forEach(function (id) {
				if (Util.own(valuesById, id) && isAlwaysOrNever(constraints[id])) Util.setOwn(out, id, constraints[id]);
			});
			return out;
		}

		function pruneValues(byNode) {
			var out = {};
			Object.keys(byNode || {}).forEach(function (id) {
				if (!Util.own(valuesById, id)) return;
				var values = valuesById[id];
				Object.keys(byNode[id]).forEach(function (v) {
					var c = byNode[id][v];
					if (values.indexOf(v) !== -1 && isAlwaysOrNever(c)) {
						var kept = Util.own(out, id) ? out[id] : Util.setOwn(out, id, {});
						Util.setOwn(kept, v, c);
					}
				});
			});
			return out;
		}

		trees.forEach(collect);
		var saved = (state.saved || []).map(function (p) {
			return {
				name: p.name,
				constraints: prune(p.constraints),
				valueConstraints: pruneValues(p.valueConstraints)
			};
		});
		var hasActive = saved.some(function (p) { return p.name === state.active; });
		return {
			active: hasActive ? state.active : null,
			current: prune(state.current),
			currentValues: pruneValues(state.currentValues),
			saved: saved
		};
	}

	function applyProfileState(state, trees) {
		var applied = trees ? prunedProfileState(state || {}, trees) : Util.clone(state || emptyProfileState());
		nodeConstraints = applied.current || {};
		valueConstraints = applied.currentValues || {};
		profiles = applied.saved || [];
		activeProfileName = findProfile(applied.active) ? applied.active : null;
	}

	/* ---------- Counts ---------- */

	function classCounts() {
		var counts = { subjects: 0, approaches: 0, features: 0, featureValues: 0 };
		eachNode(function (n) {
			if (n.nodeClass === 'Subject') counts.subjects++;
			if (n.nodeClass === 'Approach') counts.approaches++;
			if (n.nodeClass === 'Feature') {
				counts.features++;
				counts.featureValues += n.value.length;
			}
		});
		return counts;
	}

	/* ---------- Scenario space size ---------- */

	function activeValueConstraints(node) {
		return (hasOptions(node) && valueConstraints[node.id]) || {};
	}

	function isAllowed(result) { return !result.red; }

	/**
	 * Applies the always/never marks on screen: per node id, whether a scenario holding its parent may hold
	 * the node (`possible`), the options it may take (`values`) and its scenarios below (`count`); the `size`,
	 * and `contradictory` when the marks leave a non-empty tree no scenario.
	 */
	function applyMarks() {
		var allowed = Object.create(null);
		var contradiction = false;

		function evaluate(node) {
			var constraint = activeNodeConstraint(node);
			var vc = activeValueConstraints(node);
			var alwaysValues = node.value.filter(function (v) { return vc[v] === 'always'; });
			var allowedValues = node.value.filter(function (v) { return vc[v] !== 'never'; });
			var own = node.value.length === 0 || alwaysValues.length > 0 ? 1 : allowedValues.length;

			var children = node.children.map(evaluate);
			var greenChildren = children.filter(function (c) { return c.green; });
			var green = constraint === 'always' || alwaysValues.length > 0 || greenChildren.length > 0;
			var red = constraint === 'never' || own === 0;

			var pool = children.filter(isAllowed);
			var sub;
			if (node.kind === 'XOR' && children.length > 0) {
				if (greenChildren.length > 0) pool = greenChildren.filter(isAllowed);
				if (pool.length === 0) red = true;
				if (greenChildren.length > 1) contradiction = true;
				sub = pool.reduce(function (s, c) { return s + c.count; }, 0);
			} else {
				sub = pool.reduce(function (p, c) { return p * c.count; }, 1);
			}
			if (alwaysValues.length > 1 || (green && red)) contradiction = true;
			var count = red ? 0 : own * sub;
			node.children.forEach(function (c, i) { allowed[c.id].possible = pool.indexOf(children[i]) !== -1; });
			allowed[node.id] = {
				possible: !red,
				values: alwaysValues.length > 0 ? alwaysValues : allowedValues,
				count: count
			};
			return { count: count, green: green, red: red };
		}

		var top = root.children.map(evaluate);
		var product = top.reduce(function (p, c) { return p * c.count; }, 1);
		var size = contradiction || top.length === 0 ? 0 : product;
		return { size: size, contradictory: top.length > 0 && size === 0, allowed: allowed };
	}

	/**
	 * Counts the valid scenarios: AND = product of its children, XOR = sum, times the node's own
	 * value choices. Always/never are applied without the And propagation rule, so a forbidden
	 * child of an AND is left out. Returns 0 for an empty tree or contradictory constraints.
	 */
	function scenarioSpaceSize() {
		return applyMarks().size;
	}

	return {
		KINDS: KINDS,
		NODE_CLASSES: NODE_CLASSES,
		TOP_LEVEL_KIND: TOP_LEVEL_KIND,
		root: root,
		getSelectedId: function () { return selectedId; },
		setSelectedId: function (id) { selectedId = id; },
		isRootNode: isRootNode,
		hasOptions: hasOptions,
		findNode: findNode,
		eachNode: eachNode,
		isDescendant: isDescendant,
		removeNode: removeNode,
		siblingKind: siblingKind,
		canAcceptKind: canAcceptKind,
		createNode: createNode,
		parseValues: parseValues,
		formatValues: formatValues,
		treeSpecs: treeSpecs,
		replaceTree: replaceTree,
		reserveIds: reserveIds,
		isConstrainable: isConstrainable,
		getNodeConstraint: getNodeConstraint,
		cycleNodeConstraint: cycleNodeConstraint,
		getValueConstraint: getValueConstraint,
		cycleValueConstraint: cycleValueConstraint,
		hasNodeConstraints: hasNodeConstraints,
		resetNodeConstraints: resetNodeConstraints,
		getActiveProfileName: getActiveProfileName,
		profileChanged: profileChanged,
		getProfiles: getProfiles,
		saveProfile: saveProfile,
		deleteProfile: deleteProfile,
		loadProfile: loadProfile,
		resetProfiles: resetProfiles,
		getSource: getSource,
		setSource: setSource,
		getDocumentName: getDocumentName,
		setDocumentName: setDocumentName,
		emptyProfileState: emptyProfileState,
		getProfileState: getProfileState,
		prunedProfileState: prunedProfileState,
		applyProfileState: applyProfileState,
		classCounts: classCounts,
		applyMarks: applyMarks,
		scenarioSpaceSize: scenarioSpaceSize
	};
})(NovaDM.Util);
