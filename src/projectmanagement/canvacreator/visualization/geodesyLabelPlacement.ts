// ══════════════════════════════════════════════════════════════
// Geodesy: etykiety wzdłuż bisektrysy na zewnątrz wielokąta + dopchnięcie przy nakładkach.
// ══════════════════════════════════════════════════════════════

import type { Shape, Point } from "../geometry";
import {
  interiorAngleDir,
  outwardUnitNormalForPolygonEdge,
  pointInPolygon,
  projectOntoSegment,
} from "../geometry";
import type { GeodesyPoint } from "./geodesyLabels";
import type { LabelRect } from "./labelCollisionEngine";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

/** Bazowy offset etykiety wzdłuż kierunku na zewnątrz (px); w smartGeodesyLabels dodatkowo × skala zoom. */
export const GEODESY_BISECTOR_BASE_OFFSET_PX = 3;
/**
 * Linia odniesienia tylko gdy środek etykiety jest dalej wzdłuż bisektrysy niż ten próg (px) —
 * tj. po rozsuwaniu kolizji / wydłużeniu, nie przy samym minimalnym offsetcie.
 */
export const GEODESY_LEADER_VISIBLE_MIN_ALONG_PX = GEODESY_BISECTOR_BASE_OFFSET_PX + 6;
/** Maks. dodatkowe „wypchnięcie" przy nakładkach (px), w krokach po 5. */
export const GEODESY_BISECTOR_MAX_EXTRA_PX = 26;
const GEODESY_STRETCH_STEP_PX = 5;
const GEODESY_STRETCH_ITERS = 22;
const COLLINEAR_EPS = 0.001;

export interface GeodesyLabelBias {
  /** Jednostkowy wektor w świecie (metry) — na zewnątrz od obrysu / krawędzi. */
  outwardWorld: { x: number; y: number };
}

function primaryGeodesyPoint(group: GeodesyPoint[]): GeodesyPoint | null {
  const v = group.find(p => p.isVertex);
  if (v) return v;
  return group[0] ?? null;
}

function norm2(x: number, y: number): { x: number; y: number } {
  const L = Math.hypot(x, y);
  return L > 1e-12 ? { x: x / L, y: y / L } : { x: 1, y: 0 };
}

function bisectorDegenerate(pts: Point[], pi: number): boolean {
  const n = pts.length;
  const prev = pts[(pi - 1 + n) % n]!;
  const curr = pts[pi]!;
  const next = pts[(pi + 1) % n]!;
  const tpx = prev.x - curr.x, tpy = prev.y - curr.y;
  const tnx = next.x - curr.x, tny = next.y - curr.y;
  const tpL = Math.hypot(tpx, tpy);
  const tnL = Math.hypot(tnx, tny);
  if (tpL < 1e-12 || tnL < 1e-12) return true;
  const bisX = tpx / tpL + tnx / tnL;
  const bisY = tpy / tpL + tny / tnL;
  return Math.hypot(bisX, bisY) < COLLINEAR_EPS;
}

function findHeightPointEdge(
  p: Point,
  pts: Point[],
): { edgeIdx: number; t: number } | null {
  const n = pts.length;
  if (n < 2) return null;
  let best: { edgeIdx: number; t: number; dist: number } | null = null;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const proj = projectOntoSegment(p, a, b);
    const d = proj.dist;
    if (!best || d < best.dist) {
      best = { edgeIdx: i, t: proj.t, dist: d };
    }
  }
  if (!best || best.dist > 0.6) return null;
  return { edgeIdx: best.edgeIdx, t: best.t };
}

/** Krok w metrach od wierzchołka wzdłuż kandydata na „na zewnątrz” — test {@link pointInPolygon}. */
const OUTWARD_VERTEX_TEST_EPS_M = 0.12;

/**
 * Zamknięty wielokąt: bisektrysa zewnętrznego kąta w wierzchołku (na zewnątrz wypełnienia).
 * Bazowo: przeciwieństwo kierunku do wnętrza ({@link interiorAngleDir} + π), potem jeśli punkt
 * testowy wpada jeszcze do środka wielokąta — odwracamy (naprawia błędne przypadki winding / wklęsłe).
 */
