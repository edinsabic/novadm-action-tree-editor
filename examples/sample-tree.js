/**
 * The default example, opened on start and by "Load example tree".
 * Mirrors the CED "windows / outer_doors / facade / roof / ground_floor" example, with made-up numbers, two
 * profiles ("Low budget", "Energy upgrade") and two versions (Initial version, without the windows, and
 * Add windows, the one on screen). A whole document in the .json
 * format, the same as sample-tree.json, as a script global so it loads over file://. To change it, edit
 * sample-tree.json in the editor, export it, and paste the file after "NOVADM_SAMPLE_DOCUMENT = ".
 */
var NOVADM_SAMPLE_DOCUMENT = {
	"format": "novadm-action-tree",
	"version": 6,
	"source": "",

	"versionControl": {
		"head": "Add windows",
		"edges": [
			{ "from": "Initial version", "to": "Add windows", "comment": "Windows and their glazing added" }
		]
	},

	"actionTree": [
		{
			"id": "Initial version",
			"created": "2026-10-20",
			"profile": {
				"active": null,
				"current": {},
				"currentValues": {},
				"saved": [
					{
						"name": "Low budget",
						"constraints": { "n11": "never" },
						"valueConstraints": {
							"n5": { "replace": "never" },
							"n15": { "replace": "never" },
							"n18": { "replace": "never" }
						}
					},
					{
						"name": "Energy upgrade",
						"constraints": { "n11": "always" },
						"valueConstraints": {
							"n5": { "replace": "always" },
							"n9": { "add_insulation": "always" },
							"n16": { "add_insulation": "always" },
							"n19": { "add_insulation": "always" }
						}
					}
				]
			},
			"tree": [
				{
					"id": "n1",
					"kind": "AND",
					"nodeClass": "",
					"label": "",
					"value": [],
					"children": [
						{
							"id": "n4",
							"kind": "AND",
							"nodeClass": "Subject",
							"label": "structural_element",
							"value": ["outer_doors"],
							"children": [
								{
									"id": "n5",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "outer_doors_replacement",
									"value": ["keep_current", "replace"],
									"children": []
								},
								{
									"id": "n6",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "outer_doors_material",
									"value": ["keep_current", "replace_to_wood"],
									"children": []
								}
							]
						},
						{
							"id": "n7",
							"kind": "AND",
							"nodeClass": "Subject",
							"label": "structural_element",
							"value": ["facade"],
							"children": [
								{
									"id": "n8",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "facade_surface",
									"value": ["keep_current", "paint"],
									"children": []
								},
								{
									"id": "n9",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "facade_insulation",
									"value": ["keep_current", "add_insulation"],
									"children": []
								},
								{
									"id": "n10",
									"kind": "XOR",
									"nodeClass": "",
									"label": "",
									"value": [],
									"children": [
										{
											"id": "n11",
											"kind": "AND",
											"nodeClass": "Approach",
											"label": "replace_brick_facade",
											"value": [],
											"children": []
										},
										{
											"id": "n12",
											"kind": "AND",
											"nodeClass": "Approach",
											"label": "keep_current_brick_facade",
											"value": [],
											"children": [
												{
													"id": "n13",
													"kind": "XOR",
													"nodeClass": "Feature",
													"label": "brick_replacement",
													"value": ["0%", "7.5%", "15%", "30%"],
													"children": []
												}
											]
										}
									]
								}
							]
						},
						{
							"id": "n14",
							"kind": "AND",
							"nodeClass": "Subject",
							"label": "structural_element",
							"value": ["roof"],
							"children": [
								{
									"id": "n15",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "roof_replacement",
									"value": ["keep_current", "replace"],
									"children": []
								},
								{
									"id": "n16",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "roof_insulation",
									"value": ["keep_current", "add_insulation"],
									"children": []
								}
							]
						},
						{
							"id": "n17",
							"kind": "AND",
							"nodeClass": "Subject",
							"label": "structural_element",
							"value": ["ground_floor"],
							"children": [
								{
									"id": "n18",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "ground_floor_replacement",
									"value": ["keep_current", "replace"],
									"children": []
								},
								{
									"id": "n19",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "ground_floor_insulation",
									"value": ["keep_current", "add_insulation"],
									"children": []
								}
							]
						}
					]
				}
			],
			"calculations": {
				"attributes": ["price", "co2", "r_value"],
				"units": { "price": "DKK", "co2": "kg CO₂e", "r_value": "m²K/W" },
				"values": {
					"outer_doors_replacement": {
						"price": { "keep_current": 0, "replace": 9000 },
						"co2": { "keep_current": 0, "replace": 700 }
					},
					"outer_doors_material": {
						"price": { "keep_current": 0, "replace_to_wood": 2500 },
						"co2": { "keep_current": 0, "replace_to_wood": 150 }
					},
					"facade_surface": {
						"price": { "keep_current": 0, "paint": 14000 },
						"co2": { "keep_current": 0, "paint": 450 }
					},
					"facade_insulation": {
						"price": { "keep_current": 0, "add_insulation": 68000 },
						"co2": { "keep_current": 0, "add_insulation": 5200 },
						"r_value": { "add_insulation": 3 }
					},
					"replace_brick_facade": { "price": 210000, "co2": 38000 },
					"roof_replacement": {
						"price": { "keep_current": 0, "replace": 95000 },
						"co2": { "keep_current": 0, "replace": 14000 }
					},
					"roof_insulation": {
						"price": { "keep_current": 0, "add_insulation": 36000 },
						"co2": { "keep_current": 0, "add_insulation": 2700 },
						"r_value": { "add_insulation": 5 }
					},
					"ground_floor_replacement": {
						"price": { "keep_current": 0, "replace": 60000 },
						"co2": { "keep_current": 0, "replace": 9000 }
					},
					"ground_floor_insulation": {
						"price": { "keep_current": 0, "add_insulation": 22000 },
						"co2": { "keep_current": 0, "add_insulation": 1600 },
						"r_value": { "add_insulation": 2.5 }
					}
				},
				"derived": [
					{ "name": "facade_area", "formula": "450", "unit": "m²" },
					{
						"name": "brick_replacement_cost",
						"formula": "if selected(brick_replacement) then brick_replacement * facade_area * 180 else 0",
						"unit": "DKK"
					},
					{
						"name": "brick_replacement_co2",
						"formula": "if selected(brick_replacement) then brick_replacement * facade_area * 30 else 0",
						"unit": "kg CO₂e"
					},
					{
						"name": "cost",
						"displayName": "Cost",
						"formula": "total(price) + brick_replacement_cost",
						"unit": "DKK",
						"kpi": true
					},
					{
						"name": "gwp",
						"displayName": "GWP",
						"formula": "total(co2) + brick_replacement_co2",
						"unit": "kg CO₂e",
						"kpi": true
					},
					{ "name": "rsi", "displayName": "Rsi", "formula": "0.13", "unit": "m²K/W" },
					{ "name": "rse", "displayName": "Rse", "formula": "0.04", "unit": "m²K/W" },
					{ "name": "rt", "displayName": "Rt", "formula": "rsi + total(r_value) + rse", "unit": "m²K/W" },
					{
						"name": "u_value",
						"displayName": "U-value",
						"formula": "if total(r_value) = 0 then 1 / 0 else 1 / rt",
						"unit": "W/m²K",
						"kpi": true
					}
				]
			}
		},

		{
			"id": "Add windows",
			"created": "2026-10-25",
			"profile": {
				"active": null,
				"current": {},
				"currentValues": {},
				"saved": [
					{
						"name": "Low budget",
						"constraints": { "n11": "never" },
						"valueConstraints": {
							"n5": { "replace": "never" },
							"n15": { "replace": "never" },
							"n18": { "replace": "never" }
						}
					},
					{
						"name": "Energy upgrade",
						"constraints": { "n11": "always" },
						"valueConstraints": {
							"n5": { "replace": "always" },
							"n9": { "add_insulation": "always" },
							"n16": { "add_insulation": "always" },
							"n19": { "add_insulation": "always" }
						}
					}
				]
			},
			"tree": [
				{
					"id": "n1",
					"kind": "AND",
					"nodeClass": "",
					"label": "",
					"value": [],
					"children": [
						{
							"id": "n2",
							"kind": "AND",
							"nodeClass": "Subject",
							"label": "structural_element",
							"value": ["windows"],
							"children": [
								{
									"id": "n3",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "windows_glazing",
									"value": ["keep_double", "replace_triple"],
									"children": []
								}
							]
						},
						{
							"id": "n4",
							"kind": "AND",
							"nodeClass": "Subject",
							"label": "structural_element",
							"value": ["outer_doors"],
							"children": [
								{
									"id": "n5",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "outer_doors_replacement",
									"value": ["keep_current", "replace"],
									"children": []
								},
								{
									"id": "n6",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "outer_doors_material",
									"value": ["keep_current", "replace_to_wood"],
									"children": []
								}
							]
						},
						{
							"id": "n7",
							"kind": "AND",
							"nodeClass": "Subject",
							"label": "structural_element",
							"value": ["facade"],
							"children": [
								{
									"id": "n8",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "facade_surface",
									"value": ["keep_current", "paint"],
									"children": []
								},
								{
									"id": "n9",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "facade_insulation",
									"value": ["keep_current", "add_insulation"],
									"children": []
								},
								{
									"id": "n10",
									"kind": "XOR",
									"nodeClass": "",
									"label": "",
									"value": [],
									"children": [
										{
											"id": "n11",
											"kind": "AND",
											"nodeClass": "Approach",
											"label": "replace_brick_facade",
											"value": [],
											"children": []
										},
										{
											"id": "n12",
											"kind": "AND",
											"nodeClass": "Approach",
											"label": "keep_current_brick_facade",
											"value": [],
											"children": [
												{
													"id": "n13",
													"kind": "XOR",
													"nodeClass": "Feature",
													"label": "brick_replacement",
													"value": ["0%", "7.5%", "15%", "30%"],
													"children": []
												}
											]
										}
									]
								}
							]
						},
						{
							"id": "n14",
							"kind": "AND",
							"nodeClass": "Subject",
							"label": "structural_element",
							"value": ["roof"],
							"children": [
								{
									"id": "n15",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "roof_replacement",
									"value": ["keep_current", "replace"],
									"children": []
								},
								{
									"id": "n16",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "roof_insulation",
									"value": ["keep_current", "add_insulation"],
									"children": []
								}
							]
						},
						{
							"id": "n17",
							"kind": "AND",
							"nodeClass": "Subject",
							"label": "structural_element",
							"value": ["ground_floor"],
							"children": [
								{
									"id": "n18",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "ground_floor_replacement",
									"value": ["keep_current", "replace"],
									"children": []
								},
								{
									"id": "n19",
									"kind": "XOR",
									"nodeClass": "Feature",
									"label": "ground_floor_insulation",
									"value": ["keep_current", "add_insulation"],
									"children": []
								}
							]
						}
					]
				}
			],
			"calculations": {
				"attributes": ["price", "co2", "r_value"],
				"units": { "price": "DKK", "co2": "kg CO₂e", "r_value": "m²K/W" },
				"values": {
					"windows_glazing": {
						"price": { "keep_double": 0, "replace_triple": 52000 },
						"co2": { "keep_double": 0, "replace_triple": 3900 },
						"r_value": { "keep_double": 0.35, "replace_triple": 0.7 }
					},
					"outer_doors_replacement": {
						"price": { "keep_current": 0, "replace": 9000 },
						"co2": { "keep_current": 0, "replace": 700 }
					},
					"outer_doors_material": {
						"price": { "keep_current": 0, "replace_to_wood": 2500 },
						"co2": { "keep_current": 0, "replace_to_wood": 150 }
					},
					"facade_surface": {
						"price": { "keep_current": 0, "paint": 14000 },
						"co2": { "keep_current": 0, "paint": 450 }
					},
					"facade_insulation": {
						"price": { "keep_current": 0, "add_insulation": 68000 },
						"co2": { "keep_current": 0, "add_insulation": 5200 },
						"r_value": { "add_insulation": 3 }
					},
					"replace_brick_facade": { "price": 210000, "co2": 38000 },
					"roof_replacement": {
						"price": { "keep_current": 0, "replace": 95000 },
						"co2": { "keep_current": 0, "replace": 14000 }
					},
					"roof_insulation": {
						"price": { "keep_current": 0, "add_insulation": 36000 },
						"co2": { "keep_current": 0, "add_insulation": 2700 },
						"r_value": { "add_insulation": 5 }
					},
					"ground_floor_replacement": {
						"price": { "keep_current": 0, "replace": 60000 },
						"co2": { "keep_current": 0, "replace": 9000 }
					},
					"ground_floor_insulation": {
						"price": { "keep_current": 0, "add_insulation": 22000 },
						"co2": { "keep_current": 0, "add_insulation": 1600 },
						"r_value": { "add_insulation": 2.5 }
					}
				},
				"derived": [
					{ "name": "facade_area", "formula": "450", "unit": "m²" },
					{
						"name": "brick_replacement_cost",
						"formula": "if selected(brick_replacement) then brick_replacement * facade_area * 180 else 0",
						"unit": "DKK"
					},
					{
						"name": "brick_replacement_co2",
						"formula": "if selected(brick_replacement) then brick_replacement * facade_area * 30 else 0",
						"unit": "kg CO₂e"
					},
					{
						"name": "cost",
						"displayName": "Cost",
						"formula": "total(price) + brick_replacement_cost",
						"unit": "DKK",
						"kpi": true
					},
					{
						"name": "gwp",
						"displayName": "GWP",
						"formula": "total(co2) + brick_replacement_co2",
						"unit": "kg CO₂e",
						"kpi": true
					},
					{ "name": "rsi", "displayName": "Rsi", "formula": "0.13", "unit": "m²K/W" },
					{ "name": "rse", "displayName": "Rse", "formula": "0.04", "unit": "m²K/W" },
					{ "name": "rt", "displayName": "Rt", "formula": "rsi + total(r_value) + rse", "unit": "m²K/W" },
					{
						"name": "u_value",
						"displayName": "U-value",
						"formula": "if total(r_value) = 0 then 1 / 0 else 1 / rt",
						"unit": "W/m²K",
						"kpi": true
					}
				]
			}
		}
	]
};
