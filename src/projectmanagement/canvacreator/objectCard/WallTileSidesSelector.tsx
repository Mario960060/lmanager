// ══════════════════════════════════════════════════════════════
// WallTileSidesSelector — miniaturka muru z klikalnymi stronami
// Tylko na kanwie (Object Card). Klik = toggle strony (zielony = oklejenie).
// Używa miter joins na rogach i linii na końcach (nie boksów).
// ══════════════════════════════════════════════════════════════

import React, { useMemo, useCallback } from "react";
import type { Point } from "../geometry";
import { toPixels } from "../geometry";
import { colors, radii } from "../../../themes/designTokens";

interface WallTileSidesSelectorProps {
  points: Point[];
  segmentTileSides: boolean[][];
  frontFacesTiled: [boolean, boolean];
  onChange: (segmentTileSides: boolean[][]) => void;
  onFrontFacesChange: (frontFacesTiled: [boolean, boolean]) => void;
  width?: number;
  height?: number;
  slabThicknessCm?: number;
  adhesiveThicknessCm?: number;
  segmentHeights?: Array<{ startH: number; endH: number }>;
  /** block4 = 10cm, block7 = 14cm — for consistent parallel thickness */
  wallType?: 'block4' | 'block7';
}

/** Normalize vector to unit length */
function normalize(dx: number, dy: number): { x: number; y: number } {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

/** 2D cross product */
function cross(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x * b.y - a.y * b.x;
}

/** Compute left and right offset points with miter joins at corners */
function computeThickPolylineEdges(points: Point[], half: number): { left: Point[]; right: Point[] } {
  if (points.length < 2) return { left: [], right: [] };
  const MITER_LIMIT = half * 4;
  const leftPts: Point[] = [];
  const rightPts: Point[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) continue;
    const nx = -dy / len;
    const ny = dx / len;
    leftPts.push({ x: a.x + nx * half, y: a.y + ny * half });
    rightPts.push({ x: a.x - nx * half, y: a.y - ny * half });
  }
  const last = points[points.length - 1];
  const prevLast = points[points.length - 2];
  const dx = last.x - prevLast.x;
  const dy = last.y - prevLast.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = len > 0.001 ? -dy / len : 0;
  const ny = len > 0.001 ? dx / len : 0;
  leftPts.push({ x: last.x + nx * half, y: last.y + ny * half });
  rightPts.push({ x: last.x - nx * half, y: last.y - ny * half });

  const outLeft: Point[] = [leftPts[0]];
  const outRight: Point[] = [rightPts[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const l1 = Math.sqrt(d1x * d1x + d1y * d1y);
    const l2 = Math.sqrt(d2x * d2x + d2y * d2y);
    if (l1 < 0.001 || l2 < 0.001) {
      outLeft.push(leftPts[i]);
      outRight.push(rightPts[i]);
      continue;
    }
    const n1x = -d1y / l1;
    const n1y = d1x / l1;
    const n2x = -d2y / l2;
    const n2y = d2x / l2;
    const p1 = { x: prev.x + n1x * half, y: prev.y + n1y * half };
    const p2 = { x: curr.x + n2x * half, y: curr.y + n2y * half };
    const dir1 = { x: d1x / l1, y: d1y / l1 };
    const dir2 = { x: d2x / l2, y: d2y / l2 };
    const denom = cross(dir1, dir2);
    if (Math.abs(denom) < 0.0001) {
      outLeft.push(leftPts[i]);
      outRight.push(rightPts[i]);
      continue;
    }
    const diff = { x: p2.x - p1.x, y: p2.y - p1.y };
    const t = cross(diff, dir2) / denom;
    const miterLeft = { x: p1.x + t * dir1.x, y: p1.y + t * dir1.y };
    const distLeft = Math.sqrt((miterLeft.x - curr.x) ** 2 + (miterLeft.y - curr.y) ** 2);
    const useMiterLeft = t >= 0 && t <= l1 && distLeft <= MITER_LIMIT;
    outLeft.push(useMiterLeft ? miterLeft : leftPts[i]);
    const r1 = { x: prev.x - n1x * half, y: prev.y - n1y * half };
    const r2 = { x: curr.x - n2x * half, y: curr.y - n2y * half };
    const rdiff = { x: r2.x - r1.x, y: r2.y - r1.y };
    const tr = cross(rdiff, dir2) / denom;
    const miterRight = { x: r1.x + tr * dir1.x, y: r1.y + tr * dir1.y };
    const distRight = Math.sqrt((miterRight.x - curr.x) ** 2 + (miterRight.y - curr.y) ** 2);
    const useMiterRight = tr >= 0 && tr <= l1 && distRight <= MITER_LIMIT;
    outRight.push(useMiterRight ? miterRight : rightPts[i]);
  }
  outLeft.push(leftPts[leftPts.length - 1]);
  outRight.push(rightPts[rightPts.length - 1]);
  return { left: outLeft, right: outRight };
}

/** Inflate polygon for easier hit testing */
function inflatePolygon(pts: { x: number; y: number }[], padding: number): { x: number; y: number }[] {
  if (pts.length < 3) return pts;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return pts.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-9) return p;
    const scale = 1 + padding / len;
    return { x: cx + dx * scale, y: cy + dy * scale };
  });
}

