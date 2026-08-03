# NovaDM action tree editor

A browser-based visual editor for NovaDM action trees, built as part of an MSc thesis at Aarhus University on visual authoring tools for renovation decision-making.

NovaDM encodes renovation decisions as hierarchical AND/XOR action trees (subjects, features, approaches). This tool imports, pastes, visualises, and exports `.ndm` action tree files.

## Status

Early prototype. The tree editor (`editor/`) works for import, paste, render, and export. Node creation/editing, and the Home, Examples, and Help pages, are not built yet.

## Quick start

Open `editor/index.html` in a browser. No install, no build step, no server required.

- **Import** a `.ndm` file, or **paste** `.ndm` text directly
- **Load an example** for a worked case, taken from a real renovation report
- **Export** the current tree back to `.ndm`

## Repository structure

```
editor/       Tree editor (core tool)
src/          Modular JS source (model, parser, layout, canvas, etc.)
examples/     Starter .ndm trees
styles/       Shared stylesheet
spec/         Grammar and architecture notes (to add)
```

## Motivation

This tool is inspired by a lack of NovaDM tangible tools and solves a specific problem: visualising and editing action trees. It is not a general-purpose tree editor, and it does not aim to be one.

## License

To be added.
