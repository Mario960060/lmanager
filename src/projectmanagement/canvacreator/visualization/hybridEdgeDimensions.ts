// ══════════════════════════════════════════════════════════════
// Hybrid edge dimensions: inline numeric vs circled letter + legend (L1/L2 canvas + PDF).
// ══════════════════════════════════════════════════════════════

import { formatDimensionCm, MM_PER_CSS_PX, toMeters } from "../geometry";

export interface EdgeDimHybridState {
  nextLetterIndex: number;
  legendRows: { letter: string; valueCm: string }[];
}

export function createEdgeDimHybridState(): EdgeDimHybridState {
  return { nextLetterIndex: 0, legendRows: [] };
}

/** A, B, … Z, AA, AB, … (1-based column labels). */
export function letterIndexToLabel(index: number): string {
  let i = index + 1;
  let s = "";
  while (i > 0) {
    i--;
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26);
  }
  return s;
}

export function sortLegendRows(rows: { letter: string; valueCm: string }[]): { letter: string; valueCm: string }[] {
  return [...rows].sort((a, b) => a.letter.localeCompare(b.letter, "en", { numeric: true }));
}

const CONDENSED_STACK =
  "'Segoe UI','Segoe UI Variable','Arial Narrow',Roboto,'Helvetica Neue',Arial,sans-serif";

/** Minimum label width (px): text + 4 mm horizontal margin (2 mm each side). */
export function measureMinInlineLabelWidthPx(
  ctx: CanvasRenderingContext2D,
  valueCmStr: string,
  mmPerLogicalPx: number,
): number {
  const padMm = 4;
  const m = ctx.measureText(valueCmStr);
  return m.width + padMm / mmPerLogicalPx;
}

export function edgeLenPxToMm(edgeLenPx: number, mmPerLogicalPx: number): number {
  return edgeLenPx * mmPerLogicalPx;
}

/** Map edge length on paper to ~7–10 pt font (returns CSS px for canvas font string). */
export function inlineEdgeDimensionFontPx(edgeLenMm: number): number {
  const t = Math.max(0, Math.min(1, (edgeLenMm - 6) / 35));
  const pt = 7 + t * 3;
  return (pt * 96) / 72;
}

/**
 * Reserve letter and append legend row. Call after chooseHybrid returns letter mode.
 */
export function assignLetterForShortEdge(
  state: EdgeDimHybridState,
  lenMeters: number,
): { letter: string; text: string } {
  const letter = letterIndexToLabel(state.nextLetterIndex);
  state.nextLetterIndex += 1;
  const text = formatDimensionCm(lenMeters);
  state.legendRows.push({ letter, valueCm: text });
  return { letter, text };
}

export function drawHybridInlineLabel(
  ctx: CanvasRenderingContext2D,
  lx: number,
  ly: number,
  textAngle: number,
  text: string,
  edgeLenMm: number,
  fillStyle: string,
): void {
  const fontPx = inlineEdgeDimensionFontPx(edgeLenMm);
  ctx.save();
  ctx.translate(lx, ly);
  ctx.rotate(textAngle);
  ctx.font = `${fontPx}px ${CONDENSED_STACK}`;
  ctx.fillStyle = fillStyle;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Circled letter ~3 mm diameter, letter ~5 pt bold. */
export function drawHybridLetterBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  letter: string,
  mmPerLogicalPx: number,
  fillStyle: string,
  strokeStyle: string,
): void {
  const rMm = 1.5;
  const r = rMm / mmPerLogicalPx;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fill();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = Math.max(0.6, 0.35 / mmPerLogicalPx);
  ctx.stroke();
  const fontPt = 5;
  const fontPx = (fontPt * 96) / 72;
  ctx.font = `bold ${fontPx}px ${CONDENSED_STACK}`;
  ctx.fillStyle = fillStyle;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, cx, cy);
  ctx.restore();
}

export function getMmPerLogicalPxForDimensions(
  isExportingPdf: boolean,
  pdfLayout: { mmPerLogicalPx: number } | null | undefined,
): number {
  if (isExportingPdf && pdfLayout && pdfLayout.mmPerLogicalPx > 0) {
    return pdfLayout.mmPerLogicalPx;
  }
  return MM_PER_CSS_PX;
}

/** Prepare ctx font and return min width for `valueCmStr` (call after setting font). */
export function prepareInlineDimensionFont(
  ctx: CanvasRenderingContext2D,
  valueCmStr: string,
  edgeLenMm: number,
): number {
  const fontPx = inlineEdgeDimensionFontPx(edgeLenMm);
  ctx.font = `${fontPx}px ${CONDENSED_STACK}`;
  return measureMinInlineLabelWidthPx(ctx, valueCmStr, MM_PER_CSS_PX);
}

export function metersFromPixelLength(lenPx: number): number {
  return toMeters(Math.abs(lenPx));
}

/** Single edge label at offset point (lx, ly), parallel to edge (textAngle). */
export function drawEdgeHybridAt(
  ctx: CanvasRenderingContext2D,
  state: EdgeDimHybridState,
  edgeLenPx: number,
  lenMeters: number,
  lx: number,
  ly: number,
  textAngle: number,
  mmPerLogicalPx: number,
  fillStyle: string,
  strokeStyle: string,
): void {
  const edgeLenMm = edgeLenPxToMm(edgeLenPx, mmPerLogicalPx);
  const text = formatDimensionCm(lenMeters);
  const fontPx = inlineEdgeDimensionFontPx(edgeLenMm);
  ctx.font = `${fontPx}px ${CONDENSED_STACK}`;
  const minW = measureMinInlineLabelWidthPx(ctx, text, mmPerLogicalPx);
  if (edgeLenPx >= minW) {
    drawHybridInlineLabel(ctx, lx, ly, textAngle, text, edgeLenMm, fillStyle);
  } else {
    const { letter } = assignLetterForShortEdge(state, lenMeters);
    drawHybridLetterBadge(ctx, lx, ly, letter, mmPerLogicalPx, fillStyle, strokeStyle);
  }
}

/** Right-side legend for short-edge letters (canvas). */
export function drawEdgeDimensionLegendPanel(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  title: string,
  rows: { letter: string; valueCm: string }[],
  isLightCanvas: boolean,
): void {
  const sorted = sortLegendRows(rows);
  if (sorted.length === 0) return;
  const panelW = Math.min(canvasW * 0.22, 200);
  const pad = 8;
  const x0 = canvasW - panelW - 10;
  const rowH = 15;
  const titleH = 20;
  const h = titleH + sorted.length * rowH + pad * 2;
  ctx.save();
  ctx.fillStyle = isLightCanvas ? "rgba(255,255,255,0.94)" : "rgba(26,26,46,0.92)";
  ctx.strokeStyle = isLightCanvas ? "rgba(15,23,42,0.15)" : "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x0, 10, panelW, h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = isLightCanvas ? "#0f172a" : "#f8fafc";
  ctx.font = `600 11px ${CONDENSED_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, x0 + pad, 10 + pad);
  ctx.font = `10px ${CONDENSED_STACK}`;
  sorted.forEach((r, i) => {
    const y = 10 + pad + titleH + i * rowH;
    ctx.textAlign = "left";
    ctx.fillText(r.letter, x0 + pad, y);
    ctx.textAlign = "right";
    ctx.fillText(r.valueCm, x0 + panelW - pad, y);
  });
  ctx.restore();
}
