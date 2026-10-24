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

`model.js` holds the **working** constraint state of the version on
screen – `nodeConstraints` (`nodeId -> 'always'|'never'`, no entry =
default) and `valueConstraints` (`nodeId -> { value -> 'always'|'never' }`)
– plus its list of named, saved snapshots of it (`profiles`, `{ name,
constraints, valueConstraints }`), and which one is loaded (`active`).

**Profiles belong to a version.** Every profile change – a dot or a chip,
and Save, Load, Delete or "Clear all marks" in `popovers.js`'s profile
pane (it clears every mark on screen and unloads the profile; saved
profiles stay as they are) – is
stored straight into the version on screen (`History.storeProfiles()`),
so it never makes the version "unsaved". Each version keeps its own list:
"Save as new version" gives the new version a copy, and from then on the
two copies are separate (changing "Budget" in one version leaves the
other's "Budget" alone). A merge combines them (see "Version history").

**Pruning:** a version's stored profiles hold only constraints on nodes
its tree has (and values those nodes have). Others are dropped whenever a
version is stored – save, update, restore, merge, import and export – by
`Model.prunedProfileState`. While editing nothing is pruned: a constraint
on a deleted node is invisible and harmless, and undo/redo restore the
working state exactly as recorded. A profile that loses all its
constraints is kept, never deleted for the user: the profile pane marks
it "(empty)", with the title "None of its nodes are in this version's
tree, so it's safe to delete" (checked against the tree on screen), or
"It marks no nodes as always or never, …" for one saved with no marks.

Load example and Clear tree start with one version and no profiles
(`Model.resetProfiles()`); an import loads the profiles of the file's
current version (see `profile` below). The pill, on both tabs, reads
"Profiles: Budget", or "Profiles: none" when no profile is loaded. Marks
are set on the Action tree tab only; the Calculations tab applies the
marks on screen (loaded profile or not) and shows them read-only (see
"The graph" and "Sampling").

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
a warning is shown on both tabs: "Warning: the applied constraints are
contradictory."

`Model.applyMarks()` does this count in one walk and also returns, per
node id, whether a scenario that holds the node's parent may hold the
node (`possible`), which options the node may take (`values`) and how
many scenarios its subtree has (`count`), plus `contradictory` when the
marks leave a non-empty tree no scenario (it switches the warning on both
tabs). `scenarioSpaceSize()` returns its `size`; the Calculations tab
samples, lists and picks scenarios with the rest, so the rules live in
one place and both tabs follow them.

Sizes below 10^6 are shown in full, with a comma between thousands as
in British English (e.g. 2,560). Sizes from 10^6 up are shown rounded to
two decimals as `y × 10^x` (e.g. 2.35 × 10^23). The count is a
JavaScript number, so it is exact up to 2^53 and overflows above about
10^308.

## Version history

`history.js` holds the versions and the edges between them,
`version-graph.js` draws them as a small SVG graph, and the Version
flyout in `popovers.js` shows the graph and a details card for the
selected version. No libraries; a library such as Cytoscape.js could
replace `VersionGraph.create()` later.

A version is a snapshot of the whole document on screen, like a Git
commit: `{ id, created, tree, profile, calculations }`, with the tree,
its profiles (pruned to it, see "Profiles") and the Calculations tab's
data (not pruned: numbers of a label that isn't in the tree are kept, so
a label that comes back finds them). The file's `source` line stays one
per document. `history.js` stores copies, and reads and loads the
Calculations data through `NovaDM.CalculationsTab`, referenced lazily
(it loads later) and guarded, so `history.js` still runs in Node.

| Action | Tree | Profiles | Calculations data |
|---|---|---|---|
| Save as new version | copied | copied, pruned to the tree | copied |
| Update this version | overwritten (see below) | stored at every change anyway | overwritten |
| Open | loaded | loaded | loaded |
| Restore | a new version with the old one's | the same | the same |
| Merge | three-way by node | three-way by profile name | three-way by number |
| Delete | as below | as below | as below |

- **Unsaved changes** are changes to the tree or to the Calculations
  data; profiles store themselves. The pills on both tabs read "Version:
  Roof", or "Version: Roof · unsaved"; a label longer than 34 characters
  is shortened with "…", and the tooltip then starts with the full name.
  The tree is compared canonically; the Calculations data as a flat list,
  one entry per number (`label / attribute / option`, a plain number with
  option `''`), unit, attribute and calculated value, plus the order of
  the attributes and calculated values. Empty objects don't count, so
  typing a number and deleting it again leaves nothing to save.
- **Save as new version** snapshots everything on screen on top of the
  current version (name and optional comment are asked for). **Update
  this version** (offered for the current version with unsaved changes)
  overwrites its tree and numbers. Once another version is based on it,
  its **tree** stays fixed, because that version and every later merge
  build on it: Update is then disabled if the tree changed (save as a new
  version instead), but still works when only numbers changed, so prices
  can be typed into every version of a chain such as K45's. Export
  follows the same rule. The accepted side effect: a later merge compares
  numbers against the updated base.
- **A corrected number reaches the other versions.** After Save as new
  version or Update this version, the numbers that changed from what the
  version had stored are looked up in every other version
  (`History.numberCorrections`). Versions that still hold the old value
  for the same label, attribute and option are offered the new one in a
  single `confirm` ("52,000 is also the price of windows_glazing ·
  replace_triple in 1 other version ("Initial version"). Change it to
  61,000 there too?"). Versions with another value (on purpose, like
  K45's roof area) are left alone. One undo reverts it with the save.
- **Open** switches the editor to a version, and **Restore** makes a new
  version with the contents of an older one, on top of the current one;
  both load its tree, profiles and numbers (the Calculations tab keeps
  its sample's size and seed and draws it again). Both ask first if there
  are unsaved changes.
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
- The Calculations tab has its own "Profiles: …" and "Version: …"
  pills, at the same place as the Action tree tab's. They open the same
  flyouts, with the same Profile/Version switch, moved into the layer of
  the tab that opens them.
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
  clash. Sibling order is not tracked: added and moved nodes go last.

  **Profiles** are merged by name, each compared as a whole, with the
  same rule (only theirs changed: take theirs; both changed differently:
  a conflict, keep mine). All three sides are first pruned to the merged
  tree, so a constraint that only went missing because its node is gone
  doesn't count as a change. A profile only theirs added is added; one
  theirs deleted and mine didn't touch is removed. The loaded profile and
  the dots on screen stay mine.

  **The Calculations data** is merged per entry of the flat list above.
  The attributes and calculated values keep mine's order, with theirs-only
  ones at the end. A label and attribute that would end up with both a
  plain number and numbers per option keeps mine and is a conflict.
  The base is the common ancestor's numbers as they are now, not as they
  were when the branches split: a version others are based on still takes
  number changes (Update this version, number corrections), so after
  such a change a merge can take theirs without a conflict, or report one
  that isn't. Keeping each version's numbers from the split is on the
  plan's "Later" list.

  Conflicts of all three parts are listed together ("profile "Budget" –
  changed differently on both sides", "windows_glazing · price ·
  replace_triple – changed differently on both sides"). The flyout shows
  a dry run first (`History.mergePreview`: "Added 2 · Updated 1 · Removed
  1 · Profiles: 1 added · Numbers: 4 changed · 1 conflict, kept yours");
  the button is disabled when no part has anything to apply. The result
  is checked with the same structure rules as an import
  (`Parser.validateSpecs`); if it fails, the whole merge is rejected and
  nothing changes. The merge is saved as a new version with both parents.
- The **details card** shows the node changes against the first parent
  ("+2 added · 1 changed · 0 removed"), and below it, only when there are
  any, "Profiles: 1 added · 1 changed" (the parent pruned to this
  version's tree first) and "Numbers: 4 changed · 1 calculated value
  added" (numbers, calculated values, units and attributes).

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
whatever tree the Action tree tab holds. Its data belongs to the version
on screen (see "Version history") and is saved per version in the file
(format version 6). It applies the always/never marks on screen, as the
Action tree tab does (see "Profiles", "The graph" and "Sampling"). Its
report can be saved as a CSV table, a PNG per KPI card and a PDF (see
"CSV files", "PNG images" and "PDF of the report"). The example's
numbers are still made up.

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
  Renaming a label or an option takes its numbers along (see "Numbers
  follow a rename" below). A plain number counts for every option, so once a
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
- **Starter data** (`Calculations.starterData()`), for Clear tree and for
  every version of a file older than version 6: the attributes `price`
  (DKK) and `co2` (kg CO₂e), no numbers, and the KPIs `sum =
  total(price)` and `gwp = total(co2)`. Typing prices for a few options
  is then enough to get a Sum.
- **A file** (Import file, on either tab): each version's own data; the
  tab shows the current version's.
- A new document starts the tab over: no sample, no option picks and
  nothing selected. The document's parts (tree, profiles, Calculations
  data) are set before the version history snapshots them, so "Initial
  version" never starts "unsaved". Loading the example, clearing the tree
  and importing a file replace the Calculations data in the same undo
  step as the tree. They ask first, unless there is nothing to lose: an
  empty tree, the starter data, no saved profile and a single version.

#### Numbers follow a rename

Renaming a node in the Action tree tab's editor panel (the Label and
Value / options fields, also of a custom subject) takes its numbers
along, in the version on screen only. When the field gets focus,
`editor-form.js` keeps a copy of the Calculations data; every keystroke
rebuilds the data from that copy with the move applied
(`Calculations.renameLabel` / `renameOptions`), so a name typed on the
way ("roof" on the way to "roof_new") never moves anything for good, and
the move is part of the field's one undo step.

- A label renamed from `old` to `new`: its numbers move to `new`, or are
  copied when another node still has `old`. If `new` already has
  numbers, the two merge: `new` keeps its own and gains the ones it
  lacks. Only a clash moves nothing: the same attribute and option (or
  the same plain number) holding different numbers on both sides, or a
  plain number on one side against numbers per option on the other.
  While the field has focus, a note under the Value / options field
  names the clash ("roof already has a different price for keep_current,
  so the numbers of roof_old stay where they are."). It goes when the
  field loses focus, after the mouse button is released, so the click
  that left the field still lands; an alert there would swallow it.
- Options renamed: when the list keeps its length and an entry changes
  at the same place to a name that wasn't in the list before, its numbers
  move within the label, by the same rules. Adding, removing or
  reordering options moves nothing.
- Picking another subject in the Subject menu moves nothing: it is a
  different subject. Formulas are not rewritten; one that names the old
  label shows the "Not in the tree" note.

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
  above or the always/never marks can leave the node out; a single
  option that is always taken shows as text. Below that, one row per
  attribute that has a number for at least one of the node's options,
  with the number of the option on screen. A box that is not in the
  scenario on screen is greyed out.
- **The always/never marks** show read-only (they are set on the Action
  tree tab): a green or red dot before the label of a node with a mark,
  and "(always)" or "(never)" after a marked option. An option the marks
  rule out stays in the drop-down, greyed out (disabled); "not chosen"
  is greyed out when the marks put the node in every scenario. A box no
  scenario can hold is greyed out, with the title "The always/never
  marks leave this node out of every scenario". While the marks are
  contradictory the graph ignores them, so options can still be picked.
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
  node; "not chosen" switches the nearest XOR with another possible
  child to that child. The picks are kept by node id
  (`Calculations.scenarioFor(node, choices, allowed)`). By default every
  node takes its first allowed option and every XOR its first allowed
  child; a pick the marks no longer allow falls back the same way.
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
- **In a CSV file** (see "CSV files") the unit sits in the heading the
  same way, and the cells hold plain numbers, so a spreadsheet can
  calculate with them.

### Sampling

The sample controls sit in the "Explore the scenario space" panel below
the graph (see "Report"), in a row under its text: "Sample", then **30
scenarios**, **Full scenario space**, and your own number of scenarios:
a box that shows a comma between thousands ("1,000"), then its
"scenarios" button or Enter. The number is a count, so the box ignores
commas, points and spaces ("1.000" is also a thousand). On a narrow
screen the row wraps; a button's text never breaks.

The control row holds the **scenario space size**, the Action tree
tab's (`Model.scenarioSpaceSize()`): the always/never marks on screen
apply, as they do to the sample. When it is 0 every sample control is
disabled; on a non-empty tree the same warning as on the Action tree tab
shows next to it, "Full scenario space" says why in its tooltip, and a
sample on screen becomes empty ("The always/never marks are
contradictory, so there is nothing to sample."). "+ Calculated value" is
disabled only on an empty tree. When the control row has no room left
(a long profile or version name), it wraps onto a second line; a pill's
text never breaks.

- **Limits**: at most 3,000 scenarios (`MAX_SAMPLE_SIZE`). Your own
  number must be a whole number from 1 to 3,000. "Full scenario space"
  refuses a space of more than 3,000 with an alert; its tooltip gives the
  count. Asking for more scenarios than the space has, with 30 or your
  own number, shows an alert and lists the full space instead; your own
  number's box then shows the size of the space.
- **Counting**: the size shown is `Model.scenarioSpaceSize()`, and the
  sampler weighs each XOR's children by the counts in `allowed` (from
  `Model.applyMarks()`): the sum of the children's counts for an XOR with
  children and their product otherwise, times the node's number of
  options (or 1), counting only the children a scenario may hold and the
  options a node may take. `sample` needs `allowed`; `enumerate` and
  `scenarioFor` without it cover the whole space. The redraw key
  (`spaceKey`) holds the tree and the marks themselves, so any mark
  change redraws the graph, even one that changes no count.
- **A random sample** (`Calculations.sample`) draws each scenario on its
  own, from the root node down: every node takes a uniformly random
  allowed option, an AND takes every possible child and an XOR one
  possible child with probability `count / sum`, so every scenario the
  marks allow is equally likely (a sample can hold the same scenario
  twice). A scenario is a list of `{ id, label, value }`, where `value`
  is the chosen option, or `''` for a node without options.
- **The full space** (`Calculations.enumerate`) lists every scenario
  the marks allow once, in tree order: each node's allowed options in
  turn, an AND combining its possible children and an XOR taking each
  possible child in turn.
- **The marks** follow the rules of the size: a `never` node under an
  AND is left out of the scenario, so its numbers don't count and
  `selected()` is false for its label. With no marks, a seed draws the
  same scenarios as on the whole space.
- **Following the tree**: each sample has a random seed
  (`Calculations.seededRandom`, a mulberry32 generator). When the tree
  or its marks change, the sample is drawn again with the same size and
  seed, so the
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
  frame: its title and text, then a row with the sample controls. A
  sample opens the **report** in its place, in a solid frame, and
  scrolls to it. The report's head keeps the same two rows, so the
  sample controls stay where they were, and a new sample replaces the
  report. The × in the head's top right closes it and drops the sample;
  that is not an undo step.
- Only the text (`calc-report-text`) is redrawn with each render; the
  sample controls and the × stay in place (the × is shown with
  `hidden`), so their ids and listeners in `calculations-tab.js`
  never change.
- **The head** is titled "Report" and says under it what was drawn,
  e.g. "1,000 random scenarios out of 2,560 · 815 different ones (31.8%
  of the space) · every scenario is equally likely", or for a full
  listing "All 2,560 scenarios of the space". The title is the same for
  both, so it never reads as an example ("sample") report.
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
  or deleted), the table goes back to sorting by `#`. KPI cells are coloured from green (lowest) through
  yellow to peach (highest), per column; not red, which is kept for errors.
- **Option headings** are the boxes' labels. A label that repeats (two
  `material` boxes) gets its labelled ancestors in front, the nearest
  first, until the headings are unique: an ancestor with one value adds
  that value ("windows / material"), any other its label. Headings that
  are still alike get a count ("material (2)").
- **"Export table as CSV"** sits on the "Sampled scenarios" heading,
  next to the table it saves (see "CSV files").
- **Opening a scenario**: clicking a `#`, or a card's lowest or highest
  button (which first turns to the right page), sets every drop-down in
  the graph to that scenario's options (`Calculations.choicesFor`),
  marks its row and scrolls up. The graph's toolbar then reads
  "Scenario #104 from the report is on screen", until an option is
  picked by hand or a new sample is drawn.

### The Action tree tab's bottom bar

"Calculations (live)" shows the scenario space size (with the always/never
marks on screen, the same size as the Calculations tab's) and its
contradiction warning, then the nodes in the tree
(`Model.classCounts()`): **Subjects**, **Approaches** and **Features**
count the nodes of that class, and **Feature values** adds up the options
of every Feature node (a Feature with `(keep_current; replace)` counts
2). Profiles don't change these counts. Then each KPI under its
`displayName` (or its name), and the link "Go to Calculations →". With no
KPI it shows "KPIs none yet". The metrics wrap as three groups, each kept
on one line while it fits: the size with its warning, the four counts,
and the KPIs; a group breaks inside only when it is wider than the bar.

For now the KPIs stay greyed out with "–", and their tooltip reads "Not
shown yet. Later this bar shows the scenario chosen in the Calculations
tab." A sample's mean on the Action tree tab was unclear. The code that
showed it (`≈` and the sample's mean, or the exact mean of a full
listing) is still in `calculations-tab.js`, switched off by
`BAR_SHOWS_MEANS = false`. How the Action tree tab should show a chosen
scenario (the tree and these KPIs) is still open: a first version was
built and taken out again, to be settled with the supervisor first.

### Numbers

Numbers use British English (`toLocaleString('en-GB')`), with a comma
between thousands. Whole numbers have no decimals ("0", "450"), other
numbers under 1,000 keep up to two ("0.25"), and numbers from 1,000 up
are rounded ("27,868"). Counts have no decimals, and shares one
("31.8%", or "under 0.1%").

### CSV files

"Export table as CSV" saves the report's scenario table as a CSV file for
a spreadsheet, `novadm-scenarios.csv`, written by `Util.csvText` and
saved through `TreeIO.download`:

- **The format**: a comma between cells, a decimal point and no
  thousands separator; RFC 4180 quoting (a cell with `,`, `"` or a line
  break goes in double quotes, and a `"` inside is doubled); CRLF line
  ends; and a UTF-8 byte order mark, so "CO₂e" and "m²" show intact.
  Number cells are plain numbers (`52000`, `0.25`, `-10`); a calculated
  value that gives text or true/false is written as that text (`high`,
  `true`), as the table shows it; an empty cell means n/a or an error.
  The table and the file share these rules (`cellValue`, `optionText`,
  `kpiHeading` in `calculations-report.js`).
- **The formula guard**: a text cell that starts with `=`, `+`, `-`, `@`,
  a tab or a carriage return gets an apostrophe in front (`'=SUM(A1)`,
  `'-10%`), so a spreadsheet never runs a label from someone else's file
  as a formula; so does one that starts with spaces or a line break
  before `=`, `+`, `-` or `@` (`' =1+1`), as some programs trim them
  first. Inside a text cell, a `;` or tab followed by a formula start
  gets an apostrophe after it (`roof;'=x`): a spreadsheet set to a
  decimal comma (Danish, Slovenian Excel) splits the file on `;`, and
  the part after it would otherwise be a cell of its own that starts
  with a formula. Quotes don't help there, since such a spreadsheet only
  honours a quote at the start of its field. Numbers are never guarded,
  so a negative number stays a number, and normal labels (`a; b`,
  `keep_current`) are unchanged.
- **The rows**: every scenario of the sample, not only the page on
  screen, in the table's sort order. Its columns are the table's: `#`,
  each KPI as `name (unit)`, and the option headings; an option cell
  holds the option, "chosen" for a node without options, or nothing when
  the scenario leaves the node out.
- **The tooltip** reads "Save every scenario of the table, in its
  current order, as a CSV file.": no file name, no format details, and
  no spreadsheet program or country.

### PNG images

- **"PNG"** on each KPI card saves that card as it looks on screen (name
  and unit, mean, min/median/max/std dev, histogram, lowest and highest)
  as `novadm-<kpi>.png`, named after the calculated value
  (`novadm-sum.png`), without its PNG button. The graph has no PNG
  button.
- **How** (`TreeIO.savePng`, no library): the card is cloned with each
  part's computed style written into it (the stylesheet doesn't apply
  inside an image), put in an SVG `foreignObject`, drawn on a canvas at
  twice its size on the surface colour, and downloaded. The copy gets
  the card's size rounded to whole pixels (at most half a pixel off):
  the browser draws an SVG image at a whole-pixel size, so a fractional
  card lost part of its right border and left a white strip below.
- A browser that refuses to draw the image shows an alert: "This browser
  could not make the image. Try Chrome, Edge or Firefox." Safari is left
  out: WebKit is known to refuse a canvas that has drawn an SVG with a
  `foreignObject` (not tested here).

### PDF of the report

- **"Save report as PDF"** sits at the right of the report head's Sample
  row, centred on it like the Sample buttons, while a report with
  scenarios is open. It calls `window.print()`; the browser's print
  dialog saves the PDF. Its tooltip: "Open the print dialog, where you
  can save the report as a PDF file".
- **What the PDF holds**, on A4 landscape pages (`@page`, 10 mm
  margins): a header line "k45-case · Version: Initial version ·
  Profile: Budget · 24 October 2026" (the document's name, then the full
  names, `· unsaved` when it applies; "(changed)" after the profile when
  the marks on screen differ from it, or when marks are set and no
  profile is loaded: "Profile: none (changed)", `Model.profileChanged()`),
  the
  file's source line under it when there is one (K45 credits COWI and
  PROBONO), the report head ("Report" and its summary line), the KPI
  cards, and the table's page on screen (at most 100 rows). The graph,
  the tabs, the control rows, the editor panel, every button, the pagers
  and the hint above the table are left out. Table cells keep their
  colours (`print-color-adjust: exact`); a card or a table row never
  breaks across two pages, and the table's heading repeats on each page.
- **A wide table**: # and the KPI columns always print; option columns
  follow from the left as long as they fit the page width (1,040 px of
  the 1,047 within the margins, measured on screen, where the table has
  the same font). The others are left out for the print only.
- **The print note** under the table says what is left out, e.g. "The
  table shows scenarios 1–100 of 2,560, the page on screen. The options
  of 6 more boxes don't fit the page. Export table as CSV has every
  scenario and column." Nothing is left out, no note.
- **The document's name** is the imported file's name without `.json`
  (`Model.getDocumentName()`, set by `TreeIO.newDocument`); the example,
  Clear tree and a new document have none, and the header then starts at
  "Version: …". It isn't saved in the file; undo and redo keep it, so
  undoing an import also brings the earlier name back.
- **The PDF's file name**: browsers suggest the page's title, so while
  printing the title is `novadm-report-<name>` (`novadm-report` without
  a name), and `afterprint` restores "NovaDM action tree editor".
- **How**: the button fills the header and the note, marks the columns
  that don't fit and puts the class `calc-printing` on `<html>`; the
  print stylesheet applies only under that class, so printing the page
  any other way (Ctrl+P) is as before, apart from the A4 landscape page.
  `afterprint` undoes it all.
- **Size**: the example's full listing prints on 5 pages, a sample of 30
  on 2, and `full-tree.json` with 3,000 scenarios on 5 (6 of its 139
  columns fit). The histograms stay vector graphics, so they stay sharp
  in the PDF and in a LaTeX document (`\includegraphics`).

## File format (`.json`, format id `novadm-action-tree`)

`parser.js`'s `TREE_FILE_FORMAT` is the only place that knows how a
document looks on disk. The rest of the editor works with "specs" (a
plain array of `{ id, kind, nodeClass, label, value, children }` objects,
`id` optional) and a small document wrapper: `{ tree, profile,
calculations, history, source }`, where `tree`, `profile` and
`calculations` are the current version's as on screen.

The current file (version 6) has these keys, always in this order (blank
lines between the sections are valid JSON and are written on purpose):

```
{
	"format": "novadm-action-tree",
	"version": 6,
	"source": "",

	"versionControl": { "head": "Add scaffolding", "edges": [
		{ "from": "Initial version", "to": "Add scaffolding", "comment": "..." } ] },

	"actionTree": [
		{ "id": "Initial version", "created": "2026-10-19",
			"profile": { "active": null, "current": { "<nodeId>": "always" },
				"currentValues": { "<nodeId>": { "<value>": "never" } },
				"saved": [ { "name": "Budget", "constraints": { "<nodeId>": "never" },
					"valueConstraints": {} } ] },
			"tree": [ ... ],
			"calculations": { "attributes": ["price", "co2"],
				"units": { "price": "DKK", "co2": "kg CO₂e" },
				"values": { "windows_glazing": { "price": { "keep_double": 0, "replace_triple": 52000 } },
					"replace_brick_facade": { "price": 210000 } },
				"derived": [ { "name": "sum", "displayName": "Sum", "formula": "total(price)",
					"unit": "DKK", "kpi": true } ] } },

		{ "id": "Add scaffolding", ... } ]
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
- **`actionTree`** – the snapshots: a list of `{ id, created, profile,
  tree, calculations }`, the numbers last, after the tree whose labels
  they use. `profile` and `calculations` are always written, even when
  empty, so someone editing the file by hand sees where things go. A
  snapshot id is free text (git-style, e.g. "Add scaffolding"); `created`
  is an optional `YYYY-MM-DD` date (older files have none). The editor
  loads the snapshot named by `versionControl.head` (default: the last
  one). On import, every node without an `id` gets a new one that is
  used nowhere else in the file (`n<number>`, also avoiding ids named in
  any snapshot's `profile`); root nodes without an id all get the same new id, so the
  root never shows up as a change. A node whose id was removed by hand
  therefore counts as a new node.
- **`versionControl`** – `head` and `edges` (`from` -> `to`, optional
  `comment`; branches are two edges leaving the same snapshot, a merge is
  a snapshot with two incoming edges). Edges must not go round in a
  circle (a snapshot based on itself); such a file is rejected. On export
  what is on screen replaces the head snapshot (the editor asks first if
  it has unsaved changes, even when it is the only version, and refuses if other
  versions are based on the head and its tree changed). A fresh document
  has one snapshot called "Initial version" and no edges.
- **`profile`** (per snapshot) – `current` / `currentValues` are the
  node and value constraints on screen in that version, `saved` its
  named profiles, `active` the loaded one (or `null`). Constraints are
  keyed by node `id`, which is why saved nodes carry an `id` (unique
  within a snapshot; kept on load, so profiles keep pointing at the same
  nodes). Constraints naming ids that aren't in the snapshot's tree (or
  values its node doesn't have) are dropped silently on import and
  export, so exporting, importing and exporting again gives the same
  file. A snapshot without `profile` has no profiles.
- **`calculations`** (per snapshot) – the Calculations tab's data in the
  tab's own shape, keyed by label, not inside the nodes: nodes that share
  a label and option share their numbers, and numbers of labels that
  aren't in the tree are kept. Empty objects in `values` and empty units
  are left out; a calculated value is written `{ name, displayName?,
  formula, unit?, kpi? }`, without empty optional fields (`kpi` only
  when true). It is checked before anything changes, with a message that
  names the place ("Snapshot "Roof" > calculations > values >
  windows_glazing > price > replace_triple: "abc" is not a number."):
  - `attributes`: a list of names that work in formulas, no duplicates;
  - `units`: attribute → text of up to 20 characters;
  - `values`: label → attribute → a finite number, or option → finite
    number; the attribute names must work in formulas;
  - `derived`: a list of `{ name, formula, displayName?, unit?, kpi? }`
    with unique names that work in formulas, text fields and a true/false
    `kpi`.

  A formula with an error is not an import error: the tab shows the
  error, as after typing it. A snapshot without `calculations` gets the
  starter data, and a `calculations` without `attributes` gets the
  attributes found in `values`, in order. Keys are read with `Util.own`
  and written with `Util.setOwn`, so a label such as `__proto__` stays an
  ordinary key. A snapshot may hold at most 500 calculated values
  (`MAX_CALCULATED_VALUES`), so a chain of them that refer to each other
  can't overflow the stack.
- Each part is read by its own small function in `parser.js`, and
  `validateDocument()` checks all of them before the live editor is
  touched. Import (`tree-io.js`) reads, validates and copies the whole
  file once in one `try`, so a file nested too deeply (in a field the
  format doesn't know, too) gives "the file is nested too deeply to
  read." instead of a half-imported document.

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

Export file suggests the document's name (the imported file's, e.g.
`k45-case.json`), or `defaultName` (`novadm-action-tree.json`) when
it has none (the example, Clear tree, a new document).

To switch to a different file type: edit `extension` / `mimeType` /
`defaultName` on `TREE_FILE_FORMAT`, and rewrite `serialize()` /
`parse()`. `parse()` must throw an `Error` with a readable message if
the text isn't a NovaDM file. (If the new format is binary, the
`reader.readAsText` / `new Blob` calls in `tree-io.js`'s import/export
handlers need to change too.)

## Example trees

All `.json` examples are format version 6, made with the editor's own
import and export (never by hand). `sample-tree.json` holds the example
data (`sample-attributes.js`) in its version; the others have the starter
data in every version.

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
  (`windows_glazing` changed on both sides). Its two profiles ("Low
  budget", "Underfloor heating") were one global list in version 5; each
  version now holds its own copy, pruned to its tree, so "Low budget"
  never forbids `n11` in Facade, which deleted that node. Use it to try Open,
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
