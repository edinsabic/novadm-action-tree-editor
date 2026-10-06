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
	function valueChipsHtml(node, interactive) {
		return node.value.map(function (v) {
			var state = Model.getValueConstraint(node.id, v); // 'default' | 'always' | 'never'
			if (!interactive) return '<span class="value-chip ' + state + '">' + escapeHtml(v) + '</span>';
			return '<button type="button" class="value-chip ' + state + '" data-value-toggle="' + node.id + '" data-value="' + escapeHtml(v) + '"' +
				' title="Click to cycle this option: default / always / never" aria-label="Constraint for option ' + escapeHtml(v) + ': ' + state + '">' + escapeHtml(v) + '</button>';
		}).join('; ');
	}

	/** A node with several values is drawn as (chip; chip; ...). A single value (e.g. a Subject's name) stays plain text. */
	function valuesHtml(node, interactive) {
		if (node.value.length < 2) return escapeHtml(Model.formatValues(node.value));
		return '(' + valueChipsHtml(node, interactive) + ')';
	}

	function detailHtml(node, standalone) {
		if (node.label) {
			return '<span class="node-text">' + (standalone ? '' : ': ') + escapeHtml(node.label) +
				(node.value.length ? ' <span class="node-value">= ' + valuesHtml(node, !standalone) + '</span>' : '') + '</span>';
		} else if (node.children.length > 0) {
			return standalone ? '' : '<span class="node-placeholder"> </span>';
		} else {
			return '<span class="node-placeholder">' + (standalone ? '' : ' \u2013 ') + 'untitled, click to edit</span>';
		}
	}

	function nodeLabelHtml(node) {
		return kindLabelHtml(node) + detailHtml(node, false);
	}

	function constraintDotHtml(node) {
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

	function renderTree() {
		var root = Model.root;
		treeContent.classList.toggle('empty-hint', root.children.length === 0);
		exportBtn.disabled = root.children.length === 0;
		if (scenarioSizeEl) scenarioSizeEl.textContent = Model.scenarioSpaceSize();
		
		var html;
		if (root.children.length === 0) {
			html = '<div class="root-drop-zone" data-root-drop="true" title="The project root is an implicit ' + Model.TOP_LEVEL_KIND + ' node, so top-level nodes must be ' + Model.TOP_LEVEL_KIND + '"></div>' +
				'<div style="text-align:center; color:var(--color-ink-muted); padding: 20px 0;">No nodes yet.<br>Drag an ' + Model.TOP_LEVEL_KIND + ' node from the editor panel (the project root is an implicit ' + Model.TOP_LEVEL_KIND + ', so top-level nodes are always ' + Model.TOP_LEVEL_KIND + '), or click "Load example tree" / "Import tree\u2026".</div>';
		} else if (currentLayout === 'traditional') {
			html = renderTraditionalCanvas(root.children); // includes its own root-dot drop zone
		} else {
			html = '<div class="root-drop-zone" data-root-drop="true" title="The project root is an implicit ' + Model.TOP_LEVEL_KIND + ' node, so top-level nodes must be ' + Model.TOP_LEVEL_KIND + '"></div>' +
				'<ul class="tree-list">' + root.children.map(renderNode).join('') + '</ul>';
		}
		treeContent.classList.toggle('tt-mode', currentLayout === 'traditional' && root.children.length > 0);
		treeContent.innerHTML = html;
		highlightSelected();
	}

	function renderNode(node) {
		var hasChildren = node.children.length > 0;
		var html = '<li class="tree-node" data-id="' + node.id + '">';
		html += '<div class="tree-row" data-id="' + node.id + '" draggable="true">';
		html += constraintDotHtml(node);
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
	var TT_BOX_HEIGHT = 56; /* Must match the fixed height in editor.css's .tt-node-box, so edges meet the box exactly. */

	function layoutTraditional(topNodes) {
		var positions = {};
		var nextSlot = 0;
		var maxDepth = 0;

		function visit(node, depth) {
			maxDepth = Math.max(maxDepth, depth);
			var showChildren = node.expanded && node.children.length > 0;
			var x;
			if (!showChildren) {
				x = nextSlot * TT_SLOT_WIDTH + TT_SLOT_WIDTH / 2;
				nextSlot++;
			} else {
				var childXs = node.children.map(function (c) { return visit(c, depth + 1); });
				x = (childXs[0] + childXs[childXs.length - 1]) / 2;
			}
			positions[node.id] = { x: x, y: depth * TT_ROW_HEIGHT };
			return x;
		}

		var topXs = topNodes.map(function (n) { return visit(n, 1); });
		positions.__root__ = { x: (topXs[0] + topXs[topXs.length - 1]) / 2, y: 0 };

		return {
			positions: positions,
			width: Math.max(nextSlot * TT_SLOT_WIDTH, TT_SLOT_WIDTH),
			height: (maxDepth + 1) * TT_ROW_HEIGHT + TT_BOX_HEIGHT + 20
		};
	}

	function plainNodeText(node) {
		var text = node.nodeClass || node.kind;
		if (node.label) {
			text += ': ' + node.label;
			if (node.value.length) text += ' = ' + Model.formatValues(node.value);
		}
		return text;
	}

	function renderTraditionalCanvas(topNodes) {
		var layout = layoutTraditional(topNodes);
		var rootPos = layout.positions.__root__;
		var edges = [];
		var boxes = [];

		function visitRender(node) {
			var pos = layout.positions[node.id];
			var hasChildren = node.children.length > 0;
			var detail = detailHtml(node, true);
			boxes.push(
				'<div class="tree-row tt-node-box" data-id="' + node.id + '" draggable="true" title="' + escapeHtml(plainNodeText(node)) + '" style="left:' + (pos.x - TT_BOX_WIDTH / 2) + 'px; top:' + pos.y + 'px; width:' + TT_BOX_WIDTH + 'px;">' +
					'<div class="tt-node-top">' +
						constraintDotHtml(node) +
						(hasChildren ? '<button class="disclosure" data-toggle="' + node.id + '">' + (node.expanded ? '\u25BE' : '\u25B8') + '</button>' : '') +
						badgeHtml(node) + kindLabelHtml(node) +
					'</div>' +
					(detail ? '<div class="tt-node-bottom">' + detail + '</div>' : '') +
				'</div>'
			);
			if (hasChildren && node.expanded) {
				node.children.forEach(function (child) {
					var childPos = layout.positions[child.id];
					edges.push('<line class="tt-edge" x1="' + pos.x + '" y1="' + (pos.y + TT_BOX_HEIGHT) + '" x2="' + childPos.x + '" y2="' + childPos.y + '" />');
					visitRender(child);
				});
			}
		}

		topNodes.forEach(function (node) {
			var pos = layout.positions[node.id];
			edges.push('<line class="tt-edge" x1="' + rootPos.x + '" y1="' + rootPos.y + '" x2="' + pos.x + '" y2="' + pos.y + '" />');
			visitRender(node);
		});

		return '<div class="tt-canvas" style="width:' + layout.width + 'px; height:' + layout.height + 'px;">' +
			'<svg class="tt-edges" width="' + layout.width + '" height="' + layout.height + '">' + edges.join('') + '</svg>' +
			'<div class="tt-root-dot" data-root-drop="true" title="The project root is an implicit ' + Model.TOP_LEVEL_KIND + ' node, so top-level nodes must be ' + Model.TOP_LEVEL_KIND + '" style="left:' + rootPos.x + 'px; top:' + rootPos.y + 'px;"></div>' +
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
