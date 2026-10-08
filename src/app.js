window.NovaDM = window.NovaDM || {};

/**
 * App shell: top-level tab switching, the layout toggle, the zoom controls,
 * and opening the example tree on start. Runs last, after every other
 * src/ module.
 */
(function (Render, TreeIO) {
	'use strict';

	var ZOOM_STEP = 10;
	var RESET_ZOOM = 50;
	var DIRECTORY_ZOOM = 100;

	/* ---------- Top-level tabs ---------- */

	var tabs = document.querySelectorAll('.tab');
	var panels = document.querySelectorAll('.tab-panel');

	function activateTab(name) {
		tabs.forEach(function (tab) {
			var isActive = tab.dataset.tab === name;
			tab.classList.toggle('active', isActive);
			tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
		});
		panels.forEach(function (panel) { panel.hidden = panel.id !== name; });
	}

	tabs.forEach(function (tab) {
		tab.addEventListener('click', function () { activateTab(tab.dataset.tab); });
	});

	document.getElementById('view-full-analysis-btn').addEventListener('click', function () {
		activateTab('scenario-space');
	});

	/* ---------- Tree layout ---------- */

	var layoutButtons = document.querySelectorAll('.toggle-btn');

	layoutButtons.forEach(function (btn) {
		btn.addEventListener('click', function () {
			layoutButtons.forEach(function (b) { b.classList.toggle('active', b === btn); });
			Render.setLayout(btn.dataset.layout);
			Render.renderTree();
			if (btn.dataset.layout === 'traditional') Render.fitTraditionalView();
			else Render.setZoom(DIRECTORY_ZOOM);
		});
	});

	/* ---------- Zoom ---------- */

	document.getElementById('zoom-in-btn').addEventListener('click', function () {
		Render.setZoom(Render.getZoom() + ZOOM_STEP);
	});

	document.getElementById('zoom-out-btn').addEventListener('click', function () {
		Render.setZoom(Render.getZoom() - ZOOM_STEP);
	});

	document.getElementById('zoom-reset-btn').addEventListener('click', function () {
		Render.setZoom(RESET_ZOOM);
	});

	/* ---------- Start ---------- */

	TreeIO.newDocument(TreeIO.sampleSpecs() || []);
})(NovaDM.Render, NovaDM.TreeIO);
