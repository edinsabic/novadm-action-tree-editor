window.NovaDM = window.NovaDM || {};

/**
 * Draws the version graph (a small left-to-right DAG) as plain SVG, with
 * click-to-select, drag-to-pan and scroll-to-zoom. No libraries: version
 * histories are tiny.
 */
NovaDM.VersionGraph = (function (Util) {
	'use strict';

	var COL = 120;
	var ROW = 64;
	var RADIUS = 9;
	var RADIUS_HEAD = 11;
	var DIRTY_RING_RADIUS = RADIUS_HEAD + 4;
	var LABEL_DY = 27;
	var MAX_LABEL_CHARS = 16;
	var LABEL_HALF_WIDTH = 56;
	var FIT_PADDING = 24;
	var MAX_FIT_ZOOM = 1.3;
	var MIN_ZOOM = 0.3;
	var MAX_ZOOM = 3;
	var NOMINAL_W = 520;
	var NOMINAL_H = 280;
	var DRAG_THRESHOLD = 4;
	var WHEEL_ZOOM_SPEED = 0.0015;
	var BEND_WIDTH = COL - 2 * RADIUS - 4;

	var escapeHtml = Util.escapeHtml;
	var observer = null;

	function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

	/* ---------- Layout ---------- */

	/**
	 * Column = longest path from a root; lane = the first child continues its parent's lane,
	 * every other child starts a new one.
	 */
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

		var depth = {};
		var visiting = {};
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

	/* ---------- SVG ---------- */

	function radiusOf(item) { return item.node.isHead ? RADIUS_HEAD : RADIUS; }

	function curveTo(x1, y1, x2, y2) {
		var midX = x1 + (x2 - x1) / 2;
		return ' C' + midX + ' ' + y1 + ', ' + midX + ' ' + y2 + ', ' + x2 + ' ' + y2;
	}

	function isLaneFree(lay, lane, fromDepth, toDepth) {
		return !lay.items.some(function (it) {
			return it.lane === lane && it.depth > fromDepth && it.depth < toDepth;
		});
	}

	function edgePath(lay, from, to) {
		var x1 = from.x + radiusOf(from) + 1;
		var x2 = to.x - radiusOf(to) - 3;
		var y1 = from.y;
		var y2 = to.y;
		var path = 'M' + x1 + ' ' + y1;
		if (y1 === y2) return path + ' L' + x2 + ' ' + y2;
		if (isLaneFree(lay, from.lane, from.depth, to.depth)) {
			var bendX = Math.max(x1, x2 - BEND_WIDTH);
			return path + ' L' + bendX + ' ' + y1 + curveTo(bendX, y1, x2, y2);
		}
		if (isLaneFree(lay, to.lane, from.depth, to.depth)) {
			var endX = Math.min(x2, x1 + BEND_WIDTH);
			return path + curveTo(x1, y1, endX, y2) + ' L' + x2 + ' ' + y2;
		}
		return path + curveTo(x1, y1, x2, y2);
	}

	function edgeSvg(lay, from, to) {
		var merged = to.parents.length > 1;
		return '<path class="vg-edge' + (merged ? ' merged' : '') + '" d="' + edgePath(lay, from, to) + '"' +
			' marker-end="url(#' + (merged ? 'vg-arrow-merged' : 'vg-arrow') + ')"/>';
	}

	function nodeSvg(item, selectedId) {
		var n = item.node;
		var cls = 'vg-node' + (n.isHead ? ' current' : '') + (n.isBranch ? ' branch' : '') +
			(n.id === selectedId ? ' selected' : '');
		var ring = n.isHead && n.isDirty ? '<circle class="vg-dirty" r="' + DIRTY_RING_RADIUS + '"/>' : '';
		return '<g class="vg-node-g" data-vid="' + escapeHtml(n.id) + '"' +
			' transform="translate(' + item.x + ' ' + item.y + ')">' +
			ring +
			'<circle class="' + cls + '" r="' + radiusOf(item) + '"/>' +
			'<text class="vg-label' + (n.isHead ? ' current' : '') + '" y="' + LABEL_DY + '" text-anchor="middle">' +
			escapeHtml(Util.shorten(n.id, MAX_LABEL_CHARS)) + '</text>' +
			'<title>' + escapeHtml(n.id) + '</title>' +
			'</g>';
	}

	function arrowMarkerSvg(id, extraClass) {
		return '<marker id="' + id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"' +
			' orient="auto"><path class="vg-arrowhead' + extraClass + '" d="M0,0 L10,5 L0,10 z"/></marker>';
	}

	/* ---------- The graph ---------- */

	/**
	 * Draws `nodes` ({ id, parents, isHead, isBranch, isDirty }) into `container`.
	 * options: selectedId, view (a previous getView() result, to keep the pan/zoom),
	 * onSelect(id), onViewChange(view).
	 */
	function create(container, nodes, options) {
		var selectedId = options.selectedId;
		var lay = layout(nodes);

		var edges = [];
		lay.items.forEach(function (to) {
			to.parents.forEach(function (p) { edges.push(edgeSvg(lay, lay.byId[p], to)); });
		});
		var nodesSvg = lay.items.map(function (it) { return nodeSvg(it, selectedId); });

		container.innerHTML =
			'<svg class="vg-svg" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">' +
			'<defs>' + arrowMarkerSvg('vg-arrow', '') + arrowMarkerSvg('vg-arrow-merged', ' merged') + '</defs>' +
			'<g class="vg-world">' + edges.join('') + nodesSvg.join('') + '</g>' +
			'</svg>';

		var svg = container.querySelector('svg');
		var world = container.querySelector('.vg-world');
		var restore = !!options.view && !options.view.auto;
		var view = restore
			? { k: options.view.k, tx: options.view.tx, ty: options.view.ty }
			: { k: 1, tx: 0, ty: 0 };
		var auto = !restore;
		var lastW = container.clientWidth;
		var lastH = container.clientHeight;

		function getView() { return { k: view.k, tx: view.tx, ty: view.ty, auto: auto }; }

		function apply() {
			world.setAttribute('transform', 'translate(' + view.tx + ' ' + view.ty + ') scale(' + view.k + ')');
			if (options.onViewChange) options.onViewChange(getView());
		}

		function fit() {
			auto = true;
			var w = container.clientWidth || NOMINAL_W;
			var h = container.clientHeight || NOMINAL_H;
			lastW = container.clientWidth;
			lastH = container.clientHeight;
			var minX = -LABEL_HALF_WIDTH;
			var maxX = lay.maxDepth * COL + LABEL_HALF_WIDTH;
			var minY = -DIRTY_RING_RADIUS;
			var maxY = (lay.lanes - 1) * ROW + LABEL_DY + 8;
			var bw = maxX - minX;
			var bh = maxY - minY;
			var k = Math.min((w - FIT_PADDING) / bw, (h - FIT_PADDING) / bh, MAX_FIT_ZOOM);
			view.k = clamp(k, MIN_ZOOM, MAX_ZOOM);
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

		function zoomAt(px, py, factor) {
			var k = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM);
			view.tx = px - (px - view.tx) * (k / view.k);
			view.ty = py - (py - view.ty) * (k / view.k);
			view.k = k;
			auto = false;
			apply();
		}

		function zoomBy(factor) {
			zoomAt((container.clientWidth || NOMINAL_W) / 2, (container.clientHeight || NOMINAL_H) / 2, factor);
		}

		var down = null;

		svg.addEventListener('pointerdown', function (e) {
			var g = e.target.closest('.vg-node-g');
			down = {
				x: e.clientX,
				y: e.clientY,
				tx: view.tx,
				ty: view.ty,
				id: g ? g.getAttribute('data-vid') : null,
				moved: false
			};
			try {
				svg.setPointerCapture(e.pointerId);
			} catch (err) {}
		});

		svg.addEventListener('pointermove', function (e) {
			if (!down) return;
			var dx = e.clientX - down.x;
			var dy = e.clientY - down.y;
			if (!down.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
			down.moved = true;
			auto = false;
			svg.classList.add('panning');
			view.tx = down.tx + dx;
			view.ty = down.ty + dy;
			apply();
		});

		svg.addEventListener('pointerup', function () {
			if (!down) return;
			var clickedId = down.moved ? null : down.id;
			down = null;
			svg.classList.remove('panning');
			if (clickedId !== null) options.onSelect(clickedId);
		});

		svg.addEventListener('pointercancel', function () {
			down = null;
			svg.classList.remove('panning');
		});

		svg.addEventListener('wheel', function (e) {
			e.preventDefault();
			var rect = svg.getBoundingClientRect();
			zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED));
		}, { passive: false });

		if (observer) observer.disconnect();
		observer = new ResizeObserver(function () {
			var w = container.clientWidth;
			var h = container.clientHeight;
			if (!w || !h) return;
			if (auto) {
				fit();
				return;
			}
			if (lastW && lastH) {
				view.tx += (w - lastW) / 2;
				view.ty += (h - lastH) / 2;
				apply();
			}
			lastW = w;
			lastH = h;
		});
		observer.observe(container);

		if (restore) apply();
		else fit();

		return { setSelected: setSelected, fit: fit, zoomBy: zoomBy };
	}

	return { create: create };
})(NovaDM.Util);
