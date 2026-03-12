// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — canvasRenderers.ts
// Badge and indicator rendering for shapes
// ══════════════════════════════════════════════════════════════

import { Shape, labelAnchorInsidePolygon, C, toPixels, Point, polylineMidpointAndAngle, polylineLengthMeters, areaM2 } from "./geometry";
import { getEffectivePolygon } from "./arcMath";
import { computeThickPolyline, getPathPolygon, getPolygonLinearOutline, isLinearElement, isPathElement } from "./linearElements";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

/** Font size scaled by zoom, clamped to [8, 18] for readable labels at any zoom level. */
export function scaledFontSize(baseFontSize: number, zoom: number): number {
  return Math.max(8, Math.min(18, baseFontSize * zoom));
}

// Layer colors for excavation breakdown (tape1, sand, mortar, slab, etc.)
const EXCAVATION_LAYER_COLORS: Record<string, string> = {
  tape1: "#8B7355",
  sand: "#D4B483",
  mortar: "#9E9E9E",
  slab: "#5D5D5D",
  monoBlocks: "#5D5D5D",
  soil: "#7D6E5C",
  grassRoll: "#4CAF50",
  soilExcess: "#A0522D",
  foundation: "#3F51B5",
};

export function getTypeBadgeText(calculatorType: string | undefined): string {
  if (!calculatorType) return "?";
  const map: Record<string, string> = {
    slab: "SL",
    concreteSlabs: "CS",
    paving: "PV",
    grass: "AG",
    deck: "DK",
    turf: "TF",
    steps: "ST",
    fence: "FC",
    wall: "WL",
    kerbs: "KB",
    foundation: "FD",
  };
  return map[calculatorType] ?? calculatorType.slice(0, 2).toUpperCase();
}

/** Build rich label for path elements: slab dims, length, width, area, full/cut counts. */
export function getPathLabel(shape: Shape): string {
  const inp = shape.calculatorInputs ?? {};
  const pathCenterline = inp.pathCenterline as Point[] | undefined;
  const outline = inp.pathIsOutline ? shape.points : getEffectivePolygon(shape);
  const parts: string[] = [];
  const w = Number(inp.vizSlabWidth);
  const l = Number(inp.vizSlabLength);
  if (w && l) parts.push(`${w}×${l} cm`);
  if (pathCenterline && pathCenterline.length >= 2) {
    const lenM = polylineLengthMeters(pathCenterline);
    parts.push(`${lenM.toFixed(2)} m`);
  }
  if (outline.length >= 3) {
    const area = areaM2(outline);
    parts.push(`${area.toFixed(2)} m²`);
    const pathCenterline2 = inp.pathCenterline as Point[] | undefined;
    if (pathCenterline2 && pathCenterline2.length >= 2 && area > 0.0001) {
      const lenM = polylineLengthMeters(pathCenterline2);
      const widthM = lenM > 0 ? area / lenM : 0;
      if (widthM > 0) parts.push(`szer. ${(widthM * 100).toFixed(0)} cm`);
    }
  }
  const full = inp.vizFullSlabCount;
  const cut = inp.cutSlabs != null ? Number(inp.cutSlabs) : undefined;
  if (typeof full === "number" || typeof cut === "number") {
    parts.push(`${full ?? 0} full, ${cut ?? 0} cut`);
  }
  return parts.length > 0 ? parts.join(" · ") : (shape.label || "Path");
}

export function getTypeBadgeColor(calculatorType: string | undefined): string {
  if (!calculatorType) return C.textDim;
  const map: Record<string, string> = {
    slab: "#3498db",
    concreteSlabs: "#6b7280",
    paving: "#9b59b6",
    grass: "#27ae60",
    deck: "#8b4513",
    turf: "#2ecc71",
    steps: "#e74c3c",
    fence: C.fence,
    wall: C.wall,
    kerbs: C.kerb,
    foundation: C.foundation,
  };
  return map[calculatorType] ?? C.accent;
}

export function drawShapeBadge(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen
): void {
  if (shape.layer !== 2) return;

  const pts = isPathElement(shape) ? getPathPolygon(shape) : getEffectivePolygon(shape);
  const anchor = pts.length >= 3 ? labelAnchorInsidePolygon(pts) : { x: shape.points[0]?.x ?? 0, y: shape.points[0]?.y ?? 0 };
  const sc = worldToScreen(anchor.x, anchor.y);

  const text = getTypeBadgeText(shape.calculatorType);
  const color = getTypeBadgeColor(shape.calculatorType);

  const pad = 6;
  const w = 28;
  const h = 16;
  const x = sc.x - w / 2;
  const y = sc.y - 24;

  ctx.fillStyle = C.badge;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  ctx.font = "bold 10px 'JetBrains Mono',monospace";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, sc.x, sc.y - 16);
}

