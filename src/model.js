/**
 * NovaDM data model.
 *
 * Deliberately plain objects rather than classes, the parser and renderer
 * only need a shared shape, not behaviour. Mirrors the Subject/Feature/
 * Approach/Action split used in the NovaDM literature.
 */
(function (global) {
  'use strict';

  const NodeType = Object.freeze({ AND: 'AND', XOR: 'XOR' });

  let idCounter = 0;

  /**
   * @param {Object} options
   * @param {string} [options.name] - internal/debug label
   * @param {'AND'|'XOR'} [options.nodeType]
   * @param {'subject'|'feature'|'approach'|'root'|null} [options.kind]
   * @param {string|null} [options.label] - human-readable text shown on canvas
   */
  function createNode({ name = '', nodeType = NodeType.AND, kind = null, label = null } = {}) {
    idCounter += 1;
    return {
      id: idCounter,
      name,
      nodeType,
      kind,
      label,
      children: [],
      parent: null,
      depth: 0,
      // _x / _y are populated later by layout.js; not part of the semantic model
      _x: 0,
      _y: 0,
    };
  }

  function resetIdCounter() {
    idCounter = 0;
  }

  function addChild(parent, child) {
    child.parent = parent;
    child.depth = parent.depth + 1;
    parent.children.push(child);
    return parent;
  }

  global.NovaDM = global.NovaDM || {};
  global.NovaDM.model = { NodeType, createNode, addChild, resetIdCounter };
})(typeof window !== 'undefined' ? window : globalThis);
