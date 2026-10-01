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
	var TOP_LEVEL_KIND = 'AND'; /* Root is an implicit AND node (see spec for details). */

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
	var profiles = []; // { name, constraints: {nodeId: 'always'|'never'} }
	var activeProfileName = null; // name of the profile currently loaded, or null

	function getNodeConstraint(nodeId) { return nodeConstraints[nodeId] || 'default'; }

	function cycleNodeConstraint(nodeId) {
		var cur = nodeConstraints[nodeId];
		if (cur === undefined) nodeConstraints[nodeId] = 'always';
		else if (cur === 'always') nodeConstraints[nodeId] = 'never';
		else delete nodeConstraints[nodeId];
	}

	function hasNodeConstraints() { return Object.keys(nodeConstraints).length > 0; }

	function resetNodeConstraints() {
		nodeConstraints = {};
		activeProfileName = null;
	}

	function getActiveProfileName() { return activeProfileName; }
	function getProfiles() { return profiles; }

	function saveProfile(name) {
		if (profiles.some(function (p) { return p.name === name; })) return false;
		profiles.push({ name: name, constraints: JSON.parse(JSON.stringify(nodeConstraints)) });
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
		activeProfileName = name;
	}

	function getProfileState() {
		return {
			active: activeProfileName,
			current: JSON.parse(JSON.stringify(nodeConstraints)),
			saved: JSON.parse(JSON.stringify(profiles))
		};
	}

	function applyProfileState(state) {
		var valid = collectNodeIds(root, {});
		function prune(constraints) {
			var out = {};
			Object.keys(constraints || {}).forEach(function (id) {
				if (valid[id] && (constraints[id] === 'always' || constraints[id] === 'never')) out[id] = constraints[id];
			});
			return out;
		}
		state = state || {};
		nodeConstraints = prune(state.current);
		profiles = (state.saved || []).map(function (p) { return { name: p.name, constraints: prune(p.constraints) }; });
		activeProfileName = profiles.some(function (p) { return p.name === state.active; }) ? state.active : null;
	}

	function resetProfiles() {
		profiles = [];
		resetNodeConstraints();
	}

	function scenarioSpaceSize() {
		function countSubtree(node) {
			if (nodeConstraints[node.id] === 'never') return 0;
			var total = 1;
			node.children.forEach(function (c) { total += countSubtree(c); });
			return total;
		}
		var total = 0;
		root.children.forEach(function (top) { total += countSubtree(top); });
		return total;
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
		if (parentNode === root && kind !== TOP_LEVEL_KIND) return false; // implicit AND root
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
