window.NovaDM = window.NovaDM || {};

/**
 * The Calculations tab: a graph from the labelled nodes of the action tree on screen and their numbers
 * to the calculated values and KPIs, with an option picker per node; an editor panel for the selected
 * box; and a sample of scenarios, reported by calculations-report.js. It also fills the KPIs in the
 * Action tree tab's bottom bar with their mean over that sample, as an estimate. Its data (numbers, units and
 * calculated values: the example's made-up numbers, or Cost and GWP for a new document) is the
 * open version's: history.js stores a copy per version, the file holds it per version, and undo covers it.
 */
NovaDM.CalculationsTab = (function (Model, Calculations, Render, CalculationsReport, Util) {
	'use strict';

	var MAX_SAMPLE_SIZE = 3000;
	var SLOW_REDRAW_MS = 50;
	var BAR_SLICE_MS = 12;
	var MAX_SHOWN_NAME_LENGTH = 60;
	var SEED_RANGE = 4294967296;
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
	var MARK_TITLES = {
		always: 'Marked always on the Action tree tab: every scenario holds this node',
		never: 'Marked never on the Action tree tab: no scenario holds this node'
	};
	var LEFT_OUT_TITLE = 'The always/never marks leave this node out of every scenario';
	var UNIT_GROUPS = [
		{ name: 'Currency', units: ['DKK', 'EUR', 'USD'] },
		{ name: 'Climate', units: ['kg CO₂e', 't CO₂e'] },
		{ name: 'Thermal', units: ['W/m²K', 'm²K/W'] },
		{ name: 'Other', units: ['m²', 'kWh', 'years'] }
	];
	var CUSTOM_UNIT = '*custom*';
	var MAX_UNIT_LENGTH = Calculations.MAX_UNIT_LENGTH;

	var escapeHtml = Util.escapeHtml;
	var formatNumber = CalculationsReport.formatNumber;
	var formatCount = CalculationsReport.formatCount;
	var valueHtml = CalculationsReport.valueHtml;
	var entriesById = Calculations.entriesById;
	var own = Util.own;
	var setOwn = Util.setOwn;
	var withUnit = CalculationsReport.withUnit;
	var nameWithUnit = CalculationsReport.nameWithUnit;

	var panel = document.getElementById('calculations');
	var graphHost = document.getElementById('calc-graph');
	var editorHost = document.getElementById('calc-editor-host');
	var reportHead = document.getElementById('calc-report-head');
	var kpiBar = document.getElementById('scenario-kpi-metrics');
	var sizeValue = document.getElementById('calc-space-size');
	var zoomLabel = document.getElementById('calc-zoom-label');
	var sampleSizeInput = document.getElementById('calc-sample-size');
	var quickSampleBtn = document.querySelector('[data-calc-sample]');
	var sampleAllBtn = document.getElementById('calc-sample-all-btn');
	var sampleBtn = document.getElementById('calc-sample-btn');
	var addDerivedBtn = document.getElementById('calc-add-derived-btn');
	var shownLabel = document.getElementById('calc-shown-scenario');

	var starterData = Calculations.starterData;

	var data = starterData();
	var analysis = Calculations.analyze(data, []);
	var evaluatedSpaceKey = null;
	var sample = null;
	var barJob = null;
	var evaluateMs = 0;
	var results = [];
	var choices = { options: {}, branches: {} };
	var selected = null;
	var zoomPercent = 100;
	var customUnitFor = null;

	function findDerived(name) {
		return data.derived.filter(function (d) { return d.name === name; })[0] || null;
	}

	function attributeUnit(name) {
		return data.units && own(data.units, name) ? data.units[name] : '';
	}

	function isUntouched() { return Calculations.signature(data) === Calculations.signature(starterData()); }

	function isVisible() { return !panel.hidden; }

	/* ---------- Tree ---------- */

	function rootNode() { return Model.root.children[0] || null; }

	function treeLabels() {
		var labels = [];
		Model.eachNode(function (n) {
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

	function spaceKey() {
		var marks = Model.getProfileState();
		return JSON.stringify([Model.treeSpecs(), marks.current, marks.currentValues]);
	}

	function optionsOf(node) { return node.value.length ? node.value : ['']; }

	/* ---------- Always/never marks ---------- */

	function allowedChoices() {
		var applied = Model.applyMarks();
		return applied.size > 0 ? applied.allowed : null;
	}

	function isPossible(path, allowed) {
		return !allowed || path.every(function (n) { return allowed[n.id].possible; });
	}

	function canBeLeftOut(path, allowed) {
		if (!isPossible(path, allowed)) return true;
		return path.slice(0, -1).some(function (n) {
			return n.kind === 'XOR' && Calculations.possibleChildren(n, allowed).length > 1;
		});
	}

	function otherBranch(xor, child, allowed) {
		return Calculations.possibleChildren(xor, allowed).filter(function (c) { return c !== child; })[0] || null;
	}

	function optionTag(node, value) {
		var mark = Model.hasOptions(node) ? Model.getValueConstraint(node.id, value) : 'default';
		return mark === 'default' ? '' : ' (' + mark + ')';
	}

	function markDotHtml(node) {
		var mark = Model.isConstrainable(node) ? Model.getNodeConstraint(node.id) : 'default';
		if (mark === 'default') return '';
		return '<span class="calc-mark ' + mark + '" role="img" title="' + MARK_TITLES[mark] + '"' +
			' aria-label="' + MARK_TITLES[mark] + '"></span>';
	}

	function choiceKeys(box, allowed) {
		var node = box.node;
		var possible = isPossible(box.path, allowed);
		var values = Calculations.possibleOptions(node, allowed);
		var keys = node.value.length
			? node.value.map(function (v, i) {
				var ruledOut = !possible || values.indexOf(v) === -1;
				return { key: String(i), text: v + optionTag(node, v), disabled: ruledOut };
			})
			: [{ key: 'chosen', text: 'chosen', disabled: !possible }];
		var leftOut = canBeLeftOut(box.path, allowed);
		if (leftOut || canBeLeftOut(box.path, null)) {
			keys.push({ key: NOT_CHOSEN, text: 'not chosen', disabled: !leftOut });
		}
		return keys;
	}

	function hasChoice(box) { return choiceKeys(box, null).length > 1; }

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
		var gone = !rootNode() || (selected.kind === 'node' ? !selectedNode() : !findDerived(selected.name));
		if (gone) selected = null;
	}

	/* ---------- Sample and evaluation ---------- */

	function scenarioKey(scenario) {
		return scenario.map(function (e) { return e.id + '=' + e.value; }).join('|');
	}

	function randomSampleRecord(scenarios, distinct, size, seed, key, applied, drawMs) {
		return {
			full: false,
			tooMany: false,
			size: size,
			seed: seed,
			spaceKey: key,
			total: applied.size,
			contradictory: applied.contradictory,
			distinct: distinct,
			scenarios: scenarios,
			drawMs: drawMs
		};
	}

	function randomSample(size, seed, key) {
		var start = performance.now();
		var applied = Model.applyMarks();
		var scenarios = applied.size > 0
			? Calculations.sample(rootNode(), size, Calculations.seededRandom(seed), applied.allowed)
			: [];
		var distinct = Object.create(null);
		scenarios.forEach(function (s) { distinct[scenarioKey(s)] = true; });
		return randomSampleRecord(scenarios, Object.keys(distinct).length, size, seed, key, applied,
			performance.now() - start);
	}

	function fullListing(seed, sizeIfNone, key) {
		var start = performance.now();
		var applied = Model.applyMarks();
		var total = applied.size;
		var scenarios = total > 0 ? Calculations.enumerate(rootNode(), applied.allowed) : [];
		return {
			full: true,
			tooMany: false,
			size: total || sizeIfNone,
			seed: seed,
			spaceKey: key,
			total: total,
			contradictory: applied.contradictory,
			distinct: total,
			scenarios: scenarios,
			drawMs: performance.now() - start
		};
	}

	function takeSample(size, seed, key) {
		sample = randomSample(size, seed, key);
		markShown(null);
	}

	function listFullSpace(seed, sizeIfNone, key) {
		sample = fullListing(seed, sizeIfNone, key);
		markShown(null);
	}

	function redrawPlan(base, total) {
		var wantsAll = base.full || base.tooMany;
		return { listAll: wantsAll && total <= MAX_SAMPLE_SIZE, tooMany: wantsAll && total > MAX_SAMPLE_SIZE };
	}

	function drawAgain(key) {
		var plan = redrawPlan(sample, Model.applyMarks().size);
		sample = plan.listAll ? fullListing(sample.seed, sample.size, key) : randomSample(sample.size, sample.seed, key);
		sample.tooMany = plan.tooMany;
		markShown(null);
	}

	function evaluateAll() {
		barJob = null;
		var key = spaceKey();
		if (sample && sample.spaceKey !== key) drawAgain(key);
		analysis = Calculations.analyze(data, treeLabels());
		var start = performance.now();
		results = sample
			? sample.scenarios.map(function (s) { return Calculations.evaluateScenario(analysis, data, s); })
			: [];
		evaluateMs = performance.now() - start;
		evaluatedSpaceKey = key;
	}

	function currentScenario(allowed) {
		var marks = allowed === undefined ? allowedChoices() : allowed;
		return Calculations.scenarioFor(rootNode(), choices, marks);
	}

	function currentResults() { return Calculations.evaluateScenario(analysis, data, currentScenario()); }

	function renderTab() {
		renderGraph();
		renderEditor();
		renderReport();
	}

	function renderSize() {
		var applied = Model.applyMarks();
		var total = applied.size;
		sizeValue.innerHTML = Render.scenarioSizeHtml(total);
		[quickSampleBtn, sampleAllBtn, sampleSizeInput, sampleBtn].forEach(function (control) {
			control.disabled = total === 0;
		});
		addDerivedBtn.disabled = !rootNode();
		sampleAllBtn.title = fullSpaceTitle(total, applied.contradictory);
	}

	function dataChanged() {
		evaluateAll();
		renderGraph();
		renderReport();
		renderSummary();
		Render.recordChange();
	}

	/** Renders the whole tab, drawing the scenarios again (same size and seed) after a tree change. */
	function render() {
		dropStaleSelection();
		evaluateAll();
		renderTab();
		renderSize();
		renderSummary();
	}

	function redrawBar() {
		dropStaleSelection();
		evaluateAll();
		renderSummary();
	}

	/**
	 * Recalculates the bar's sample in slices between frames, so typing and clicking never wait for it;
	 * a newer change drops it. It ends with the same scenarios and numbers as a calculation in one go.
	 */
	function startBarJob() {
		var key = spaceKey();
		var job = { key: key };
		var base = sample;
		var applied = Model.applyMarks();
		var redraw = base.spaceKey !== key;
		var plan = redraw ? redrawPlan(base, applied.size) : null;
		var listAll = !!plan && plan.listAll;
		var random = Calculations.seededRandom(base.seed);
		var drawn = [];
		var distinct = Object.create(null);
		var drawMs = 0;
		var next = null;
		var scenarios = redraw ? null : base.scenarios;
		var jobAnalysis = Calculations.analyze(data, treeLabels());
		var jobResults = [];
		var jobEvaluateMs = 0;
		barJob = job;

		function drawOne() {
			var start = performance.now();
			var scenario = Calculations.sample(rootNode(), 1, random, applied.allowed)[0];
			drawMs += performance.now() - start;
			drawn.push(scenario);
			distinct[scenarioKey(scenario)] = true;
		}

		function finishDrawing() {
			if (listAll) {
				next = fullListing(base.seed, base.size, key);
			} else {
				next = randomSampleRecord(drawn, Object.keys(distinct).length, base.size, base.seed, key, applied,
					drawMs);
				next.tooMany = plan.tooMany;
			}
			scenarios = next.scenarios;
		}

		function evaluateOne() {
			var start = performance.now();
			jobResults.push(Calculations.evaluateScenario(jobAnalysis, data, scenarios[jobResults.length]));
			jobEvaluateMs += performance.now() - start;
		}

		function finish() {
			barJob = null;
			if (next) {
				sample = next;
				markShown(null);
			}
			analysis = jobAnalysis;
			results = jobResults;
			evaluateMs = jobEvaluateMs;
			evaluatedSpaceKey = key;
			dropStaleSelection();
			renderSummary();
		}

		function step() {
			if (barJob !== job) return;
			var until = performance.now() + BAR_SLICE_MS;
			while (performance.now() < until) {
				if (!scenarios && (listAll || applied.size === 0 || drawn.length >= base.size)) finishDrawing();
				else if (!scenarios) drawOne();
				else if (jobResults.length < scenarios.length) evaluateOne();
				else return finish();
			}
			setTimeout(step, 0);
		}

		requestAnimationFrame(function () { setTimeout(step, 0); });
	}

	function updateBar() {
		barJob = null;
		if (sample.drawMs + evaluateMs < SLOW_REDRAW_MS) redrawBar();
		else startBarJob();
	}

	function treeChanged() {
		if (isVisible() && spaceKey() !== evaluatedSpaceKey) {
			dropStaleSelection();
			evaluateAll();
			renderTab();
		} else if (!isVisible() && sample && spaceKey() !== (barJob ? barJob.key : evaluatedSpaceKey)) {
			updateBar();
		}
		renderSize();
		renderSummary();
	}

	function getState() { return data; }

	function setState(state) {
		data = state ? Util.clone(state) : starterData();
		dropStaleSelection();
		if (isVisible()) {
			evaluateAll();
			renderTab();
		} else if (sample) {
			updateBar();
		}
		renderSummary();
	}

	function reset(state) {
		barJob = null;
		sample = null;
		choices = { options: {}, branches: {} };
		selected = null;
		customUnitFor = null;
		markShown(null);
		setState(state);
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

	function hasReferences(item) {
		var refs = item.refs;
		return !!refs && refs.names.length + refs.lookups.length + refs.totals.length + refs.selected.length > 0;
	}

	function derivedColumns(inputsByName) {
		var columns = Object.create(null);
		var visiting = Object.create(null);

		function columnOf(name) {
			if (columns[name] !== undefined) return columns[name];
			if (visiting[name]) return 0;
			visiting[name] = true;
			var inputs = inputsByName[name];
			var column = inputs.length || hasReferences(analysis.byName[name]) ? 1 : 0;
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
	 * Lays out the graph: the constants, then one box per labelled tree node in tree order, indented by depth,
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
		var constants = analysis.items.filter(function (item) { return columns[item.name] === 0; });
		boxes.forEach(function (box) { box.y += constants.length * (DERIVED_HEIGHT + NODE_GAP); });
		constants.forEach(function (item, i) {
			addNode({ key: 'd:' + item.name, kind: 'derived', name: item.name, rows: [],
				x: columnX(0), y: MARGIN + i * (DERIVED_HEIGHT + NODE_GAP), width: DERIVED_WIDTH,
				height: DERIVED_HEIGHT });
		});
		analysis.items.forEach(function (item) { maxColumn = Math.max(maxColumn, columns[item.name]); });

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

	function choiceHtml(box, entry, allowed) {
		var node = box.node;
		var keys = choiceKeys(box, allowed);
		if (keys.length < 2) return entry && entry.value ? ' = ' + escapeHtml(entry.value) : '';
		var current = !entry ? NOT_CHOSEN : (node.value.length ? String(node.value.indexOf(entry.value)) : 'chosen');
		return '<span class="calc-equals">=</span>' +
			'<select class="calc-choice" data-calc-choose="' + escapeHtml(node.id) + '"' +
			' aria-label="' + escapeHtml('Option of ' + node.label + ' in this scenario') + '"' +
			' title="Choose the option of this node in the scenario on screen">' +
			keys.map(function (k) {
				return '<option value="' + k.key + '"' + (k.key === current ? ' selected' : '') +
					(k.disabled ? ' disabled' : '') + '>' + escapeHtml(k.text) + '</option>';
			}).join('') + '</select>';
	}

	function boxHtml(layoutNode, entries, highlight, allowed) {
		var node = layoutNode.box.node;
		var entry = entries[node.id];
		var why = isPossible(layoutNode.box.path, allowed) ? 'Not in this scenario' : LEFT_OUT_TITLE;
		var rows = layoutNode.rows.map(function (attribute) {
			var value = entry ? Calculations.numberFor(data.values, node.label, attribute, entry.value) : null;
			return '<div class="calc-row"><span class="calc-row-name">' + escapeHtml(attribute) + '</span>' +
				'<span>' + valueHtml(value, attributeUnit(attribute)) + '</span></div>';
		}).join('');
		var cls = 'calc-node calc-label-node' + stateClasses(layoutNode, highlight) + (entry ? '' : ' muted');
		var label = escapeHtml(node.label);
		return '<div class="' + cls + '" data-calc-node="' + escapeHtml(node.id) + '"' +
			' style="' + boxStyle(layoutNode) + '"' + (entry ? '' : ' title="' + why + '"') + '>' +
			'<div class="calc-node-head">' + markDotHtml(node) +
			'<span class="calc-label-name" title="' + label + '">' + label + '</span>' +
			choiceHtml(layoutNode.box, entry, allowed) +
			'</div>' + rows + '</div>';
	}

	function numberedAttributes() {
		var found = Object.create(null);
		treeBoxes().forEach(function (box) {
			boxRows(box.node).forEach(function (attribute) { found[attribute] = true; });
		});
		return found;
	}

	function formulaNote(item, numbered) {
		var notes = [];
		if (item.missing.length) {
			notes.push('Not in the tree: ' + item.missing.join(', ') + '. ' +
				(item.missing.length === 1 ? 'It counts' : 'They count') + ' as not chosen.');
		}
		var empty = (item.refs ? item.refs.totals : []).filter(function (a, i, list) {
			return list.indexOf(a) === i && !numbered[a];
		});
		if (empty.length) {
			notes.push('No node in the tree has a number for ' + empty.join(' or ') + ' yet, so the total is 0.' +
				' Click a box in the graph to type its numbers.');
		}
		return notes.join(' ');
	}

	function derivedNodeHtml(node, values, highlight, numbered) {
		var item = analysis.byName[node.name];
		var derived = findDerived(node.name);
		var cls = 'calc-node calc-derived-node' + stateClasses(node, highlight) + (derived.kpi ? ' kpi' : '');
		var note = item.error ? '' : formulaNote(item, numbered);
		var title = item.error || node.name + ' = ' + derived.formula + (note ? '\n' + note : '');
		return '<div class="' + cls + '" data-calc-derived="' + escapeHtml(node.name) + '"' +
			' style="' + boxStyle(node) + '" title="' + escapeHtml(title) + '">' +
			'<div class="calc-node-head">' +
			'<span class="calc-derived-name">' + escapeHtml(node.name) + '</span>' +
			constantHtml(node.name) +
			'<span class="calc-derived-value">' + valueHtml(values[node.name], derived.unit) + '</span>' +
			'</div>' +
			'<div class="calc-formula-line">' + escapeHtml(derived.formula) + '</div>' +
			'<button type="button" class="node-delete-btn calc-delete-derived" data-calc-delete-derived="' + escapeHtml(node.name) + '"' +
				' aria-label="' + escapeHtml('Delete calculated value ' + node.name) + '"' +
				' title="' + escapeHtml('Delete calculated value ' + node.name) + '">' + Render.trashIconHtml() + '</button>' +
			'</div>';
	}

	function renderGraph() {
		var isEmpty = !rootNode();
		graphHost.classList.toggle('empty-hint', isEmpty);
		if (isEmpty) {
			graphHost.innerHTML = '<div>Build a tree in the Action tree tab, or click "Load example".' +
				'<br>(No nodes yet.)</div>';
			return;
		}

		var layout = layoutGraph();
		var allowed = allowedChoices();
		var scenario = currentScenario(allowed);
		var entries = entriesById(scenario);
		var values = Calculations.evaluateScenario(analysis, data, scenario);
		var highlight = highlightFor(layout);
		var numbered = numberedAttributes();
		var boxes = layout.nodes.map(function (node) {
			return node.kind === 'box'
				? boxHtml(node, entries, highlight, allowed)
				: derivedNodeHtml(node, values, highlight, numbered);
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
		var allowed = allowedChoices();
		var i;
		if (key === NOT_CHOSEN) {
			for (i = path.length - 2; i >= 0; i--) {
				var other = path[i].kind === 'XOR' ? otherBranch(path[i], path[i + 1], allowed) : null;
				if (other) {
					choices.branches[path[i].id] = other.id;
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
		markShown(null);
	}

	function setZoom(percent) {
		zoomPercent = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, percent));
		zoomLabel.textContent = zoomPercent + '%';
		var canvas = graphHost.querySelector('.calc-canvas');
		if (canvas) canvas.style.zoom = zoomPercent / 100;
	}

	graphHost.addEventListener('click', function (e) {
		if (e.target.closest('select')) return;
		var deleteBtn = e.target.closest('[data-calc-delete-derived]');
		if (deleteBtn) {
			deleteDerived(deleteBtn.getAttribute('data-calc-delete-derived'));
			return;
		}
		customUnitFor = null;
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
			'<p><span class="calc-help-label">Labels</span> hold a number per option, such as a price.' +
			' Pick an option in a label&rsquo;s drop-down to change the scenario on screen.</p>' +
			'<p><span class="calc-help-derived">Calculated values</span> come from the nodes' +
			' whose arrows point into them.</p>' +
			'<p>Mark a calculated value as a <strong>KPI</strong> to see it in the sample report and in the' +
			' Action tree tab&rsquo;s bottom bar. Click a node to edit it.</p>' +
			'</div>';
	}

	function isDefaultUnit(unit) {
		return UNIT_GROUPS.some(function (group) { return group.units.indexOf(unit) !== -1; });
	}

	function unitOf(key) {
		var derived = key.charAt(0) === 'd' ? findDerived(key.slice(2)) : null;
		if (derived) return derived.unit || '';
		return attributeUnit(key.slice(2));
	}

	function setUnit(key, unit) {
		var name = key.slice(2);
		var target = key.charAt(0) === 'd' ? findDerived(name) : null;
		if (target) {
			if (unit) target.unit = unit;
			else delete target.unit;
			return;
		}
		if (!data.units) data.units = {};
		if (unit) setOwn(data.units, name, unit);
		else delete data.units[name];
	}

	function unitFieldHtml(key, name) {
		var unit = unitOf(key);
		var custom = customUnitFor === key || (unit !== '' && !isDefaultUnit(unit));
		var option = function (value, text) {
			var chosen = value === CUSTOM_UNIT ? custom : !custom && value === unit;
			return '<option value="' + escapeHtml(value) + '"' + (chosen ? ' selected' : '') + '>' + escapeHtml(text) +
				'</option>';
		};
		return '<div class="calc-unit-field">' +
			'<select data-calc-unit="' + escapeHtml(key) + '" aria-label="' + escapeHtml('Unit of ' + name) + '">' +
				option('', 'No unit') +
				UNIT_GROUPS.map(function (group) {
					return '<optgroup label="' + escapeHtml(group.name) + '">' +
						group.units.map(function (u) { return option(u, u); }).join('') + '</optgroup>';
				}).join('') +
				option(CUSTOM_UNIT, 'Custom unit\u2026') +
			'</select>' +
			(custom
				? '<input type="text" class="calc-unit-custom" maxlength="' + MAX_UNIT_LENGTH + '"' +
					' value="' + escapeHtml(unit) + '" placeholder="e.g. m³"' +
					' aria-label="' + escapeHtml('Custom unit of ' + name) + '"' +
					' data-calc-custom-unit="' + escapeHtml(key) + '"' +
					' data-typing-key="' + escapeHtml('unit:' + key) + '" />'
				: '') +
			'</div>';
	}

	function constantHtml(name) {
		return Calculations.isConstant(analysis.byName[name])
			? '<span class="calc-constant" title="Its formula is a single number">constant</span>'
			: '';
	}

	function derivedFormHtml(derived) {
		return '<div class="editor-form">' +
			'<div class="calc-editor-head">' +
				'<div class="field">' +
					'<label>Calculated value</label>' +
					'<div class="calc-editor-name-row">' +
						'<span class="calc-editor-title">' + escapeHtml(derived.name) + '</span>' +
						'<span id="calc-editor-constant">' + constantHtml(derived.name) + '</span>' +
						'<button class="btn calc-rename-btn" type="button" data-calc-action="rename-derived"' +
							' title="Rename it: its name in formulas (the formulas that use it follow) and the name shown' +
							' on the KPI cards, in the report and in the bottom bar">Rename</button>' +
					'</div>' +
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
				'<div id="calc-formula-note" class="note" hidden></div>' +
			'</div>' +
			'<div class="field">' +
				'<label>Unit</label>' +
				unitFieldHtml('d:' + derived.name, derived.name) +
				'<div class="note">A unit is only a label: changing it doesn&rsquo;t convert the value.</div>' +
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

	function parseTyped(text) {
		var clean = String(text).replace(/\s/g, '');
		var at = Math.max(clean.lastIndexOf(','), clean.lastIndexOf('.'));
		var hasDecimals = at !== -1 && clean.split(clean.charAt(at)).length === 2;
		var digits = hasDecimals
			? clean.slice(0, at).replace(/[,.]/g, '') + '.' + clean.slice(at + 1)
			: clean.replace(/[,.]/g, '');
		return digits === '' || !isFinite(Number(digits)) ? null : Number(digits);
	}

	function formatTyped(n) {
		return n === null ? '' : n.toLocaleString('en-GB', { maximumFractionDigits: 10 }).replace(/,/g, ' ');
	}

	function numberInputHtml(label, attribute, option) {
		var value = Calculations.numberFor(data.values, label, attribute, option);
		return '<input type="text" inputmode="decimal" value="' + escapeHtml(formatTyped(value)) + '"' +
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
				return '<th data-heading-attribute="' + escapeHtml(a) + '">' +
					escapeHtml(nameWithUnit(a, attributeUnit(a))) + '</th>';
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
			(attributes.length ? unitsFieldHtml(attributes) : '') +
			'<div class="editor-add-row">' +
				'<button class="btn" type="button" data-calc-action="add-attribute">+ Attribute</button>' +
			'</div>' +
			'</div>';
	}

	function unitsFieldHtml(attributes) {
		return '<div class="field">' +
			'<label>Units</label>' +
			'<div class="calc-units">' + attributes.map(function (a) {
				var title = 'Remove ' + a + ' from this version: its numbers in every node and its unit';
				return '<div class="calc-unit-row"><span class="calc-unit-name">' + escapeHtml(a) + '</span>' +
					unitFieldHtml('a:' + a, a) +
					'<button type="button" class="calc-remove-attribute" data-calc-remove-attribute="' + escapeHtml(a) + '"' +
						' aria-label="' + escapeHtml(title) + '" title="' + escapeHtml(title) + '">' + Render.trashIconHtml() +
						'</button></div>';
			}).join('') + '</div>' +
			'<div class="note">A unit applies to the attribute in every node, and is only a label: changing it' +
				' doesn&rsquo;t convert the numbers.</div>' +
			'</div>';
	}

	function renderDerivedStatus() {
		var errorEl = document.getElementById('calc-formula-error');
		if (!errorEl || !selected) return;
		var item = analysis.byName[selected.name];
		var noteEl = document.getElementById('calc-formula-note');
		errorEl.textContent = item && item.error ? item.error : '';
		errorEl.hidden = !errorEl.textContent;
		noteEl.textContent = item && !item.error ? formulaNote(item, numberedAttributes()) : '';
		noteEl.hidden = !noteEl.textContent;
		document.getElementById('calc-editor-constant').innerHTML = constantHtml(selected.name);
		document.getElementById('calc-editor-value').innerHTML =
			valueHtml(currentResults()[selected.name], unitOf('d:' + selected.name));
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

	function setNumber(label, attribute, option, number, options) {
		var byAttribute = own(data.values, label) ? data.values[label] : setOwn(data.values, label, {});
		var stored = own(byAttribute, attribute) ? byAttribute[attribute] : null;
		var isTable = !!stored && typeof stored === 'object' && Object.keys(stored).length > 0;
		if (option === '' && !isTable) {
			setOwn(byAttribute, attribute, number === null ? {} : number);
			return;
		}
		if (!isTable) {
			var plain = stored;
			stored = setOwn(byAttribute, attribute, {});
			if (typeof plain === 'number') options.forEach(function (o) { setOwn(stored, o, plain); });
		}
		if (number === null) delete stored[option];
		else setOwn(stored, option, number);
	}

	function unitChosen(key, value) {
		if (value === CUSTOM_UNIT) {
			customUnitFor = key;
			renderEditor();
			var box = editorHost.querySelector('[data-calc-custom-unit="' + key + '"]');
			box.focus();
			box.select();
			return;
		}
		if (customUnitFor === key) customUnitFor = null;
		setUnit(key, value);
		dataChanged();
		renderEditor();
		editorHost.querySelector('[data-calc-unit="' + key + '"]').focus();
	}

	function customUnitTyped(key, text) {
		setUnit(key, text.trim().slice(0, MAX_UNIT_LENGTH));
		dataChanged();
		if (key.charAt(0) === 'd') {
			renderDerivedStatus();
			return;
		}
		var heading = editorHost.querySelector('[data-heading-attribute="' + key.slice(2) + '"]');
		if (heading) heading.textContent = nameWithUnit(key.slice(2), unitOf(key));
	}

	function formulaChanged(derived, text) {
		derived.formula = text;
		dataChanged();
		renderDerivedStatus();
		revealSelected();
	}

	function nameProblem(name, kind) {
		if (!Calculations.isName(name)) {
			return '"' + name + '" is not a valid name: ' + Calculations.NAME_RULE + '.';
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
		data.derived.push({ name: name, displayName: Calculations.displayNameOf(name), formula: '0' });
		selected = { kind: 'derived', name: name };
		dataChanged();
		renderEditor();
		document.getElementById('calc-formula').select();
		revealSelected();
	}

	function addAttribute() {
		var name = askName('Name of the new attribute (e.g. Uvalue):', 'attribute');
		if (!name) return;
		data.attributes.push(name);
		dataChanged();
		renderEditor();
	}

	function deleteDerived(name) {
		var users = analysis.items.filter(function (item) {
			return item.name !== name && item.inputs.indexOf(name) !== -1;
		}).map(function (item) { return item.name; });
		var one = users.length === 1;
		var warning = !users.length ? '' : '\n\n' + formulasOf(users) + (one ? ' uses' : ' use') +
			' it. Once it is deleted, ' + (one ? 'that formula reads "' : 'those formulas read "') + name +
			'" as a label that isn\'t in the tree, which counts as not chosen.';
		if (!confirm('Delete the calculated value "' + name + '"?' + warning)) return;
		data.derived = data.derived.filter(function (d) { return d.name !== name; });
		dropStaleSelection();
		dataChanged();
		renderEditor();
	}

	function formulasOf(names) {
		return names.length === 1 ? 'The formula of ' + names[0]
			: 'The formulas of ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
	}

	function renameSelectedDerived() {
		var from = selected.name;
		var oldShown = Calculations.shownName(findDerived(from));
		var to = prompt('Name of "' + from + '" in formulas (letters, digits and _; the formulas that use it follow):',
			from);
		if (to === null) return;
		to = to.trim();
		var problem = to === from ? null : nameProblem(to, 'derived');
		if (problem) {
			alert(problem);
			return;
		}
		var guess = (to === from ? oldShown : Calculations.suggestedDisplayName(from, oldShown, to))
			.slice(0, MAX_SHOWN_NAME_LENGTH);
		var shown = prompt('Name shown on the KPI cards, in the report and in the bottom bar (any text):', guess);
		if (shown === null) return;
		shown = shown.trim() || guess;
		if (shown.length > MAX_SHOWN_NAME_LENGTH) {
			alert('The name shown can be at most ' + MAX_SHOWN_NAME_LENGTH + ' characters long.');
			return;
		}
		if (to === from && shown === oldShown) return;
		var result = Calculations.renameDerived(data, from, to, shown);
		data = result.data;
		selected = { kind: 'derived', name: to };
		dataChanged();
		renderEditor();
		revealSelected();
		if (result.skipped.length) {
			var one = result.skipped.length === 1;
			alert(formulasOf(result.skipped) + ' can\'t be read because of an error, so ' +
				(one ? 'it wasn\'t changed. If it uses "' : 'they weren\'t changed. If they use "') + from +
				'", change ' + (one ? 'it' : 'them') + ' by hand.');
		}
	}

	function attributeUsers(name) {
		return analysis.items.filter(function (item) {
			return item.refs && (item.refs.totals.indexOf(name) !== -1 ||
				item.refs.lookups.some(function (l) { return l.attribute === name; }));
		}).map(function (item) { return item.name; });
	}

	function removeAttributeAsked(name) {
		var count = Object.keys(Calculations.entries({ values: data.values })).filter(function (key) {
			var parts = JSON.parse(key);
			return parts[0] === 'v' && parts[2] === name;
		}).length;
		var unit = attributeUnit(name);
		var users = attributeUsers(name);
		var question = 'Remove the attribute "' + name + '" from this version?\n\n' +
			(count ? 'Its ' + Util.plural(count, 'number') + (unit ? ' and its unit (' + unit + ')' : '') +
				(count === 1 && !unit ? ' goes' : ' go') + ' with it.'
				: 'It has no numbers' + (unit ? '; its unit (' + unit + ') goes with it.' : '.')) +
			(users.length ? '\n\n' + formulasOf(users) + (users.length === 1
				? ' uses it, and will show an error until you change it.'
				: ' use it, and will show an error until you change them.') : '') +
			'\n\nOther versions keep it. You can undo this.';
		if (!confirm(question)) return;
		data = Calculations.removeAttribute(data, name);
		dataChanged();
		renderEditor();
	}

	editorHost.addEventListener('input', function (e) {
		var t = e.target;
		var derived = selected && selected.kind === 'derived' ? findDerived(selected.name) : null;
		if (t.hasAttribute('data-value-attribute')) {
			var number = parseTyped(t.value);
			if (number === null && t.value.trim() !== '') return;
			var node = selectedNode();
			setNumber(t.getAttribute('data-value-label'), t.getAttribute('data-value-attribute'),
				t.getAttribute('data-value-option'), number, node ? node.value : []);
			dataChanged();
		} else if (t.id === 'calc-formula' && derived) {
			formulaChanged(derived, t.value);
		} else if (t.hasAttribute('data-calc-custom-unit')) {
			customUnitTyped(t.getAttribute('data-calc-custom-unit'), t.value);
		}
	});

	editorHost.addEventListener('change', function (e) {
		var t = e.target;
		var derived = selected && selected.kind === 'derived' ? findDerived(selected.name) : null;
		if (t.hasAttribute('data-value-attribute')) {
			t.value = formatTyped(Calculations.numberFor(data.values, t.getAttribute('data-value-label'),
				t.getAttribute('data-value-attribute'), t.getAttribute('data-value-option')));
			return;
		}
		if (t.hasAttribute('data-calc-unit')) {
			unitChosen(t.getAttribute('data-calc-unit'), t.value);
			return;
		}
		if (t.id !== 'calc-kpi' || !derived) return;
		if (t.checked) derived.kpi = true;
		else delete derived.kpi;
		dataChanged();
	});

	editorHost.addEventListener('click', function (e) {
		var remove = e.target.closest('[data-calc-remove-attribute]');
		if (remove) {
			removeAttributeAsked(remove.getAttribute('data-calc-remove-attribute'));
			return;
		}
		var btn = e.target.closest('[data-calc-action]');
		if (!btn || !selected) return;
		var action = btn.getAttribute('data-calc-action');
		if (action === 'delete-derived') deleteDerived(selected.name);
		else if (action === 'rename-derived') renameSelectedDerived();
		else if (action === 'add-attribute' && selectedNode()) addAttribute();
	});

	/* ---------- Report ---------- */

	function renderReport() {
		CalculationsReport.render({
			sample: sample,
			results: results,
			derived: data.derived,
			analysis: analysis,
			optionBoxes: treeBoxes().filter(hasChoice),
			onShowScenario: showScenario,
			onClose: clearSample
		});
	}

	function markShown(index) {
		CalculationsReport.markShownRow(index);
		shownLabel.textContent = index === null ? '' : 'Scenario #' + (index + 1) + ' from the report is on screen';
		shownLabel.hidden = index === null;
	}

	function showScenario(index) {
		markShown(index);
		choices = Calculations.choicesFor(rootNode(), sample.scenarios[index]);
		renderGraph();
		renderEditor();
		panel.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function clearSample() {
		sample = null;
		markShown(null);
		evaluateAll();
		renderReport();
		renderSummary();
	}

	/* ---------- Action tree tab's bottom bar ---------- */

	function sampleHasScenarios() { return !!sample && sample.scenarios.length > 0; }

	function sampleText() {
		if (sample.full) return 'all ' + formatCount(sample.total) + ' scenarios';
		return 'a random sample of ' + formatCount(sample.size) + ' of the ' + Render.scenarioSizeText(sample.total) +
			' scenarios';
	}

	function summaryCaptionHtml() {
		if (!sampleHasScenarios()) return '';
		var title = sample.full
			? 'Exact mean: each KPI\'s mean over ' + sampleText() + ' of the space ("Full scenario space" in the' +
				' Calculations tab).'
			: 'Estimated: each KPI\'s mean over ' + sampleText() + ', an estimate of its mean over all of them.' +
				' A larger sample gives a closer estimate; "Full scenario space" in the Calculations tab gives the' +
				' exact mean.';
		return '<span class="metric-caption" title="' + escapeHtml(title) + '">' +
			(sample.full ? 'Exact mean' : 'Estimated') + '</span>';
	}

	function summaryTitle(d, stats) {
		var name = Calculations.shownName(d);
		if (barJob) return name + ' is being calculated again for the changed tree.';
		if (stats) {
			return name + ': ' + (sample.full ? 'exact mean of ' : 'mean of ') + sampleText() + ' (min ' +
				withUnit(formatNumber(stats.min), d.unit) + ', max ' + withUnit(formatNumber(stats.max), d.unit) +
				'). Exact numbers per scenario are in the Calculations tab.';
		}
		if (sampleHasScenarios()) return name + ' has no number: every sampled scenario gives n/a or an error.';
		if (sample) {
			return (sample.contradictory ? 'The always/never marks are contradictory' : 'The tree is empty') +
				', so there is no scenario to estimate ' + name + ' from.';
		}
		return 'Sample the scenario space in the Calculations tab to estimate ' + name + '.';
	}

	function renderSummary() {
		var kpis = data.derived.filter(function (d) { return d.kpi; });
		if (!kpis.length) {
			kpiBar.innerHTML =
				'<span class="metric muted" title="Mark a calculated value as a KPI in the Calculations tab">' +
				'<span class="metric-label">KPIs</span><span class="metric-value">none yet</span></span>';
			return;
		}
		kpiBar.innerHTML = summaryCaptionHtml() + kpis.map(function (d) {
			var stats = sample ? Calculations.statistics(Calculations.numbersOf(results, d.name)) : null;
			var mean = stats ? escapeHtml(withUnit(formatNumber(stats.mean), d.unit)) : '';
			var value = !stats ? '&ndash;' : sample.full ? mean : '&asymp; ' + mean;
			return '<span class="metric' + (stats && !barJob ? '' : ' muted') + '"' +
				' title="' + escapeHtml(summaryTitle(d, stats)) + '">' +
				'<span class="metric-label">' + escapeHtml(Calculations.shownName(d)) + '</span>' +
				'<span class="metric-value">' + value + '</span></span>';
		}).join('');
	}

	/* ---------- Buttons ---------- */

	function fullSpaceTitle(total, contradictory) {
		if (total === 0) {
			return (contradictory ? 'The always/never marks are contradictory' : 'The tree is empty') +
				', so there is nothing to list';
		}
		if (total > MAX_SAMPLE_SIZE) {
			return 'The tree has ' + Render.scenarioSizeText(total) + ' scenarios, too many to list (at most ' +
				formatCount(MAX_SAMPLE_SIZE) + '): click to sample ' + formatCount(MAX_SAMPLE_SIZE) + ' of them instead';
		}
		return 'List all ' + formatCount(total) + ' scenarios of the tree';
	}

	function newSeed() { return Math.floor(Math.random() * SEED_RANGE); }

	function showNewSample() {
		evaluateAll();
		renderReport();
		renderSummary();
		reportHead.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function sampleNow(size) {
		var total = Model.scenarioSpaceSize();
		if (size > total) {
			alert('The scenario space has only ' + formatCount(total) + ' scenarios, fewer than the ' +
				formatCount(size) + ' you asked for, so the report lists all of them.');
			listFullSpace(newSeed(), total, spaceKey());
		} else {
			takeSample(size, newSeed(), spaceKey());
		}
		showNewSample();
	}

	function typedSize() {
		var typed = sampleSizeInput.value.trim();
		if (!/^\d+$/.test(typed) && !/^\d{1,3}([,. ]\d{3})+$/.test(typed)) return null;
		return Number(typed.replace(/[,. ]/g, ''));
	}

	function sampleCustom() {
		var size = typedSize();
		if (!(size >= 1 && size <= MAX_SAMPLE_SIZE && Math.floor(size) === size)) {
			alert('Enter a whole number of scenarios from 1 to ' + formatCount(MAX_SAMPLE_SIZE) + '.');
			return;
		}
		sampleSizeInput.value = formatCount(Math.min(size, Model.scenarioSpaceSize()));
		sampleNow(size);
	}

	function sampleFullSpace() {
		var total = Model.scenarioSpaceSize();
		if (total > MAX_SAMPLE_SIZE) {
			if (!confirm('The scenario space has ' + Render.scenarioSizeText(total) + ' scenarios, too many to list' +
				' (at most ' + formatCount(MAX_SAMPLE_SIZE) + '). Sample ' + formatCount(MAX_SAMPLE_SIZE) +
				' random scenarios instead?')) {
				return;
			}
			sampleSizeInput.value = formatCount(MAX_SAMPLE_SIZE);
			sampleNow(MAX_SAMPLE_SIZE);
			return;
		}
		listFullSpace(newSeed(), total, spaceKey());
		showNewSample();
	}

	quickSampleBtn.addEventListener('click', function () {
		sampleNow(Number(quickSampleBtn.getAttribute('data-calc-sample')));
	});

	sampleAllBtn.addEventListener('click', sampleFullSpace);

	sampleBtn.addEventListener('click', sampleCustom);

	sampleSizeInput.addEventListener('keydown', function (e) {
		if (e.key === 'Enter') sampleCustom();
	});

	sampleSizeInput.addEventListener('change', function () {
		var size = typedSize();
		if (size >= 1 && Math.floor(size) === size) sampleSizeInput.value = formatCount(size);
	});

	addDerivedBtn.addEventListener('click', addDerived);

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
		setState: setState,
		reset: reset,
		isUntouched: isUntouched
	};
})(NovaDM.Model, NovaDM.Calculations, NovaDM.Render, NovaDM.CalculationsReport, NovaDM.Util);
