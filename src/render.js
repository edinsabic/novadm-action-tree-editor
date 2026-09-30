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

	function nodeLabelHtml(node) {
		var cls = colorClassFor(node);
		var parts = '<span class="node-kind-label ' + cls + '">' + (node.nodeClass || node.kind) + '</span>';
		if (node.label) {
			parts += '<span class="node-text">: ' + escapeHtml(node.label) +
				(node.value.length ? ' <span class="node-value">= ' + escapeHtml(Model.formatValues(node.value)) + '</span>' : '') + '</span>';
		} else if (node.children.length > 0) {
			parts += '<span class="node-placeholder"> </span>';
		} else {
			parts += '<span class="node-placeholder"> – untitled, click to edit</span>';
		}
		return parts;
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

	function renderTree() {
		var root = Model.root;
		var html = '<div class="root-drop-zone" data-root-drop="true" title="The project root is an implicit ' + Model.TOP_LEVEL_KIND + ' node, so top-level nodes must be ' + Model.TOP_LEVEL_KIND + '"></div>';
		treeContent.classList.toggle('empty-hint', root.children.length === 0);
		exportBtn.disabled = root.children.length === 0;
		if (scenarioSizeEl) scenarioSizeEl.textContent = Model.scenarioSpaceSize();
		if (root.children.length === 0) {
			html += '<div style="text-align:center; color:var(--color-ink-muted); padding: 20px 0;">No nodes yet.<br>Drag an ' + Model.TOP_LEVEL_KIND + ' node from the editor panel (the project root is an implicit ' + Model.TOP_LEVEL_KIND + ', so top-level nodes are always ' + Model.TOP_LEVEL_KIND + '), or click "Load example tree" / "Import tree\u2026".</div>';
		} else {
			html += '<ul class="tree-list">' + root.children.map(renderNode).join('') + '</ul>';
		}
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

	function highlightSelected() {
		var selectedId = Model.getSelectedId();
		treeContent.querySelectorAll('.tree-row').forEach(function (row) {
			row.classList.toggle('selected', row.getAttribute('data-id') === selectedId);
		});
	}

	return {
		treeContent: treeContent,
		badgeHtml: badgeHtml,
		escapeHtml: escapeHtml,
		renderTree: renderTree,
		highlightSelected: highlightSelected
	};
})(NovaDM.Model);
