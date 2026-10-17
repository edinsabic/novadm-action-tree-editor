window.NovaDM = window.NovaDM || {};

/**
 * NovaDM action-tree data model: the node shape, tree queries and mutations,
 * always/never constraints, profiles and the scenario space size. No DOM
 * references live here: render.js and the interaction modules read and
 * write this state and redraw.
 * Grammar background: ../spec/action-tree-grammar.md
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
		if (map[key] === undefined) map[key] = 'always';
		else if (map[key] === 'always') map[key] = 'never';
		else delete map[key];
	}

	function getNodeConstraint(nodeId) {
		return nodeConstraints[nodeId] || 'default';
	}

	function cycleNodeConstraint(nodeId) {
		cycleConstraint(nodeConstraints, nodeId);
	}

	function getValueConstraint(nodeId, value) {
		return (valueConstraints[nodeId] && valueConstraints[nodeId][value]) || 'default';
	}

	function cycleValueConstraint(nodeId, value) {
		var byValue = valueConstraints[nodeId] || (valueConstraints[nodeId] = {});
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
				valuesById[s.id] = (valuesById[s.id] || []).concat(parseValues(s.value));
				collect(s.children || []);
			});
		}

		function isAlwaysOrNever(c) { return c === 'always' || c === 'never'; }

		function prune(constraints) {
			var out = {};
			Object.keys(constraints || {}).forEach(function (id) {
				if (valuesById[id] && isAlwaysOrNever(constraints[id])) out[id] = constraints[id];
			});
			return out;
		}

		function pruneValues(byNode) {
			var out = {};
			Object.keys(byNode || {}).forEach(function (id) {
				var values = valuesById[id];
				if (!values) return;
				Object.keys(byNode[id]).forEach(function (v) {
					var c = byNode[id][v];
					if (values.indexOf(v) !== -1 && isAlwaysOrNever(c)) {
						(out[id] = out[id] || {})[v] = c;
					}
				});
			});
			return out;
		}

		trees.forEach(collect);
		return {
			active: state.active === undefined ? null : state.active,
			current: prune(state.current),
			currentValues: pruneValues(state.currentValues),
			saved: (state.saved || []).map(function (p) {
				return {
					name: p.name,
					constraints: prune(p.constraints),
					valueConstraints: pruneValues(p.valueConstraints)
				};
			})
		};
	}

	function applyProfileState(state, otherTrees) {
		var pruned = prunedProfileState(state || {}, [treeSpecs()].concat(otherTrees || []));
		nodeConstraints = pruned.current;
		valueConstraints = pruned.currentValues;
		profiles = pruned.saved;
		activeProfileName = findProfile(pruned.active) ? pruned.active : null;
	}

	/* ---------- Scenario space size ---------- */

	function activeValueConstraints(node) {
		return (hasOptions(node) && valueConstraints[node.id]) || {};
	}

	function isAllowed(result) { return !result.red; }

	/**
	 * Counts the valid scenarios: AND = product of its children, XOR = sum, times the node's own
	 * value choices. Always/never are applied without the And propagation rule, so a forbidden
	 * child of an AND is left out. Returns 0 for an empty tree or contradictory constraints.
	 */
	function scenarioSpaceSize() {
		if (root.children.length === 0) return 0;
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

			var sub;
			if (node.kind === 'XOR' && children.length > 0) {
				var pool = (greenChildren.length > 0 ? greenChildren : children).filter(isAllowed);
				if (pool.length === 0) red = true;
				if (greenChildren.length > 1) contradiction = true;
				sub = pool.reduce(function (s, c) { return s + c.count; }, 0);
			} else {
				sub = children.filter(isAllowed).reduce(function (p, c) { return p * c.count; }, 1);
			}
			if (alwaysValues.length > 1 || (green && red)) contradiction = true;
			return { count: red ? 0 : own * sub, green: green, red: red };
		}

		var top = root.children.map(evaluate);
		if (contradiction) return 0;
		return top.reduce(function (p, c) { return p * c.count; }, 1);
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
		getProfiles: getProfiles,
		saveProfile: saveProfile,
		deleteProfile: deleteProfile,
		loadProfile: loadProfile,
		resetProfiles: resetProfiles,
		getSource: getSource,
		setSource: setSource,
		getProfileState: getProfileState,
		applyProfileState: applyProfileState,
		scenarioSpaceSize: scenarioSpaceSize
	};
})(NovaDM.Util);
