import { describe, it, expect } from "vitest";
import {
  Point,
  distance,
  toMeters,
  toPixels,
  formatLength,
  midpoint,
  angleDeg,
  shoelaceArea,
  areaM2,
  centroid,
  polylineLength,
  polylineLengthMeters,
  makeSquare,
  makeRectangle,
  makeTriangle,
  makeTrapezoid,
  PIXELS_PER_METER,
  C,
  snapPatternDirectionToBoundaryAngles,
  PATTERN_BOUNDARY_SNAP_THRESHOLD_DEG,
  isRectangleCenterlineQuad,
} from "../../../projectmanagement/canvacreator/geometry";

// ── Helper: create a simple rectangle in pixel coords ────────
function rectPoints(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

// ══════════════════════════════════════════════════════════════
// isRectangleCenterlineQuad
// ══════════════════════════════════════════════════════════════
describe("isRectangleCenterlineQuad", () => {
  it("accepts axis-aligned rectangle corners in order", () => {
    expect(isRectangleCenterlineQuad(rectPoints(0, 0, 10, 5))).toBe(true);
  });
  it("rejects skewed parallelogram", () => {
    const skew: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 15, y: 5 },
      { x: 5, y: 5 },
    ];
    expect(isRectangleCenterlineQuad(skew)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// distance
// ══════════════════════════════════════════════════════════════
describe("distance", () => {
  it("returns 0 for the same point", () => {
    expect(distance({ x: 5, y: 3 }, { x: 5, y: 3 })).toBe(0);
  });

  it("returns correct distance for horizontal segment", () => {
    expect(distance({ x: 0, y: 0 }, { x: 80, y: 0 })).toBe(80);
  });

  it("returns correct distance for vertical segment", () => {
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 80 })).toBe(80);
  });

  it("returns correct distance for diagonal (3-4-5 triangle)", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 10);
  });
});

// ══════════════════════════════════════════════════════════════
// toMeters / toPixels
// ══════════════════════════════════════════════════════════════
describe("toMeters / toPixels", () => {
  it("toMeters converts 80px to 1m (PIXELS_PER_METER = 80)", () => {
    expect(toMeters(80)).toBe(1);
    expect(toMeters(160)).toBe(2);
    expect(toMeters(0)).toBe(0);
  });

  it("toPixels converts 1m to 80px", () => {
    expect(toPixels(1)).toBe(80);
    expect(toPixels(2.5)).toBe(200);
    expect(toPixels(0)).toBe(0);
  });

  it("toMeters and toPixels are inverse", () => {
    expect(toMeters(toPixels(3.7))).toBeCloseTo(3.7, 10);
    expect(toPixels(toMeters(240))).toBeCloseTo(240, 10);
  });
});

// ══════════════════════════════════════════════════════════════
// formatLength
// ══════════════════════════════════════════════════════════════
describe("formatLength", () => {
  it("formats 80px as '1.000m'", () => {
    expect(formatLength(80)).toBe("1.000m");
  });

  it("formats 0 as '0.000m'", () => {
    expect(formatLength(0)).toBe("0.000m");
  });

  it("formats negative values as absolute", () => {
    expect(formatLength(-80)).toBe("1.000m");
  });
});

