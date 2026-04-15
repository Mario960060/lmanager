/**
 * Shared math for PDF export: image box on A4 landscape, optional legend strip (L1/L2).
 */

export interface PdfImagePlacementInput {
  pdfWidthMm: number;
  pdfHeightMm: number;
  marginMm: number;
  headerHmm: number;
  /** Canvas buffer width/height (device pixels) — aspect must match logical. */
  canvasBufferW: number;
  canvasBufferH: number;
  /** Logical canvas size (same aspect as buffer). */
  canvasLogicalW: number;
  /** 1 = full image area width; 0.8 = drawing uses left 80%, legend column uses right 20%. */
  contentWidthFraction: number;
}

export interface PdfImagePlacementResult {
  drawW_mm: number;
  drawH_mm: number;
  imageX_mm: number;
  imageY_mm: number;
  imgAreaW_mm: number;
  imgAreaH_mm: number;
  /** Width reserved for the PNG in mm (left slot when fraction &lt; 1). */
  imageSlotW_mm: number;
  /** Right column for vector legend (0 when fraction === 1). */
  legendX_mm: number;
  legendW_mm: number;
  /** mm per logical canvas pixel (worldToScreen is in logical px). */
  mmPerLogicalPx: number;
}

/**
 * Same aspect-fit as legacy handleExportPdf, with optional narrow image slot for legend column.
 */
export function computePdfImagePlacement(p: PdfImagePlacementInput): PdfImagePlacementResult {
  const imgAreaW = p.pdfWidthMm - p.marginMm * 2;
  const imgAreaH = p.pdfHeightMm - p.marginMm * 2 - p.headerHmm;
  const frac = p.contentWidthFraction > 0 && p.contentWidthFraction <= 1 ? p.contentWidthFraction : 1;
  const imageSlotW = imgAreaW * frac;
  const legendW = imgAreaW - imageSlotW;
  const legendX = p.marginMm + imageSlotW;

  const imgW = p.canvasBufferW;
  const imgH = p.canvasBufferH;
  if (imgW <= 0 || imgH <= 0 || p.canvasLogicalW <= 0) {
    return {
      drawW_mm: 0,
      drawH_mm: 0,
      imageX_mm: p.marginMm,
      imageY_mm: p.marginMm + p.headerHmm,
      imgAreaW,
      imgAreaH,
      imageSlotW_mm: imageSlotW,
      legendX_mm: legendX,
      legendW_mm: legendW,
      mmPerLogicalPx: 1,
    };
  }

  const drawH = (imgH * imageSlotW) / imgW;
  const drawHClamped = Math.min(drawH, imgAreaH);
  const drawWClamped = drawH > imgAreaH ? (imgW * imgAreaH) / imgH : imageSlotW;

  const imageX = p.marginMm + (imageSlotW - drawWClamped) / 2;
  const imageY = p.marginMm + p.headerHmm + (imgAreaH - drawHClamped) / 2;

  const mmPerLogicalPx = drawWClamped / p.canvasLogicalW;

  return {
    drawW_mm: drawWClamped,
    drawH_mm: drawHClamped,
    imageX_mm: imageX,
    imageY_mm: imageY,
    imgAreaW,
    imgAreaH,
    imageSlotW_mm: imageSlotW,
    legendX_mm: legendX,
    legendW_mm: legendW,
    mmPerLogicalPx,
  };
}
