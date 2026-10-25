window.NovaDM = window.NovaDM || {};

/**
 * Profile and version-history flyouts, opened from the pill buttons in the
 * control rows of both tabs. Each is its own dialog
 * (not a shared flyout with hidden panes); clicking the other tab in either
 * header switches straight to the other one.
 */
NovaDM.Popovers = (function (Model, History, VersionGraph, Render, EditorForm, Util) {
	'use strict';

	var MAX_COMMENT_CHARS = 64;
	var FLYOUT_GAP = 6;
	var MAX_PILL_LABEL_CHARS = 34;
	var MAX_CONFLICTS_LISTED = 5;
	var MAX_VERSIONS_NAMED = 3;
	var GRAPH_ZOOM_STEP = 1.2;
	var PROFILE_PILL_TITLE = 'Create, select or delete profiles';
	var VERSION_PILL_TITLE = 'Version history: open, save, merge or delete versions';
	var GONE_PROFILE_TITLE = 'None of its nodes are in this version\'s tree, so it\'s safe to delete';
	var EMPTY_PROFILE_TITLE = 'It marks no nodes as always or never, so it\'s safe to delete';
	var SAVE_PROFILE_TITLE = 'Save the always/never marks in the tree as a named profile in this version';
	var CLEAR_MARKS_TITLE = 'Set every dot and option in the tree back to default and unload the profile.' +
		' Saved profiles stay as they are.';

	var escapeHtml = Util.escapeHtml;
	var plural = Util.plural;

	var profileBtn = document.getElementById('profile-btn');
	var versionBtn = document.getElementById('version-btn');
	var calcProfileBtn = document.getElementById('calc-profile-btn');
	var calcVersionBtn = document.getElementById('calc-version-btn');
	var profileFlyout = document.getElementById('profile-flyout');
	var versionFlyout = document.getElementById('version-flyout');
	var profilePane = document.getElementById('profile-pane');
	var versionPane = document.getElementById('version-pane');
	var treeLayer = document.getElementById('tree-popover-layer');
	var calcLayer = document.getElementById('calc-popover-layer');

	var openFlyoutName = null;
	var openedFrom = 'tree';
	var selectedVersion = null;
	var graph = null;
	var graphView = null;
	var notice = null;

	function renderFlyout() {
		renderProfilePane();
		renderVersionPane();
	}

	/* ---------- Profile pane ---------- */

	function setPill(btn, name, suffix, title) {
		var shown = Util.shorten(name, MAX_PILL_LABEL_CHARS);
		btn.querySelector('.pill-btn-label').textContent = shown + suffix;
		btn.title = shown === name ? title : name + '\n' + title;
	}

	function updatePillLabels() {
		var profiles = 'Profiles: ' + (Model.getActiveProfileName() || 'none');
		setPill(profileBtn, profiles, '', PROFILE_PILL_TITLE);
		setPill(calcProfileBtn, profiles, '', PROFILE_PILL_TITLE);
		var unsaved = History.isDirty() ? ' · unsaved' : '';
		setPill(versionBtn, 'Version: ' + History.getHead(), unsaved, VERSION_PILL_TITLE);
		setPill(calcVersionBtn, 'Version: ' + History.getHead(), unsaved, VERSION_PILL_TITLE);
		placeBelow();
	}

	function isEmptyProfile(p) {
		return Object.keys(p.constraints || {}).length === 0 && Object.keys(p.valueConstraints || {}).length === 0;
	}

	function renderProfilePane() {
		var activeName = Model.getActiveProfileName();
		var profiles = Model.getProfiles();
		var html = '<div class="editor-add-row">' +
			'<button type="button" class="btn" id="save-profile-btn" title="' + SAVE_PROFILE_TITLE + '">' +
				'Save profile</button>' +
			'<button type="button" class="btn" id="reset-profile-btn" title="' + CLEAR_MARKS_TITLE + '">' +
				'Clear marks / Deselect profile</button>' +
			'</div>' +
			'<div class="popover-divider"></div>';

		if (profiles.length === 0) {
			html += '<div class="editor-empty">No profiles saved yet – click the dot on a leaf or an option' +
				' (chip) in the Action tree tab\'s Workspace panel to mark it as always/never, then Save profile.' +
				'</div>';
		} else {
			var onScreen = Model.getProfileState([Model.treeSpecs()]).saved;
			html += '<ul class="popover-list">' + profiles.map(function (p, i) {
				var name = escapeHtml(p.name);
				var why = !isEmptyProfile(onScreen[i]) ? ''
					: isEmptyProfile(p) ? EMPTY_PROFILE_TITLE : GONE_PROFILE_TITLE;
				return '<li class="profile-row">' +
					'<button type="button" class="popover-item' + (p.name === activeName ? ' active' : '') + '"' +
					' data-load-profile="' + name + '"' + (why ? ' title="' + escapeHtml(why) + '"' : '') + '>' + name +
					(why ? ' <span class="profile-empty">(empty)</span>' : '') + '</button>' +
					'<button type="button" class="profile-delete-btn" data-delete-profile="' + name + '"' +
					' aria-label="Delete profile" title="Delete profile">' + Render.trashIconHtml() + '</button>' +
					'</li>';
			}).join('') + '</ul>';
		}
		profilePane.innerHTML = html;
		Render.recordChange();
	}

	function afterProfileChange(constraintsChanged) {
		History.storeProfiles();
		if (constraintsChanged) {
			Render.renderTree();
			EditorForm.renderEditorForm();
		}
		renderProfilePane();
	}

	function saveProfile() {
		if (!Model.hasNodeConstraints()) {
			alert('Mark at least one leaf (click its dot) or option (click its chip) in the Action tree tab' +
				' before saving a profile.');
			return;
		}
		var name = (prompt('Profile name:', '') || '').trim();
		if (!name) return;
		if (!Model.saveProfile(name)) {
			alert('A profile called "' + name + '" already exists.');
			return;
		}
		afterProfileChange(false);
	}

	function resetProfile() {
		Model.resetNodeConstraints();
		afterProfileChange(true);
	}

	profilePane.addEventListener('click', function (e) {
		var btn = e.target.closest('button');
		if (!btn) return;
		if (btn.id === 'save-profile-btn') {
			saveProfile();
		} else if (btn.id === 'reset-profile-btn') {
			resetProfile();
		} else if (btn.hasAttribute('data-load-profile')) {
			Model.loadProfile(btn.getAttribute('data-load-profile'));
			afterProfileChange(true);
		} else if (btn.hasAttribute('data-delete-profile')) {
			Model.deleteProfile(btn.getAttribute('data-delete-profile'));
			afterProfileChange(false);
		}
	});

	/* ---------- Version pane ---------- */

	function resetVersionView() {
		selectedVersion = null;
		graphView = null;
		notice = null;
	}

	function renderVersionPane() {
		if (!selectedVersion || !History.has(selectedVersion)) selectedVersion = History.getHead();
		versionPane.innerHTML =
			'<div class="viewport-toolbar">' +
			'<button type="button" class="btn-icon" data-vg="zoom-out" aria-label="Zoom out">−</button>' +
			'<span class="metric-label" id="vg-zoom-label"></span>' +
			'<button type="button" class="btn-icon" data-vg="zoom-in" aria-label="Zoom in">+</button>' +
			'<button type="button" class="btn" data-vg="recenter" title="Fit the whole graph into view">' +
			'Re-center</button>' +
			'<button type="button" class="btn" data-vg="save"' +
			' title="Save the tree and numbers on screen as a new version">' +
			'Save as new version…</button>' +
			'</div>' +
			'<div class="vg-box" id="vg-box"></div>' +
			'<div class="vg-details" id="vg-details"></div>';

		var zoomLabel = document.getElementById('vg-zoom-label');
		graph = VersionGraph.create(document.getElementById('vg-box'), History.graphNodes(), {
			selectedId: selectedVersion,
			view: graphView,
			onSelect: selectVersion,
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

	function partChangesHtml(part, text, title) {
		if (!text) return '';
		return '<div class="metric-label" title="' + title + '">' + part + ': ' + escapeHtml(text) + '</div>';
	}

	function changesHtml(d) {
		if (d.parents.length === 0) return '<div class="metric-label">First version</div>';
		var c = d.changeCounts;
		var label = '+' + c.added + ' added · ' + c.changed + ' changed · ' + c.removed + ' removed';
		var title = escapeHtml('Compared with "' + d.parents[0] + '"');
		var profiles = partChangesHtml('Profiles', d.profileChanges, title) +
			partChangesHtml('Numbers', d.numberChanges, title);
		if (c.added + c.changed + c.removed === 0) {
			return '<div class="metric-label" title="' + title + '">' + label + '</div>' + profiles;
		}
		var signs = { add: '+', remove: '−', modify: '~' };
		var lines = d.changes.map(function (ch) {
			return '<div>' + signs[ch.type] + ' ' + escapeHtml(ch.text) + '</div>';
		}).join('');
		if (d.changes.hiddenCount) lines += '<div>… and ' + d.changes.hiddenCount + ' more</div>';
		return '<details>' +
			'<summary class="metric-label" title="' + title + '">' + label + '</summary>' +
			'<div class="note">' + lines + '</div>' +
			'</details>' + profiles;
	}

	function noticeHtml() {
		if (!notice) return '';
		var html = '<div class="note">' + escapeHtml(notice.text) + '</div>';
		if (notice.conflicts && notice.conflicts.length) {
			var lines = notice.conflicts.map(function (c) {
				return '<div>' + escapeHtml(c.text + ' – ' + c.reason) + '</div>';
			}).join('');
			html += '<details>' +
				'<summary class="note">Conflicts (kept yours)</summary>' +
				'<div class="note">' + lines + '</div>' +
				'</details>';
		}
		return html;
	}

	function buttonHtml(action, label, title, disabled, extraClass) {
		return '<button type="button" class="btn' + (extraClass ? ' ' + extraClass : '') + '"' +
			(action ? ' data-vg="' + action + '"' : '') +
			(disabled ? ' disabled' : '') + ' title="' + escapeHtml(title) + '">' + label + '</button>';
	}

	function deleteButtonHtml(d) {
		var problem = History.deleteProblem(d.id);
		return buttonHtml('remove', 'Delete', problem || 'Delete this version from the history', !!problem, 'danger');
	}

	function updateButtonHtml() {
		var canUpdate = History.canUpdateHead();
		return buttonHtml('update', 'Update this version', canUpdate
			? 'Overwrite this version with the tree and numbers on screen'
			: 'Other versions are based on this one, so it cannot be changed. Save as a new version instead.',
			!canUpdate);
	}

	function actionsHtml(d) {
		var head = History.getHead();
		if (d.isHead) {
			return buttonHtml('open', 'Open', 'Already open in the editor', true) +
				buttonHtml('restore', 'Restore', 'This is the current version', true) +
				buttonHtml(null, 'Merge', 'Select another version in the graph to merge it into this one', true) +
				deleteButtonHtml(d) +
				(d.isDirty ? updateButtonHtml() : '');
		}
		var p = History.mergePreview(d.id);
		var count = p.canMerge ? p.count : 0;
		return buttonHtml('open', 'Open', 'Switch the editor to this version', false) +
			buttonHtml('restore', 'Restore',
				'Make a new version with the contents of this one, on top of "' + head + '"', false) +
			buttonHtml('merge', 'Merge' + (count ? ' (' + count + ')' : ''),
				p.canMerge ? 'Merge into "' + head + '": ' + p.summary : p.problem, !p.canMerge) +
			deleteButtonHtml(d);
	}

	function renderDetails() {
		var box = document.getElementById('vg-details');
		var d = History.describe(selectedVersion);
		if (!d) {
			box.innerHTML = '<div class="editor-empty">Select a version in the graph.</div>';
			return;
		}
		var tags = (d.isHead ? tagHtml('current') : '') + (d.isDirty ? tagHtml('unsaved changes') : '') +
			(d.isBranch ? tagHtml('branch') : '') + (d.isMerge ? tagHtml('merge') : '');
		var html = noticeHtml() +
			'<div class="control-left">' +
			'<strong>' + escapeHtml(d.id) + '</strong>' + tags +
			'<span class="metric-label">' + escapeHtml(d.created) + '</span>' +
			'</div>';
		if (d.description) {
			html += '<div class="metric-label" title="' + escapeHtml(d.description) + '">' +
				escapeHtml(Util.shorten(d.description, MAX_COMMENT_CHARS)) + '</div>';
		}
		if (d.parents.length) {
			html += '<div class="control-left"><span class="metric-label">Based on</span>' +
				d.parents.map(function (p) {
					return '<button type="button" class="btn" data-pick="' + escapeHtml(p) + '">' +
						escapeHtml(p) + '</button>';
				}).join('') +
				'</div>';
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

	function formatNumber(n) { return n.toLocaleString('en-GB', { maximumFractionDigits: 10 }); }

	function namedVersions(ids) {
		var more = ids.length - MAX_VERSIONS_NAMED;
		return quoted(ids.slice(0, MAX_VERSIONS_NAMED)) + (more > 0 ? ' and ' + more + ' more' : '');
	}

	function numberName(c) { return c.attribute + ' of ' + c.label + (c.option ? ' · ' + c.option : ''); }

	function correctionQuestion(found) {
		if (found.length === 1) {
			var c = found[0];
			return formatNumber(c.from) + ' is also the ' + numberName(c) + ' in ' +
				plural(c.versions.length, 'other version') + ' (' + namedVersions(c.versions) + ').\n\n' +
				'Change it to ' + formatNumber(c.to) + ' there too?';
		}
		var versions = [];
		found.forEach(function (c) {
			c.versions.forEach(function (id) { if (versions.indexOf(id) === -1) versions.push(id); });
		});
		var lines = found.slice(0, MAX_CONFLICTS_LISTED).map(function (c) {
			return '\n• ' + numberName(c) + ': ' + formatNumber(c.from) + ' → ' + formatNumber(c.to) +
				' (in ' + namedVersions(c.versions) + ')';
		}).join('');
		var more = found.length - MAX_CONFLICTS_LISTED;
		return plural(found.length, 'number') + ' you changed still have the old value in ' +
			plural(versions.length, 'other version') + ':' + lines + (more > 0 ? '\n• … and ' + more + ' more' : '') +
			'\n\nChange them there too?';
	}

	function offerCorrections(before) {
		var found = History.numberCorrections(before);
		if (found.length && confirm(correctionQuestion(found))) History.applyNumberCorrections(found);
	}

	function saveAsNewVersion() {
		var name = (prompt('Name for the new version:', '') || '').trim();
		if (!name) return;
		var comment = (prompt('Comment (optional) – what changed?', '') || '').trim();
		var before = History.storedCalculations();
		var error = History.saveAsNew(name, comment);
		if (error) {
			alert(error);
			return;
		}
		offerCorrections(before);
		notice = null;
		selectedVersion = History.getHead();
		renderVersionPane();
	}

	function confirmLosingChanges(question) {
		return !History.isDirty() ||
			confirm(question + ' The unsaved changes to "' + History.getHead() + '" will be lost.');
	}

	function conflictLines(list) {
		var shown = list.slice(0, MAX_CONFLICTS_LISTED).map(function (c) {
			return '\n• ' + c.text + ' – ' + c.reason;
		}).join('');
		var more = list.length - MAX_CONFLICTS_LISTED;
		return shown + (more > 0 ? '\n• … and ' + more + ' more' : '');
	}

	function quoted(ids) {
		return ids.map(function (id) { return '"' + id + '"'; }).join(', ');
	}

	function relinkNote(d) {
		if (d.children.length === 0) return '';
		if (d.parents.length === 0) return '\n\n' + quoted(d.children) + ' will become the first version.';
		return '\n\n' + quoted(d.children) + ' will then be based on ' + quoted(d.parents) + ' instead.';
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
			if (result.error) {
				alert(result.error);
				return;
			}
			notice = { text: 'Merged "' + id + '": ' + result.summary, conflicts: result.conflicts };
			afterTreeChange(result.name);
		},
		update: function () {
			if (!confirm('Overwrite "' + History.getHead() + '" with the tree and numbers on screen?')) return;
			var before = History.storedCalculations();
			History.updateHead();
			offerCorrections(before);
			notice = null;
			renderVersionPane();
		},
		remove: function (id) {
			var d = History.describe(id);
			if (!d || !confirm('Delete version "' + id + '"?' + relinkNote(d))) return;
			var error = History.deleteVersion(id);
			if (error) {
				alert(error);
				return;
			}
			notice = { text: 'Deleted "' + id + '".' };
			selectedVersion = History.getHead();
			renderVersionPane();
		}
	};

	versionPane.addEventListener('click', function (e) {
		var btn = e.target.closest('button');
		if (!btn || btn.disabled) return;
		var pick = btn.getAttribute('data-pick');
		if (pick !== null) {
			selectVersion(pick);
			return;
		}
		var vg = btn.getAttribute('data-vg');
		if (vg === 'zoom-in') graph.zoomBy(GRAPH_ZOOM_STEP);
		else if (vg === 'zoom-out') graph.zoomBy(1 / GRAPH_ZOOM_STEP);
		else if (vg === 'recenter') graph.fit();
		else if (vg === 'save') saveAsNewVersion();
		else if (actions[vg]) actions[vg](selectedVersion);
	});

	/* ---------- Opening, closing and switching ---------- */

	function setActivePill(name) {
		var fromCalc = openedFrom === 'calc';
		[[profileBtn, name === 'profile' && !fromCalc], [versionBtn, name === 'version' && !fromCalc],
			[calcProfileBtn, name === 'profile' && fromCalc],
			[calcVersionBtn, name === 'version' && fromCalc]].forEach(function (pill) {
			pill[0].classList.toggle('is-open', pill[1]);
			pill[0].setAttribute('aria-expanded', pill[1] ? 'true' : 'false');
		});
	}

	function placeBelow() {
		if (openFlyoutName === null) return;
		var pill = openedFrom === 'calc' ? calcProfileBtn : profileBtn;
		var top = pill.offsetTop + pill.offsetHeight + FLYOUT_GAP;
		[profileFlyout, versionFlyout].forEach(function (flyout) {
			flyout.style.top = top + 'px';
			flyout.style.maxHeight = 'calc(100% - ' + top + 'px)';
		});
	}

	function closeFlyouts() {
		profileFlyout.hidden = true;
		versionFlyout.hidden = true;
		setActivePill(null);
		openFlyoutName = null;
	}

	function openFlyout(name, from) {
		openFlyoutName = name;
		openedFrom = from || openedFrom;
		if (name === 'version') {
			selectedVersion = null;
			notice = null;
		}
		var layer = openedFrom === 'calc' ? calcLayer : treeLayer;
		layer.appendChild(profileFlyout);
		layer.appendChild(versionFlyout);
		placeBelow();
		renderFlyout();
		profileFlyout.hidden = name !== 'profile';
		versionFlyout.hidden = name !== 'version';
		setActivePill(name);
	}

	function toggleFlyout(name, from) {
		var wasOpen = openFlyoutName === name && openedFrom === from;
		closeFlyouts();
		if (!wasOpen) openFlyout(name, from);
	}

	[[profileBtn, 'profile', 'tree'], [versionBtn, 'version', 'tree'], [calcProfileBtn, 'profile', 'calc'],
		[calcVersionBtn, 'version', 'calc']].forEach(function (p) {
		p[0].addEventListener('click', function (e) {
			e.stopPropagation();
			toggleFlyout(p[1], p[2]);
		});
	});

	document.querySelectorAll('[data-flyout-switch]').forEach(function (tab) {
		tab.addEventListener('click', function (e) {
			e.stopPropagation();
			var name = tab.getAttribute('data-flyout-switch');
			if (openFlyoutName !== name) openFlyout(name);
		});
	});

	document.querySelectorAll('[data-flyout-close]').forEach(function (btn) {
		btn.addEventListener('click', function (e) {
			e.stopPropagation();
			closeFlyouts();
		});
	});

	[profileFlyout, versionFlyout].forEach(function (flyout) {
		flyout.addEventListener('click', function (e) { e.stopPropagation(); });
	});

	document.addEventListener('click', function () {
		if (openFlyoutName !== null) closeFlyouts();
	});

	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && openFlyoutName !== null) closeFlyouts();
	});

	window.addEventListener('resize', placeBelow);

	return {
		renderFlyout: renderFlyout,
		updatePillLabels: updatePillLabels,
		resetVersionView: resetVersionView
	};
})(NovaDM.Model, NovaDM.History, NovaDM.VersionGraph, NovaDM.Render, NovaDM.EditorForm, NovaDM.Util);
