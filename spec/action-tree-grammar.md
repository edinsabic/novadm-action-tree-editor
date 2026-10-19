# NovaDM action tree: grammar and file format

Background for the code in `src/` (the model, the file format, the
version history and the Calculations tab), pulled out of the code so
those files stay short. Update this alongside the code if a rule below
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

- **Undo/redo** (`undo.js`, the toolbar buttons on both tabs, Ctrl+Z /
  Ctrl+Y) covers the whole document: tree, profiles, version history,
  the file's `source` line and the Calculations tab's data, so saving,
  opening, restoring, merging and deleting versions can be undone too.
  Every render calls `Undo.record()`; a changed document becomes one step
  (max 100). Typing in one editor field is one step until focus leaves it
  (a field with a `data-typing-key` counts as one field). Loading the
  example, clearing the tree and importing a file also replace the
  Calculations data, in the same single step.
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

## Calculations tab

The Calculations tab turns the action tree into numbers: a number per
option and attribute (such as a price or its CO₂), calculated values
with formulas, and KPIs over a sample of scenarios. It began as a mockup
on made-up numbers, which the supervisor approved, and now works on
whatever tree the Action tree tab holds. Two things are still missing:

- its data is **not saved**: it lives in memory and in undo/redo, but not
  in the file (still format version 5) or the version history, and the
  pill "Changes here are not saved yet" says so. Saving it in the JSON
  file, with import and export, comes later;
- the example's numbers are made up.

"Calculated value" is the UI's name for NovaDM's **derived attribute**;
identifiers, data keys and CSS classes keep `derived`. The engine is
`calculations.js` (no DOM); the tab is `calculations-tab.js`, and its
report `calculations-report.js`.

### Data

The tab works on `{ attributes, units, values, derived }`:

- `attributes` – the attributes in their order, the columns of a box's
  table. Attributes that only appear in `values` come after them.
- `units` – `{ attribute: unit }`, see "Units".
- `values[label][attribute]` – a number per option, `{ option: number }`,
  or a plain number for a node without options. Numbers are keyed by
  **label and option**, as in NovaDM, so nodes that share both share the
  number, while `structural_element = windows` and `= roof` keep
  separate numbers. Numbers of a label that is not in the tree are kept
  but not drawn, so undo or adding the node again brings them back.
  Renaming a label or an option detaches its numbers; they come back if
  it is renamed back. A plain number counts for every option, so once a
  node with a plain number gets options, every row shows it. Typing in
  one of those rows turns it into one number per option, and the other
  options keep the plain number. A node without options that shares its
  label with a node that has numbers per option stores its number under
  the option `''`, so neither node loses its numbers. Labels, options,
  attributes and units are written as own keys (`Util.setOwn`), so a
  name such as `__proto__` from a file works like any other.
- `derived` – the calculated values, `{ name, formula, displayName?,
  unit?, kpi? }`. `displayName` is the name in the Action tree tab's
  bottom bar, and `kpi: true` makes it a KPI.

Where the data comes from:

- **The example** (`examples/sample-attributes.js`, the global
  `NOVADM_SAMPLE_ATTRIBUTES`): made-up numbers for the sample tree, the
  constant `facade_area`, the brick replacement's cost and CO₂, and the
  KPIs `sum` ("Sum", `total(price) + brick_replacement_cost`, in DKK)
  and `gwp` ("GWP", global warming potential, `total(co2) +
  brick_replacement_co2`, in kg CO₂e). The editor opens with it, and
  "Load example" and "Load example tree" load it again.
- **Starter data**, for every other new document (Clear tree, Import):
  the attributes `price` (DKK) and `co2` (kg CO₂e), no numbers, and the
  KPIs `sum = total(price)` and `gwp = total(co2)`. Typing prices for a
  few options is then enough to get a Sum.
- A new document starts the tab over: no sample, no option picks and
  nothing selected. Loading the example, clearing the tree and importing
  a file replace the Calculations data in the same undo step as the
  tree. They ask first, unless the tree is empty and the Calculations
  data is still the starter data, so there is nothing to lose.

### Formula language

```
expr    = "if" expr "then" expr "else" expr | compare
compare = sum [ ("=" | "<" | ">") sum ]
sum     = product { ("+" | "-") product }
product = unary { ("*" | "/") unary }
unary   = "-" unary | primary
primary = number | text | name [ "." name ]
        | ("total" | "selected") "(" name ")" | "(" expr ")"
```

