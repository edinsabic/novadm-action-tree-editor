window.NovaDM = window.NovaDM || {};

/**
 * The Calculations tab's report on the scenarios of the tree on screen, a random sample or all of them: the
 * banner until the first sample, then a card per KPI (mean, spread, histogram, lowest and highest scenario)
 * and a sortable table of the scenarios. It also formats the numbers the rest of the tab shows.
 */
NovaDM.CalculationsReport = (function (Model, History, Calculations, Render, Util) {
	'use strict';

	var PAGE_SIZE = 100;
	var PRINT_WIDTH = 1040;
	var PDF_NAME = 'novadm-report';
	var BY_NUMBER = '#';
	var TABLE_FILE_NAME = 'novadm-scenarios.csv';
	var PNG_SCALE = 2;
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
	var reportText = document.getElementById('calc-report-text');
	var reportClose = document.getElementById('calc-report-close-btn');
	var pdfBtn = document.getElementById('calc-pdf-btn');
	var printInfo = document.getElementById('calc-print-info');
	var reportHost = document.getElementById('calc-report');

	var sample = null;
	var results = [];
	var derived = [];
	var analysis = null;
	var optionBoxes = [];
	var onShowScenario = null;
	var onClose = null;
	var shownRow = null;
	var pageTitle = null;
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
		var stats = column.stats;
		return '<article class="calc-kpi-card">' + head +
			'<span class="note">mean of ' + formatCount(column.numbers.length) + ' scenarios</span>' +
			'<button class="btn" type="button" data-calc-png="' + escapeHtml(column.name) + '"' +
			' title="Save this card as a PNG image">PNG</button></div>' +
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

	function labelledAncestors(box) {
		return box.path.slice(0, -1).filter(function (n) { return n.label; });
	}

	function ancestorName(node) { return node.value.length === 1 ? node.value[0] : node.label; }

	function headingAt(box, depth) {
		var above = labelledAncestors(box);
		return above.slice(above.length - depth).map(ancestorName).concat(box.node.label).join(' / ');
	}

	function headingsAt(boxes, depths) {
		return boxes.map(function (b, i) { return headingAt(b, depths[i]); });
	}

	/**
	 * Heads each option column by its box's label; a label that repeats gets its labelled ancestors in front
	 * ("windows / material"), the nearest first, until the headings are unique, and then a count if need be.
	 */
	function optionHeadings(boxes) {
		var depths = boxes.map(function () { return 0; });
		var headings = headingsAt(boxes, depths);
		var grew = true;
		while (grew) {
			grew = false;
			for (var i = 0; i < boxes.length; i++) {
				var repeated = headings.indexOf(headings[i]) !== headings.lastIndexOf(headings[i]);
				if (repeated && depths[i] < labelledAncestors(boxes[i]).length) {
					depths[i]++;
					grew = true;
				}
			}
			headings = headingsAt(boxes, depths);
		}
		var seen = Object.create(null);
		return headings.map(function (h) {
			seen[h] = (seen[h] || 0) + 1;
			return seen[h] > 1 ? h + ' (' + seen[h] + ')' : h;
		});
	}

	function kpiHeading(name) { return nameWithUnit(name, derivedUnit(name)); }

	function optionText(entry) { return entry ? entry.value || 'chosen' : null; }

	function cellValue(value) {
		if (isNumber(value)) return value;
		return value === null || value === undefined || Calculations.isError(value) ? null : String(value);
	}

	function sortHeaderHtml(name) {
		var mark = sortBy.name === name ? (sortBy.dir === 1 ? ' &uarr;' : ' &darr;') : '';
		var title = name === BY_NUMBER ? 'Sort by number' : 'Sort by ' + name;
		var heading = name === BY_NUMBER ? name : kpiHeading(name);
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
			optionHeadings(optionBoxes).map(function (h) {
				return '<th class="calc-option-col">' + escapeHtml(h) + '</th>';
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
					var text = optionText(entries[b.node.id]);
					return '<td class="calc-option-col">' +
						(text === null ? '<span class="calc-na">&ndash;</span>' : escapeHtml(text)) + '</td>';
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

	function tableRows() {
		var columns = reportColumns().list;
		var rows = [[BY_NUMBER].concat(columns.map(function (c) { return kpiHeading(c.name); }),
			optionHeadings(optionBoxes))];
		sortedRows().forEach(function (i) {
			var entries = Calculations.entriesById(sample.scenarios[i]);
			rows.push([i + 1].concat(columns.map(function (c) {
				return cellValue(results[i][c.name]);
			}), optionBoxes.map(function (b) {
				return optionText(entries[b.node.id]);
			})));
		});
		return rows;
	}

	function exportTable() {
		if (NovaDM.TreeIO) NovaDM.TreeIO.download(Util.csvText(tableRows()), TABLE_FILE_NAME, Util.CSV_MIME_TYPE);
	}

	/* ---------- Report ---------- */

	function bannerHtml() {
		return '<strong class="calc-report-title">Explore the scenario space</strong>' +
			'<span>Sample the scenario space to see each KPI&rsquo;s mean, spread and distribution, its lowest and' +
			' highest scenario, and the scenarios themselves, which you can open in the graph.</span>';
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
		return '<strong class="calc-report-title">Report</strong>' +
			'<span>' + meta + '</span>';
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
			'<span class="note calc-hint">Click a number to show that scenario in the graph: every box switches to' +
				' its option. Click # or a KPI to sort.</span>' +
			'<span class="calc-scale-legend">lowest' +
			'<span class="calc-scale-bar" aria-hidden="true"></span>highest</span>' +
			'<button class="btn" type="button" data-calc-report="csv" title="Save every scenario of the table, in' +
				' its current order, as a CSV file.">Export table as CSV</button>' +
			'</div>' +
			scenarioTableHtml(columns.list) +
			'</section>';
	}

	function renderReport() {
		var hasBody = !!sample && sample.scenarios.length > 0;
		reportHead.classList.toggle('open', hasBody);
		reportHost.hidden = !hasBody;
		reportText.innerHTML = sample ? reportHeadHtml() : bannerHtml();
		reportClose.hidden = !sample;
		pdfBtn.hidden = !hasBody;
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
		var png = e.target.closest('[data-calc-png]');
		if (e.target.closest('[data-calc-report="csv"]')) exportTable();
		if (png) {
			savePng(png.closest('.calc-kpi-card'), 'novadm-' + png.getAttribute('data-calc-png') + '.png',
				'[data-calc-png]');
		}
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

	/* ---------- Images ---------- */

	function copyStyles(source, copy) {
		var computed = getComputedStyle(source);
		var text = '';
		for (var i = 0; i < computed.length; i++) {
			text += computed[i] + ':' + computed.getPropertyValue(computed[i]) + ';';
		}
		copy.setAttribute('style', text);
		for (var c = 0; c < source.children.length; c++) copyStyles(source.children[c], copy.children[c]);
	}

	function imageFailed() {
		alert('This browser could not make the image. Try Chrome, Edge or Firefox.');
	}

	function savePng(element, fileName, leaveOut) {
		var box = element.getBoundingClientRect();
		var width = Math.round(box.width);
		var height = Math.round(box.height);
		var copy = element.cloneNode(true);
		copyStyles(element, copy);
		copy.style.margin = '0';
		copy.style.boxSizing = 'border-box';
		copy.style.width = width + 'px';
		copy.style.height = height + 'px';
		if (leaveOut) {
			Array.prototype.forEach.call(copy.querySelectorAll(leaveOut), function (el) {
				el.parentNode.removeChild(el);
			});
		}
		var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
			'<foreignObject width="100%" height="100%">' + new XMLSerializer().serializeToString(copy) +
			'</foreignObject></svg>';
		var image = new Image();
		image.onerror = imageFailed;
		image.onload = function () {
			var canvas = document.createElement('canvas');
			canvas.width = width * PNG_SCALE;
			canvas.height = height * PNG_SCALE;
			var context = canvas.getContext('2d');
			context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-surface');
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.scale(PNG_SCALE, PNG_SCALE);
			context.drawImage(image, 0, 0);
			try {
				canvas.toBlob(function (blob) {
					if (blob && NovaDM.TreeIO) NovaDM.TreeIO.download(blob, fileName, 'image/png');
					else imageFailed();
				}, 'image/png');
			} catch (e) {
				imageFailed();
			}
		};
		image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
	}

	/* ---------- Print ---------- */

	function printInfoHtml() {
		var date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
		var source = Model.getSource();
		var name = Model.getDocumentName();
		return '<p>' + (name ? [escapeHtml(name)] : []).concat([
			'Version: ' + escapeHtml(History.getHead()) + (History.isDirty() ? ' &middot; unsaved' : ''),
			'Profile: ' + escapeHtml(Model.getActiveProfileName() || 'none') +
				(Model.profileChanged() ? ' (changed)' : ''),
			date
		]).join(' &middot; ') + '</p>' + (source ? '<p>' + escapeHtml(source) + '</p>' : '');
	}

	function leaveOutColumnsThatDontFit(table, kept) {
		var heads = table.querySelectorAll('thead th');
		var width = 0;
		var from = heads.length;
		for (var i = 0; i < heads.length && from === heads.length; i++) {
			width += heads[i].getBoundingClientRect().width;
			if (i >= kept && width > PRINT_WIDTH) from = i;
		}
		table.querySelectorAll('tr').forEach(function (row) {
			for (var k = from; k < row.children.length; k++) row.children[k].classList.add('calc-print-off');
		});
		return heads.length - from;
	}

	function printNoteHtml(leftOut) {
		var count = sortedRows().length;
		var parts = [];
		if (count > PAGE_SIZE) {
			parts.push('The table shows scenarios ' + formatCount(page * PAGE_SIZE + 1) + '&ndash;' +
				formatCount(Math.min(count, (page + 1) * PAGE_SIZE)) + ' of ' + formatCount(count) +
				', the page on screen.');
		}
		if (leftOut) {
			parts.push('The options of ' + formatCount(leftOut) + ' more ' + (leftOut === 1 ? 'box' : 'boxes') +
				' don&rsquo;t fit the page.');
		}
		if (!parts.length) return '';
		return '<p class="note calc-print-note">' + parts.join(' ') +
			' Export table as CSV has every scenario and column.</p>';
	}

	function prepareForPrint() {
		cleanUpAfterPrint();
		printInfo.innerHTML = printInfoHtml();
		var table = reportHost.querySelector('.calc-scenarios');
		if (table) {
			var leftOut = leaveOutColumnsThatDontFit(table, reportColumns().list.length + 1);
			table.parentNode.insertAdjacentHTML('afterend', printNoteHtml(leftOut));
		}
		document.documentElement.classList.add('calc-printing');
		pageTitle = document.title;
		document.title = PDF_NAME + (Model.getDocumentName() ? '-' + Model.getDocumentName() : '');
	}

	function cleanUpAfterPrint() {
		document.documentElement.classList.remove('calc-printing');
		if (pageTitle !== null) document.title = pageTitle;
		pageTitle = null;
		reportHost.querySelectorAll('.calc-print-off').forEach(function (cell) {
			cell.classList.remove('calc-print-off');
		});
		reportHost.querySelectorAll('.calc-print-note').forEach(function (note) {
			note.parentNode.removeChild(note);
		});
	}

	pdfBtn.addEventListener('click', function () {
		prepareForPrint();
		window.print();
	});

	window.addEventListener('afterprint', cleanUpAfterPrint);

	return {
		render: render,
		markShownRow: markShownRow,
		formatNumber: formatNumber,
		formatCount: formatCount,
		withUnit: withUnit,
		nameWithUnit: nameWithUnit,
		valueHtml: valueHtml
	};
})(NovaDM.Model, NovaDM.History, NovaDM.Calculations, NovaDM.Render, NovaDM.Util);
