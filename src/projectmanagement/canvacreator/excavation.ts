// ══════════════════════════════════════════════════════════════
// Excavation / preparation (cm from datum 0) — defaults from calculators
// ══════════════════════════════════════════════════════════════

import { Shape } from "./geometry";
import { getExcavationBreakdown } from "./canvasRenderers";

const parseCm = (v: unknown): number => {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? 0 : Math.max(0, n);
};

/** Total excavation depth (cm, negative), sum of all breakdown layers — flat per element by default. */
export function getDefaultExcavationDepthCm(shape: Shape): number | null {
  const layers = getExcavationBreakdown(shape);
  if (layers.length === 0) return null;
  const sum = layers.reduce((s, l) => s + l.cm, 0);
  return sum > 0 ? -sum : null;
}

/** L2 geodesy height at vertex in cm — shifts excavation/preparation relative to plan datum (same as user: default −15 cm + 40 cm height ⇒ +25 cm). */
export function geodesyHeightOffsetCmAtVertex(shape: Shape, vertexIdx: number): number {
  const h = shape.heights?.[vertexIdx];
  if (h == null || Number.isNaN(h)) return 0;
  return h * 100;
}

/**
 * Top of tape1 layer (cm from finished surface = 0): 0 minus layers above tape1.
 * Excludes soilExcess from the "above tape1" stack (not part of structural build-up to tape top).
 */
export function getDefaultTape1TopLevelCm(shape: Shape): number | null {
  const inp = shape.calculatorInputs ?? {};
  const t = shape.calculatorType;

  switch (t) {
    case "slab": {
      const slab = parseCm(inp.slabThicknessCm) || 2;
      const mortar = parseCm(inp.mortarThicknessCm);
      return -(slab + mortar);
    }
    case "concreteSlabs": {
      const slab = parseCm(inp.concreteSlabThicknessCm) || 6;
      const sand = parseCm(inp.sandThicknessCm);
      return -(slab + sand);
    }
    case "paving": {
      const mono = parseCm(inp.monoBlocksHeightCm);
      const sand = parseCm(inp.sandThicknessCm);
      return -(mono + sand);
    }
    case "grass": {
      const sand = parseCm(inp.sandThicknessCm);
      return sand > 0 ? -sand : null;
    }
    case "turf": {
      const roll = parseCm(inp.grassRollThicknessCm);
      const soil = parseCm(inp.soilThicknessCm);
      return -(roll + soil);
    }
    case "decorativeStones": {
      const decorative = parseCm(inp.decorativeDepthCm);
      return decorative > 0 ? -decorative : null;
    }
    case "foundation":
      return null;
    default:
      return null;
  }
}

/**
 * Per-vertex excavation (cm from datum). If `excavationCm[i]` is set → manual override.
 * Otherwise: calculator default + geodesy height at vertex (m→cm), so L4 updates when L2 heights change.
 */
export function getExcavationCmAtVertex(shape: Shape, vertexIdx: number): number | null {
  const d = shape.excavationCm;
  if (d && d.length > vertexIdx && d[vertexIdx] != null && !Number.isNaN(d[vertexIdx]!)) {
    return d[vertexIdx]!;
  }
  const base = getDefaultExcavationDepthCm(shape);
  if (base == null) return null;
  return base + geodesyHeightOffsetCmAtVertex(shape, vertexIdx);
}

/**
 * Per-vertex tape1 top (cm from datum). If `preparationCm[i]` is set → manual override.
 * Otherwise: calculator default + geodesy height at vertex (m→cm).
 */
export function getPreparationCmAtVertex(shape: Shape, vertexIdx: number): number | null {
  const d = shape.preparationCm;
  if (d && d.length > vertexIdx && d[vertexIdx] != null && !Number.isNaN(d[vertexIdx]!)) {
    return d[vertexIdx]!;
  }
  const base = getDefaultTape1TopLevelCm(shape);
  if (base == null) return null;
  return base + geodesyHeightOffsetCmAtVertex(shape, vertexIdx);
}

/** Etykieta głębokości zakopania (roboty ziemne liniowe) — wartość bezwzględna w cm, bez odniesienia do zera geodezyjnego. */
export function formatGroundworkBurialLabel(depthM: number): string {
  const cm = Math.round(depthM * 100 * 2) / 2;
  const body = cm % 1 === 0 ? String(cm) : cm.toFixed(1);
  return `${body} cm`;
}

/** Display label — tylko całości lub połówki cm: +24 cm, +24.5 cm (jak geodezja). */
export function formatCmLabel(cm: number): string {
  const rounded = Math.round(cm * 2) / 2;
  const sign = rounded >= 0 ? "+" : "-";
  const absR = Math.abs(rounded);
  const body = absR % 1 === 0 ? String(absR) : absR.toFixed(1);
  return `${sign}${body} cm`;
}

export function computeGlobalCmRange(
  shapes: Shape[],
  mode: "excavation" | "preparation",
  filter: (s: Shape) => boolean,
): { min: number; max: number } {
  let minV = Infinity;
  let maxV = -Infinity;
  for (const shape of shapes) {
    if (!filter(shape) || !shape.closed || shape.points.length < 3) continue;
    const n = shape.points.length;
    for (let i = 0; i < n; i++) {
      const v =
        mode === "excavation" ? getExcavationCmAtVertex(shape, i) : getPreparationCmAtVertex(shape, i);
      if (v == null) continue;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  }
  if (minV === Infinity) minV = 0;
  if (maxV === -Infinity) maxV = 0;
  return { min: minV, max: maxV };
}
