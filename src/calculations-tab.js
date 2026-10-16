window.NovaDM = window.NovaDM || {};

/**
 * The Calculations tab: a graph from the labelled nodes of the action tree on screen and their numbers
 * to the derived attributes and KPIs, with an option picker per node; an editor panel for the
 * selected box; and a sample of scenarios, reported by calculations-report.js, whose KPI means also
 * fill the Action tree tab's bottom bar. Its data (numbers and derived attributes, starting from
 * NOVADM_SAMPLE_ATTRIBUTES) lives in memory: undo covers it, the file does not yet.
 */
NovaDM.CalculationsTab = (function (Model, Calculations, Render, CalculationsReport, Util) {
	'use strict';

	var MAX_SAMPLE_SIZE = 10000;
	var LABEL_WIDTH = 370;
	var INDENT = 16;
	var DERIVED_WIDTH = 220;
	var COLUMN_GAP = 70;
	var HEAD_HEIGHT = 24;
	var ROW_HEIGHT = 18;
	var NODE_PADDING = 4;
	var DERIVED_HEIGHT = HEAD_HEIGHT + ROW_HEIGHT + NODE_PADDING;
	var NODE_GAP = 10;
	var MARGIN = 16;
	var ARROW_GAP = 2;
	var ZOOM_STEP = 10;
	var MIN_ZOOM = 30;
	var MAX_ZOOM = 200;
	var NOT_CHOSEN = 'none';

	var escapeHtml = Util.escapeHtml;
	var formatNumber = CalculationsReport.formatNumber;
	var formatCount = CalculationsReport.formatCount;
	var valueHtml = CalculationsReport.valueHtml;
	var entriesById = CalculationsReport.entriesById;

	var panel = document.getElementById('calculations');
	var graphHost = document.getElementById('calc-graph');
	var editorHost = document.getElementById('calc-editor-host');
	var reportHead = document.getElementById('calc-report-head');
	var kpiBar = document.getElementById('scenario-kpi-metrics');
	var sizeValue = document.getElementById('calc-space-size');
	var zoomLabel = document.getElementById('calc-zoom-label');
	var sampleSizeInput = document.getElementById('calc-sample-size');

	var data = initialData();
	var analysis = Calculations.analyze(data, []);
	var evaluatedTreeKey = null;
	var sample = null;
	var results = [];
	var statsByName = Object.create(null);
	var choices = { options: {}, branches: {} };
	var selected = null;
	var zoomPercent = 100;

	function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

	function isNumber(value) { return typeof value === 'number'; }

	function initialData() {
		var source = typeof NOVADM_SAMPLE_ATTRIBUTES === 'undefined' ? {} : Util.clone(NOVADM_SAMPLE_ATTRIBUTES);
		return { values: source.values || {}, derived: source.derived || [] };
	}

	function findDerived(name) {
		return data.derived.filter(function (d) { return d.name === name; })[0] || null;
	}

	function isVisible() { return !panel.hidden; }

	/* ---------- Tree ---------- */

	function rootNode() { return Model.root.children[0] || null; }

	function walkTree(nodes, visit) {
		nodes.forEach(function (n) {
			visit(n);
			walkTree(n.children, visit);
		});
	}

	function treeLabels() {
		var labels = [];
		walkTree(Model.root.children, function (n) {
			if (n.label && labels.indexOf(n.label) === -1) labels.push(n.label);
		});
		return labels;
	}

	function pathTo(id) {
		function find(node, path) {
			var here = path.concat(node);
			if (node.id === id) return here;
			for (var i = 0; i < node.children.length; i++) {
				var found = find(node.children[i], here);
				if (found) return found;
			}
			return null;
		}
		return rootNode() ? find(rootNode(), []) : null;
	}

	function treeBoxes() {
		var boxes = [];

		function visit(node, path, depth) {
			var here = path.concat(node);
			if (node.label) boxes.push({ node: node, path: here, depth: depth });
			node.children.forEach(function (c) { visit(c, here, node.label ? depth + 1 : depth); });
		}

		if (rootNode()) visit(rootNode(), [], 0);
		return boxes;
	}

	function treeKey() { return JSON.stringify(Model.treeSpecs()); }

	function optionsOf(node) { return node.value.length ? node.value : ['']; }

	function canBeLeftOut(path) {
		return path.slice(0, -1).some(function (n) { return n.kind === 'XOR' && n.children.length > 1; });
	}

	function choiceKeys(box) {
		var keys = box.node.value.length
			? box.node.value.map(function (v, i) { return { key: String(i), text: v }; })
			: [{ key: 'chosen', text: 'chosen' }];
		if (canBeLeftOut(box.path)) keys.push({ key: NOT_CHOSEN, text: 'not chosen' });
		return keys;
	}

	function hasChoice(box) { return choiceKeys(box).length > 1; }

	function boxRows(node) {
		if (!own(data.values, node.label)) return [];
		return Object.keys(data.values[node.label]).filter(function (attribute) {
			return optionsOf(node).some(function (option) {
				return Calculations.numberFor(data.values, node.label, attribute, option) !== null;
			});
		});
	}

	function selectedNode() {
		return selected && selected.kind === 'node' ? Model.findNode(Model.root, selected.id) : null;
	}

	function dropStaleSelection() {
		if (!selected) return;
		var gone = selected.kind === 'node' ? !selectedNode() : !findDerived(selected.name);
		if (gone) selected = null;
	}

	/* ---------- Sample and evaluation ---------- */

	function scenarioKey(scenario) {
		return scenario.map(function (e) { return e.id + '=' + e.value; }).join('|');
	}

	function takeSample(size, seed) {
		var root = rootNode();
		var scenarios = Calculations.sample(root, size, Calculations.seededRandom(seed));
		var distinct = Object.create(null);
		scenarios.forEach(function (s) { distinct[scenarioKey(s)] = true; });
		sample = {
			size: size,
			seed: seed,
			treeKey: treeKey(),
			total: Calculations.count(root),
			distinct: Object.keys(distinct).length,
			scenarios: scenarios
		};
		CalculationsReport.markShownRow(null);
	}

	function numbersOf(name) {
		return results.map(function (r) { return r[name]; }).filter(isNumber);
	}

	function evaluateAll() {
		var key = treeKey();
		if (sample && sample.treeKey !== key) takeSample(sample.size, sample.seed);
		analysis = Calculations.analyze(data, treeLabels());
		results = sample
			? sample.scenarios.map(function (s) { return Calculations.evaluateScenario(analysis, data, s); })
			: [];
		statsByName = Object.create(null);
		data.derived.forEach(function (d) { statsByName[d.name] = Calculations.statistics(numbersOf(d.name)); });
		evaluatedTreeKey = key;
	}

	function currentScenario() { return Calculations.scenarioFor(rootNode(), choices); }

	function currentResults() { return Calculations.evaluateScenario(analysis, data, currentScenario()); }

	function renderTab() {
		renderGraph();
		renderEditor();
		renderReport();
	}

	function renderSize() {
		sizeValue.innerHTML = Render.scenarioSizeHtml(Calculations.count(rootNode()));
	}

	function dataChanged() {
		evaluateAll();
		renderGraph();
		renderReport();
		renderSummary();
		Render.recordChange();
	}

	/** Renders the whole tab; samples again (same size and seed) when the tree changed since the last sample. */
	function render() {
		dropStaleSelection();
		evaluateAll();
		renderTab();
		renderSize();
		renderSummary();
	}

	function treeChanged() {
		if (treeKey() !== evaluatedTreeKey) {
			dropStaleSelection();
			evaluateAll();
			if (isVisible()) renderTab();
		}
		renderSize();
		renderSummary();
	}

	function getState() { return data; }

	function setState(state) {
		data = state ? Util.clone(state) : initialData();
		dropStaleSelection();
		evaluateAll();
		if (isVisible()) renderTab();
		renderSummary();
	}

	/* ---------- Graph layout ---------- */

	function inputsOf(item, boxes) {
		var inputs = [];

		function add(key, row) {
			var known = inputs.some(function (input) { return input.key === key && input.row === row; });
			if (!known) inputs.push({ key: key, row: row });
		}

		function boxesWith(label) {
			return boxes.filter(function (b) { return b.name === label; });
		}

		if (!item.refs) return inputs;
		item.refs.names.forEach(function (n) {
			if (analysis.byName[n]) add('d:' + n, null);
			else boxesWith(n).forEach(function (b) { add(b.key, null); });
		});
		item.refs.selected.forEach(function (l) {
			boxesWith(l).forEach(function (b) { add(b.key, null); });
		});
		item.refs.lookups.forEach(function (l) {
			boxesWith(l.label).forEach(function (b) {
				add(b.key, b.rows.indexOf(l.attribute) !== -1 ? l.attribute : null);
			});
		});
		item.refs.totals.forEach(function (attribute) {
			boxes.forEach(function (b) {
				if (b.rows.indexOf(attribute) !== -1) add(b.key, attribute);
			});
		});
		return inputs;
	}

	function derivedColumns(inputsByName) {
		var columns = Object.create(null);
		var visiting = Object.create(null);

		function columnOf(name) {
			if (columns[name] !== undefined) return columns[name];
			if (visiting[name]) return 0;
			visiting[name] = true;
			var inputs = inputsByName[name];
			var column = inputs.length ? 1 : 0;
			inputs.forEach(function (input) {
				if (input.key.indexOf('d:') === 0) column = Math.max(column, columnOf(input.key.slice(2)) + 1);
			});
			visiting[name] = false;
			columns[name] = column;
			return column;
		}

		analysis.items.forEach(function (item) { columnOf(item.name); });
		return columns;
	}

	function anchorY(node, row) {
		var index = row === null ? -1 : node.rows.indexOf(row);
		if (index === -1) return node.y + HEAD_HEIGHT / 2;
		return node.y + HEAD_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
	}

	function columnX(column) {
		return MARGIN + (column === 0 ? 0 : LABEL_WIDTH + COLUMN_GAP + (column - 1) * (DERIVED_WIDTH + COLUMN_GAP));
	}

	/**
	 * Lays out the graph: one box per labelled tree node in tree order, indented by depth, then the constants,
	 * all in column 0; every other derived attribute one column right of its rightmost input, stacked from the
	 * top in the order of its inputs. Returns nodes, edges and size.
	 */
	function layoutGraph() {
		var nodes = [];
		var byKey = Object.create(null);
		var y = MARGIN;
		var maxColumn = 0;

		function addNode(node) {
			nodes.push(node);
			byKey[node.key] = node;
		}

		treeBoxes().forEach(function (box) {
			var rows = boxRows(box.node);
			var indent = box.depth * INDENT;
			var height = HEAD_HEIGHT + rows.length * ROW_HEIGHT + (rows.length ? NODE_PADDING : 0);
			addNode({ key: 'n:' + box.node.id, kind: 'box', box: box, name: box.node.label, rows: rows,
				x: columnX(0) + indent, y: y, width: LABEL_WIDTH - indent, height: height });
			y += height + NODE_GAP;
		});
		var boxes = nodes.slice();
		var inputsByName = Object.create(null);
		analysis.items.forEach(function (item) { inputsByName[item.name] = inputsOf(item, boxes); });
		var columns = derivedColumns(inputsByName);

		analysis.items.forEach(function (item) {
			maxColumn = Math.max(maxColumn, columns[item.name]);
			if (columns[item.name] !== 0) return;
			addNode({ key: 'd:' + item.name, kind: 'derived', name: item.name, rows: [],
				x: columnX(0), y: y, width: DERIVED_WIDTH, height: DERIVED_HEIGHT });
			y += DERIVED_HEIGHT + NODE_GAP;
		});

		for (var column = 1; column <= maxColumn; column++) {
			analysis.items.filter(function (item) { return columns[item.name] === column; })
				.map(function (item) {
					var ys = inputsByName[item.name].filter(function (input) { return byKey[input.key]; })
						.map(function (input) { return anchorY(byKey[input.key], input.row); });
					var sum = ys.reduce(function (s, v) { return s + v; }, 0);
					return { item: item, middle: ys.length ? sum / ys.length : 0 };
				})
				.sort(function (a, b) { return a.middle - b.middle; })
				.forEach(function (placed, i) {
					addNode({ key: 'd:' + placed.item.name, kind: 'derived', name: placed.item.name, rows: [],
						x: columnX(column), y: MARGIN + i * (DERIVED_HEIGHT + NODE_GAP), width: DERIVED_WIDTH,
						height: DERIVED_HEIGHT });
				});
		}

		var edges = [];
		analysis.items.forEach(function (item) {
			var to = byKey['d:' + item.name];
			inputsByName[item.name].forEach(function (input) {
				var from = byKey[input.key];
				if (!from) return;
				edges.push({ from: from.key, to: to.key, x1: from.x + from.width, y1: anchorY(from, input.row),
					x2: to.x - ARROW_GAP, y2: to.y + HEAD_HEIGHT / 2 });
			});
		});

		var right = nodes.reduce(function (r, n) { return Math.max(r, n.x + n.width); }, 0);
		var bottom = nodes.reduce(function (b, n) { return Math.max(b, n.y + n.height); }, 0);
		return {
			nodes: nodes,
			byKey: byKey,
			edges: edges,
			width: right + MARGIN,
			height: bottom + MARGIN
		};
	}

	/* ---------- Graph ---------- */

	function selectedKey() {
		if (!selected) return null;
		return selected.kind === 'node' ? 'n:' + selected.id : 'd:' + selected.name;
	}

	function reach(edges, start, fromSide, toSide) {
		var seen = Object.create(null);
		var queue = [start];
		while (queue.length) {
			var key = queue.shift();
			for (var i = 0; i < edges.length; i++) {
				var next = edges[i][toSide];
				if (edges[i][fromSide] === key && !seen[next]) {
					seen[next] = true;
					queue.push(next);
				}
			}
		}
		return seen;
	}

	function highlightFor(layout) {
		var key = selectedKey();
		if (!key || !layout.byKey[key]) return null;
		var up = reach(layout.edges, key, 'to', 'from');
		var down = reach(layout.edges, key, 'from', 'to');
		return {
			node: function (k) { return k === key || up[k] || down[k]; },
			edge: function (e) {
				return (up[e.from] && (e.to === key || up[e.to])) || ((e.from === key || down[e.from]) && down[e.to]);
			}
		};
	}

	function edgeSvg(edge, highlight) {
		var lit = highlight && highlight.edge(edge);
		var cls = 'calc-edge' + (highlight ? (lit ? ' highlight' : ' dim') : '');
		var midX = (edge.x1 + edge.x2) / 2;
		return '<path class="' + cls + '" d="M' + edge.x1 + ' ' + edge.y1 + ' C' + midX + ' ' + edge.y1 + ', ' +
			midX + ' ' + edge.y2 + ', ' + edge.x2 + ' ' + edge.y2 + '"' +
			' marker-end="url(#' + (lit ? 'calc-arrow-highlight' : 'calc-arrow') + ')"/>';
	}

	function arrowMarkerSvg(id, extraClass) {
		return '<marker id="' + id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"' +
			' orient="auto"><path class="calc-arrowhead' + extraClass + '" d="M0,0 L10,5 L0,10 z"/></marker>';
	}

	function boxStyle(node) {
		return 'left:' + node.x + 'px; top:' + node.y + 'px; width:' + node.width + 'px; height:' + node.height + 'px;';
	}

	function stateClasses(node, highlight) {
		var key = selectedKey();
		return (node.key === key ? ' selected' : '') + (highlight && !highlight.node(node.key) ? ' dim' : '');
	}

	function choiceHtml(box, entry) {
		var node = box.node;
		var keys = choiceKeys(box);
		if (keys.length < 2) return entry && entry.value ? ' = ' + escapeHtml(entry.value) : '';
		var current = !entry ? NOT_CHOSEN : (node.value.length ? String(node.value.indexOf(entry.value)) : 'chosen');
		return '<span class="calc-equals">=</span>' +
			'<select class="calc-choice" data-calc-choose="' + escapeHtml(node.id) + '"' +
			' aria-label="' + escapeHtml('Option of ' + node.label + ' in this scenario') + '"' +
			' title="Choose the option of this node in the scenario on screen">' +
			keys.map(function (k) {
				return '<option value="' + k.key + '"' + (k.key === current ? ' selected' : '') + '>' +
					escapeHtml(k.text) + '</option>';
			}).join('') + '</select>';
	}

	function boxHtml(layoutNode, entries, highlight) {
		var node = layoutNode.box.node;
		var entry = entries[node.id];
		var rows = layoutNode.rows.map(function (attribute) {
			var value = entry ? Calculations.numberFor(data.values, node.label, attribute, entry.value) : null;
			return '<div class="calc-row"><span class="calc-row-name">' + escapeHtml(attribute) + '</span>' +
				'<span>' + valueHtml(value) + '</span></div>';
		}).join('');
		var cls = 'calc-node calc-label-node' + stateClasses(layoutNode, highlight) + (entry ? '' : ' muted');
		var label = escapeHtml(node.label);
		return '<div class="' + cls + '" data-calc-node="' + escapeHtml(node.id) + '"' +
			' style="' + boxStyle(layoutNode) + '"' + (entry ? '' : ' title="Not in this scenario"') + '>' +
			'<div class="calc-node-head">' +
			'<span class="calc-label-name" title="' + label + '">' + label + '</span>' +
			choiceHtml(layoutNode.box, entry) +
			'</div>' + rows + '</div>';
	}

	function derivedNodeHtml(node, values, highlight) {
		var item = analysis.byName[node.name];
		var derived = findDerived(node.name);
		var cls = 'calc-node calc-derived-node' + stateClasses(node, highlight) + (derived.kpi ? ' kpi' : '');
		var title = item.error || node.name + ' = ' + derived.formula;
		return '<div class="' + cls + '" data-calc-derived="' + escapeHtml(node.name) + '"' +
			' style="' + boxStyle(node) + '" title="' + escapeHtml(title) + '">' +
			'<div class="calc-node-head">' +
			'<span class="calc-derived-name">' + escapeHtml(node.name) + '</span>' +
			'<span class="calc-derived-value">' + valueHtml(values[node.name]) + '</span>' +
			'</div>' +
			'<div class="calc-formula-line">' + escapeHtml(derived.formula) + '</div></div>';
	}

	function renderGraph() {
		var layout = layoutGraph();
		var isEmpty = layout.nodes.length === 0;
		graphHost.classList.toggle('empty-hint', isEmpty);
		if (isEmpty) {
			graphHost.innerHTML = 'No nodes yet. Build a tree in the Action tree tab, or click "Load example".';
			return;
		}

		var scenario = currentScenario();
		var entries = entriesById(scenario);
		var values = Calculations.evaluateScenario(analysis, data, scenario);
		var highlight = highlightFor(layout);
		var boxes = layout.nodes.map(function (node) {
			return node.kind === 'box' ? boxHtml(node, entries, highlight) : derivedNodeHtml(node, values, highlight);
		});

		graphHost.innerHTML =
			'<div class="calc-canvas" style="width:' + layout.width + 'px; height:' + layout.height + 'px;' +
			' zoom:' + zoomPercent / 100 + ';">' +
			'<svg class="calc-edges" width="' + layout.width + '" height="' + layout.height + '">' +
			'<defs>' + arrowMarkerSvg('calc-arrow', '') + arrowMarkerSvg('calc-arrow-highlight', ' highlight') +
			'</defs>' +
			layout.edges.map(function (e) { return edgeSvg(e, highlight); }).join('') +
			'</svg>' +
			boxes.join('') +
			'</div>';
	}

	function revealSelected() {
		var el = graphHost.querySelector('.calc-node.selected');
		if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function choose(id, key) {
		var path = pathTo(id);
		if (!path) return;
		var node = path[path.length - 1];
		var i;
		if (key === NOT_CHOSEN) {
			for (i = path.length - 2; i >= 0; i--) {
				if (path[i].kind === 'XOR' && path[i].children.length > 1) {
					choices.branches[path[i].id] = path[i].children[path[i].children[0] === path[i + 1] ? 1 : 0].id;
					break;
				}
			}
		} else {
			if (node.value.length) choices.options[node.id] = node.value[Number(key)];
			for (i = 0; i < path.length - 1; i++) {
				if (path[i].kind === 'XOR') choices.branches[path[i].id] = path[i + 1].id;
			}
		}
		renderGraph();
		renderEditor();
		CalculationsReport.markShownRow(null);
	}

	function setZoom(percent) {
		zoomPercent = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, percent));
		zoomLabel.textContent = zoomPercent + '%';
		var canvas = graphHost.querySelector('.calc-canvas');
		if (canvas) canvas.style.zoom = zoomPercent / 100;
	}

	graphHost.addEventListener('click', function (e) {
		if (e.target.closest('select')) return;
		var nodeEl = e.target.closest('[data-calc-node]');
		var derivedEl = e.target.closest('[data-calc-derived]');
		if (nodeEl) selected = { kind: 'node', id: nodeEl.getAttribute('data-calc-node') };
		else if (derivedEl) selected = { kind: 'derived', name: derivedEl.getAttribute('data-calc-derived') };
		else selected = null;
		renderGraph();
		renderEditor();
	});

	graphHost.addEventListener('change', function (e) {
		var select = e.target.closest('[data-calc-choose]');
		if (select) choose(select.getAttribute('data-calc-choose'), select.value);
	});

	/* ---------- Editor panel ---------- */

	function helpHtml() {
		return '<div class="calc-help">' +
			'<span class="palette-label">How the graph works</span>' +
			'<p><span class="calc-help-label">Labels</span> (blue) hold a number per option, such as a price.' +
			' Pick an option in a label&rsquo;s drop-down to change the scenario on screen.</p>' +
			'<p><span class="calc-help-derived">Calculated values</span> (green) come from the nodes' +
			' whose arrows point into them.</p>' +
			'<p>Mark a calculated value as a <strong>KPI</strong> to see it in the sample report and in the' +
			' Action tree tab&rsquo;s bottom bar. Click a node to edit it.</p>' +
			'</div>';
	}

	function derivedFormHtml(derived) {
		return '<div class="editor-form">' +
			'<div class="calc-editor-head">' +
				'<div class="field">' +
					'<label>Calculated value</label>' +
					'<div class="calc-editor-title">' + escapeHtml(derived.name) + '</div>' +
				'</div>' +
				'<label class="calc-check">' +
					'<input id="calc-kpi" type="checkbox"' + (derived.kpi ? ' checked' : '') + ' /> KPI' +
				'</label>' +
			'</div>' +
			'<div class="field">' +
				'<label for="calc-formula">Formula</label>' +
				'<textarea id="calc-formula" class="calc-formula" rows="3" spellcheck="false"' +
					' data-typing-key="' + escapeHtml('formula:' + derived.name) + '">' + escapeHtml(derived.formula) +
					'</textarea>' +
				'<div id="calc-formula-error" class="calc-error-text" role="alert" hidden></div>' +
			'</div>' +
			'<div class="field">' +
				'<label>Value in this scenario</label>' +
				'<div id="calc-editor-value" class="calc-editor-value"></div>' +
			'</div>' +
			'<div class="editor-actions">' +
				'<button class="btn danger" type="button" data-calc-action="delete-derived">' +
					'Delete calculated value</button>' +
			'</div>' +
			'</div>';
	}

	function numberInputHtml(label, attribute, option) {
		var value = Calculations.numberFor(data.values, label, attribute, option);
		return '<input type="number" step="any" value="' + (value === null ? '' : value) + '"' +
			' aria-label="' + escapeHtml(attribute + ' for ' + (option || label)) + '"' +
			' data-typing-key="' + escapeHtml('value:' + label + '|' + attribute + '|' + option) + '"' +
			' data-value-label="' + escapeHtml(label) + '" data-value-attribute="' + escapeHtml(attribute) + '"' +
			' data-value-option="' + escapeHtml(option) + '" />';
	}

	function boxFormHtml(node) {
		var attributes = analysis.attributes;
		var entry = entriesById(currentScenario())[node.id];
		var table = '<div class="calc-table-wrap"><table class="calc-table calc-value-table">' +
			'<thead><tr><th>Option</th>' + attributes.map(function (a) {
				return '<th>' + escapeHtml(a) + '</th>';
			}).join('') + '</tr></thead>' +
			'<tbody>' + optionsOf(node).map(function (option) {
				var isCurrent = entry && (option === '' || option === entry.value);
				var cells = attributes.map(function (a) {
					return '<td>' + numberInputHtml(node.label, a, option) + '</td>';
				});
				var mark = isCurrent ? ' class="current" title="The option in the scenario on screen"' : '';
				return '<tr' + mark + '>' +
					'<th' + (option ? '>' + escapeHtml(option) : ' class="calc-na">when chosen') + '</th>' +
					cells.join('') + '</tr>';
			}).join('') + '</tbody></table></div>';

		return '<div class="editor-form">' +
			'<div class="field">' +
				'<label>Label</label>' +
				'<div class="calc-editor-title calc-label-title">' + escapeHtml(node.label) + '</div>' +
			'</div>' +
			(attributes.length ? table : '') +
			'<div class="note">A number per option and attribute; empty means no value. The graph shows the' +
				' numbers of the option on screen.</div>' +
			'<div class="editor-add-row">' +
				'<button class="btn" type="button" data-calc-action="add-attribute">+ Attribute</button>' +
			'</div>' +
			'</div>';
	}

	function renderDerivedStatus() {
		var errorEl = document.getElementById('calc-formula-error');
		if (!errorEl || !selected) return;
		var item = analysis.byName[selected.name];
		errorEl.textContent = item && item.error ? item.error : '';
		errorEl.hidden = !errorEl.textContent;
		document.getElementById('calc-editor-value').innerHTML = valueHtml(currentResults()[selected.name]);
	}

	function renderEditor() {
		var derived = selected && selected.kind === 'derived' ? findDerived(selected.name) : null;
		var node = selectedNode();
		if (derived) {
			editorHost.innerHTML = derivedFormHtml(derived);
			renderDerivedStatus();
		} else if (node) {
			editorHost.innerHTML = boxFormHtml(node);
		} else {
			editorHost.innerHTML = helpHtml();
		}
	}

	function setNumber(label, attribute, option, number) {
		var byAttribute = own(data.values, label) ? data.values[label] : (data.values[label] = {});
		var stored = own(byAttribute, attribute) ? byAttribute[attribute] : null;
		if (option === '') {
			byAttribute[attribute] = number === null ? {} : number;
			return;
		}
		if (!stored || typeof stored !== 'object') stored = byAttribute[attribute] = {};
		if (number === null) delete stored[option];
		else stored[option] = number;
	}

	function formulaChanged(derived, text) {
		derived.formula = text;
		dataChanged();
		renderDerivedStatus();
		revealSelected();
	}

	function nameProblem(name, kind) {
		if (!Calculations.isName(name)) {
			return '"' + name + '" is not a valid name. Use letters, digits and _, start with a letter or _,' +
				' and avoid if, then, else, total and selected.';
		}
		if (kind === 'attribute') {
			return analysis.attributes.indexOf(name) === -1 ? null : 'There is already an attribute "' + name + '".';
		}
		if (findDerived(name)) return 'There is already a calculated value "' + name + '".';
		if (analysis.labels.indexOf(name) !== -1) return '"' + name + '" is already a label.';
		return null;
	}

	function askName(question, kind) {
		var name = prompt(question);
		if (name === null) return null;
		name = name.trim();
		var problem = nameProblem(name, kind);
		if (problem) {
			alert(problem);
			return null;
		}
		return name;
	}

	function addDerived() {
		var name = askName('Name of the new calculated value (e.g. total_energy):', 'derived');
		if (!name) return;
		data.derived.push({ name: name, formula: '0' });
		selected = { kind: 'derived', name: name };
		dataChanged();
		renderEditor();
		document.getElementById('calc-formula').select();
		revealSelected();
	}

	function addAttribute(label) {
		var name = askName('Name of the new attribute (e.g. lifetime):', 'attribute');
		if (!name) return;
		var byAttribute = own(data.values, label) ? data.values[label] : (data.values[label] = {});
		byAttribute[name] = {};
		dataChanged();
		renderEditor();
	}

	function deleteDerived(name) {
		if (!confirm('Delete the calculated value "' + name + '"?')) return;
		data.derived = data.derived.filter(function (d) { return d.name !== name; });
		selected = null;
		dataChanged();
		renderEditor();
	}

	editorHost.addEventListener('input', function (e) {
		var t = e.target;
		var derived = selected && selected.kind === 'derived' ? findDerived(selected.name) : null;
		if (t.hasAttribute('data-value-attribute')) {
			var number = t.value === '' || !isFinite(Number(t.value)) ? null : Number(t.value);
			setNumber(t.getAttribute('data-value-label'), t.getAttribute('data-value-attribute'),
				t.getAttribute('data-value-option'), number);
			dataChanged();
		} else if (t.id === 'calc-formula' && derived) {
			formulaChanged(derived, t.value);
		}
	});

	editorHost.addEventListener('change', function (e) {
		var t = e.target;
		var derived = selected && selected.kind === 'derived' ? findDerived(selected.name) : null;
		if (t.id !== 'calc-kpi' || !derived) return;
		if (t.checked) derived.kpi = true;
		else delete derived.kpi;
		dataChanged();
	});

	editorHost.addEventListener('click', function (e) {
		var btn = e.target.closest('[data-calc-action]');
		if (!btn || !selected) return;
		var node = selectedNode();
		if (btn.getAttribute('data-calc-action') === 'delete-derived') deleteDerived(selected.name);
		else if (node) addAttribute(node.label);
	});

	/* ---------- Report ---------- */

	function renderReport() {
		CalculationsReport.render({
			sample: sample,
			results: results,
			statsByName: statsByName,
			derived: data.derived,
			analysis: analysis,
			optionBoxes: treeBoxes().filter(hasChoice),
			onShowScenario: showScenario,
			onClose: clearSample
		});
	}

	function showScenario(index) {
		choices = Calculations.choicesFor(rootNode(), sample.scenarios[index]);
		renderGraph();
		renderEditor();
		panel.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function clearSample() {
		sample = null;
		CalculationsReport.markShownRow(null);
		evaluateAll();
		renderReport();
		renderSummary();
	}

	/* ---------- Action tree tab's bottom bar ---------- */

	function summaryTitle(d, stats) {
		if (stats) {
			return d.name + ': mean of a sample of ' + formatCount(sample.size) + ' scenarios (profiles not applied).' +
				' Min ' + formatNumber(stats.min) + ', max ' + formatNumber(stats.max) + '.';
		}
		if (sample && sample.scenarios.length) {
			return d.name + ' has no number: every sampled scenario gives n/a or an error.';
		}
		return 'Not calculated yet. Sample the scenario space in the Calculations tab to estimate ' + d.name + '.';
	}

	function renderSummary() {
		var kpis = data.derived.filter(function (d) { return d.kpi; });
		if (!kpis.length) {
			kpiBar.innerHTML =
				'<span class="metric muted" title="Mark a calculated value as a KPI in the Calculations tab">' +
				'<span class="metric-label">KPIs</span><span class="metric-value">none yet</span></span>';
			return;
		}
		kpiBar.innerHTML = kpis.map(function (d) {
			var stats = sample ? statsByName[d.name] : null;
			var value = stats ? '&asymp; ' + escapeHtml(formatNumber(stats.mean)) : '&ndash;';
			return '<span class="metric' + (stats ? '' : ' muted') + '"' +
				' title="' + escapeHtml(summaryTitle(d, stats)) + '">' +
				'<span class="metric-label">' + escapeHtml(d.displayName || d.name) + '</span>' +
				'<span class="metric-value">' + value + '</span></span>';
		}).join('');
	}

	/* ---------- Buttons ---------- */

	function sampleNow(size) {
		takeSample(size, Math.floor(Math.random() * 4294967296));
		evaluateAll();
		renderReport();
		renderSummary();
		reportHead.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function sampleCustom() {
		var size = Number(sampleSizeInput.value);
		if (!(size >= 1 && size <= MAX_SAMPLE_SIZE && Math.floor(size) === size)) {
			alert('Enter a whole number of scenarios from 1 to ' + formatCount(MAX_SAMPLE_SIZE) + '.');
			return;
		}
		sampleNow(size);
	}

	document.querySelector('[data-calc-sample]').addEventListener('click', function (e) {
		sampleNow(Number(e.currentTarget.getAttribute('data-calc-sample')));
	});

	document.getElementById('calc-sample-btn').addEventListener('click', sampleCustom);

	sampleSizeInput.addEventListener('keydown', function (e) {
		if (e.key === 'Enter') sampleCustom();
	});

	document.getElementById('calc-add-derived-btn').addEventListener('click', addDerived);

	document.getElementById('calc-zoom-in-btn').addEventListener('click', function () {
		setZoom(zoomPercent + ZOOM_STEP);
	});

	document.getElementById('calc-zoom-out-btn').addEventListener('click', function () {
		setZoom(zoomPercent - ZOOM_STEP);
	});

	document.getElementById('calc-zoom-reset-btn').addEventListener('click', function () { setZoom(100); });

	return {
		render: render,
		treeChanged: treeChanged,
		getState: getState,
		setState: setState
	};
})(NovaDM.Model, NovaDM.Calculations, NovaDM.Render, NovaDM.CalculationsReport, NovaDM.Util);
