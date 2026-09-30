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
- **Rule 2** – the project root is implicitly an AND node (per the
  formal action-tree spec), so every top-level node must be AND. This is
  the `TOP_LEVEL_KIND` constant in `model.js` – change that one constant
  to relax or alter it.

## Profiles & versions

Each project has one or more **profiles** (`{ name }`, just a label right
now) and a DAG of **versions**. A version is
`{ id, parents: [ids], comments: {parentId: text}, createdAt, tree }` –
`tree` is that version's own array of node specs (the same shape as
above), `parents` lists the version(s) it was branched from, and
`comments` holds an optional edge comment keyed by parent id. The editor
always has one active profile and one active version; editing the tree
edits the active version's `tree` in place (see `snapshotActiveVersion`
in `model.js`, called before switching versions, saving a new one, or
exporting, so the active version is never stale on disk).

`Model.saveNewVersion(comment, wantedId)` branches a new version off the
active one, seeded with a deep copy of its tree. Version ids default to
`a1`, `a2`, … (`makeVersionId`/`uniqueVersionId`) but can be named
explicitly; a name collision is disambiguated by appending a number.

## File format (`.json`, format id `novadm-action-tree`)

`parser.js`'s `TREE_FILE_FORMAT` is the only place that knows how a
**project** looks on disk: `{ format, version, profiles, activeProfile,
activeVersion, versions }`. Each entry in `versions` is one version as
described above; each version's `tree` is a plain array of
`{ kind, nodeClass, label, value, children }` objects – the same shape
as `examples/sample-tree.js` (`value` as an array of strings, though text
is still accepted for backwards compatibility on a per-node basis).

- `version: 3` – the multi-version project shape above. Files saved as
  `version: 1` or `2` (a bare tree, no profiles/versions) are **rejected**
  – `parse()` throws rather than trying to upgrade them. A bare array of
  nodes is rejected too (previously accepted as a bare tree; no longer,
  since there's nowhere for it to attach as a version without a project
  wrapper).
- `parse()` validates the whole project (`validateProject`, using
  `validateSpecs` per-version) before returning it, so a caller never
  needs a separate validate step – see `tree-io.js`'s import handler.
- To switch to a different file type: edit `extension` / `mimeType` /
  `defaultName` on `TREE_FILE_FORMAT`, and rewrite `serialize()` /
  `parse()`. `parse()` must throw an `Error` with a readable message if
  the text isn't a project file. `serialize()` takes the project object
  as a parameter (assembled by the caller from `Model`'s getters) rather
  than reading `Model` directly, so `parser.js` stays a pure
  data-in/data-out module with no dependency on live app state. Nothing
  else in the editor needs to change. (If the new format is binary, the
  `reader.readAsText` / `new Blob` calls in `tree-io.js`'s import/export
  handlers need to change too.)

## Example trees

`examples/sample-tree.js` is what `index.html` preloads on open (as a
`<script>` global, so it works over `file://` with no fetch/CORS issues)
– loaded into a single seeded version (`a1`) of a fresh project, not a
project file itself. `examples/novadm-action-tree.json` is a full
version-3 project file (one profile, one version) for import/export
testing, currently holding the same "windows / outer_doors / facade /
roof / ground_floor" tree as `sample-tree.js`.

`examples/sample-tree.json` is **still in the old (pre-versioning)
format** and will fail to import under the version-3-only parser – it
wasn't part of the profiles/versions change and hasn't been upgraded.
Known, not yet decided whether to upgrade it, drop it, or leave it as a
deliberately-rejected legacy-format test case.
