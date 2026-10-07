window.NovaDM = window.NovaDM || {};

/**
 * Delegated interaction inside the rendered tree: expand/collapse, select,
 * and drag-and-drop (moving existing nodes, and dropping new AND/XOR nodes
 * from the palette). One set of listeners, attached once.
 */
NovaDM.TreeInteractions = (function (Model, Render, EditorForm) {
	'use strict';

	var treeContent = Render.treeContent;

	function rowAt(target) { return target.closest('.tree-row'); }
	function rootZoneAt(target) { return target.closest('[data-root-drop]'); }

	function flashInvalid(el) {
		if (!el) return;
		el.classList.remove('drop-target');
		el.classList.add('drop-invalid');
		setTimeout(function () { el.classList.remove('drop-invalid'); }, 400);
	}

	treeContent.addEventListener('click', function (e) {
		var valueBtn = e.target.closest('[data-value-toggle]');
		if (valueBtn) {
			Model.cycleValueConstraint(valueBtn.getAttribute('data-value-toggle'), valueBtn.getAttribute('data-value'));
			Render.renderTree();
			EditorForm.renderEditorForm(); // Updates chips on the editor panel
			return;
		}
		var constraintBtn = e.target.closest('[data-constraint-toggle]');
		if (constraintBtn) {
			Model.cycleNodeConstraint(constraintBtn.getAttribute('data-constraint-toggle'));
			Render.renderTree();
			return;
		}
		var toggleBtn = e.target.closest('[data-toggle]');
		if (toggleBtn) {
			var tNode = Model.findNode(Model.root, toggleBtn.getAttribute('data-toggle'));
			if (tNode) { tNode.expanded = !tNode.expanded; Render.renderTree(); }
			return;
		}
		var row = rowAt(e.target);
		if (row) { Model.setSelectedId(row.getAttribute('data-id')); Render.renderTree(); EditorForm.renderEditorForm(); }
	});

	treeContent.addEventListener('dragstart', function (e) {
		var row = rowAt(e.target);
		if (!row) return;
		e.dataTransfer.setData('application/x-move-node', row.getAttribute('data-id'));
		e.dataTransfer.effectAllowed = 'move';
	});

	var lastDropEl = null;
	treeContent.addEventListener('dragover', function (e) {
		e.preventDefault();
		var row = rowAt(e.target);
		var el = row || rootZoneAt(e.target) || null;
		if (lastDropEl && lastDropEl !== el) {
			lastDropEl.classList.remove('drop-target', 'drop-invalid');
		}
		if (el) { el.classList.add('drop-target'); lastDropEl = el; }
	});
	treeContent.addEventListener('dragleave', function (e) {
		var row = rowAt(e.target) || rootZoneAt(e.target);
		if (row) row.classList.remove('drop-target', 'drop-invalid');
	});

	treeContent.addEventListener('drop', function (e) {
		e.preventDefault();
		var row = rowAt(e.target);
		var rootZone = rootZoneAt(e.target);
		if (row) row.classList.remove('drop-target', 'drop-invalid');
		if (rootZone) rootZone.classList.remove('drop-target', 'drop-invalid');

		var targetNode = row ? Model.findNode(Model.root, row.getAttribute('data-id')) : Model.root;
		if (!targetNode) return;

		var newKind = e.dataTransfer.getData('application/x-new-node');
		if (newKind) {
			if (!Model.canAcceptKind(targetNode, newKind, null)) {
				flashInvalid(row || rootZone || treeContent);
				return;
			}
			var node = Model.createNode(newKind);
			targetNode.children.push(node);
			targetNode.expanded = true;
			Model.setSelectedId(node.id);
			Render.renderTree(); EditorForm.renderEditorForm();
			return;
		}

		var movedId = e.dataTransfer.getData('application/x-move-node');
		if (movedId && movedId !== targetNode.id) {
			var movedNode = Model.findNode(Model.root, movedId);
			if (!movedNode) return;
			if (Model.isDescendant(movedNode, targetNode)) return; // can't drop into own subtree
			if (!Model.canAcceptKind(targetNode, movedNode.kind, movedId)) {
				flashInvalid(row || rootZone || treeContent);
				return;
			}
			Model.removeNode(movedId);
			targetNode.children.push(movedNode);
			targetNode.expanded = true;
			Render.renderTree(); EditorForm.renderEditorForm();
		}
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

	return {};
})(NovaDM.Model, NovaDM.Render, NovaDM.EditorForm);
