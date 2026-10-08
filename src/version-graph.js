window.NovaDM = window.NovaDM || {};

/**
 * Draws the version graph (a small left-to-right DAG) as plain SVG, with
 * click-to-select, drag-to-pan and scroll-to-zoom. No libraries, version
 * histories are tiny.
 */
NovaDM.VersionGraph = (function () {
	'use strict';

	var COL = 120;
	var ROW = 64;
	var RADIUS = 9;
	var RADIUS_HEAD = 11;
	var LABEL_DY = 27;
	var MIN_ZOOM = 0.3;
	var MAX_ZOOM = 3;
	var NOMINAL_W = 520;
	var NOMINAL_H = 280;
	var DRAG_THRESHOLD = 4;

	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	function shorten(text) { return text.length > 16 ? text.slice(0, 15) + '\u2026' : text; }
	function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

	function layout(nodes) {
		var byId = {};
		var items = nodes.map(function (n, i) {
			var item = { node: n, index: i, parents: [] };
			byId[n.id] = item;
			return item;
		});
		items.forEach(function (it) {
			it.parents = it.node.parents.filter(function (p) { return byId[p] && p !== it.node.id; });
		});

		var depth = {}, visiting = {};
		function depthOf(id) {
			if (depth[id] !== undefined) return depth[id];
			if (visiting[id]) return 0;
			visiting[id] = true;
			var d = 0;
			byId[id].parents.forEach(function (p) { d = Math.max(d, depthOf(p) + 1); });
			visiting[id] = false;
			depth[id] = d;
			return d;
		}
		items.forEach(function (it) { it.depth = depthOf(it.node.id); });

		var order = items.slice().sort(function (a, b) { return a.depth - b.depth || a.index - b.index; });
		var firstChildTaken = {};
		var nextLane = 0;
		order.forEach(function (it) {
			var p = it.parents[0];
			if (p !== undefined && !firstChildTaken[p]) {
				it.lane = byId[p].lane;
				firstChildTaken[p] = true;
			} else {
				it.lane = nextLane++;
			}
		});

		var maxDepth = 0;
		items.forEach(function (it) {
			it.x = it.depth * COL;
			it.y = it.lane * ROW;
			maxDepth = Math.max(maxDepth, it.depth);
		});
		return { items: items, byId: byId, maxDepth: maxDepth, lanes: Math.max(nextLane, 1) };
	}

	function radiusOf(item) { return item.node.isHead ? RADIUS_HEAD : RADIUS; }

	function edgeSvg(from, to) {
		var x1 = from.x + radiusOf(from) + 1;
		var x2 = to.x - radiusOf(to) - 3;
		var y1 = from.y, y2 = to.y;
		var merged = to.parents.length > 1;
		var d = y1 === y2
			? 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2
			: 'M' + x1 + ' ' + y1 + ' C' + (x1 + (x2 - x1) / 2) + ' ' + y1 + ', ' + (x1 + (x2 - x1) / 2) + ' ' + y2 + ', ' + x2 + ' ' + y2;
		return '<path class="vg-edge' + (merged ? ' merged' : '') + '" d="' + d + '" marker-end="url(#' + (merged ? 'vg-arrow-merged' : 'vg-arrow') + ')"/>';
	}

	function nodeSvg(item, selectedId) {
		var n = item.node;
		var cls = 'vg-node' + (n.isHead ? ' current' : '') + (n.isBranch ? ' branch' : '') + (n.id === selectedId ? ' selected' : '');
		var ring = n.isHead && n.isDirty ? '<circle class="vg-dirty" r="' + (RADIUS_HEAD + 4) + '"/>' : '';
		return '<g class="vg-node-g" data-vid="' + esc(n.id) + '" transform="translate(' + item.x + ' ' + item.y + ')">' +
			ring + '<circle class="' + cls + '" r="' + radiusOf(item) + '"/>' +
			'<text class="vg-label' + (n.isHead ? ' current' : '') + '" y="' + LABEL_DY + '" text-anchor="middle">' + esc(shorten(n.id)) + '</text>' +
			'<title>' + esc(n.id) + '</title></g>';
	}

	var observers = new WeakMap();

	function create(container, nodes, options) {
		var selectedId = options.selectedId;
		var lay = layout(nodes);

		var edges = [];
		lay.items.forEach(function (to) {
			to.parents.forEach(function (p) { edges.push(edgeSvg(lay.byId[p], to)); });
		});

		container.innerHTML =
			'<svg class="vg-svg" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">' +
			'<defs>' +
			'<marker id="vg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="vg-arrowhead" d="M0,0 L10,5 L0,10 z"/></marker>' +
			'<marker id="vg-arrow-merged" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="vg-arrowhead merged" d="M0,0 L10,5 L0,10 z"/></marker>' +
			'</defs>' +
			'<g class="vg-world">' + edges.join('') + lay.items.map(function (it) { return nodeSvg(it, selectedId); }).join('') + '</g>' +
			'</svg>';

		var svg = container.querySelector('svg');
		var world = container.querySelector('.vg-world');
		var restore = !!options.view && !options.view.auto;
		var view = restore ? { k: options.view.k, tx: options.view.tx, ty: options.view.ty } : { k: 1, tx: 0, ty: 0 };
		var auto = !restore;
		var lastW = container.clientWidth, lastH = container.clientHeight;

		function apply() {
			world.setAttribute('transform', 'translate(' + view.tx + ' ' + view.ty + ') scale(' + view.k + ')');
			if (options.onViewChange) options.onViewChange(getView());
		}

		function getView() { return { k: view.k, tx: view.tx, ty: view.ty, auto: auto }; }

		function fit() {
			auto = true;
			var w = container.clientWidth || NOMINAL_W;
			var h = container.clientHeight || NOMINAL_H;
			lastW = container.clientWidth; lastH = container.clientHeight;
			var minX = -56, maxX = lay.maxDepth * COL + 56;
			var minY = -RADIUS_HEAD - 4, maxY = (lay.lanes - 1) * ROW + LABEL_DY + 8;
			var bw = maxX - minX, bh = maxY - minY;
			view.k = clamp(Math.min((w - 24) / bw, (h - 24) / bh, 1.3), MIN_ZOOM, MAX_ZOOM);
			view.tx = (w - bw * view.k) / 2 - minX * view.k;
			view.ty = (h - bh * view.k) / 2 - minY * view.k;
			apply();
		}

		function setSelected(id) {
			selectedId = id;
			svg.querySelectorAll('.vg-node-g').forEach(function (g) {
				g.querySelector('.vg-node').classList.toggle('selected', g.getAttribute('data-vid') === id);
			});
		}

		/* ---------- Interaction: click, drag to pan, wheel to zoom ---------- */
		var down = null; /* { x, y, tx, ty, id, moved } */

		svg.addEventListener('pointerdown', function (e) {
			var g = e.target.closest ? e.target.closest('.vg-node-g') : null;
			down = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, id: g ? g.getAttribute('data-vid') : null, moved: false };
			if (svg.setPointerCapture) { try { svg.setPointerCapture(e.pointerId); } catch (err) { } }
		});
		svg.addEventListener('pointermove', function (e) {
			if (!down) return;
			var dx = e.clientX - down.x, dy = e.clientY - down.y;
			if (!down.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
			down.moved = true;
			auto = false;
			svg.classList.add('panning');
			view.tx = down.tx + dx;
			view.ty = down.ty + dy;
			apply();
		});
		function release() {
			if (!down) return;
			var wasClick = !down.moved && down.id !== null;
			var id = down.id;
			down = null;
			svg.classList.remove('panning');
			if (wasClick) options.onSelect(id);
		}
		svg.addEventListener('pointerup', release);
		svg.addEventListener('pointercancel', function () { down = null; svg.classList.remove('panning'); });

		function zoomAt(px, py, factor) {
			var k = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM);
			view.tx = px - (px - view.tx) * (k / view.k);
			view.ty = py - (py - view.ty) * (k / view.k);
			view.k = k;
			auto = false;
			apply();
		}

		svg.addEventListener('wheel', function (e) {
			e.preventDefault();
			var rect = svg.getBoundingClientRect();
			zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
		}, { passive: false });

		function zoomBy(factor) { zoomAt((container.clientWidth || NOMINAL_W) / 2, (container.clientHeight || NOMINAL_H) / 2, factor); }

		if (observers.has(container)) observers.get(container).disconnect();
		if (typeof ResizeObserver === 'function') {
			var observer = new ResizeObserver(function () {
				var w = container.clientWidth, h = container.clientHeight;
				if (!w || !h) return;
				if (auto) fit();
				else if (lastW && lastH) {
					view.tx += (w - lastW) / 2;
					view.ty += (h - lastH) / 2;
					lastW = w; lastH = h;
					apply();
				} else { lastW = w; lastH = h; }
			});
			observer.observe(container);
			observers.set(container, observer);
		}

		if (restore) apply(); else fit();
		return { setSelected: setSelected, fit: fit, zoomBy: zoomBy, getView: getView };
	}

	return { create: create };
})();
