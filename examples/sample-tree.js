/*
 * NovaDM sample action tree.
 * Mirrors the CED "windows / outer_doors / facade / roof / ground_floor" example.
 * index.html loads this file and pre-populates the editor with it on open.
 *
 * Each entry: { kind: 'AND'|'XOR', nodeClass: 'Subject'|'Approach'|'Feature'|'', label, value, children }
 * - `kind` drives the AND(+)/XOR(−) logic and the badge symbol.
 * - `nodeClass` is the domain class and sets the badge colour (Subject, Feature and
 *   Approach each have their own; no class is black).
 * - `label` is the attribute name (e.g. "structural_element"), `value` the value/options
 *   string (e.g. "keep_current; replace").
 * Ids and `expanded` are assigned automatically when this is loaded — don't set them here.
 */
var NOVADM_SAMPLE_TREE = [
	{ kind: 'AND', children: [
		{
			kind: 'AND', nodeClass: 'Subject', label: 'structural_element', value: 'windows',
			children: [
				{ kind: 'XOR', nodeClass: 'Feature', label: 'windows_glazing', value: 'keep_double; replace_triple', children: [] }
			]
		},
		{
			kind: 'AND', nodeClass: 'Subject', label: 'structural_element', value: 'outer_doors',
			children: [
				{ kind: 'XOR', nodeClass: 'Feature', label: 'outer_doors_replacement', value: 'keep_current; replace', children: [] },
				{ kind: 'XOR', nodeClass: 'Feature', label: 'outer_doors_material', value: 'keep_current; replace_to_wood', children: [] }
			]
		},
		{
			kind: 'AND', nodeClass: 'Subject', label: 'structural_element', value: 'facade',
			children: [
				{ kind: 'XOR', nodeClass: 'Feature', label: 'facade_surface', value: 'keep_current; paint', children: [] },
				{ kind: 'XOR', nodeClass: 'Feature', label: 'facade_insulation', value: 'keep_current; add_insulation', children: [] },
				{
					kind: 'XOR', nodeClass: '', label: '', value: '',
					children: [
						{
							kind: 'AND', nodeClass: 'Approach', label: 'replace_brick_facade', value: '',
							children: []
						},
						{
							kind: 'AND', nodeClass: 'Approach', label: 'keep_current_brick_facade', value: '',
							children: [
								{ kind: 'XOR', nodeClass: 'Feature', label: 'brick_replacement', value: '0%; 7.5%; 15%; 30%', children: [] }
							]
						}
					]
				}
			]
		},
		{
			kind: 'AND', nodeClass: 'Subject', label: 'structural_element', value: 'roof',
			children: [
				{ kind: 'XOR', nodeClass: 'Feature', label: 'roof_replacement', value: 'keep_current; replace', children: [] },
				{ kind: 'XOR', nodeClass: 'Feature', label: 'roof_insulation', value: 'keep_current; add_insulation', children: [] }
			]
		},
		{
			kind: 'AND', nodeClass: 'Subject', label: 'structural_element', value: 'ground_floor',
			children: [
				{ kind: 'XOR', nodeClass: 'Feature', label: 'ground_floor_replacement', value: 'keep_current; replace', children: [] },
				{ kind: 'XOR', nodeClass: 'Feature', label: 'ground_floor_insulation', value: 'keep_current; add_insulation', children: [] }
			]
		}
	]}
];
