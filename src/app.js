window.NovaDM = window.NovaDM || {};

/**
 * App shell: top-level tab switching, the tutorial and its invite, the
 * layout toggle, the zoom controls, and opening the example tree on start.
 * Runs last, after every other src/ module.
 */
(function (Render, TreeIO, CalculationsTab, Popovers) {
	'use strict';

	var ZOOM_STEP = 10;
	var TRADITIONAL_ZOOM = 50;
	var DIRECTORY_ZOOM = 100;
	var TUTORIAL = 'tutorial';
	var INVITE_HIDDEN_KEY = 'novadm-tutorial-invite-hidden';
	var SECTION_TOP_SLACK = 24;

	/* ---------- Top-level tabs ---------- */

	var tabs = document.querySelectorAll('.tab');
	var panels = document.querySelectorAll('.tab-panel');
	var tutorialBtn = document.getElementById('tutorial-btn');
	var lastTab = 'action-tree';

	function activateTab(name) {
		tabs.forEach(function (tab) {
			var isActive = tab.dataset.tab === name;
			tab.classList.toggle('active', isActive);
			tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
		});
		panels.forEach(function (panel) { panel.hidden = panel.id !== name; });
		tutorialBtn.setAttribute('aria-pressed', name === TUTORIAL ? 'true' : 'false');
		if (name === TUTORIAL) {
			markCurrentSection();
			return;
		}
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

	/* ---------- Tutorial ---------- */

	var tutorialPanel = document.getElementById(TUTORIAL);
	var tutorialText = document.getElementById('tutorial-text');
	var invite = document.getElementById('tutorial-invite');
	var contentsLinks = document.querySelectorAll('.tutorial-contents a');
	var clickedLink = null;

	function inviteDismissed() {
		try {
			return localStorage.getItem(INVITE_HIDDEN_KEY) === '1';
		} catch (e) {
			return false;
		}
	}

	function dismissInvite() {
		invite.hidden = true;
		try {
			localStorage.setItem(INVITE_HIDDEN_KEY, '1');
		} catch (e) {}
	}

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

	tutorialBtn.addEventListener('click', function (e) {
		keepFlyoutsOpen(e);
		dismissInvite();
		activateTab(tutorialPanel.hidden ? TUTORIAL : lastTab);
	});

	tutorialPanel.addEventListener('click', keepFlyoutsOpen);

	document.getElementById('tutorial-close').addEventListener('click', function () {
		activateTab(lastTab);
	});

	document.getElementById('tutorial-invite-close').addEventListener('click', dismissInvite);

	tutorialText.addEventListener('scroll', markCurrentSection);

	document.querySelector('.tutorial-contents').addEventListener('click', function (e) {
		var link = e.target.closest('a');
		if (!link) return;
		clickedLink = link.getAttribute('href');
		markLink(clickedLink);
	});

	invite.hidden = inviteDismissed();

	/* ---------- Tutorial search ---------- */

	var searchBox = document.getElementById('tutorial-search');
	var searchCount = document.getElementById('tutorial-search-count');
	var canHighlight = typeof Highlight === 'function' && !!(window.CSS && CSS.highlights);
	var matches = [];
	var matchIndex = 0;

	function folded(text) {
		var chars = '';
		var at = [];
		for (var i = 0; i < text.length; i++) {
			var space = /\s/.test(text[i]);
			if (space && i > 0 && /\s/.test(text[i - 1])) continue;
			chars += space ? ' ' : text[i].toLowerCase();
			at.push(i);
		}
		return { chars: chars, at: at };
	}

	function findMatches(query) {
		var needle = folded(query.trim()).chars;
		var found = [];
		if (!needle) return found;
		var walker = document.createTreeWalker(tutorialText, NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) {
			var node = walker.currentNode;
			var text = folded(node.textContent);
			for (var i = text.chars.indexOf(needle); i !== -1; i = text.chars.indexOf(needle, i + needle.length)) {
				var range = document.createRange();
				range.setStart(node, text.at[i]);
				range.setEnd(node, text.at[i + needle.length - 1] + 1);
				found.push(range);
			}
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
