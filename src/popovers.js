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
		var active = Model.getActiveProfileName();
		profileBtn.querySelector('.pill-btn-label').textContent = active || 'Create or select profile';
	}

	function renderFlyout() { renderProfilePane(); renderVersionPane(); }

	function renderProfilePane() {
		var activeName = Model.getActiveProfileName();
		var html = '<div class="editor-add-row">' +
			'<button type="button" class="btn" id="save-profile-btn">Save profile</button>' +
			'<button type="button" class="btn" id="reset-profile-btn">Reset</button>' +
			'</div><div class="popover-divider"></div>';

		var profiles = Model.getProfiles();
		if (profiles.length === 0) {
			html += '<div class="editor-empty">No profiles saved yet \u2013 click nodes in the tree to mark them as always/never, then Save profile.</div>';
		} else {
			html += '<ul class="popover-list">';
			profiles.forEach(function (p) {
				html += '<li class="profile-row">' +
					'<button type="button" class="popover-item' + (p.name === activeName ? ' active' : '') +
					'" data-load-profile="' + Render.escapeHtml(p.name) + '">' + Render.escapeHtml(p.name) + '</button>' +
					'<button type="button" class="profile-delete-btn" data-delete-profile="' + Render.escapeHtml(p.name) + '" aria-label="Delete profile" title="Delete profile">&times;</button>' +
					'</li>';
			});
			html += '</ul>';
		}
		profilePane.innerHTML = html;

		document.getElementById('save-profile-btn').addEventListener('click', function () {
			if (!Model.hasNodeConstraints()) {
				alert('Colour at least one node (click its dot in the tree) before saving a profile.');
				return;
			}
			var name = (prompt('Profile name:', '') || '').trim();
			if (!name) return;
			if (!Model.saveProfile(name)) {
				alert('A profile called "' + name + '" already exists.');
				return;
			}
			updatePillLabels(); renderProfilePane();
		});
		document.getElementById('reset-profile-btn').addEventListener('click', function () {
			if (!Model.hasNodeConstraints() || confirm('Reset every node back to default (white)?')) {
				Model.resetNodeConstraints();
				Render.renderTree(); updatePillLabels(); renderProfilePane();
			}
		});
		profilePane.querySelectorAll('[data-load-profile]').forEach(function (b) {
			b.addEventListener('click', function () {
				Model.loadProfile(b.getAttribute('data-load-profile'));
				Render.renderTree(); updatePillLabels(); renderProfilePane();
			});
		});
		profilePane.querySelectorAll('[data-delete-profile]').forEach(function (b) {
			b.addEventListener('click', function () {
				Model.deleteProfile(b.getAttribute('data-delete-profile'));
				updatePillLabels(); renderProfilePane();
			});
		});
	}

	function renderVersionPane() {
		versionPane.innerHTML = '<div class="editor-empty">Version history is coming soon \u2013 planned as a visual, diagrammatic view of how versions branch, not a plain list.</div>';
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
