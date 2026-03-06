// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/deckBoards.ts
// Deck board pattern rendering on polygon shapes
// ══════════════════════════════════════════════════════════════

import { Point, Shape, toPixels } from "../geometry";
import { shrinkPolygon, isSmallCutByWaste } from "./slabPattern";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

const BOARD_COLOR = "#8B4513";
const BOARD_FRAME_COLOR = "#6B3410";
const BOARD_CUT_COLOR = "#6d4c2a";
const BOARD_SMALL_CUT_COLOR = "#e74c3c";
const JOIST_COLOR = "rgba(100,80,60,0.5)";

function getBoundingBox(pts: Point[]): { minX: number; minY: number; width: number; height: number } {
  if (pts.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function pointInPolygon(p: Point, pts: Point[]): boolean {
  const n = pts.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentIntersects(a: Point, b: Point, p: Point, q: Point): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dpx = q.x - p.x, dpy = q.y - p.y;
  const denom = dx * dpy - dy * dpx;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((p.x - a.x) * dpy - (p.y - a.y) * dpx) / denom;
  if (t < 0 || t > 1) return false;
  const s = ((a.x - p.x) * dy - (a.y - p.y) * dx) / -denom;
  return s >= 0 && s <= 1;
}

function rectIntersectsPolygon(corners: Point[], polygon: Point[]): boolean {
  for (const c of corners) {
    if (pointInPolygon(c, polygon)) return true;
  }
  for (let e = 0; e < 4; e++) {
    const a = corners[e];
    const b = corners[(e + 1) % 4];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i];
      const q = polygon[(i + 1) % polygon.length];
      if (segmentIntersects(a, b, p, q)) return true;
    }
  }
  return false;
}

function rectFullyInsidePolygon(corners: Point[], polygon: Point[]): boolean {
  for (const c of corners) {
    if (!pointInPolygon(c, polygon)) return false;
  }
  return true;
}

/**
 * Draw deck board pattern on a polygon shape.
 * Reads boardLength, boardWidth, jointGaps, pattern, includeFrame, distanceBetweenJoists from calculatorInputs.
 * useNormalColorsForCuts: when true (not selected), all boards same color; when false (selected), docinki in different color.
 */
