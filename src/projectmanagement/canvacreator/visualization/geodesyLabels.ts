// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/geodesyLabels.ts
// Geodesy point labels with leader lines — avoids overlap when multiple
// points (from different elements) share the same position.
// ══════════════════════════════════════════════════════════════

import {
  Shape,
  distance,
  toPixels,
  EDGE_LENGTH_LABEL_FONT,
  formatDimensionCm,
  formatGeodesySignedCm,
  roundHeightMToTenthCm,
} from "../geometry";

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

/** World distance (m) — same as geodesy cards; reused for Wykop/Przygotowanie cluster labels. */
export const GROUP_TOLERANCE_M = 0.30; // ~30cm — łapie punkty po obu stronach murka (20cm)

/** W jednym klastrze pozycji: jeśli max−min < 4 mm, traktuj jak jedną wysokość (średnia + zaokrąglenie). */
export const HEIGHT_MERGE_MAX_SPAN_M = 0.004;
/** Ten sam próg dla wartości w cm (Wykop / Przygotowanie). */
export const HEIGHT_MERGE_MAX_SPAN_CM = HEIGHT_MERGE_MAX_SPAN_M * 100;

const HEIGHT_MERGE_EPS = 1e-12;
const LEADER_LENGTH_PX = 36;     // Bazowa długość linii
const LEADER_EXTEND_STEP = 12;  // Krok wydłużania przy nakładce
const MAX_LEADER_LENGTH_PX = 120;
const CARD_ANGLE = -Math.PI / 4; // Ukośnie w górę-prawo
const CARD_GAP_PX = 4;          // Minimalna przerwa między karteczkami
/** Połowa boku kwadratu wokół punktu na ekranie — unikanie nakładki kart na inne węzły / wysokości */
/** Promień „twardości” wokół innych punktów przy layoutcie — mniejszy = mniej odpychania kart. */
export const GEODESY_POINT_SCREEN_CLEARANCE_PX = 4;
/** Etykiety / linie odniesienia wysokości — biały dla czytelności na jasnym heatmapie geodezyjnym */
const GEODESY_HEIGHT_ACCENT = "#ffffff";
const FONT_LABEL = EDGE_LENGTH_LABEL_FONT;
const CARD_PAD = 6;
const CARD_ROW_H = 15;

function getElementLabel(shape: Shape): string {
  return shape.label || shape.calculatorType || shape.elementType || "Element";
}

/** Collect all geodesic points from shapes (vertices + heightPoints) */
function isGroundworkLinearType(elementType: string): boolean {
  return elementType === "drainage" || elementType === "canalPipe" || elementType === "waterPipe" || elementType === "cable";
}

