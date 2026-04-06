// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — preparationLogic.ts
// Excavation/fill calculations for Layer 4 Preparation
// ══════════════════════════════════════════════════════════════

import { Shape, Point, pointInPolygon, toPixels, toMeters, areaM2, projectOntoSegment } from "./geometry";
import { getEffectivePolygon } from "./arcMath";
import { getExcavationBreakdown } from "./canvasRenderers";
import { buildHeightInterpolationCache, interpolateHeightCached, interpolateHeightAtPoint } from "./geodesy";
import { computeThickPolyline, getPathPolygon, getPolygonLinearOutline, polygonToCenterline, isPolygonLinearElement, isPolygonLinearStripOutline } from "./linearElements";

const GRID_SIZE = 20;
const SUPPORTED_CALC_TYPES = ["slab", "concreteSlabs", "paving", "grass", "turf", "decorativeStones", "foundation"] as const;

// Soil densities t/m³ (plan: clay 1.5, sand 1.6, rock 2.2)
const SOIL_DENSITY: Record<string, number> = {
  clay: 1.5,
  sand: 1.6,
  rock: 2.2,
};

// Leveling material density t/m³
const LEVELING_DENSITY: Record<string, number> = {
  tape1: 2.1,
  soil: 1.5,
};

export interface PreparationValidation {
  ok: boolean;
  elementsWithoutHeights?: string[];
}

export interface ElementPreparationResult {
  shapeIdx: number;
  label: string;
  calculatorType: string;
  excavationM3: number;
  fillM3: number;
  excavationTonnes: number;
  fillTonnes: number;
  pctAreaNeedingFill: number;
  areaM2: number;
}

export interface PreparationResult {
  validation: PreparationValidation;
  elements: ElementPreparationResult[];
  totalExcavationM3: number;
  totalFillM3: number;
  totalExcavationTonnes: number;
  totalFillTonnes: number;
}

function getShapePolygon(shape: Shape): Point[] {
  if (shape.elementType === "wall" || shape.elementType === "kerb" || shape.elementType === "foundation") {
    const outline = getPolygonLinearOutline(shape);
    if (outline.length >= 3) return outline;
  }
  if (shape.elementType === "pathSlabs" || shape.elementType === "pathConcreteSlabs" || shape.elementType === "pathMonoblock") {
    return getPathPolygon(shape);
  }
  return shape.closed && shape.edgeArcs?.some(a => a && a.length > 0)
    ? getEffectivePolygon(shape)
    : shape.points;
}

function getExcavationDepthCm(shape: Shape): number {
  const layers = getExcavationBreakdown(shape);
  return layers.reduce((sum, l) => sum + l.cm, 0);
}

/** Interpolate surface height at pt for element. For foundation: project onto polyline/centerline and interpolate. */
function getElementSurfaceHeightM(shape: Shape, pt: Point): number | null {
  if (shape.elementType === "foundation") {
    let pts: Point[];
    let heights: number[];
    if (isPolygonLinearElement(shape) && (isPolygonLinearStripOutline(shape) || (shape.closed && shape.points.length >= 3))) {
      pts = polygonToCenterline(shape.points);
      heights = shape.heights ?? pts.map(() => 0);
    } else {
      pts = shape.points;
      heights = shape.heights ?? pts.map(() => 0);
    }
    if (pts.length < 2) return heights[0] ?? 0;
    let bestT = 0;
    let bestDist = Infinity;
    let bestI = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const proj = projectOntoSegment(pt, pts[i], pts[i + 1]);
      if (proj.dist < bestDist) {
        bestDist = proj.dist;
        bestT = proj.t;
        bestI = i;
      }
    }
    const hA = heights[bestI] ?? 0;
    const hB = heights[bestI + 1] ?? 0;
    return hA + bestT * (hB - hA);
  }
  return interpolateHeightAtPoint(shape, pt);
}

function validatePreparation(shapes: Shape[]): PreparationValidation {
  const gardenShapes = shapes.filter(s => s.layer === 1 && s.closed && s.points.length >= 3);
  // Garden needs at least one shape; heights can be 0 (flat terrain)

  const elements = shapes.filter(
    s => s.layer === 2 && SUPPORTED_CALC_TYPES.includes(s.calculatorType as any)
  );
  const withoutHeights: string[] = [];
  for (const el of elements) {
    const hasHeights = (el.heights?.length ?? 0) > 0 || (el.heightPoints?.length ?? 0) > 0;
    if (!hasHeights && el.elementType === "polygon") {
      withoutHeights.push(el.label || `Element ${el.calculatorType}`);
    }
  }
  if (withoutHeights.length > 0) {
    return { ok: false, elementsWithoutHeights: withoutHeights };
  }
  return { ok: true };
}

