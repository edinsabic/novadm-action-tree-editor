/**
 * Tree layout, built on D3's hierarchy/tree layout (d3 loaded globally via
 * a <script> tag, see editor/index.html). 
 * Positions are written back onto the original node objects (as _x / _y) so canvas.js doesn't need to know
 * anything about d3.hierarchy's wrapper nodes.
 */
(function (global) {
  'use strict';

  function computeLayout(root, { nodeWidth = 170, nodeHeight = 56, siblingGap = 26, levelGap = 50 } = {}) {
    const hierarchy = d3.hierarchy(root);
    const treeLayout = d3.tree().nodeSize([nodeWidth + siblingGap, nodeHeight + levelGap]);
    treeLayout(hierarchy);

    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    hierarchy.each((d) => {
      if (d.x < minX) minX = d.x;
      if (d.x > maxX) maxX = d.x;
      if (d.y > maxY) maxY = d.y;
    });

    const margin = 30;
    const offsetX = -minX + nodeWidth / 2 + margin;

    hierarchy.each((d) => {
      d.data._x = d.x + offsetX;
      d.data._y = d.y + nodeHeight / 2 + margin;
    });

    return {
      width: (maxX - minX) + nodeWidth + margin * 2,
      height: maxY + nodeHeight + margin * 2,
    };
  }

  global.NovaDM = global.NovaDM || {};
  global.NovaDM.layout = { computeLayout };
})(typeof window !== 'undefined' ? window : globalThis);
