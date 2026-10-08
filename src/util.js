window.NovaDM = window.NovaDM || {};

/**
 * Small helpers shared by several modules. No DOM and no editor state here.
 */
NovaDM.Util = (function () {
	'use strict';

	var HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

	function escapeHtml(text) {
		return String(text).replace(/[&<>"']/g, function (c) { return HTML_ESCAPES[c]; });
	}

	function shorten(text, max) {
		return text.length > max ? text.slice(0, max - 1) + '\u2026' : text;
	}

	function clone(value) {
		return JSON.parse(JSON.stringify(value));
	}

	return {
		escapeHtml: escapeHtml,
		shorten: shorten,
		clone: clone
	};
})();
