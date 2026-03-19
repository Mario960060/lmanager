// CAD-style exterior dimensions (Layer 1 garden): dashed extension lines + dimension line with arrow heads.

import { readableTextAngle } from "./geometry";

/**
 * Exterior dimension offset at zoom = 1 (CSS px). Scales with {@link boundaryDimL1ExteriorOffsetScreenPx}
 * so the gap from the edge stays constant in **world** space when zoom changes.
 */
export const BOUNDARY_DIM_L1_EXTERIOR_PX = 76;

/** Screen offset for L1 exterior dims: `BASE * zoom` (world-constant gap), clamped for extreme zoom. */
export function boundaryDimL1ExteriorOffsetScreenPx(zoom: number): number {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const raw = BOUNDARY_DIM_L1_EXTERIOR_PX * z;
  return Math.max(14, Math.min(200, raw));
}

/** Dimension line, dashes, arrows */
export const GARDEN_EXTERIOR_DIM_LINE_COLOR = "#ffffff";
/** Length label */
export const GARDEN_EXTERIOR_DIM_TEXT_COLOR = "#ffffff";

/** Same as {@link GARDEN_EXTERIOR_DIM_LINE_COLOR} — kept for imports that still use the old name. */
export const GARDEN_EXTERIOR_DIM_COLOR = GARDEN_EXTERIOR_DIM_LINE_COLOR;

function fillArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  dirX: number,
  dirY: number,
  color: string,
  size = 5.5
) {
  const L = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / L;
  const uy = dirY / L;
  const px = -uy;
  const py = ux;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - ux * size + px * size * 0.55, tipY - uy * size + py * size * 0.55);
  ctx.lineTo(tipX - ux * size - px * size * 0.55, tipY - uy * size - py * size * 0.55);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw a linear dimension offset outside the garden: dashed extensions from vertices,
 * solid dimension line (stops before arrow tips) with arrows pointing **outward** along the dimension line.
 * `strokeColor` — dashes, solid segment, arrow heads; `labelColor` — numeric text (defaults to stroke).
 */
export function drawExteriorAlignedDimension(
  ctx: CanvasRenderingContext2D,
  sa: { x: number; y: number },
  sb: { x: number; y: number },
  outwardRad: number,
  dimOffsetPx: number,
  label: string,
  strokeColor: string,
  labelColor: string = strokeColor
) {
  const nx = Math.cos(outwardRad);
  const ny = Math.sin(outwardRad);
  const p1 = { x: sa.x + nx * dimOffsetPx, y: sa.y + ny * dimOffsetPx };
  const p2 = { x: sb.x + nx * dimOffsetPx, y: sb.y + ny * dimOffsetPx };

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  const arrowSize = 5.5;
  /** Gap so the stroked dimension line does not run through the arrow heads or past the extension junction */
  const lineInset = arrowSize * 1.05;
  const q1 = { x: p1.x + ux * lineInset, y: p1.y + uy * lineInset };
  const q2 = { x: p2.x - ux * lineInset, y: p2.y - uy * lineInset };

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sa.x, sa.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.moveTo(sb.x, sb.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  if (len > lineInset * 2 + 4) {
    ctx.beginPath();
    ctx.moveTo(q1.x, q1.y);
    ctx.lineTo(q2.x, q2.y);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
  }

  // Tips sit on the extension/dimension junction; directions point **away** from the measured span (outward)
  fillArrowHead(ctx, p1.x, p1.y, -ux, -uy, strokeColor, arrowSize);
  fillArrowHead(ctx, p2.x, p2.y, ux, uy, strokeColor, arrowSize);

  const midx = (p1.x + p2.x) * 0.5;
  const midy = (p1.y + p2.y) * 0.5;
  const edgeAng = Math.atan2(sb.y - sa.y, sb.x - sa.x);
  ctx.translate(midx, midy);
  ctx.rotate(readableTextAngle(edgeAng));
  ctx.font = "12px 'JetBrains Mono','Fira Code',monospace";
  ctx.fillStyle = labelColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, -11);
  ctx.restore();
}

/** Screen-space midpoint of the dimension text (for hit-testing). */
export function exteriorDimLabelScreenMid(
  sa: { x: number; y: number },
  sb: { x: number; y: number },
  outwardRad: number,
  dimOffsetPx: number
): { x: number; y: number } {
  const nx = Math.cos(outwardRad);
  const ny = Math.sin(outwardRad);
  const p1 = { x: sa.x + nx * dimOffsetPx, y: sa.y + ny * dimOffsetPx };
  const p2 = { x: sb.x + nx * dimOffsetPx, y: sb.y + ny * dimOffsetPx };
  return { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };
}
