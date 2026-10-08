window.NovaDM = window.NovaDM || {};

/**
 * NovaDM action-tree data model: node shape, tree queries/mutations, and
 * value (de)serialisation. No DOM references live here – render.js and
 * the interaction modules read/write this state and redraw.
 * Grammar background: ../spec/action-tree-grammar.md
 */
NovaDM.Model = (function () {
	'use strict';

	var KINDS = ['AND', 'XOR'];
	var NODE_CLASSES = ['', 'Subject', 'Approach', 'Feature'];
	var TOP_LEVEL_KIND = 'AND'; /* The root node is always AND (see spec for details). */

	/**
	 * Decision: always/never can only be set on leaves (chips for values and dot for nodes). 
	 * Set to false to allow constraints on any node again.
	 */
	var LEAF_ONLY_CONSTRAINTS = true;

	var nextId = 1;
	var usedIds = {}; /* every id currently in use (or promised by a file being loaded), so makeId never collides */
	function makeId() {
		var id;
		do { id = 'n' + (nextId++); } while (usedIds[id]);
		usedIds[id] = true;
		return id;
	}

	/**
	 * `root` is a virtual container; its children are the top-level nodes.
	 * It is never drawn or saved.
	 */
	var root = { id: 'root', children: [] };
	var selectedId = null;

	var nodeConstraints = {}; // nodeId -> 'always' | 'never'
	var valueConstraints = {}; // nodeId -> { valueText: 'always' | 'never' } (individual values inside a node's parentheses)
	var profiles = []; // { name, constraints: {nodeId: 'always'|'never'}, valueConstraints: {nodeId: {value: 'always'|'never'}} }
	var activeProfileName = null; // name of the profile currently loaded, or null

	function isRootNode(node) { return root.children.length > 0 && root.children[0] === node; }

	function isConstrainable(node) {
		if (isRootNode(node)) return false;
		return !LEAF_ONLY_CONSTRAINTS || (node.children.length === 0 && node.value.length < 2);
	}

	function activeNodeConstraint(node) {
		return isConstrainable(node) ? nodeConstraints[node.id] : undefined;
	}

	function getNodeConstraint(nodeId) { return nodeConstraints[nodeId] || 'default'; }

	function cycleNodeConstraint(nodeId) {
		var cur = nodeConstraints[nodeId];
		if (cur === undefined) nodeConstraints[nodeId] = 'always';
		else if (cur === 'always') nodeConstraints[nodeId] = 'never';
		else delete nodeConstraints[nodeId];
	}

	function getValueConstraint(nodeId, value) {
		return (valueConstraints[nodeId] && valueConstraints[nodeId][value]) || 'default';
	}

	function cycleValueConstraint(nodeId, value) {
		var m = valueConstraints[nodeId] || (valueConstraints[nodeId] = {});
		var cur = m[value];
		if (cur === undefined) m[value] = 'always';
		else if (cur === 'always') m[value] = 'never';
		else delete m[value];
		if (Object.keys(m).length === 0) delete valueConstraints[nodeId];
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

	function getActiveProfileName() { return activeProfileName; }
	function getProfiles() { return profiles; }

	function saveProfile(name) {
		if (profiles.some(function (p) { return p.name === name; })) return false;
		profiles.push({
			name: name,
			constraints: JSON.parse(JSON.stringify(nodeConstraints)),
			valueConstraints: JSON.parse(JSON.stringify(valueConstraints))
		});
		activeProfileName = name;
		return true;
	}

	function deleteProfile(name) {
		profiles = profiles.filter(function (p) { return p.name !== name; });
		if (activeProfileName === name) activeProfileName = null;
	}

	function loadProfile(name) {
		var p = profiles.filter(function (pr) { return pr.name === name; })[0];
		if (!p) return;
		nodeConstraints = JSON.parse(JSON.stringify(p.constraints));
		valueConstraints = JSON.parse(JSON.stringify(p.valueConstraints || {}));
		activeProfileName = name;
	}

	function getProfileState() {
		return {
			active: activeProfileName,
			current: JSON.parse(JSON.stringify(nodeConstraints)),
			currentValues: JSON.parse(JSON.stringify(valueConstraints)),
			saved: JSON.parse(JSON.stringify(profiles))
		};
	}

	function applyProfileState(state) {
		var nodesById = collectNodes(root, {});
		function prune(constraints) {
			var out = {};
			Object.keys(constraints || {}).forEach(function (id) {
				if (nodesById[id] && (constraints[id] === 'always' || constraints[id] === 'never')) out[id] = constraints[id];
			});
			return out;
		}
		function pruneValues(byNode) {
			var out = {};
			Object.keys(byNode || {}).forEach(function (id) {
				var node = nodesById[id];
				if (!node) return;
				Object.keys(byNode[id]).forEach(function (v) {
					var c = byNode[id][v];
					if (node.value.indexOf(v) !== -1 && (c === 'always' || c === 'never')) {
						(out[id] = out[id] || {})[v] = c;
					}
				});
			});
			return out;
		}
		state = state || {};
		nodeConstraints = prune(state.current);
		valueConstraints = pruneValues(state.currentValues);
		profiles = (state.saved || []).map(function (p) {
			return { name: p.name, constraints: prune(p.constraints), valueConstraints: pruneValues(p.valueConstraints) };
		});
		activeProfileName = profiles.some(function (p) { return p.name === state.active; }) ? state.active : null;
	}

	function resetProfiles() {
		profiles = [];
		resetNodeConstraints();
	}

	/* How many ways the node's own parenthesised values can be chosen.
	   A node with values (a; b; c) is a small XOR over them: "never" removes a value,
	   "always" pins the choice to that value (two "always" values contradict -> 0). */
	function ownChoices(node) {
		var vals = node.value;
		if (vals.length === 0) return 1;
		var vc = valueConstraints[node.id] || {};
		var forced = vals.filter(function (v) { return vc[v] === 'always'; });
		if (forced.length > 1) return 0;
		if (forced.length === 1) return 1;
		return vals.filter(function (v) { return vc[v] !== 'never'; }).length;
	}

	/* True if this node or anything beneath it is marked "always" (node or value level).
	   Such a node must be present in every scenario, so every XOR above it is pinned to its branch. */
	function containsAlways(node) {
		if (activeNodeConstraint(node) === 'always') return true;
		var vc = valueConstraints[node.id];
		if (vc && node.value.some(function (v) { return vc[v] === 'always'; })) return true;
		return node.children.some(containsAlways);
	}

	function scenarioSpaceSize() {
		function count(node) {
			if (activeNodeConstraint(node) === 'never') return 0;
			var own = ownChoices(node);
			if (own === 0 || node.children.length === 0) return own;

			var sub;
			if (node.kind === 'AND') {
				sub = node.children.reduce(function (p, c) { return p * count(c); }, 1);
			} else { /* XOR: exactly one child is chosen */
				var forced = node.children.filter(containsAlways);
				if (forced.length > 1) return 0; /* two required branches under one XOR conflict */
				var pool = forced.length ? forced : node.children;
				sub = pool.reduce(function (s, c) { return s + count(c); }, 0);
			}
			return own * sub;
		}
		/* Root is an implicit AND over the top-level nodes. */
		return root.children.reduce(function (p, c) { return p * count(c); }, 1);
	}

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
			return kind === TOP_LEVEL_KIND && !parentNode.children.some(function (c) { return c.id !== excludeId; });
		}
		if (parentNode === root.children[0] && kind !== TOP_LEVEL_KIND) return false;
		var existing = siblingKind(parentNode, excludeId);
		return existing === null || existing === kind;
	}

	function createNode(kind) {
		return { id: makeId(), kind: kind, nodeClass: '', label: '', value: [], expanded: true, children: [] };
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

	function reserveSpecIds(specs) {
		specs.forEach(function (spec) {
			if (spec.id) usedIds[spec.id] = true;
			reserveSpecIds(spec.children || []);
		});
	}

	function replaceTree(specs) {
		usedIds = {};
		reserveSpecIds(specs);
		root.children = specs.map(instantiateNode);
		selectedId = null;
	}

	function collectNodes(node, into) {
		node.children.forEach(function (c) { into[c.id] = c; collectNodes(c, into); });
		return into;
	}

	function collectNodeIds(node, into) {
		node.children.forEach(function (c) { into[c.id] = true; collectNodeIds(c, into); });
		return into;
	}

	return {
		KINDS: KINDS,
		NODE_CLASSES: NODE_CLASSES,
		TOP_LEVEL_KIND: TOP_LEVEL_KIND,
		root: root,
		getSelectedId: function () { return selectedId; },
		setSelectedId: function (id) { selectedId = id; },
		findNode: findNode,
		findParent: findParent,
		isDescendant: isDescendant,
		removeNode: removeNode,
		siblingKind: siblingKind,
		canAcceptKind: canAcceptKind,
		createNode: createNode,
		parseValues: parseValues,
		formatValues: formatValues,
		instantiateNode: instantiateNode,
		nodeToSpec: nodeToSpec,
		replaceTree: replaceTree,
		getNodeConstraint: getNodeConstraint,
		cycleNodeConstraint: cycleNodeConstraint,
		isConstrainable: isConstrainable,
		isRootNode: isRootNode,
		getValueConstraint: getValueConstraint,
		cycleValueConstraint: cycleValueConstraint,
		hasNodeConstraints: hasNodeConstraints,
		resetNodeConstraints: resetNodeConstraints,
		resetProfiles: resetProfiles,
		getProfileState: getProfileState,
		applyProfileState: applyProfileState,
		getActiveProfileName: getActiveProfileName,
		getProfiles: getProfiles,
		saveProfile: saveProfile,
		deleteProfile: deleteProfile,
		loadProfile: loadProfile,
		scenarioSpaceSize: scenarioSpaceSize
	};
})();
