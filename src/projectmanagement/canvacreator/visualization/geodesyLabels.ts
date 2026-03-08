// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/geodesyLabels.ts
// Geodesy point labels with leader lines — avoids overlap when multiple
// points (from different elements) share the same position.
// ══════════════════════════════════════════════════════════════

import { Shape, distance, C, toPixels } from "../geometry";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

/** Single geodesic point: world position, height (m), element label */
export interface GeodesyPoint {
  x: number;
  y: number;
  height: number;
  label: string;
  shapeIdx: number;
  isVertex: boolean;
  pointIdx?: number;
  heightPointIdx?: number;
}

/** Entry in a geodesy card — label + height + points that share this (for editing) */
export interface GeodesyCardEntry {
  label: string;
  height: number;
  points: GeodesyPoint[];
}

/** Full card info for hit test and overlay positioning */
export interface GeodesyCardInfo {
  group: GeodesyPoint[];
  entries: GeodesyCardEntry[];
  cardBounds: { left: number; top: number; right: number; bottom: number };
  sp: { x: number; y: number };
  leaderLen: number;
}

const GROUP_TOLERANCE_M = 0.30;  // ~30cm — łapie punkty po obu stronach murka (20cm)
const LEADER_LENGTH_PX = 36;     // Bazowa długość linii
const LEADER_EXTEND_STEP = 12;  // Krok wydłużania przy nakładce
const MAX_LEADER_LENGTH_PX = 120;
const CARD_ANGLE = -Math.PI / 4; // Ukośnie w górę-prawo
const CARD_GAP_PX = 4;          // Minimalna przerwa między karteczkami
const FONT_LABEL = "10px 'JetBrains Mono',monospace";
const CARD_PAD = 6;
const CARD_ROW_H = 14;

function getElementLabel(shape: Shape): string {
  return shape.label || shape.calculatorType || shape.elementType || "Element";
}

/** Collect all geodesic points from shapes (vertices + heightPoints) */
function collectGeodesyPoints(shapes: Shape[], passesFilter: (s: Shape) => boolean): GeodesyPoint[] {
  const out: GeodesyPoint[] = [];
  for (let si = 0; si < shapes.length; si++) {
    const shape = shapes[si];
    if (!passesFilter(shape)) continue;

    const pts = shape.points;
    const heights = shape.heights || pts.map(() => 0);

    // Vertices with heights
    pts.forEach((p, pi) => {
      const h = heights[pi] ?? 0;
      out.push({
        x: p.x, y: p.y, height: h,
        label: getElementLabel(shape),
        shapeIdx: si, isVertex: true, pointIdx: pi,
      });
    });

    // HeightPoints (Layer 1 only)
    if (shape.layer === 1 && shape.heightPoints?.length) {
      for (let hpi = 0; hpi < shape.heightPoints.length; hpi++) {
        const hp = shape.heightPoints[hpi];
        out.push({
          x: hp.x, y: hp.y, height: hp.height,
          label: getElementLabel(shape),
          shapeIdx: si, isVertex: false, heightPointIdx: hpi,
        });
      }
    }
  }
  return out;
}

