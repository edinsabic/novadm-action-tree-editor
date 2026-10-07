window.NovaDM = window.NovaDM || {};

/**
 * App shell: top-level tab switching, the layout toggle, zoom controls,
 * and the initial render. Runs last, after every other src/ module.
 */
(function (Model, History, Render, EditorForm, Popovers) {
	'use strict';

	/* ---------- Top-level tab switching ---------- */
	var tabs = document.querySelectorAll('.tab');
	var panels = document.querySelectorAll('.tab-panel');
	function activateTab(name) {
		tabs.forEach(function (t) {
			var isActive = t.dataset.tab === name;
			t.classList.toggle('active', isActive);
			t.setAttribute('aria-selected', isActive ? 'true' : 'false');
		});
		panels.forEach(function (p) { p.hidden = p.id !== name; });
	}
	tabs.forEach(function (tab) {
		tab.addEventListener('click', function () {
			activateTab(tab.dataset.tab);
		});
	});

	document.querySelectorAll('.toggle-btn').forEach(function (btn) {
		if (btn.disabled) return;
		btn.addEventListener('click', function () {
			document.querySelectorAll('.toggle-btn').forEach(function (b) { b.classList.remove('active'); });
			btn.classList.add('active');
			Render.setLayout(btn.dataset.layout);
			Render.renderTree();
		});
	});

	/* ---------- Zoom ---------- */
	var treeContent = Render.treeContent;
	var zoomLabel = document.getElementById('zoom-label');
	var zoomPercent = 100; /* CSS `zoom` (not `transform: scale`) scales everything inside treeContent as one unit. */

	function applyZoom() { treeContent.style.zoom = zoomPercent / 100; zoomLabel.textContent = zoomPercent + '%'; }
	document.getElementById('zoom-in-btn').addEventListener('click', function () { zoomPercent = Math.min(200, zoomPercent + 10); applyZoom(); });
	document.getElementById('zoom-out-btn').addEventListener('click', function () { zoomPercent = Math.max(30, zoomPercent - 10); applyZoom(); });
	document.getElementById('zoom-reset-btn').addEventListener('click', function () { zoomPercent = 100; applyZoom(); });

	document.getElementById('view-full-analysis-btn').addEventListener('click', function () {
		activateTab('scenario-space');
	});

	/* ---------- Initial render: pre-load the example tree (if available) ---------- */
	if (typeof NOVADM_SAMPLE_TREE !== 'undefined') {
		Model.root.children = NOVADM_SAMPLE_TREE.map(Model.instantiateNode);
	}
	History.reset();
	Render.renderTree();
	EditorForm.renderEditorForm();
	Popovers.renderFlyout();
	Popovers.updatePillLabels();
})(NovaDM.Model, NovaDM.History, NovaDM.Render, NovaDM.EditorForm, NovaDM.Popovers);
