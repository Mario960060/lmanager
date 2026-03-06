// ══════════════════════════════════════════════════════════════
// Natural Neighbor (Sibson) interpolation — CORRECT implementation
// Bowyer-Watson cavity + ordered boundary + Sibson stolen areas
// ══════════════════════════════════════════════════════════════

import type { DelaunayResult, Sample } from "./delaunay";
import { circumcenter } from "./delaunay";

const MAX_WALK_STEPS = 100;
const EPS_SQ = 1e-12;

// ── Geometry helpers ─────────────────────────────────────────

/** Orientation: positive = CCW (math coords). In screen coords (y↓) sign flips. */
function orient2d(
  ax: number, ay: number,
  bx: number, by: number,
  px: number, py: number
): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

/** Point P inside triangle? Works for both CW and CCW winding. */
function pointInTriangle(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): boolean {
  const o0 = orient2d(ax, ay, bx, by, px, py);
  const o1 = orient2d(bx, by, cx, cy, px, py);
  const o2 = orient2d(cx, cy, ax, ay, px, py);
  return (o0 >= -1e-10 && o1 >= -1e-10 && o2 >= -1e-10) ||
         (o0 <= 1e-10 && o1 <= 1e-10 && o2 <= 1e-10);
}

/** Is P inside circumcircle of triangle? */
function inCircumcircle(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  px: number, py: number
): boolean {
  // Use robust incircle test via determinant
  const dax = ax - px, day = ay - py;
  const dbx = bx - px, dby = by - py;
  const dcx = cx - px, dcy = cy - py;
  const da2 = dax * dax + day * day;
  const db2 = dbx * dbx + dby * dby;
  const dc2 = dcx * dcx + dcy * dcy;
  // det > 0 means P inside circle (for CCW triangle)
  // det < 0 means P inside circle (for CW triangle)
  // We check both signs since Delaunator winding depends on screen coords
  const det = dax * (dby * dc2 - dcy * db2)
            - day * (dbx * dc2 - dcx * db2)
            + da2 * (dbx * dcy - dcx * dby);
  // If triangle is CW (screen coords y↓), inside = det < 0
  // If triangle is CCW, inside = det > 0
  // Use abs comparison — if |det| is large enough, P is inside
  // Actually, let's use circumcenter + radius approach for clarity
  const tempCoords = [ax, ay, bx, by, cx, cy];
  const cc = circumcenter(tempCoords, 0, 1, 2);
  if (!cc) return false;
  const r2 = (ax - cc.x) ** 2 + (ay - cc.y) ** 2;
  const d2 = (px - cc.x) ** 2 + (py - cc.y) ** 2;
  return d2 <= r2 + 1e-8;
}

/** Signed area of triangle (positive = CCW in math coords). */
function signedArea2(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Delaunator halfedge helpers */
function nextHalfedge(e: number): number {
  return (e % 3 === 2) ? e - 2 : e + 1;
}
function prevHalfedge(e: number): number {
  return (e % 3 === 0) ? e + 2 : e - 1;
}

/** IDW fallback */
function idwFallback(samples: Sample[], px: number, py: number): number | null {
  let wSum = 0, whSum = 0;
  for (const s of samples) {
    const dx = px - s.x, dy = py - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < EPS_SQ) return s.h;
    const w = 1 / d2;
    wSum += w;
    whSum += w * s.h;
  }
  return wSum > 0 ? whSum / wSum : null;
}

// ── Triangle lookup ──────────────────────────────────────────

function getTriCoords(
  result: DelaunayResult, t: number
): { i0: number; i1: number; i2: number; x0: number; y0: number; x1: number; y1: number; x2: number; y2: number } {
  const { delaunator, coords } = result;
  const i0 = delaunator.triangles[3 * t];
  const i1 = delaunator.triangles[3 * t + 1];
  const i2 = delaunator.triangles[3 * t + 2];
  return {
    i0, i1, i2,
    x0: coords[2 * i0], y0: coords[2 * i0 + 1],
    x1: coords[2 * i1], y1: coords[2 * i1 + 1],
    x2: coords[2 * i2], y2: coords[2 * i2 + 1],
  };
}

