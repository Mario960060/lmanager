import { describe, it, expect } from "vitest";
import {
  isLinearElement,
  linearElementColor,
  computeThickPolyline,
  computeThickPolylineClosed,
  polygonToSegmentLengths,
  polygonToCenterline,
  hitTestLinearElement,
} from "../../../projectmanagement/canvacreator/linearElements";
import { Shape, C, toPixels } from "../../../projectmanagement/canvacreator/geometry";

function makeTestShape(overrides: Partial<Shape> = {}): Shape {
  return {
    points: [],
    closed: false,
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
// isLinearElement
// ══════════════════════════════════════════════════════════════
describe("isLinearElement", () => {
  it("returns false for polygon", () => {
    expect(isLinearElement(makeTestShape({ elementType: "polygon" }))).toBe(false);
  });

  it("returns true for fence", () => {
    expect(isLinearElement(makeTestShape({ elementType: "fence" }))).toBe(true);
  });

  it("returns true for wall", () => {
    expect(isLinearElement(makeTestShape({ elementType: "wall" }))).toBe(true);
  });

  it("returns true for kerb", () => {
    expect(isLinearElement(makeTestShape({ elementType: "kerb" }))).toBe(true);
  });

  it("returns true for foundation", () => {
    expect(isLinearElement(makeTestShape({ elementType: "foundation" }))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// linearElementColor
// ══════════════════════════════════════════════════════════════
describe("linearElementColor", () => {
  it("returns fence color for fence", () => {
    expect(linearElementColor("fence")).toBe(C.fence);
  });

  it("returns wall color for wall", () => {
    expect(linearElementColor("wall")).toBe(C.wall);
  });

  it("returns kerb color for kerb", () => {
    expect(linearElementColor("kerb")).toBe(C.kerb);
  });

  it("returns foundation color for foundation", () => {
    expect(linearElementColor("foundation")).toBe(C.foundation);
  });

  it("returns layer2Edge for polygon fallback", () => {
    expect(linearElementColor("polygon")).toBe(C.layer2Edge);
  });
});

// ══════════════════════════════════════════════════════════════
// computeThickPolyline
// ══════════════════════════════════════════════════════════════
describe("computeThickPolyline", () => {
  it("returns empty for less than 2 points", () => {
    expect(computeThickPolyline([{ x: 0, y: 0 }], 10)).toEqual([]);
    expect(computeThickPolyline([], 10)).toEqual([]);
  });

  it("returns closed polygon for a 2-point horizontal line", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const outline = computeThickPolyline(pts, 20);
    expect(outline.length).toBeGreaterThanOrEqual(4);
  });

  it("outline points are offset by half-thickness from the line", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const thickness = 20;
    const outline = computeThickPolyline(pts, thickness);

    const allY = outline.map(p => p.y);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);

    expect(minY).toBeCloseTo(-10, 1);
    expect(maxY).toBeCloseTo(10, 1);
  });

  it("returns correct number of outline points for 3-point polyline", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const outline = computeThickPolyline(pts, 10);
    // left side has 3 pts (one per input point segment start + last end)
    // right side has 3 pts reversed
    // Actually: leftPts gets one per segment start (2) + last endpoint (1) = 3
    // rightPts same = 3, reversed
    // Total = 6
    expect(outline).toHaveLength(6);
  });

  it("closed loop includes fourth edge vs open U-shape", () => {
    const openU = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const openOutline = computeThickPolyline(openU, 20);
    const closedOutline = computeThickPolylineClosed(openU, 20);
    expect(closedOutline.length).toBeGreaterThan(openOutline.length);
    const lens = polygonToSegmentLengths(closedOutline);
    expect(lens).toHaveLength(4);
    expect(lens.every((L) => L > 1e-6)).toBe(true);
    expect(polygonToSegmentLengths(openOutline)).toHaveLength(3);
  });
});

// ══════════════════════════════════════════════════════════════
// hitTestLinearElement
// ══════════════════════════════════════════════════════════════
describe("hitTestLinearElement", () => {
  const horizontalFence = makeTestShape({
    elementType: "fence",
    thickness: 0.10,
    points: [{ x: 0, y: 0 }, { x: toPixels(5), y: 0 }],
  });

  it("returns true for a point on the line", () => {
    expect(hitTestLinearElement({ x: toPixels(2.5), y: 0 }, horizontalFence, 1)).toBe(true);
  });

  it("returns true for a point within thickness", () => {
    expect(hitTestLinearElement({ x: toPixels(2.5), y: 2 }, horizontalFence, 1)).toBe(true);
  });

  it("returns false for a point far away", () => {
    expect(hitTestLinearElement({ x: toPixels(2.5), y: toPixels(2) }, horizontalFence, 1)).toBe(false);
  });

  it("returns false for a single-point shape", () => {
    const singlePt = makeTestShape({
      elementType: "fence",
      thickness: 0.10,
      points: [{ x: 0, y: 0 }],
    });
    expect(hitTestLinearElement({ x: 0, y: 0 }, singlePt, 1)).toBe(false);
  });

  it("returns true for point near the start of the line", () => {
    expect(hitTestLinearElement({ x: 1, y: 0 }, horizontalFence, 1)).toBe(true);
  });

  it("returns true for point near the end of the line", () => {
    expect(hitTestLinearElement({ x: toPixels(4.9), y: 0 }, horizontalFence, 1)).toBe(true);
  });
});
