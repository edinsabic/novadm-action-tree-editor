# NovaDM action tree editor

A browser-based, client-side visual editor for NovaDM action trees, built as part of an MSc thesis at Aarhus University on visual authoring tools for renovation decision-making.

NovaDM is a formal domain model for building renovation design space exploration, with action trees representing the decision-making process. This tool builds, visualises, imports and exports these trees as `.json` files, allowing them to be edited, versioned, and shared by exporting their `.json` representation. The tool is implemented in vanilla JavaScript, HTML and CSS, with no build step or server required.

## Status

Version 1.3.0. The editor (`index.html`) has two tabs. The **Action tree** tab builds and edits trees in two layouts (List and Diagram), with always/never profiles, a version history, undo/redo and counts of the subjects, approaches, features and feature values; its bottom bar estimates each KPI from the Calculations tab's sample. The **Calculations** tab follows that tree: it gives every option numbers with units (such as a price and its CO₂), works out calculated values and KPIs (Cost and GWP, and any you add) with small formulas that follow when a label or a calculated value is renamed, and samples the scenario space, or lists all of it, in a report with each KPI's mean, spread and distribution. The report can be saved as a CSV table for a spreadsheet, a PNG image per KPI card and a PDF. The always/never marks apply there too, so both tabs count the same scenarios. Every version keeps its own tree, profiles and numbers, and the `.json` file (format version 6) holds them all. The example's numbers are made up.

## Quick start

Download the source code zip, unzip it and open `index.html` in a browser. No install, no build step, no server required. The zip of the latest release is on the [Releases page](https://github.com/edinsabic/novadm-action-tree-editor/releases/latest), under **Assets** → **Source code (zip)**.

- **Start a tree**: drag an AND or XOR node from the editor panel onto the empty tree, load the example or a file, or **Generate tree** from one of two subject lists (Danish Energy Agency or NovaDM)
- **Switch the layout** between **List** and **Diagram**, and edit the selected node in the editor panel; a Subject node is picked from a menu, with the same subject list switch at its top
- **Click** a node's dot or an option chip to mark it always or never, and save the result as a **profile**
- **Save, open, restore, merge and delete** versions in the version history; each version holds its tree, profiles and numbers
- **Import file** or **Export file** (on either tab): a `.json` file holding the versions with their trees, profiles and numbers
- **Load example tree** for the worked example the editor opens with; more examples, such as the K45 case and `sample-tree-with-u-value.json` (the example with a U-value as a KPI of its own), are in `examples/`
- **Calculations** tab: click a box in the graph to type its numbers, then sample the scenarios to see the KPIs; its **Profiles** pill switches profiles there too, and only the scenarios the marks allow are sampled
- **Rename…** a calculated value (its name in formulas and the name shown in the report), remove an attribute with the trash icon in its Units list, or delete a calculated value with the icon on its box
- **Save the report**: **Export table as CSV** on the scenario table, **PNG** on each KPI card, and **Save report as PDF** in the report's head (through the browser's print dialog)

## Repository structure

```
index.html        The editor page: open it in a browser
src/              JavaScript modules
  core/           Model, file format, version history and calculations (no DOM)
  action-tree/    The Action tree tab: the tree, its editor panel, Generate tree
  calculations/   The Calculations tab and its report
  shared/         Used by both tabs: version and profile flyouts, undo, files
  app.js          Tabs and start-up (runs last)
styles/           Stylesheet
examples/         Example trees and default tree
spec/             Grammar, file format and design notes
```

## Motivation

This tool is inspired by a lack of NovaDM tangible tools and solves a specific problem: visualising and editing action trees. It is not a general-purpose tree editor, and it does not aim to be one.

## License

To be added.
