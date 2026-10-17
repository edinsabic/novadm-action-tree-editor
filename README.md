# NovaDM action tree editor

A browser-based, client-side visual editor for NovaDM action trees, built as part of an MSc thesis at Aarhus University on visual authoring tools for renovation decision-making.

NovaDM is a formal domain model for building renovation design space exploration, with action trees representing the decision-making process. This tool builds, visualises, imports and exports these trees as `.json` files, allowing them to be edited, versioned, and shared by exporting their `.json` representation. The tool is implemented in vanilla JavaScript, HTML and CSS, with no build step or server required.

## Status

Version 1.0.0. The editor (`editor/`) has two tabs. The **Action tree** tab builds and edits trees in two layouts, with always/never profiles, a version history and undo/redo. The **Calculations** tab follows that tree: it gives every option numbers with units (such as a price and its CO₂), works out calculated values and KPIs (Sum and GWP) with small formulas, and samples the scenario space, or lists all of it, in a report with each KPI's mean, spread and distribution. Its numbers are not saved in the `.json` file yet, and the example's numbers are made up.

## Quick start

Open `editor/index.html` in a browser. No install, no build step, no server required.

- **Drag** AND/XOR nodes from the editor panel onto the tree, and edit the selected node in the panel
- **Click** a node's dot or an option chip to mark it always or never, and save the result as a **profile**
- **Save, open, restore, merge and delete** versions of the tree in the version history
- **Import** or **export** a `.json` file holding the tree, its profiles and its history
- **Load example tree** for a worked example; more examples, such as the K45 case, are in `examples/`
- **Calculations** tab: click a box in the graph to type its numbers, then sample the scenarios to see the KPIs

## Repository structure

```
editor/       Tree editor page
src/          JavaScript modules (model, file format, rendering, history, etc.)
styles/       Stylesheet
examples/     Example trees and default tree
spec/         Grammar, file format and design notes
```

## Motivation

This tool is inspired by a lack of NovaDM tangible tools and solves a specific problem: visualising and editing action trees. It is not a general-purpose tree editor, and it does not aim to be one.

## License

To be added.
