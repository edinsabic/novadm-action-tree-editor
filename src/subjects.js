window.NovaDM = window.NovaDM || {};

/**
 * Predefined renovation subjects grouped by category
 */
NovaDM.Subjects = (function () {
	'use strict';

	var DEFAULT_LIST = 'energyAgency'; // 'energyAgency' or 'novadmPaper'

	var DEPTHS = [
		{ key: 'minor', name: 'Minor' },
		{ key: 'moderate', name: 'Moderate' },
		{ key: 'deep', name: 'Deep' },
		{ key: 'whole', name: 'Whole building' }
	];

	var LISTS = {
		energyAgency: {
			name: 'Danish Energy Agency (sparenergi.dk)',
			shortName: 'Danish Energy Agency',
			categories: [
				{ key: 'roof_and_attic', name: 'Roof and attic', subjects: [
					{ key: 'ceiling_to_ridge_insulation', name: 'Ceiling insulation up to ridge / sloping walls',
						depth: 'moderate' },
					{ key: 'attic_insulation', name: 'Attic insulation', depth: 'moderate' },
					{ key: 'knee_wall_insulation', name: 'Knee wall (eaves space) insulation', depth: 'moderate' },
					{ key: 'wall_plate_insulation', name: 'Wall plate insulation', depth: 'moderate' },
					{ key: 'flat_roof_insulation', name: 'Flat roof insulation', depth: 'moderate' },
					{ key: 'mansard_roof_insulation', name: 'Mansard roof insulation', depth: 'moderate' },
					{ key: 'ventilation_system', name: 'Install ventilation system', depth: 'deep' }
				] },
				{ key: 'windows_and_doors', name: 'Windows and doors', subjects: [
					{ key: 'energy_glazing', name: 'Double glazing to energy glazing', depth: 'minor' },
					{ key: 'replace_windows', name: 'Replace windows', depth: 'minor' },
					{ key: 'single_glazed_windows', name: 'Improve single-glazed windows', depth: 'minor' },
					{ key: 'skylights', name: 'New skylights', depth: 'minor' },
					{ key: 'rooflight_domes', name: 'New rooflight domes', depth: 'minor' },
					{ key: 'exterior_doors', name: 'New exterior doors', depth: 'minor' }
				] },
				{ key: 'floor_and_basement', name: 'Floor and basement', subjects: [
					{ key: 'plinth_insulation', name: 'Plinth insulation', depth: 'moderate' },
					{ key: 'ground_slab', name: 'New ground slab', depth: 'deep' },
					{ key: 'basement_floor_insulation', name: 'Basement floor insulation', depth: 'moderate' },
					{ key: 'floor_above_unheated_basement', name: 'Insulation of floor above unheated basement',
						depth: 'moderate' },
					{ key: 'close_crawl_space', name: 'Close off crawl space', depth: 'deep' },
					{ key: 'basement_wall_insulation', name: 'Basement wall insulation', depth: 'moderate' }
				] },
				{ key: 'pipes', name: 'Pipes', subjects: [
					{ key: 'pipe_insulation', name: 'Pipe insulation', depth: 'minor' }
				] },
				{ key: 'renewable_energy', name: 'Renewable energy', subjects: [
					{ key: 'solar_pv', name: 'Solar PV system', depth: 'deep' },
					{ key: 'solar_thermal', name: 'Solar thermal', depth: 'deep' }
				] },
				{ key: 'exterior_walls', name: 'Exterior walls', subjects: [
					{ key: 'lightweight_wall_insulation', name: 'Lightweight exterior wall insulation',
						depth: 'minor' },
					{ key: 'heavy_wall_insulation', name: 'Heavy exterior wall insulation', depth: 'minor' }
				] }
			]
		},
		novadmPaper: {
			name: 'NovaDM paper (Kamari et al. 2019, Tables 1 and 2)',
			shortName: 'NovaDM paper',
			categories: [
				{ key: 'architectural_elements', name: 'Architectural', subjects: [
					{ key: 'exterior_walls', name: 'Exterior walls', depth: 'minor' },
					{ key: 'interior_walls', name: 'Interior walls', depth: 'moderate' },
					{ key: 'curtain_walls', name: 'Curtain walls', depth: 'minor' },
					{ key: 'roof', name: 'Roof', depth: 'moderate' },
					{ key: 'ground_floor', name: 'Ground floors', depth: 'moderate' },
					{ key: 'upper_floor', name: 'Upper floors (non-ground floor)', depth: 'moderate' },
					{ key: 'basement_floor', name: 'Basement floors', depth: 'moderate' },
					{ key: 'ceilings', name: 'Ceilings', depth: 'moderate' },
					{ key: 'windows', name: 'Windows', depth: 'minor' },
					{ key: 'exterior_doors', name: 'Exterior doors', depth: 'minor' },
					{ key: 'interior_doors', name: 'Interior doors', depth: 'moderate' }
				] },
				{ key: 'mechanical_elements', name: 'Mechanical', subjects: [
					{ key: 'HVAC_systems_moderate', name: 'HVAC systems (moderate)', depth: 'moderate' },
					{ key: 'HVAC_systems_deep', name: 'HVAC systems (deep)', depth: 'deep' },
					{ key: 'HVAC_systems_NZEB', name: 'HVAC systems (NZEB)', depth: 'deep' },
					{ key: 'renewable_energy_sources_moderate', name: 'Renewable energy sources (moderate)',
						depth: 'moderate' },
					{ key: 'renewable_energy_sources_deep', name: 'Renewable energy sources (deep)', depth: 'deep' },
					{ key: 'renewable_energy_sources_NZEB', name: 'Renewable energy sources (NZEB)', depth: 'deep' },
					{ key: 'sewage', name: 'Sewage system', depth: 'deep' }
				] },
				{ key: 'individual_elements', name: 'Individual', subjects: [
					{ key: 'solar_shading', name: 'Solar shading', depth: 'minor' },
					{ key: 'balcony', name: 'Balcony', depth: 'minor' },
					{ key: 'elevator', name: 'Elevator', depth: 'whole' },
					{ key: 'staircase', name: 'Staircase', depth: 'whole' },
					{ key: 'ramp', name: 'Ramp', depth: 'whole' },
					{ key: 'railing', name: 'Railing', depth: 'whole' },
					{ key: 'chimney', name: 'Chimney', depth: 'whole' },
					{ key: 'fireplace', name: 'Fireplace', depth: 'whole' }
				] },
				{ key: 'structural_elements', name: 'Structural', subjects: [
					{ key: 'structural_components', name: 'Structural components', depth: 'deep' }
				] },
				{ key: 'electrical_elements', name: 'Electrical', subjects: [
					{ key: 'electrical_equipment', name: 'Electrical equipment', depth: 'whole' }
				] },
				{ key: 'interior_elements', name: 'Interior', subjects: [
					{ key: 'sanitary_appliances', name: 'Sanitary appliances', depth: 'whole' },
					{ key: 'fixed_furniture_essential', name: 'Fixed furniture (essential)', depth: 'whole' },
					{ key: 'movable_furniture_optional', name: 'Moveable furniture (optional)', depth: 'whole' }
				] },
				{ key: 'landscape_elements', name: 'Landscape', subjects: [
					{ key: 'landscape_equipment', name: 'Landscape equipment', depth: 'whole' }
				] }
			]
		}
	};

	var activeList = DEFAULT_LIST;

	function lists() {
		return Object.keys(LISTS).map(function (key) {
			return { key: key, name: LISTS[key].name, shortName: LISTS[key].shortName };
		});
	}

	function getActiveList() { return activeList; }

	function setActiveList(key) {
		if (LISTS[key]) activeList = key;
	}

	function categories() { return LISTS[activeList].categories; }

	function listName(key) { return LISTS[key || activeList].name; }

	function subjectId(category, subject) { return category.key + '/' + subject.key; }

	function depthIndex(key) {
		for (var i = 0; i < DEPTHS.length; i++) {
			if (DEPTHS[i].key === key) return i;
		}
		return DEPTHS.length - 1;
	}

	function isInDepth(subject, depthKey) {
		return depthIndex(subject.depth) <= depthIndex(depthKey);
	}

	function findInList(listKey, label, value) {
		var match = null;
		LISTS[listKey].categories.forEach(function (category) {
			if (category.key !== label) return;
			category.subjects.forEach(function (subject) {
				if (subject.key === value) match = { listKey: listKey, category: category, subject: subject };
			});
		});
		return match;
	}

	/**
	 * Returns the list, category and subject a node's label and value name, looking in the active list
	 * first and then in the others, or null if no list has them.
	 */
	function find(label, values) {
		if (!values || values.length !== 1) return null;
		var keys = [activeList].concat(Object.keys(LISTS).filter(function (k) { return k !== activeList; }));
		for (var i = 0; i < keys.length; i++) {
			var match = findInList(keys[i], label, values[0]);
			if (match) return match;
		}
		return null;
	}

	/** Returns the specs of a tree with an AND root node holding one Subject node per id in `ids`. */
	function treeSpecs(ids, rootId) {
		var children = [];
		categories().forEach(function (category) {
			category.subjects.forEach(function (subject) {
				if (ids.indexOf(subjectId(category, subject)) === -1) return;
				children.push({
					kind: 'AND',
					nodeClass: 'Subject',
					label: category.key,
					value: [subject.key],
					children: []
				});
			});
		});
		var root = { kind: 'AND', nodeClass: '', label: '', value: [], children: children };
		if (rootId) root.id = rootId;
		return [root];
	}

	return {
		DEPTHS: DEPTHS,
		lists: lists,
		getActiveList: getActiveList,
		setActiveList: setActiveList,
		categories: categories,
		listName: listName,
		subjectId: subjectId,
		isInDepth: isInDepth,
		find: find,
		treeSpecs: treeSpecs
	};
})();