- A plain name is a calculated value; otherwise it is a label, read as
  the option chosen for it in the scenario. In arithmetic an option is
  read as a number (`"7.5%"` -> 0.075, `"14"` -> 14). Text is written in
  single quotes: `roof_replacement = 'replace'`. Keywords and function
  names are case-insensitive. Names are case-sensitive and use letters
  (any alphabet, so `vægge` and `tag_ø` work), digits and `_`, don't
  start with a digit and aren't keywords, so a name such as "U-value" is
  refused: its `-` would mean minus.
- `label.attribute` is the label's number for the chosen option, or its
  plain number. `total(attribute)` adds up the attribute over every node
  in the scenario that has a number for its chosen option.
  `selected(label)` is true when a node with that label is in the
  scenario.
- **n/a**: a label that is not in the scenario, a missing number, text
  in arithmetic or a division by zero. Arithmetic passes n/a on, a
  comparison with n/a is false, and an `if` whose condition is n/a takes
  the else branch.
- **A label that isn't in the tree** is not an error. That is a plain
  name, the name in `selected()` or the label of `label.attribute` that
  is no calculated value, no label in the tree or in `values`, and no
  attribute. It counts as not chosen: `selected()` is false and the rest
  n/a. The editor panel and the graph node's tooltip say "Not in the
  tree: … It counts as not chosen." (the analysis lists such names in
  the item's `missing`). This keeps the example's formulas working on
  any tree; a misspelt label is only a note, but in arithmetic it gives
  n/a.
- **Errors**: a syntax error (with its 1-based position), a cycle, an
  attribute used as a plain name, a calculated value in `selected()` or
  before a dot, an unknown attribute after a dot, or `total()` of an
  attribute that doesn't exist, or a formula too long or too deeply
  bracketed to calculate (about a few thousand terms). The value shows
  "error", and so does everything that uses it. An attribute exists when it is in
  `attributes` or some label has a number for it.
- When no node in the tree has a number for `total()`'s attribute, the
  total is 0 and has no arrows; the editor panel and the tooltip say so
  ("No node in the tree has a number for price yet …").

### The graph

The graph shows one scenario, chosen by hand, and follows the tree in
the Action tree tab (`Render.renderTree()` calls
`CalculationsTab.treeChanged()`).

- **Column 0** holds first the constants, calculated values whose
  formula refers to nothing (`facade_area = 450`), then one **box** per
  tree node that has a label, depth-first in tree order. Boxes are
  indented 16 px per labelled ancestor, so their right edges line up. A
  node without a label, such as the root node, gets no box.
- **A box** shows `label =` and a drop-down of the node's options
  ("chosen" for a node without options), plus "not chosen" when an XOR
  above can leave the node out; a single option that is always taken
  shows as text. Below that, one row per attribute that has a number for
  at least one of the node's options, with the number of the option on
  screen. A box that is not in the scenario on screen is greyed out.
- **Every other calculated value** goes one column to the right of its
  furthest-right input, and in column 1 at least once its formula refers
  to anything, even before it has an arrow. A column is stacked from the
  top in the order of its inputs' height. Each shows its value and its
  formula.
- **Arrows** run into a calculated value from every box and calculated
  value it uses: `label.attribute` from that attribute's row (or the
  box's head), `selected(label)` and a plain label from the head, and
  `total(attribute)` from the attribute's row in every box that has
  one, which is why `sum` has an arrow from every priced box.
- **Picking an option** also picks the branch of every XOR above the
  node; "not chosen" switches the nearest XOR with more than one child
  to another branch. The picks are kept by node id
  (`Calculations.scenarioFor`). By default every node takes its first
  option and every XOR its first child. Profiles are ignored.
- Clicking a node selects it and highlights everything it uses and
  everything that uses it. The graph scrolls and zooms (30% to 200%, CSS
  `zoom` on the canvas). On an empty tree it shows only a hint.

### Editor panel

