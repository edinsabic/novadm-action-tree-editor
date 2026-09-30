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

	/* ---------- Profiles & versions ---------- */
	var profiles = [{ name: 'default-profile' }];
	var activeProfile = 'default-profile';
	var versions = [];
	var activeVersionId = null;

	function makeVersionId() {
		var n = 1;
		while (versions.some(function (v) { return v.id === 'a' + n; })) n++;
		return 'a' + n;
	}
	function uniqueVersionId(wanted) {
		var id = (wanted || '').trim();
		if (!id) return makeVersionId();
		if (!versions.some(function (v) { return v.id === id; })) return id;
		var base = id.replace(/\d+$/, '') || 'v';
		var i = 1;
		while (versions.some(function (v) { return v.id === base + i; })) i++;
		return base + i;
	}
	function getVersion(id) {
		for (var i = 0; i < versions.length; i++) if (versions[i].id === id) return versions[i];
		return null;
	}
	function snapshotActiveVersion() {
		var v = getVersion(activeVersionId);
		if (v) v.tree = root.children.map(nodeToSpec);
	}
	function loadVersionIntoEditor(id) {
		if (id === activeVersionId) return;
		snapshotActiveVersion();
		activeVersionId = id;
		var v = getVersion(id);
		root.children = v ? v.tree.map(instantiateNode) : [];
		selectedId = null;
	}
	function initProject(profileList, activeProf, activeVer, versionList) {
		profiles = (profileList && profileList.length) ? profileList : [{ name: 'default-profile' }];
		activeProfile = (activeProf && profiles.some(function (p) { return p.name === activeProf; }))
			? activeProf : profiles[0].name;
		versions = (versionList && versionList.length) ? versionList : [];
		if (versions.length === 0) {
			versions.push({ id: 'a1', parents: [], comments: {}, createdAt: new Date().toISOString(), tree: [] });
		}
		activeVersionId = (activeVer && getVersion(activeVer)) ? activeVer : versions[0].id;
		root.children = getVersion(activeVersionId).tree.map(instantiateNode);
		selectedId = null;
	}
	function saveNewVersion(comment, wantedId) {
		if (!activeVersionId) return null;
		snapshotActiveVersion();
		var parentId = activeVersionId;
		var id = uniqueVersionId(wantedId);
		var comments = {};
		if (comment && comment.trim()) comments[parentId] = comment.trim();
		var parentSpecs = getVersion(parentId).tree;
		versions.push({
			id: id,
			parents: [parentId],
			comments: comments,
			createdAt: new Date().toISOString(),
			tree: JSON.parse(JSON.stringify(parentSpecs))
		});
		activeVersionId = id;
		root.children = getVersion(id).tree.map(instantiateNode);
		selectedId = null;
		return id;
	}
	function projectHasContent() {
		return root.children.length > 0 || versions.some(function (v) { return (v.tree || []).length > 0; });
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
			id: makeId(),
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
			kind: node.kind,
			nodeClass: node.nodeClass,
			label: node.label,
			value: node.value.slice(),
			children: node.children.map(nodeToSpec)
		};
	}

	function replaceTree(specs) {
		root.children = specs.map(instantiateNode);
		selectedId = null;
		snapshotActiveVersion();
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
		getProfiles: function () { return profiles; },
		getActiveProfile: function () { return activeProfile; },
		setActiveProfile: function (name) {
			if (profiles.some(function (p) { return p.name === name; })) activeProfile = name;
		},
		getVersions: function () { return versions; },
		getActiveVersionId: function () { return activeVersionId; },
		getVersion: getVersion,
		snapshotActiveVersion: snapshotActiveVersion,
		loadVersionIntoEditor: loadVersionIntoEditor,
		initProject: initProject,
		saveNewVersion: saveNewVersion,
		projectHasContent: projectHasContent
	};
})();