function outwardVertexWorldDir(pts: Point[], pi: number): { x: number; y: number } {
  const inwardRad = interiorAngleDir(pts, pi);
  let ox = Math.cos(inwardRad + Math.PI);
  let oy = Math.sin(inwardRad + Math.PI);
  const curr = pts[pi]!;
  const probe = { x: curr.x + ox * OUTWARD_VERTEX_TEST_EPS_M, y: curr.y + oy * OUTWARD_VERTEX_TEST_EPS_M };
  if (pointInPolygon(probe, pts)) {
    ox = -ox;
    oy = -oy;
  }
  return norm2(ox, oy);
}

/**
 * Otwarta linia/ścieżka: kierunek od wierzchołka na zewnątrz kąta.
 * Skrajne punkty → normalna do jedynej krawędzi.
 * Środkowe → bisektrysa prev→curr→next wskazuje do "wnętrza" kąta, negujemy → na zewnątrz.
 */
function openPolylineVertexOutward(pts: Point[], pi: number, cardIdx: number): { x: number; y: number } {
  const n = pts.length;
  const curr = pts[pi]!;
  const side = cardIdx % 2 === 0 ? 1 : -1;

  if (pi === 0 && n >= 2) {
    const next = pts[1]!;
    const dx = next.x - curr.x;
    const dy = next.y - curr.y;
    return norm2(-dy * side, dx * side);
  }
  if (pi === n - 1 && n >= 2) {
    const prev = pts[n - 2]!;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    return norm2(-dy * side, dx * side);
  }

  const prev = pts[pi - 1]!;
  const next = pts[pi + 1]!;
  const tpx = prev.x - curr.x, tpy = prev.y - curr.y;
  const tnx = next.x - curr.x, tny = next.y - curr.y;
  const tpL = Math.hypot(tpx, tpy);
  const tnL = Math.hypot(tnx, tny);
  if (tpL < 1e-12 || tnL < 1e-12) {
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    return norm2(-dy * side, dx * side);
  }
  const bisX = tpx / tpL + tnx / tnL;
  const bisY = tpy / tpL + tny / tnL;
  if (Math.hypot(bisX, bisY) < COLLINEAR_EPS) {
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    return norm2(-dy * side, dx * side);
  }
  return norm2(-bisX * side, -bisY * side);
}

function outwardCollinearVertexWorldDir(shape: Shape, pi: number, flip: number): { x: number; y: number } {
  const pts = shape.points;
  const n = pts.length;
  const a = pts[(pi - 1 + n) % n]!;
  const b = pts[pi]!;
  const o = outwardUnitNormalForPolygonEdge(a, b, pts);
  const sign = flip % 2 === 0 ? 1 : -1;
  return { x: o.x * sign, y: o.y * sign };
}

function outwardHeightPointWorldDir(shape: Shape, hp: Point, edgeIdx: number, flip: number): { x: number; y: number } {
  const pts = shape.points;
  const n = pts.length;
  const a = pts[edgeIdx]!;
  const b = pts[(edgeIdx + 1) % n]!;
  const o = outwardUnitNormalForPolygonEdge(a, b, pts);
  const sign = flip % 2 === 0 ? 1 : -1;
  return { x: o.x * sign, y: o.y * sign };
}

/**
 * Uzupełnia geodesyLabelBias na kartach (mutacja).
 * Punkty wysokościowe na tej samej krawędzi: naprzemienne strony (flip wg kolejności wzdłuż krawędzi).
 */
