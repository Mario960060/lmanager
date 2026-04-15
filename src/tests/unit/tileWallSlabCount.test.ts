import { describe, it, expect } from "vitest";
import {
  countSlabsTrapezoidColumnwise,
  countSlabsRectangularSegment,
  countSlabsWallSegmentMeters,
  countTrapezoidWholeVsCut,
} from "../../lib/tileWallSlabCount";

/** Joint 2 mm → 0.2 cm (same as selectedGap 2 / 10 in TileInstallationCalculator). */
const GAP_CM = 0.2;

/** Tier panels: no joint — same formulas as tiles with gap 0 (TileInstallationCalculator tier_panels). */
const GAP_ZERO = 0;

describe("tileWallSlabCount", () => {
  describe("gap = 0 (tier panels — same grid math as tiles, zero joint)", () => {
    it("rectangular: 1 m × 1 m, 52×17 cm panels → ceil(100/52)×ceil(100/17)=2×6=12", () => {
      const n = countSlabsRectangularSegment(100, 100, 52, 17, GAP_ZERO);
      expect(n).toBe(12);
    });

    it("trapezoid with h0===h1 matches rectangular count (gap 0)", () => {
      const lenCm = 300;
      const hCm = 200;
      const rect = countSlabsRectangularSegment(lenCm, hCm, 44, 22, GAP_ZERO);
      const trap = countSlabsTrapezoidColumnwise(lenCm, hCm, hCm, 44, 22, GAP_ZERO);
      expect(trap).toBe(rect);
    });

    it("whole/cut split equals trapezoid total when gap 0", () => {
      const lenCm = 100;
      const h0 = 100;
      const h1 = 200;
      const total = countSlabsTrapezoidColumnwise(lenCm, h0, h1, 52, 17, GAP_ZERO);
      const split = countTrapezoidWholeVsCut(lenCm, h0, h1, 52, 17, GAP_ZERO);
      expect(split.total).toBe(total);
    });
  });

  describe("countSlabsRectangularSegment", () => {
    it("1 m × 1 m wall, 60×60 cm slabs, 2 mm gap → 2×2 = 4 slabs", () => {
      const lenCm = 100;
      const hCm = 100;
      const n = countSlabsRectangularSegment(lenCm, hCm, 60, 60, GAP_CM);
      // ceil((100+0.2)/(60+0.2)) = ceil(1.664) = 2
      expect(n).toBe(4);
    });
  });

  describe("countSlabsTrapezoidColumnwise — matches rectangle when h0 === h1", () => {
    it("flat top: trapezoid path equals rectangular grid", () => {
      const lenCm = 100;
      const hCm = 100;
      const rect = countSlabsRectangularSegment(lenCm, hCm, 60, 60, GAP_CM);
      const trap = countSlabsTrapezoidColumnwise(lenCm, hCm, hCm, 60, 60, GAP_CM);
      expect(trap).toBe(rect);
    });

    it("90×60 slab orientation as width×height on wall (same check)", () => {
      const lenCm = 300;
      const hCm = 200;
      const rect = countSlabsRectangularSegment(lenCm, hCm, 90, 60, GAP_CM);
      const trap = countSlabsTrapezoidColumnwise(lenCm, hCm, hCm, 90, 60, GAP_CM);
      expect(trap).toBe(rect);
    });
  });

  describe("countSlabsTrapezoidColumnwise — slope", () => {
    it("returns 0 for non-positive length", () => {
      expect(countSlabsTrapezoidColumnwise(0, 100, 200, 60, 60, GAP_CM)).toBe(0);
      expect(countSlabsTrapezoidColumnwise(-10, 100, 200, 60, 60, GAP_CM)).toBe(0);
    });

    it("1 m length, 1 m → 2 m height, 60×60 cm: hand-checked column sum", () => {
      // L=100 cm, h(0)=100, h(100)=200, gap 0.2 cm, step=60.2 → sL=2 columns.
      // k=0: x=min(100, 30)=30 → h=130 cm → rows=ceil(130.2/60.2)=3
      // k=1: x=min(100, 90.2)=90.2 → h=190.2 → rows=ceil(190.4/60.2)=4
      // total=7 (differs from rectangle with average height 150 cm → 2×3=6)
      const n = countSlabsTrapezoidColumnwise(100, 100, 200, 60, 60, GAP_CM);
      expect(n).toBe(7);
    });

    it("sloped wall needs at least as many slabs as rectangle at min height (lower bound)", () => {
      const lenCm = 100;
      const h0 = 100;
      const h1 = 200;
      const minH = Math.min(h0, h1);
      const minRect = countSlabsRectangularSegment(lenCm, minH, 60, 60, GAP_CM);
      const trap = countSlabsTrapezoidColumnwise(lenCm, h0, h1, 60, 60, GAP_CM);
      expect(trap).toBeGreaterThanOrEqual(minRect);
    });

    it("whole + cut classification matches column slab total", () => {
      const lenCm = 100;
      const h0 = 100;
      const h1 = 200;
      const total = countSlabsTrapezoidColumnwise(lenCm, h0, h1, 60, 60, GAP_CM);
      const split = countTrapezoidWholeVsCut(lenCm, h0, h1, 60, 60, GAP_CM);
      expect(split.total).toBe(total);
      expect(split.whole + split.cut).toBe(total);
    });

    it("differs from naive rectangle using average height (1 m→2 m vs 1.5 m avg)", () => {
      const lenCm = 100;
      const h0 = 100;
      const h1 = 200;
      const avgH = (h0 + h1) / 2;
      const naiveAvg = countSlabsRectangularSegment(lenCm, avgH, 60, 60, GAP_CM);
      const trap = countSlabsTrapezoidColumnwise(lenCm, h0, h1, 60, 60, GAP_CM);
      expect(naiveAvg).toBe(6);
      expect(trap).toBe(7);
    });
  });

  describe("countSlabsWallSegmentMeters — API matches calculator slabsPerSegment", () => {
    it("constant height uses rectangular formula", () => {
      const n = countSlabsWallSegmentMeters(1, 1, 1, 60, 60, GAP_CM);
      expect(n).toBe(
        countSlabsRectangularSegment(100, 100, 60, 60, GAP_CM)
      );
    });

    it("slope uses trapezoid path", () => {
      expect(countSlabsWallSegmentMeters(1, 1, 2, 60, 60, GAP_CM)).toBe(7);
    });

    it("sum of two segments equals manual sum", () => {
      const a = countSlabsWallSegmentMeters(1, 1, 1, 60, 60, GAP_CM);
      const b = countSlabsWallSegmentMeters(1, 1, 2, 60, 60, GAP_CM);
      expect(a + b).toBe(4 + 7);
    });
  });
});
