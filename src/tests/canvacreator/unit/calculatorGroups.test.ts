import { describe, it, expect } from "vitest";
import {
  getGroupsForElement,
  POLYGON_CALCULATOR_GROUPS,
  STEPS_CALCULATOR_GROUP,
  FENCE_CALCULATOR_GROUPS,
  WALL_CALCULATOR_GROUPS,
  KERB_CALCULATOR_GROUPS,
  FOUNDATION_CALCULATOR_GROUPS,
} from "../../../projectmanagement/canvacreator/objectCard/calculatorGroups";

// ══════════════════════════════════════════════════════════════
// getGroupsForElement
// ══════════════════════════════════════════════════════════════
describe("getGroupsForElement", () => {
  it("returns POLYGON_CALCULATOR_GROUPS for 'polygon'", () => {
    expect(getGroupsForElement("polygon")).toBe(POLYGON_CALCULATOR_GROUPS);
  });

  it("returns FENCE_CALCULATOR_GROUPS for 'fence'", () => {
    expect(getGroupsForElement("fence")).toBe(FENCE_CALCULATOR_GROUPS);
  });

  it("returns WALL_CALCULATOR_GROUPS for 'wall'", () => {
    expect(getGroupsForElement("wall")).toBe(WALL_CALCULATOR_GROUPS);
  });

  it("returns KERB_CALCULATOR_GROUPS for 'kerb'", () => {
    expect(getGroupsForElement("kerb")).toBe(KERB_CALCULATOR_GROUPS);
  });

  it("returns FOUNDATION_CALCULATOR_GROUPS for 'foundation'", () => {
    expect(getGroupsForElement("foundation")).toBe(FOUNDATION_CALCULATOR_GROUPS);
  });

  it("returns polygon groups for unknown element type", () => {
    expect(getGroupsForElement("something_else")).toBe(POLYGON_CALCULATOR_GROUPS);
  });

  it("returns polygon + steps when existingCalculatorType is steps", () => {
    const groups = getGroupsForElement("polygon", "steps");
    expect(groups).toHaveLength(POLYGON_CALCULATOR_GROUPS.length + 1);
    expect(groups[groups.length - 1].type).toBe("steps");
  });

  it("returns concreteSlabs group for pathConcreteSlabs", () => {
    const groups = getGroupsForElement("pathConcreteSlabs");
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("concreteSlabs");
    expect(groups[0].subTypes[0].type).toBe("default");
  });
});

// ══════════════════════════════════════════════════════════════
// POLYGON_CALCULATOR_GROUPS
// ══════════════════════════════════════════════════════════════
describe("POLYGON_CALCULATOR_GROUPS", () => {
  it("contains all 5 polygon calculator types", () => {
    const types = POLYGON_CALCULATOR_GROUPS.map(g => g.type);
    expect(types).toContain("slab");
    expect(types).toContain("paving");
    expect(types).toContain("grass");
    expect(types).toContain("deck");
    expect(types).toContain("turf");
  });

  it("slab has 2 sub-types (default, concreteSlabs)", () => {
    const slab = POLYGON_CALCULATOR_GROUPS.find(g => g.type === "slab");
    expect(slab).toBeDefined();
    expect(slab!.subTypes).toHaveLength(2);
    expect(slab!.subTypes.map(s => s.type)).toEqual(["default", "concreteSlabs"]);
  });

  it("turf has only 1 sub-type", () => {
    const turf = POLYGON_CALCULATOR_GROUPS.find(g => g.type === "turf");
    expect(turf).toBeDefined();
    expect(turf!.subTypes).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════
// STEPS_CALCULATOR_GROUP (separate from polygon groups)
// ══════════════════════════════════════════════════════════════
describe("STEPS_CALCULATOR_GROUP", () => {
  it("steps has 3 sub-types", () => {
    expect(STEPS_CALCULATOR_GROUP.type).toBe("steps");
    expect(STEPS_CALCULATOR_GROUP.subTypes).toHaveLength(3);
    expect(STEPS_CALCULATOR_GROUP.subTypes.map(s => s.type)).toEqual(["standard", "l_shape", "u_shape"]);
  });
});

// ══════════════════════════════════════════════════════════════
// FENCE_CALCULATOR_GROUPS
// ══════════════════════════════════════════════════════════════
describe("FENCE_CALCULATOR_GROUPS", () => {
  it("has 4 fence sub-types", () => {
    const fence = FENCE_CALCULATOR_GROUPS[0];
    expect(fence.type).toBe("fence");
    expect(fence.subTypes).toHaveLength(4);
    expect(fence.subTypes.map(s => s.type)).toEqual([
      "vertical", "horizontal", "venetian", "composite",
    ]);
  });
});

// ══════════════════════════════════════════════════════════════
// WALL_CALCULATOR_GROUPS
// ══════════════════════════════════════════════════════════════
describe("WALL_CALCULATOR_GROUPS", () => {
  it("has 4 wall sub-types", () => {
    const wall = WALL_CALCULATOR_GROUPS[0];
    expect(wall.type).toBe("wall");
    expect(wall.subTypes).toHaveLength(4);
    expect(wall.subTypes.map(s => s.type)).toEqual([
      "brick", "block4", "block7", "sleeper",
    ]);
  });
});

// ══════════════════════════════════════════════════════════════
// KERB_CALCULATOR_GROUPS
// ══════════════════════════════════════════════════════════════
describe("KERB_CALCULATOR_GROUPS", () => {
  it("has 4 kerb sub-types", () => {
    const kerb = KERB_CALCULATOR_GROUPS[0];
    expect(kerb.type).toBe("kerbs");
    expect(kerb.subTypes).toHaveLength(4);
    expect(kerb.subTypes.map(s => s.type)).toEqual([
      "kl", "rumbled", "flat", "sets",
    ]);
  });
});

// ══════════════════════════════════════════════════════════════
// FOUNDATION_CALCULATOR_GROUPS
// ══════════════════════════════════════════════════════════════
describe("FOUNDATION_CALCULATOR_GROUPS", () => {
  it("has 1 foundation sub-type", () => {
    const found = FOUNDATION_CALCULATOR_GROUPS[0];
    expect(found.type).toBe("foundation");
    expect(found.subTypes).toHaveLength(1);
    expect(found.subTypes[0].type).toBe("default");
  });
});
