window.NovaDM = window.NovaDM || {};

/**
 * Profile and version-history flyouts, opened from the pill buttons in the
 * control row above the tree. Each is its own dialog (not a shared flyout
 * with hidden panes); clicking the other tab in either header switches
 * straight to the other one.
 */
NovaDM.Popovers = (function (Model, History, VersionGraph, Render, EditorForm) {
	'use strict';

	var profileBtn = document.getElementById('profile-btn');
	var versionBtn = document.getElementById('version-btn');
	var profileFlyout = document.getElementById('profile-flyout');
	var versionFlyout = document.getElementById('version-flyout');
	var profilePane = document.getElementById('profile-pane');
	var versionPane = document.getElementById('version-pane');
	var panelsStack = document.getElementById('panels-stack');

	var openPopover = null; /* 'profile' | 'version' | null */

	var selectedVersion = null;
	var graph = null;
	var graphView = null;
	var notice = null;

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
			html += '<div class="editor-empty">No profiles saved yet \u2013 click the dot on a leaf or an option (chip) in the tree to mark it as always/never, then Save profile.</div>';
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
				alert('Mark at least one leaf (click its dot) or option (click its chip) in the tree before saving a profile.');
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
			if (!Model.hasNodeConstraints() || confirm('Reset every constraint back to default?')) {
				Model.resetNodeConstraints();
				Render.renderTree(); EditorForm.renderEditorForm(); updatePillLabels(); renderProfilePane();
			}
		});
		profilePane.querySelectorAll('[data-load-profile]').forEach(function (b) {
			b.addEventListener('click', function () {
				Model.loadProfile(b.getAttribute('data-load-profile'));
				Render.renderTree(); EditorForm.renderEditorForm(); updatePillLabels(); renderProfilePane();
			});
		});
		profilePane.querySelectorAll('[data-delete-profile]').forEach(function (b) {
			b.addEventListener('click', function () {
				Model.deleteProfile(b.getAttribute('data-delete-profile'));
				updatePillLabels(); renderProfilePane();
			});
		});
		Render.recordChange();
	}

	/* ---------- Version pane: graph + details card ---------- */

	var MAX_COMMENT_CHARS = 64;

	function shorten(text, max) { return text.length > max ? text.slice(0, max - 1) + '\u2026' : text; }

	function resetVersionView() { selectedVersion = null; graphView = null; notice = null; }

	function renderVersionPane() {
		if (!selectedVersion || !History.has(selectedVersion)) selectedVersion = History.getHead();
		versionPane.innerHTML =
			'<div class="viewport-toolbar">' +
			'<button type="button" class="btn-icon" data-vg="zoom-out" aria-label="Zoom out">\u2212</button>' +
			'<span class="metric-label" id="vg-zoom-label"></span>' +
			'<button type="button" class="btn-icon" data-vg="zoom-in" aria-label="Zoom in">+</button>' +
			'<button type="button" class="btn" data-vg="recenter" title="Fit the whole graph into view">Re-center</button>' +
			'<button type="button" class="btn" data-vg="save" title="Save the tree on screen as a new version">Save as new version\u2026</button>' +
			'</div>' +
			'<div class="vg-box" id="vg-box"></div>' +
			'<div class="vg-details" id="vg-details"></div>';

		var zoomLabel = document.getElementById('vg-zoom-label');
		graph = VersionGraph.create(document.getElementById('vg-box'), History.graphNodes(), {
			selectedId: selectedVersion,
			view: graphView,
			onSelect: function (id) { selectVersion(id); },
			onViewChange: function (view) {
				graphView = view;
				zoomLabel.textContent = Math.round(view.k * 100) + '%';
			}
		});
		renderDetails();
		Render.recordChange();
	}

	function selectVersion(id) {
		selectedVersion = id;
		notice = null;
		graph.setSelected(id);
		renderDetails();
	}

	function tagHtml(text) { return '<span class="vg-tag">' + text + '</span>'; }

	function changesHtml(d) {
		if (d.parents.length === 0) return '<div class="metric-label">First version</div>';
		var c = d.changeCounts;
		var label = '+' + c.added + ' added \u00b7 ' + c.changed + ' changed \u00b7 ' + c.removed + ' removed';
		var title = 'Compared with "' + Render.escapeHtml(d.parents[0]) + '"';
		if (c.added + c.changed + c.removed === 0) return '<div class="metric-label" title="' + title + '">' + label + '</div>';
		var signs = { add: '+', remove: '\u2212', modify: '~' };
		var lines = d.changes.map(function (ch) {
			return '<div>' + signs[ch.type] + ' ' + Render.escapeHtml(ch.text) + '</div>';
		}).join('');
		if (d.changes.hiddenCount) lines += '<div>\u2026 and ' + d.changes.hiddenCount + ' more</div>';
		return '<details><summary class="metric-label" title="' + title + '">' + label + '</summary><div class="sibling-note">' + lines + '</div></details>';
	}

	function noticeHtml() {
		if (!notice) return '';
		var html = '<div class="sibling-note">' + Render.escapeHtml(notice.text) + '</div>';
		if (notice.conflicts && notice.conflicts.length) {
			html += '<details><summary class="sibling-note">Conflicts (kept yours)</summary><div class="sibling-note">' +
				notice.conflicts.map(function (c) { return '<div>' + Render.escapeHtml(c.text + ' \u2013 ' + c.reason) + '</div>'; }).join('') +
				'</div></details>';
		}
		return html;
	}

	function actionsHtml(d) {
		var head = History.getHead();
		var esc = Render.escapeHtml;
		var html = '<button type="button" class="btn" data-vg="open"' + (d.isHead ? ' disabled title="Already open in the editor"' : ' title="Switch the editor to this version"') + '>Open</button>' +
			'<button type="button" class="btn" data-vg="restore"' + (d.isHead ? ' disabled title="This is the current version"' :
				' title="' + esc('Make a new version with the contents of this one, on top of "' + head + '"') + '"') + '>Restore</button>';
		if (d.isHead) {
			html += '<button type="button" class="btn" disabled title="Select another version in the graph to merge it into this one">Merge</button>';
		} else {
			var p = History.mergePreview(d.id);
			var n = p.canMerge ? p.added + p.updated + p.removed : 0;
			var tip = p.canMerge ? 'Merge into "' + head + '": ' + p.summary : p.problem;
			html += '<button type="button" class="btn" data-vg="merge"' + (p.canMerge ? '' : ' disabled') + ' title="' + esc(tip) + '">Merge' + (n ? ' (' + n + ')' : '') + '</button>';
		}
		if (d.isHead && d.isDirty) {
			html += '<button type="button" class="btn" data-vg="update" title="Overwrite this version with the tree on screen">Update this version</button>';
		}
		return html;
	}

	function renderDetails() {
		var box = document.getElementById('vg-details');
		var d = History.describe(selectedVersion);
		if (!d) { box.innerHTML = '<div class="editor-empty">Select a version in the graph.</div>'; return; }
		var esc = Render.escapeHtml;
		var tags = (d.isHead ? tagHtml('current') : '') + (d.isDirty ? tagHtml('unsaved changes') : '') +
			(d.isBranch ? tagHtml('branch') : '') + (d.isMerge ? tagHtml('merge') : '');
		var html = noticeHtml() +
			'<div class="control-left"><strong>' + esc(d.id) + '</strong>' + tags + '<span class="metric-label">' + esc(d.created) + '</span></div>';
		if (d.description) html += '<div class="metric-label" title="' + esc(d.description) + '">' + esc(shorten(d.description, MAX_COMMENT_CHARS)) + '</div>';
		if (d.parents.length) {
			html += '<div class="control-left"><span class="metric-label">Based on</span>' +
				d.parents.map(function (p) { return '<button type="button" class="btn" data-pick="' + esc(p) + '">' + esc(p) + '</button>'; }).join('') + '</div>';
		}
		html += changesHtml(d) + '<div class="viewport-toolbar">' + actionsHtml(d) + '</div>';
		box.innerHTML = html;
	}

	/* ---------- Version actions ---------- */

	function afterTreeChange(select) {
		Render.renderTree();
		EditorForm.renderEditorForm();
		selectedVersion = select;
		renderVersionPane();
	}

	function saveAsNewVersion() {
		var name = (prompt('Name for the new version:', '') || '').trim();
		if (!name) return;
		var comment = (prompt('Comment (optional) \u2013 what changed?', '') || '').trim();
		var error = History.saveAsNew(name, comment);
		if (error) { alert(error); return; }
		notice = null;
		selectedVersion = History.getHead();
		renderVersionPane();
	}

	function confirmLosingChanges(what) {
		return !History.isDirty() || confirm(what + ' The unsaved changes to "' + History.getHead() + '" will be lost.');
	}

	function conflictLines(list) {
		return list.slice(0, 5).map(function (c) { return '\n\u2022 ' + c.text + ' \u2013 ' + c.reason; }).join('') +
			(list.length > 5 ? '\n\u2022 \u2026 and ' + (list.length - 5) + ' more' : '');
	}

	var actions = {
		open: function (id) {
			if (!confirmLosingChanges('Open "' + id + '"?')) return;
			History.checkout(id);
			notice = null;
			afterTreeChange(History.getHead());
		},
		restore: function (id) {
			if (!confirmLosingChanges('Restore "' + id + '" as a new version?')) return;
			var name = History.restore(id);
			if (!name) return;
			notice = { text: 'Restored "' + id + '" as "' + name + '".' };
			afterTreeChange(name);
		},
		merge: function (id) {
			var p = History.mergePreview(id);
			if (!p.canMerge) return;
			var question = 'Merge "' + id + '" into "' + History.getHead() + '"?\n\n' + p.summary +
				(p.conflicts.length ? '\n\nConflicts (your side is kept):' + conflictLines(p.conflicts) : '');
			if (!confirm(question)) return;
			var result = History.merge(id);
			if (result.error) { alert(result.error); return; }
			notice = { text: 'Merged "' + id + '": ' + result.summary, conflicts: result.conflicts };
			afterTreeChange(result.name);
		},
		update: function () {
			if (!confirm('Overwrite "' + History.getHead() + '" with the tree on screen?')) return;
			History.updateHead();
			notice = null;
			renderVersionPane();
		}
	};

	versionPane.addEventListener('click', function (e) {
		var target = e.target.closest ? e.target.closest('button') : null;
		if (!target || target.disabled) return;
		var vg = target.getAttribute('data-vg');
		var pick = target.getAttribute('data-pick');
		if (pick !== null) { selectVersion(pick); return; }
		if (vg === 'zoom-in') graph.zoomBy(1.2);
		else if (vg === 'zoom-out') graph.zoomBy(1 / 1.2);
		else if (vg === 'recenter') graph.fit();
		else if (vg === 'save') saveAsNewVersion();
		else if (actions[vg]) actions[vg](selectedVersion);
	});

	/* ---------- Open/close/switch plumbing ---------- */

	function setActivePill(name) {
		profileBtn.classList.toggle('is-open', name === 'profile');
		versionBtn.classList.toggle('is-open', name === 'version');
		profileBtn.setAttribute('aria-expanded', name === 'profile' ? 'true' : 'false');
		versionBtn.setAttribute('aria-expanded', name === 'version' ? 'true' : 'false');
		panelsStack.classList.toggle('flyout-open', name !== null);
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
		if (name === 'version') { selectedVersion = null; notice = null; }
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
			if (name === 'version') { selectedVersion = null; notice = null; }
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
		updatePillLabels: updatePillLabels,
		resetVersionView: resetVersionView
	};
})(NovaDM.Model, NovaDM.History, NovaDM.VersionGraph, NovaDM.Render, NovaDM.EditorForm);