export function collectGeodesyPoints(shapes: Shape[], passesFilter: (s: Shape) => boolean): GeodesyPoint[] {
  const out: GeodesyPoint[] = [];
  for (let si = 0; si < shapes.length; si++) {
    const shape = shapes[si];
    if (!passesFilter(shape)) continue;
    if (isGroundworkLinearType(shape.elementType)) continue;

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

/** Zaokrąglenie wysokości w m do najbliższego 0,5 cm (krok 0,005 m). */
export function roundHeightMToHalfCm(heightM: number): number {
  const hCm = heightM * 100;
  return Math.round(hCm * 2) / 200;
}

/** Rozpiętość wysokości w grupie (m). */
export function geodesyGroupHeightSpanM(group: GeodesyPoint[]): number {
  if (group.length === 0) return 0;
  let minH = group[0].height;
  let maxH = group[0].height;
  for (let i = 1; i < group.length; i++) {
    const h = group[i].height;
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }
  return maxH - minH;
}

/** Height string for canvas — cm, max 1 decimal, no unit suffix (e.g. +34.5). */
export function formatGeodesyHeightM(heightM: number): string {
  return formatGeodesySignedCm(heightM);
}

/** Wartość w cm do pola edycji (bez sufiksu), zaokrąglenie 0,1 cm. */
export function formatGeodesyHeightEditCm(heightM: number): string {
  const m = roundHeightMToTenthCm(heightM);
  const body = formatDimensionCm(Math.abs(m));
  return (m < 0 ? "-" : "") + body;
}

/**
 * True gdy klastr pozycji można pokazać jako jedną wysokość (wszystkie w promieniu &lt; 4 mm).
 * Dotychczas: identyczne float; teraz zgodnie z progiem geodezyjnym.
 */
export function allSameHeightInGroup(group: GeodesyPoint[]): boolean {
  return geodesyGroupHeightSpanM(group) < HEIGHT_MERGE_MAX_SPAN_M - HEIGHT_MERGE_EPS;
}

/** Group world points by distance (same seed-based rule as geodesy cards). */
export function groupPointsByProximity<T extends { x: number; y: number }>(
  points: T[],
  toleranceM: number,
): T[][] {
  const tol = toPixels(toleranceM);
  const groups: T[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;
    const group: T[] = [points[i]];
    used.add(i);

    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue;
      const a = points[i];
      const b = points[j];
      if (distance({ x: a.x, y: a.y }, { x: b.x, y: b.y }) < tol) {
        group.push(points[j]);
        used.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

/** Group points by proximity (same position) */
export function groupByPosition(points: GeodesyPoint[]): GeodesyPoint[][] {
  return groupPointsByProximity(points, GROUP_TOLERANCE_M);
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

/** Kwadrat wokół punktu ekranowego (inne węzły geodezyjne). */
export function geodesyPointScreenObstacleRect(
  sp: { x: number; y: number },
  half: number = GEODESY_POINT_SCREEN_CLEARANCE_PX,
): { left: number; top: number; right: number; bottom: number } {
  return { left: sp.x - half, top: sp.y - half, right: sp.x + half, bottom: sp.y + half };
}

/** Przeszkody dla karty wielowysokościowej: etykiety „samej liczby” + inne punkty (nie ta grupa). */
function screenObstaclesForMultiHeightCard(
  group: GeodesyPoint[],
  allPoints: GeodesyPoint[],
  compactHeightLabelRects: { left: number; top: number; right: number; bottom: number }[],
  worldToScreen: WorldToScreen,
): { left: number; top: number; right: number; bottom: number }[] {
  const out: { left: number; top: number; right: number; bottom: number }[] = [...compactHeightLabelRects];
  for (const p of allPoints) {
    if (group.some(op => isSamePoint(op, p))) continue;
    const sp = worldToScreen(p.x, p.y);
    out.push(geodesyPointScreenObstacleRect(sp));
  }
  return out;
}

/**
 * Długości linii dla kart wielowysokościowych: bez kolizji z innymi kartami,
 * z prostymi etykietami wysokości (ten sam poziom w klastrze) oraz z innymi punktami geodezyjnymi.
 */
function computeMultiCardLeaderLengths(
  fullLayouts: { sp: { x: number; y: number }; cardW: number; cardH: number; group: GeodesyPoint[] }[],
  compactHeightLabelRects: { left: number; top: number; right: number; bottom: number }[],
  allPoints: GeodesyPoint[],
  worldToScreen: WorldToScreen,
): number[] {
  const placedBounds: { left: number; top: number; right: number; bottom: number }[] = [];
  const leaderLengths: number[] = [];

  for (let i = 0; i < fullLayouts.length; i++) {
    const c = fullLayouts[i];
    const obstacles = screenObstaclesForMultiHeightCard(c.group, allPoints, compactHeightLabelRects, worldToScreen);
    let len = LEADER_LENGTH_PX;
    let bounds = getCardBounds(c.sp, len, c.cardW, c.cardH);
    while (
      (placedBounds.some(b => rectsOverlap(bounds, b, CARD_GAP_PX)) ||
        obstacles.some(o => rectsOverlap(bounds, o, CARD_GAP_PX))) &&
      len < MAX_LEADER_LENGTH_PX
    ) {
      len += LEADER_EXTEND_STEP;
      bounds = getCardBounds(c.sp, len, c.cardW, c.cardH);
    }
    leaderLengths.push(len);
    placedBounds.push(bounds);
  }
  return leaderLengths;
}

/** Zmierz prostokąt etykiety „samej wysokości” (jak w getGeodesyCardsInfo / rysowanie). */
export function measureCompactGeodesyHeightLabelRect(
  ctx: CanvasRenderingContext2D,
  sp: { x: number; y: number },
  heightM: number,
): { left: number; top: number; right: number; bottom: number } {
  ctx.font = FONT_LABEL;
  const hStr = formatGeodesyHeightM(heightM);
  const m = ctx.measureText(hStr);
  const pad = 8;
  const textY = sp.y - 14;
  return {
    left: sp.x - m.width / 2 - pad / 2,
    right: sp.x + m.width / 2 + pad / 2,
    top: textY - 9,
    bottom: textY + 9,
  };
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
  const rows = entries.map(e => e.label.padEnd(maxLabelLen + 2) + formatGeodesyHeightM(e.height));

  const metrics = rows.map(r => ctx.measureText(r));
  const cardW = Math.max(...metrics.map(m => m.width)) + CARD_PAD * 2;
  const cardH = rows.length * CARD_ROW_H + CARD_PAD * 2;

  const cornerX = sp.x + Math.cos(CARD_ANGLE) * leaderLen;
  const cornerY = sp.y + Math.sin(CARD_ANGLE) * leaderLen;

  ctx.strokeStyle = isHovered || isEditing ? "#a5b4fc" : GEODESY_HEIGHT_ACCENT;
  ctx.lineWidth = isHovered || isEditing ? 2 : 1;
  ctx.beginPath();
  ctx.moveTo(sp.x, sp.y);
  ctx.lineTo(cornerX, cornerY);
  ctx.stroke();

  const cardX = cornerX;
  const cardY = cornerY - cardH;

  ctx.fillStyle = "rgba(26,26,46,0.95)";
  ctx.strokeStyle = GEODESY_HEIGHT_ACCENT;
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
export function isSamePoint(a: GeodesyPoint, b: GeodesyPoint): boolean {
  return a.shapeIdx === b.shapeIdx && a.isVertex === b.isVertex &&
    (a.isVertex ? a.pointIdx === b.pointIdx : a.heightPointIdx === b.heightPointIdx);
}

/** Stable id for a vertex or height-only point (print preview hide / PDF export). */
export function geoEntryKey(p: GeodesyPoint): string {
  return p.isVertex ? `v|${p.shapeIdx}|${p.pointIdx}` : `h|${p.shapeIdx}|${p.heightPointIdx}`;
}

export function filterGeodesyPointsByHidden(
  points: GeodesyPoint[],
  hiddenEntryKeys?: ReadonlySet<string> | null,
): GeodesyPoint[] {
  if (!hiddenEntryKeys || hiddenEntryKeys.size === 0) return points;
  return points.filter(p => !hiddenEntryKeys.has(geoEntryKey(p)));
}

/**
 * Hit-test nearest geodesy point in canvas logical coordinates (same space as worldToScreen output after DPR transform).
 * Uses all collected points (including hidden) so hidden points can be toggled back from the preview image.
 */
export function hitTestNearestGeodesyPointAtScreen(
  canvasLogicalX: number,
  canvasLogicalY: number,
  shapes: Shape[],
  passesFilter: (s: Shape) => boolean,
  worldToScreen: WorldToScreen,
  maxDistPx: number,
): GeodesyPoint | null {
  const points = collectGeodesyPoints(shapes, passesFilter);
  let best: GeodesyPoint | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const sp = worldToScreen(p.x, p.y);
    const d = Math.hypot(sp.x - canvasLogicalX, sp.y - canvasLogicalY);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best != null && bestD <= maxDistPx ? best : null;
}

export function drawGeodesyLabels(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  worldToScreen: WorldToScreen,
  passesFilter: (s: Shape) => boolean,
  hoveredPoint: { shapeIdx: number; pointIdx: number } | null,
  hoveredHeightPoint: { shapeIdx: number; heightPointIdx: number } | null,
  editingGroup: GeodesyPoint[] | null,
  hiddenEntryKeys?: ReadonlySet<string> | null,
): void {
  const points = filterGeodesyPointsByHidden(collectGeodesyPoints(shapes, passesFilter), hiddenEntryKeys);
  if (points.length === 0) return;

  const groups = groupByPosition(points);
  ctx.font = FONT_LABEL;

  const isHovered = (p: GeodesyPoint) =>
    p.isVertex
      ? hoveredPoint && hoveredPoint.shapeIdx === p.shapeIdx && hoveredPoint.pointIdx === p.pointIdx
      : hoveredHeightPoint && hoveredHeightPoint.shapeIdx === p.shapeIdx && hoveredHeightPoint.heightPointIdx === p.heightPointIdx;
  const isEditing = (p: GeodesyPoint) =>
    editingGroup != null && editingGroup.some(g => isSamePoint(p, g));

  type CardInfo = {
    sp: { x: number; y: number };
    entries: { label: string; height: number }[];
    cardW: number;
    cardH: number;
    anyHovered: boolean;
    anyEditing: boolean;
    group: GeodesyPoint[];
  };
  const cards: CardInfo[] = [];
  const compactHeightLabelRects: { left: number; top: number; right: number; bottom: number }[] = [];
  const compactDraws: { sp: { x: number; y: number }; heightM: number }[] = [];

  for (const group of groups) {
    const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
    const cy = group.reduce((s, p) => s + p.y, 0) / group.length;
    const sp = worldToScreen(cx, cy);

    if (allSameHeightInGroup(group)) {
      const hAvg = group.reduce((s, p) => s + p.height, 0) / group.length;
      const h = roundHeightMToTenthCm(hAvg);
      compactHeightLabelRects.push(measureCompactGeodesyHeightLabelRect(ctx, sp, h));
      compactDraws.push({ sp, heightM: h });
      continue;
    }

    const cardEntries = buildEntriesWithPoints(group);
    const entries = cardEntries.map(e => ({ label: e.label, height: e.height }));

    const maxLabelLen = Math.max(...entries.map(e => e.label.length), 4);
    const rows = cardEntries.map(e =>
      e.label.padEnd(maxLabelLen + 2) + formatGeodesyHeightM(e.height),
    );
    const metrics = rows.map(r => ctx.measureText(r));
    const cardW = Math.max(...metrics.map(m => m.width)) + CARD_PAD * 2;
    const cardH = rows.length * CARD_ROW_H + CARD_PAD * 2;

    cards.push({
      sp,
      entries,
      cardW,
      cardH,
      anyHovered: group.some(p => isHovered(p)),
      anyEditing: group.some(p => isEditing(p)),
      group,
    });
  }

  const leaderLengths = computeMultiCardLeaderLengths(
    cards.map(c => ({ sp: c.sp, cardW: c.cardW, cardH: c.cardH, group: c.group })),
    compactHeightLabelRects,
    points,
    worldToScreen,
  );

  for (const cd of compactDraws) {
    ctx.fillStyle = GEODESY_HEIGHT_ACCENT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(formatGeodesyHeightM(cd.heightM), cd.sp.x, cd.sp.y - 14);
  }

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    drawCardWithLeader(ctx, c.sp, c.entries, leaderLengths[i], c.anyHovered, c.anyEditing);
  }
}

/**
 * Wiersze karty geodezyjnej: punkty posortowane po H, pasma o rozpiętości &lt; 4 mm → jeden wiersz
 * (etykiety łączone, średnia wysokości, zaokrąglona do 0,5 cm).
 */
export function buildEntriesWithPoints(group: GeodesyPoint[]): GeodesyCardEntry[] {
  const sorted = [...group].sort((a, b) => a.height - b.height);
  const clusters: GeodesyPoint[][] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (
      j < sorted.length &&
      sorted[j].height - sorted[i].height < HEIGHT_MERGE_MAX_SPAN_M - HEIGHT_MERGE_EPS
    ) {
      j++;
    }
    clusters.push(sorted.slice(i, j));
    i = j;
  }
  return clusters.map(pts => {
    const avgH = pts.reduce((s, p) => s + p.height, 0) / pts.length;
    const roundedM = roundHeightMToTenthCm(avgH);
    const labels = [...new Set(pts.map(p => p.label))].sort();
    return {
      label: labels.join(", "),
      height: roundedM,
      points: pts,
    };
  });
}

/**
 * Get all geodesy card infos for hit testing and overlay positioning.
 * Must use same shapes/filter as drawGeodesyLabels.
 */
export function getGeodesyCardsInfo(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  worldToScreen: WorldToScreen,
  passesFilter: (s: Shape) => boolean,
  hiddenEntryKeys?: ReadonlySet<string> | null,
): GeodesyCardInfo[] {
  const points = filterGeodesyPointsByHidden(collectGeodesyPoints(shapes, passesFilter), hiddenEntryKeys);
  if (points.length === 0) return [];

  const groups = groupByPosition(points);
  ctx.font = FONT_LABEL;

  type FullLayout = {
    group: GeodesyPoint[];
    sp: { x: number; y: number };
    entries: GeodesyCardEntry[];
    cardW: number;
    cardH: number;
  };

  type Slot =
    | { kind: "compact"; info: GeodesyCardInfo }
    | { kind: "full"; layout: FullLayout };

  const slots: Slot[] = [];
  const compactHeightLabelRects: { left: number; top: number; right: number; bottom: number }[] = [];

  for (const group of groups) {
    const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
    const cy = group.reduce((s, p) => s + p.y, 0) / group.length;
    const sp = worldToScreen(cx, cy);

    if (allSameHeightInGroup(group)) {
      const hAvg = group.reduce((s, p) => s + p.height, 0) / group.length;
      const h = roundHeightMToTenthCm(hAvg);
      const r = measureCompactGeodesyHeightLabelRect(ctx, sp, h);
      compactHeightLabelRects.push(r);
      slots.push({
        kind: "compact",
        info: {
          group: [...group],
          entries: [{ label: "", height: h, points: [...group] }],
          cardBounds: r,
          sp,
          leaderLen: 0,
        },
      });
      continue;
    }

    const entries = buildEntriesWithPoints(group);
    const maxLabelLen = Math.max(...entries.map(x => x.label.length), 4);
    const rows = entries.map(e =>
      e.label.padEnd(maxLabelLen + 2) + formatGeodesyHeightM(e.height),
    );
    const metrics = rows.map(r => ctx.measureText(r));
    const cardW = Math.max(...metrics.map(m => m.width)) + CARD_PAD * 2;
    const cardH = rows.length * CARD_ROW_H + CARD_PAD * 2;

    slots.push({ kind: "full", layout: { group, sp, entries, cardW, cardH } });
  }

  const fullLayouts = slots.filter((s): s is { kind: "full"; layout: FullLayout } => s.kind === "full").map(s => s.layout);

  const leaderLengths = computeMultiCardLeaderLengths(
    fullLayouts.map(c => ({ sp: c.sp, cardW: c.cardW, cardH: c.cardH, group: c.group })),
    compactHeightLabelRects,
    points,
    worldToScreen,
  );

  let fi = 0;
  return slots.map(s => {
    if (s.kind === "compact") return s.info;
    const c = s.layout;
    const len = leaderLengths[fi];
    const b = getCardBounds(c.sp, len, c.cardW, c.cardH);
    fi++;
    return {
      group: c.group,
      entries: c.entries,
      cardBounds: b,
      sp: c.sp,
      leaderLen: len,
    };
  });
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

/**
 * Which label row was hit on the plan (PDF preview / same layout as drawn cards).
 * Use this when several geodesy points share one junction — nearest-point hit tests are ambiguous.
 */
export function hitTestGeodesyCardEntryAtScreen(
  canvasX: number,
  canvasY: number,
  cardsInfo: GeodesyCardInfo[],
): GeodesyCardEntry | null {
  const hit = hitTestGeodesyCard(canvasX, canvasY, cardsInfo);
  if (!hit || hit.rowIdx === undefined) return null;
  const card = cardsInfo[hit.cardIdx];
  const entry = card?.entries[hit.rowIdx];
  return entry ?? null;
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

/** Resolve canvas hit to a single geodesy vertex (same filter/hidden rules as cards). */
export function findGeodesyVertexPointFromHit(
  shapes: Shape[],
  passesFilter: (s: Shape) => boolean,
  hit: { shapeIdx: number; pointIdx: number },
  hiddenEntryKeys?: ReadonlySet<string> | null,
): GeodesyPoint | null {
  const points = filterGeodesyPointsByHidden(collectGeodesyPoints(shapes, passesFilter), hiddenEntryKeys);
  return points.find(p => p.isVertex && p.shapeIdx === hit.shapeIdx && p.pointIdx === hit.pointIdx) ?? null;
}

/** Resolve canvas hit to a layer-1 height-only point. */
export function findGeodesyHeightPointFromHit(
  shapes: Shape[],
  passesFilter: (s: Shape) => boolean,
  hit: { shapeIdx: number; heightPointIdx: number },
  hiddenEntryKeys?: ReadonlySet<string> | null,
): GeodesyPoint | null {
  const points = filterGeodesyPointsByHidden(collectGeodesyPoints(shapes, passesFilter), hiddenEntryKeys);
  return points.find(
    p => !p.isVertex && p.shapeIdx === hit.shapeIdx && p.heightPointIdx === hit.heightPointIdx,
  ) ?? null;
}
