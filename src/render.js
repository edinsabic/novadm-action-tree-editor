window.NovaDM = window.NovaDM || {};

/**
 * Renders the live tree (directory layout) into #tree-viewport-content,
 * and the shared HTML-escaping/badge helpers other modules reuse.
 */
NovaDM.Render = (function (Model) {
	'use strict';

	var treeContent = document.getElementById('tree-viewport-content');
	var exportBtn = document.getElementById('export-tree-btn');
	var scenarioSizeEl = document.getElementById('scenario-space-size-value');

	/**
	 * Badge/label colour is driven by the node's domain class, NOT by
	 * AND/XOR: Subject / Feature / Approach each get their own colour; a
	 * node with no class set yet renders neutral (black). Kind (AND/XOR)
	 * only sets the +/− symbol.
	 */
	function colorClassFor(node) {
		if (node.nodeClass === 'Subject') return 'subject';
		if (node.nodeClass === 'Feature') return 'feature';
		if (node.nodeClass === 'Approach') return 'approach';
		return 'neutral';
	}
	function badgeHtml(node) {
		var cls = colorClassFor(node);
		var symbol = node.kind === 'AND' ? '+' : '\u2212';
		return '<span class="node-badge ' + cls + '">' + symbol + '</span>';
	}

	function kindLabelHtml(node) {
		var cls = colorClassFor(node);
		return '<span class="node-kind-label ' + cls + '">' + (node.nodeClass || node.kind) + '</span>';
	}

	/**
	 * One chip per value. Interactive chips are buttons that cycle that value through
	 * default / always / never; read-only chips (traditional layout, where the box is too
	 * small to click into) show the same state as plain spans.
	 */
	function valueChipHtml(node, v, interactive) {
		var state = Model.getValueConstraint(node.id, v); // 'default' | 'always' | 'never'
		if (!interactive) return '<span class="value-chip ' + state + '">' + escapeHtml(v) + '</span>';
		return '<button type="button" class="value-chip ' + state + '" data-value-toggle="' + node.id + '" data-value="' + escapeHtml(v) + '"' +
			' title="Click to cycle this option: default / always / never" aria-label="Constraint for option ' + escapeHtml(v) + ': ' + state + '">' + escapeHtml(v) + '</button>';
	}

	function valueChipsHtml(node, interactive) {
		return node.value.map(function (v) { return valueChipHtml(node, v, interactive); }).join('; ');
	}

	/** A node with several values is drawn as (chip; chip; ...). A single value (e.g. a Subject's name) stays plain text. */
	function valuesHtml(node, interactive) {
		if (node.value.length < 2) return escapeHtml(Model.formatValues(node.value));
		return '(' + valueChipsHtml(node, interactive) + ')';
	}

	function detailHtml(node, standalone) {
		if (node.label) {
			return '<span class="node-text">' + (standalone ? '' : ': ') + escapeHtml(node.label) +
				(node.value.length && !(standalone && hasValueLines(node)) ? ' <span class="node-value">= ' + valuesHtml(node, true) + '</span>' : '') + '</span>';
		} else if (node.children.length > 0) {
			return standalone ? '' : '<span class="node-placeholder"> </span>';
		} else {
			return '<span class="node-placeholder">' + (standalone ? '' : ' \u2013 ') + 'untitled, click to edit</span>';
		}
	}

	function nodeLabelHtml(node) {
		return kindLabelHtml(node) + detailHtml(node, false);
	}

	/* Only constrainable nodes (see Model.isConstrainable) get a dot. In the directory layout the others get an
	   empty spacer so the rows stay aligned; the traditional boxes are centred, so they need no spacer. */
	function constraintDotHtml(node, reserveSpace) {
		if (!Model.isConstrainable(node)) return reserveSpace ? '<span class="constraint-dot-spacer"></span>' : '';
		var state = Model.getNodeConstraint(node.id); // 'default' | 'always' | 'never'
		return '<button type="button" class="constraint-dot ' + state + '" data-constraint-toggle="' + node.id +
			'" title="Profile constraint: click to cycle default / always / never" aria-label="Profile constraint for this node"></button>';
	}

	function escapeHtml(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}

	var currentLayout = 'directory';
	function setLayout(layout) { currentLayout = layout === 'traditional' ? 'traditional' : 'directory'; }
	function getLayout() { return currentLayout; }

	var constraintWarningEl = null;
	function constraintWarning() {
		if (constraintWarningEl) return constraintWarningEl;
		var el = document.getElementById('constraint-warning');
		if (!el) {
			el = document.createElement('div');
			el.id = 'constraint-warning';
			el.className = 'constraint-warning';
			el.setAttribute('role', 'alert');
			el.hidden = true;
			el.textContent = 'Warning: the applied constraints are contradictory.';
			var anchor = scenarioSizeEl ? (scenarioSizeEl.closest('.metric') || scenarioSizeEl.parentNode) : null;
			if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
			else treeContent.parentNode.insertBefore(el, treeContent);
		}
		constraintWarningEl = el;
		return el;
	}

	function renderTree() {
		var root = Model.root;
		treeContent.classList.toggle('empty-hint', root.children.length === 0);
		exportBtn.disabled = root.children.length === 0;
		var size = Model.scenarioSpaceSize();
		if (scenarioSizeEl) scenarioSizeEl.textContent = size;
		constraintWarning().hidden = size !== 0;

		var html;
		if (root.children.length === 0) {
			html = '<div class="root-drop-zone" data-root-drop="true" title="The tree needs one root node, and it must be ' + Model.TOP_LEVEL_KIND + '"></div>' +
				'<div style="text-align:center; color:var(--color-ink-muted); padding: 20px 0;">No nodes yet.<br>Drag an ' + Model.TOP_LEVEL_KIND + ' node from the editor panel to create the root node, or click "Load example tree" / "Import tree\u2026".</div>';
		} else if (currentLayout === 'traditional') {
			html = renderTraditionalCanvas(root.children);
		} else {
			html = '<ul class="tree-list">' + root.children.map(renderNode).join('') + '</ul>';
		}
		treeContent.classList.toggle('tt-mode', currentLayout === 'traditional' && root.children.length > 0);
		treeContent.innerHTML = html;
		highlightSelected();
	}

	function renderNode(node) {
		var hasChildren = node.children.length > 0;
		var html = '<li class="tree-node" data-id="' + node.id + '">';
		html += '<div class="tree-row" data-id="' + node.id + '" draggable="true">';
		html += constraintDotHtml(node, true);
		html += '<button class="disclosure' + (hasChildren ? '' : ' leaf') + '" data-toggle="' + node.id + '">' +
			(hasChildren ? (node.expanded ? '\u25BE' : '\u25B8') : '') + '</button>';
		html += badgeHtml(node);
		html += nodeLabelHtml(node);
		html += '</div>';
		if (hasChildren && node.expanded) {
			html += '<ul class="tree-children">' + node.children.map(renderNode).join('') + '</ul>';
		}
		html += '</li>';
		return html;
	}

	/**
	 * Traditional layout; Each node gets a real (x, y) pixel position.
	 */
	var TT_SLOT_WIDTH = 240; /* Horizontal space claimed per leaf. */
	var TT_ROW_HEIGHT = 120; /* Vertical space per depth level. */
	var TT_BOX_WIDTH = 200;
	var TT_BOX_HEIGHT = 56; /* Base box height (kind row + label row). Boxes with value lines grow taller; see boxHeight(). */
	var TT_VALUE_LINE = 20; /* Height of one value line: 18px chip (see .tt-value-line in editor.css) + 2px gap. */

	/* A node with several values lists each one on its own line under the label. */
	function hasValueLines(node) { return node.value.length > 1; }
	function boxHeight(node) { return TT_BOX_HEIGHT + (hasValueLines(node) ? node.value.length * TT_VALUE_LINE : 0); }

	function layoutTraditional(topNodes) {
		var positions = {};
		var nextSlot = 0;
		var maxDepth = 0;
		var tallestAtDepth = {}; /* depth -> height of the tallest box on that level */

		function visit(node, depth) {
			maxDepth = Math.max(maxDepth, depth);
			tallestAtDepth[depth] = Math.max(tallestAtDepth[depth] || 0, boxHeight(node));
			var showChildren = node.expanded && node.children.length > 0;
			var x;
			if (!showChildren) {
				x = nextSlot * TT_SLOT_WIDTH + TT_SLOT_WIDTH / 2;
				nextSlot++;
			} else {
				var childXs = node.children.map(function (c) { return visit(c, depth + 1); });
				x = (childXs[0] + childXs[childXs.length - 1]) / 2;
			}
			positions[node.id] = { x: x, depth: depth };
			return x;
		}

		topNodes.forEach(function (n) { visit(n, 0); }); /* the explicit root node is level 0 */

		/* Each level starts below the tallest box of the level above, keeping the usual gap between levels. */
		var rowGap = TT_ROW_HEIGHT - TT_BOX_HEIGHT;
		var yAtDepth = { 0: 0 };
		for (var d = 1; d <= maxDepth; d++) yAtDepth[d] = yAtDepth[d - 1] + tallestAtDepth[d - 1] + rowGap;
		Object.keys(positions).forEach(function (id) { positions[id].y = yAtDepth[positions[id].depth]; });

		return {
			positions: positions,
			width: Math.max(nextSlot * TT_SLOT_WIDTH, TT_SLOT_WIDTH),
			height: yAtDepth[maxDepth] + tallestAtDepth[maxDepth] + 20
		};
	}

	function plainNodeText(node) {
		var text = node.nodeClass || node.kind;
		if (node.label) {
			text += ': ' + node.label;
			if (hasValueLines(node)) {
				node.value.forEach(function (v) {
					var state = Model.getValueConstraint(node.id, v);
					text += '\n  \u2022 ' + v + (state === 'default' ? '' : ' [' + state + ']');
				});
			} else if (node.value.length) {
				text += ' = ' + Model.formatValues(node.value);
			}
		}
		return text;
	}

	function renderTraditionalCanvas(topNodes) {
		var layout = layoutTraditional(topNodes);
		var edges = [];
		var boxes = [];

		function visitRender(node) {
			var pos = layout.positions[node.id];
			var hasChildren = node.children.length > 0;
			var detail = detailHtml(node, true);
			boxes.push(
				'<div class="tree-row tt-node-box" data-id="' + node.id + '" draggable="true" title="' + escapeHtml(plainNodeText(node)) + '" style="left:' + (pos.x - TT_BOX_WIDTH / 2) + 'px; top:' + pos.y + 'px; width:' + TT_BOX_WIDTH + 'px; height:' + boxHeight(node) + 'px;">' +
					'<div class="tt-node-top">' +
						constraintDotHtml(node) +
						(hasChildren ? '<button class="disclosure" data-toggle="' + node.id + '">' + (node.expanded ? '\u25BE' : '\u25B8') + '</button>' : '') +
						badgeHtml(node) + kindLabelHtml(node) +
					'</div>' +
					(detail ? '<div class="tt-node-bottom">' + detail + '</div>' : '') +
					(hasValueLines(node) ? '<div class="tt-node-values">' + node.value.map(function (v) {
						return '<div class="tt-value-line">' + valueChipHtml(node, v, true) + '</div>';
					}).join('') + '</div>' : '') +
				'</div>'
			);
			if (hasChildren && node.expanded) {
				node.children.forEach(function (child) {
					var childPos = layout.positions[child.id];
					edges.push('<line class="tt-edge" x1="' + pos.x + '" y1="' + (pos.y + boxHeight(node)) + '" x2="' + childPos.x + '" y2="' + childPos.y + '" />');
					visitRender(child);
				});
			}
		}

		topNodes.forEach(visitRender);

		return '<div class="tt-canvas" style="width:' + layout.width + 'px; height:' + layout.height + 'px;">' +
			'<svg class="tt-edges" width="' + layout.width + '" height="' + layout.height + '">' + edges.join('') + '</svg>' +
			boxes.join('') +
		'</div>';
	}

	function highlightSelected() {
		var selectedId = Model.getSelectedId();
		treeContent.querySelectorAll('.tree-row').forEach(function (row) {
			row.classList.toggle('selected', row.getAttribute('data-id') === selectedId);
		});
	}

	return {
		treeContent: treeContent,
		badgeHtml: badgeHtml,
		valueChipsHtml: valueChipsHtml,
		escapeHtml: escapeHtml,
		renderTree: renderTree,
		highlightSelected: highlightSelected,
		setLayout: setLayout,
		getLayout: getLayout
	};
})(NovaDM.Model);
