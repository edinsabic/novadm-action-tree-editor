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

	function own(obj, key) {
		return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
	}

	function setOwn(obj, key, value) {
		Object.defineProperty(obj, key, { value: value, writable: true, enumerable: true, configurable: true });
		return value;
	}

	function sortedJson(value) {
		return JSON.stringify(value, function (key, v) {
			if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
			var sorted = {};
			Object.keys(v).sort().forEach(function (k) { setOwn(sorted, k, v[k]); });
			return sorted;
		});
	}

	function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

	return {
		escapeHtml: escapeHtml,
		shorten: shorten,
		clone: clone,
		own: own,
		setOwn: setOwn,
		sortedJson: sortedJson,
		plural: plural
	};
})();