/** Point in polygon test (ray casting) */
function pointInPolygon(px: number, py: number, path: { x: number; y: number }[]): boolean {
  let inside = false;
  const n = path.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = path[i].x, yi = path[i].y;
    const xj = path[j].x, yj = path[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/** Hit test for line segment with thickness */
function hitTestLine(px: number, py: number, ax: number, ay: number, bx: number, by: number, thick: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return false;
  const nx = -dy / len;
  const ny = dx / len;
  const t = ((px - ax) * dx + (py - ay) * dy) / (len * len);
  if (t < 0 || t > 1) return false;
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  return dist <= thick;
}

export const WallTileSidesSelector: React.FC<WallTileSidesSelectorProps> = ({
  points,
  segmentTileSides,
  frontFacesTiled,
  onChange,
  onFrontFacesChange,
  width = 400,
  height = 220,
  slabThicknessCm = 2,
  adhesiveThicknessCm = 0.5,
  segmentHeights = [],
  wallType = 'block4',
  layingMethod = 'standing',
}) => {
  const wallThicknessM = layingMethod === 'flat' ? 0.215 : (wallType === 'block7' ? 0.14 : 0.10);
  const baseHalfThick = toPixels(wallThicknessM / 2);
  const extraThick = toPixels((slabThicknessCm + adhesiveThicknessCm) / 100);
  const halfThick = Math.max(baseHalfThick + extraThick, 20);

  const { viewPolys, frontLines, outerEdgePaths, centerlinePath, strokeWidthView, toView } = useMemo(() => {
    if (points.length < 2) return {
      viewPolys: [] as { segIdx: number; sideIdx: number; path: string; viewPts: { x: number; y: number }[]; outerEdgePath: string }[],
      frontLines: [] as { faceIdx: number; path: string; ax: number; ay: number; bx: number; by: number }[],
      outerEdgePaths: [] as { segIdx: number; sideIdx: number; path: string }[],
      centerlinePath: "",
      strokeWidthView: 0,
      toView: (_: Point) => ({ x: 0, y: 0 }),
    };

    const { left, right } = computeThickPolylineEdges(points, halfThick);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of [...points, ...left, ...right]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = halfThick * 3;
    const rangeX = Math.max(1, maxX - minX + pad * 2);
    const rangeY = Math.max(1, maxY - minY + pad * 2);
    const scale = Math.min((width - 16) / rangeX, (height - 16) / rangeY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const tx = width / 2 - cx * scale;
    const ty = height / 2 - cy * scale;

    const toView = (p: Point) => ({
      x: p.x * scale + tx,
      y: p.y * scale + ty,
    });

    const centerlinePath = points.map((p, i) => {
      const v = toView(p);
      return `${i === 0 ? "M" : "L"} ${v.x} ${v.y}`;
    }).join(" ");

    const strokeWidthView = 2 * halfThick * scale;

    const viewPolys: { segIdx: number; sideIdx: number; path: string; viewPts: { x: number; y: number }[]; outerEdgePath: string }[] = [];
    const outerEdgePaths: { segIdx: number; sideIdx: number; path: string }[] = [];
    const frontLines: { faceIdx: number; path: string; ax: number; ay: number; bx: number; by: number }[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const l0 = left[i];
      const l1 = left[i + 1];
      const r0 = right[i];
      const r1 = right[i + 1];
      const s0View = [toView(l0), toView(l1), toView(b), toView(a)];
      const s0Outer = `M ${s0View[0].x} ${s0View[0].y} L ${s0View[1].x} ${s0View[1].y}`;
      viewPolys.push({ segIdx: i, sideIdx: 0, path: `M ${s0View[0].x} ${s0View[0].y} L ${s0View[1].x} ${s0View[1].y} L ${s0View[2].x} ${s0View[2].y} L ${s0View[3].x} ${s0View[3].y} Z`, viewPts: s0View, outerEdgePath: s0Outer });
      outerEdgePaths.push({ segIdx: i, sideIdx: 0, path: s0Outer });
      const s1View = [toView(a), toView(b), toView(r1), toView(r0)];
      const s1Outer = `M ${s1View[2].x} ${s1View[2].y} L ${s1View[3].x} ${s1View[3].y}`;
      viewPolys.push({ segIdx: i, sideIdx: 1, path: `M ${s1View[0].x} ${s1View[0].y} L ${s1View[1].x} ${s1View[1].y} L ${s1View[2].x} ${s1View[2].y} L ${s1View[3].x} ${s1View[3].y} Z`, viewPts: s1View, outerEdgePath: s1Outer });
      outerEdgePaths.push({ segIdx: i, sideIdx: 1, path: s1Outer });
    }

    if (left.length > 0 && right.length > 0) {
      const v0 = toView(left[0]);
      const v1 = toView(right[0]);
      frontLines.push({ faceIdx: 0, path: `M ${v0.x} ${v0.y} L ${v1.x} ${v1.y}`, ax: v0.x, ay: v0.y, bx: v1.x, by: v1.y });
      const vl = toView(left[left.length - 1]);
      const vr = toView(right[right.length - 1]);
      frontLines.push({ faceIdx: 1, path: `M ${vl.x} ${vl.y} L ${vr.x} ${vr.y}`, ax: vl.x, ay: vl.y, bx: vr.x, by: vr.y });
    }

    return { viewPolys, frontLines, outerEdgePaths, centerlinePath, strokeWidthView, toView };
  }, [points, width, height, halfThick]);

  const FRONT_HIT_THICK = 24;
  const SEGMENT_HIT_PADDING = 12;

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * width;
      const y = ((e.clientY - rect.top) / rect.height) * height;

      for (let k = frontLines.length - 1; k >= 0; k--) {
        const { faceIdx, ax, ay, bx, by } = frontLines[k];
        if (hitTestLine(x, y, ax, ay, bx, by, FRONT_HIT_THICK)) {
          const next: [boolean, boolean] = [...frontFacesTiled];
          next[faceIdx] = !next[faceIdx];
          onFrontFacesChange(next);
          return;
        }
      }
      for (let k = viewPolys.length - 1; k >= 0; k--) {
        const { segIdx, sideIdx, viewPts } = viewPolys[k];
        const hitPts = inflatePolygon(viewPts, SEGMENT_HIT_PADDING);
        if (pointInPolygon(x, y, hitPts)) {
          const next = segmentTileSides.map((row, i) =>
            i === segIdx ? [...row] : row
          );
          if (!next[segIdx]) next[segIdx] = [false, false];
          next[segIdx][sideIdx] = !next[segIdx][sideIdx];
          onChange(next);
          return;
        }
      }
    },
    [viewPolys, frontLines, segmentTileSides, frontFacesTiled, onChange, onFrontFacesChange, width, height]
  );

  if (points.length < 2) {
    return (
      <div style={{ padding: 12, background: colors.bgDeep, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: radii.lg, fontSize: "0.75rem", color: colors.textLabel }}>
        Wall has too few points.
      </div>
    );
  }

  const sidesCount = segmentTileSides.flat().filter(Boolean).length + frontFacesTiled.filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 600, color: colors.textLabel, textTransform: "uppercase" }}>
        {sidesCount} sides selected for tiling
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ background: colors.bgInputDark, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: radii.lg, cursor: "pointer" }}
        onClick={handleClick}
      >
        <path
          d={centerlinePath}
          fill="none"
          stroke={colors.borderMedium}
          strokeWidth={strokeWidthView}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
        <path d={centerlinePath} fill="none" stroke={colors.bgDeepBorderLight} strokeWidth={1} strokeLinecap="butt" strokeLinejoin="miter" />
        {viewPolys.map(({ segIdx, sideIdx, outerEdgePath }) => {
          const selected = segmentTileSides[segIdx]?.[sideIdx] ?? false;
          return selected ? (
            <path key={`${segIdx}-${sideIdx}`} d={outerEdgePath} fill="none" stroke={colors.green} strokeWidth={4} strokeLinecap="butt" strokeLinejoin="miter" />
          ) : null;
        })}
        {frontLines.map(({ faceIdx, path }) => {
          const selected = frontFacesTiled[faceIdx] ?? false;
          return (
            <g key={`front-${faceIdx}`}>
              <path d={path} fill="none" stroke={selected ? colors.green : colors.bgDeepBorderLight} strokeWidth={selected ? 4 : 2} strokeLinecap="butt" />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
