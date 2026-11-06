window.NovaDM = window.NovaDM || {};

/**
 * App shell: top-level tab switching, the Quick start and the Documentation,
 * the layout toggle, the zoom controls, and opening the example tree on start.
 * Runs last, after every other src/ module.
 */
(function (Render, TreeIO, CalculationsTab, Popovers) {
	'use strict';

	var ZOOM_STEP = 10;
	var TRADITIONAL_ZOOM = 50;
	var DIRECTORY_ZOOM = 100;
	var DOCUMENTATION = 'tutorial';
	var SECTION_TOP_SLACK = 24;

	/* ---------- Top-level tabs ---------- */

	var tabs = document.querySelectorAll('.tab');
	var panels = document.querySelectorAll('.tab-panel');
	var guideButtons = document.querySelectorAll('[data-guide]');
	var lastTab = 'action-tree';

	function activateTab(name) {
		tabs.forEach(function (tab) {
			var isActive = tab.dataset.tab === name;
			tab.classList.toggle('active', isActive);
			tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
		});
		panels.forEach(function (panel) { panel.hidden = panel.id !== name; });
		var isGuide = false;
		guideButtons.forEach(function (btn) {
			var isOpen = btn.dataset.guide === name;
			if (isOpen) isGuide = true;
			btn.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
		});
		if (name === DOCUMENTATION) markCurrentSection();
		if (isGuide) return;
		lastTab = name;
		if (name === 'calculations') CalculationsTab.render();
		else Render.treeShown();
		Popovers.placeFlyouts();
	}

	tabs.forEach(function (tab) {
		tab.addEventListener('click', function () { activateTab(tab.dataset.tab); });
	});

	document.getElementById('open-calculations-btn').addEventListener('click', function () {
		activateTab('calculations');
	});

	/* ---------- Quick start and Documentation ---------- */

	var tutorialText = document.getElementById('tutorial-text');
	var contentsLinks = document.querySelectorAll('.tutorial-contents a');
	var clickedLink = null;

	function markLink(href) {
		contentsLinks.forEach(function (link) {
			link.classList.toggle('current', link.getAttribute('href') === href);
		});
	}

	function markCurrentSection() {
		if (clickedLink) {
			markLink(clickedLink);
			clickedLink = null;
			return;
		}
		var line = tutorialText.getBoundingClientRect().top + SECTION_TOP_SLACK;
		var atEnd = tutorialText.scrollTop > 0 &&
			tutorialText.scrollTop + tutorialText.clientHeight >= tutorialText.scrollHeight - 1;
		var current = null;
		tutorialText.querySelectorAll('section').forEach(function (section) {
			if (!current || atEnd || section.getBoundingClientRect().top <= line) current = section;
		});
		markLink('#' + current.id);
	}

	function keepFlyoutsOpen(e) {
		e.stopPropagation();
	}

	guideButtons.forEach(function (btn) {
		btn.addEventListener('click', function (e) {
			keepFlyoutsOpen(e);
			var guide = btn.dataset.guide;
			activateTab(document.getElementById(guide).hidden ? guide : lastTab);
		});
	});

	document.querySelectorAll('.tutorial-panel').forEach(function (panel) {
		panel.addEventListener('click', keepFlyoutsOpen);
	});

	document.querySelectorAll('[data-guide-close]').forEach(function (btn) {
		btn.addEventListener('click', function () { activateTab(lastTab); });
	});

	document.getElementById('quick-start-to-documentation').addEventListener('click', function (e) {
		e.preventDefault();
		activateTab(DOCUMENTATION);
	});

	tutorialText.addEventListener('scroll', markCurrentSection);

	document.querySelector('.tutorial-contents').addEventListener('click', function (e) {
		var link = e.target.closest('a');
		if (!link) return;
		clickedLink = link.getAttribute('href');
		markLink(clickedLink);
	});

	/* ---------- Documentation search ---------- */

	var searchBox = document.getElementById('tutorial-search');
	var searchCount = document.getElementById('tutorial-search-count');
	var canHighlight = typeof Highlight === 'function' && !!(window.CSS && CSS.highlights);
	var matches = [];
	var matchIndex = 0;
	var searchableText = null;

	function foldedChar(ch) {
		return ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
			.replace(/[‘’]/g, '\'')
			.replace(/[“”]/g, '"')
			.replace(/[‐-―−]/g, '-');
	}

	function addFolded(out, text, node) {
		for (var i = 0; i < text.length; i++) {
			var space = /\s/.test(text[i]);
			if (space && out.chars.charAt(out.chars.length - 1) === ' ') continue;
			var piece = space ? ' ' : foldedChar(text[i]);
			for (var j = 0; j < piece.length; j++) out.at.push({ node: node, offset: i });
			out.chars += piece;
		}
		return out;
	}

	function blockOf(node) {
		var el = node.parentElement;
		while (el !== tutorialText && getComputedStyle(el).display === 'inline') el = el.parentElement;
		return el;
	}

	function documentationText() {
		if (searchableText) return searchableText;
		var out = { chars: '', at: [] };
		var block = null;
		var walker = document.createTreeWalker(tutorialText, NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) {
			var here = blockOf(walker.currentNode);
			if (here !== block) {
				out.chars += '\n';
				out.at.push(null);
				block = here;
			}
			addFolded(out, walker.currentNode.textContent, walker.currentNode);
		}
		searchableText = out;
		return out;
	}

	function findMatches(query) {
		var needle = addFolded({ chars: '', at: [] }, query.trim()).chars;
		var found = [];
		if (!needle) return found;
		var text = documentationText();
		for (var i = text.chars.indexOf(needle); i !== -1; i = text.chars.indexOf(needle, i + needle.length)) {
			var first = text.at[i];
			var last = text.at[i + needle.length - 1];
			var range = document.createRange();
			range.setStart(first.node, first.offset);
			range.setEnd(last.node, last.offset + 1);
			found.push(range);
		}
		return found;
	}

	function highlight(name, ranges) {
		var marks = new Highlight();
		ranges.forEach(function (range) { marks.add(range); });
		CSS.highlights.set(name, marks);
	}

	function showMatch() {
		var current = matches[matchIndex];
		if (canHighlight) {
			highlight('tutorial-match', matches);
			highlight('tutorial-current', current ? [current] : []);
		}
		searchCount.textContent = current ? (matchIndex + 1) + ' of ' + matches.length
			: searchBox.value.trim() ? 'No matches' : '';
		if (!current) return;
		var box = current.getBoundingClientRect();
		var view = tutorialText.getBoundingClientRect();
		if (box.top < view.top || box.bottom > view.bottom) {
			tutorialText.scrollTop += box.top - view.top - tutorialText.clientHeight / 3;
		}
	}

	searchBox.addEventListener('input', function () {
		matches = findMatches(searchBox.value);
		matchIndex = 0;
		showMatch();
	});

	searchBox.addEventListener('keydown', function (e) {
		if (e.key !== 'Enter' || matches.length === 0) return;
		e.preventDefault();
		matchIndex = (matchIndex + (e.shiftKey ? matches.length - 1 : 1)) % matches.length;
		showMatch();
	});

	/* ---------- Tree layout ---------- */

	var layoutButtons = document.querySelectorAll('.toggle-btn[data-layout]');

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
		var activeLayout = document.querySelector('.toggle-btn.active[data-layout]').dataset.layout;
		Render.setZoom(activeLayout === 'traditional' ? TRADITIONAL_ZOOM : DIRECTORY_ZOOM);
	});

	/* ---------- Start ---------- */

	TreeIO.loadExample(true);
})(NovaDM.Render, NovaDM.TreeIO, NovaDM.CalculationsTab, NovaDM.Popovers);