export function drawDeckPattern(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  zoom: number,
  useNormalColorsForCuts: boolean = true
): void {
  const inputs = shape.calculatorInputs;
  if (!inputs) return;

  const boardLength = parseFloat(String(inputs.boardLength ?? ""));
  const boardWidth = parseFloat(String(inputs.boardWidth ?? "")); // cm
  const jointGaps = parseFloat(String(inputs.jointGaps ?? "")); // mm
  const pattern = inputs.pattern ?? "Length";
  const patternRotationDeg = parseFloat(String(inputs.patternRotationDeg ?? "0")) || 0;
  const includeFrame = !!inputs.includeFrame;
  const distanceBetweenJoists = parseFloat(String(inputs.distanceBetweenJoists ?? ""));

  if (isNaN(boardLength) || boardLength <= 0 || isNaN(boardWidth) || boardWidth <= 0) return;

  const pts = shape.points;
  if (pts.length < 3 || !shape.closed) return;

  const bbox = getBoundingBox(pts);
  if (bbox.width < 1 || bbox.height < 1) return;

  const boardWidthM = boardWidth / 100;
  const gapM = jointGaps / 1000;
  const boardWidthPx = toPixels(boardWidthM);
  const gapPx = toPixels(gapM);
  const boardLengthPx = toPixels(boardLength);
  const rowHeight = boardWidthPx + gapPx;

  let ptsForBoards = pts;
  if (includeFrame && boardWidthPx > 0) {
    ptsForBoards = shrinkPolygon(pts, boardWidthPx);
    if (ptsForBoards.length < 3) ptsForBoards = pts;
  }

  ctx.save();

  // Clip to polygon
  ctx.beginPath();
  ctx.moveTo(worldToScreen(pts[0].x, pts[0].y).x, worldToScreen(pts[0].x, pts[0].y).y);
  for (let i = 1; i < pts.length; i++) {
    const s = worldToScreen(pts[i].x, pts[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.clip();

  const drawBoardRect = (x: number, y: number, w: number, h: number, isFrame: boolean, isCut = false, isSmallCut = false) => {
    const s0 = worldToScreen(x, y);
    const s1 = worldToScreen(x + w, y + h);
    const rx = Math.min(s0.x, s1.x);
    const ry = Math.min(s0.y, s1.y);
    const rw = Math.abs(s1.x - s0.x);
    const rh = Math.abs(s1.y - s0.y);
    if (rw < 0.5 || rh < 0.5) return;
    const showCutColor = !useNormalColorsForCuts && isCut;
    const useRed = showCutColor && isSmallCut;
    ctx.fillStyle = isFrame ? BOARD_FRAME_COLOR : (useRed ? BOARD_SMALL_CUT_COLOR : (showCutColor ? BOARD_COLOR : BOARD_CUT_COLOR));
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = isFrame ? "#5a2d0a" : (useRed ? "#c0392b" : (showCutColor ? "#6B3410" : "#5a3d1a"));
    ctx.lineWidth = 1;
    ctx.strokeRect(rx, ry, rw, rh);
  };

  const halfShift = !!inputs.halfShift;

  // Apply pattern rotation around bbox center (in screen space)
  if (patternRotationDeg !== 0) {
    const cx = bbox.minX + bbox.width / 2;
    const cy = bbox.minY + bbox.height / 2;
    const sc = worldToScreen(cx, cy);
    ctx.save();
    ctx.translate(sc.x, sc.y);
    ctx.rotate((patternRotationDeg * Math.PI) / 180);
    ctx.translate(-sc.x, -sc.y);
  }

  if (pattern === "45 degree angle") {
    drawDeck45(ctx, shape, bbox, boardLengthPx, boardWidthPx, gapPx, halfShift, ptsForBoards, useNormalColorsForCuts, worldToScreen, drawBoardRect);
  } else if (pattern === "Width") {
    drawDeckWidth(ctx, shape, bbox, boardLengthPx, boardWidthPx, gapPx, halfShift, ptsForBoards, useNormalColorsForCuts, worldToScreen, drawBoardRect);
  } else {
    drawDeckLength(ctx, shape, bbox, boardLengthPx, boardWidthPx, gapPx, halfShift, ptsForBoards, useNormalColorsForCuts, worldToScreen, drawBoardRect);
  }

  if (patternRotationDeg !== 0) ctx.restore();

  if (includeFrame && boardWidthPx > 0 && boardLengthPx > 0) {
    const frameJointType = (inputs.frameJointType as 'butt' | 'miter45') || 'butt';
    drawDeckFrame(bbox, boardLengthPx, boardWidthPx, gapPx, frameJointType, ctx, worldToScreen, drawBoardRect);
  }

  if (!isNaN(distanceBetweenJoists) && distanceBetweenJoists > 0) {
    const joistSpacingPx = toPixels(distanceBetweenJoists);
    ctx.strokeStyle = JOIST_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (pattern === "45 degree angle") {
      const diag = Math.sqrt(bbox.width * bbox.width + bbox.height * bbox.height);
      const cos45 = Math.cos(Math.PI / 4);
      const sin45 = Math.sin(Math.PI / 4);
      for (let d = 0; d < diag; d += joistSpacingPx) {
        const p1 = worldToScreen(bbox.minX + d * cos45, bbox.minY + d * sin45);
        const p2 = worldToScreen(bbox.minX + bbox.width - d * cos45, bbox.minY + bbox.height - d * sin45);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    } else {
      for (let x = bbox.minX; x <= bbox.minX + bbox.width; x += joistSpacingPx) {
        const s1 = worldToScreen(x, bbox.minY);
        const s2 = worldToScreen(x, bbox.minY + bbox.height);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawFrameQuad(ctx: CanvasRenderingContext2D, corners: Point[], worldToScreen: WorldToScreen): void {
  if (corners.length < 3) return;
  const s0 = worldToScreen(corners[0].x, corners[0].y);
  ctx.beginPath();
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < corners.length; i++) {
    const s = worldToScreen(corners[i].x, corners[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.fillStyle = BOARD_FRAME_COLOR;
  ctx.fill();
  ctx.strokeStyle = "#5a2d0a";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawDeckFrame(
  bbox: { minX: number; minY: number; width: number; height: number },
  boardLengthPx: number,
  boardWidthPx: number,
  gapPx: number,
  frameJointType: 'butt' | 'miter45',
  ctx: CanvasRenderingContext2D,
  worldToScreen: WorldToScreen,
  drawBoardRect: (x: number, y: number, w: number, h: number, isFrame: boolean) => void
): void {
  const pieceLengthPx = boardLengthPx + gapPx;
  const fw = boardWidthPx;
  const { minX, minY, width, height } = bbox;
  const maxX = minX + width;
  const maxY = minY + height;
  const miter = frameJointType === 'miter45';

  const drawEdgePieces = (len: number, place: (t0: number, t1: number) => { x: number; y: number; w: number; h: number }) => {
    const numPieces = Math.ceil(len / pieceLengthPx);
    for (let k = 0; k < numPieces; k++) {
      const t0 = (k * pieceLengthPx) / len;
      const t1 = Math.min(1, ((k + 1) * pieceLengthPx) / len);
      const r = place(t0, t1);
      if (r.w > 0 && r.h > 0) drawBoardRect(r.x, r.y, r.w, r.h, true);
    }
  };

  if (!miter) {
    drawEdgePieces(width, (t0, t1) => ({ x: minX + t0 * width, y: minY, w: (t1 - t0) * width, h: fw }));
    drawEdgePieces(height, (t0, t1) => ({ x: maxX - fw, y: minY + t0 * height, w: fw, h: (t1 - t0) * height }));
    drawEdgePieces(width, (t0, t1) => ({ x: minX + (1 - t1) * width, y: maxY - fw, w: (t1 - t0) * width, h: fw }));
    drawEdgePieces(height, (t0, t1) => ({ x: minX, y: minY + (1 - t1) * height, w: fw, h: (t1 - t0) * height }));
    return;
  }

  // Miter only at corners: first and last piece use inner corner; middle pieces = perpendicular rectangles.
  const drawMiterEdge = (
    outerStart: Point, outerEnd: Point,
    innerStart: Point, innerEnd: Point,
    inx: number, iny: number
  ) => {
    const dx = outerEnd.x - outerStart.x;
    const dy = outerEnd.y - outerStart.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const numPieces = Math.ceil(len / pieceLengthPx);
    const perpInner = (p: Point) => ({ x: p.x + inx * fw, y: p.y + iny * fw });
    for (let k = 0; k < numPieces; k++) {
      const t0 = (k * pieceLengthPx) / len;
      const t1 = Math.min(1, ((k + 1) * pieceLengthPx) / len);
      const p0 = { x: outerStart.x + t0 * dx, y: outerStart.y + t0 * dy };
      const p1 = { x: outerStart.x + t1 * dx, y: outerStart.y + t1 * dy };
      let corners: Point[];
      if (k === 0) {
        corners = [outerStart, p1, perpInner(p1), innerStart];
      } else if (k === numPieces - 1) {
        corners = [p0, outerEnd, innerEnd, perpInner(p0)];
      } else {
        corners = [p0, p1, perpInner(p1), perpInner(p0)];
      }
      drawFrameQuad(ctx, corners, worldToScreen);
    }
  };

  drawMiterEdge(
    { x: minX, y: minY }, { x: maxX, y: minY },
    { x: minX + fw, y: minY + fw }, { x: maxX - fw, y: minY + fw },
    0, 1
  );
  drawMiterEdge(
    { x: maxX, y: minY }, { x: maxX, y: maxY },
    { x: maxX - fw, y: minY + fw }, { x: maxX - fw, y: maxY - fw },
    -1, 0
  );
  drawMiterEdge(
    { x: maxX, y: maxY }, { x: minX, y: maxY },
    { x: maxX - fw, y: maxY - fw }, { x: minX + fw, y: maxY - fw },
    0, -1
  );
  drawMiterEdge(
    { x: minX, y: maxY }, { x: minX, y: minY },
    { x: minX + fw, y: maxY - fw }, { x: minX + fw, y: minY + fw },
    1, 0
  );
}

function drawDeckLength(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  bbox: { minX: number; minY: number; width: number; height: number },
  boardLengthPx: number,
  boardWidthPx: number,
  gapPx: number,
  halfShift: boolean,
  ptsForBoards: Point[],
  useNormalColorsForCuts: boolean,
  worldToScreen: WorldToScreen,
  drawBoardRect: (x: number, y: number, w: number, h: number, isFrame: boolean, isCut?: boolean) => void
): void {
  const rowHeight = boardWidthPx + gapPx;
  const stepX = boardLengthPx + gapPx;
  const halfOffset = halfShift ? stepX / 2 : 0;
  let rowIndex = 0;
  let y = bbox.minY;
  while (y < bbox.minY + bbox.height) {
    const rowOffset = halfShift && rowIndex % 2 !== 0 ? halfOffset : 0;
    let x = bbox.minX - rowOffset;
    while (x < bbox.minX + bbox.width) {
      const corners: Point[] = [
        { x, y },
        { x: x + boardLengthPx, y },
        { x: x + boardLengthPx, y: y + boardWidthPx },
        { x, y: y + boardWidthPx },
      ];
      if (rectIntersectsPolygon(corners, ptsForBoards)) {
        const isCut = !rectFullyInsidePolygon(corners, ptsForBoards);
        const boardAreaPx2 = boardLengthPx * boardWidthPx;
        const isSmallCut = isCut && isSmallCutByWaste(corners, ptsForBoards, boardAreaPx2);
        drawBoardRect(x, y, boardLengthPx, boardWidthPx, false, isCut, isSmallCut);
      }
      x += stepX;
    }
    y += rowHeight;
    rowIndex++;
  }
}

/** Width pattern: boards run along Y (vertical), 90° from Length */
function drawDeckWidth(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  bbox: { minX: number; minY: number; width: number; height: number },
  boardLengthPx: number,
  boardWidthPx: number,
  gapPx: number,
  halfShift: boolean,
  ptsForBoards: Point[],
  useNormalColorsForCuts: boolean,
  worldToScreen: WorldToScreen,
  drawBoardRect: (x: number, y: number, w: number, h: number, isFrame: boolean, isCut?: boolean) => void
): void {
  const columnWidth = boardWidthPx + gapPx;
  const stepY = boardLengthPx + gapPx;
  const halfOffset = halfShift ? stepY / 2 : 0;
  let colIndex = 0;
  let x = bbox.minX;
  while (x < bbox.minX + bbox.width) {
    const colOffset = halfShift && colIndex % 2 !== 0 ? halfOffset : 0;
    let y = bbox.minY - colOffset;
    while (y < bbox.minY + bbox.height) {
      const corners: Point[] = [
        { x, y },
        { x: x + boardWidthPx, y },
        { x: x + boardWidthPx, y: y + boardLengthPx },
        { x, y: y + boardLengthPx },
      ];
      if (rectIntersectsPolygon(corners, ptsForBoards)) {
        const isCut = !rectFullyInsidePolygon(corners, ptsForBoards);
        const boardAreaPx2 = boardLengthPx * boardWidthPx;
        const isSmallCut = isCut && isSmallCutByWaste(corners, ptsForBoards, boardAreaPx2);
        drawBoardRect(x, y, boardWidthPx, boardLengthPx, false, isCut, isSmallCut);
      }
      y += stepY;
    }
    x += columnWidth;
    colIndex++;
  }
}

function drawDeck45(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  bbox: { minX: number; minY: number; width: number; height: number },
  boardLengthPx: number,
  boardWidthPx: number,
  gapPx: number,
  halfShift: boolean,
  ptsForBoards: Point[],
  useNormalColorsForCuts: boolean,
  worldToScreen: WorldToScreen,
  _drawBoardRect: (x: number, y: number, w: number, h: number, isFrame: boolean, isCut?: boolean) => void
): void {
  const angle = Math.PI / 4;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dir = { x: cos, y: sin };
  const perp = { x: -sin, y: cos };
  const stepLength = boardLengthPx + gapPx;
  const stepWidth = boardWidthPx + gapPx;
  const halfOffset = halfShift ? stepLength / 2 : 0;
  const centerX = bbox.minX + bbox.width / 2;
  const centerY = bbox.minY + bbox.height / 2;
  const diag = Math.sqrt(bbox.width * bbox.width + bbox.height * bbox.height);
  const extend = Math.ceil(diag / Math.min(stepLength, stepWidth)) + 4;

  for (let r = -extend; r <= extend; r++) {
    const rowOffset = halfShift && r % 2 !== 0 ? halfOffset : 0;
    for (let c = -extend; c <= extend; c++) {
      const cx = centerX + (c * stepLength + rowOffset) * dir.x + r * stepWidth * perp.x;
      const cy = centerY + (c * stepLength + rowOffset) * dir.y + r * stepWidth * perp.y;
      const corners: Point[] = [
        { x: cx, y: cy },
        { x: cx + boardLengthPx * dir.x, y: cy + boardLengthPx * dir.y },
        { x: cx + boardLengthPx * dir.x + boardWidthPx * perp.x, y: cy + boardLengthPx * dir.y + boardWidthPx * perp.y },
        { x: cx + boardWidthPx * perp.x, y: cy + boardWidthPx * perp.y },
      ];
      if (rectIntersectsPolygon(corners, ptsForBoards)) {
        const isCut = !rectFullyInsidePolygon(corners, ptsForBoards);
        const boardAreaPx2 = boardLengthPx * boardWidthPx;
        const isSmallCut = isCut && isSmallCutByWaste(corners, ptsForBoards, boardAreaPx2);
        const showCutColor = !useNormalColorsForCuts && isCut;
        const useRed = showCutColor && isSmallCut;
        ctx.fillStyle = useRed ? BOARD_SMALL_CUT_COLOR : (showCutColor ? BOARD_COLOR : BOARD_CUT_COLOR);
        ctx.beginPath();
        const s0 = worldToScreen(corners[0].x, corners[0].y);
        ctx.moveTo(s0.x, s0.y);
        for (let i = 1; i < corners.length; i++) {
          const s = worldToScreen(corners[i].x, corners[i].y);
          ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = useRed ? "#c0392b" : (showCutColor ? "#6B3410" : "#5a3d1a");
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
}