export function applyGeodesyLabelBiasToCards(
  cards: Array<{ group: GeodesyPoint[]; geodesyLabelBias?: GeodesyLabelBias }>,
  shapes: Shape[],
): void {
  type HKey = { cardIdx: number; shapeIdx: number; edgeIdx: number; t: number };
  const heightRows: HKey[] = [];

  for (let ci = 0; ci < cards.length; ci++) {
    const card = cards[ci]!;
    const gp = primaryGeodesyPoint(card.group);
    if (!gp || gp.isVertex) continue;
    const shape = shapes[gp.shapeIdx];
    if (!shape?.closed || shape.points.length < 3) continue;
    const edge = findHeightPointEdge({ x: gp.x, y: gp.y }, shape.points);
    if (edge) {
      heightRows.push({ cardIdx: ci, shapeIdx: gp.shapeIdx, edgeIdx: edge.edgeIdx, t: edge.t });
    }
  }

  heightRows.sort((a, b) => {
    if (a.shapeIdx !== b.shapeIdx) return a.shapeIdx - b.shapeIdx;
    if (a.edgeIdx !== b.edgeIdx) return a.edgeIdx - b.edgeIdx;
    return a.t - b.t;
  });
  const heightFlipByCard = new Map<number, number>();
  heightRows.forEach((row, order) => {
    heightFlipByCard.set(row.cardIdx, order % 2);
  });

  for (let ci = 0; ci < cards.length; ci++) {
    const card = cards[ci]!;
    const gp = primaryGeodesyPoint(card.group);
    if (!gp) continue;

    const shape = shapes[gp.shapeIdx];
    if (!shape?.points?.length) continue;
    const pts = shape.points;

    // ── Zamknięte wielokąty (≥3 wierzchołki) ──
    if (shape.closed && pts.length >= 3) {
      if (gp.isVertex && gp.pointIdx != null) {
        const pi = gp.pointIdx;
        if (bisectorDegenerate(pts, pi)) {
          const flip = pi % 2;
          card.geodesyLabelBias = { outwardWorld: outwardCollinearVertexWorldDir(shape, pi, flip) };
        } else {
          card.geodesyLabelBias = { outwardWorld: outwardVertexWorldDir(pts, pi) };
        }
        continue;
      }

      const edge = findHeightPointEdge({ x: gp.x, y: gp.y }, pts);
      if (!edge) {
        const ctr = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
        const c = { x: ctr.x / pts.length, y: ctr.y / pts.length };
        card.geodesyLabelBias = { outwardWorld: norm2(gp.x - c.x, gp.y - c.y) };
        continue;
      }

      const hf = heightFlipByCard.get(ci) ?? 0;
      card.geodesyLabelBias = {
        outwardWorld: outwardHeightPointWorldDir(shape, { x: gp.x, y: gp.y }, edge.edgeIdx, hf),
      };
      continue;
    }

    // ── Niezamknięte ścieżki / linie (≥2 punkty) ──
    if (gp.isVertex && gp.pointIdx != null && pts.length >= 2) {
      const pi = gp.pointIdx;
      card.geodesyLabelBias = { outwardWorld: openPolylineVertexOutward(pts, pi, ci) };
      continue;
    }

    // Fallback: normalna do najbliższej krawędzi
    if (pts.length >= 2) {
      const edge = findHeightPointEdge({ x: gp.x, y: gp.y }, pts);
      if (edge) {
        const a = pts[edge.edgeIdx]!;
        const b = pts[(edge.edgeIdx + 1) % pts.length]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const flip = ci % 2 === 0 ? 1 : -1;
        card.geodesyLabelBias = { outwardWorld: norm2(-dy * flip, dx * flip) };
        continue;
      }
    }
  }
}

/** Krok w świecie (m) — większy niż 1e-4, żeby worldToScreen dawał wykrywalną deltę w px (unikamy sztucznego „tylko w pionie"). */
const GEODESY_SCREEN_DIR_EPS_WORLD_M = 0.06;

export function geodesyScreenOutwardDir(
  anchorX: number,
  anchorY: number,
  outwardWorld: { x: number; y: number },
  worldToScreen: WorldToScreen,
): { x: number; y: number } {
  const e = GEODESY_SCREEN_DIR_EPS_WORLD_M;
  const sp0 = worldToScreen(anchorX, anchorY);
  const sp1 = worldToScreen(anchorX + outwardWorld.x * e, anchorY + outwardWorld.y * e);
  const dx = sp1.x - sp0.x;
  const dy = sp1.y - sp0.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return { x: 0, y: -1 };
  return { x: dx / L, y: dy / L };
}

type PayloadWithBias = { geodesyLabelBias?: GeodesyLabelBias };

function labelRectOverlap(a: LabelRect, b: LabelRect, margin: number): boolean {
  const ax2 = a.screenX + a.width + margin;
  const bx2 = b.screenX + b.width + margin;
  const ay2 = a.screenY + a.height + margin;
  const by2 = b.screenY + b.height + margin;
  if (ax2 < b.screenX - margin || bx2 < a.screenX - margin) return false;
  if (ay2 < b.screenY - margin || by2 < a.screenY - margin) return false;
  return true;
}

