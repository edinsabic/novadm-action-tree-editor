window.NovaDM = window.NovaDM || {};

/**
 * Profile and version-history flyouts, opened from the pill buttons in the
 * control row above the tree. Each is its own dialog (not a shared flyout
 * with hidden panes); clicking the other tab in either header switches
 * straight to the other one.
 */
NovaDM.Popovers = (function (Model, Render, EditorForm) {
	'use strict';

	var profileBtn = document.getElementById('profile-btn');
	var versionBtn = document.getElementById('version-btn');
	var profileFlyout = document.getElementById('profile-flyout');
	var versionFlyout = document.getElementById('version-flyout');
	var profilePane = document.getElementById('profile-pane');
	var versionPane = document.getElementById('version-pane');

	var openPopover = null; /* 'profile' | 'version' | null */

	/* ---------- Flyout contents: profiles & versions ---------- */

	function updatePillLabels() {
		profileBtn.querySelector('.pill-btn-label').textContent = Model.getActiveProfile();
		var v = Model.getVersion(Model.getActiveVersionId());
		versionBtn.querySelector('.pill-btn-label').textContent = v ? ('Version ' + v.id) : 'Save or update version';
	}

	function renderFlyout() { renderProfilePane(); renderVersionPane(); }

	function renderProfilePane() {
		var activeProfile = Model.getActiveProfile();
		var html = '<ul class="popover-list">';
		Model.getProfiles().forEach(function (p) {
			html += '<li><button type="button" class="popover-item' + (p.name === activeProfile ? ' active' : '') +
				'" data-profile="' + Render.escapeHtml(p.name) + '">' + Render.escapeHtml(p.name) + '</button></li>';
		});
		html += '</ul><div class="popover-divider"></div>' +
			'<button type="button" class="popover-item popover-action" id="new-profile-btn">+ New profile\u2026</button>';
		profilePane.innerHTML = html;

		profilePane.querySelectorAll('[data-profile]').forEach(function (b) {
			b.addEventListener('click', function () {
				Model.setActiveProfile(b.getAttribute('data-profile'));
				updatePillLabels(); renderProfilePane();
			});
		});
		document.getElementById('new-profile-btn').addEventListener('click', function () {
			var name = (prompt('New profile name:', '') || '').trim();
			if (!name) return;
			if (Model.getProfiles().some(function (p) { return p.name === name; })) {
				alert('A profile called "' + name + '" already exists.');
				return;
			}
			Model.getProfiles().push({ name: name });
			Model.setActiveProfile(name);
			updatePillLabels(); renderProfilePane();
		});
	}

	function renderVersionPane() {
		var activeVersionId = Model.getActiveVersionId();
		var cur = Model.getVersion(activeVersionId);
		var html = '';

		html += '<div class="version-new">' +
			'<label class="version-label">Comment for the new version (optional)</label>' +
			'<input id="version-comment-input" type="text" placeholder="e.g. switch to biomass boiler" />' +
			'<label class="version-label">Version id (optional)</label>' +
			'<input id="version-id-input" type="text" placeholder="auto (a2, a3, \u2026)" />' +
			'<button type="button" class="btn" id="save-version-btn"' + (cur ? '' : ' disabled') + '>' +
				'Save as successor of ' + (cur ? Render.escapeHtml(cur.id) : '\u2013') + '</button>' +
			'</div><div class="popover-divider"></div>';

		html += '<ul class="popover-list">';
		Model.getVersions().forEach(function (v) {
			var parents = v.parents.length ? v.parents.join(', ') : '\u2013';
			var comment = (v.parents[0] && v.comments && v.comments[v.parents[0]]) || '';
			html += '<li><button type="button" class="popover-item' + (v.id === activeVersionId ? ' active' : '') +
				'" data-version="' + Render.escapeHtml(v.id) + '">' +
				'<strong>' + Render.escapeHtml(v.id) + '</strong>' +
				'<span class="version-meta"> \u2190 ' + Render.escapeHtml(parents) + '</span>' +
				(comment ? '<div class="version-comment">' + Render.escapeHtml(comment) + '</div>' : '') +
				'</button></li>';
		});
		html += '</ul>';
		versionPane.innerHTML = html;

		versionPane.querySelectorAll('[data-version]').forEach(function (b) {
			b.addEventListener('click', function () {
				Model.loadVersionIntoEditor(b.getAttribute('data-version'));
				Render.renderTree(); EditorForm.renderEditorForm(); renderFlyout(); updatePillLabels();
			});
		});
		var saveBtn = document.getElementById('save-version-btn');
		if (saveBtn) saveBtn.addEventListener('click', function () {
			var comment = document.getElementById('version-comment-input').value;
			var wantedId = document.getElementById('version-id-input').value;
			Model.saveNewVersion(comment, wantedId);
			Render.renderTree(); EditorForm.renderEditorForm(); renderFlyout(); updatePillLabels();
		});
	}

	/* ---------- Open/close/switch plumbing ---------- */

	function setActivePill(name) {
		profileBtn.classList.toggle('is-open', name === 'profile');
		versionBtn.classList.toggle('is-open', name === 'version');
		profileBtn.setAttribute('aria-expanded', name === 'profile' ? 'true' : 'false');
		versionBtn.setAttribute('aria-expanded', name === 'version' ? 'true' : 'false');
	}

	function flyoutFor(name) { return name === 'profile' ? profileFlyout : versionFlyout; }

	function closeAllPopovers() {
		profileFlyout.hidden = true;
		versionFlyout.hidden = true;
		setActivePill(null);
		openPopover = null;
	}

	function togglePopover(name) {
		if (openPopover === name) {
			closeAllPopovers();
			return;
		}
		profileFlyout.hidden = true;
		versionFlyout.hidden = true;
		openPopover = name;
		renderFlyout();
		flyoutFor(name).hidden = false;
		setActivePill(name);
	}

	profileBtn.addEventListener('click', function (e) {
		e.stopPropagation();
		togglePopover('profile');
	});
	versionBtn.addEventListener('click', function (e) {
		e.stopPropagation();
		togglePopover('version');
	});

	document.querySelectorAll('[data-flyout-switch]').forEach(function (tab) {
		tab.addEventListener('click', function (e) {
			e.stopPropagation();
			var name = tab.getAttribute('data-flyout-switch');
			if (openPopover === name) return;
			openPopover = name;
			renderFlyout();
			flyoutFor(name).hidden = false;
			flyoutFor(name === 'profile' ? 'version' : 'profile').hidden = true;
			setActivePill(name);
		});
	});

	document.querySelectorAll('[data-flyout-close]').forEach(function (btn) {
		btn.addEventListener('click', function (e) {
			e.stopPropagation();
			closeAllPopovers();
		});
	});

	profileFlyout.addEventListener('click', function (e) { e.stopPropagation(); });
	versionFlyout.addEventListener('click', function (e) { e.stopPropagation(); });

	document.addEventListener('click', function () {
		if (openPopover !== null) closeAllPopovers();
	});
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && openPopover !== null) closeAllPopovers();
	});

	return {
		renderFlyout: renderFlyout,
		updatePillLabels: updatePillLabels
	};
})(NovaDM.Model, NovaDM.Render, NovaDM.EditorForm);