/** Draw full object name in large font (like surface area) — replaces small badge for L2 shapes.
 * For linear elements (foundation, wall, fence, kerb) text is drawn along the polyline so the full label is visible.
 * Font and offsets scale with zoom so labels stay proportional to shapes. */
export function drawShapeObjectLabel(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  displayName: string,
  zoom: number
): void {
  if (shape.layer !== 2 || !displayName) return;

  const baseFontSize = 16;
  const scaledFont = scaledFontSize(baseFontSize, zoom);
  const lineHeight = scaledFont * 1.2;
  ctx.font = `bold ${scaledFont}px 'JetBrains Mono',monospace`;
  ctx.fillStyle = "#ffffff";

  if (isLinearElement(shape) && shape.points.length >= 2) {
    const ma = polylineMidpointAndAngle(shape.points);
    if (ma) {
      const sc = worldToScreen(ma.point.x, ma.point.y);
      ctx.save();
      ctx.translate(sc.x, sc.y);
      ctx.rotate(ma.angleRad);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(displayName, 0, 0);
      ctx.restore();
      return;
    }
  }

  if (isPathElement(shape)) {
    const pathCenterline = shape.calculatorInputs?.pathCenterline as { x: number; y: number }[] | undefined;
    if (pathCenterline && Array.isArray(pathCenterline) && pathCenterline.length >= 2) {
      const ma = polylineMidpointAndAngle(pathCenterline);
      if (ma) {
        const sc = worldToScreen(ma.point.x, ma.point.y);
        ctx.save();
        ctx.translate(sc.x, sc.y);
        ctx.rotate(ma.angleRad);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(displayName, 0, 0);
        ctx.restore();
        return;
      }
    }
  }

  const pts = isPathElement(shape) ? getPathPolygon(shape) : getEffectivePolygon(shape);
  const anchor = pts.length >= 3 ? labelAnchorInsidePolygon(pts) : { x: shape.points[0]?.x ?? 0, y: shape.points[0]?.y ?? 0 };
  const sc = worldToScreen(anchor.x, anchor.y);
  const offsetY = -lineHeight * 1.5;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(displayName, sc.x, sc.y + offsetY);
}

export interface ExcavationLayer {
  label: string;
  cm: number;
  pct: number;
  colorKey: string;
}

/** Get excavation layer breakdown from shape calculatorInputs. Returns [] for unsupported types. */
export function getExcavationBreakdown(shape: Shape): ExcavationLayer[] {
  const inp = shape.calculatorInputs ?? {};
  const layers: ExcavationLayer[] = [];

  const parse = (v: unknown): number => {
    const n = parseFloat(String(v ?? "0"));
    return isNaN(n) ? 0 : Math.max(0, n);
  };

  switch (shape.calculatorType) {
    case "slab": {
      const tape1 = parse(inp.tape1ThicknessCm);
      const mortar = parse(inp.mortarThicknessCm);
      const slab = parse(inp.slabThicknessCm) || 2; // from user input, default 2cm
      const excess = parse(inp.soilExcessCm);
      const total = tape1 + mortar + slab + excess;
      if (total <= 0) return [];
      if (slab > 0) layers.push({ label: "Płyty", cm: slab, pct: (slab / total) * 100, colorKey: "slab" });
      if (mortar > 0) layers.push({ label: "Zaprawa", cm: mortar, pct: (mortar / total) * 100, colorKey: "mortar" });
      if (tape1 > 0) layers.push({ label: "Tape1", cm: tape1, pct: (tape1 / total) * 100, colorKey: "tape1" });
      if (excess > 0) layers.push({ label: "Nadmiar", cm: excess, pct: (excess / total) * 100, colorKey: "soilExcess" });
      break;
    }
    case "concreteSlabs": {
      const tape1 = parse(inp.tape1ThicknessCm);
      const sand = parse(inp.sandThicknessCm);
      const slab = parse(inp.concreteSlabThicknessCm) || 6;
      const excess = parse(inp.soilExcessCm);
      const total = tape1 + sand + slab + excess;
      if (total <= 0) return [];
      if (slab > 0) layers.push({ label: "Płyty betonowe", cm: slab, pct: (slab / total) * 100, colorKey: "slab" });
      if (sand > 0) layers.push({ label: "Piasek", cm: sand, pct: (sand / total) * 100, colorKey: "sand" });
      if (tape1 > 0) layers.push({ label: "Tape1", cm: tape1, pct: (tape1 / total) * 100, colorKey: "tape1" });
      if (excess > 0) layers.push({ label: "Nadmiar", cm: excess, pct: (excess / total) * 100, colorKey: "soilExcess" });
      break;
    }
    case "paving": {
      const sand = parse(inp.sandThicknessCm);
      const tape1 = parse(inp.tape1ThicknessCm);
      const mono = parse(inp.monoBlocksHeightCm);
      const excess = parse(inp.soilExcessCm);
      const total = sand + tape1 + mono + excess;
      if (total <= 0) return [];
      if (mono > 0) layers.push({ label: "Kostka", cm: mono, pct: (mono / total) * 100, colorKey: "monoBlocks" });
      if (sand > 0) layers.push({ label: "Piasek", cm: sand, pct: (sand / total) * 100, colorKey: "sand" });
      if (tape1 > 0) layers.push({ label: "Tape1", cm: tape1, pct: (tape1 / total) * 100, colorKey: "tape1" });
      if (excess > 0) layers.push({ label: "Nadmiar", cm: excess, pct: (excess / total) * 100, colorKey: "soilExcess" });
      break;
    }
    case "grass": {
      const tape1 = parse(inp.tape1ThicknessCm);
      const sand = parse(inp.sandThicknessCm);
      const excess = parse(inp.soilExcessCm);
      const total = tape1 + sand + excess;
      if (total <= 0) return [];
      if (sand > 0) layers.push({ label: "Piasek", cm: sand, pct: (sand / total) * 100, colorKey: "sand" });
      if (tape1 > 0) layers.push({ label: "Tape1", cm: tape1, pct: (tape1 / total) * 100, colorKey: "tape1" });
      if (excess > 0) layers.push({ label: "Nadmiar", cm: excess, pct: (excess / total) * 100, colorKey: "soilExcess" });
      break;
    }
    case "turf": {
      const tape1 = parse(inp.tape1ThicknessCm);
      const soil = parse(inp.soilThicknessCm);
      const grassRoll = parse(inp.grassRollThicknessCm);
      const excess = parse(inp.soilExcessCm);
      const total = tape1 + soil + grassRoll + excess;
      if (total <= 0) return [];
      if (grassRoll > 0) layers.push({ label: "Rolka trawy", cm: grassRoll, pct: (grassRoll / total) * 100, colorKey: "grassRoll" });
      if (soil > 0) layers.push({ label: "Ziemia", cm: soil, pct: (soil / total) * 100, colorKey: "soil" });
      if (tape1 > 0) layers.push({ label: "Tape1", cm: tape1, pct: (tape1 / total) * 100, colorKey: "tape1" });
      if (excess > 0) layers.push({ label: "Nadmiar", cm: excess, pct: (excess / total) * 100, colorKey: "soilExcess" });
      break;
    }
    case "foundation": {
      const depth = parse(inp.depth ?? inp.depthCm);
      if (depth <= 0) return [];
      layers.push({ label: "Fundament", cm: depth, pct: 100, colorKey: "foundation" });
      break;
    }
    default:
      return [];
  }

  return layers;
}

