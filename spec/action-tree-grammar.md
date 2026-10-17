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
- **Rule 2** – the root node may be AND or XOR, so a user can build and
  explore a single subtree on its own. A full action tree implicitly
  hangs below an AND, which is why an older file without a root node
  gets an AND root added on import (`TOP_LEVEL_KIND` in `model.js`).

## Profiles: always/never node constraints

The action tree itself is treated as fixed; a **profile** is a set of
per-node constraints layered on top of it, not a variant of the tree.
Any node except the root node can be constrained. A node with at most
one value has a constraint dot; a node with several values has one chip
per value instead, and no dot (marking every chip never forbids the
node). Setting `LEAF_ONLY_CONSTRAINTS` in `model.js` to `true` limits
dots to leaves. Each dot or chip is in one of three states, cycled by
clicking it (white/default -> green/always -> red/never -> default):

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

**Scenario space size** (`Model.scenarioSpaceSize()`, the live metric of
that name in the bottom bar) counts valid scenarios: AND = product of its
children, XOR = sum of its children, times the node's own choice of
values. Constraints follow the colouring of Schultz & Kamari (2021):
always = green, never = red, then

1. a green child makes its parent green;
2. a green child of an XOR makes its siblings red (the same holds for
   values: an `always` value rules out the node's other values);
3. an XOR whose children are all red is red (likewise a node whose
   values are all `never`).

The paper's optional fourth rule, "an AND with a red child is red", is
**not** applied: a red child of an AND is pruned, i.e. left out of the
product as if that subtree were not there. This lets a user switch off a
part of the tree (e.g. mark `structural_element = facade` never) and see
how the scenario space shrinks. A red root node gives 0, and so does an
empty tree (without a warning).

A contradiction is a node that is both green and red: two `always`
children of one XOR, two `always` values of one node, or a `never` node
with an `always` node or value below it. Any contradiction gives 0, and
a warning is shown.

Sizes below 10^6 are shown in full, with a comma between thousands as
in British English (e.g. 2,560). Sizes from 10^6 up are shown rounded to
two decimals as `y × 10^x` (e.g. 2.35 × 10^23). The count is a
JavaScript number, so it is exact up to 2^53 and overflows above about
10^308.

## Version history

`history.js` holds the versions (snapshots of the tree and the edges
between them), `version-graph.js` draws them as a small SVG graph, and
the Version flyout in `popovers.js` shows the graph and a details card
for the selected version. No libraries; a library such as Cytoscape.js
could replace `VersionGraph.create()` later.

- **Save as new version** snapshots the tree on screen on top of the
  current version (name and optional comment are asked for). **Update
  this version** (only offered for the current version with unsaved
  changes) overwrites its snapshot. It is disabled once another version
  is based on it, because changing it would change what that version and
  every later merge build on; save the changes as a new version instead.
  For the same reason, Export refuses in this case until the changes are
  saved as a new version.
- **Open** switches the editor to a version. **Restore** makes a new
  version with the contents of an older one, on top of the current one.
  Both ask first if there are unsaved changes.
- **Delete** removes a version other than the current one. Each version
  based on it is linked to the versions it was based on instead (keeping
  its comment and the order of its parents), so the remaining versions
  keep their common ancestors and merging still works. A link that is
  already implied (a parent that is also an ancestor of another parent)
  is left out, so deleting a merged branch turns its merge into a plain
  version on top of the other parent. The first version
  can only be deleted while at most one version is based on it;
  otherwise those versions would lose their common start. Versions
  cannot be renamed.
- Every node in every version has an id (an import fills in missing
  ones, see `actionTree` below), and a node keeps its id across versions.
- Profiles are one global set shared by all versions. A constraint on a
  node that the version on screen doesn't have is kept, and applies again
  when a version with that node is opened.
- In the graph, an edge that spans several columns stays in the row of
  one end (whichever row is free in between) and changes rows within a
  single column, so it never runs through other versions.
- **Merge** is a non-interactive three-way merge by node id. "Theirs" is
  the selected version, "mine" the current version, and the base is the
  nearest common ancestor in the version graph (no common ancestor: an
  empty tree). As in git, the current version must not have unsaved
  changes: save or undo them first. Per node:
  - only theirs added it: added (if its parent is still there);
  - theirs deleted it, mine did not touch it: removed (only if nothing of
    mine sits below it);
  - theirs edited or moved it, mine did not: updated. If the move can't
    be applied (the new parent is gone on my side, or the node would end
    up inside itself), the edit is still applied and the move is
    reported as a conflict;
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
  opening, restoring, merging and deleting versions can be undone too. Every
  render calls `Undo.record()`; a changed document becomes one step
  (max 100). Typing in one editor field is one step until focus leaves it.
- The **selected node** shows a red delete icon in both layouts; it runs
  the same `EditorForm.deleteNode()` as the editor's delete button.
- The **traditional layout** opens zoomed to fit the whole tree, centred
  (`Render.fitTraditionalView()`, between 50% and 100%). It refits on
  switching to it and on loading or importing a tree.

## Predefined subjects and Generate tree

`subjects.js` holds lists of renovation subjects grouped by category.
The **Subject list** switch (for now at the top of the Generate tree
panel) picks the list the editor uses; `DEFAULT_LIST` is the one it
starts with. The subject menu and the checklist always show the list in
use; switching clears the checklist's ticks. The choice is a setting,
not part of the document: it is not saved in the file and not undone.

- `'energyAgency'` (default) – the Danish Energy Agency's renovation
  measures from sparenergi.dk ("Spar energi med boligens energimærke"),
  translated to English: 6 categories, 24 subjects.
- `'novadmPaper'` – the 32 renovation alternatives (Table 2) grouped
  by the 7 subject types (Table 1) of Kamari et al. (2019), *Automation
  in Construction* 104. Keys follow `examples/full-tree.json`, so most of
  its subjects are recognised.

A subject is stored the way the example files store one: `label` is the
category key and `value` the subject key (e.g. `roof_and_attic =
attic_insulation`, like `architectural_elements = exterior_walls`). The
file format is unchanged.

- **Editor panel** – for a Subject node, the Label and Value fields are
  replaced by a cascading menu (category › subject). Its last entry,
  "+ Custom subject…", shows the Label and Value fields again for free
  text. A Subject node from the other list keeps its name, with a note
  saying which list it is from. One that is in neither list (e.g. from
  an older file) shows as a custom subject.
- **Generate tree** (top right of the tree panel) – a checklist of all
  subjects. Each subject names the shallowest renovation depth it belongs
  to (`depth`: `minor`, `moderate`, `deep` or `whole`); depths are
  cumulative, so choosing Moderate also allows the Minor subjects and
  greys out the rest, as in PARADIS. Whole building allows everything.
  Generate tree replaces the tree with an AND root node holding one AND
  Subject node per checked subject. The root node keeps its id, profiles
  and the version history are kept, and the new tree is an unsaved,
  undoable change.

The depth of each subject is a first guess, inferred from PARADIS's
four levels (Minor: exterior walls, windows, doors, balcony, solar
shading; Moderate: adds roof, floors, ceilings, interior walls and
doors; Deep: adds HVAC, renewable energy, structure, sewage; Whole: the
rest). Edit the `depth` fields in `subjects.js` to change it.

## File format (`.json`, format id `novadm-action-tree`)

`parser.js`'s `TREE_FILE_FORMAT` is the only place that knows how a
document looks on disk. The rest of the editor works with "specs" (a
plain array of `{ id, kind, nodeClass, label, value, children }` objects,
`id` optional) and a small document wrapper: `{ tree, profile, history, source }`.

The current file (version 5) has three sections, always in this order (blank lines
between them are valid JSON and are written on purpose):

```
{
	"format": "novadm-action-tree",
	"version": 5,
	"source": "",

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

- **`source`** – one line of text right after `version`, saying where
  the tree comes from (the K45 files credit COWI and the PROBONO
  project). Every export writes it, as `""` when there is none, so users
  can fill it in by hand. The Action tree tab shows a non-empty one under
  the tree. It belongs to the document, so it survives edits, undo/redo
  and export; Load example tree takes `NOVADM_SAMPLE_SOURCE` from
  `sample-tree.js`, and Clear tree empties it. It needs no new version:
  a version 5 file without it still imports (as `""`), and an editor
  that doesn't know the field ignores it.
- **`actionTree`** – the snapshots: a list of `{ id, created, tree }`. A
  snapshot id is free text (git-style, e.g. "Add scaffolding"); `created`
  is an optional `YYYY-MM-DD` date (older files have none). The editor
  loads the snapshot named by `versionControl.head` (default: the last
  one). On import, every node without an `id` gets a new one that is
  used nowhere else in the file (`n<number>`, also avoiding ids named in
  `profile`); root nodes without an id all get the same new id, so the
  root never shows up as a change. A node whose id was removed by hand
  therefore counts as a new node.
- **`versionControl`** – `head` and `edges` (`from` -> `to`, optional
  `comment`; branches are two edges leaving the same snapshot, a merge is
  a snapshot with two incoming edges). Edges must not go round in a
  circle (a snapshot based on itself); such a file is rejected. On export
  the tree on screen replaces the head snapshot (the editor asks first if
  it has unsaved changes and other versions exist, and refuses if other
  versions are based on the head). A fresh document has one snapshot
  called "Initial version" and no edges.
- **`profile`** – `current` / `currentValues` are the node and value
  constraints on screen now, `saved` the named profiles, `active` the
  loaded one (or `null`).
  Constraints are keyed by node `id`, which is why saved nodes now carry
  an `id` (unique within a snapshot; kept on load, so profiles keep
  pointing at the same nodes). Constraints naming ids that are in none
  of the snapshots (or values no snapshot gives that node) are dropped
  silently: on import, on undo/redo, and when exporting (so exporting,
  importing and exporting again gives the same file).
- Each section is read by its own small function in `parser.js`, and
  `validateDocument()` checks all of them before the live editor is touched.

Each snapshot's `tree` is a list holding the single root node (AND or
XOR).

### Format versions

`TREE_FILE_FORMAT.version` in `parser.js` is the version the editor
writes; the comment next to it lists the versions in short. Every version
bump gets a row here and a line in that comment. All older versions keep
importing.

| Version | What it introduced | On import |
|---|---|---|
| 5 | Each snapshot's `tree` holds a single explicit root node. Editors before the XOR-root change always wrote an AND root; the root may now be AND or XOR. | Read as is. |
| 4 | Profiles also hold per-value constraints (`currentValues`, `valueConstraints`). | No explicit root node: an AND root is added above the top-level nodes (with the same new id in every snapshot), the user is told, and the scenario space is unchanged. |
| 3 | The `versionControl` / `profile` / `actionTree` sections. | As version 4; there is no `currentValues`, so only node constraints load. |
| 2 | A single `tree` key; `value` is an array of strings. No profiles, no history. | An AND root is added as above; profiles are reset and history starts with one version, the tree just loaded. |
| 1 | A single `tree` key; `value` is text (`"a; b"`, split by `Model.parseValues`). | As version 2. |
| – | A bare array of nodes (no wrapper object). | As version 2. |

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
  also a quick manual test of Open, Restore, Merge and Delete. The root node has
  the same id (`n0`) in every snapshot, so it never shows up as a change.
- `examples/version-history-test.json` is a test bed for the whole
  version history, built on the sample tree with six versions: a main
  line (Initial version, Windows & doors, Roof, and Merge Facade, the
  current version), a merged branch (Facade) and an unmerged branch
  (Ground floor). Merging Ground floor gives one conflict
  (`windows_glazing` changed on both sides). Its two profiles constrain
  nodes and values that only some versions have. Use it to try Open,
  Restore, Merge, Delete (e.g. deleting Facade or Roof), and the rules
  for Update this version and Export.
- `examples/k45-case.json` is the K45 case: nine Subjects (roof,
  skylight, roof_cladding, window_frame, brick_facade, ground_floor,
  original_floor, stripped_terrain, layout) with XOR Features, one
  version, scenario space size 417,792. It and `k45-full-case.json` (all
  K45 versions) carry a `source` line: "This renovation design concept
  was developed by COWI as part of the Horizon 2020 research project
  PROBONO (No. 101037075) funded by the European Union."

These files aren't unified – known and deliberately deferred, not an
oversight.
