window.NovaDM = window.NovaDM || {};

/**
 * The Calculations tab's report on the scenarios of the tree on screen, a random sample or all of them: the
 * banner until the first sample, then a card per KPI (mean, spread, histogram, lowest and highest scenario)
 * and a sortable table of the scenarios. It also formats the numbers the rest of the tab shows.
 */
NovaDM.CalculationsReport = (function (Calculations, Render, Util) {
	'use strict';

	var PAGE_SIZE = 100;
	var BY_NUMBER = '#';
	var CHART_WIDTH = 300;
	var CAPTION_HEIGHT = 20;
	var PLOT_HEIGHT = 84;
	var AXIS_HEIGHT = 18;
	var MAX_BINS = 20;
	var MAX_BAR_WIDTH = 24;
	var BAR_GAP = 2;
	var BAR_RADIUS = 4;

	var escapeHtml = Util.escapeHtml;

	var reportHead = document.getElementById('calc-report-head');
	var reportHost = document.getElementById('calc-report');

	var sample = null;
	var results = [];
	var derived = [];
	var analysis = null;
	var optionBoxes = [];
	var onShowScenario = null;
	var onClose = null;
	var shownRow = null;
	var sortBy = { name: BY_NUMBER, dir: 1 };
	var page = 0;

	function isNumber(value) { return typeof value === 'number'; }

	/* ---------- Numbers ---------- */

	function formatNumber(n) {
		return n.toLocaleString('en-GB', { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });
	}

	function formatCount(n) {
		return n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
	}

	function formatShare(part, whole) {
		var share = part / whole;
		return share >= 0.001 ? (share * 100).toFixed(1) + '%' : 'under 0.1%';
	}

	function withUnit(text, unit) {
		return unit ? text + '\u00a0' + unit : text;
	}

	function nameWithUnit(name, unit) {
		return unit ? name + ' (' + unit + ')' : name;
	}

	function valueHtml(value, unit) {
		if (Calculations.isError(value)) return '<span class="calc-error-text">error</span>';
		if (value === null || value === undefined) return '<span class="calc-na">n/a</span>';
		if (isNumber(value)) return escapeHtml(withUnit(formatNumber(value), unit));
		return escapeHtml(String(value));
	}

	/* ---------- KPI cards ---------- */

	function derivedUnit(name) {
		var match = derived.filter(function (d) { return d.name === name; })[0];
		return match && match.unit ? match.unit : '';
	}

	function reportColumns() {
		var names = derived.filter(function (d) { return d.kpi; }).map(function (d) { return d.name; });
		var fallback = names.length === 0;
		if (fallback) {
			var used = Object.create(null);
			analysis.items.forEach(function (item) {
				item.inputs.forEach(function (n) {
					if (n !== item.name) used[n] = true;
				});
			});
			names = derived.map(function (d) { return d.name; }).filter(function (n) { return !used[n]; });
		}
		return {
			fallback: fallback,
			list: names.map(function (name) {
				var numbers = Calculations.numbersOf(results, name);
				return { name: name, stats: Calculations.statistics(numbers), numbers: numbers };
			})
		};
	}

	function showButton(index) {
		return '<button type="button" class="calc-show-btn" data-calc-show="' + index + '"' +
			' title="Open scenario #' + (index + 1) + ' in the graph">#' + (index + 1) + '</button>';
	}

	function extremeIndex(name, wantMax) {
		var best = -1;
		results.forEach(function (r, i) {
			var v = r[name];
			if (isNumber(v) && (best === -1 || (wantMax ? v > results[best][name] : v < results[best][name]))) best = i;
		});
		return best;
	}

	function barPath(x, y, width, height) {
		var r = Math.min(BAR_RADIUS, height, width / 2);
		var bottom = y + height;
		return 'M' + x + ' ' + bottom + ' V' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
			' H' + (x + width - r) + ' Q' + (x + width) + ' ' + y + ' ' + (x + width) + ' ' + (y + r) +
			' V' + bottom + ' Z';
	}

	function histogramSvg(name, numbers, stats) {
		var bins = Math.min(MAX_BINS, Math.max(1, Math.ceil(Math.sqrt(numbers.length))));
		var h = Calculations.histogram(numbers, bins);
		var tallest = Math.max.apply(null, h.counts);
		var slot = CHART_WIDTH / h.counts.length;
		var barWidth = Math.min(MAX_BAR_WIDTH, slot - BAR_GAP);
		var bars = h.counts.map(function (count, i) {
			var from = h.min + i * h.width;
			var range = h.width === 0
				? formatNumber(h.min)
				: formatNumber(from) + ' to ' + formatNumber(from + h.width);
			var height = count ? Math.max(2, count / tallest * PLOT_HEIGHT) : 0;
			return '<g class="calc-bin"><title>' + escapeHtml(range + ': ' + formatCount(count) + ' of ' +
				formatCount(numbers.length) + ' scenarios') + '</title>' +
				'<rect class="calc-bin-hit" x="' + i * slot + '" y="0" width="' + slot + '"' +
				' height="' + PLOT_HEIGHT + '"/>' +
				(count ? '<path class="calc-bar" d="' + barPath(i * slot + (slot - barWidth) / 2,
					PLOT_HEIGHT - height, barWidth, height) + '"/>' : '') +
				'</g>';
		}).join('');
		var meanX = h.max === h.min ? CHART_WIDTH / 2 : (stats.mean - h.min) / (h.max - h.min) * CHART_WIDTH;
		var axisY = PLOT_HEIGHT + AXIS_HEIGHT - 4;
		return '<svg class="calc-histogram" width="' + CHART_WIDTH + '"' +
			' height="' + (CAPTION_HEIGHT + PLOT_HEIGHT + AXIS_HEIGHT) + '"' +
			' role="img" aria-label="' + escapeHtml('Distribution of ' + name + ' over the sample') + '">' +
			'<text class="calc-axis-text" x="0" y="11">Scenarios per range (tallest bar: ' + formatCount(tallest) +
				')</text>' +
			'<g transform="translate(0 ' + CAPTION_HEIGHT + ')">' +
			'<line class="calc-axis" x1="0" y1="' + PLOT_HEIGHT + '" x2="' + CHART_WIDTH + '"' +
			' y2="' + PLOT_HEIGHT + '"/>' +
			bars +
			'<line class="calc-mean-line" x1="' + meanX + '" y1="0" x2="' + meanX + '" y2="' + PLOT_HEIGHT + '"/>' +
			'<text class="calc-axis-text" x="0" y="' + axisY + '">' + escapeHtml(formatNumber(h.min)) + '</text>' +
			'<text class="calc-axis-text" x="' + CHART_WIDTH + '" y="' + axisY + '" text-anchor="end">' +
			escapeHtml(formatNumber(h.max)) + '</text>' +
			'</g></svg>';
	}

	function kpiCardHtml(column) {
		var unit = derivedUnit(column.name);
		var head = '<div class="calc-kpi-card-head"><span class="calc-kpi-name">' +
			escapeHtml(nameWithUnit(column.name, unit)) + '</span>';
		if (!column.stats) {
			return '<article class="calc-kpi-card">' + head + '</div>' +
				'<p class="note">No numbers: every scenario gives n/a or an error.</p></article>';
		}
		var missing = sample.scenarios.length - column.numbers.length;
		var stats = column.stats;
		return '<article class="calc-kpi-card">' + head +
			'<span class="note">mean of ' + formatCount(column.numbers.length) + ' scenarios' +
			(missing ? ' (' + formatCount(missing) + ' without a number)' : '') + '</span></div>' +
			'<div class="calc-kpi-mean">' + escapeHtml(withUnit(formatNumber(stats.mean), unit)) + '</div>' +
			'<dl class="calc-kpi-stats">' + [['Min', stats.min], ['Median', stats.median], ['Max', stats.max],
				['Std dev', stats.stdDev]].map(function (pair) {
				return '<div><dt>' + pair[0] + '</dt><dd>' + escapeHtml(formatNumber(pair[1])) + '</dd></div>';
			}).join('') + '</dl>' +
			histogramSvg(column.name, column.numbers, stats) +
			'<div class="calc-kpi-extremes">Lowest ' + showButton(extremeIndex(column.name, false)) +
			' &middot; Highest ' + showButton(extremeIndex(column.name, true)) +
			' <span class="note">(the line marks the mean)</span></div>' +
			'</article>';
	}

	/* ---------- Scenario table ---------- */

	function scaleColor(value, stats) {
		if (!isNumber(value) || !stats || stats.max === stats.min) return '';
		var t = (value - stats.min) / (stats.max - stats.min);
		var mix = t <= 0.5
			? 'var(--color-scale-mid) ' + Math.round(t * 200) + '%, var(--color-scale-low)'
			: 'var(--color-scale-high) ' + Math.round((t - 0.5) * 200) + '%, var(--color-scale-mid)';
		return ' style="background-color: color-mix(in srgb, ' + mix + ')"';
	}

	function sortedRows() {
		var order = results.map(function (r, i) { return i; });
		if (sortBy.name === BY_NUMBER) return sortBy.dir === 1 ? order : order.reverse();
		return order.sort(function (a, b) {
			var x = results[a][sortBy.name];
			var y = results[b][sortBy.name];
			if (!isNumber(x) || !isNumber(y)) return (isNumber(x) ? -1 : 0) + (isNumber(y) ? 1 : 0) || a - b;
			return (x - y) * sortBy.dir || a - b;
		});
	}

	function sortHeaderHtml(name) {
		var mark = sortBy.name === name ? (sortBy.dir === 1 ? ' &uarr;' : ' &darr;') : '';
		var title = name === BY_NUMBER ? 'Sort by number' : 'Sort by ' + name;
		var heading = name === BY_NUMBER ? name : nameWithUnit(name, derivedUnit(name));
		return '<th><button type="button" class="calc-sort-btn" data-calc-sort="' + escapeHtml(name) + '"' +
			' title="' + escapeHtml(title) + '">' + escapeHtml(heading) + mark + '</button></th>';
	}

	function pagerHtml(count, pages) {
		if (pages < 2) return '';
		var first = page * PAGE_SIZE + 1;
		var last = Math.min(count, first + PAGE_SIZE - 1);
		return '<div class="calc-pager">' +
			'<button class="btn-icon" type="button" data-calc-page="-1" aria-label="Previous page"' +
			' title="Previous ' + PAGE_SIZE + ' scenarios"' + (page === 0 ? ' disabled' : '') + '>&lsaquo;</button>' +
			'<span>Scenarios ' + formatCount(first) + '&ndash;' + formatCount(last) + ' of ' + formatCount(count) +
			' &middot; page ' + (page + 1) + ' of ' + pages + '</span>' +
			'<button class="btn-icon" type="button" data-calc-page="1" aria-label="Next page"' +
			' title="Next ' + PAGE_SIZE + ' scenarios"' + (page === pages - 1 ? ' disabled' : '') + '>' +
			'&rsaquo;</button>' +
			'</div>';
	}

	function scenarioTableHtml(columns) {
		var sortColumnGone = !columns.some(function (c) { return c.name === sortBy.name; });
		if (sortBy.name !== BY_NUMBER && sortColumnGone) sortBy = { name: BY_NUMBER, dir: 1 };
		var order = sortedRows();
		var pages = Math.max(1, Math.ceil(order.length / PAGE_SIZE));
		page = Math.min(page, pages - 1);
		var shown = order.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
		var head = '<tr>' + sortHeaderHtml(BY_NUMBER) +
			columns.map(function (c) { return sortHeaderHtml(c.name); }).join('') +
			optionBoxes.map(function (b) {
				return '<th class="calc-option-col">' + escapeHtml(b.node.label) + '</th>';
			}).join('') + '</tr>';
		var body = shown.map(function (i) {
			var entries = Calculations.entriesById(sample.scenarios[i]);
			return '<tr data-calc-row="' + i + '"' + (i === shownRow ? ' class="current"' : '') + '>' +
				'<th>' + showButton(i) + '</th>' +
				columns.map(function (c) {
					var value = results[i][c.name];
					return '<td' + scaleColor(value, c.stats) + '>' + valueHtml(value) + '</td>';
				}).join('') +
				optionBoxes.map(function (b) {
					var e = entries[b.node.id];
					return '<td class="calc-option-col">' +
						(e ? escapeHtml(e.value || 'chosen') : '<span class="calc-na">&ndash;</span>') + '</td>';
				}).join('') + '</tr>';
		}).join('');
		var listedIn = sortBy.name !== BY_NUMBER ? 'sorted by ' + escapeHtml(sortBy.name)
			: (sample.full ? 'in tree order' : 'in the order they were drawn') +
				(sortBy.dir === 1 ? '' : ', last first');
		var footer = 'All ' + formatCount(order.length) + ' scenarios, ' +
			(pages > 1 ? formatCount(PAGE_SIZE) + ' per page, ' : '') + listedIn + '.';
		return pagerHtml(order.length, pages) +
			'<div class="calc-scenarios-wrap"><table class="calc-table calc-scenarios">' +
			'<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
			pagerHtml(order.length, pages) +
			'<p class="note">' + footer + '</p>';
	}

	/* ---------- Report ---------- */

	function bannerHtml() {
		return '<div class="calc-report-text">' +
			'<strong class="calc-report-title">Explore the scenario space</strong>' +
			'<span>Sample it with the buttons above: <b>30 scenarios</b>, the <b>full scenario space</b>, or your own' +
			' number of scenarios. A report then opens here: each KPI&rsquo;s mean, spread and distribution, its' +
			' lowest and highest scenario, and the scenarios themselves, which you can open in the graph.</span>' +
			'</div>';
	}

	function reportHeadHtml() {
		var count = formatCount(sample.size);
		var meta;
		if (!sample.scenarios.length) {
			meta = (sample.contradictory ? 'The always/never marks are contradictory' : 'The tree is empty') +
				', so there is nothing to ' + (sample.full ? 'list' : 'sample') + '.';
		} else if (sample.full) {
			meta = 'All ' + formatCount(sample.total) + ' scenarios of the space';
		} else {
			meta = (sample.tooMany
				? 'The tree now has too many scenarios to list, so these are ' + count + ' random ones'
				: count + ' random scenarios') + ' out of ' + Render.scenarioSizeHtml(sample.total) +
				' &middot; ' + formatCount(sample.distinct) + ' different ones (' +
				formatShare(sample.distinct, sample.total) + ' of the space) &middot; every scenario is equally' +
				' likely';
		}
		var title = sample.full ? 'Full scenario space' : 'Sample report';
		return '<div class="calc-report-text">' +
			'<strong class="calc-report-title">' + title + '</strong>' +
			'<span>' + meta + '</span>' +
			'</div>' +
			'<button class="flyout-close calc-report-close" type="button" data-calc-report="close"' +
			' aria-label="Close the report" title="Close the report and clear the sample">&times;</button>';
	}

	function reportBodyHtml() {
		var columns = reportColumns();
		if (!columns.list.length) return '<p class="editor-empty">No calculated values yet.</p>';
		return '<section class="calc-report-section">' +
			'<div class="calc-section-head"><h3>KPIs</h3>' +
			(columns.fallback
				? '<span class="note">No calculated value is marked as a KPI, so these are the ones that no' +
					' other formula uses.</span>'
				: '') +
			'</div>' +
			'<div class="calc-kpi-cards">' + columns.list.map(kpiCardHtml).join('') + '</div>' +
			'</section>' +
			'<section class="calc-report-section">' +
			'<div class="calc-section-head"><h3>Sampled scenarios</h3>' +
			'<span class="note">Click a number to show that scenario in the graph: every box switches to its' +
				' option. Click # or a KPI to sort.</span>' +
			'<span class="calc-scale-legend">lowest' +
			'<span class="calc-scale-bar" aria-hidden="true"></span>highest</span>' +
			'</div>' +
			scenarioTableHtml(columns.list) +
			'</section>';
	}

	function renderReport() {
		var hasBody = !!sample && sample.scenarios.length > 0;
		reportHead.classList.toggle('open', hasBody);
		reportHost.hidden = !hasBody;
		reportHead.innerHTML = sample ? reportHeadHtml() : bannerHtml();
		reportHost.innerHTML = hasBody ? reportBodyHtml() : '';
	}

	/**
	 * Shows the banner, or the report on `input.sample`. `input` also holds its `results`, the `derived` list
	 * and its `analysis`, the `optionBoxes`, `onShowScenario(index)` and `onClose()`.
	 */
	function render(input) {
		if (input.sample !== sample) page = 0;
		sample = input.sample;
		results = input.results;
		derived = input.derived;
		analysis = input.analysis;
		optionBoxes = input.optionBoxes;
		onShowScenario = input.onShowScenario;
		onClose = input.onClose;
		renderReport();
	}

	function markShownRow(index) {
		shownRow = index;
		reportHost.querySelectorAll('[data-calc-row]').forEach(function (row) {
			row.classList.toggle('current', Number(row.getAttribute('data-calc-row')) === shownRow);
		});
	}

	reportHead.addEventListener('click', function (e) {
		if (e.target.closest('[data-calc-report="close"]')) onClose();
	});

	reportHost.addEventListener('click', function (e) {
		var show = e.target.closest('[data-calc-show]');
		var sort = e.target.closest('[data-calc-sort]');
		var turn = e.target.closest('[data-calc-page]');
		if (show) {
			var index = Number(show.getAttribute('data-calc-show'));
			var onPage = Math.floor(sortedRows().indexOf(index) / PAGE_SIZE);
			if (onPage === page) {
				markShownRow(index);
			} else {
				page = onPage;
				shownRow = index;
				renderReport();
			}
			onShowScenario(index);
		} else if (sort) {
			var name = sort.getAttribute('data-calc-sort');
			sortBy = sortBy.name === name ? { name: name, dir: -sortBy.dir } : { name: name, dir: 1 };
			page = 0;
			renderReport();
		} else if (turn) {
			page += Number(turn.getAttribute('data-calc-page'));
			renderReport();
		}
	});

	return {
		render: render,
		markShownRow: markShownRow,
		formatNumber: formatNumber,
		formatCount: formatCount,
		withUnit: withUnit,
		nameWithUnit: nameWithUnit,
		valueHtml: valueHtml
	};
})(NovaDM.Calculations, NovaDM.Render, NovaDM.Util);
