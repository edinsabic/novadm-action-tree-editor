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

## Version history

`history.js` holds the versions (snapshots of the tree and the edges
between them), `version-graph.js` draws them as a small SVG graph, and
the Version flyout in `popovers.js` shows the graph and a details card
for the selected version. No libraries; a library such as Cytoscape.js
could replace `VersionGraph.create()` later.

- **Save as new version** snapshots the tree on screen on top of the
  current version (name and optional comment are asked for). **Update
  this version** (only offered for the current version with unsaved
  changes) overwrites its snapshot.
- **Open** switches the editor to a version. **Restore** makes a new
  version with the contents of an older one, on top of the current one.
  Both ask first if there are unsaved changes.
- Profiles are one global set shared by all versions.
- **Merge** is a non-interactive three-way merge by node id. "Theirs" is
  the selected version, "mine" the tree on screen (unsaved changes
  included), and the base is the nearest common ancestor in the version
  graph (no common ancestor: an empty tree). Per node:
  - only theirs added it: added (if its parent is still there);
  - theirs deleted it, mine did not touch it: removed (only if nothing of
    mine sits below it);
  - theirs edited or moved it, mine did not: updated;
  - changed differently on both sides, deleted on one side and edited on
    the other, or added differently on both: a conflict. Mine is kept and
    the conflict is reported.

  Content (kind, class, label, value) and place (parent) are compared
  separately, so an edit on one side and a move on the other do not
  clash. Sibling order is not tracked: added and moved nodes go last. The
  flyout shows a dry run first (`History.mergePreview`: "Added 2 ·
  Updated 1 · Removed 1 · 1 conflict, kept yours"); the button is
  disabled when there is nothing to merge. The result is checked with the
  same structure rules as an import (`Parser.validateSpecs`); if it fails,
  the whole merge is rejected and nothing changes. The merge is saved as a
  new version with both parents.

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

- **`actionTree`** – the snapshots: a list of `{ id, created, tree }`. A
  snapshot id is free text (git-style, e.g. "Add scaffolding"); `created`
  is an optional `YYYY-MM-DD` date (older files have none). The editor
  loads the snapshot named by `versionControl.head` (default: the last
  one).
- **`versionControl`** – `head` and `edges` (`from` -> `to`, optional
  `comment`; branches are two edges leaving the same snapshot, a merge is
  a snapshot with two incoming edges). On export the tree on screen
  replaces the head snapshot (the editor asks first if it has unsaved
  changes and other versions exist). A fresh document has one snapshot
  called "Initial version" and no edges.
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
are reset and history starts with one version, the tree just loaded.

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
novadm-action-tree.json` is the version-history demo (format version 3):
the same tree with five versions – a main line, a branch, and a merge of
the branch that applies the branch's added and deleted nodes. It is also
a quick manual test of Open, Restore and Merge. These files aren't
unified – known and deliberately deferred, not an oversight.