/** Get polygon points for shape (for wall/kerb/foundation/path: thick polyline outline or stored polygon). */
function getShapePolygon(shape: Shape): Point[] {
  if (shape.elementType === "wall" || shape.elementType === "kerb" || shape.elementType === "foundation") {
    const outline = getPolygonLinearOutline(shape);
    if (outline.length >= 3) return outline;
  }
  if (shape.elementType === "pathSlabs" || shape.elementType === "pathMonoblock" || shape.elementType === "pathConcreteSlabs") {
    return getPathPolygon(shape);
  }
  return shape.points;
}

/** Draw excavation layers as horizontal bands inside polygon (Layer 4 Preparation view). */
export function drawExcavationLayers(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen
): void {
  const layers = getExcavationBreakdown(shape);
  if (layers.length === 0) return;

  const pts = getShapePolygon(shape);
  if (pts.length < 3) return;

  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const height = maxY - minY;
  if (height < 0.001) return;

  ctx.save();

  // Clip to polygon
  ctx.beginPath();
  const s0 = worldToScreen(pts[0].x, pts[0].y);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < pts.length; i++) {
    const s = worldToScreen(pts[i].x, pts[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.clip();

  // Draw bands from bottom to top (minY = bottom)
  let yAcc = minY;
  for (const layer of layers) {
    const bandHeight = height * (layer.pct / 100);
    const yTop = yAcc + bandHeight;

    const sBL = worldToScreen(minX, yAcc);
    const sBR = worldToScreen(maxX, yAcc);
    const sTL = worldToScreen(minX, yTop);
    const sTR = worldToScreen(maxX, yTop);
    const bandHeightPx = Math.abs(sTR.y - sBL.y);
    const bandWidthPx = Math.abs(sBR.x - sBL.x);
    if (bandHeightPx < 1) { yAcc = yTop; continue; }

    ctx.fillStyle = EXCAVATION_LAYER_COLORS[layer.colorKey] ?? C.textDim;
    ctx.fillRect(sBL.x, Math.min(sBL.y, sTR.y), bandWidthPx, bandHeightPx);

    // Label (compact)
    const midY = (yAcc + yTop) / 2;
    const sMid = worldToScreen((minX + maxX) / 2, midY);
    ctx.font = "10px 'JetBrains Mono',monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${layer.label} ${layer.pct.toFixed(0)}%`, sMid.x, sMid.y);

    yAcc = yTop;
  }

  ctx.restore();
}
