# NovaDM action tree: grammar and file format

Background for the NovaDM action tree grammar and file format used in `src/model.js`, `src/parser.js`, etc. Update this alongside the code if a rule below changes.

## Data model

A live node has the shape:

```
{ id, kind: 'AND'|'XOR', nodeClass: 'Subject'|'Approach'|'Feature'|'',
  label, value, expanded, children: [] }
```

`value` is an array of strings: the node's possible options (empty =
none). `root` is a virtual container; its children are the top-level
nodes and are never drawn or saved.

- **Rule 1** – all children of a given node (root included) must share
  the same `kind`.
- **Rule 2** – the project root is implicitly an AND node, so every top-level node must be AND. This is the `TOP_LEVEL_KIND` constant in `model.js` – change that one constant to relax or alter it.

## File format (`.json`, format id `novadm-action-tree`)

`parser.js`'s `TREE_FILE_FORMAT` is the only place that knows how a tree
looks on disk. The rest of the editor works with "specs": a plain array
of `{ kind, nodeClass, label, value, children }` objects – the same shape
as `examples/sample-tree.js` (`value` as an array of strings, though text
is still accepted for backwards compatibility).

- `version: 2` – `value` is an array of strings. Files saved as
  `version: 1`, or with a text `value`, still import (see `parseValues`
  in `model.js`).
- A bare array of nodes (no `format`/`version` wrapper) is accepted too.
- To switch to a different file type: edit `extension` / `mimeType` /
  `defaultName` on `TREE_FILE_FORMAT`, and rewrite `serialize()` /
  `parse()`. `parse()` must throw an `Error` with a readable message if
  the text isn't a tree file. Nothing else in the editor needs to
  change. (If the new format is binary, the `reader.readAsText` / `new
  Blob` calls in `tree-io.js`'s import/export handlers need to change
  too.)

## Example trees

`examples/sample-tree.js` and `examples/sample-tree.json` mirror the same
"windows / outer_doors / facade / roof / ground_floor" example: the
`.js` version is what `index.html` preloads on open (as a `<script>`
global, so it works over `file://` with no fetch/CORS issues); the
`.json` version exists for the import/export functionality.
`examples/novadm-action-tree.json` is a separate, smaller "heating" example. These
three files exist as a default action tree and for testing the import/export functionality.