window.NovaDM = window.NovaDM || {};

(function (Model, History, Render, EditorForm, Subjects, Util) {
	'use strict';

	var PANEL_GAP = 6;

	var escapeHtml = Util.escapeHtml;

	var openBtn = document.getElementById('generate-tree-btn');
	var panel = document.getElementById('generator-panel');
	var body = document.getElementById('generator-body');
	var countEl = document.getElementById('generator-count');
	var generateBtn = document.getElementById('generator-generate-btn');
	var viewportTree = panel.parentNode;

	var depth = Subjects.DEPTHS[Subjects.DEPTHS.length - 1].key;
	var checked = {};

	function eachSubject(visit) {
		Subjects.categories().forEach(function (category) {
			category.subjects.forEach(function (subject) {
				visit(Subjects.subjectId(category, subject), subject, category);
			});
		});
	}

	function selectedIds() {
		var ids = [];
		eachSubject(function (id, subject) {
			if (checked[id] && Subjects.isInDepth(subject, depth)) ids.push(id);
		});
		return ids;
	}

	function listsHtml() {
		var active = Subjects.getActiveList();
		return Subjects.lists().map(function (list) {
			var isActive = list.key === active;
			return '<button type="button" class="toggle-btn' + (isActive ? ' active' : '') + '"' +
				' data-gen-list="' + escapeHtml(list.key) + '" aria-pressed="' + isActive + '"' +
				' title="' + escapeHtml(list.name) + '">' + escapeHtml(list.shortName) + '</button>';
		}).join('');
	}

	function depthsHtml() {
		return Subjects.DEPTHS.map(function (d) {
			return '<label class="gen-depth">' +
				'<input type="radio" name="gen-depth" value="' + escapeHtml(d.key) + '"' +
				(d.key === depth ? ' checked' : '') + ' /> ' + escapeHtml(d.name) +
				'</label>';
		}).join('');
	}

	function categoriesHtml() {
		return Subjects.categories().map(function (category) {
			var items = category.subjects.map(function (subject) {
				var id = Subjects.subjectId(category, subject);
				var enabled = Subjects.isInDepth(subject, depth);
				return '<label class="gen-subject' + (enabled ? '' : ' is-disabled') + '">' +
					'<input type="checkbox" data-gen-subject="' + escapeHtml(id) + '"' +
					(checked[id] && enabled ? ' checked' : '') + (enabled ? '' : ' disabled') + ' />' +
					'<span>' + escapeHtml(subject.name) + '</span>' +
					'</label>';
			}).join('');
			return '<fieldset class="gen-category">' +
				'<legend>' + escapeHtml(category.name) + '</legend>' + items +
				'</fieldset>';
		}).join('');
	}

	function renderBody() {
		body.innerHTML =
			'<div class="gen-row">' +
			'<span class="note">Subject list</span>' +
			'<div class="toggle-group gen-list-toggle" role="group" aria-label="Subject list">' + listsHtml() +
			'</div>' +
			'</div>' +
			'<div class="gen-row" role="radiogroup" aria-label="Renovation depth">' +
			'<span class="note">Renovation depth</span>' + depthsHtml() +
			'</div>' +
			'<div class="gen-categories">' + categoriesHtml() + '</div>' +
			'<div class="note">Source: ' + escapeHtml(Subjects.listName()) + '</div>';
		updateCount();
	}

	function switchList(key) {
		if (key === Subjects.getActiveList()) return;
		Subjects.setActiveList(key);
		checked = {};
		renderBody();
		EditorForm.renderEditorForm();
	}

	function updateCount() {
		var n = selectedIds().length;
		countEl.textContent = n + ' subject' + (n === 1 ? '' : 's') + ' selected';
		generateBtn.disabled = n === 0;
	}

	function setAll(value) {
		eachSubject(function (id, subject) {
			if (Subjects.isInDepth(subject, depth)) checked[id] = value;
		});
		renderBody();
	}

	/** Replaces the tree with the checked subjects; the version history is kept, so this is an unsaved change. */
	function generate() {
		var ids = selectedIds();
		if (ids.length === 0) return;
		var hasTree = Model.root.children.length > 0;
		if (hasTree && !confirm('Replace the current tree with a new tree of ' + ids.length + ' subject' +
			(ids.length === 1 ? '' : 's') + '? You can undo this.')) {
			return;
		}
		var rootId = hasTree ? Model.root.children[0].id : null;
		var versionTrees = History.getState().snapshots.map(function (s) { return s.tree; });
		Model.replaceTree(Subjects.treeSpecs(ids, rootId), versionTrees);
		closePanel();
		Render.renderTree();
		EditorForm.renderEditorForm();
		Render.fitTraditionalView();
	}

	/* ---------- Opening and closing ---------- */

	function openPanel() {
		renderBody();
		var top = openBtn.offsetTop + openBtn.offsetHeight + PANEL_GAP;
		panel.style.top = top + 'px';
		panel.style.maxHeight = (viewportTree.clientHeight - top - PANEL_GAP) + 'px';
		panel.hidden = false;
		openBtn.setAttribute('aria-expanded', 'true');
		openBtn.classList.add('is-open');
	}

	function closePanel() {
		panel.hidden = true;
		openBtn.setAttribute('aria-expanded', 'false');
		openBtn.classList.remove('is-open');
	}

	openBtn.addEventListener('click', function () {
		if (panel.hidden) openPanel();
		else closePanel();
	});

	panel.addEventListener('click', function (e) {
		var listBtn = e.target.closest('[data-gen-list]');
		if (listBtn) {
			switchList(listBtn.getAttribute('data-gen-list'));
			return;
		}
		var btn = e.target.closest('[data-gen]');
		if (!btn || btn.disabled) return;
		var action = btn.getAttribute('data-gen');
		if (action === 'close') closePanel();
		else if (action === 'select-all') setAll(true);
		else if (action === 'clear') setAll(false);
		else if (action === 'generate') generate();
	});

	panel.addEventListener('change', function (e) {
		var input = e.target;
		if (input.name === 'gen-depth') {
			depth = input.value;
			renderBody();
		} else if (input.hasAttribute('data-gen-subject')) {
			checked[input.getAttribute('data-gen-subject')] = input.checked;
			updateCount();
		}
	});

	document.addEventListener('click', function (e) {
		if (!panel.hidden && !panel.contains(e.target) && !openBtn.contains(e.target)) closePanel();
	}, true);

	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && !panel.hidden) closePanel();
	});
})(NovaDM.Model, NovaDM.History, NovaDM.Render, NovaDM.EditorForm, NovaDM.Subjects, NovaDM.Util);
