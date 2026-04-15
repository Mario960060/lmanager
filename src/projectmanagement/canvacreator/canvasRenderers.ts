// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — canvasRenderers.ts
// Badge and indicator rendering for shapes
// ══════════════════════════════════════════════════════════════

import { Shape, labelAnchorInsidePolygon, C, polylineMidpointAndAngle } from "./geometry";
import { getEffectivePolygon } from "./arcMath";
import { getPathPolygon, isLinearElement, isPathElement } from "./linearElements";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

/** Font size scaled by zoom, clamped to [8, 18] for readable labels at any zoom level. */
export function scaledFontSize(baseFontSize: number, zoom: number): number {
  return Math.max(8, Math.min(18, baseFontSize * zoom));
}

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

/** Path object name; pattern layer (L3) draws slab/block stats inside the footprint (see slabPattern). */
export function getPathLabel(shape: Shape): string {
  return (shape.label ?? "").trim();
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
  zoom: number,
  labelFill: string = "#ffffff",
): void {
  if (shape.layer !== 2 || !displayName) return;

  const baseFontSize = 16;
  const scaledFont = scaledFontSize(baseFontSize, zoom);
  const lineHeight = scaledFont * 1.2;
  ctx.font = `bold ${scaledFont}px 'JetBrains Mono',monospace`;
  ctx.fillStyle = labelFill;

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
    const outline = getPathPolygon(shape);
    if (shape.closed && outline.length >= 3) {
      const anchor = labelAnchorInsidePolygon(outline);
      const sc = worldToScreen(anchor.x, anchor.y);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(displayName, sc.x, sc.y - lineHeight * 0.12);
      return;
    }
    const pathCenterline = shape.calculatorInputs?.pathCenterline as { x: number; y: number }[] | undefined;
    const centerlinePts =
      pathCenterline && pathCenterline.length >= 2
        ? pathCenterline
        : shape.points.length >= 2
          ? shape.points
          : null;
    if (centerlinePts) {
      const ma = polylineMidpointAndAngle(centerlinePts);
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
    case "decorativeStones": {
      const decorative = parse(inp.decorativeDepthCm);
      const sub = inp.addSubBase === true || inp.addSubBase === "true";
      const tape1 = sub ? parse(inp.tape1ThicknessCm) : 0;
      const total = tape1 + decorative;
      if (total <= 0) return [];
      if (decorative > 0) {
        layers.push({
          label: "Kamień dekor.",
          cm: decorative,
          pct: (decorative / total) * 100,
          colorKey: "monoBlocks",
        });
      }
      if (tape1 > 0) {
        layers.push({ label: "Tape1", cm: tape1, pct: (tape1 / total) * 100, colorKey: "tape1" });
      }
      break;
    }
    default:
      return [];
  }

  return layers;
}