/** Find triangle containing P via walking + brute-force fallback. */
function findContainingTriangle(
  px: number, py: number,
  result: DelaunayResult,
  startTriangle: number
): number {
  const { delaunator, coords } = result;
  const triangles = delaunator.triangles;
  const halfedges = delaunator.halfedges;
  const numTri = triangles.length / 3;

  // Clamp start
  let t = Math.min(Math.max(0, startTriangle), numTri - 1);

  // Walk
  for (let step = 0; step < MAX_WALK_STEPS; step++) {
    const tc = getTriCoords(result, t);
    if (pointInTriangle(px, py, tc.x0, tc.y0, tc.x1, tc.y1, tc.x2, tc.y2)) return t;

    // Find edge P is on wrong side of, cross it
    let moved = false;
    for (let e = 0; e < 3; e++) {
      const eIdx = 3 * t + e;
      const a = triangles[eIdx];
      const b = triangles[3 * t + (e + 1) % 3];
      const ax = coords[2 * a], ay = coords[2 * a + 1];
      const bx = coords[2 * b], by = coords[2 * b + 1];
      // Check if P is on the exterior side of edge a→b
      // (opposite side from the third vertex of this triangle)
      const c = triangles[3 * t + (e + 2) % 3];
      const cx = coords[2 * c], cy = coords[2 * c + 1];
      const oC = orient2d(ax, ay, bx, by, cx, cy);
      const oP = orient2d(ax, ay, bx, by, px, py);
      if (oC * oP < 0) {
        // P is on opposite side of edge from c — cross this edge
        const he = halfedges[eIdx];
        if (he < 0) { moved = false; break; } // hull edge, can't cross
        t = Math.floor(he / 3);
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }

  // Brute-force
  for (let i = 0; i < numTri; i++) {
    const tc = getTriCoords(result, i);
    if (pointInTriangle(px, py, tc.x0, tc.y0, tc.x1, tc.y1, tc.x2, tc.y2)) return i;
  }
  return -1;
}

// ── Cavity ───────────────────────────────────────────────────

/** Find Bowyer-Watson cavity: all triangles whose circumcircle contains P. */
function findCavity(
  px: number, py: number,
  result: DelaunayResult,
  startTriangle: number
): number[] {
  const seed = findContainingTriangle(px, py, result, startTriangle);
  if (seed < 0) return [];

  const { delaunator, coords } = result;
  const triangles = delaunator.triangles;
  const halfedges = delaunator.halfedges;

  const inCavity = new Set<number>();
  const queue = [seed];

  while (queue.length > 0) {
    const t = queue.pop()!;
    if (inCavity.has(t)) continue;

    const tc = getTriCoords(result, t);
    if (!inCircumcircle(tc.x0, tc.y0, tc.x1, tc.y1, tc.x2, tc.y2, px, py)) continue;

    inCavity.add(t);

    // Check neighbors
    for (let e = 0; e < 3; e++) {
      const he = halfedges[3 * t + e];
      if (he >= 0) {
        const tAdj = Math.floor(he / 3);
        if (!inCavity.has(tAdj)) queue.push(tAdj);
      }
    }
  }

  return Array.from(inCavity);
}

// ── Ordered boundary extraction ──────────────────────────────

interface BoundaryEdge {
  /** Vertex index at start of boundary edge (in original coords) */
  v: number;
  /** Vertex index at end of boundary edge */
  w: number;
  /** Triangle index inside cavity that has this boundary edge */
  triInside: number;
  /** Edge index (0,1,2) within triInside */
  edgeInside: number;
}

/**
 * Extract ordered boundary edges of the cavity.
 * Boundary edge = edge of a cavity triangle whose neighbor is NOT in cavity (or is hull).
 * Returns edges ordered so that edge[i].w === edge[i+1].v (closed loop).
 */
function extractOrderedBoundary(
  cavity: number[],
  result: DelaunayResult
): BoundaryEdge[] {
  const { delaunator } = result;
  const triangles = delaunator.triangles;
  const halfedges = delaunator.halfedges;
  const cavitySet = new Set(cavity);

  // Collect all boundary edges (unordered)
  const edges: BoundaryEdge[] = [];
  for (const t of cavity) {
    for (let e = 0; e < 3; e++) {
      const he = halfedges[3 * t + e];
      const tAdj = he >= 0 ? Math.floor(he / 3) : -1;
      if (tAdj >= 0 && cavitySet.has(tAdj)) continue; // interior edge

      // This is a boundary edge. In Delaunator, edge e of triangle t goes from
      // triangles[3*t + e] to triangles[3*t + (e+1)%3]
      const v = triangles[3 * t + e];
      const w = triangles[3 * t + (e + 1) % 3];
      edges.push({ v, w, triInside: t, edgeInside: e });
    }
  }

  if (edges.length === 0) return [];

  // Order edges into a closed loop: edge[i].w === edge[i+1].v
  const ordered: BoundaryEdge[] = [edges[0]];
  const remaining = new Set(edges.slice(1).map((_, i) => i + 1));

  for (let step = 0; step < edges.length - 1; step++) {
    const last = ordered[ordered.length - 1];
    let found = false;
    for (const idx of remaining) {
      if (edges[idx].v === last.w) {
        ordered.push(edges[idx]);
        remaining.delete(idx);
        found = true;
        break;
      }
    }
    if (!found) break; // shouldn't happen for valid cavity
  }

  return ordered;
}

// ── Sibson weights ───────────────────────────────────────────

/**
 * Compute Sibson (Natural Neighbor) weights for point P.
 *
 * For each boundary vertex Vi, the stolen area is computed from the
 * circumcenters of adjacent triangles:
 *
 *   For boundary edge (Vi, Vi+1):
 *     cOld = circumcenter of cavity triangle on this edge
 *     cNew = circumcenter of (P, Vi, Vi+1) — the new triangle after Bowyer-Watson insert
 *
 *   Stolen area for Vi = sum of triangle areas formed by (cNew_prev, P_voronoi_vertex, cOld)
 *   In practice: for each boundary vertex Vi with incoming edge (Vi-1,Vi) and outgoing edge (Vi,Vi+1):
 *     contribution = |area(cNew_incoming, cOld_at_Vi, cNew_outgoing)| / 2
 *     where cOld_at_Vi = circumcenter of the cavity triangle at Vi
 *
 * Simplified correct approach:
 *   For each boundary edge e_k = (Vk, Vk+1):
 *     cOld_k = circumcenter of cavity triangle containing this edge
 *     cNew_k = circumcenter(P, Vk, Vk+1)
 *
 *   For each boundary vertex Vk (shared between edges e_{k-1} and e_k):
 *     stolen_area(Vk) = |polygon_area(cOld_{k-1}, cNew_{k-1}, cNew_k... wait, this is still wrong)
 *
 * ACTUALLY — the correct Sibson formula using Bowyer-Watson:
 *
 *   The Voronoi cell of P (after insertion) has vertices at cNew_0, cNew_1, ..., cNew_{m-1}
 *   (circumcenters of new triangles formed by P and boundary edges).
 *
 *   The original Voronoi cell of neighbor Vi had vertices at cOld circumcenters.
 *
 *   The stolen area from Vi = the area of intersection of P's new cell with Vi's old cell.
 *
 *   For a boundary vertex Vi appearing between boundary edges e_{k-1}=(V_{k-1},Vi) and e_k=(Vi,V_{k+1}):
 *     The stolen area contribution is the area of the polygon:
 *       [cNew_{k-1}, cOld_for_tri_at_edge_{k-1}, ..., cOld_for_tri_at_edge_k, cNew_k]
 *     But for a single cavity triangle touching Vi on both edges, this simplifies to:
 *       area of triangle (cNew_{k-1}, cOld, cNew_k)
 *     where cOld is the circumcenter of the cavity triangle that contains vertex Vi.
 *
 * For most cases (especially with ghost points ensuring closed cavity), each boundary vertex
 * is shared by exactly 2 boundary edges and belongs to exactly one cavity triangle at the boundary.
 * So the stolen area = area of triangle(cNew_prev, cOld, cNew_next).
 */
function sibsonWeights(
  px: number, py: number,
  cavity: number[],
  boundary: BoundaryEdge[],
  result: DelaunayResult
): Map<number, number> {
  const { coords, numRealSamples } = result;
  const weights = new Map<number, number>();

  if (boundary.length < 3) return weights;

  const m = boundary.length; // number of boundary edges = number of boundary vertices

  // Precompute cNew for each boundary edge: circumcenter(P, Vk, Wk)
  const cNew: ({ x: number; y: number } | null)[] = new Array(m);
  for (let k = 0; k < m; k++) {
    const { v, w } = boundary[k];
    const vx = coords[2 * v], vy = coords[2 * v + 1];
    const wx = coords[2 * w], wy = coords[2 * w + 1];
    const tempCoords = [px, py, vx, vy, wx, wy];
    cNew[k] = circumcenter(tempCoords, 0, 1, 2);
  }

  // Precompute cOld for each boundary edge: circumcenter of the cavity triangle on this edge
  const cOld: ({ x: number; y: number } | null)[] = new Array(m);
  for (let k = 0; k < m; k++) {
    const { triInside } = boundary[k];
    const tc = getTriCoords(result, triInside);
    const triCoords = [tc.x0, tc.y0, tc.x1, tc.y1, tc.x2, tc.y2];
    cOld[k] = circumcenter(triCoords, 0, 1, 2);
  }

  // For each boundary vertex Vk (= boundary[k].v):
  //   It sits between boundary edge k-1 (incoming: V_{k-1} → Vk) and edge k (outgoing: Vk → V_{k+1})
  //   Stolen area = area of triangle(cNew[k-1], cOld[???], cNew[k])
  //
  //   Which cOld? The circumcenter of the cavity triangle that contains Vk.
  //   Both edge k-1 and edge k have triInside — they may be the same triangle or different.
  //   If they share a triangle at Vk, use that one's circumcenter.
  //   If not (multiple cavity triangles at Vk), we need to sum areas through all of them.
  //
  //   For the simple case (most common), we sum contributions from both adjacent edges:
  //   stolen(Vk) = area(cNew[k-1], cOld[k-1], midpoint) + area(midpoint, cOld[k], cNew[k])
  //   But actually, the correct simple formula is just:
  //
  //   stolen(Vk) = area(cOld[k-1], cNew[k-1], P_projection) + area(cOld[k], cNew[k], P_projection)
  //   ... no, this is getting complicated.
  //
  // SIMPLEST CORRECT APPROACH:
  //   The total area of P's Voronoi cell = sum of areas of triangles (P, cNew[k], cNew[k+1]) for all k.
  //   The stolen area from Vk = area of polygon {cNew[k-1], cOld_path..., cNew[k]}.
  //   When only one cavity triangle touches Vk at the boundary, this is triangle(cNew[k-1], cOld, cNew[k]).
  //
  // Let's find, for each boundary vertex Vk, the cOld of the cavity triangle(s) that contain Vk
  // and are on the boundary. We know boundary[k-1].triInside and boundary[k].triInside both contain Vk.
  // If they're the same triangle, one cOld. If different, we need intermediate cOlds.

  // Build map: for each boundary vertex, which cavity triangles contain it
  // Since we ordered boundary, vertex Vk = boundary[k].v
  // edge k-1 = (V_{k-1} → Vk), triInside = boundary[(k-1+m)%m].triInside
  // edge k   = (Vk → V_{k+1}), triInside = boundary[k].triInside

  for (let k = 0; k < m; k++) {
    const vIdx = boundary[k].v; // This is the boundary vertex Vk
    const prevK = (k - 1 + m) % m;

    // cNew from incoming edge (edge k-1, which ends at Vk)
    const cn_prev = cNew[prevK];
    // cNew from outgoing edge (edge k, which starts at Vk)
    const cn_next = cNew[k];

    if (!cn_prev || !cn_next) continue;

    // Find all cavity triangles that contain vertex Vk, ordered from edge k-1 to edge k
    // Start with triInside of edge k-1, walk through cavity triangles sharing Vk via halfedges
    const triStart = boundary[prevK].triInside;
    const triEnd = boundary[k].triInside;

    // Incoming halfedge to Vk from triStart (edge k-1: V_{k-1} → Vk)
    const halfedges = result.delaunator.halfedges;
    let e = 3 * triStart + boundary[prevK].edgeInside;

    const cOlds: { x: number; y: number }[] = [];
    const triCoords_s = getTriCoords(result, triStart);
    const cc_start = circumcenter([triCoords_s.x0, triCoords_s.y0, triCoords_s.x1, triCoords_s.y1, triCoords_s.x2, triCoords_s.y2], 0, 1, 2);
    if (cc_start) cOlds.push(cc_start);

    if (triStart !== triEnd) {
      // Walk from triStart to triEnd via edgesAroundPoint (Delaunator halfedge traversal).
      // e is currently an incoming halfedge to Vk in triStart.
      // Pattern: outgoing = nextHalfedge(e), twin = halfedges[outgoing] = next incoming to Vk.
      let guard = 0;
      while (guard++ < 64) {
        const outgoing = nextHalfedge(e);
        const twin = halfedges[outgoing];
        if (twin < 0) break;
        e = twin; // twin is the incoming halfedge to Vk in the adjacent triangle
        const t = Math.floor(e / 3);
        if (t === triEnd) {
          const triCoords_e = getTriCoords(result, triEnd);
          const cc_end = circumcenter([triCoords_e.x0, triCoords_e.y0, triCoords_e.x1, triCoords_e.y1, triCoords_e.x2, triCoords_e.y2], 0, 1, 2);
          if (cc_end) cOlds.push(cc_end);
          break;
        }
        if (!cavity.includes(t)) break;
        const tc = getTriCoords(result, t);
        const cc = circumcenter([tc.x0, tc.y0, tc.x1, tc.y1, tc.x2, tc.y2], 0, 1, 2);
        if (cc) cOlds.push(cc);
      }
    }

    // Compute stolen area for Vk as sum of triangle areas through the polygon:
    //   cn_prev → cOld_0 → cOld_1 → ... → cn_next
    // triangulated as fan from cn_prev
    let stolenArea = 0;
    const polyPoints = [cn_prev, ...cOlds, cn_next];
    for (let i = 1; i < polyPoints.length - 1; i++) {
      const area = Math.abs(signedArea2(
        polyPoints[0].x, polyPoints[0].y,
        polyPoints[i].x, polyPoints[i].y,
        polyPoints[i + 1].x, polyPoints[i + 1].y
      )) / 2;
      stolenArea += area;
    }

    if (stolenArea < 1e-20) continue;

    // Only real samples — ghost points excluded (no ghost points in buildDelaunay; if boundary has hull-only vertices, fallback to IDW)
    if (vIdx < numRealSamples) {
      weights.set(vIdx, (weights.get(vIdx) ?? 0) + stolenArea);
    }
  }

  // Normalize
  const total = Array.from(weights.values()).reduce((a, b) => a + b, 0);
  if (total < 1e-20) return new Map();

  for (const [k, v] of weights) {
    weights.set(k, v / total);
  }
  return weights;
}

// ── Public API ───────────────────────────────────────────────

export interface InterpolateNNOptions {
  walkCtx?: { lastTriangle: number };
  idwSamples?: Sample[];
}

/** Natural Neighbor (Sibson) interpolation. Returns interpolated height or null. */
export function interpolateNN(
  px: number, py: number,
  delaunay: DelaunayResult,
  options?: InterpolateNNOptions
): number | null {
  const { samples, numRealSamples } = delaunay;
  const walkCtx = options?.walkCtx;
  const idwSamples = options?.idwSamples;

  // Exact match with a sample point
  for (let i = 0; i < numRealSamples; i++) {
    const dx = px - samples[i].x, dy = py - samples[i].y;
    if (dx * dx + dy * dy < EPS_SQ) return samples[i].h;
  }

  const startTri = walkCtx?.lastTriangle ?? 0;

  // Find cavity
  const cavity = findCavity(px, py, delaunay, startTri);
  if (cavity.length === 0) {
    return idwSamples ? idwFallback(idwSamples, px, py) : null;
  }

  // Update walk cache
  if (walkCtx) walkCtx.lastTriangle = cavity[0];

  // Extract ordered boundary
  const boundary = extractOrderedBoundary(cavity, delaunay);
  if (boundary.length < 3) {
    return idwSamples ? idwFallback(idwSamples, px, py) : null;
  }

  // Compute Sibson weights
  const weights = sibsonWeights(px, py, cavity, boundary, delaunay);
  if (weights.size === 0) {
    return idwSamples ? idwFallback(idwSamples, px, py) : null;
  }

  // Interpolate
  let h = 0;
  for (const [idx, w] of weights) {
    h += w * (samples[idx]?.h ?? 0);
  }
  return h;
}