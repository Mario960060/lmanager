// ══════════════════════════════════════════════════════════════
// Delaunay triangulation wrapper + circumcenter
// Used by Natural Neighbor interpolation
// ══════════════════════════════════════════════════════════════

import Delaunator from "delaunator";

export type Sample = { x: number; y: number; h: number };

export interface DelaunayResult {
  delaunator: Delaunator;
  coords: number[];
  samples: Sample[];
  /** Number of real samples (excluding ghost points). Ghost indices are >= numRealSamples. */
  numRealSamples: number;
}

const DEGENERATE_EPS = 1e-10;

/** Compute circumcenter of triangle (i,j,k). Returns null if degenerate (collinear). */
export function circumcenter(
  coords: number[],
  i: number,
  j: number,
  k: number
): { x: number; y: number } | null {
  const ax = coords[2 * i];
  const ay = coords[2 * i + 1];
  const bx = coords[2 * j];
  const by = coords[2 * j + 1];
  const cx = coords[2 * k];
  const cy = coords[2 * k + 1];

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < DEGENERATE_EPS) return null;

  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    d;

  return { x: ux, y: uy };
}

/** Build Delaunay triangulation from real samples only. No ghost points — open cavity near hull falls back to IDW. */
export function buildDelaunay(samples: Sample[]): DelaunayResult {
  if (samples.length < 3) {
    const padded = [...samples];
    while (padded.length < 3) {
      padded.push(padded[padded.length - 1] ?? { x: 0, y: 0, h: 0 });
    }
    const coords = padded.flatMap((s) => [s.x, s.y]);
    const delaunator = new Delaunator(coords);
    return {
      delaunator,
      coords: delaunator.coords as unknown as number[],
      samples: padded,
      numRealSamples: samples.length,
    };
  }

  const coords = samples.flatMap((s) => [s.x, s.y]);
  const delaunator = new Delaunator(coords);

  return {
    delaunator,
    coords: delaunator.coords as unknown as number[],
    samples,
    numRealSamples: samples.length,
  };
}
