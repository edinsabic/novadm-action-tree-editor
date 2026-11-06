<h1>
	<picture>
		<source media="(prefers-color-scheme: dark)" srcset="resources/logos/renata-logo-dark.svg">
		<img src="resources/logos/renata-logo.svg" alt="RENATA – Renovation action tree authoring" width="277">
	</picture>
</h1>

Renovating a building means choosing between a great many options. RENATA builds on the Renovation Domain Model (NovaDM), a formal modelling framework for supporting renovation design and decision-making. Lay out the options as an action tree, see how many scenarios they add up to, and compare those scenarios on cost, CO₂ and any other KPI.

RENATA was built as part of a joint MSc thesis at Aarhus University on visual authoring tools for renovation.

## Getting started

1. Download **Source code (zip)** from the [latest release](https://github.com/edinsabic/novadm-action-tree-editor/releases/latest), under **Assets**.
2. Unzip the file.
3. Open `index.html` in your browser.

RENATA opens with an example tree that uses made-up numbers. For a short walk-through, click **Quick start** at the top right of the page. **Documentation**, next to it, covers everything in detail.

Your work stays on your computer. Use **Export file** to save it as a `.json` file, and **Import file** to open it again.

## Features

- **Build action trees.** Drag nodes into place, or generate a tree from the Danish Energy Agency's or NovaDM's list of renovation subjects. View it as a list or a diagram.
- **See the scenario space.** The number of possible scenarios updates with every change.
- **Set constraints with profiles.** Mark a choice as always or never, and save your marks as a named profile.
- **Keep versions.** Save, open, restore and merge versions. Each one holds its own tree, profiles and numbers.
- **Calculate KPIs.** Give each option numbers with units, such as a price and its CO₂, and combine them with simple formulas.
- **Compare scenarios.** Sample the scenario space, or list all of it up to 3,000 scenarios, in a report with each KPI's mean, spread and distribution.
- **Share your results.** Save the report as a PDF, its table as a CSV file and each KPI card as a PNG image.
- **Work with plain files.** A tree and all its versions live in one readable `.json` file, which you can share or edit by hand.

## Repository structure

```
index.html        The editor
src/              JavaScript
  core/           Model, file format, versions, calculations
  action-tree/    Action tree tab
  calculations/   Calculations tab
  shared/         Used by both tabs
  app.js          Start-up
styles/           Stylesheet
resources/        Images
examples/         Example trees, including the K45 case
spec/             Data model and file format
```

## Motivation

RENATA is inspired by a lack of NovaDM tangible tools and solves a specific problem: visualising and editing action trees. It is not a general-purpose tree editor, and it does not aim to be one.

## License

To be added.
