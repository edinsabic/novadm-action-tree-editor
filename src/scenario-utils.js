/**
 * Scenario-space utilities.
 *
 * countScenarios follows the same recursive rule described in the NovaDM
 * literature: for an AND node, multiply the scenario counts of its children (all must be chosen);
 * for an XOR node, sum them (exactly one is chosen). A leaf counts as 1.
 */
(function (global) {
  'use strict';

  const { NodeType } = global.NovaDM.model;

  function countScenarios(node) {
    if (!node.children.length) return 1;
    const counts = node.children.map(countScenarios);
    if (node.nodeType === NodeType.AND) {
      return counts.reduce((a, b) => a * b, 1);
    }
    return counts.reduce((a, b) => a + b, 0);
  }

  function countLeaves(node) {
    if (!node.children.length) return 1;
    return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
  }

  function countNodes(node) {
    return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0);
  }

  global.NovaDM.scenarioUtils = { countScenarios, countLeaves, countNodes };
})(typeof window !== 'undefined' ? window : globalThis);
