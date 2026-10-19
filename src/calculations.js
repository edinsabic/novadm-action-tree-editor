window.NovaDM = window.NovaDM || {};

/**
 * Engine of the Calculations tab: the formula language of calculated
 * values (parse, references, evaluate one scenario), scenario counts,
 * uniform sampling, listing every scenario, the scenario picked by hand,
 * and statistics. No DOM.
 * Language and sampling: ../spec/action-tree-grammar.md
 */
NovaDM.Calculations = (function (Util) {
	'use strict';

	var KEYWORDS = ['if', 'then', 'else', 'total', 'selected'];
	var FUNCTIONS = ['total', 'selected'];
	var COMPARISONS = ['=', '<', '>'];
	var CHILD_KEYS = ['cond', 'yes', 'no', 'left', 'right', 'operand'];
	var ERROR = { error: true };
	var TOO_LONG = 'The formula is too long, or has too many brackets inside each other, to calculate.';

	var TOKEN_PATTERNS = [
		{ type: 'space', re: /^\s+/ },
		{ type: 'number', re: /^\d+(\.\d+)?/ },
		{ type: 'name', re: /^[\p{L}_][\p{L}\d_]*/u },
		{ type: 'text', re: /^'[^']*'/ },
		{ type: 'symbol', re: /^[-+*\/()=<>.]/ }
	];

	var ARITHMETIC = {
		'+': function (a, b) { return a + b; },
		'-': function (a, b) { return a - b; },
		'*': function (a, b) { return a * b; },
		'/': function (a, b) { return b === 0 ? null : a / b; }
	};

	var own = Util.own;

	function unique(list) {
		return list.filter(function (item, i) { return list.indexOf(item) === i; });
	}

	function toSet(list) {
		var set = Object.create(null);
		list.forEach(function (item) { set[item] = true; });
		return set;
	}

	function isName(text) {
		return /^[\p{L}_][\p{L}\d_]*$/u.test(text) && KEYWORDS.indexOf(text.toLowerCase()) === -1;
	}

	/* ---------- Tokens ---------- */

	function syntaxError(message, position) {
		var err = new Error('Syntax error at position ' + position + ': ' + message);
		err.position = position;
		return err;
	}

	function tokenize(text) {
		var tokens = [];
		var pos = 0;
		while (pos < text.length) {
			var rest = text.slice(pos);
			var pattern = TOKEN_PATTERNS.filter(function (p) { return p.re.test(rest); })[0];
			if (!pattern) {
				var c = rest.charAt(0);
				throw syntaxError(c === "'" ? 'the text has no closing \'' : 'unexpected "' + c + '"', pos + 1);
			}
			var raw = pattern.re.exec(rest)[0];
			if (pattern.type !== 'space') tokens.push({ type: pattern.type, raw: raw, pos: pos + 1 });
			pos += raw.length;
		}
		tokens.push({ type: 'end', raw: '', pos: text.length + 1 });
		return tokens;
	}

	/* ---------- Parse ---------- */

	/**
	 * Parses a formula into a syntax tree. Throws an Error with a `position` (1-based)
	 * on a syntax error.
	 */
	function parse(text) {
		var tokens = tokenize(String(text));
		var at = 0;

		function peek() { return tokens[at]; }

		function next() { return tokens[at++]; }

		function isWord(token, word) { return token.type === 'name' && token.raw.toLowerCase() === word; }

		function isSymbol(token, symbols) { return token.type === 'symbol' && symbols.indexOf(token.raw) !== -1; }

		function fail(expected) {
			var token = peek();
			var found = token.type === 'end' ? 'the end' : '"' + token.raw + '"';
			var message = expected ? 'expected ' + expected + ', found ' + found : 'unexpected ' + found;
			throw syntaxError(message, token.pos);
		}

		function expectWord(word) {
			if (!isWord(peek(), word)) fail('"' + word + '"');
			next();
		}

		function expectSymbol(symbol) {
			if (!isSymbol(peek(), [symbol])) fail('"' + symbol + '"');
			next();
		}

		function expectName(what) {
			if (peek().type !== 'name') fail(what);
			return next().raw;
		}

		function expr() {
			if (!isWord(peek(), 'if')) return compare();
			next();
			var cond = expr();
			expectWord('then');
			var yes = expr();
			expectWord('else');
			return { type: 'if', cond: cond, yes: yes, no: expr() };
		}

		function compare() {
			var left = sum();
			if (!isSymbol(peek(), COMPARISONS)) return left;
			return { type: 'compare', op: next().raw, left: left, right: sum() };
		}

		function binary(operand, symbols) {
			return function () {
				var node = operand();
				while (isSymbol(peek(), symbols)) {
					node = { type: 'binary', op: next().raw, left: node, right: operand() };
				}
				return node;
			};
		}

		function unary() {
			if (!isSymbol(peek(), ['-'])) return primary();
			next();
			return { type: 'negate', operand: unary() };
		}

		var product = binary(unary, ['*', '/']);
		var sum = binary(product, ['+', '-']);

		function primary() {
			var token = peek();
			if (token.type === 'number') return { type: 'number', value: Number(next().raw) };
			if (token.type === 'text') return { type: 'text', value: next().raw.slice(1, -1) };
			if (isSymbol(token, ['('])) {
				next();
				var inner = expr();
				expectSymbol(')');
				return inner;
			}
			var word = token.type === 'name' ? token.raw.toLowerCase() : null;
			if (word === null || (KEYWORDS.indexOf(word) !== -1 && FUNCTIONS.indexOf(word) === -1)) {
				fail('a number, a name or "("');
			}
			next();
			if (FUNCTIONS.indexOf(word) !== -1) {
				expectSymbol('(');
				var arg = expectName('a name');
				expectSymbol(')');
				return { type: word, name: arg };
			}
			if (!isSymbol(peek(), ['.'])) return { type: 'name', name: token.raw };
			next();
			return { type: 'lookup', label: token.raw, attribute: expectName('an attribute name') };
		}

		var tree = expr();
		if (peek().type !== 'end') fail(null);
		return tree;
	}

	/* ---------- References ---------- */

	function references(node, refs) {
		refs = refs || { names: [], lookups: [], totals: [], selected: [] };
		if (node.type === 'name') refs.names.push(node.name);
		else if (node.type === 'lookup') refs.lookups.push({ label: node.label, attribute: node.attribute });
		else if (node.type === 'total') refs.totals.push(node.name);
		else if (node.type === 'selected') refs.selected.push(node.name);
		CHILD_KEYS.forEach(function (key) {
			if (node[key]) references(node[key], refs);
		});
		return refs;
	}

	function checkNames(refs, byName, isLabel, isAttribute) {
		var unknown = [];
		var missing = [];

		function label(name) {
			if (isLabel[name]) return;
			if (byName[name] || isAttribute[name]) unknown.push(name);
			else if (missing.indexOf(name) === -1) missing.push(name);
		}

		refs.names.forEach(function (n) {
			if (!byName[n]) label(n);
		});
		refs.lookups.forEach(function (l) {
			label(l.label);
			if (!isLabel[l.attribute] && !isAttribute[l.attribute]) unknown.push(l.attribute);
		});
		refs.totals.forEach(function (a) {
			if (!isAttribute[a]) unknown.push(a);
		});
		refs.selected.forEach(function (l) { label(l); });
		return { unknown: unknown[0] || null, missing: missing };
	}

	function orderAndMarkCycles(items, byName) {
		var state = Object.create(null);
		var path = [];
		var order = [];

		function visit(item) {
			if (state[item.name] === 'done') return;
			if (state[item.name] === 'active') {
				var cycle = path.slice(path.indexOf(item.name)).concat(item.name);
				cycle.slice(1).forEach(function (n) {
					if (!byName[n].error) byName[n].error = 'Cycle: ' + cycle.join(' → ');
				});
				return;
			}
			state[item.name] = 'active';
			path.push(item.name);
			item.inputs.forEach(function (n) { visit(byName[n]); });
			path.pop();
			state[item.name] = 'done';
			order.push(item.name);
		}

		items.forEach(visit);
		return order;
	}

	/**
	 * Parses every derived attribute of `data` and checks its names against the labels and attributes. Returns
	 * { items, byName, order, labels, attributes }; an item has { name, ast, refs, inputs (derived names), missing
	 * (the labels it uses that are not in the tree), error }, and `order` lists inputs before what uses them.
	 */
	function analyze(data, treeLabels) {
		var values = data.values || {};
		var derived = data.derived || [];
		var labels = unique(treeLabels.concat(Object.keys(values)));
		var attributes = unique(data.attributes || []);
		Object.keys(values).forEach(function (label) {
			attributes = unique(attributes.concat(Object.keys(values[label] || {})));
		});
		var isLabel = toSet(labels);
		var isAttribute = toSet(attributes);

		var byName = Object.create(null);
		var items = derived.map(function (d) {
			var item = { name: d.name, ast: null, refs: null, inputs: [], missing: [], error: null };
			byName[d.name] = item;
			return item;
		});

		items.forEach(function (item, i) {
			try {
				item.ast = parse(derived[i].formula);
				item.refs = references(item.ast);
			} catch (err) {
				item.ast = null;
				item.refs = null;
				item.error = err instanceof RangeError ? TOO_LONG : err.message;
				return;
			}
			item.inputs = unique(item.refs.names.filter(function (n) { return byName[n]; }));
			var names = checkNames(item.refs, byName, isLabel, isAttribute);
			item.missing = names.missing;
			if (names.unknown) item.error = 'Unknown name: ' + names.unknown;
		});

		var order = orderAndMarkCycles(items, byName);
		order.forEach(function (name) {
			var item = byName[name];
			var broken = item.inputs.filter(function (n) { return byName[n].error; })[0];
			if (!item.error && broken) item.error = 'Uses ' + broken + ', which has an error';
		});

		return { items: items, byName: byName, order: order, labels: labels, attributes: attributes };
	}

	/* ---------- Data ---------- */

	function starterData() {
		return {
			attributes: ['price', 'co2'],
			units: { price: 'DKK', co2: 'kg CO₂e' },
			values: {},
			derived: [
				{ name: 'sum', displayName: 'Sum', formula: 'total(price)', unit: 'DKK', kpi: true },
				{ name: 'gwp', displayName: 'GWP', formula: 'total(co2)', unit: 'kg CO₂e', kpi: true }
			]
		};
	}

	/* ---------- Evaluate ---------- */

	function numberFor(values, label, attribute, option) {
		var byAttribute = own(values, label) ? values[label] : null;
		var stored = own(byAttribute, attribute) ? byAttribute[attribute] : null;
		if (typeof stored === 'number') return stored;
		if (stored && typeof stored === 'object' && own(stored, option) && typeof stored[option] === 'number') {
			return stored[option];
		}
		return null;
	}

	function toNumber(value) {
		if (typeof value === 'number') return value;
		if (typeof value === 'boolean') return value ? 1 : 0;
		if (typeof value !== 'string') return null;
		var match = /^(-?\d+(?:\.\d+)?)(%?)$/.exec(value.trim());
		if (!match) return null;
		return match[2] ? Number(match[1]) / 100 : Number(match[1]);
	}

	function isTrue(value) {
		if (typeof value === 'boolean') return value;
		var n = toNumber(value);
		return n !== null && n !== 0;
	}

	function compareValues(op, a, b) {
		if (op === '=' && typeof a === 'string' && typeof b === 'string') return a === b;
		var x = toNumber(a);
		var y = toNumber(b);
		if (x === null || y === null) return false;
		if (op === '=') return x === y;
		return op === '<' ? x < y : x > y;
	}

	function evaluate(node, ctx) {
		var type = node.type;
		if (type === 'number' || type === 'text') return node.value;
		if (type === 'name') {
			if (ctx.byName[node.name]) return ctx.results[node.name];
			return ctx.byLabel[node.name] ? ctx.byLabel[node.name].value : null;
		}
		if (type === 'lookup') {
			var entry = ctx.byLabel[node.label];
			return entry ? numberFor(ctx.values, node.label, node.attribute, entry.value) : null;
		}
		if (type === 'total') {
			return ctx.scenario.reduce(function (total, e) {
				var n = numberFor(ctx.values, e.label, node.name, e.value);
				return n === null ? total : total + n;
			}, 0);
		}
		if (type === 'selected') return !!ctx.byLabel[node.name];
		if (type === 'negate') {
			var operand = toNumber(evaluate(node.operand, ctx));
			return operand === null ? null : -operand;
		}
		if (type === 'binary') {
			var a = toNumber(evaluate(node.left, ctx));
			var b = toNumber(evaluate(node.right, ctx));
			var result = a === null || b === null ? null : ARITHMETIC[node.op](a, b);
			return result === null || !isFinite(result) ? null : result;
		}
		if (type === 'compare') return compareValues(node.op, evaluate(node.left, ctx), evaluate(node.right, ctx));
		return isTrue(evaluate(node.cond, ctx)) ? evaluate(node.yes, ctx) : evaluate(node.no, ctx);
	}

	function evaluateScenario(analysis, data, scenario) {
		var byLabel = Object.create(null);
		scenario.forEach(function (entry) {
			if (!byLabel[entry.label]) byLabel[entry.label] = entry;
		});
		var results = Object.create(null);
		var ctx = {
			values: data.values || {},
			scenario: scenario,
			byLabel: byLabel,
			byName: analysis.byName,
			results: results
		};
		analysis.order.forEach(function (name) {
			var item = analysis.byName[name];
			if (item.error) {
				results[name] = ERROR;
				return;
			}
			try {
				results[name] = evaluate(item.ast, ctx);
			} catch (err) {
				if (!(err instanceof RangeError)) throw err;
				results[name] = ERROR;
			}
		});
		return results;
	}

	function isError(value) { return value === ERROR; }

	/* ---------- Count and sample ---------- */

	function optionCount(node) { return Math.max(node.value.length, 1); }

	function countInto(node, counts) {
		var childCounts = node.children.map(function (c) { return countInto(c, counts); });
		var sub = node.kind === 'XOR' && childCounts.length > 0
			? childCounts.reduce(function (s, c) { return s + c; }, 0)
			: childCounts.reduce(function (p, c) { return p * c; }, 1);
		counts[node.id] = sub * optionCount(node);
		return counts[node.id];
	}

	function count(node) {
		return node ? countInto(node, {}) : 0;
	}

	function seededRandom(seed) {
		var state = seed >>> 0;
		return function () {
			state = (state + 0x6D2B79F5) >>> 0;
			var t = Math.imul(state ^ (state >>> 15), 1 | state);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	function drawInto(node, counts, random, scenario) {
		var value = node.value.length ? node.value[Math.floor(random() * node.value.length)] : '';
		scenario.push({ id: node.id, label: node.label, value: value });
		if (node.kind !== 'XOR' || node.children.length === 0) {
			node.children.forEach(function (c) { drawInto(c, counts, random, scenario); });
			return;
		}
		var r = random() * counts[node.id] / optionCount(node);
		var chosen = node.children[node.children.length - 1];
		for (var i = 0; i < node.children.length; i++) {
			r -= counts[node.children[i].id];
			if (r < 0) {
				chosen = node.children[i];
				break;
			}
		}
		drawInto(chosen, counts, random, scenario);
	}

	/**
	 * Draws `size` scenarios below `node`, each uniformly from the whole scenario space (profiles
	 * are ignored). A scenario is a list of { id, label, value }; `random` returns a number in [0, 1).
	 */
	function sample(node, size, random) {
		if (!node) return [];
		var counts = {};
		countInto(node, counts);
		var scenarios = [];
		for (var i = 0; i < size; i++) {
			var scenario = [];
			drawInto(node, counts, random, scenario);
			scenarios.push(scenario);
		}
		return scenarios;
	}

	function enumerateFrom(node) {
		var below = [[]];
		if (node.kind === 'XOR' && node.children.length > 0) {
			below = [];
			node.children.forEach(function (c) { below = below.concat(enumerateFrom(c)); });
		} else {
			node.children.forEach(function (c) {
				var options = enumerateFrom(c);
				var combined = [];
				below.forEach(function (start) {
					options.forEach(function (rest) { combined.push(start.concat(rest)); });
				});
				below = combined;
			});
		}
		var scenarios = [];
		(node.value.length ? node.value : ['']).forEach(function (value) {
			var entry = { id: node.id, label: node.label, value: value };
			below.forEach(function (rest) { scenarios.push([entry].concat(rest)); });
		});
		return scenarios;
	}

	function enumerate(node) {
		return node ? enumerateFrom(node) : [];
	}

	/* ---------- Chosen scenario ---------- */

	function chooseInto(node, choices, scenario) {
		var picked = choices.options[node.id];
		var value = node.value.indexOf(picked) !== -1 ? picked : (node.value[0] || '');
		scenario.push({ id: node.id, label: node.label, value: value });
		if (node.kind !== 'XOR' || node.children.length === 0) {
			node.children.forEach(function (c) { chooseInto(c, choices, scenario); });
			return;
		}
		var branch = node.children.filter(function (c) { return c.id === choices.branches[node.id]; })[0];
		chooseInto(branch || node.children[0], choices, scenario);
	}

	function scenarioFor(node, choices) {
		var scenario = [];
		if (node) chooseInto(node, choices || { options: {}, branches: {} }, scenario);
		return scenario;
	}

	function entriesById(scenario) {
		var entries = Object.create(null);
		scenario.forEach(function (e) { entries[e.id] = e; });
		return entries;
	}

	function choicesFor(node, scenario) {
		var byId = entriesById(scenario);
		var choices = { options: {}, branches: {} };

		function visit(n) {
			if (!byId[n.id]) return;
			if (byId[n.id].value !== '') choices.options[n.id] = byId[n.id].value;
			var chosen = n.children.filter(function (c) { return byId[c.id]; });
			if (n.kind === 'XOR' && chosen.length) choices.branches[n.id] = chosen[0].id;
			chosen.forEach(visit);
		}

		if (node) visit(node);
		return choices;
	}

	/* ---------- Statistics ---------- */

	function numbersOf(results, name) {
		return results.map(function (r) { return r[name]; }).filter(function (v) { return typeof v === 'number'; });
	}

	function statistics(numbers) {
		if (numbers.length === 0) return null;
		var sorted = numbers.slice().sort(function (a, b) { return a - b; });
		var n = sorted.length;
		var mid = Math.floor(n / 2);
		var mean = sorted.reduce(function (s, x) { return s + x; }, 0) / n;
		var squares = sorted.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0);
		return {
			min: sorted[0],
			mean: mean,
			median: n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
			max: sorted[n - 1],
			stdDev: n > 1 ? Math.sqrt(squares / (n - 1)) : 0
		};
	}

	function histogram(numbers, binCount) {
		if (numbers.length === 0) return null;
		var min = numbers.reduce(function (m, x) { return Math.min(m, x); }, Infinity);
		var max = numbers.reduce(function (m, x) { return Math.max(m, x); }, -Infinity);
		var bins = max === min ? 1 : binCount;
		var width = (max - min) / bins;
		var counts = [];
		for (var i = 0; i < bins; i++) counts.push(0);
		numbers.forEach(function (x) {
			counts[width === 0 ? 0 : Math.min(bins - 1, Math.floor((x - min) / width))]++;
		});
		return { min: min, max: max, width: width, counts: counts };
	}

	return {
		isName: isName,
		analyze: analyze,
		starterData: starterData,
		numberFor: numberFor,
		evaluateScenario: evaluateScenario,
		isError: isError,
		count: count,
		seededRandom: seededRandom,
		sample: sample,
		enumerate: enumerate,
		scenarioFor: scenarioFor,
		entriesById: entriesById,
		choicesFor: choicesFor,
		numbersOf: numbersOf,
		statistics: statistics,
		histogram: histogram
	};
})(NovaDM.Util);
