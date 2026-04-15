// ══════════════════════════════════════════════════════════════
// Wykop / Przygotowanie — vertex cm labels: singletons stay simple;
// clusters (same tolerance as geodesy) get named leader cards.
// ══════════════════════════════════════════════════════════════

import { Shape } from "../geometry";
import { formatCmLabel, formatGroundworkBurialLabel, getExcavationCmAtVertex, getPreparationCmAtVertex } from "../excavation";
import { isGroundworkLinear } from "../linearElements";
import { GROUP_TOLERANCE_M, groupPointsByProximity, HEIGHT_MERGE_MAX_SPAN_CM } from "./geodesyLabels";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

const LEADER_LENGTH_PX = 36;
const LEADER_EXTEND_STEP = 12;
const MAX_LEADER_LENGTH_PX = 120;
const CARD_ANGLE = -Math.PI / 4;
const CARD_GAP_PX = 4;
const FONT_LABEL = "10px 'JetBrains Mono',monospace";
const CARD_PAD = 6;
const CARD_ROW_H = 14;

export interface CmVertexPoint {
  x: number;
  y: number;
  shapeIdx: number;
  pointIdx: number;
  cm: number;
  label: string;
}

export interface GroundworkBurialPoint {
  x: number;
  y: number;
  shapeIdx: number;
  pointIdx: number;
  depthM: number;
  label: string;
}

function elementLabel(shape: Shape): string {
  return shape.label || shape.calculatorType || shape.elementType || "Element";
}

export function collectCmVertexPoints(
  shapes: Shape[],
  mode: "excavation" | "preparation",
  passesFilter: (s: Shape) => boolean,
): CmVertexPoint[] {
  const getV = mode === "excavation" ? getExcavationCmAtVertex : getPreparationCmAtVertex;
  const out: CmVertexPoint[] = [];
  for (let si = 0; si < shapes.length; si++) {
    const sh = shapes[si];
    if (sh.removedFromCanvas || sh.layer !== 2) continue;
    if (!passesFilter(sh)) continue;
    if (!sh.closed || sh.points.length < 3) continue;
    const lab = elementLabel(sh);
    for (let pi = 0; pi < sh.points.length; pi++) {
      const v = getV(sh, pi);
      if (v == null) continue;
      out.push({
        x: sh.points[pi].x,
        y: sh.points[pi].y,
        shapeIdx: si,
        pointIdx: pi,
        cm: v,
        label: lab,
      });
    }
  }
  return out;
}

export function collectGroundworkBurialPoints(
  shapes: Shape[],
  passesFilter: (s: Shape) => boolean,
): GroundworkBurialPoint[] {
  const out: GroundworkBurialPoint[] = [];
  for (let si = 0; si < shapes.length; si++) {
    const sh = shapes[si];
    if (sh.removedFromCanvas || sh.layer !== 2 || !isGroundworkLinear(sh)) continue;
    if (!passesFilter(sh)) continue;
    if (sh.points.length < 2) continue;
    const lab = elementLabel(sh);
    const g = sh.groundworkBurialDepthM;
    for (let pi = 0; pi < sh.points.length; pi++) {
      const depthM = g != null && pi < g.length && g[pi] != null && !Number.isNaN(g[pi]!) ? g[pi]! : 0;
      out.push({
        x: sh.points[pi].x,
        y: sh.points[pi].y,
        shapeIdx: si,
        pointIdx: pi,
        depthM,
        label: lab,
      });
    }
  }
  return out;
}

function getCardBounds(
  sp: { x: number; y: number },
  leaderLen: number,
  cardW: number,
  cardH: number,
): { left: number; top: number; right: number; bottom: number } {
  const cornerX = sp.x + Math.cos(CARD_ANGLE) * leaderLen;
  const cornerY = sp.y + Math.sin(CARD_ANGLE) * leaderLen;
  const cardX = cornerX;
  const cardY = cornerY - cardH;
  return { left: cardX, top: cardY, right: cardX + cardW, bottom: cardY + cardH };
}

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
  gap: number,
): boolean {
  return !(a.right + gap < b.left || a.left - gap > b.right || a.bottom + gap < b.top || a.top - gap > b.bottom);
}

const CM_MERGE_EPS = 1e-9;

function depthVertexGroupSpanM(group: GroundworkBurialPoint[]): number {
  if (group.length === 0) return 0;
  let minD = group[0].depthM;
  let maxD = group[0].depthM;
  for (let i = 1; i < group.length; i++) {
    const d = group[i].depthM;
    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
  }
  return maxD - minD;
}

const DEPTH_MERGE_MAX_SPAN_M = HEIGHT_MERGE_MAX_SPAN_CM / 100;

