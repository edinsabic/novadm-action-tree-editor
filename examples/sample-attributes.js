/**
 * Made-up attributes for the sample tree: the Calculations tab's example data.
 * `values[label][attribute]` is a number per option, or a plain number for a node without options;
 * `derived` holds the formulas, and a KPI's `displayName` is its name in the Action tree tab's bottom bar.
 * The shape is described in ../spec/action-tree-grammar.md.
 */
var NOVADM_SAMPLE_ATTRIBUTES = {
	values: {
		windows_glazing: {
			price: { keep_double: 0, replace_triple: 52000 },
			co2: { keep_double: 0, replace_triple: 3900 }
		},
		outer_doors_replacement: {
			price: { keep_current: 0, replace: 9000 },
			co2: { keep_current: 0, replace: 700 }
		},
		outer_doors_material: {
			price: { keep_current: 0, replace_to_wood: 2500 },
			co2: { keep_current: 0, replace_to_wood: 150 }
		},
		facade_surface: {
			price: { keep_current: 0, paint: 14000 },
			co2: { keep_current: 0, paint: 450 }
		},
		facade_insulation: {
			price: { keep_current: 0, add_insulation: 68000 },
			co2: { keep_current: 0, add_insulation: 5200 }
		},
		replace_brick_facade: {
			price: 210000,
			co2: 38000
		},
		roof_replacement: {
			price: { keep_current: 0, replace: 95000 },
			co2: { keep_current: 0, replace: 14000 }
		},
		roof_insulation: {
			price: { keep_current: 0, add_insulation: 36000 },
			co2: { keep_current: 0, add_insulation: 2700 }
		},
		ground_floor_replacement: {
			price: { keep_current: 0, replace: 60000 },
			co2: { keep_current: 0, replace: 9000 }
		},
		ground_floor_insulation: {
			price: { keep_current: 0, add_insulation: 22000 },
			co2: { keep_current: 0, add_insulation: 1600 }
		}
	},
	derived: [
		{
			name: 'facade_area',
			formula: '450'
		},
		{
			name: 'brick_replacement_cost',
			formula: 'if selected(brick_replacement) then brick_replacement * facade_area * 180 else 0'
		},
		{
			name: 'brick_replacement_co2',
			formula: 'if selected(brick_replacement) then brick_replacement * facade_area * 30 else 0'
		},
		{
			name: 'total_cost',
			displayName: 'Total cost',
			formula: 'total(price) + brick_replacement_cost',
			kpi: true
		},
		{
			name: 'total_co2',
			displayName: 'CO₂',
			formula: 'total(co2) + brick_replacement_co2',
			kpi: true
		}
	]
};
