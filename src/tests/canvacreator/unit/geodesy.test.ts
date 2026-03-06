import { describe, it, expect } from "vitest";
import { calcShapeGradient } from "../../../projectmanagement/canvacreator/geodesy";
import { Shape, toPixels } from "../../../projectmanagement/canvacreator/geometry";

function makeShape(
  points: { x: number; y: number }[],
  heights: number[],
  closed = true
): Shape {
  return {
    points,
    closed,
    label: "Test",
    layer: 2,
    lockedEdges: [],
    lockedAngles: [],
    heights,
    elementType: "polygon",
    thickness: 0,
  };
}

// ══════════════════════════════════════════════════════════════
// calcShapeGradient — flat surface
// ══════════════════════════════════════════════════════════════
describe("calcShapeGradient — flat surface", () => {
  it("returns magnitude ~0 for flat surface (all same height)", () => {
    const shape = makeShape(
      [
        { x: 0, y: 0 },
        { x: toPixels(2), y: 0 },
        { x: toPixels(2), y: toPixels(2) },
        { x: 0, y: toPixels(2) },
      ],
      [0, 0, 0, 0]
    );
    const result = calcShapeGradient(shape);
    expect(result).not.toBeNull();
    expect(result!.magnitude).toBeCloseTo(0, 1);
    expect(result!.severity).toBe("ok");
  });
});

// ══════════════════════════════════════════════════════════════
// calcShapeGradient — uniform slopes
// ══════════════════════════════════════════════════════════════
describe("calcShapeGradient — uniform slopes", () => {
  it("returns correct angle for slope descending east (height decreases with x)", () => {
    const px = toPixels(1);
    const shape = makeShape(
      [
        { x: 0, y: 0 },
        { x: px, y: 0 },
        { x: px, y: px },
        { x: 0, y: px },
      ],
      [0.02, 0.01, 0.01, 0.02]
    );
    const result = calcShapeGradient(shape);
    expect(result).not.toBeNull();
    expect(result!.magnitude).toBeGreaterThan(0);
    expect(result!.angle).toBeCloseTo(0, 2);
  });

  it("returns angle ~PI/2 for slope descending south (height decreases with y, screen coords)", () => {
    const px = toPixels(1);
    const shape = makeShape(
      [
        { x: 0, y: 0 },
        { x: px, y: 0 },
        { x: px, y: px },
        { x: 0, y: px },
      ],
      [0.02, 0.02, 0.01, 0.01]
    );
    const result = calcShapeGradient(shape);
    expect(result).not.toBeNull();
    expect(result!.magnitude).toBeGreaterThan(0);
    expect(result!.angle).toBeCloseTo(Math.PI / 2, 2);
  });
});

// ══════════════════════════════════════════════════════════════
// calcShapeGradient — insufficient points
// ══════════════════════════════════════════════════════════════
describe("calcShapeGradient — insufficient points", () => {
  it("returns null when fewer than 3 points", () => {
    const shape = makeShape(
      [{ x: 0, y: 0 }, { x: 80, y: 0 }],
      [0, 0.01],
      true
    );
    expect(calcShapeGradient(shape)).toBeNull();
  });

  it("returns null when shape is not closed", () => {
    const shape = makeShape(
      [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 80 },
      ],
      [0, 0.01, 0.01],
      false
    );
    expect(calcShapeGradient(shape)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// calcShapeGradient — proportional angle
// ══════════════════════════════════════════════════════════════
describe("calcShapeGradient — proportional angle", () => {
  it("returns angle slightly off vertical for 5cm/m down + 1cm/m right slope", () => {
    const px = toPixels(1);
    const shape = makeShape(
      [
        { x: 0, y: 0 },
        { x: px, y: 0 },
        { x: px, y: px },
        { x: 0, y: px },
      ],
      [0.06, 0.05, 0, 0.01]
    );
    const result = calcShapeGradient(shape);
    expect(result).not.toBeNull();
    expect(result!.magnitude).toBeGreaterThan(4);
    expect(result!.magnitude).toBeLessThan(7);
    const verticalSouth = -Math.PI / 2;
    expect(Math.abs(result!.angle - verticalSouth)).toBeGreaterThan(0.1);
  });
});
