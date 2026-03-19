// ══════════════════════════════════════════════════════════════
// Mini outline: pick one straight edge to align slab / paving pattern.
// Curved edges (arcs) are visible but not selectable.
// ══════════════════════════════════════════════════════════════

import React, { useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Point, Shape } from "../geometry";
import { getEffectivePolygonWithEdgeIndices } from "../arcMath";
import { isLogicalEdgeStraight, type PatternEdgeAlignMode } from "../visualization/slabPattern";
import { colors, radii } from "../../../themes/designTokens";

function hitTestLine(px: number, py: number, ax: number, ay: number, bx: number, by: number, thick: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return false;
  const t = ((px - ax) * dx + (py - ay) * dy) / (len * len);
  if (t < 0 || t > 1) return false;
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY) <= thick;
}

export interface PatternAlignToLineSelectorProps {
  shape: Shape;
  alignMode: PatternEdgeAlignMode;
  selectedEdgeIdx: number | null;
  onSelectStraightEdge: (logicalEdgeIdx: number) => void;
  width?: number;
  height?: number;
}

export const PatternAlignToLineSelector: React.FC<PatternAlignToLineSelectorProps> = ({
  shape,
  alignMode,
  selectedEdgeIdx,
  onSelectStraightEdge,
  width = 200,
  height = 168,
}) => {
  const { t } = useTranslation(["project"]);

  const { segmentPaths, outlinePoints, toView } = useMemo(() => {
    const { points, edgeIndices } = getEffectivePolygonWithEdgeIndices(shape);
    if (points.length < 3) {
      return {
        segmentPaths: [] as { segmentIdx: number; edgeIdx: number; ax: number; ay: number; bx: number; by: number; straight: boolean }[],
        outlinePoints: [] as Point[],
        toView: (_: Point) => ({ x: 0, y: 0 }),
      };
    }

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const pad = 20;
    const rangeX = Math.max(1, maxX - minX + pad * 2);
    const rangeY = Math.max(1, maxY - minY + pad * 2);
    const scale = Math.min((width - 12) / rangeX, (height - 12) / rangeY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const tx = width / 2 - cx * scale;
    const ty = height / 2 - cy * scale;

    const toViewFn = (p: Point) => ({
      x: p.x * scale + tx,
      y: p.y * scale + ty,
    });

    const n = points.length;
    const segmentPaths: { segmentIdx: number; edgeIdx: number; ax: number; ay: number; bx: number; by: number; straight: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const edgeIdx = edgeIndices[j]!;
      const va = toViewFn(points[i]!);
      const vb = toViewFn(points[j]!);
      segmentPaths.push({
        segmentIdx: i,
        edgeIdx,
        ax: va.x,
        ay: va.y,
        bx: vb.x,
        by: vb.y,
        straight: isLogicalEdgeStraight(shape, edgeIdx),
      });
    }

    return { segmentPaths, outlinePoints: points, toView: toViewFn };
  }, [shape, width, height]);

  const EDGE_HIT = 14;

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * width;
      const y = ((e.clientY - rect.top) / rect.height) * height;

      for (let k = segmentPaths.length - 1; k >= 0; k--) {
        const seg = segmentPaths[k]!;
        if (!seg.straight) continue;
        if (hitTestLine(x, y, seg.ax, seg.ay, seg.bx, seg.by, EDGE_HIT)) {
          onSelectStraightEdge(seg.edgeIdx);
          return;
        }
      }
    },
    [segmentPaths, onSelectStraightEdge, width, height]
  );

  if (shape.points.length < 3 || !shape.closed) {
    return null;
  }

  const pathD =
    outlinePoints.length >= 3
      ? outlinePoints.map((p, i) => {
          const v = toView(p);
          return `${i === 0 ? "M" : "L"} ${v.x} ${v.y}`;
        }).join(" ") + " Z"
      : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: width }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: colors.textLabel, lineHeight: 1.35 }}>
        {alignMode === "perpendicular"
          ? t("project:object_card_align_hint_perpendicular")
          : t("project:object_card_align_hint_parallel")}
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          background: "rgba(0,0,0,0.25)",
          border: `1px solid ${colors.bgDeepBorder}`,
          borderRadius: radii.md,
          cursor: "pointer",
        }}
        onClick={handleClick}
      >
        <path d={pathD} fill="rgba(45,55,72,0.45)" stroke="rgba(148,163,184,0.35)" strokeWidth={1} strokeLinejoin="miter" />
        {segmentPaths.map((seg) => {
          const isSel = selectedEdgeIdx === seg.edgeIdx;
          if (!seg.straight) {
            return (
              <line
                key={seg.segmentIdx}
                x1={seg.ax}
                y1={seg.ay}
                x2={seg.bx}
                y2={seg.by}
                stroke="rgba(100,116,139,0.45)"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            );
          }
          return (
            <line
              key={seg.segmentIdx}
              x1={seg.ax}
              y1={seg.ay}
              x2={seg.bx}
              y2={seg.by}
              stroke={isSel ? colors.green : "rgba(148,163,184,0.85)"}
              strokeWidth={isSel ? 5 : 2.5}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div style={{ fontSize: 10, color: colors.textMuted, lineHeight: 1.3 }}>{t("project:object_card_align_arc_skip")}</div>
    </div>
  );
};