function buildMergedDepthCardEntries(group: GroundworkBurialPoint[]): { label: string; depthM: number }[] {
  const sorted = [...group].sort((a, b) => a.depthM - b.depthM);
  const clusters: GroundworkBurialPoint[][] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].depthM - sorted[i].depthM < DEPTH_MERGE_MAX_SPAN_M - CM_MERGE_EPS) {
      j++;
    }
    clusters.push(sorted.slice(i, j));
    i = j;
  }
  return clusters.map(pts => {
    const avg = pts.reduce((s, p) => s + p.depthM, 0) / pts.length;
    const mRounded = Math.round(avg * 100 * 2) / 200;
    const labels = [...new Set(pts.map(p => p.label))].sort();
    return { label: labels.join(", "), depthM: mRounded };
  });
}

function drawDepthClusterCard(
  ctx: CanvasRenderingContext2D,
  sp: { x: number; y: number },
  entries: { label: string; depthM: number }[],
  leaderLen: number,
  strokeColor: string,
  isHovered: boolean,
  isEditing: boolean,
  canvasIsLight: boolean,
): void {
  ctx.font = FONT_LABEL;
  const seen = new Set<string>();
  const uniq = entries.filter(e => {
    const k = `${e.label}|${e.depthM}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const maxLabelLen = Math.max(...uniq.map(e => e.label.length), 4);
  const rows = uniq.map(e => e.label.padEnd(maxLabelLen + 2) + formatGroundworkBurialLabel(e.depthM));
  const metrics = rows.map(r => ctx.measureText(r));
  const cardW = Math.max(...metrics.map(m => m.width)) + CARD_PAD * 2;
  const cardH = rows.length * CARD_ROW_H + CARD_PAD * 2;

  const cornerX = sp.x + Math.cos(CARD_ANGLE) * leaderLen;
  const cornerY = sp.y + Math.sin(CARD_ANGLE) * leaderLen;

  const lineStroke =
    isHovered || isEditing ? "#a5b4fc" : canvasIsLight ? "#1e293b" : strokeColor;
  ctx.strokeStyle = lineStroke;
  ctx.lineWidth = isHovered || isEditing ? 2 : 1;
  ctx.beginPath();
  ctx.moveTo(sp.x, sp.y);
  ctx.lineTo(cornerX, cornerY);
  ctx.stroke();

  const cardX = cornerX;
  const cardY = cornerY - cardH;

  ctx.fillStyle = canvasIsLight ? "rgba(255,255,255,0.96)" : "rgba(26,26,46,0.95)";
  ctx.strokeStyle = isHovered || isEditing ? "#a5b4fc" : lineStroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(cardX, cardY, cardW, cardH);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = canvasIsLight ? "#1e293b" : "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const textX = cardX + CARD_PAD;
  rows.forEach((row, ri) => {
    ctx.fillText(row, textX, cardY + CARD_PAD + CARD_ROW_H / 2 + ri * CARD_ROW_H);
  });
}

function cmVertexGroupSpanCm(group: CmVertexPoint[]): number {
  if (group.length === 0) return 0;
  let minC = group[0].cm;
  let maxC = group[0].cm;
  for (let i = 1; i < group.length; i++) {
    const c = group[i].cm;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  return maxC - minC;
}

/** Pasma wysokości &lt; 4 mm: jeden wiersz, średnia zaokrąglona do 0,5 cm. */
function buildMergedCmCardEntries(group: CmVertexPoint[]): { label: string; cm: number }[] {
  const sorted = [...group].sort((a, b) => a.cm - b.cm);
  const clusters: CmVertexPoint[][] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].cm - sorted[i].cm < HEIGHT_MERGE_MAX_SPAN_CM - CM_MERGE_EPS) {
      j++;
    }
    clusters.push(sorted.slice(i, j));
    i = j;
  }
  return clusters.map(pts => {
    const avg = pts.reduce((s, p) => s + p.cm, 0) / pts.length;
    const cmRounded = Math.round(avg * 2) / 2;
    const labels = [...new Set(pts.map(p => p.label))].sort();
    return { label: labels.join(", "), cm: cmRounded };
  });
}

function drawCmClusterCard(
  ctx: CanvasRenderingContext2D,
  sp: { x: number; y: number },
  entries: { label: string; cm: number }[],
  leaderLen: number,
  strokeColor: string,
  isHovered: boolean,
  isEditing: boolean,
  canvasIsLight: boolean,
): void {
  ctx.font = FONT_LABEL;
  const seen = new Set<string>();
  const uniq = entries.filter(e => {
    const k = `${e.label}|${e.cm}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const maxLabelLen = Math.max(...uniq.map(e => e.label.length), 4);
  const rows = uniq.map(e => e.label.padEnd(maxLabelLen + 2) + formatCmLabel(e.cm));
  const metrics = rows.map(r => ctx.measureText(r));
  const cardW = Math.max(...metrics.map(m => m.width)) + CARD_PAD * 2;
  const cardH = rows.length * CARD_ROW_H + CARD_PAD * 2;

  const cornerX = sp.x + Math.cos(CARD_ANGLE) * leaderLen;
  const cornerY = sp.y + Math.sin(CARD_ANGLE) * leaderLen;

  const lineStroke =
    isHovered || isEditing ? "#a5b4fc" : canvasIsLight ? "#1e293b" : strokeColor;
  ctx.strokeStyle = lineStroke;
  ctx.lineWidth = isHovered || isEditing ? 2 : 1;
  ctx.beginPath();
  ctx.moveTo(sp.x, sp.y);
  ctx.lineTo(cornerX, cornerY);
  ctx.stroke();

  const cardX = cornerX;
  const cardY = cornerY - cardH;

  ctx.fillStyle = canvasIsLight ? "rgba(255,255,255,0.96)" : "rgba(26,26,46,0.95)";
  ctx.strokeStyle = isHovered || isEditing ? "#a5b4fc" : lineStroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(cardX, cardY, cardW, cardH);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = canvasIsLight ? "#1e293b" : "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const textX = cardX + CARD_PAD;
  rows.forEach((row, i) => {
    ctx.fillText(row, textX, cardY + CARD_PAD + CARD_ROW_H / 2 + i * CARD_ROW_H);
  });
}

/**
 * Singleton: plain cm text at vertex.
 * Cluster, same cm: one plain number at centroid (no card).
 * Cluster, different cm: named card + leader + collision pass.
 */
export function drawExcavationPrepCmLabels(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  worldToScreen: WorldToScreen,
  mode: "excavation" | "preparation",
  passesFilter: (s: Shape) => boolean,
  hoveredPoint: { shapeIdx: number; pointIdx: number } | null,
  isVertexEditing: (shapeIdx: number, pointIdx: number) => boolean,
  canvasIsLight: boolean,
): void {
  const points = collectCmVertexPoints(shapes, mode, passesFilter);
  if (points.length === 0) return;

  const groups = groupPointsByProximity(points, GROUP_TOLERANCE_M);
  const labelColor = mode === "excavation" ? "#85B7EB" : "#FAC775";

  type CardInfo = {
    sp: { x: number; y: number };
    entries: { label: string; cm: number }[];
    cardW: number;
    cardH: number;
    anyHovered: boolean;
    anyEditing: boolean;
  };
  const clusterCards: CardInfo[] = [];

  ctx.font = FONT_LABEL;

  for (const group of groups) {
    if (group.length === 1) {
      const p = group[0];
      const sp = worldToScreen(p.x, p.y);
      ctx.fillStyle = labelColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(formatCmLabel(p.cm), sp.x, sp.y - 14);
      continue;
    }

    const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
    const cy = group.reduce((s, p) => s + p.y, 0) / group.length;
    const sp = worldToScreen(cx, cy);

    if (cmVertexGroupSpanCm(group) < HEIGHT_MERGE_MAX_SPAN_CM - CM_MERGE_EPS) {
      const avg = group.reduce((s, p) => s + p.cm, 0) / group.length;
      const cmOne = Math.round(avg * 2) / 2;
      ctx.fillStyle = labelColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(formatCmLabel(cmOne), sp.x, sp.y - 14);
      continue;
    }

    const anyHovered = group.some(
      p => hoveredPoint != null && hoveredPoint.shapeIdx === p.shapeIdx && hoveredPoint.pointIdx === p.pointIdx,
    );
    const anyEditing = group.some(p => isVertexEditing(p.shapeIdx, p.pointIdx));

    const uniqEntries = buildMergedCmCardEntries(group);
    const maxLabelLen = Math.max(...uniqEntries.map(e => e.label.length), 4);
    const rows = uniqEntries.map(e => e.label.padEnd(maxLabelLen + 2) + formatCmLabel(e.cm));
    const metrics = rows.map(r => ctx.measureText(r));
    const cardW = Math.max(...metrics.map(m => m.width)) + CARD_PAD * 2;
    const cardH = rows.length * CARD_ROW_H + CARD_PAD * 2;

    clusterCards.push({
      sp,
      entries: uniqEntries,
      cardW,
      cardH,
      anyHovered,
      anyEditing,
    });
  }

  const placedBounds: { left: number; top: number; right: number; bottom: number }[] = [];
  const leaderLengths: number[] = [];

  for (let i = 0; i < clusterCards.length; i++) {
    const c = clusterCards[i];
    let len = LEADER_LENGTH_PX;
    let bounds = getCardBounds(c.sp, len, c.cardW, c.cardH);
    while (placedBounds.some(b => rectsOverlap(bounds, b, CARD_GAP_PX)) && len < MAX_LEADER_LENGTH_PX) {
      len += LEADER_EXTEND_STEP;
      bounds = getCardBounds(c.sp, len, c.cardW, c.cardH);
    }
    leaderLengths.push(len);
    placedBounds.push(bounds);
  }

  for (let i = 0; i < clusterCards.length; i++) {
    const c = clusterCards[i];
    drawCmClusterCard(
      ctx,
      c.sp,
      c.entries,
      leaderLengths[i],
      labelColor,
      c.anyHovered,
      c.anyEditing,
      canvasIsLight,
    );
  }
}

const GROUNDWORK_BURIAL_LABEL_COLOR = "#94d4a8";

/**
 * Roboty ziemne liniowe — głębokość zakopania (m→etykieta cm) przy każdym węźle; ten sam widok na Wykop i Przygotowanie.
 */
export function drawGroundworkBurialLabels(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  worldToScreen: WorldToScreen,
  passesFilter: (s: Shape) => boolean,
  hoveredPoint: { shapeIdx: number; pointIdx: number } | null,
  isVertexEditing: (shapeIdx: number, pointIdx: number) => boolean,
  canvasIsLight: boolean,
): void {
  const points = collectGroundworkBurialPoints(shapes, passesFilter);
  if (points.length === 0) return;

  const groups = groupPointsByProximity(points, GROUP_TOLERANCE_M);
  type CardInfo = {
    sp: { x: number; y: number };
    entries: { label: string; depthM: number }[];
    cardW: number;
    cardH: number;
    anyHovered: boolean;
    anyEditing: boolean;
  };
  const clusterCards: CardInfo[] = [];

  ctx.font = FONT_LABEL;

  for (const group of groups) {
    if (group.length === 1) {
      const p = group[0];
      const sp = worldToScreen(p.x, p.y);
      ctx.fillStyle = GROUNDWORK_BURIAL_LABEL_COLOR;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(formatGroundworkBurialLabel(p.depthM), sp.x, sp.y - 14);
      continue;
    }

    const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
    const cy = group.reduce((s, p) => s + p.y, 0) / group.length;
    const sp = worldToScreen(cx, cy);

    if (depthVertexGroupSpanM(group) < DEPTH_MERGE_MAX_SPAN_M - CM_MERGE_EPS) {
      const avg = group.reduce((s, p) => s + p.depthM, 0) / group.length;
      const mOne = Math.round(avg * 100 * 2) / 200;
      ctx.fillStyle = GROUNDWORK_BURIAL_LABEL_COLOR;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(formatGroundworkBurialLabel(mOne), sp.x, sp.y - 14);
      continue;
    }

    const anyHovered = group.some(
      q => hoveredPoint != null && hoveredPoint.shapeIdx === q.shapeIdx && hoveredPoint.pointIdx === q.pointIdx,
    );
    const anyEditing = group.some(q => isVertexEditing(q.shapeIdx, q.pointIdx));

    const uniqEntries = buildMergedDepthCardEntries(group);
    const maxLabelLen = Math.max(...uniqEntries.map(e => e.label.length), 4);
    const rows = uniqEntries.map(e => e.label.padEnd(maxLabelLen + 2) + formatGroundworkBurialLabel(e.depthM));
    const metrics = rows.map(r => ctx.measureText(r));
    const cardW = Math.max(...metrics.map(m => m.width)) + CARD_PAD * 2;
    const cardH = rows.length * CARD_ROW_H + CARD_PAD * 2;

    clusterCards.push({
      sp,
      entries: uniqEntries,
      cardW,
      cardH,
      anyHovered,
      anyEditing,
    });
  }

  const placedBounds: { left: number; top: number; right: number; bottom: number }[] = [];
  const leaderLengths: number[] = [];

  for (let i = 0; i < clusterCards.length; i++) {
    const c = clusterCards[i];
    let len = LEADER_LENGTH_PX;
    let bounds = getCardBounds(c.sp, len, c.cardW, c.cardH);
    while (placedBounds.some(b => rectsOverlap(bounds, b, CARD_GAP_PX)) && len < MAX_LEADER_LENGTH_PX) {
      len += LEADER_EXTEND_STEP;
      bounds = getCardBounds(c.sp, len, c.cardW, c.cardH);
    }
    leaderLengths.push(len);
    placedBounds.push(bounds);
  }

  const stroke = canvasIsLight ? "#166534" : GROUNDWORK_BURIAL_LABEL_COLOR;
  for (let i = 0; i < clusterCards.length; i++) {
    const c = clusterCards[i];
    drawDepthClusterCard(
      ctx,
      c.sp,
      c.entries,
      leaderLengths[i],
      stroke,
      c.anyHovered,
      c.anyEditing,
      canvasIsLight,
    );
  }
}