- **Nothing selected**: a short guide to the graph.
- **A box**: the label and a table with one row per option ("when
  chosen" for a node without options) and one column per attribute,
  headed e.g. "price (DKK)"; the row of the option on screen is
  highlighted. A number box takes a decimal comma or a decimal point
  ("1,5" and "1.5" are both 1.5). A separator that appears more than
  once, or comes before the other kind, separates thousands: "1.234,5"
  and "1,234.5" are both 1234.5, and "1.000.000" is a million. A single
  "1,000" is therefore 1. When the box loses focus it shows the number
  with a space between thousands and a decimal point ("1 234.5"), so
  editing it again can't be misread. An empty box means no number, and
  text that isn't a number is ignored and put back. Under the table come the **Units** list (one
  drop-down per attribute) and "+ Attribute", which adds an attribute at
  the end of the list.
- **A calculated value**: its name, a KPI box, the formula box
  (evaluated again on every keystroke; an error shows in red below it,
  the notes in grey), its **Unit**, its value in the scenario on screen
  and Delete. Before deleting, the confirm names the calculated values
  whose formulas use it, as those then read its name as a label that
  isn't in the tree. "+ Calculated value" in the toolbar adds one.
- The panel is kept deliberately simple: there is no help on the formula
  language in it yet.

### Units

- Each attribute has one unit for every node (`units[attribute]`), and
  each calculated value has its own (`unit`). No unit is an empty or
  missing value.
- The drop-down offers No unit; Currency: DKK, EUR, USD; Climate:
  kg CO₂e, t CO₂e; Other: m², kWh, years; then "Custom unit…", which
  shows a text box for any unit of up to 20 characters, like the custom
  subject in the Action tree tab. Currencies use their ISO 4217 codes:
  "kr." and "$" are shared by several currencies, and the codes are
  plain ASCII, safe in any file or font. GWP is given in CO₂
  equivalents.
- A unit is only a label: numbers are stored and calculated without it,
  changing DKK to EUR converts nothing, and formulas aren't checked for
  matching units.
- A unit follows its number after a no-break space ("52,000 DKK") in the
  graph, the editor panel and the KPI cards; a heading reads
  "name (unit)" ("sum (DKK)"). n/a and errors get none.
- **Ready for a CSV export** (later): the report's table already has the
  form a CSV will have, with the unit in the heading and plain numbers
  in the cells, so a spreadsheet can calculate with them and an import
  can read the unit back from the heading.

### Sampling

The control row reads "Sample", then **30 scenarios**, **Full scenario
space**, and your own number of scenarios: a box that shows a comma
between thousands ("1,000"), then its "scenarios" button or Enter. The
number is a count, so the box ignores commas, points and spaces
("1.000" is also a thousand). The
**scenario space size** next to the title is counted without profiles,
as the sample is (`Calculations.count`), so with a profile active it can
differ from the Action tree tab's. On an empty tree every sample control
and "+ Calculated value" is disabled.

- **Limits**: at most 3,000 scenarios (`MAX_SAMPLE_SIZE`). Your own
  number must be a whole number from 1 to 3,000. "Full scenario space"
  refuses a space of more than 3,000 with an alert; its tooltip gives the
  count. Asking for more scenarios than the space has, with 30 or your
  own number, shows an alert and lists the full space instead; your own
  number's box then shows the size of the space.
- **Counting**: `count(node)` is the sum of the children's counts for an
  XOR with children and their product otherwise, times the node's number
  of options (or 1). Without a profile it equals
  `Model.scenarioSpaceSize()`.
- **A random sample** (`Calculations.sample`) draws each scenario on its
  own, from the root node down: every node takes a uniformly random
  option, an AND takes every child and an XOR one child with probability
  `count / sum`, so every scenario is equally likely (a sample can hold
  the same scenario twice). A scenario is a list of
  `{ id, label, value }`, where `value` is the chosen option, or `''`
  for a node without options.
- **The full space** (`Calculations.enumerate`) lists every scenario
  once, in tree order: each node's options in turn, an AND combining its
  children and an XOR taking each child in turn.
- **Profiles are ignored**, and the report says so.
- **Following the tree**: each sample has a random seed
  (`Calculations.seededRandom`, a mulberry32 generator). When the tree
  changes, the sample is drawn again with the same size and seed, so the
  numbers only move because of the change, and undoing it gives them
  back. A full listing is listed again; if the tree now has more than
  3,000 scenarios, it becomes a random sample of the same size, and the
  report says so. While the tab is hidden, a tree change only updates
  the size and the bottom bar; the sample is drawn again when the tab
  opens, so typing in the Action tree tab stays fast with a large
  sample.