/** Group points by proximity (same position) */
function groupByPosition(points: GeodesyPoint[]): GeodesyPoint[][] {
  const groups: GeodesyPoint[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;
    const group: GeodesyPoint[] = [points[i]];
    used.add(i);

    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue;
      const a = points[i], b = points[j];
      if (distance({ x: a.x, y: a.y }, { x: b.x, y: b.y }) < toPixels(GROUP_TOLERANCE_M)) {
        group.push(points[j]);
        used.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

/** Bounds karteczki przy danej długości linii */
function getCardBounds(sp: { x: number; y: number }, leaderLen: number, cardW: number, cardH: number): { left: number; top: number; right: number; bottom: number } {
  const cornerX = sp.x + Math.cos(CARD_ANGLE) * leaderLen;
  const cornerY = sp.y + Math.sin(CARD_ANGLE) * leaderLen;
  const cardX = cornerX;
  const cardY = cornerY - cardH;
  return { left: cardX, top: cardY, right: cardX + cardW, bottom: cardY + cardH };
}

function rectsOverlap(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }, gap: number): boolean {
  return !(a.right + gap < b.left || a.left - gap > b.right || a.bottom + gap < b.top || a.top - gap > b.bottom);
}

/** Draw one leader line + card. Róg karteczki przy punkcie — punkt widoczny. */
function drawCardWithLeader(
  ctx: CanvasRenderingContext2D,
  sp: { x: number; y: number },
  entries: { label: string; height: number }[],
  leaderLen: number,
  isHovered: boolean,
  isEditing: boolean
): void {
  ctx.font = FONT_LABEL;
  const maxLabelLen = Math.max(...entries.map(e => e.label.length), 4);
  const rows = entries.map(e => {
    const hCm = e.height * 100;
    const hStr = (hCm >= 0 ? "+" : "") + hCm.toFixed(1) + " cm";
    return e.label.padEnd(maxLabelLen + 2) + hStr;
  });

  const metrics = rows.map(r => ctx.measureText(r));
  const cardW = Math.max(...metrics.map(m => m.width)) + CARD_PAD * 2;
  const cardH = rows.length * CARD_ROW_H + CARD_PAD * 2;

  const cornerX = sp.x + Math.cos(CARD_ANGLE) * leaderLen;
  const cornerY = sp.y + Math.sin(CARD_ANGLE) * leaderLen;

  ctx.strokeStyle = isHovered || isEditing ? "#fff" : C.geo;
  ctx.lineWidth = isHovered || isEditing ? 2 : 1;
  ctx.beginPath();
  ctx.moveTo(sp.x, sp.y);
  ctx.lineTo(cornerX, cornerY);
  ctx.stroke();

  const cardX = cornerX;
  const cardY = cornerY - cardH;

  ctx.fillStyle = "rgba(26,26,46,0.95)";
  ctx.strokeStyle = C.geo;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(cardX, cardY, cardW, cardH);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const textX = cardX + CARD_PAD;
  rows.forEach((row, i) => {
    ctx.fillText(row, textX, cardY + CARD_PAD + CARD_ROW_H / 2 + i * CARD_ROW_H);
  });
}

/**
 * Draw geodesy point labels. Wszędzie karteczka (jednolicie).
 * Przy nakładce — wydłuża linię, żeby karteczki się nie dotykały.
 */
function isSamePoint(a: GeodesyPoint, b: GeodesyPoint): boolean {
  return a.shapeIdx === b.shapeIdx && a.isVertex === b.isVertex &&
    (a.isVertex ? a.pointIdx === b.pointIdx : a.heightPointIdx === b.heightPointIdx);
}

export function drawGeodesyLabels(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  worldToScreen: WorldToScreen,
  passesFilter: (s: Shape) => boolean,
  hoveredPoint: { shapeIdx: number; pointIdx: number } | null,
  hoveredHeightPoint: { shapeIdx: number; heightPointIdx: number } | null,
  editingGroup: GeodesyPoint[] | null
): void {
  const points = collectGeodesyPoints(shapes, passesFilter);
  if (points.length === 0) return;

  const groups = groupByPosition(points);
  ctx.font = FONT_LABEL;

  const isHovered = (p: GeodesyPoint) =>
    p.isVertex
      ? hoveredPoint && hoveredPoint.shapeIdx === p.shapeIdx && hoveredPoint.pointIdx === p.pointIdx
      : hoveredHeightPoint && hoveredHeightPoint.shapeIdx === p.shapeIdx && hoveredHeightPoint.heightPointIdx === p.heightPointIdx;
  const isEditing = (p: GeodesyPoint) =>
    editingGroup != null && editingGroup.some(g => isSamePoint(p, g));

  type CardInfo = { sp: { x: number; y: number }; entries: { label: string; height: number }[]; cardW: number; cardH: number; anyHovered: boolean; anyEditing: boolean };
  const cards: CardInfo[] = [];

  for (const group of groups) {
    const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
    const cy = group.reduce((s, p) => s + p.y, 0) / group.length;
    const sp = worldToScreen(cx, cy);

    const seen = new Set<string>();
    const entries = group
      .map(p => ({ label: p.label, height: p.height }))
      .filter(e => {
        const key = `${e.label}|${e.height}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const maxLabelLen = Math.max(...entries.map(e => e.label.length), 4);
    const rows = entries.map(e => {
      const hCm = e.height * 100;
      const hStr = (hCm >= 0 ? "+" : "") + hCm.toFixed(1) + " cm";
      return e.label.padEnd(maxLabelLen + 2) + hStr;
    });
    const metrics = rows.map(r => ctx.measureText(r));
    const cardW = Math.max(...metrics.map(m => m.width)) + CARD_PAD * 2;
    const cardH = rows.length * CARD_ROW_H + CARD_PAD * 2;

    cards.push({
      sp, entries,
      cardW, cardH,
      anyHovered: group.some(p => isHovered(p)),
      anyEditing: group.some(p => isEditing(p)),
    });
  }

  const placedBounds: { left: number; top: number; right: number; bottom: number }[] = [];
  const leaderLengths: number[] = [];

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    let len = LEADER_LENGTH_PX;
    let bounds = getCardBounds(c.sp, len, c.cardW, c.cardH);
    while (placedBounds.some(b => rectsOverlap(bounds, b, CARD_GAP_PX)) && len < MAX_LEADER_LENGTH_PX) {
      len += LEADER_EXTEND_STEP;
      bounds = getCardBounds(c.sp, len, c.cardW, c.cardH);
    }
    leaderLengths.push(len);
    placedBounds.push(bounds);
  }

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    drawCardWithLeader(ctx, c.sp, c.entries, leaderLengths[i], c.anyHovered, c.anyEditing);
  }
}

/** Build entries with points for each row (label+height → points that share it) */
function buildEntriesWithPoints(group: GeodesyPoint[]): GeodesyCardEntry[] {
  const byKey = new Map<string, GeodesyPoint[]>();
  for (const p of group) {
    const key = `${p.label}|${p.height}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(p);
  }
  return Array.from(byKey.entries()).map(([_, points]) => ({
    label: points[0].label,
    height: points[0].height,
    points,
  }));
}

/**
 * Get all geodesy card infos for hit testing and overlay positioning.
 * Must use same shapes/filter as drawGeodesyLabels.
 */
export function getGeodesyCardsInfo(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  worldToScreen: WorldToScreen,
  passesFilter: (s: Shape) => boolean
): GeodesyCardInfo[] {
  const points = collectGeodesyPoints(shapes, passesFilter);
  if (points.length === 0) return [];

  const groups = groupByPosition(points);
  ctx.font = FONT_LABEL;

  const cards: { sp: { x: number; y: number }; entries: GeodesyCardEntry[]; cardW: number; cardH: number }[] = [];

  for (const group of groups) {
    const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
    const cy = group.reduce((s, p) => s + p.y, 0) / group.length;
    const sp = worldToScreen(cx, cy);

    const entries = buildEntriesWithPoints(group);
    const rows = entries.map(e => {
      const hCm = e.height * 100;
      const hStr = (hCm >= 0 ? "+" : "") + hCm.toFixed(1) + " cm";
      const maxLabelLen = Math.max(...entries.map(x => x.label.length), 4);
      return e.label.padEnd(maxLabelLen + 2) + hStr;
    });
    const metrics = rows.map(r => ctx.measureText(r));
    const cardW = Math.max(...metrics.map(m => m.width)) + CARD_PAD * 2;
    const cardH = rows.length * CARD_ROW_H + CARD_PAD * 2;

    cards.push({ sp, entries, cardW, cardH });
  }

  const placedBounds: { left: number; top: number; right: number; bottom: number }[] = [];
  const leaderLengths: number[] = [];

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    let len = LEADER_LENGTH_PX;
    let bounds = getCardBounds(c.sp, len, c.cardW, c.cardH);
    while (placedBounds.some(b => rectsOverlap(bounds, b, CARD_GAP_PX)) && len < MAX_LEADER_LENGTH_PX) {
      len += LEADER_EXTEND_STEP;
      bounds = getCardBounds(c.sp, len, c.cardW, c.cardH);
    }
    leaderLengths.push(len);
    placedBounds.push(bounds);
  }

  return cards.map((c, i) => ({
    group: groups[i],
    entries: c.entries,
    cardBounds: placedBounds[i],
    sp: c.sp,
    leaderLen: leaderLengths[i],
  }));
}

export const GEODESY_CARD_PAD = CARD_PAD;
export const GEODESY_CARD_ROW_H = CARD_ROW_H;

/**
 * Hit test geodesy cards. canvasX/canvasY are in canvas coordinate space.
 * Returns the card index and row index (for future row-level focus), or null.
 */
export function hitTestGeodesyCard(
  canvasX: number,
  canvasY: number,
  cardsInfo: GeodesyCardInfo[]
): { cardIdx: number; rowIdx?: number } | null {
  for (let i = cardsInfo.length - 1; i >= 0; i--) {
    const card = cardsInfo[i];
    const { left, top, right, bottom } = card.cardBounds;
    if (canvasX >= left && canvasX <= right && canvasY >= top && canvasY <= bottom) {
      const rowIdx = Math.floor((canvasY - top - CARD_PAD) / CARD_ROW_H);
      const clamped = Math.max(0, Math.min(rowIdx, card.entries.length - 1));
      return { cardIdx: i, rowIdx: clamped };
    }
  }
  return null;
}

/** Find which card contains the given point (by shapeIdx + pointIdx or heightPointIdx) */
export function findCardForPoint(
  cardsInfo: GeodesyCardInfo[],
  point: { shapeIdx: number; pointIdx?: number; heightPointIdx?: number }
): GeodesyCardInfo | null {
  for (const card of cardsInfo) {
    const found = card.group.some(
      p =>
        p.shapeIdx === point.shapeIdx &&
        (point.heightPointIdx != null
          ? !p.isVertex && p.heightPointIdx === point.heightPointIdx
          : p.isVertex && p.pointIdx === point.pointIdx)
    );
    if (found) return card;
  }
  return null;
}
