/**
 * Wall tile quantity (vertical cladding): rectangular segment or trapezoid elevation (linear h0→h1 along length).
 * Units: cm for lengths on the wall; gapCm is joint thickness in cm (selectedGap mm / 10).
 */

function lineH(lenCm: number, h0Cm: number, h1Cm: number, x: number): number {
  if (lenCm <= 0) return h0Cm;
  return h0Cm + ((h1Cm - h0Cm) * x) / lenCm;
}

/**
 * Sloped top: classify each grid cell (same layout as countSlabsTrapezoidColumnwise) as whole tile vs cut piece.
 * Whole = tile rectangle fully under the top line h(x) on the column width; otherwise counts as a cut.
 */
export function countTrapezoidWholeVsCut(
  lenCm: number,
  h0Cm: number,
  h1Cm: number,
  slabWidth: number,
  slabHeight: number,
  gapCm: number
): { whole: number; cut: number; total: number } {
  if (lenCm <= 0) return { whole: 0, cut: 0, total: 0 };
  const step = slabWidth + gapCm;
  const rowStep = slabHeight + gapCm;
  if (step <= 0 || rowStep <= 0) return { whole: 0, cut: 0, total: 0 };
  const sL = Math.ceil((lenCm + gapCm) / step);
  let whole = 0;
  let cut = 0;
  for (let k = 0; k < sL; k++) {
    const xMid = Math.min(lenCm, k * step + slabWidth / 2);
    const hAtMid = Math.max(0, lineH(lenCm, h0Cm, h1Cm, xMid));
    const rows = Math.ceil((hAtMid + gapCm) / rowStep);
    const xL = k * step;
    const xR = Math.min(lenCm, k * step + slabWidth);
    const hMin = Math.min(lineH(lenCm, h0Cm, h1Cm, xL), lineH(lenCm, h0Cm, h1Cm, xR));
    for (let j = 0; j < rows; j++) {
      const yB = j * rowStep;
      const yT = yB + slabHeight;
      if (yT <= hMin && yB >= 0) whole++;
      else cut++;
    }
  }
  return { whole, cut, total: whole + cut };
}

/** Sloped top: count slabs column-by-column; height at column center x is linear from h0 (x=0) to h1 (x=lenCm). */
export function countSlabsTrapezoidColumnwise(
  lenCm: number,
  h0Cm: number,
  h1Cm: number,
  slabWidth: number,
  slabHeight: number,
  gapCm: number
): number {
  if (lenCm <= 0) return 0;
  const step = slabWidth + gapCm;
  const rowStep = slabHeight + gapCm;
  if (step <= 0 || rowStep <= 0) return 0;
  const sL = Math.ceil((lenCm + gapCm) / step);
  let total = 0;
  for (let k = 0; k < sL; k++) {
    const x = Math.min(lenCm, k * step + slabWidth / 2);
    const hAtX = h0Cm + ((h1Cm - h0Cm) * x) / lenCm;
    const hUse = Math.max(0, hAtX);
    total += Math.ceil((hUse + gapCm) / rowStep);
  }
  return total;
}

/** Constant-height wall (rectangle in elevation). */
export function countSlabsRectangularSegment(
  lenCm: number,
  hCm: number,
  slabWidth: number,
  slabHeight: number,
  gapCm: number
): number {
  const sL = Math.ceil((lenCm + gapCm) / (slabWidth + gapCm));
  const sH = Math.ceil((hCm + gapCm) / (slabHeight + gapCm));
  return sL * sH;
}

/** Same rules as TileInstallationCalculator slabsPerSegment (length and heights in meters). */
export function countSlabsWallSegmentMeters(
  lengthM: number,
  startH: number,
  endH: number,
  slabWidth: number,
  slabHeight: number,
  gapCm: number
): number {
  const lenCm = lengthM * 100;
  const h0Cm = startH * 100;
  const h1Cm = endH * 100;
  if (Math.abs(h0Cm - h1Cm) < 0.001) {
    return countSlabsRectangularSegment(lenCm, h0Cm, slabWidth, slabHeight, gapCm);
  }
  return countSlabsTrapezoidColumnwise(lenCm, h0Cm, h1Cm, slabWidth, slabHeight, gapCm);
}