// ══════════════════════════════════════════════════════════════
// midpoint
// ══════════════════════════════════════════════════════════════
describe("midpoint", () => {
  it("returns middle of two points", () => {
    const m = midpoint({ x: 0, y: 0 }, { x: 10, y: 20 });
    expect(m.x).toBe(5);
    expect(m.y).toBe(10);
  });

  it("returns the point itself for same points", () => {
    const m = midpoint({ x: 7, y: 3 }, { x: 7, y: 3 });
    expect(m.x).toBe(7);
    expect(m.y).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════
// angleDeg
// ══════════════════════════════════════════════════════════════
describe("angleDeg", () => {
  it("returns 90 for a right angle", () => {
    const angle = angleDeg({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 });
    expect(angle).toBeCloseTo(90, 5);
  });

  it("returns 180 for a straight line", () => {
    const angle = angleDeg({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(angle).toBeCloseTo(180, 5);
  });

  it("returns 0 for degenerate case (zero-length arm)", () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);
  });

  it("returns 45 for a 45-degree angle", () => {
    const angle = angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(angle).toBeCloseTo(45, 4);
  });
});

// ══════════════════════════════════════════════════════════════
// shoelaceArea / areaM2
// ══════════════════════════════════════════════════════════════
describe("shoelaceArea / areaM2", () => {
  it("shoelaceArea returns correct area for unit square (in px)", () => {
    const pts = rectPoints(0, 0, 100, 100);
    expect(shoelaceArea(pts)).toBe(10000);
  });

  it("areaM2 returns correct area for a 1m x 1m square", () => {
    const px = PIXELS_PER_METER;
    const pts = rectPoints(0, 0, px, px);
    expect(areaM2(pts)).toBeCloseTo(1.0, 6);
  });

  it("areaM2 returns correct area for 2m x 3m rectangle", () => {
    const pts = rectPoints(0, 0, toPixels(2), toPixels(3));
    expect(areaM2(pts)).toBeCloseTo(6.0, 4);
  });

  it("returns 0 for degenerate triangle (collinear points)", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    expect(areaM2(pts)).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// centroid
// ══════════════════════════════════════════════════════════════
describe("centroid", () => {
  it("returns center of a symmetric rectangle", () => {
    const pts = rectPoints(0, 0, 100, 100);
    const c = centroid(pts);
    expect(c.x).toBe(50);
    expect(c.y).toBe(50);
  });

  it("returns correct centroid for a single point", () => {
    const c = centroid([{ x: 42, y: 99 }]);
    expect(c.x).toBe(42);
    expect(c.y).toBe(99);
  });
});

// ══════════════════════════════════════════════════════════════
// polylineLength / polylineLengthMeters
// ══════════════════════════════════════════════════════════════
describe("polylineLength / polylineLengthMeters", () => {
  it("returns 0 for a single point", () => {
    expect(polylineLength([{ x: 0, y: 0 }])).toBe(0);
  });

  it("returns correct length for a horizontal 2-point line", () => {
    const pts = [{ x: 0, y: 0 }, { x: 160, y: 0 }];
    expect(polylineLength(pts)).toBe(160);
    expect(polylineLengthMeters(pts)).toBeCloseTo(2.0, 6);
  });

  it("returns sum of segments for a 3-point polyline", () => {
    const pts = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }];
    expect(polylineLength(pts)).toBeCloseTo(160, 6);
    expect(polylineLengthMeters(pts)).toBeCloseTo(2.0, 6);
  });

  it("handles empty array", () => {
    expect(polylineLength([])).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Shape Factories
// ══════════════════════════════════════════════════════════════
describe("makeSquare", () => {
  const sq = makeSquare(0, 0);

  it("creates 4 points", () => {
    expect(sq.points).toHaveLength(4);
  });

  it("is closed", () => {
    expect(sq.closed).toBe(true);
  });

  it("has English label", () => {
    expect(sq.label).toBe("Square");
  });

  it("has elementType polygon", () => {
    expect(sq.elementType).toBe("polygon");
  });

  it("has thickness 0", () => {
    expect(sq.thickness).toBe(0);
  });

  it("has correct area: side = 4m so area = 16m²", () => {
    expect(areaM2(sq.points)).toBeCloseTo(16.0, 2);
  });

  it("defaults to layer 1", () => {
    expect(sq.layer).toBe(1);
  });

  it("respects layer parameter", () => {
    const sq2 = makeSquare(0, 0, 2);
    expect(sq2.layer).toBe(2);
  });

  it("has heights array matching points count", () => {
    expect(sq.heights).toHaveLength(sq.points.length);
  });
});

describe("makeRectangle", () => {
  const r = makeRectangle(0, 0);

  it("creates 4 points", () => {
    expect(r.points).toHaveLength(4);
  });

  it("has English label", () => {
    expect(r.label).toBe("Rectangle");
  });

  it("has correct area: 6m x 4m = 24m²", () => {
    expect(areaM2(r.points)).toBeCloseTo(24.0, 2);
  });

  it("has elementType polygon", () => {
    expect(r.elementType).toBe("polygon");
  });
});

describe("makeTriangle", () => {
  const t = makeTriangle(0, 0);

  it("creates 3 points", () => {
    expect(t.points).toHaveLength(3);
  });

  it("has English label", () => {
    expect(t.label).toBe("Triangle");
  });

  it("has elementType polygon", () => {
    expect(t.elementType).toBe("polygon");
  });

  it("has 3 heights", () => {
    expect(t.heights).toHaveLength(3);
  });
});

describe("makeTrapezoid", () => {
  const tr = makeTrapezoid(0, 0);

  it("creates 4 points", () => {
    expect(tr.points).toHaveLength(4);
  });

  it("has English label", () => {
    expect(tr.label).toBe("Trapezoid");
  });

  it("has elementType polygon", () => {
    expect(tr.elementType).toBe("polygon");
  });
});

// ══════════════════════════════════════════════════════════════
// snapPatternDirectionToBoundaryAngles
// ══════════════════════════════════════════════════════════════
describe("snapPatternDirectionToBoundaryAngles", () => {
  const thr = PATTERN_BOUNDARY_SNAP_THRESHOLD_DEG;
  const boundaries = [44, 92] as const;

  it("snaps to parallel boundary tangent when close", () => {
    const out = snapPatternDirectionToBoundaryAngles(44.5, boundaries, thr);
    expect(out).toBeCloseTo(44, 5);
  });

  it("snaps to perpendicular orientation when close to b+90", () => {
    const out = snapPatternDirectionToBoundaryAngles(133.8, boundaries, thr);
    expect(out).toBeCloseTo(134, 5);
  });

  it("does not snap when far from any axis", () => {
    const raw = 12;
    const out = snapPatternDirectionToBoundaryAngles(raw, boundaries, thr);
    expect(out).toBe(raw);
  });
});

// ══════════════════════════════════════════════════════════════
// C (colors)
// ══════════════════════════════════════════════════════════════
describe("C (theme colors)", () => {
  it("has fence/wall/kerb/foundation colors defined", () => {
    expect(C.fence).toBeDefined();
    expect(C.wall).toBeDefined();
    expect(C.kerb).toBeDefined();
    expect(C.foundation).toBeDefined();
  });

  it("has dim variants for each linear element type", () => {
    expect(C.fenceDim).toBeDefined();
    expect(C.wallDim).toBeDefined();
    expect(C.kerbDim).toBeDefined();
    expect(C.foundationDim).toBeDefined();
  });

  it("has badge color", () => {
    expect(C.badge).toBeDefined();
  });
});
