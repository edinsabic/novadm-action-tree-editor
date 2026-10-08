window.NovaDM = window.NovaDM || {};

/**
 * Editor panel: the form for the selected node (kind, class, label, value,
 * option constraints, add child, delete).
 */
NovaDM.EditorForm = (function (Model, Render, Util) {
	'use strict';

	var escapeHtml = Util.escapeHtml;
	var formHost = document.getElementById('editor-form-host');

	function on(id, type, handler) {
		document.getElementById(id).addEventListener(type, handler);
	}

	function formHtml(node) {
		var isRoot = Model.isRootNode(node);
		var lockedKind = Model.siblingKind(node, null);
		var classOptions = Model.NODE_CLASSES.map(function (c) {
			return '<option value="' + c + '"' + (node.nodeClass === c ? ' selected' : '') + '>' +
				(c || '(none)') + '</option>';
		}).join('');

		return '<div class="editor-form">' +
			'<div class="field-row">' +
				'<div class="field">' +
					'<label>Kind</label>' +
					'<div class="kind-display">' + Render.badgeHtml(node) + '<strong>' + node.kind + '</strong></div>' +
				'</div>' +
				'<div class="field">' +
					'<label>Class</label>' +
					'<select id="f-class"' + (isRoot ? ' disabled title="The root node has no class"' : '') + '>' +
						classOptions +
					'</select>' +
				'</div>' +
			'</div>' +
			'<div class="field">' +
				'<label>Label</label>' +
				'<input id="f-label" type="text" placeholder="e.g. structural_element"' +
					' value="' + escapeHtml(node.label) + '" />' +
			'</div>' +
			'<div class="field">' +
				'<label>Value / options</label>' +
				'<input id="f-value" type="text" placeholder="e.g. keep_current; replace"' +
					' title="Separate several options with ; or ,"' +
					' value="' + escapeHtml(node.value.join('; ')) + '" />' +
			'</div>' +
			'<div class="field" id="f-value-chips-field">' +
				'<label>Option constraints</label>' +
				'<div class="value-chip-row" id="f-value-chips"></div>' +
				'<div class="note">Click an option to cycle default / always / never.</div>' +
			'</div>' +
			'<div class="editor-add-row">' +
				'<button class="btn" id="add-and-child" type="button"' +
					(Model.canAcceptKind(node, 'AND', null) ? '' : ' disabled') + '>+ AND child</button>' +
				'<button class="btn" id="add-xor-child" type="button"' +
					(Model.canAcceptKind(node, 'XOR', null) ? '' : ' disabled') + '>− XOR child</button>' +
			'</div>' +
			(lockedKind
				? '<div class="note">Children are locked to ' + lockedKind + ' – all siblings must match.</div>'
				: '') +
			'<div class="editor-actions">' +
				'<button class="btn danger" id="delete-node" type="button">' +
					escapeHtml(Render.deleteLabel(node)) +
				'</button>' +
			'</div>' +
			'</div>';
	}

	function renderEditorForm() {
		var selectedId = Model.getSelectedId();
		var node = selectedId ? Model.findNode(Model.root, selectedId) : null;
		if (!node) {
			formHost.innerHTML = '<div class="editor-empty">' +
				'Select a node in the tree to edit it, or drag a new AND/XOR node in.</div>';
			return;
		}
		formHost.innerHTML = formHtml(node);
		renderValueChips(node);

		on('f-value-chips', 'click', function (e) {
			var chip = e.target.closest('[data-value-toggle]');
			if (!chip) return;
			Model.cycleValueConstraint(node.id, chip.getAttribute('data-value'));
			Render.renderTree();
			renderValueChips(node);
		});
		on('f-class', 'change', function (e) {
			node.nodeClass = e.target.value;
			Render.renderTree();
			renderEditorForm();
		});
		on('f-label', 'input', function (e) {
			node.label = e.target.value;
			Render.renderTree();
		});
		on('f-value', 'input', function (e) {
			node.value = Model.parseValues(e.target.value);
			Render.renderTree();
			renderValueChips(node);
		});
		on('add-and-child', 'click', function () { addChildTo(node, 'AND'); });
		on('add-xor-child', 'click', function () { addChildTo(node, 'XOR'); });
		on('delete-node', 'click', function () { deleteNode(node); });
	}

	function renderValueChips(node) {
		var field = document.getElementById('f-value-chips-field');
		field.hidden = !Model.hasOptions(node);
		document.getElementById('f-value-chips').innerHTML = field.hidden ? '' : Render.valueChipsHtml(node);
	}

	function addChildTo(parentNode, kind) {
		if (!Model.canAcceptKind(parentNode, kind, null)) return;
		var child = Model.createNode(kind);
		parentNode.children.push(child);
		parentNode.expanded = true;
		Model.setSelectedId(child.id);
		Render.renderTree();
		renderEditorForm();
	}

	function deleteNode(node) {
		if (Model.isRootNode(node) && !confirm('Delete the root node and the entire tree?')) return;
		Model.removeNode(node.id);
		Model.setSelectedId(null);
		Render.renderTree();
		renderEditorForm();
	}

	return {
		renderEditorForm: renderEditorForm,
		addChildTo: addChildTo,
		deleteNode: deleteNode
	};
})(NovaDM.Model, NovaDM.Render, NovaDM.Util);
