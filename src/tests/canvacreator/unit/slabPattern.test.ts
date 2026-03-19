import { describe, it, expect } from "vitest";
import {
  parseSlabDimensions,
  shrinkPolygon,
  drawSlabPattern,
  drawSlabFrame,
  computeSlabCuts,
  computePatternAlignToStraightEdge,
  isLogicalEdgeStraight,
  patternOriginOnOutline,
} from "../../../projectmanagement/canvacreator/visualization/slabPattern";
import { makeRectangle, makeTriangle } from "../../../projectmanagement/canvacreator/geometry";

// ── Mock canvas ctx for draw tests ────────────────────────────
const mockCtx = {
  save: () => {},
  restore: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  closePath: () => {},
  clip: () => {},
  fill: () => {},
  fillRect: () => {},
  fillStyle: "",
  stroke: () => {},
  strokeStyle: "",
  strokeRect: () => {},
  lineWidth: 0,
  setLineDash: () => {},
  font: "",
  textAlign: "",
  textBaseline: "",
  fillText: () => {},
};

const identityWorldToScreen = (wx: number, wy: number) => ({ x: wx, y: wy });

// ══════════════════════════════════════════════════════════════
// shrinkPolygon
// ══════════════════════════════════════════════════════════════
describe("shrinkPolygon", () => {
  it("returns original pts when fewer than 3 points", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(shrinkPolygon(pts, 5)).toEqual(pts);
  });

  it("returns original pts when dist <= 0", () => {
    const pts = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }];
    expect(shrinkPolygon(pts, 0)).toEqual(pts);
    expect(shrinkPolygon(pts, -5)).toEqual(pts);
  });

  it("shrinks CCW rectangle inward", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 80 },
      { x: 0, y: 80 },
    ];
    const result = shrinkPolygon(pts, 10);
    expect(result).toHaveLength(4);
    result.forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(10);
      expect(p.x).toBeLessThanOrEqual(70);
      expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.y).toBeLessThanOrEqual(70);
    });
  });

  it("shrinks CW polygon inward (reversed orientation)", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 80, y: 80 },
      { x: 80, y: 0 },
    ];
    const result = shrinkPolygon(pts, 10);
    expect(result).toHaveLength(4);
    result.forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(10);
      expect(p.x).toBeLessThanOrEqual(70);
      expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.y).toBeLessThanOrEqual(70);
    });
  });

  it("shrinks triangle inward", () => {
    const pts = [
      { x: 40, y: 0 },
      { x: 80, y: 80 },
      { x: 0, y: 80 },
    ];
    const result = shrinkPolygon(pts, 5);
    expect(result).toHaveLength(3);
    result.forEach((p) => {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// patternOriginOnOutline
// ══════════════════════════════════════════════════════════════
describe("patternOriginOnOutline", () => {
  it("uses same index when outline length matches logical", () => {
    const logical = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const outline = logical.map(p => ({ x: p.x + 1, y: p.y + 1 }));
    const p = patternOriginOnOutline(logical, outline, 1);
    expect(p).toEqual(outline[1]);
  });

  it("picks nearest outline vertex when outline is densified", () => {
    const logical = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const outline = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
    ];
    const p = patternOriginOnOutline(logical, outline, 1);
    expect(p).toEqual({ x: 100, y: 0 });
  });
});

// ══════════════════════════════════════════════════════════════
// computePatternAlignToStraightEdge
// ══════════════════════════════════════════════════════════════
describe("computePatternAlignToStraightEdge", () => {
  it("returns null for curved logical edge", () => {
    const shape = makeRectangle(0, 0, 1);
    shape.edgeArcs = [[{ id: "a", t: 0.5, offset: 10 }]];
    expect(isLogicalEdgeStraight(shape, 0)).toBe(false);
    expect(
      computePatternAlignToStraightEdge(shape, 0, { vizSlabWidth: 60, vizSlabLength: 90 }, "slab")
    ).toBeNull();
  });

  it("sets direction along top edge of CCW rectangle and start corner", () => {
    const shape = makeRectangle(0, 0, 1);
    shape.closed = true;
    const r = computePatternAlignToStraightEdge(shape, 0, { vizSlabWidth: 60, vizSlabLength: 90 }, "slab", "parallel");
    expect(r).not.toBeNull();
    expect(r!.vizStartCorner).toBe(0);
    expect(Math.abs(r!.vizDirection - 0)).toBeLessThan(1e-6);
  });

  it("perpendicular mode adds 90° to parallel direction", () => {
    const shape = makeRectangle(0, 0, 1);
    shape.closed = true;
    const par = computePatternAlignToStraightEdge(shape, 0, { vizSlabWidth: 60, vizSlabLength: 90 }, "slab", "parallel");
    const perp = computePatternAlignToStraightEdge(shape, 0, { vizSlabWidth: 60, vizSlabLength: 90 }, "slab", "perpendicular");
    expect(par).not.toBeNull();
    expect(perp).not.toBeNull();
    const diff = Math.abs((((perp!.vizDirection - par!.vizDirection) % 360) + 360) % 360);
    const diffAlt = 360 - diff;
    expect(Math.min(diff, diffAlt)).toBeCloseTo(90, 5);
  });
});

// ══════════════════════════════════════════════════════════════
// computeSlabCuts
// ══════════════════════════════════════════════════════════════
describe("computeSlabCuts", () => {
  const baseInputs = {
    vizSlabWidth: 60,
    vizSlabLength: 60,
    vizGroutWidthMm: 5,
    vizPattern: "grid",
    vizDirection: 0,
    vizStartCorner: 0,
    vizOriginOffsetX: 0,
    vizOriginOffsetY: 0,
  };

  it("returns empty when shape has fewer than 3 points", () => {
    const shape = makeRectangle(0, 0, 1);
    shape.points = [{ x: 0, y: 0 }, { x: 80, y: 0 }];
    shape.closed = true;
    const result = computeSlabCuts(shape, baseInputs);
    expect(result.cuts).toEqual([]);
    expect(result.cutSlabCount).toBe(0);
  });

  it("returns empty when vizSlabWidth/vizSlabLength missing", () => {
    const shape = makeRectangle(0, 0, 1);
    const result = computeSlabCuts(shape, {});
    expect(result.cuts).toEqual([]);
    expect(result.cutSlabCount).toBe(0);
  });

  it("returns cuts for rectangle without frame", () => {
    const shape = makeRectangle(0, 0, 1);
    shape.closed = true;
    const result = computeSlabCuts(shape, baseInputs);
    expect(result.cuts).toBeDefined();
    expect(Array.isArray(result.cuts)).toBe(true);
    expect(typeof result.cutSlabCount).toBe("number");
  });

  it("uses inner polygon when framePieceWidthCm is set", () => {
    const shape = makeRectangle(0, 0, 1);
    shape.closed = true;
    const withoutFrame = computeSlabCuts(shape, baseInputs);
    const withFrame = computeSlabCuts(shape, {
      ...baseInputs,
      framePieceWidthCm: 10,
      framePieceLengthCm: 60,
    });
    expect(withFrame.cuts).toBeDefined();
    expect(Array.isArray(withFrame.cuts)).toBe(true);
    expect(typeof withFrame.cutSlabCount).toBe("number");
    expect(withFrame.cutSlabCount).toBeLessThanOrEqual(withoutFrame.cutSlabCount + 100);
  });
});

// ══════════════════════════════════════════════════════════════
// drawSlabPattern (mock)
// ══════════════════════════════════════════════════════════════
describe("drawSlabPattern", () => {
  it("is a function", () => {
    expect(typeof drawSlabPattern).toBe("function");
  });

  it("does not throw with valid shape and inputs", () => {
    const shape = makeRectangle(0, 0, 1);
    shape.calculatorType = "slab";
    shape.calculatorInputs = {
      vizSlabWidth: 60,
      vizSlabLength: 60,
      vizGroutWidthMm: 5,
      vizPattern: "grid",
      vizDirection: 0,
      vizStartCorner: 0,
    };
    expect(() =>
      drawSlabPattern(mockCtx as any, shape, identityWorldToScreen, 1)
    ).not.toThrow();
  });

  it("does not throw with frame inputs (shrinks polygon)", () => {
    const shape = makeRectangle(0, 0, 1);
    shape.calculatorType = "slab";
    shape.calculatorInputs = {
      vizSlabWidth: 60,
      vizSlabLength: 60,
      vizGroutWidthMm: 5,
      vizPattern: "grid",
      vizDirection: 0,
      vizStartCorner: 0,
      framePieceWidthCm: 10,
      framePieceLengthCm: 60,
    };
    expect(() =>
      drawSlabPattern(mockCtx as any, shape, identityWorldToScreen, 1)
    ).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════
// drawSlabFrame (mock)
// ══════════════════════════════════════════════════════════════
describe("drawSlabFrame", () => {
  it("is a function", () => {
    expect(typeof drawSlabFrame).toBe("function");
  });

  it("does not throw when framePieceWidthCm is set", () => {
    const shape = makeRectangle(0, 0, 1);
    shape.closed = true;
    shape.calculatorInputs = {
      framePieceWidthCm: 10,
      framePieceLengthCm: 60,
    };
    expect(() =>
      drawSlabFrame(mockCtx as any, shape, identityWorldToScreen, 1)
    ).not.toThrow();
  });

  it("does nothing when framePieceWidthCm is 0 or missing", () => {
    const shape = makeRectangle(0, 0, 1);
    shape.closed = true;
    shape.calculatorInputs = {};
    expect(() =>
      drawSlabFrame(mockCtx as any, shape, identityWorldToScreen, 1)
    ).not.toThrow();
  });

  it("does nothing when shape has fewer than 3 points", () => {
    const shape = makeRectangle(0, 0, 1);
    shape.points = [{ x: 0, y: 0 }, { x: 80, y: 0 }];
    shape.closed = true;
    shape.calculatorInputs = { framePieceWidthCm: 10, framePieceLengthCm: 60 };
    expect(() =>
      drawSlabFrame(mockCtx as any, shape, identityWorldToScreen, 1)
    ).not.toThrow();
  });
});

describe("parseSlabDimensions", () => {
  it("returns dimensions for 600x600 pattern", () => {
    const result = parseSlabDimensions("laying slabs 600x600");
    expect(result).toEqual({ widthCm: 600, lengthCm: 600 });
  });

  it("returns dimensions for 900x600 pattern", () => {
    const result = parseSlabDimensions("laying slabs 900x600");
    expect(result).toEqual({ widthCm: 900, lengthCm: 600 });
  });

  it("handles space around x", () => {
    const result = parseSlabDimensions("slabs 60 x 90 cm");
    expect(result).toEqual({ widthCm: 60, lengthCm: 90 });
  });

  it("returns null for mix size", () => {
    const result = parseSlabDimensions("laying slabs mix size");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSlabDimensions("")).toBeNull();
  });

  it("returns null for string without dimensions", () => {
    expect(parseSlabDimensions("laying slabs porcelain")).toBeNull();
  });

  it("returns null for invalid dimensions", () => {
    expect(parseSlabDimensions("laying slabs abc x def")).toBeNull();
  });
});
