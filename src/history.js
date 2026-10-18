window.NovaDM = window.NovaDM || {};

/**
 * Version history: the snapshots of the tree and its profiles, and how they
 * follow on from each other. popovers.js draws it, version-graph.js lays the
 * graph out.
 */
NovaDM.History = (function (Model, Parser, Util) {
	'use strict';

	var DEFAULT_ID = Parser.DEFAULT_SNAPSHOT_ID;
	var MAX_CHANGES_SHOWN = 6;

	var head = DEFAULT_ID;
	var edges = [];
	var snapshots = [];

	var clone = Util.clone;

	/* ---------- Small helpers ---------- */

	function pad2(n) { return (n < 10 ? '0' : '') + n; }

	function today() {
		var d = new Date();
		return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
	}

	function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

	function indexOfVersion(id) {
		for (var i = 0; i < snapshots.length; i++) {
			if (snapshots[i].id === id) return i;
		}
		return -1;
	}

	function find(id) {
		var i = indexOfVersion(id);
		return i === -1 ? null : snapshots[i];
	}

	function allTrees() {
		return snapshots.map(function (s) { return s.tree; });
	}

	function uniqueName(base) {
		var name = base;
		for (var n = 2; find(name); n++) name = base + ' ' + n;
		return name;
	}

	function canon(list) {
		return JSON.stringify((list || []).map(function walk(s) {
			return [
				s.id || '', s.kind, s.nodeClass || '', s.label || '', Model.parseValues(s.value),
				(s.children || []).map(walk)
			];
		}));
	}

	function sortedJson(value) {
		return JSON.stringify(value, function (key, v) {
			if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
			var sorted = {};
			Object.keys(v).sort().forEach(function (k) { Util.setOwn(sorted, k, v[k]); });
			return sorted;
		});
	}

	function countsText(c) {
		return ['added', 'changed', 'removed'].filter(function (k) { return c[k] > 0; }).map(function (k) {
			return c[k] + ' ' + k;
		}).join(' · ');
	}

	/* ---------- State in / out ---------- */

	function newSnapshot(id, tree, profile) {
		return { id: id, created: today(), tree: clone(tree), profile: Model.prunedProfileState(profile, [tree]) };
	}

	function reset() {
		head = DEFAULT_ID;
		edges = [];
		snapshots = [newSnapshot(DEFAULT_ID, Model.treeSpecs(), Model.getProfileState())];
	}

	function load(fileHistory) {
		fileHistory = fileHistory || {};
		head = fileHistory.head || DEFAULT_ID;
		edges = clone(fileHistory.edges || []);
		snapshots = clone(fileHistory.snapshots || []);
		snapshots.forEach(function (s) { s.profile = Model.prunedProfileState(s.profile || {}, [s.tree]); });
		if (!find(head)) snapshots.unshift(newSnapshot(head, Model.treeSpecs(), Model.getProfileState()));
		Model.reserveIds(allTrees());
	}

	function getState() { return { head: head, edges: edges, snapshots: snapshots }; }

	function getHead() { return head; }

	function has(id) { return !!find(id); }

	function snapshotCount() { return snapshots.length; }

	function isDirty() {
		var h = find(head);
		return !h || canon(Model.treeSpecs()) !== canon(h.tree);
	}

	function storeProfiles() {
		var h = find(head);
		if (h) h.profile = Model.getProfileState([h.tree]);
	}

	/* ---------- Reading the graph ---------- */

	function parentsOf(id) {
		var out = [];
		edges.forEach(function (e) {
			if (e.to === id && find(e.from) && out.indexOf(e.from) === -1) out.push(e.from);
		});
		return out;
	}

	function childrenOf(id) {
		var out = [];
		edges.forEach(function (e) {
			if (e.from === id && find(e.to) && out.indexOf(e.to) === -1) out.push(e.to);
		});
		return out;
	}

	function isBranch(id) {
		var p = parentsOf(id)[0];
		if (p === undefined) return false;
		var siblings = snapshots.filter(function (s) { return parentsOf(s.id)[0] === p; });
		return siblings.length > 1 && siblings[0].id !== id;
	}

	function graphNodes() {
		var dirty = isDirty();
		return snapshots.map(function (s) {
			return {
				id: s.id,
				parents: parentsOf(s.id),
				isHead: s.id === head,
				isBranch: isBranch(s.id),
				isDirty: s.id === head && dirty
			};
		});
	}

	function nodeText(s) {
		var text = s.nodeClass || s.kind;
		if (s.label) {
			text += ': ' + s.label;
			var values = Model.parseValues(s.value);
			if (values.length) text += ' = ' + Model.formatValues(values);
		}
		return text;
	}

	function nodeSig(s) {
		return [s.kind, s.nodeClass || '', s.label || '', JSON.stringify(Model.parseValues(s.value))].join('|');
	}

	function flatten(list, parentId, out) {
		(list || []).forEach(function (s) {
			if (s.id) out[s.id] = { parent: parentId, text: nodeText(s), sig: nodeSig(s) };
			flatten(s.children, s.id || null, out);
		});
		return out;
	}

	function changesOf(id) {
		var snap = find(id);
		var parent = find(parentsOf(id)[0]);
		if (!snap || !parent) return [];
		var before = flatten(parent.tree, null, {});
		var after = flatten(snap.tree, null, {});
		var added = [];
		var removed = [];
		var changed = [];
		Object.keys(after).forEach(function (k) {
			if (!before[k]) {
				added.push({ type: 'add', text: after[k].text });
			} else if (before[k].sig !== after[k].sig) {
				changed.push({ type: 'modify', text: before[k].text + ' → ' + after[k].text });
			} else if (before[k].parent !== after[k].parent) {
				changed.push({ type: 'modify', text: after[k].text + ' (moved)' });
			}
		});
		Object.keys(before).forEach(function (k) {
			if (!after[k]) removed.push({ type: 'remove', text: before[k].text });
		});
		var all = added.concat(removed, changed);
		var shown = all.slice(0, MAX_CHANGES_SHOWN);
		shown.hiddenCount = all.length - shown.length;
		shown.counts = { added: added.length, changed: changed.length, removed: removed.length };
		return shown;
	}

	function savedByName(profile) {
		var byName = Object.create(null);
		((profile && profile.saved) || []).forEach(function (p) { byName[p.name] = p; });
		return byName;
	}

	function profileSig(p) {
		return p ? sortedJson([p.constraints || {}, p.valueConstraints || {}]) : undefined;
	}

	function profileChanges(before, after) {
		var b = savedByName(before);
		var a = savedByName(after);
		var counts = { added: 0, changed: 0, removed: 0 };
		Object.keys(a).forEach(function (name) {
			if (!b[name]) counts.added++;
			else if (profileSig(b[name]) !== profileSig(a[name])) counts.changed++;
		});
		Object.keys(b).forEach(function (name) {
			if (!a[name]) counts.removed++;
		});
		return counts;
	}

	function describe(id) {
		var snap = find(id);
		if (!snap) return null;
		var commented = edges.filter(function (e) { return e.to === id && e.comment; })[0];
		var changes = changesOf(id);
		var parents = parentsOf(id);
		var parent = find(parents[0]);
		return {
			id: id,
			created: snap.created || '',
			parents: parents,
			children: childrenOf(id),
			isHead: id === head,
			isBranch: isBranch(id),
			isMerge: parents.length > 1,
			isDirty: id === head && isDirty(),
			description: commented ? commented.comment : '',
			changes: changes,
			changeCounts: changes.counts || { added: 0, changed: 0, removed: 0 },
			profileChanges: parent
				? countsText(profileChanges(Model.prunedProfileState(parent.profile, [snap.tree]), snap.profile))
				: ''
		};
	}

	/* ---------- Changing the history ---------- */

	function addVersion(name, tree, profile, parentIds, comment) {
		snapshots.push(newSnapshot(name, tree, profile));
		parentIds.forEach(function (p) {
			edges.push(comment ? { from: p, to: name, comment: comment } : { from: p, to: name });
		});
		head = name;
	}

	function saveAsNew(name, comment) {
		name = String(name || '').trim();
		if (!name) return 'Please enter a name for the version.';
		if (find(name)) return 'A version called "' + name + '" already exists.';
		addVersion(name, Model.treeSpecs(), Model.getProfileState(), [head], String(comment || '').trim());
		return null;
	}

	function canUpdateHead() {
		var h = find(head);
		return childrenOf(head).length === 0 || (!!h && canon(Model.treeSpecs()) === canon(h.tree));
	}

	function updateHead() {
		var h = find(head);
		if (!h || !canUpdateHead()) return;
		h.tree = Model.treeSpecs();
		h.profile = Model.getProfileState([h.tree]);
	}

	function loadSnapshot(snap) {
		Model.replaceTree(clone(snap.tree), allTrees());
		Model.applyProfileState(snap.profile);
	}

	function checkout(id) {
		var snap = find(id);
		if (!snap) return false;
		loadSnapshot(snap);
		head = id;
		return true;
	}

	function restore(id) {
		var snap = find(id);
		if (!snap) return null;
		var name = uniqueName('Restore ' + id);
		addVersion(name, snap.tree, snap.profile, [head], 'Restored from "' + id + '"');
		loadSnapshot(find(name));
		return name;
	}

	function deleteProblem(id) {
		if (!find(id)) return 'That version no longer exists.';
		if (id === head) return 'This version is open in the editor. Open another version first.';
		if (parentsOf(id).length === 0 && childrenOf(id).length > 1) {
			return 'This is the first version and several versions are based on it, so they would lose' +
				' their common start.';
		}
		return null;
	}

	function isImpliedParent(parentId, child) {
		return parentsOf(child).some(function (other) {
			return other !== parentId && ancestorDistances(other)[parentId] !== undefined;
		});
	}

	function deleteVersion(id) {
		var problem = deleteProblem(id);
		if (problem) return problem;
		var parents = parentsOf(id);
		var children = childrenOf(id);
		var relinked = [];
		edges.forEach(function (e) {
			if (e.to === id) return;
			if (e.from !== id) {
				relinked.push(e);
				return;
			}
			parents.forEach(function (p) {
				relinked.push(e.comment ? { from: p, to: e.to, comment: e.comment } : { from: p, to: e.to });
			});
		});
		var seen = {};
		edges = relinked.filter(function (e) {
			var key = JSON.stringify([e.from, e.to]);
			if (seen[key]) return false;
			seen[key] = true;
			return true;
		});
		snapshots.splice(indexOfVersion(id), 1);
		edges = edges.filter(function (e) {
			return children.indexOf(e.to) === -1 || !isImpliedParent(e.from, e.to);
		});
		return null;
	}

	/* ---------- Merging ---------- */

	function ancestorDistances(id) {
		var dist = {};
		var queue = [id];
		dist[id] = 0;
		while (queue.length) {
			var cur = queue.shift();
			parentsOf(cur).forEach(function (p) {
				if (dist[p] !== undefined) return;
				dist[p] = dist[cur] + 1;
				queue.push(p);
			});
		}
		return dist;
	}

	function commonAncestor(a, b) {
		var da = ancestorDistances(a);
		var db = ancestorDistances(b);
		var common = Object.keys(da).filter(function (k) { return db[k] !== undefined; });
		var lowest = common.filter(function (c) {
			return !common.some(function (d) { return d !== c && ancestorDistances(d)[c] !== undefined; });
		});
		var best = null;
		lowest.forEach(function (c) {
			var score = da[c] + db[c];
			var isCloser = best === null || score < best.score ||
				(score === best.score && indexOfVersion(c) < indexOfVersion(best.id));
			if (isCloser) best = { id: c, score: score };
		});
		return best ? best.id : null;
	}

	function nodeTable(list) {
		var table = { byId: {}, order: [] };
		(function walk(items, parentId) {
			(items || []).forEach(function (s) {
				table.byId[s.id] = { parent: parentId, sig: nodeSig(s), text: nodeText(s), spec: s };
				table.order.push(s.id);
				walk(s.children, s.id);
			});
		})(list, null);
		return table;
	}

	function pick(b, m, t) {
		if (t === b) return 'keep';
		if (m === b) return 'theirs';
		return m === t ? 'keep' : 'conflict';
	}

	function conflictReason(b, m, t) {
		if (b === undefined) return 'added differently on both sides';
		if (t === undefined) return 'deleted on their side, changed on yours';
		if (m === undefined) return 'changed on their side, deleted on yours';
		return 'changed differently on both sides';
	}

	function mergeProfiles(base, mine, theirs, conflict) {
		var B = savedByName(base);
		var M = savedByName(mine);
		var T = savedByName(theirs);
		var counts = { added: 0, changed: 0, removed: 0 };
		var saved = [];
		var names = mine.saved.map(function (p) { return p.name; }).concat(theirs.saved.filter(function (p) {
			return !M[p.name];
		}).map(function (p) { return p.name; }));
		names.forEach(function (name) {
			var b = profileSig(B[name]), m = profileSig(M[name]), t = profileSig(T[name]);
			var choice = pick(b, m, t);
			if (choice === 'conflict') conflict('profile:' + name, 'profile "' + name + '"', conflictReason(b, m, t));
			if (choice !== 'theirs') {
				if (M[name]) saved.push(M[name]);
			} else if (T[name]) {
				counts[M[name] ? 'changed' : 'added']++;
				saved.push(T[name]);
			} else {
				counts.removed++;
			}
		});
		return { saved: saved, counts: counts, total: counts.added + counts.changed + counts.removed };
	}

	/**
	 * Three-way merge of version `sourceId` ("theirs") into the tree on screen ("mine"), against
	 * their nearest common ancestor ("base"): decides per node (by id) and per profile (by name),
	 * applies the result to a copy of the live tree and checks it with the import rules.
	 */
	function computeMerge(sourceId) {
		var source = find(sourceId);
		if (!source) return { error: 'That version no longer exists.' };
		var baseId = commonAncestor(head, sourceId);
		var baseSnap = baseId === null ? null : find(baseId);

		var live = Model.treeSpecs();
		var mineProfile = Model.getProfileState([live]);
		var B = nodeTable(baseSnap ? baseSnap.tree : []);
		var M = nodeTable(live);
		var T = nodeTable(source.tree);
		var conflicts = [];
		var conflicted = {};

		function conflict(id, text, reason) {
			if (conflicted[id]) return;
			conflicted[id] = true;
			conflicts.push({ id: id, text: text, reason: reason });
		}

		var adds = [];
		var updates = [];
		var removes = {};
		var ids = T.order.concat(B.order.filter(function (id) { return !T.byId[id]; }));
		ids.forEach(function (id) {
			var b = B.byId[id], m = M.byId[id], t = T.byId[id];
			var text = (t || m || b).text;
			if (!b) {
				if (!t) return;
				if (!m) adds.push(id);
				else if (m.sig !== t.sig || m.parent !== t.parent) {
					conflict(id, text, 'added differently on both sides');
				}
				return;
			}
			if (t && t.sig === b.sig && t.parent === b.parent) return;
			var mineSame = m && m.sig === b.sig && m.parent === b.parent;
			if (!t) {
				if (!m) return;
				if (mineSame) removes[id] = true;
				else conflict(id, text, 'deleted on their side, changed on yours');
				return;
			}
			if (!m) {
				conflict(id, text, 'changed on their side, deleted on yours');
				return;
			}
			var content = pick(b.sig, m.sig, t.sig);
			var place = pick(b.parent, m.parent, t.parent);
			if (content === 'conflict' || place === 'conflict') {
				conflict(id, text, 'changed differently on both sides');
				return;
			}
			if (content === 'theirs' || place === 'theirs') {
				updates.push({ id: id, content: content === 'theirs', place: place === 'theirs' });
			}
		});

		var loc = {};
		(function index(list, parentId) {
			list.forEach(function (s) {
				s.children = s.children || [];
				loc[s.id] = { spec: s, list: list, parent: parentId };
				index(s.children, s.id);
			});
		})(live, null);

		function listOf(parentId) { return parentId === null ? live : loc[parentId].spec.children; }

		function isInside(id, ancestorId) {
			for (var cur = id; cur !== null && loc[cur]; cur = loc[cur].parent) {
				if (cur === ancestorId) return true;
			}
			return false;
		}

		var added = 0;
		var skippedAdd = {};
		adds.forEach(function (id) {
			var t = T.byId[id];
			if (t.parent !== null && skippedAdd[t.parent]) {
				skippedAdd[id] = true;
				return;
			}
			if (t.parent !== null && !loc[t.parent]) {
				skippedAdd[id] = true;
				conflict(id, t.text, 'its parent is not in your version');
				return;
			}
			var copy = clone(t.spec);
			copy.children = [];
			listOf(t.parent).push(copy);
			loc[id] = { spec: copy, list: listOf(t.parent), parent: t.parent };
			added++;
		});

		function moveProblem(parentId, id) {
			if (parentId === null) return null;
			if (!loc[parentId]) return 'moved on their side to a place that is not in your version';
			if (isInside(parentId, id)) return 'moved on their side to somewhere that would put it inside itself';
			return null;
		}

		var updated = 0;
		updates.forEach(function (u) {
			var t = T.byId[u.id];
			var here = loc[u.id];
			var problem = u.place ? moveProblem(t.parent, u.id) : null;
			if (problem) conflict(u.id, t.text, problem);
			if (u.place && !problem) {
				here.list.splice(here.list.indexOf(here.spec), 1);
				here.list = listOf(t.parent);
				here.list.push(here.spec);
				here.parent = t.parent;
			}
			if (u.content) {
				here.spec.kind = t.spec.kind;
				here.spec.nodeClass = t.spec.nodeClass || '';
				here.spec.label = t.spec.label || '';
				here.spec.value = Model.parseValues(t.spec.value);
			}
			if (u.content || !problem) updated++;
		});

		function descendantsOf(spec, out) {
			spec.children.forEach(function (c) {
				out.push(c.id);
				descendantsOf(c, out);
			});
			return out;
		}

		var settled = false;
		while (!settled) {
			settled = true;
			Object.keys(removes).forEach(function (id) {
				if (!removes[id]) return;
				var keeps = descendantsOf(loc[id].spec, []).some(function (d) { return !removes[d]; });
				if (keeps) {
					removes[id] = false;
					settled = false;
					conflict(id, M.byId[id].text, 'deleted on their side, but you have changes below it');
				}
			});
		}
		var removed = 0;
		Object.keys(removes).forEach(function (id) {
			if (!removes[id]) return;
			removed++;
			var here = loc[id];
			if (here.parent === null || !removes[here.parent]) here.list.splice(here.list.indexOf(here.spec), 1);
		});

		var profiles = mergeProfiles(Model.prunedProfileState(baseSnap ? baseSnap.profile : {}, [live]),
			Model.prunedProfileState(mineProfile, [live]), Model.prunedProfileState(source.profile, [live]), conflict);
		var count = added + updated + removed + profiles.total;
		return {
			baseId: baseId,
			tree: live,
			profile: Model.prunedProfileState({
				active: mineProfile.active,
				current: mineProfile.current,
				currentValues: mineProfile.currentValues,
				saved: profiles.saved
			}, [live]),
			added: added,
			updated: updated,
			removed: removed,
			profileCounts: profiles.counts,
			count: count,
			conflicts: conflicts,
			empty: count === 0,
			rejected: count === 0 ? null : Parser.validateSpecs(live)
		};
	}

	function mergeSummary(r) {
		var parts = ['Added ' + r.added, 'Updated ' + r.updated, 'Removed ' + r.removed];
		var profiles = countsText(r.profileCounts);
		if (profiles) parts.push('Profiles: ' + profiles);
		if (r.conflicts.length) parts.push(plural(r.conflicts.length, 'conflict') + ', kept yours');
		return parts.join(' · ');
	}

	function mergeProblem(id, r) {
		if (isDirty()) return 'Save or undo the unsaved changes to "' + head + '" before merging.';
		if (r.rejected) return 'Merge rejected: ' + r.rejected;
		if (!r.empty) return '';
		var kept = r.conflicts.length
			? ' (' + plural(r.conflicts.length, 'conflict') + ' would be kept as yours).'
			: '.';
		return 'Nothing to merge: nothing in "' + id + '" differs from "' + head +
			'" in a way that can be applied' + kept;
	}

	function mergePreview(id) {
		var r = computeMerge(id);
		if (r.error) return { canMerge: false, problem: r.error };
		var problem = mergeProblem(id, r);
		return {
			count: r.count,
			conflicts: r.conflicts,
			summary: mergeSummary(r),
			canMerge: !problem,
			problem: problem
		};
	}

	function merge(id) {
		var r = computeMerge(id);
		if (r.error) return { error: r.error };
		var problem = mergeProblem(id, r);
		if (problem) return { error: problem };
		var summary = mergeSummary(r);
		var name = uniqueName('Merge ' + id);
		addVersion(name, r.tree, r.profile, [head, id], 'Merged "' + id + '" into "' + head + '" (' + summary + ')');
		loadSnapshot(find(name));
		return { name: name, conflicts: r.conflicts, summary: summary };
	}

	reset();

	return {
		reset: reset,
		load: load,
		getState: getState,
		getHead: getHead,
		has: has,
		snapshotCount: snapshotCount,
		isDirty: isDirty,
		storeProfiles: storeProfiles,
		graphNodes: graphNodes,
		describe: describe,
		saveAsNew: saveAsNew,
		canUpdateHead: canUpdateHead,
		updateHead: updateHead,
		checkout: checkout,
		restore: restore,
		deleteProblem: deleteProblem,
		deleteVersion: deleteVersion,
		mergePreview: mergePreview,
		merge: merge
	};
})(NovaDM.Model, NovaDM.Parser, NovaDM.Util);
