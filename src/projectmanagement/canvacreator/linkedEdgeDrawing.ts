// ══════════════════════════════════════════════════════════════
// Linked edge drawing — alternating red/yellow segments (no gaps)
// ══════════════════════════════════════════════════════════════

const LINKED_HALF_SEGMENT_PX = 16;
const LINKED_COLORS = ["#e74c3c", "#f1c40f"] as const; // red, yellow

export function drawAlternatingLinkedHalf(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return;
  const ux = dx / len;
  const uy = dy / len;
  let t = 0;
  let colorIdx = 0;
  while (t < 1) {
    const segLen = Math.min(LINKED_HALF_SEGMENT_PX, (1 - t) * len);
    const t1 = t + segLen / len;
    const x1 = ax + ux * t * len;
    const y1 = ay + uy * t * len;
    const x2 = ax + ux * t1 * len;
    const y2 = ay + uy * t1 * len;
    ctx.strokeStyle = LINKED_COLORS[colorIdx % 2];
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    t = t1;
    colorIdx++;
  }
}
