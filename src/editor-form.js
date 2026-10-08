window.NovaDM = window.NovaDM || {};

/**
 * Editor panel: the form for the currently-selected node (kind, class,
 * label, value, add-child, delete).
 */
NovaDM.EditorForm = (function (Model, Render) {
	'use strict';

	var formHost = document.getElementById('editor-form-host');

	function renderEditorForm() {
		var selectedId = Model.getSelectedId();
		var node = selectedId ? Model.findNode(Model.root, selectedId) : null;
		if (!node) {
			formHost.innerHTML = '<div class="editor-empty">Select a node in the tree to edit it, or drag a new AND/XOR node in.</div>';
			return;
		}
		var isRoot = Model.isRootNode(node);
		var classOptions = Model.NODE_CLASSES.map(function (c) {
			return '<option value="' + c + '"' + (node.nodeClass === c ? ' selected' : '') + '>' + (c || '(none)') + '</option>';
		}).join('');

		var canAddAnd = Model.canAcceptKind(node, 'AND', null);
		var canAddXor = Model.canAcceptKind(node, 'XOR', null);
		var lockedKind = Model.siblingKind(node, null);

		formHost.innerHTML =
			'<div class="editor-form">' +
			'<div class="field-row">' +
				'<div class="field"><label>Kind</label>' +
					'<div style="display:flex;align-items:center;gap:6px;">' + Render.badgeHtml(node) +
					'<strong style="font-size:0.85rem;">' + node.kind + '</strong></div>' +
				'</div>' +
				'<div class="field"><label>Class</label>' +
					'<select id="f-class"' + (isRoot ? ' disabled title="The root node has no class"' : '') + '>' + classOptions + '</select>' +
				'</div>' +
			'</div>' +
			'<div class="field"><label>Label</label><input id="f-label" type="text" placeholder="e.g. structural_element" value="' + Render.escapeHtml(node.label) + '" /></div>' +
			'<div class="field"><label>Value / options</label><input id="f-value" type="text" placeholder="e.g. keep_current; replace" title="Separate several options with ; or ," value="' + Render.escapeHtml(node.value.join('; ')) + '" /></div>' +
			'<div class="field" id="f-value-chips-field"><label>Option constraints</label>' +
				'<div class="value-chip-row" id="f-value-chips"></div>' +
				'<div class="sibling-note">Click an option to cycle default / always / never.</div></div>' +
			'<div class="editor-add-row">' +
				'<button class="btn" id="add-and-child" type="button"' + (canAddAnd ? '' : ' disabled') + '>+ AND child</button>' +
				'<button class="btn" id="add-xor-child" type="button"' + (canAddXor ? '' : ' disabled') + '>\u2212 XOR child</button>' +
			'</div>' +
			(lockedKind ? '<div class="sibling-note">Children are locked to ' + lockedKind + ' – all siblings must match.</div>' : '') +
			'<div class="editor-actions">' +
				'<button class="btn danger" id="delete-node" type="button">Delete node' + (node.children.length ? ' &amp; ' + node.children.length + ' child' + (node.children.length > 1 ? 'ren' : '') : '') + '</button>' +
			'</div>' +
			'</div>';

		renderValueChips(node);
		document.getElementById('f-value-chips').addEventListener('click', function (e) {
			var chip = e.target.closest('[data-value-toggle]');
			if (!chip) return;
			Model.cycleValueConstraint(node.id, chip.getAttribute('data-value'));
			Render.renderTree(); renderValueChips(node);
		});
		document.getElementById('f-class').addEventListener('change', function (e) { node.nodeClass = e.target.value; Render.renderTree(); renderEditorForm(); });
		document.getElementById('f-label').addEventListener('input', function (e) { node.label = e.target.value; Render.renderTree(); });
		document.getElementById('f-value').addEventListener('input', function (e) { node.value = Model.parseValues(e.target.value); Render.renderTree(); renderValueChips(node); });
		document.getElementById('add-and-child').addEventListener('click', function () { addChildTo(node, 'AND'); });
		document.getElementById('add-xor-child').addEventListener('click', function () { addChildTo(node, 'XOR'); });
		document.getElementById('delete-node').addEventListener('click', function () { deleteNode(node); });
	}

	function deleteNode(node) {
		if (Model.isRootNode(node) && !confirm('Delete the root node and the entire tree?')) return;
		Model.removeNode(node.id);
		Model.setSelectedId(null);
		Render.renderTree(); renderEditorForm();
	}

	/** Only nodes with several values have options to constrain; the row hides itself otherwise. */
	function renderValueChips(node) {
		var field = document.getElementById('f-value-chips-field');
		field.hidden = node.value.length < 2;
		document.getElementById('f-value-chips').innerHTML = field.hidden ? '' : Render.valueChipsHtml(node, true);
	}

	function addChildTo(parentNode, kind) {
		if (!Model.canAcceptKind(parentNode, kind, null)) return;
		var child = Model.createNode(kind);
		parentNode.children.push(child);
		parentNode.expanded = true;
		Model.setSelectedId(child.id);
		Render.renderTree(); renderEditorForm();
	}

	return {
		renderEditorForm: renderEditorForm,
		addChildTo: addChildTo,
		deleteNode: deleteNode
	};
})(NovaDM.Model, NovaDM.Render);
