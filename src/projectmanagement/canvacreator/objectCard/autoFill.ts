// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — objectCard/autoFill.ts
// Canvas geometry -> calculator input mapping
// ══════════════════════════════════════════════════════════════

import { Shape, areaM2, distance, toMeters, polylineLengthMeters, toPixels } from "../geometry";
import { AutoFillData } from "../types";
import { getEffectivePolygon, calcEdgeLengthWithArcs } from "../arcMath";
import { getPathPolygon, isPolygonLinearElement, getPolygonLinearOutline, polygonToSegmentLengths, isPolygonLinearStripOutline } from "../linearElements";
import { getSurfacePolygonWithFenceCutouts } from "../adjustmentLogic";

export function computeAutoFill(shape: Shape, allShapes?: Shape[]): AutoFillData {
  const pts = shape.points;

  if (shape.elementType === "pathSlabs" || shape.elementType === "pathConcreteSlabs" || shape.elementType === "pathMonoblock") {
    // Path element — polygon outline (converted) or computed from center line
    const outline = getPathPolygon(shape);
    let area = 0;
    if (outline.length >= 3) {
      if (allShapes?.length) {
        const withCutouts = getSurfacePolygonWithFenceCutouts(shape, allShapes);
        area = withCutouts.reduce((sum, p) => sum + areaM2(p), 0);
      } else {
        area = areaM2(outline);
      }
    }
    const edgeLengthsM: number[] = [];
    const n = outline.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      edgeLengthsM.push(toMeters(distance(outline[i], outline[j])));
    }
    const perimeterM = edgeLengthsM.reduce((a, b) => a + b, 0);
    return {
      areaM2: area,
      totalLengthM: shape.calculatorInputs?.pathIsOutline ? perimeterM : polylineLengthMeters(pts),
      edgeLengthsM,
      segmentCount: shape.calculatorInputs?.pathIsOutline ? n : pts.length - 1,
      cornerCount: shape.calculatorInputs?.pathIsOutline ? n : Math.max(0, pts.length - 2),
    };
  }

  if (shape.elementType !== "polygon") {
    // Linear element — wall/kerb/foundation may be stored as polygon (closed)
    if (isPolygonLinearElement(shape) && (isPolygonLinearStripOutline(shape) || (shape.closed && pts.length >= 3))) {
      const edgeLengthsM = polygonToSegmentLengths(pts);
      const totalLengthM = edgeLengthsM.reduce((a, b) => a + b, 0);
      return {
        totalLengthM,
        edgeLengthsM,
        segmentCount: edgeLengthsM.length,
        cornerCount: Math.max(0, edgeLengthsM.length - 1),
      };
    }
    const totalLengthM = polylineLengthMeters(pts);
    const edgeLengthsM: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      edgeLengthsM.push(toMeters(distance(pts[i], pts[i + 1])));
    }
    return {
      totalLengthM,
      edgeLengthsM,
      segmentCount: pts.length - 1,
      cornerCount: Math.max(0, pts.length - 2),
    };
  }

  // Polygon element — use effective polygon (with arcs) for area and extent
  const effectivePts = shape.closed && pts.length >= 3 ? getEffectivePolygon(shape) : pts;
  let area = 0;
  if (shape.closed && pts.length >= 3) {
    if (allShapes?.length && (shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs" || shape.calculatorType === "paving" || shape.calculatorType === "grass" || shape.calculatorType === "turf" || shape.calculatorType === "deck" || shape.calculatorType === "decorativeStones")) {
      const withCutouts = getSurfacePolygonWithFenceCutouts(shape, allShapes);
      area = withCutouts.reduce((sum, p) => sum + areaM2(p), 0);
    } else {
      area = areaM2(effectivePts);
    }
  }
  let perimeter = 0;
  const edgeLengthsM: number[] = [];
  const edgeCount = shape.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const j = (i + 1) % pts.length;
    const len = toMeters(calcEdgeLengthWithArcs(pts[i], pts[j], shape.edgeArcs?.[i]));
    edgeLengthsM.push(len);
    perimeter += len;
  }

  // Bounding box in meters (from effective polygon)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of effectivePts) {
    const mx = toMeters(p.x), my = toMeters(p.y);
    if (mx < minX) minX = mx; if (mx > maxX) maxX = mx;
    if (my < minY) minY = my; if (my > maxY) maxY = my;
  }

  return {
    areaM2: area,
    perimeterM: perimeter,
    edgeLengthsM,
    boundingBoxLengthM: maxX - minX,
    boundingBoxWidthM: maxY - minY,
    segmentCount: edgeCount,
    cornerCount: pts.length,
  };
}
