import { describe, it, expect } from "vitest";
import {
  arcPointToWorldOnCurve,
  worldToArcPointOnCurve,
  validateArcPointRoundtrip,
} from "../../../projectmanagement/canvacreator/arcMath";
import type { Point } from "../../../projectmanagement/canvacreator/geometry";
import type { ArcPoint } from "../../../projectmanagement/canvacreator/geometry";

// ── Forward/inverse roundtrip validation ──────────────────────

describe("arcMath: worldToArcPointOnCurve / arcPointToWorldOnCurve", () => {
  const A: Point = { x: 0, y: 0 };
  const B: Point = { x: 200, y: 0 };

  it("roundtrip: arcPoint → world → arcPoint → world gives same point (< 0.01px)", () => {
    const arcPoints: ArcPoint[] = [
      { id: "a1", t: 0.5, offset: 50 },
      { id: "a2", t: 0.25, offset: 20 },
    ];
    const arcPoint = arcPoints[0]!;

    const result = validateArcPointRoundtrip(A, B, arcPoints, arcPoint, 0.01);
    expect(result.ok).toBe(true);
    expect(result.error).toBeLessThan(0.01);
  });

  it("roundtrip for strongly curved arc (large offset)", () => {
    const arcPoints: ArcPoint[] = [{ id: "a1", t: 0.5, offset: 80 }];
    const arcPoint = arcPoints[0]!;

    const result = validateArcPointRoundtrip(A, B, arcPoints, arcPoint, 0.01);
    expect(result.ok).toBe(true);
    expect(result.error).toBeLessThan(0.01);
  });

  it("roundtrip for arc near edge (t=0.1)", () => {
    const arcPoints: ArcPoint[] = [{ id: "a1", t: 0.1, offset: 30 }];
    const arcPoint = arcPoints[0]!;

    const result = validateArcPointRoundtrip(A, B, arcPoints, arcPoint, 0.01);
    expect(result.ok).toBe(true);
    expect(result.error).toBeLessThan(0.01);
  });

  it("roundtrip for multiple arcpoints", () => {
    const arcPoints: ArcPoint[] = [
      { id: "a1", t: 0.2, offset: 40 },
      { id: "a2", t: 0.5, offset: -30 },
      { id: "a3", t: 0.8, offset: 25 },
    ];
    for (const ap of arcPoints) {
      const result = validateArcPointRoundtrip(A, B, arcPoints, ap, 0.01);
      expect(result.ok).toBe(true);
      expect(result.error).toBeLessThan(0.01);
    }
  });
});
