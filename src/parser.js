/**
 * Parser for the .ndm action tree format.
 *
 * Grammar (informal):
 *   line      := indent ('+' | '-') '[' content ']'
 *   content   := '' | plain | expansion
 *   plain     := kind ':' rest                     e.g. "subject: architectural_element = roof"
 *   expansion := kind ':' name '=' '(' opt (';' opt)* ')'
 *                                                    e.g. "feature: roof_ventilation = (open; closed)"
 *   kind      := 'subject' | 'feature' | 'approach'
 *
 * '+' marks an AND node, '-' marks an XOR node.
 * Indentation depth (leading whitespace) determines
 * parent/child nesting, same convention as a directory tree.
 *
 * An expansion line produces one wrapper node plus one leaf child per
 * semicolon-separated option. An empty bracket, e.g. "-[]", is valid and
 * produces a bare structural node with no subject/feature/approach label,
 * used purely to fork the tree.
 */
(function (global) {
  'use strict';

  const { NodeType, createNode, addChild, resetIdCounter } = global.NovaDM.model;

  const LINE_RE = /^(\s*)([+-])\[(.*?)\]\s*$/;
  const EXPANSION_RE = /^([^:]+):\s*([^=]+?)\s*=\s*\((.+)\)$/;
  const PLAIN_RE = /^([^:]+):\s*(.+)$/;

  /**
   * @param {string} text - raw .ndm file content
   * @returns {{ root: object, warnings: string[] }}
   */
  function parseNdm(text) {
    resetIdCounter();
    const root = createNode({
      name: 'ROOT',
      nodeType: NodeType.AND,
      kind: 'root',
      label: 'Renovation project (all subjects)',
    });
    const stack = [{ indent: -1, node: root }];
    const warnings = [];

    const lines = String(text).split('\n');

    lines.forEach((rawLine, i) => {
      const line = rawLine.replace(/\r$/, '');
      if (!line.trim()) return;

      const match = LINE_RE.exec(line);
      if (!match) {
        warnings.push(`Line ${i + 1}: could not parse "${line.trim()}", skipped.`);
        return;
      }

      const [, indentStr, symbol, rawContent] = match;
      const indent = indentStr.length;
      const nodeType = symbol === '+' ? NodeType.AND : NodeType.XOR;
      const content = rawContent.trim();

      let node;
      let extraChildren = [];

      if (content === '') {
        node = createNode({ nodeType });
      } else {
        const expansion = EXPANSION_RE.exec(content);
        if (expansion) {
          const kind = expansion[1].trim().toLowerCase();
          const name = expansion[2].trim();
          const valuesRaw = expansion[3];
          node = createNode({ name: `${kind}: ${name}`, nodeType, kind, label: name });
          extraChildren = valuesRaw
            .split(';')
            .map((v) => v.trim())
            .filter(Boolean)
            .map((opt) =>
              createNode({
                name: opt,
                nodeType: NodeType.AND,
                kind,
                label: `${name} = ${opt}`,
              })
            );
        } else {
          const plain = PLAIN_RE.exec(content);
          if (plain) {
            const kind = plain[1].trim().toLowerCase();
            const label = plain[2].trim();
            node = createNode({ name: `${kind}: ${label}`, nodeType, kind, label });
          } else {
            warnings.push(`Line ${i + 1}: unrecognised bracket content "${content}", kept as plain text.`);
            node = createNode({ name: content, nodeType, label: content });
          }
        }
      }

      while (stack.length && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      const parentEntry = stack[stack.length - 1];
      addChild(parentEntry.node, node);
      stack.push({ indent, node });

      extraChildren.forEach((child) => addChild(node, child));
    });

    return { root, warnings };
  }

  /** Serialises a tree back to .ndm text, the inverse of parseNdm, for export. */
  function serialiseNdm(root) {
    const lines = [];

    function isAutoExpandedGroup(node) {
      // A node whose children are all same-kind leaves with "name = value"
      // labels sharing this node's label prefix, i.e. it came from a
      // "(a; b; c)" expansion and should be re-collapsed on export.
      if (!node.children.length || !node.kind || !node.label) return false;
      return node.children.every(
        (c) => !c.children.length && c.kind === node.kind && c.label && c.label.startsWith(`${node.label} = `)
      );
    }

    function walk(node, depth) {
      if (node.kind === 'root') {
        node.children.forEach((c) => walk(c, 0));
        return;
      }
      const indent = ' '.repeat(depth);
      const symbol = node.nodeType === NodeType.XOR ? '-' : '+';

      if (isAutoExpandedGroup(node)) {
        const options = node.children.map((c) => c.label.slice(node.label.length + 3));
        lines.push(`${indent}${symbol}[${node.kind}: ${node.label} = (${options.join('; ')})]`);
        return;
      }

      const bracket = node.kind ? `${node.kind}: ${node.label}` : '';
      lines.push(`${indent}${symbol}[${bracket}]`);
      node.children.forEach((c) => walk(c, depth + 1));
    }

    walk(root, 0);
    return lines.join('\n');
  }

  global.NovaDM.parser = { parseNdm, serialiseNdm };
})(typeof window !== 'undefined' ? window : globalThis);
