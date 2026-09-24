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
	function makeId() { return 'n' + (nextId++); }

	/**
	 * `root` is a virtual container; its children are the top-level nodes.
	 * It is never drawn or saved.
	 */
	var root = { id: 'root', children: [] };
	var selectedId = null;

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
	/**
	 * Same-level-same-kind rule: a kind can be added to parent's children
	 * only if parent has no children yet, or all existing children already have that kind.
	 */
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

	/**
	 * Text <-> array of option strings; see spec for the exact splitting
	 * rules (";"/"," separators, an optional wrapping "(...)", blanks dropped).
	 */
	function parseValues(input) {
		if (Array.isArray(input)) {
			return input.map(function (v) { return String(v).trim(); }).filter(Boolean);
		}
		var text = String(input === undefined || input === null ? '' : input).trim();
		var wrapped = /^\(([^()]*)\)$/.exec(text);
		if (wrapped) text = wrapped[1];
		return text.split(/[;,]/).map(function (v) { return v.trim(); }).filter(Boolean);
	}

	/**
	 * How a value list is shown in the tree: one option as-is, several as "(a; b; c)".
	 */
	function formatValues(values) {
		if (!values || values.length === 0) return '';
		return values.length === 1 ? values[0] : '(' + values.join('; ') + ')';
	}

	/**
	 * Builds a live node (with generated id/expanded) from a plain data
	 * spec, e.g. an entry in examples/sample-tree.js or an imported file.
	 * Recurses into children.
	 */
	function instantiateNode(spec) {
		return {
			id: makeId(),
			kind: spec.kind,
			nodeClass: spec.nodeClass || '',
			label: spec.label || '',
			value: parseValues(spec.value),
			expanded: true,
			children: (spec.children || []).map(instantiateNode)
		};
	}

	/**
	 * Converts a live tree to a list of plain node specs.
	 * ids and expanded-state are editor-only and not saved.
	 */
	function nodeToSpec(node) {
		return {
			kind: node.kind,
			nodeClass: node.nodeClass,
			label: node.label,
			value: node.value.slice(),
			children: node.children.map(nodeToSpec)
		};
	}

	/**
	 * Replaces the whole tree with the given plain node specs. Does not
	 * redraw – callers re-render afterwards (see tree-io.js).
	 */
	function replaceTree(specs) {
		root.children = specs.map(instantiateNode);
		selectedId = null;
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
		replaceTree: replaceTree
	};
})();
