window.NovaDM = window.NovaDM || {};

/**
 * Profile / version-history flyout, opened from the pill buttons in the
 * control row above the tree.
 */
NovaDM.Popovers = (function () {
	'use strict';

	var profileBtn = document.getElementById('profile-btn');
	var versionBtn = document.getElementById('version-btn');
	var flyout = document.getElementById('flyout');
	var flyoutTabs = flyout.querySelectorAll('.flyout-tab');
	var flyoutPanes = flyout.querySelectorAll('.flyout-pane');
	var openPopover = null;

	function showFlyoutTab(name) {
		flyoutTabs.forEach(function (t) {
			var isActive = t.dataset.flyoutTab === name;
			t.classList.toggle('active', isActive);
			t.setAttribute('aria-selected', isActive ? 'true' : 'false');
		});
		flyoutPanes.forEach(function (p) { p.hidden = p.dataset.flyoutPane !== name; });
	}

	function setActivePill(name) {
		profileBtn.classList.toggle('is-open', name === 'profile');
		versionBtn.classList.toggle('is-open', name === 'version');
		profileBtn.setAttribute('aria-expanded', name === 'profile' ? 'true' : 'false');
		versionBtn.setAttribute('aria-expanded', name === 'version' ? 'true' : 'false');
	}

	function closeAllPopovers() {
		flyout.hidden = true;
		setActivePill(null);
		openPopover = null;
	}

	function togglePopover(name) {
		if (openPopover === name) {
			closeAllPopovers();
			return;
		}
		openPopover = name;
		showFlyoutTab(name);
		flyout.hidden = false;
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

	flyoutTabs.forEach(function (t) {
		t.addEventListener('click', function (e) {
			e.stopPropagation();
			openPopover = t.dataset.flyoutTab;
			showFlyoutTab(openPopover);
			setActivePill(openPopover);
		});
	});

	document.getElementById('flyout-close-btn').addEventListener('click', function (e) {
		e.stopPropagation();
		closeAllPopovers();
	});

	flyout.addEventListener('click', function (e) { e.stopPropagation(); });

	document.addEventListener('click', function () {
		if (openPopover !== null) closeAllPopovers();
	});
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && openPopover !== null) closeAllPopovers();
	});

	return {};
})();
