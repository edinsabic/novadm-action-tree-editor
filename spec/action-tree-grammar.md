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
none). `root` is a virtual container that is never drawn or saved; it
holds exactly one node, the explicit **root node**.

- **Rule 1** – all children of a given node must share the same `kind`.
- **Rule 2** – the root node is AND (per the formal action-tree spec),
  and so are its children. This is the `TOP_LEVEL_KIND` constant in
  `model.js` – change that one constant to relax or alter it.

## Profiles: always/never node constraints

The action tree itself is treated as fixed; a **profile** is a set of
per-node constraints layered on top of it, not a variant of the tree.
Only leaves can be constrained (`LEAF_ONLY_CONSTRAINTS` in `model.js`;
never the root node). A leaf with one value has a constraint dot; a node
with several values has one chip per value instead. Each is in one of
three states, cycled by clicking it (white/default -> green/always ->
red/never -> default):

- **always (green)** – every valid configuration must include this node
- **never (red)** – no valid configuration may include this node
- **default (white)** – unconstrained, could go either way

`model.js` holds one **working** constraint state – `nodeConstraints`
(`nodeId -> 'always'|'never'`, no entry = default) and `valueConstraints`
(`nodeId -> { value -> 'always'|'never' }`) – plus a list of named, saved
snapshots of it (`profiles`, `{ name, constraints, valueConstraints }`).

Saving, loading and deleting profiles (`saveProfile`/`loadProfile`/
`deleteProfile` in `model.js`, wired up in `popovers.js`'s profile pane)
changes this list; it is exported and imported with the file (see
`profile` below). Load example and Clear tree reset all profiles
(`Model.resetProfiles()`); an import takes the file's profiles.

**Scenario space size** (`Model.scenarioSpaceSize()`, the live `Size`
metric in the bottom bar) counts valid scenarios: AND = product of its
children, XOR = sum of its children, times the node's own choice of
values. `never` removes a node or value; `always` pins every XOR above
it (and a node's value choice) to that branch. Contradictory constraints
give 0, and a warning is shown.

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

## Editor: undo/redo and quick actions

- **Undo/redo** (`undo.js`, toolbar buttons, Ctrl+Z / Ctrl+Y) covers the
  whole document: tree, profiles and version history, so saving,
  opening, restoring and merging versions can be undone too. Every
  render calls `Undo.record()`; a changed document becomes one step
  (max 100). Typing in one editor field is one step until focus leaves it.
- The **selected node** shows a red delete icon in both layouts; it runs
  the same `EditorForm.deleteNode()` as the editor's delete button.
- The **traditional layout** opens zoomed to fit the whole tree, centred
  (`Render.fitTraditionalView()`, between 50% and 100%). It refits on
  switching to it and on loading or importing a tree.

## File format (`.json`, format id `novadm-action-tree`)

`parser.js`'s `TREE_FILE_FORMAT` is the only place that knows how a
document looks on disk. The rest of the editor works with "specs" (a
plain array of `{ id, kind, nodeClass, label, value, children }` objects,
`id` optional) and a small document wrapper: `{ tree, profile, history }`.

The current file (version 5) has three sections, always in this order (blank lines
between them are valid JSON and are written on purpose):

```
{
	"format": "novadm-action-tree",
	"version": 5,

	"versionControl": { "head": "Add scaffolding", "edges": [
		{ "from": "Initial version", "to": "Add scaffolding", "comment": "..." } ] },

	"profile": { "active": null, "current": { "<nodeId>": "always" },
		"currentValues": { "<nodeId>": { "<value>": "never" } },
		"saved": [ { "name": "Budget", "constraints": { "<nodeId>": "never" },
			"valueConstraints": {} } ] },

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
- **`profile`** – `current` / `currentValues` are the node and value
  constraints on screen now, `saved` the named profiles, `active` the
  loaded one (or `null`).
  Constraints are keyed by node `id`, which is why saved nodes now carry
  an `id` (unique within a snapshot; kept on load, so profiles keep
  pointing at the same nodes). Constraints naming ids that aren't in the
  loaded tree are dropped silently.
- Each section is read by its own small function in `parser.js`, and
  `validateDocument()` checks all of them before the live editor is touched.

Each snapshot's `tree` is a list holding the single AND root node.

Older files still import: `version: 4` / `3` (no explicit root node: one
is added above the top-level nodes, the user is told, and the scenario
space is unchanged; version 3 has no `currentValues`), `version: 2` / `1`
(a single `tree` key, no profiles, no history) and a bare array of nodes.
In the last two cases profiles are reset and history starts with one
version, the tree just loaded.

To switch to a different file type: edit `extension` / `mimeType` /
`defaultName` on `TREE_FILE_FORMAT`, and rewrite `serialize()` /
`parse()`. `parse()` must throw an `Error` with a readable message if
the text isn't a NovaDM file. (If the new format is binary, the
`reader.readAsText` / `new Blob` calls in `tree-io.js`'s import/export
handlers need to change too.)

## Example trees

All `.json` examples are format version 5.

- `examples/sample-tree.js` and `examples/sample-tree.json` mirror the
  same "windows / outer_doors / facade / roof / ground_floor" example:
  the `.js` version is what `index.html` preloads on open (as a
  `<script>` global, so it works over `file://` with no fetch/CORS
  issues); the `.json` version exists for import/export testing.
- `examples/novadm-action-tree.json` is the version-history demo: the
  same tree with five versions – a main line, a branch, and a merge of
  the branch that applies the branch's added and deleted nodes. It is
  also a quick manual test of Open, Restore and Merge. The root node has
  the same id (`n0`) in every snapshot, so it never shows up as a change.
- `examples/k45-case.json` is the K45 case: nine Subjects (roof,
  skylight, roof_cladding, window_frame, brick_facade, ground_floor,
  original_floor, stripped_terrain, layout) with XOR Features, one
  version, scenario space size 417,792.

These files aren't unified – known and deliberately deferred, not an
oversight.
