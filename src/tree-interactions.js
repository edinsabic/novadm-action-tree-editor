window.NovaDM = window.NovaDM || {};

/**
 * Delegated interaction inside the rendered tree: expand/collapse, select,
 * constraint toggles, delete, and drag-and-drop (moving existing nodes, and
 * dropping new AND/XOR nodes from the palette). One set of listeners,
 * attached once.
 */
(function (Model, Render, EditorForm) {
	'use strict';

	var INVALID_FLASH_MS = 400;

	var treeContent = Render.treeContent;
	var lastDropEl = null;

	function rowAt(target) { return target.closest('.tree-row'); }

	function rootZoneAt(target) { return target.closest('[data-root-drop]'); }

	function nodeFor(el, attribute) {
		return Model.findNode(Model.root, el.getAttribute(attribute));
	}

	function clearDropMarks(el) {
		if (el) el.classList.remove('drop-target', 'drop-invalid');
	}

	function flashInvalid(el) {
		el.classList.remove('drop-target');
		el.classList.add('drop-invalid');
		setTimeout(function () { el.classList.remove('drop-invalid'); }, INVALID_FLASH_MS);
	}

	/* ---------- Clicks ---------- */

	treeContent.addEventListener('click', function (e) {
		var deleteBtn = e.target.closest('[data-delete-node]');
		if (deleteBtn) {
			var doomed = nodeFor(deleteBtn, 'data-delete-node');
			if (doomed) EditorForm.deleteNode(doomed);
			return;
		}
		var chip = e.target.closest('[data-value-toggle]');
		if (chip) {
			Model.cycleValueConstraint(chip.getAttribute('data-value-toggle'), chip.getAttribute('data-value'));
			Render.renderTree();
			EditorForm.renderEditorForm();
			return;
		}
		var dot = e.target.closest('[data-constraint-toggle]');
		if (dot) {
			Model.cycleNodeConstraint(dot.getAttribute('data-constraint-toggle'));
			Render.renderTree();
			return;
		}
		var disclosure = e.target.closest('[data-toggle]');
		if (disclosure) {
			var node = nodeFor(disclosure, 'data-toggle');
			if (node) {
				node.expanded = !node.expanded;
				Render.renderTree();
			}
			return;
		}
		var row = rowAt(e.target);
		if (row) {
			Model.setSelectedId(row.getAttribute('data-id'));
			Render.renderTree();
			EditorForm.renderEditorForm();
		}
	});

	/* ---------- Drag and drop ---------- */

	treeContent.addEventListener('dragstart', function (e) {
		var row = rowAt(e.target);
		if (!row) return;
		e.dataTransfer.setData('application/x-move-node', row.getAttribute('data-id'));
		e.dataTransfer.effectAllowed = 'move';
	});

	treeContent.addEventListener('dragover', function (e) {
		e.preventDefault();
		var el = rowAt(e.target) || rootZoneAt(e.target);
		if (lastDropEl && lastDropEl !== el) clearDropMarks(lastDropEl);
		if (el) {
			el.classList.add('drop-target');
			lastDropEl = el;
		}
	});

	treeContent.addEventListener('dragleave', function (e) {
		clearDropMarks(rowAt(e.target) || rootZoneAt(e.target));
	});

	treeContent.addEventListener('drop', function (e) {
		e.preventDefault();
		var row = rowAt(e.target);
		var rootZone = rootZoneAt(e.target);
		clearDropMarks(row);
		clearDropMarks(rootZone);
		var dropEl = row || rootZone || treeContent;

		var targetNode = row ? nodeFor(row, 'data-id') : Model.root;
		if (!targetNode) return;

		var newKind = e.dataTransfer.getData('application/x-new-node');
		if (newKind) {
			if (Model.canAcceptKind(targetNode, newKind, null)) EditorForm.addChildTo(targetNode, newKind);
			else flashInvalid(dropEl);
			return;
		}

		var movedId = e.dataTransfer.getData('application/x-move-node');
		if (!movedId || movedId === targetNode.id) return;
		var movedNode = Model.findNode(Model.root, movedId);
		if (!movedNode || Model.isDescendant(movedNode, targetNode)) return;
		if (!Model.canAcceptKind(targetNode, movedNode.kind, movedId)) {
			flashInvalid(dropEl);
			return;
		}
		Model.removeNode(movedId);
		targetNode.children.push(movedNode);
		targetNode.expanded = true;
		Render.renderTree();
		EditorForm.renderEditorForm();
	});

	/* ---------- Palette drag sources ---------- */

	document.querySelectorAll('.palette-item').forEach(function (item) {
		item.addEventListener('dragstart', function (e) {
			e.dataTransfer.setData('application/x-new-node', item.getAttribute('data-new-kind'));
			e.dataTransfer.effectAllowed = 'copy';
			item.classList.add('dragging');
		});
		item.addEventListener('dragend', function () { item.classList.remove('dragging'); });
	});
})(NovaDM.Model, NovaDM.Render, NovaDM.EditorForm);