function offsetAlongOutwardFromAnchor(
  label: LabelRect,
  worldToScreen: WorldToScreen,
  bias: GeodesyLabelBias,
): number {
  const sp = worldToScreen(label.anchorX, label.anchorY);
  const dir = geodesyScreenOutwardDir(label.anchorX, label.anchorY, bias.outwardWorld, worldToScreen);
  const cx = label.screenX + label.width / 2;
  const cy = label.screenY + label.height / 2;
  return (cx - sp.x) * dir.x + (cy - sp.y) * dir.y;
}

function getBias(label: LabelRect): GeodesyLabelBias | undefined {
  return (label.payload as PayloadWithBias | undefined)?.geodesyLabelBias;
}

/**
 * Jeśli prostokąty etykiet nadal nachodzą, przesuń środek jednej z nich o krok wzdłuż bisektrysy (max. extra).
 */
export function geodesyStretchOverlappingLabels(
  labels: LabelRect[],
  worldToScreen: WorldToScreen,
  collisionMarginPx: number,
): void {
  const visible = labels.filter(l => l.visible && !l.collapsed);
  const maxAlong =
    GEODESY_BISECTOR_BASE_OFFSET_PX + GEODESY_BISECTOR_MAX_EXTRA_PX;

  for (let iter = 0; iter < GEODESY_STRETCH_ITERS; iter++) {
    let moved = false;
    for (let i = 0; i < visible.length; i++) {
      const a = visible[i]!;
      const biasA = getBias(a);
      if (!biasA) continue;

      for (let j = i + 1; j < visible.length; j++) {
        const b = visible[j]!;
        const biasB = getBias(b);
        if (!biasB) continue;

        if (!labelRectOverlap(a, b, collisionMarginPx)) continue;

        const pick = a.priority <= b.priority ? a : b;
        const bias = pick === a ? biasA : biasB;
        const off = offsetAlongOutwardFromAnchor(pick, worldToScreen, bias);
        if (off >= maxAlong - 1e-3) continue;

        const dir = geodesyScreenOutwardDir(pick.anchorX, pick.anchorY, bias.outwardWorld, worldToScreen);
        pick.screenX += dir.x * GEODESY_STRETCH_STEP_PX;
        pick.screenY += dir.y * GEODESY_STRETCH_STEP_PX;

        const off2 = offsetAlongOutwardFromAnchor(pick, worldToScreen, bias);
        if (off2 > maxAlong) {
          const excess = off2 - maxAlong;
          pick.screenX -= dir.x * excess;
          pick.screenY -= dir.y * excess;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

export function clampGeodesyLabelToLeaderAndCanvas(
  label: LabelRect,
  worldToScreen: WorldToScreen,
  maxLeaderPx: number,
  canvasW: number,
  canvasH: number,
): void {
  label.screenX = Math.max(2, Math.min(canvasW - label.width - 2, label.screenX));
  label.screenY = Math.max(2, Math.min(canvasH - label.height - 2, label.screenY));
  const anchor = worldToScreen(label.anchorX, label.anchorY);
  const cx = label.screenX + label.width / 2;
  const cy = label.screenY + label.height / 2;
  const dx = cx - anchor.x;
  const dy = cy - anchor.y;
  const dist = Math.hypot(dx, dy);
  if (dist > maxLeaderPx && dist > 1e-6) {
    const scale = maxLeaderPx / dist;
    label.screenX = anchor.x + dx * scale - label.width / 2;
    label.screenY = anchor.y + dy * scale - label.height / 2;
    label.screenX = Math.max(2, Math.min(canvasW - label.width - 2, label.screenX));
    label.screenY = Math.max(2, Math.min(canvasH - label.height - 2, label.screenY));
  }
}

/**
 * Po bisektrysie + {@link geodesyStretchOverlappingLabels}: jeśli prostokąty nadal się przecinają,
 * rozsuń je jak w silniku kolizji (priorytet → kto się przesuwa mniej). Używa tej samej logiki co
 * {@link LabelCollisionEngine} resolveCollisions, potem przycina do linii odniesienia.
 */
export function geodesyPushApartRemainingOverlaps(
  labels: LabelRect[],
  worldToScreen: WorldToScreen,
  collisionMarginPx: number,
  maxLeaderPx: number,
  canvasW: number,
  canvasH: number,
): void {
  const visible = labels.filter(l => l.visible && !l.collapsed);
  if (visible.length < 2) return;

  const maxIters = 56;
  for (let iter = 0; iter < maxIters; iter++) {
    let anyOverlap = false;
    const m = collisionMarginPx;
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const label = visible[i]!;
        const other = visible[j]!;
        const overlapX =
          Math.min(label.screenX + label.width + m, other.screenX + other.width + m) -
          Math.max(label.screenX - m, other.screenX - m);
        const overlapY =
          Math.min(label.screenY + label.height + m, other.screenY + other.height + m) -
          Math.max(label.screenY - m, other.screenY - m);
        if (overlapX <= 0 || overlapY <= 0) continue;
        anyOverlap = true;
        /** Tylko gorszy priorytet (większa liczba) — mniej krzyżujących się „teleportów" niż przy przesuwaniu obu. */
        const mover = label.priority > other.priority ? label : other;
        const wcx = label.screenX + label.width / 2;
        const wcy = label.screenY + label.height / 2;
        const ocx = other.screenX + other.width / 2;
        const ocy = other.screenY + other.height / 2;
        let sx = wcx - ocx;
        let sy = wcy - ocy;
        let L = Math.hypot(sx, sy);
        if (L < 1e-6) {
          sx = 1;
          sy = 0;
          L = 1;
        }
        sx /= L;
        sy /= L;
        const push = Math.min(Math.max(overlapX, overlapY) * 0.5 + 0.5, 11);
        mover.screenX += sx * push * (mover === label ? 1 : -1);
        mover.screenY += sy * push * (mover === label ? 1 : -1);
      }
    }
    for (const label of visible) {
      clampGeodesyLabelToLeaderAndCanvas(label, worldToScreen, maxLeaderPx, canvasW, canvasH);
    }
    if (!anyOverlap) break;
  }
}

/**
 * Po rozsuwaniu: etykieta musi zostać po stronie „na zewnątrz" od kotwicy (jak bisektrysa), nie za kotwicą —
 * inaczej linia odniesienia przecina się z innymi i wygląda jak losowy kierunek.
 */
export function geodesySnapLabelsToOutwardHalfPlane(labels: LabelRect[], worldToScreen: WorldToScreen): void {
  const minAlongPx = 4;
  for (const label of labels) {
    if (!label.visible || label.collapsed) continue;
    const bias = getBias(label);
    if (!bias?.outwardWorld) continue;
    const sp = worldToScreen(label.anchorX, label.anchorY);
    const dir = geodesyScreenOutwardDir(label.anchorX, label.anchorY, bias.outwardWorld, worldToScreen);
    const cx = label.screenX + label.width / 2;
    const cy = label.screenY + label.height / 2;
    const along = (cx - sp.x) * dir.x + (cy - sp.y) * dir.y;
    if (along < minAlongPx) {
      const shift = minAlongPx - along;
      label.screenX += dir.x * shift;
      label.screenY += dir.y * shift;
    }
  }
}

type PayloadWithLeaderFlag = PayloadWithBias & { showGeodesyLeaderLine?: boolean };

/**
 * Po finalnym układzie: linia odniesienia tylko gdy środek etykiety jest wystarczająco daleko wzdłuż bisektrysy
 * (typowo po rozsuwaniu kolizji), nie przy samym minimalnym offsetcie startowym.
 */
export function applyGeodesyLeaderLineVisibility(labels: LabelRect[], worldToScreen: WorldToScreen): void {
  for (const label of labels) {
    const card = label.payload as PayloadWithLeaderFlag | undefined;
    if (!card || typeof card !== "object") continue;
    if (!label.visible || label.collapsed) {
      card.showGeodesyLeaderLine = false;
      continue;
    }
    const anchor = worldToScreen(label.anchorX, label.anchorY);
    const cx = label.screenX + label.width / 2;
    const cy = label.screenY + label.height / 2;
    const bias = card.geodesyLabelBias;
    if (bias?.outwardWorld) {
      const dir = geodesyScreenOutwardDir(label.anchorX, label.anchorY, bias.outwardWorld, worldToScreen);
      const along = (cx - anchor.x) * dir.x + (cy - anchor.y) * dir.y;
      card.showGeodesyLeaderLine = along >= GEODESY_LEADER_VISIBLE_MIN_ALONG_PX;
    } else {
      const dist = Math.hypot(cx - anchor.x, cy - anchor.y);
      card.showGeodesyLeaderLine = dist >= GEODESY_LEADER_VISIBLE_MIN_ALONG_PX;
    }
  }
}
