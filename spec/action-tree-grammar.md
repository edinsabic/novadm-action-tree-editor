# NovaDM action tree: grammar and file format

Background for `src/model.js` and `src/parser.js`, pulled out of the code
so those files stay short. Update this alongside the code if a rule below
changes.

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
- **Rule 2** – the project root is implicitly an AND node (per the
  formal action-tree spec), so every top-level node must be AND. This is
  the `TOP_LEVEL_KIND` constant in `model.js` – change that one constant
  to relax or alter it.

## Profiles: always/never node constraints

The action tree itself is treated as fixed; a **profile** is a set of
per-node constraints layered on top of it, not a variant of the tree.
Every node is in one of three states, cycled by clicking its constraint
dot in the tree (white/default -> green/always -> red/never -> default):

- **always (green)** – every valid configuration must include this node
- **never (red)** – no valid configuration may include this node
- **default (white)** – unconstrained, could go either way

`model.js` holds one **working** constraint map (`nodeConstraints`,
`nodeId -> 'always'|'never'`, no entry = default) that the dots reflect
live, plus a list of named, saved snapshots of it (`profiles`,
`{ name, constraints }`). `Model.scenarioSpaceSize()` reads the working
map and is shown live in the Action Tree tab's bottom bar (`Size`
metric) – see the note below on what it currently calculates.

Saving, loading and deleting profiles (`saveProfile`/`loadProfile`/
`deleteProfile` in `model.js`, wired up in `popovers.js`'s profile pane)
only affects this in-memory list – **profiles have no file
import/export yet**, that's still to come. Because constraints are keyed
by node id, replacing the tree (import, clear, load example) resets the
working map (`tree-io.js` calls `Model.resetNodeConstraints()`); saved
profiles are left as-is, so they can go stale against a new tree – a
known limitation, not yet solved.

**Scenario space size** is currently a simple placeholder metric, not
the full AND/XOR combinatorial calculation: it counts nodes, treating
any node marked `never` (and everything under it) as not counted at all.
It does not yet weight AND (product) vs. XOR (sum) branching, or a
node's own `value` options, the way a true count of valid configurations
would. Swap the body of `scenarioSpaceSize()` if/when the real formula
is needed – it's an isolated function.

**Version history** doesn't exist yet beyond an empty flyout pane
(`popovers.js`'s `renderVersionPane`). It's planned as a visual,
diagrammatic view of how versions branch (a graph library such as
Cytoscape.js has been suggested), not a plain list – nothing structural
is built for it yet.

## File format (`.json`, format id `novadm-action-tree`)

`parser.js`'s `TREE_FILE_FORMAT` is the only place that knows how a
document looks on disk. The rest of the editor works with "specs" (a
plain array of `{ id, kind, nodeClass, label, value, children }` objects,
`id` optional) and a small document wrapper: `{ tree, profile, history }`.

A version 3 file has three sections, always in this order (blank lines
between them are valid JSON and are written on purpose):

```
{
	"format": "novadm-action-tree",
	"version": 3,

	"versionControl": { "head": "Add scaffolding", "edges": [
		{ "from": "Initial version", "to": "Add scaffolding", "comment": "..." } ] },

	"profile": { "active": null, "current": { "<nodeId>": "always" },
		"saved": [ { "name": "Budget", "constraints": { "<nodeId>": "never" } } ] },

	"actionTree": [ { "id": "Initial version", "tree": [ ... ] },
	                { "id": "Add scaffolding", "tree": [ ... ] } ]
}
```

- **`actionTree`** – the snapshots: a list of `{ id, tree }`. A snapshot id
  is free text (git-style, e.g. "Add scaffolding"). The editor loads the
  snapshot named by `versionControl.head` (default: the last one).
- **`versionControl`** – `head` and `edges` (`from` -> `to`, optional
  `comment`; branches are just two edges leaving the same snapshot).
  Version history isn't editable yet: the editor holds whatever the file
  contained and writes it back unchanged, except that the live tree
  replaces the head snapshot. A fresh document has one snapshot called
  "Initial version" and no edges.
- **`profile`** – `current` is the always/never map on screen now,
  `saved` the named profiles, `active` the loaded one (or `null`).
  Constraints are keyed by node `id`, which is why saved nodes now carry
  an `id` (unique within a snapshot; kept on load, so profiles keep
  pointing at the same nodes). Constraints naming ids that aren't in the
  loaded tree are dropped silently.
- Each section is read by its own small function in `parser.js`, and
  `validateDocument()` checks all of them before the live editor is touched.

Older files still import: `version: 2` / `1` (a single `tree` key, no
profiles, no history) and a bare array of nodes. In both cases profiles
are reset and history starts empty.

To switch to a different file type: edit `extension` / `mimeType` /
`defaultName` on `TREE_FILE_FORMAT`, and rewrite `serialize()` /
`parse()`. `parse()` must throw an `Error` with a readable message if
the text isn't a NovaDM file. (If the new format is binary, the
`reader.readAsText` / `new Blob` calls in `tree-io.js`'s import/export
handlers need to change too.)

## Example trees

`examples/sample-tree.js` and `examples/sample-tree.json` mirror the same
"windows / outer_doors / facade / roof / ground_floor" example: the
`.js` version is what `index.html` preloads on open (as a `<script>`
global, so it works over `file://` with no fetch/CORS issues); the
`.json` version exists for import/export testing. `examples/
novadm-action-tree.json` is a separate, smaller "heating" example –
though at the moment it holds the same "windows / outer_doors / …" tree
as `sample-tree.js` rather than the heating one, from an earlier editing
pass; flagging in case that wasn't intentional. These files aren't
unified – known and deliberately deferred, not an oversight.
