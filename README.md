# NovaDM action tree editor

A browser-based, client-side visual editor for NovaDM action trees, built as part of an MSc thesis at Aarhus University on visual authoring tools for renovation decision-making.

NovaDM is a formal domain model for building renovation design space exploration, with action trees representing the decision-making process. This tool builds, visualises, imports and exports these trees as `.json` files, allowing them to be edited, versioned, and shared by exporting their `.json` representation. The tool is implemented in vanilla JavaScript, HTML and CSS, with no build step or server required.

## Status

Version 1.0.0. The tree editor (`editor/`) builds and edits trees in two layouts, with always/never profiles, a version history and undo/redo. The Scenario space tab, the cost, CO₂, score metrics, etc., are not yet implemented, but are planned for a future version.

## Quick start

Open `editor/index.html` in a browser. No install, no build step, no server required.

- **Drag** AND/XOR nodes from the editor panel onto the tree, and edit the selected node in the panel
- **Click** a node's dot or an option chip to mark it always or never, and save the result as a **profile**
- **Save, open, restore, merge and delete** versions of the tree in the version history
- **Import** or **export** a `.json` file holding the tree, its profiles and its history
- **Load example tree** for a worked example; more examples, such as the K45 case, are in `examples/`

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
