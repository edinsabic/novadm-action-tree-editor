window.NovaDM = window.NovaDM || {};

/**
 * Undo/redo for the whole document: the tree, the profiles and the version
 * history (so saving, opening, restoring and merging versions are undoable
 * too). Every render calls record(); when the document differs from the
 * last recorded state, the previous state becomes one undo step. Typing in
 * one editor field counts as a single step until focus moves elsewhere.
 */
NovaDM.Undo = (function (Model, History, Render, EditorForm, Popovers) {
	'use strict';

	var MAX_STEPS = 100;

	var undoStack = [];
	var redoStack = [];
	var current = null;
	var lastKey = null;
	var restoring = false;

	var undoBtn = document.getElementById('undo-btn');
	var redoBtn = document.getElementById('redo-btn');

	function serialize() {
		return JSON.stringify({
			tree: Model.root.children.map(Model.nodeToSpec),
			profile: Model.getProfileState(),
			history: History.getState()
		});
	}

	function typingKey() {
		var el = document.activeElement;
		if (!el || el.tagName !== 'INPUT' || el.type !== 'text' || !el.closest('#editor-form-host')) return null;
		return el.id + ':' + Model.getSelectedId();
	}

	function updateButtons() {
		undoBtn.disabled = undoStack.length === 0;
		redoBtn.disabled = redoStack.length === 0;
	}

	/** Called after every render; turns a changed document into one undo step. */
	function record() {
		if (restoring) return;
		var state = serialize();
		if (current === null) { current = state; return; }
		if (state === current) return;
		var key = typingKey();
		if (!key || key !== lastKey) {
			undoStack.push(current);
			if (undoStack.length > MAX_STEPS) undoStack.shift();
		}
		redoStack = [];
		current = state;
		lastKey = key;
		updateButtons();
	}

	function restore(state) {
		var doc = JSON.parse(state);
		var expanded = {};
		(function walk(nodes) { nodes.forEach(function (n) { expanded[n.id] = n.expanded; walk(n.children); }); })(Model.root.children);
		var selected = Model.getSelectedId();

		restoring = true;
		try {
			Model.replaceTree(doc.tree, doc.history.snapshots.map(function (s) { return s.tree; }));
			(function walk(nodes) {
				nodes.forEach(function (n) { if (expanded[n.id] !== undefined) n.expanded = expanded[n.id]; walk(n.children); });
			})(Model.root.children);
			if (selected && Model.findNode(Model.root, selected)) Model.setSelectedId(selected);
			Model.applyProfileState(doc.profile);
			History.load(doc.history);
			Render.renderTree(); EditorForm.renderEditorForm();
			Popovers.updatePillLabels(); Popovers.renderFlyout();
		} finally {
			restoring = false;
		}
		current = serialize();
		lastKey = null;
		updateButtons();
	}

	function undo() {
		if (undoStack.length === 0) return;
		redoStack.push(current);
		restore(undoStack.pop());
	}

	function redo() {
		if (redoStack.length === 0) return;
		undoStack.push(current);
		restore(redoStack.pop());
	}

	/* ---------- Buttons & keyboard shortcuts ---------- */
	undoBtn.addEventListener('click', function (e) { e.stopPropagation(); undo(); });
	redoBtn.addEventListener('click', function (e) { e.stopPropagation(); redo(); });

	document.addEventListener('keydown', function (e) {
		if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
		var t = e.target;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
		var key = e.key.toLowerCase();
		if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
		else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
	});

	updateButtons();

	return { record: record, undo: undo, redo: redo };
})(NovaDM.Model, NovaDM.History, NovaDM.Render, NovaDM.EditorForm, NovaDM.Popovers);
