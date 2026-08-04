/**
 * Renders a parsed action tree into an SVG inside the given container,
 * using d3 for layout math, selections, and zoom/pan behaviour.
 */
(function (global) {
  'use strict';

  function nodeClass(node) {
    const kind = node.kind || 'structural';
    return `ndm-node ndm-node--${node.nodeType.toLowerCase()} ndm-node--${kind}`;
  }

  function nodeText(node) {
    if (node.label) return node.label;
    return node.nodeType === 'XOR' ? 'choose one of' : 'all of';
  }

  function flatten(node, list = []) {
    list.push(node);
    node.children.forEach((child) => flatten(child, list));
    return list;
  }

  function collectEdges(node, list = []) {
    node.children.forEach((child) => {
      list.push({ source: node, target: child });
      collectEdges(child, list);
    });
    return list;
  }

  function render(container, root, opts = {}) {
    const nodeWidth = opts.nodeWidth || 170;
    const nodeHeight = opts.nodeHeight || 56;

    container.innerHTML = '';

    const { width, height } = global.NovaDM.layout.computeLayout(root, { nodeWidth, nodeHeight });

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${Math.max(width, 200)} ${Math.max(height, 200)}`);

    const zoomLayer = svg.append('g').attr('class', 'ndm-zoom-layer');

    svg.call(
      d3
        .zoom()
        .scaleExtent([0.25, 2.5])
        .on('zoom', (event) => zoomLayer.attr('transform', event.transform))
    );

    const nodes = flatten(root);
    const links = collectEdges(root);

    zoomLayer
      .append('g')
      .attr('class', 'ndm-edges')
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('class', 'ndm-edge')
      .attr('d', (d) => {
        const sx = d.source._x;
        const sy = d.source._y + nodeHeight / 2;
        const tx = d.target._x;
        const ty = d.target._y - nodeHeight / 2;
        const midY = (sy + ty) / 2;
        return `M${sx},${sy} C${sx},${midY} ${tx},${midY} ${tx},${ty}`;
      });

    const nodeGroups = zoomLayer
      .append('g')
      .attr('class', 'ndm-nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', nodeClass)
      .attr('transform', (d) => `translate(${d._x - nodeWidth / 2}, ${d._y - nodeHeight / 2})`);

    nodeGroups
      .append('rect')
      .attr('width', nodeWidth)
      .attr('height', nodeHeight)
      .attr('rx', 8);

    nodeGroups
      .append('text')
      .attr('class', 'ndm-node-symbol')
      .attr('x', 8)
      .attr('y', 14)
      .text((d) => (d.nodeType === 'XOR' ? '\u2212 XOR (choose one)' : '+ AND (all apply)'));

    nodeGroups
      .append('foreignObject')
      .attr('x', 6)
      .attr('y', 18)
      .attr('width', nodeWidth - 12)
      .attr('height', nodeHeight - 22)
      .append('xhtml:div')
      .attr('class', 'ndm-node-label')
      .text(nodeText);

    return { width, height };
  }

  global.NovaDM = global.NovaDM || {};
  global.NovaDM.canvas = { render };
})(typeof window !== 'undefined' ? window : globalThis);