export function computePreparation(
  shapes: Shape[],
  soilType: "clay" | "sand" | "rock",
  levelingMaterial: "tape1" | "soil"
): PreparationResult {
  const validation = validatePreparation(shapes);
  const elements: ElementPreparationResult[] = [];
  let totalExcavationM3 = 0;
  let totalFillM3 = 0;
  let totalExcavationTonnes = 0;
  let totalFillTonnes = 0;

  if (!validation.ok) {
    return {
      validation,
      elements: [],
      totalExcavationM3: 0,
      totalFillM3: 0,
      totalExcavationTonnes: 0,
      totalFillTonnes: 0,
    };
  }

  const gardenShapes = shapes.filter(s => s.layer === 1 && s.closed && s.points.length >= 3);
  if (gardenShapes.length === 0) {
    return {
      validation: { ok: true },
      elements: [],
      totalExcavationM3: 0,
      totalFillM3: 0,
      totalExcavationTonnes: 0,
      totalFillTonnes: 0,
    };
  }

  const gardenCaches = gardenShapes
    .map(s => buildHeightInterpolationCache(s))
    .filter((c): c is NonNullable<typeof c> => c != null);

  const elementShapes = shapes.filter(
    s => s.layer === 2 && SUPPORTED_CALC_TYPES.includes(s.calculatorType as any)
  );

  const soilDensity = SOIL_DENSITY[soilType] ?? 1.5;
  const fillDensity = LEVELING_DENSITY[levelingMaterial] ?? 2.1;

  for (let si = 0; si < shapes.length; si++) {
    const shape = shapes[si];
    if (shape.layer !== 2 || !SUPPORTED_CALC_TYPES.includes(shape.calculatorType as any)) continue;

    const polygon = getShapePolygon(shape);
    if (polygon.length < 3) continue;

    const excavationDepthCm = getExcavationDepthCm(shape);
    if (excavationDepthCm <= 0) continue;

    const excavationDepthM = excavationDepthCm / 100;

    let minX = polygon[0].x, maxX = polygon[0].x, minY = polygon[0].y, maxY = polygon[0].y;
    for (const p of polygon) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const w = maxX - minX, h = maxY - minY;
    if (w < 1 || h < 1) continue;

    let excavationVol = 0;
    let fillVol = 0;
    let fillCount = 0;
    let totalCount = 0;

    for (let gi = 0; gi < GRID_SIZE; gi++) {
      for (let gj = 0; gj < GRID_SIZE; gj++) {
        const cx = minX + (w * (gi + 0.5)) / GRID_SIZE;
        const cy = minY + (h * (gj + 0.5)) / GRID_SIZE;
        const pt = { x: cx, y: cy };
        if (!pointInPolygon(pt, polygon)) continue;

        const gardenShape = gardenShapes.find(g => pointInPolygon(pt, g.points));
        if (!gardenShape) continue;

        const cache = gardenCaches[gardenShapes.indexOf(gardenShape)];
        const terrainH = cache ? interpolateHeightCached(cache, pt) : null;
        if (terrainH === null) continue;

        const surfaceH = getElementSurfaceHeightM(shape, pt);
        if (surfaceH === null) continue;

        const targetBottomH = surfaceH - excavationDepthM;
        const diff = terrainH - targetBottomH;

        const cellAreaM2 = (toMeters(w) / GRID_SIZE) * (toMeters(h) / GRID_SIZE);
        totalCount++;

        if (diff > 0) {
          excavationVol += diff * cellAreaM2;
        } else if (diff < 0) {
          fillVol += Math.abs(diff) * cellAreaM2;
          fillCount++;
        }
      }
    }

    const areaM2Val = areaM2(polygon);
    const pctFill = totalCount > 0 ? (fillCount / totalCount) * 100 : 0;
    const excavationTonnes = excavationVol * soilDensity;
    const fillTonnes = fillVol * fillDensity;

    elements.push({
      shapeIdx: si,
      label: shape.label || shape.calculatorType || "Element",
      calculatorType: shape.calculatorType || "",
      excavationM3: Math.round(excavationVol * 1000) / 1000,
      fillM3: Math.round(fillVol * 1000) / 1000,
      excavationTonnes: Math.round(excavationTonnes * 1000) / 1000,
      fillTonnes: Math.round(fillTonnes * 1000) / 1000,
      pctAreaNeedingFill: Math.round(pctFill * 10) / 10,
      areaM2: Math.round(areaM2Val * 100) / 100,
    });

    totalExcavationM3 += excavationVol;
    totalFillM3 += fillVol;
    totalExcavationTonnes += excavationTonnes;
    totalFillTonnes += fillTonnes;
  }

  return {
    validation: { ok: true },
    elements,
    totalExcavationM3: Math.round(totalExcavationM3 * 1000) / 1000,
    totalFillM3: Math.round(totalFillM3 * 1000) / 1000,
    totalExcavationTonnes: Math.round(totalExcavationTonnes * 1000) / 1000,
    totalFillTonnes: Math.round(totalFillTonnes * 1000) / 1000,
  };
}
