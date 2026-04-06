// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — objectCard/calculatorGroups.ts
// Calculator group definitions for Object Card type selector
// ══════════════════════════════════════════════════════════════

export interface CalcSubType {
  type: string;
  label: string;
}

export interface CalcGroup {
  type: string;
  label: string;
  subTypes: CalcSubType[];
}

/** Steps are only added via the Stairs dropdown on layer 2, not via Object Card type selector */
export const STEPS_CALCULATOR_GROUP: CalcGroup = {
  type: "steps", label: "calc_group_steps", subTypes: [
    { type: "standard", label: "calc_subtype_standard_stairs" },
    { type: "l_shape", label: "calc_subtype_l_shape_stairs" },
    { type: "u_shape", label: "calc_subtype_u_shape_stairs" },
  ],
};

export const POLYGON_CALCULATOR_GROUPS: CalcGroup[] = [
  { type: "slab", label: "calc_group_slabs", subTypes: [{ type: "default", label: "calc_subtype_slab_calculator" }, { type: "concreteSlabs", label: "calc_subtype_concrete_slabs" }] },
  { type: "paving", label: "calc_group_paving", subTypes: [{ type: "default", label: "calc_subtype_monoblock_paving" }] },
  { type: "grass", label: "calc_group_artificial_grass", subTypes: [{ type: "default", label: "calc_subtype_artificial_grass" }] },
  {
    type: "deck",
    label: "calc_group_deck",
    subTypes: [
      { type: "default", label: "calc_subtype_decking_standard" },
      { type: "composite_deck", label: "calc_subtype_composite_decking" },
    ],
  },
  { type: "turf", label: "calc_group_natural_turf", subTypes: [{ type: "default", label: "calc_subtype_natural_turf" }] },
  { type: "decorativeStones", label: "calc_group_decorative_stones", subTypes: [{ type: "default", label: "calc_subtype_decorative_stones" }] },
];

export const FENCE_CALCULATOR_GROUPS: CalcGroup[] = [
  { type: "fence", label: "calc_group_fence", subTypes: [
    { type: "vertical", label: "calc_subtype_vertical_fence" },
    { type: "horizontal", label: "calc_subtype_horizontal_fence" },
    { type: "venetian", label: "calc_subtype_venetian_fence" },
    { type: "composite", label: "calc_subtype_composite_fence" },
  ]},
];

export const WALL_CALCULATOR_GROUPS: CalcGroup[] = [
  { type: "wall", label: "calc_group_wall", subTypes: [
    { type: "brick", label: "calc_subtype_brick_wall" },
    /** Cavity / double-skin: brick + 4"/6" blocks only; sleeper is a separate wall subtype, never a leaf here. */
    { type: "double_wall", label: "calc_subtype_double_wall" },
    { type: "block4", label: "calc_subtype_block4_wall" },
    { type: "block7", label: "calc_subtype_block7_wall" },
    { type: "sleeper", label: "calc_subtype_sleeper_wall" },
  ]},
];

export const KERB_CALCULATOR_GROUPS: CalcGroup[] = [
  { type: "kerbs", label: "calc_group_kerbs_edges", subTypes: [
    { type: "kl", label: "calc_subtype_kl_kerbs" },
    { type: "rumbled", label: "calc_subtype_rumbled_kerbs" },
    { type: "flat", label: "calc_subtype_flat_edges" },
    { type: "sets", label: "calc_subtype_sets" },
  ]},
];

export const FOUNDATION_CALCULATOR_GROUPS: CalcGroup[] = [
  { type: "foundation", label: "calc_group_foundation", subTypes: [{ type: "default", label: "calc_subtype_foundation" }] },
];

export const GROUNDWORK_CALCULATOR_GROUPS: CalcGroup[] = [
  { type: "groundwork", label: "calc_group_groundwork", subTypes: [
    { type: "drainage", label: "calc_subtype_drainage" },
    { type: "canalPipe", label: "calc_subtype_canal_pipe" },
    { type: "waterPipe", label: "calc_subtype_water_pipe" },
    { type: "cable", label: "calc_subtype_cable" },
  ]},
];

export function getGroupsForElement(elementType: string, existingCalculatorType?: string): CalcGroup[] {
  switch (elementType) {
    case "fence": return FENCE_CALCULATOR_GROUPS;
    case "wall": return WALL_CALCULATOR_GROUPS;
    case "kerb": return KERB_CALCULATOR_GROUPS;
    case "foundation": return FOUNDATION_CALCULATOR_GROUPS;
    case "drainage":
    case "canalPipe":
    case "waterPipe":
    case "cable":
      return GROUNDWORK_CALCULATOR_GROUPS;
    case "pathSlabs":
      return [{ type: "slab", label: "calc_group_slabs", subTypes: [{ type: "default", label: "calc_subtype_slab_calculator" }] }];
    case "pathConcreteSlabs":
      return [{ type: "concreteSlabs", label: "calc_group_concrete_slabs", subTypes: [{ type: "default", label: "calc_subtype_concrete_slabs" }] }];
    case "pathMonoblock":
      return [{ type: "paving", label: "calc_group_paving", subTypes: [{ type: "default", label: "calc_subtype_monoblock_paving" }] }];
    default: {
      // Steps only appear when shape already has calculatorType "steps" (added via Stairs dropdown)
      if (existingCalculatorType === "steps") {
        return [...POLYGON_CALCULATOR_GROUPS, STEPS_CALCULATOR_GROUP];
      }
      return POLYGON_CALCULATOR_GROUPS;
    }
  }
}
