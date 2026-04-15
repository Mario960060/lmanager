import { describe, it, expect } from "vitest";
import {
  getExcavationCmAtVertex,
  getPreparationCmAtVertex,
  geodesyHeightOffsetCmAtVertex,
} from "../../../projectmanagement/canvacreator/excavation";
import type { Shape } from "../../../projectmanagement/canvacreator/geometry";

function makeShape(partial: Partial<Shape> & Pick<Shape, "points" | "layer" | "calculatorType">): Shape {
  return {
    closed: true,
    label: "T",
    lockedEdges: [],
    lockedAngles: [],
    heights: partial.points!.map(() => 0),
    elementType: "polygon",
    thickness: 0,
    ...partial,
  } as Shape;
}

describe("excavation + geodesy height", () => {
  it("getExcavation: default minus 15 cm becomes +25 cm when vertex height is +0.4 m", () => {
    const shape = makeShape({
      layer: 2,
      calculatorType: "slab",
      calculatorInputs: {
        slabThicknessCm: 10,
        mortarThicknessCm: 5,
      },
      points: [{ x: 0, y: 0 }],
      heights: [0.4],
    });
    const base = getExcavationCmAtVertex(
      { ...shape, heights: [0], excavationCm: undefined },
      0,
    );
    expect(base).toBe(-15);
    expect(geodesyHeightOffsetCmAtVertex(shape, 0)).toBe(40);
    expect(getExcavationCmAtVertex(shape, 0)).toBe(25);
  });

  it("getExcavation: explicit excavationCm overrides synthesis", () => {
    const shape = makeShape({
      layer: 2,
      calculatorType: "slab",
      calculatorInputs: { slabThicknessCm: 10, mortarThicknessCm: 5 },
      points: [{ x: 0, y: 0 }],
      heights: [0.4],
      excavationCm: [-10],
    });
    expect(getExcavationCmAtVertex(shape, 0)).toBe(-10);
  });

  it("getPreparation: adds geodesy height to default tape level", () => {
    const shape = makeShape({
      layer: 2,
      calculatorType: "slab",
      calculatorInputs: { slabThicknessCm: 8, mortarThicknessCm: 2 },
      points: [{ x: 0, y: 0 }],
      heights: [0.1],
    });
    const withZeroH = getPreparationCmAtVertex({ ...shape, heights: [0] }, 0);
    const withH = getPreparationCmAtVertex(shape, 0);
    expect(withH).not.toBeNull();
    expect(withZeroH).not.toBeNull();
    expect(withH! - withZeroH!).toBeCloseTo(10, 5);
  });
});