- Undo and redo keep the sample; a new document drops it.

### Report

- Until the first sample a **banner** sits below the graph, in a dashed
  frame. A sample opens the **report** in its place, in a solid frame,
  and scrolls to it. The × in its top right closes it and drops the
  sample; that is not an undo step.
- **The head** says what was drawn, e.g. "1,000 random scenarios out of
  2,560 · 815 different ones (31.8% of the space) · every scenario is
  equally likely; profiles are not applied". A full listing is titled
  "Full scenario space" and reads "All 2,560 scenarios of the space".
- **One card per KPI** (or, if no calculated value is a KPI, per
  calculated value that no other formula uses): the heading and the
  mean with the unit, then min, median, max, the sample standard
  deviation (n − 1), a histogram (up to 20 bars, the square root of the
  number of values; a line marks the mean; hover a bar for its range and
  count) and buttons for the lowest and highest scenario.
- **The scenario table**: `#`, the KPIs and the option of every box with
  a choice, 100 rows per page, with ‹ and › above and below ("Scenarios
  101–200 of 2,560 · page 2 of 26"). It sorts by `#` (the default; click
  it again for the last first) or by a KPI; sorting and a new sample go
  back to page 1. When the sorted KPI leaves the table (no longer a KPI,
  or deleted), the table goes back to sorting by `#`. KPI cells are coloured from green (lowest) to red
  (highest), per column.
- **Opening a scenario**: clicking a `#`, or a card's lowest or highest
  button (which first turns to the right page), sets every drop-down in
  the graph to that scenario's options (`Calculations.choicesFor`),
  marks its row and scrolls up. The graph's toolbar then reads
  "Scenario #104 from the report is on screen", until an option is
  picked by hand or a new sample is drawn.

### The Action tree tab's bottom bar

"Calculations (live)" shows the scenario space size (with the active
profile), then each KPI under its `displayName` (or its name), and the
link "Get your numbers in the Calculations tab →". With no KPI it shows
"KPIs none yet". The bar wraps onto two lines when it doesn't fit.

For now the KPIs stay greyed out with "–", and their tooltip reads "Not
shown yet. Later this bar shows the scenario chosen in the Calculations
tab." A sample's mean on the Action tree tab was unclear. The code that
showed it (`≈` and the sample's mean, or the exact mean of a full
listing) is still in `calculations-tab.js`, switched off by
`BAR_SHOWS_MEANS = false`. Later the bar should show the scenario chosen
in the Calculations tab, once its data is saved with the document.

### Numbers

Numbers use British English (`toLocaleString('en-GB')`), with a comma
between thousands. Whole numbers have no decimals ("0", "450"), other
numbers under 1,000 keep up to two ("0.25"), and numbers from 1,000 up
are rounded ("27,868"). Counts have no decimals, and shares one
("31.8%", or "under 0.1%").

## File format (`.json`, format id `novadm-action-tree`)

`parser.js`'s `TREE_FILE_FORMAT` is the only place that knows how a
document looks on disk. The rest of the editor works with "specs" (a
plain array of `{ id, kind, nodeClass, label, value, children }` objects,
`id` optional) and a small document wrapper: `{ tree, profile, history, source }`.
The Calculations tab's data is not in the file yet (see "Calculations
tab").

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
| 6 | Each snapshot holds its own profiles and the Calculations data (`{ id, created, profile, tree, calculations }`); the global `profile` section is gone. | Read as is. A snapshot without `profile` has no profiles; one without `calculations` gets the starter data (Sum and GWP, no numbers); a `calculations` without `attributes` takes them from `values`. |
| 5 | Each snapshot's `tree` holds a single explicit root node. Editors before the XOR-root change always wrote an AND root; the root may now be AND or XOR. | The global profiles are copied into every snapshot, pruned to its tree; every snapshot gets the starter data. |
| 4 | Profiles also hold per-value constraints (`currentValues`, `valueConstraints`). | As version 5. No explicit root node: an AND root is added above the top-level nodes (with the same new id in every snapshot), the user is told, and the scenario space is unchanged. |
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
- `examples/sample-attributes.js` is the Calculations tab's example data
  for the sample tree (see "Calculations tab"): made-up numbers, the
  units and the calculated values, with Sum and GWP as KPIs.

These files aren't unified – known and deliberately deferred, not an
oversight.
