window.NovaDM = window.NovaDM || {};

/**
 * Editor panel: the form for the selected node (kind, class, label, value,
 * option constraints, add child, delete). A Subject node is picked from the
 * predefined subjects (subjects.js) in a cascading menu, or typed in as a
 * custom subject.
 */
NovaDM.EditorForm = (function (Model, Render, Util, Subjects) {
	'use strict';

	var MENU_GAP = 4;
	var SCREEN_MARGIN = 8;

	var escapeHtml = Util.escapeHtml;
	var formHost = document.getElementById('editor-form-host');
	var subjectMenu = document.getElementById('subject-menu');

	var customSubjectId = null;

	function on(id, type, handler) {
		document.getElementById(id).addEventListener(type, handler);
	}

	function selectedNode() {
		var selectedId = Model.getSelectedId();
		return selectedId ? Model.findNode(Model.root, selectedId) : null;
	}

	function isSubject(node) { return node.nodeClass === 'Subject'; }

	function isCustomSubject(node) {
		if (customSubjectId === node.id) return true;
		return !Subjects.find(node.label, node.value) && (node.label !== '' || node.value.length > 0);
	}

	function subjectPickerText(node) {
		var match = Subjects.find(node.label, node.value);
		if (match) return match.category.name + ' › ' + match.subject.name;
		return isCustomSubject(node) ? 'Custom subject' : 'Choose a subject…';
	}

	function otherListNoteHtml(node) {
		var match = Subjects.find(node.label, node.value);
		if (!match || match.listKey === Subjects.getActiveList()) return '';
		return '<div class="note">From the ' + escapeHtml(Subjects.listName(match.listKey)) + ' list,' +
			' not the subject list in use.</div>';
	}

	function subjectFieldHtml(node) {
		return '<div class="field">' +
			'<label>Subject</label>' +
			'<button id="f-subject" class="subject-picker" type="button" aria-haspopup="menu"' +
				' aria-expanded="false">' +
				'<span class="subject-picker-text">' + escapeHtml(subjectPickerText(node)) + '</span>' +
				'<span class="subject-picker-caret" aria-hidden="true">▾</span>' +
			'</button>' +
			otherListNoteHtml(node) +
			'</div>';
	}

	function textFieldsHtml(node) {
		return '<div class="field">' +
				'<label>Label</label>' +
				'<input id="f-label" type="text" placeholder="e.g. structural_element"' +
					' value="' + escapeHtml(node.label) + '" />' +
			'</div>' +
			'<div class="field">' +
				'<label>Value / options</label>' +
				'<input id="f-value" type="text" placeholder="e.g. keep_current; replace"' +
					' title="Separate several options with ; or ,"' +
					' value="' + escapeHtml(node.value.join('; ')) + '" />' +
			'</div>';
	}

	function formHtml(node) {
		var lockedKind = Model.siblingKind(node, null);
		var classOptions = Model.NODE_CLASSES.map(function (c) {
			return '<option value="' + c + '"' + (node.nodeClass === c ? ' selected' : '') + '>' +
				(c || '(none)') + '</option>';
		}).join('');
		var showTextFields = !isSubject(node) || isCustomSubject(node);

		return '<div class="editor-form">' +
			'<div class="field-row">' +
				'<div class="field">' +
					'<label>Kind</label>' +
					'<div class="kind-display">' + Render.badgeHtml(node) + '<strong>' + node.kind + '</strong></div>' +
				'</div>' +
				'<div class="field">' +
					'<label>Class</label>' +
					'<select id="f-class">' +
						classOptions +
					'</select>' +
				'</div>' +
			'</div>' +
			(isSubject(node) ? subjectFieldHtml(node) : '') +
			(showTextFields ? textFieldsHtml(node) : '') +
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
		closeSubjectMenu();
		var node = selectedNode();
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
		if (document.getElementById('f-subject')) {
			on('f-subject', 'click', function (e) {
				if (subjectMenu.hidden) openSubjectMenu(e.currentTarget, node);
				else closeSubjectMenu();
			});
		}
		if (document.getElementById('f-label')) {
			on('f-label', 'input', function (e) {
				node.label = e.target.value;
				Render.renderTree();
			});
			on('f-value', 'input', function (e) {
				node.value = Model.parseValues(e.target.value);
				Render.renderTree();
				renderValueChips(node);
			});
		}
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

	/* ---------- Subject menu ---------- */

	function subjectMenuHtml(node) {
		var match = Subjects.find(node.label, node.value);
		var categoriesHtml = Subjects.categories().map(function (category) {
			var isCurrent = match && match.category === category;
			var items = category.subjects.map(function (subject) {
				var isChosen = isCurrent && match.subject === subject;
				return '<li><button type="button" class="subject-menu-item' + (isChosen ? ' active' : '') + '"' +
					' role="menuitem" data-subject="' + escapeHtml(Subjects.subjectId(category, subject)) + '">' +
					escapeHtml(subject.name) + '</button></li>';
			}).join('');
			return '<li class="subject-menu-category">' +
				'<button type="button" class="subject-menu-item' + (isCurrent ? ' active' : '') + '"' +
				' role="menuitem" aria-haspopup="menu" data-category="' + escapeHtml(category.key) + '">' +
				'<span>' + escapeHtml(category.name) + '</span><span aria-hidden="true">›</span></button>' +
				'<ul class="subject-menu-list subject-submenu" role="menu">' + items + '</ul>' +
				'</li>';
		}).join('');
		return '<ul class="subject-menu-list">' + categoriesHtml +
			'<li class="popover-divider" role="separator"></li>' +
			'<li><button type="button" class="subject-menu-item" role="menuitem" data-custom-subject="true">' +
			'+ Custom subject…</button></li>' +
			'</ul>';
	}

	/** Opens the menu below the button, or above it when there is more room there; it scrolls if neither fits. */
	function openSubjectMenu(button, node) {
		var rect = button.getBoundingClientRect();
		subjectMenu.innerHTML = subjectMenuHtml(node);
		subjectMenu.style.left = rect.left + 'px';
		subjectMenu.style.top = '0px';
		subjectMenu.style.maxHeight = '';
		subjectMenu.style.minWidth = rect.width + 'px';
		subjectMenu.hidden = false;

		var height = subjectMenu.offsetHeight;
		var below = window.innerHeight - rect.bottom - MENU_GAP - SCREEN_MARGIN;
		var above = rect.top - MENU_GAP - SCREEN_MARGIN;
		var opensAbove = height > below && above > below;
		var room = opensAbove ? above : below;
		var shown = Math.min(height, room);
		subjectMenu.style.maxHeight = room + 'px';
		subjectMenu.style.top = (opensAbove ? rect.top - MENU_GAP - shown : rect.bottom + MENU_GAP) + 'px';
		button.setAttribute('aria-expanded', 'true');
	}

	function placeSubmenu(item) {
		var submenu = item.querySelector('.subject-submenu');
		var itemRect = item.getBoundingClientRect();
		var menuRect = subjectMenu.getBoundingClientRect();
		submenu.style.maxHeight = (window.innerHeight - 2 * SCREEN_MARGIN) + 'px';
		var width = submenu.offsetWidth;
		var height = submenu.offsetHeight;
		var fitsRight = menuRect.right + width <= window.innerWidth - SCREEN_MARGIN;
		var top = Math.min(itemRect.top - MENU_GAP - 1, window.innerHeight - SCREEN_MARGIN - height);
		submenu.style.left = (fitsRight ? menuRect.right - MENU_GAP : menuRect.left - width + MENU_GAP) + 'px';
		submenu.style.top = Math.max(SCREEN_MARGIN, top) + 'px';
	}

	function closeSubjectMenu() {
		if (subjectMenu.hidden) return;
		subjectMenu.hidden = true;
		subjectMenu.innerHTML = '';
		var button = document.getElementById('f-subject');
		if (button) button.setAttribute('aria-expanded', 'false');
	}

	function openCategory(item) {
		subjectMenu.querySelectorAll('.subject-menu-category').forEach(function (li) {
			li.classList.toggle('open', li === item);
		});
		placeSubmenu(item);
	}

	function chooseSubject(id) {
		var node = selectedNode();
		if (!node) return;
		Subjects.categories().forEach(function (category) {
			category.subjects.forEach(function (subject) {
				if (Subjects.subjectId(category, subject) !== id) return;
				node.label = category.key;
				node.value = [subject.key];
			});
		});
		customSubjectId = null;
		Render.renderTree();
		renderEditorForm();
	}

	function chooseCustomSubject() {
		var node = selectedNode();
		if (!node) return;
		customSubjectId = node.id;
		renderEditorForm();
		document.getElementById('f-label').focus();
	}

	subjectMenu.addEventListener('mouseover', function (e) {
		var category = e.target.closest('.subject-menu-category');
		if (category) openCategory(category);
	});

	subjectMenu.addEventListener('focusin', function (e) {
		var category = e.target.closest('.subject-menu-category');
		if (category) openCategory(category);
	});

	subjectMenu.addEventListener('scroll', function () {
		var open = subjectMenu.querySelector('.subject-menu-category.open');
		if (open) placeSubmenu(open);
	});

	subjectMenu.addEventListener('click', function (e) {
		var btn = e.target.closest('button');
		if (!btn) return;
		if (btn.hasAttribute('data-subject')) chooseSubject(btn.getAttribute('data-subject'));
		else if (btn.hasAttribute('data-custom-subject')) chooseCustomSubject();
		else if (btn.hasAttribute('data-category')) openCategory(btn.parentNode);
	});

	document.addEventListener('click', function (e) {
		if (!e.target.closest('#subject-menu, #f-subject')) closeSubjectMenu();
	}, true);

	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') closeSubjectMenu();
	});

	window.addEventListener('resize', closeSubjectMenu);

	document.addEventListener('scroll', function (e) {
		if (!subjectMenu.contains(e.target)) closeSubjectMenu();
	}, true);

	return {
		renderEditorForm: renderEditorForm,
		addChildTo: addChildTo,
		deleteNode: deleteNode
	};
})(NovaDM.Model, NovaDM.Render, NovaDM.Util, NovaDM.Subjects);
