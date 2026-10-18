window.NovaDM = window.NovaDM || {};

/**
 * Draws the live tree into #tree-viewport-content, in the directory or the
 * traditional layout, updates the live scenario space size, and owns the
 * tree's zoom. Also holds the node badge/chip helpers other modules reuse.
 */
NovaDM.Render = (function (Model, Util) {
	'use strict';

	var MIN_ZOOM = 30;
	var MAX_ZOOM = 200;
	var MIN_FIT_ZOOM = 50;
	var SCIENTIFIC_FROM = 1e6;

	var escapeHtml = Util.escapeHtml;

	var treeContent = document.getElementById('tree-viewport-content');
	var exportBtn = document.getElementById('export-tree-btn');
	var scenarioSizeEl = document.getElementById('scenario-space-size-value');
	var constraintWarningEl = document.getElementById('constraint-warning');
	var sourceEl = document.getElementById('tree-source');
	var zoomLabel = document.getElementById('zoom-label');

	var currentLayout = 'directory';
	var zoomPercent = 100;

	/* ---------- Node parts shared by both layouts ---------- */

	var COLOR_CLASSES = { Subject: 'subject', Feature: 'feature', Approach: 'approach' };

	function colorClassFor(node) { return COLOR_CLASSES[node.nodeClass] || 'neutral'; }

	function badgeHtml(node) {
		var symbol = node.kind === 'AND' ? '+' : '−';
		return '<span class="node-badge ' + colorClassFor(node) + '">' + symbol + '</span>';
	}

	function kindLabelHtml(node) {
		return '<span class="node-kind-label ' + colorClassFor(node) + '">' + (node.nodeClass || node.kind) + '</span>';
	}

	function disclosureHtml(node) {
		var hasChildren = node.children.length > 0;
		var arrow = hasChildren ? (node.expanded ? '▾' : '▸') : '';
		return '<button type="button" class="disclosure' + (hasChildren ? '' : ' leaf') + '"' +
			' data-toggle="' + escapeHtml(node.id) + '">' + arrow + '</button>';
	}

	function valueChipHtml(node, value) {
		var state = Model.getValueConstraint(node.id, value);
		var text = escapeHtml(value);
		return '<button type="button" class="value-chip ' + state + '"' +
			' data-value-toggle="' + escapeHtml(node.id) + '" data-value="' + text + '"' +
			' title="Click to cycle this option: default / always / never"' +
			' aria-label="Constraint for option ' + text + ': ' + state + '">' + text + '</button>';
	}

	function valueChipsHtml(node) {
		return node.value.map(function (v) { return valueChipHtml(node, v); }).join('; ');
	}

	function valuesHtml(node) {
		if (!Model.hasOptions(node)) return escapeHtml(Model.formatValues(node.value));
		return '(' + valueChipsHtml(node) + ')';
	}

	function detailHtml(node, standalone) {
		if (node.label) {
			var showValue = node.value.length > 0 && !(standalone && Model.hasOptions(node));
			return '<span class="node-text">' + (standalone ? '' : ': ') + escapeHtml(node.label) +
				(showValue ? ' <span class="node-value">= ' + valuesHtml(node) + '</span>' : '') + '</span>';
		}
		if (node.children.length > 0) return standalone ? '' : '<span class="node-placeholder"> </span>';
		return '<span class="node-placeholder">' + (standalone ? '' : ' – ') + 'untitled, click to edit</span>';
	}

	function constraintDotHtml(node, reserveSpace) {
		if (!Model.isConstrainable(node)) return reserveSpace ? '<span class="constraint-dot-spacer"></span>' : '';
		var state = Model.getNodeConstraint(node.id);
		return '<button type="button" class="constraint-dot ' + state + '"' +
			' data-constraint-toggle="' + escapeHtml(node.id) + '"' +
			' title="Profile constraint: click to cycle default / always / never"' +
			' aria-label="Profile constraint for this node"></button>';
	}

	function deleteLabel(node) {
		var n = node.children.length;
		return 'Delete node' + (n ? ' & ' + n + ' child' + (n > 1 ? 'ren' : '') : '');
	}

	function trashIconHtml() {
		return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
			' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
			'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
	}

	function deleteButtonHtml(node) {
		var title = escapeHtml(deleteLabel(node));
		return '<button type="button" class="node-delete-btn" data-delete-node="' + escapeHtml(node.id) + '"' +
			' title="' + title + '" aria-label="' + title + '">' + trashIconHtml() + '</button>';
	}

	/* ---------- The tree ---------- */

	function setLayout(layout) {
		currentLayout = layout === 'traditional' ? 'traditional' : 'directory';
	}

	function emptyTreeHtml() {
		return '<div class="root-drop-zone" data-root-drop="true" title="The tree needs one root node"></div>' +
			'<div class="empty-tree-message">No nodes yet.<br>Drag an AND or XOR node from the editor panel' +
			' to create the root node, or click "Load example tree" / "Import tree…".</div>';
	}

	function scenarioSizeText(size) {
		if (size < SCIENTIFIC_FROM) return size.toLocaleString('en-GB');
		if (!isFinite(size)) return '> 10^308';
		var parts = size.toExponential(2).split('e');
		return parts[0] + ' × 10^' + Number(parts[1]);
	}

	function scenarioSizeHtml(size) {
		return Util.escapeHtml(scenarioSizeText(size)).replace(/\^(\d+)$/, '<sup>$1</sup>');
	}

	function renderTree() {
		var nodes = Model.root.children;
		var isEmpty = nodes.length === 0;
		var size = Model.scenarioSpaceSize();

		scenarioSizeEl.innerHTML = scenarioSizeHtml(size);
		constraintWarningEl.hidden = isEmpty || size !== 0;
		exportBtn.disabled = isEmpty;
		treeContent.classList.toggle('empty-hint', isEmpty);
		treeContent.classList.toggle('tt-mode', currentLayout === 'traditional' && !isEmpty);

		if (isEmpty) treeContent.innerHTML = emptyTreeHtml();
		else if (currentLayout === 'traditional') treeContent.innerHTML = traditionalHtml(nodes);
		else treeContent.innerHTML = '<ul class="tree-list">' + nodes.map(directoryNodeHtml).join('') + '</ul>';

		sourceEl.textContent = Model.getSource();
		sourceEl.hidden = !Model.getSource();
		highlightSelected();
		if (NovaDM.CalculationsTab) NovaDM.CalculationsTab.treeChanged();
		recordChange();
	}

	function highlightSelected() {
		var selectedId = Model.getSelectedId();
		treeContent.querySelectorAll('.tree-row').forEach(function (row) {
			row.classList.toggle('selected', row.getAttribute('data-id') === selectedId);
		});
	}

	function recordChange() {
		if (NovaDM.Undo) NovaDM.Undo.record();
	}

	/* ---------- Zoom ---------- */

	function setZoom(percent) {
		zoomPercent = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, percent));
		treeContent.style.zoom = zoomPercent / 100;
		zoomLabel.textContent = zoomPercent + '%';
	}

	function getZoom() { return zoomPercent; }

	function fitTraditionalView() {
		var canvas = treeContent.querySelector('.tt-canvas');
		if (currentLayout !== 'traditional' || !canvas) return;
		treeContent.style.zoom = 1;
		var style = getComputedStyle(treeContent);
		var availW = treeContent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
		var availH = treeContent.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
		var k = Math.min(availW / canvas.offsetWidth, availH / canvas.offsetHeight, 1);
		setZoom(Math.max(MIN_FIT_ZOOM, Math.floor(k * 20) * 5));
		treeContent.scrollLeft = (treeContent.scrollWidth - treeContent.clientWidth) / 2;
		treeContent.scrollTop = 0;
	}

	/* ---------- Directory layout ---------- */

	function directoryNodeHtml(node) {
		var html = '<li class="tree-node">' +
			'<div class="tree-row" data-id="' + escapeHtml(node.id) + '" draggable="true">' +
			constraintDotHtml(node, true) +
			disclosureHtml(node) +
			badgeHtml(node) +
			kindLabelHtml(node) +
			detailHtml(node, false) +
			deleteButtonHtml(node) +
			'</div>';
		if (node.expanded && node.children.length > 0) {
			html += '<ul class="tree-children">' + node.children.map(directoryNodeHtml).join('') + '</ul>';
		}
		return html + '</li>';
	}

	/* ---------- Traditional layout ---------- */

	var TT_SLOT_WIDTH = 240;
	var TT_ROW_HEIGHT = 120;
	var TT_BOX_WIDTH = 200;
	var TT_BOX_HEIGHT = 56;
	var TT_VALUE_LINE = 20;
	var TT_BOTTOM_MARGIN = 20;

	function boxHeight(node) {
		return TT_BOX_HEIGHT + (Model.hasOptions(node) ? node.value.length * TT_VALUE_LINE : 0);
	}

	function layoutTraditional(topNodes) {
		var positions = {};
		var nextSlot = 0;
		var maxDepth = 0;
		var tallestAtDepth = {};

		function visit(node, depth) {
			maxDepth = Math.max(maxDepth, depth);
			tallestAtDepth[depth] = Math.max(tallestAtDepth[depth] || 0, boxHeight(node));
			var x;
			if (node.expanded && node.children.length > 0) {
				var childXs = node.children.map(function (c) { return visit(c, depth + 1); });
				x = (childXs[0] + childXs[childXs.length - 1]) / 2;
			} else {
				x = nextSlot * TT_SLOT_WIDTH + TT_SLOT_WIDTH / 2;
				nextSlot++;
			}
			positions[node.id] = { x: x, depth: depth };
			return x;
		}

		topNodes.forEach(function (n) { visit(n, 0); });

		var rowGap = TT_ROW_HEIGHT - TT_BOX_HEIGHT;
		var yAtDepth = { 0: 0 };
		for (var d = 1; d <= maxDepth; d++) yAtDepth[d] = yAtDepth[d - 1] + tallestAtDepth[d - 1] + rowGap;
		Object.keys(positions).forEach(function (id) { positions[id].y = yAtDepth[positions[id].depth]; });

		return {
			positions: positions,
			width: Math.max(nextSlot * TT_SLOT_WIDTH, TT_SLOT_WIDTH),
			height: yAtDepth[maxDepth] + tallestAtDepth[maxDepth] + TT_BOTTOM_MARGIN
		};
	}

	function plainNodeText(node) {
		var text = node.nodeClass || node.kind;
		if (!node.label) return text;
		text += ': ' + node.label;
		if (Model.hasOptions(node)) {
			node.value.forEach(function (v) {
				var state = Model.getValueConstraint(node.id, v);
				text += '\n  • ' + v + (state === 'default' ? '' : ' [' + state + ']');
			});
		} else if (node.value.length) {
			text += ' = ' + Model.formatValues(node.value);
		}
		return text;
	}

	function traditionalBoxHtml(node, pos) {
		var detail = detailHtml(node, true);
		var style = 'left:' + (pos.x - TT_BOX_WIDTH / 2) + 'px; top:' + pos.y + 'px; width:' + TT_BOX_WIDTH + 'px;' +
			' height:' + boxHeight(node) + 'px;';
		var html = '<div class="tree-row tt-node-box" data-id="' + escapeHtml(node.id) + '" draggable="true"' +
			' title="' + escapeHtml(plainNodeText(node)) + '" style="' + style + '">' +
			'<div class="tt-node-top">' +
			constraintDotHtml(node, false) +
			(node.children.length > 0 ? disclosureHtml(node) : '') +
			badgeHtml(node) +
			kindLabelHtml(node) +
			'</div>';
		if (detail) html += '<div class="tt-node-bottom">' + detail + '</div>';
		if (Model.hasOptions(node)) {
			html += '<div class="tt-node-values">' + node.value.map(function (v) {
				return '<div class="tt-value-line">' + valueChipHtml(node, v) + '</div>';
			}).join('') + '</div>';
		}
		return html + deleteButtonHtml(node) + '</div>';
	}

	function traditionalHtml(topNodes) {
		var layout = layoutTraditional(topNodes);
		var edges = [];
		var boxes = [];

		function visit(node) {
			var pos = layout.positions[node.id];
			boxes.push(traditionalBoxHtml(node, pos));
			if (!node.expanded) return;
			node.children.forEach(function (child) {
				var childPos = layout.positions[child.id];
				edges.push('<line class="tt-edge" x1="' + pos.x + '" y1="' + (pos.y + boxHeight(node)) + '"' +
					' x2="' + childPos.x + '" y2="' + childPos.y + '" />');
				visit(child);
			});
		}

		topNodes.forEach(visit);

		return '<div class="tt-canvas" style="width:' + layout.width + 'px; height:' + layout.height + 'px;">' +
			'<svg class="tt-edges" width="' + layout.width + '" height="' + layout.height + '">' +
			edges.join('') +
			'</svg>' +
			boxes.join('') +
			'</div>';
	}

	return {
		treeContent: treeContent,
		badgeHtml: badgeHtml,
		valueChipsHtml: valueChipsHtml,
		deleteLabel: deleteLabel,
		trashIconHtml: trashIconHtml,
		scenarioSizeText: scenarioSizeText,
		scenarioSizeHtml: scenarioSizeHtml,
		renderTree: renderTree,
		recordChange: recordChange,
		setLayout: setLayout,
		setZoom: setZoom,
		getZoom: getZoom,
		fitTraditionalView: fitTraditionalView
	};
})(NovaDM.Model, NovaDM.Util);
