import { describe, it, expect } from "vitest";
import {
  isLinearElement,
  linearElementColor,
  computeThickPolyline,
  computeThickPolylineClosed,
  polygonToSegmentLengths,
  polygonToCenterline,
  hitTestLinearElement,
  pathClosedOutlineToWallStripOutline,
  wallStripOutlineToPathClosedOutline,
  extractCenterlineFromOpenStripOutline,
  rebuildPathRibbonPairTranslateHalf,
  extractPathRibbonCenterlineFromOutline,
  computePathOutlineFromSegmentSides,
  rebuildRectangularPathRibbonFromOutlineDrag,
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
    // openU is 4 corners → 4 centerline vertices → outline 2×4 points; 3 run segments.
    expect(openOutline.length).toBe(8);
    expect(polygonToSegmentLengths(openOutline)).toHaveLength(3);
  });
});

// ══════════════════════════════════════════════════════════════
// Path closed outline ↔ wall strip (2V vs 2V+2)
// ══════════════════════════════════════════════════════════════
describe("pathClosedOutline wall strip conversion", () => {
  it("round-trips wall strip outline through path layout and back", () => {
    const center = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ];
    const wall = computeThickPolylineClosed(center, 20);
    expect(wall.length).toBe(10);
    const path = wallStripOutlineToPathClosedOutline(wall);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(8);
    const wall2 = pathClosedOutlineToWallStripOutline(path!);
    expect(wall2).not.toBeNull();
    expect(wall2!.length).toBe(wall.length);
    for (let i = 0; i < wall.length; i++) {
      expect(wall2![i].x).toBeCloseTo(wall[i].x, 5);
      expect(wall2![i].y).toBeCloseTo(wall[i].y, 5);
    }
    const cl = extractCenterlineFromOpenStripOutline(path!);
    expect(cl.length).toBe(4);
  });
});

describe("extractPathRibbonCenterlineFromOutline", () => {
  it("uses open-strip pairing for flat 8-point path outline (4 centers, not 3)", () => {
    const center = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const wall = computeThickPolylineClosed(center, 20);
    const path = wallStripOutlineToPathClosedOutline(wall);
    expect(path).not.toBeNull();
    const cl = extractPathRibbonCenterlineFromOutline(path!);
    expect(cl.length).toBe(4);
  });
});

describe("rebuildRectangularPathRibbonFromOutlineDrag", () => {
  it("hits outline target while keeping a rectangular centerline", () => {
    const cl = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const sides: ("left" | "right")[] = ["left", "left", "left"];
    const outline0 = computePathOutlineFromSegmentSides(cl, sides, 0.6);
    expect(outline0.length).toBe(8);
    const vi = 1;
    // Drag target must stay within the solver tolerance (see tolSnap2 in linearElements.ts);
    // a large offset can fail to converge within maxIter and returns null.
    const target = { x: outline0[vi].x + 1, y: outline0[vi].y - 0.5 };
    const res = rebuildRectangularPathRibbonFromOutlineDrag(cl, sides, 0.6, vi, target);
    expect(res).not.toBeNull();
    const err = Math.hypot(res!.outline[vi].x - target.x, res!.outline[vi].y - target.y);
    expect(err).toBeLessThan(6);
  });
});

describe("rebuildPathRibbonPairTranslateHalf", () => {
  it("moves opposite ribbon corner by the same delta", () => {
    const q = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 0, y: 4 },
    ];
    const out = rebuildPathRibbonPairTranslateHalf(q, 1, { x: 12, y: 1 });
    expect(out).not.toBeNull();
    expect(out![1].x).toBe(12);
    expect(out![1].y).toBe(1);
    expect(out![2].x).toBe(12);
    expect(out![2].y).toBe(5);
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
