// ══════════════════════════════════════════════════════════════
// Geodesy: kolory tylko gdy etykiety nachodzą na siebie (po silniku kolizji).
// Domyślnie biały (0); sąsiedzi w grafie nakłańniań dostają różne kolory 1..N.
// ══════════════════════════════════════════════════════════════

import type { LabelRect } from "./labelCollisionEngine";
import { GEODESY_GROUP_PALETTE } from "./geodesyClusterColors";

/** Rozszerzenie prostokąta etykiety (px) — traktuj „prawie dotyk” jak konflikt czytelności. */
export const GEODESY_LABEL_OVERLAP_EXPAND_PX = 2;

function labelTextRectsOverlap(a: LabelRect, b: LabelRect, expand: number): boolean {
  const ax1 = a.screenX - expand;
  const ay1 = a.screenY - expand;
  const ax2 = a.screenX + a.width + expand;
  const ay2 = a.screenY + a.height + expand;
  const bx1 = b.screenX - expand;
  const by1 = b.screenY - expand;
  const bx2 = b.screenX + b.width + expand;
  const by2 = b.screenY + b.height + expand;
  return !(ax2 < bx1 || bx2 < ax1 || ay2 < by1 || by2 < ay1);
}

/**
 * Indeksy do {@link GEODESY_GROUP_PALETTE}: 0 = biały (brak nakładania z innymi);
 * 1..(paleta−1) = rozróżnienie sąsiadów w grafie nakładania prostokątów tekstu.
 */
export function assignGeodesyOverlapColorIndices(labels: LabelRect[]): number[] {
  const n = labels.length;
  const out = new Array<number>(n).fill(0);
  const maxColor = GEODESY_GROUP_PALETTE.length - 1;
  if (maxColor < 1) return out;

  const active: number[] = [];
  for (let i = 0; i < n; i++) {
    const lb = labels[i]!;
    if (lb.visible && !lb.collapsed) active.push(i);
  }

  const adj: Set<number>[] = Array.from({ length: n }, () => new Set());
  const ex = GEODESY_LABEL_OVERLAP_EXPAND_PX;
  for (let ai = 0; ai < active.length; ai++) {
    const i = active[ai]!;
    for (let aj = ai + 1; aj < active.length; aj++) {
      const j = active[aj]!;
      if (labelTextRectsOverlap(labels[i]!, labels[j]!, ex)) {
        adj[i]!.add(j);
        adj[j]!.add(i);
      }
    }
  }

  const toColor = active.filter(i => (adj[i]?.size ?? 0) > 0);
  if (toColor.length === 0) return out;

  toColor.sort((i, j) => (adj[j]?.size ?? 0) - (adj[i]?.size ?? 0));

  for (const i of toColor) {
    const used = new Set<number>();
    for (const nb of adj[i] ?? []) {
      const c = out[nb]!;
      if (c > 0) used.add(c);
    }
    let pick = 0;
    for (let c = 1; c <= maxColor; c++) {
      if (!used.has(c)) {
        pick = c;
        break;
      }
    }
    if (pick === 0) pick = 1;
    out[i] = pick;
  }

  return out;
}
