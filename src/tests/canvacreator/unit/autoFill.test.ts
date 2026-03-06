import { describe, it, expect } from "vitest";
import { computeAutoFill } from "../../../projectmanagement/canvacreator/objectCard/autoFill";
import { Shape, toPixels } from "../../../projectmanagement/canvacreator/geometry";

function makeTestShape(overrides: Partial<Shape> = {}): Shape {
  return {
    points: [],
    closed: true,
    label: "Test",
    layer: 2,
    lockedEdges: [],
    lockedAngles: [],
    heights: [],
    elementType: "polygon",
    thickness: 0,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════
// Polygon auto-fill
// ══════════════════════════════════════════════════════════════
describe("computeAutoFill — polygon", () => {
  it("returns area for a closed 2m x 3m rectangle", () => {
    const shape = makeTestShape({
      points: [
        { x: 0, y: 0 },
        { x: toPixels(2), y: 0 },
        { x: toPixels(2), y: toPixels(3) },
        { x: 0, y: toPixels(3) },
      ],
      closed: true,
    });
    const af = computeAutoFill(shape);
    expect(af.areaM2).toBeCloseTo(6.0, 4);
  });

  it("returns correct perimeter for 2m x 3m rectangle", () => {
    const shape = makeTestShape({
      points: [
        { x: 0, y: 0 },
        { x: toPixels(2), y: 0 },
        { x: toPixels(2), y: toPixels(3) },
        { x: 0, y: toPixels(3) },
      ],
      closed: true,
    });
    const af = computeAutoFill(shape);
    expect(af.perimeterM).toBeCloseTo(10.0, 4);
  });

  it("returns correct bounding box dimensions", () => {
    const shape = makeTestShape({
      points: [
        { x: toPixels(1), y: toPixels(2) },
        { x: toPixels(4), y: toPixels(2) },
        { x: toPixels(4), y: toPixels(7) },
        { x: toPixels(1), y: toPixels(7) },
      ],
      closed: true,
    });
    const af = computeAutoFill(shape);
    expect(af.boundingBoxLengthM).toBeCloseTo(3.0, 4);
    expect(af.boundingBoxWidthM).toBeCloseTo(5.0, 4);
  });

  it("returns 4 edge lengths for a rectangle", () => {
    const shape = makeTestShape({
      points: [
        { x: 0, y: 0 },
        { x: toPixels(2), y: 0 },
        { x: toPixels(2), y: toPixels(3) },
        { x: 0, y: toPixels(3) },
      ],
      closed: true,
    });
    const af = computeAutoFill(shape);
    expect(af.edgeLengthsM).toHaveLength(4);
    expect(af.edgeLengthsM![0]).toBeCloseTo(2.0, 4);
    expect(af.edgeLengthsM![1]).toBeCloseTo(3.0, 4);
  });

  it("returns 4 corners and 4 segments for a rectangle", () => {
    const shape = makeTestShape({
      points: [
        { x: 0, y: 0 },
        { x: toPixels(2), y: 0 },
        { x: toPixels(2), y: toPixels(3) },
        { x: 0, y: toPixels(3) },
      ],
      closed: true,
    });
    const af = computeAutoFill(shape);
    expect(af.cornerCount).toBe(4);
    expect(af.segmentCount).toBe(4);
  });

  it("returns 0 area for unclosed polygon", () => {
    const shape = makeTestShape({
      points: [
        { x: 0, y: 0 },
        { x: toPixels(2), y: 0 },
        { x: toPixels(2), y: toPixels(3) },
      ],
      closed: false,
    });
    const af = computeAutoFill(shape);
    expect(af.areaM2).toBe(0);
  });

  it("does not return totalLengthM for polygon", () => {
    const shape = makeTestShape({
      points: [
        { x: 0, y: 0 },
        { x: toPixels(1), y: 0 },
        { x: toPixels(1), y: toPixels(1) },
      ],
      closed: true,
    });
    const af = computeAutoFill(shape);
    expect(af.totalLengthM).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════
// Linear element auto-fill
// ══════════════════════════════════════════════════════════════
describe("computeAutoFill — linear element", () => {
  it("returns totalLengthM for a 3m fence", () => {
    const shape = makeTestShape({
      elementType: "fence",
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: toPixels(3), y: 0 },
      ],
      thickness: 0.10,
    });
    const af = computeAutoFill(shape);
    expect(af.totalLengthM).toBeCloseTo(3.0, 4);
  });

  it("returns correct segment count for 3-point wall", () => {
    const shape = makeTestShape({
      elementType: "wall",
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: toPixels(2), y: 0 },
        { x: toPixels(2), y: toPixels(1) },
      ],
      thickness: 0.10,
    });
    const af = computeAutoFill(shape);
    expect(af.segmentCount).toBe(2);
    expect(af.cornerCount).toBe(1);
  });

  it("returns correct edge lengths for L-shaped kerb", () => {
    const shape = makeTestShape({
      elementType: "kerb",
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: toPixels(5), y: 0 },
        { x: toPixels(5), y: toPixels(3) },
      ],
      thickness: 0.10,
    });
    const af = computeAutoFill(shape);
    expect(af.edgeLengthsM).toHaveLength(2);
    expect(af.edgeLengthsM![0]).toBeCloseTo(5.0, 4);
    expect(af.edgeLengthsM![1]).toBeCloseTo(3.0, 4);
    expect(af.totalLengthM).toBeCloseTo(8.0, 4);
  });

  it("does not return areaM2 for linear element", () => {
    const shape = makeTestShape({
      elementType: "foundation",
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: toPixels(2), y: 0 },
      ],
      thickness: 0.10,
    });
    const af = computeAutoFill(shape);
    expect(af.areaM2).toBeUndefined();
  });

  it("returns 0 corners for a 2-point line", () => {
    const shape = makeTestShape({
      elementType: "fence",
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: toPixels(5), y: 0 },
      ],
      thickness: 0.10,
    });
    const af = computeAutoFill(shape);
    expect(af.cornerCount).toBe(0);
  });
});
