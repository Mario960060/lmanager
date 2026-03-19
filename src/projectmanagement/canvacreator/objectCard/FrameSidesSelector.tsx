// ══════════════════════════════════════════════════════════════
// FrameSidesSelector — miniaturka elementu z klikalnymi krawędziami
// Wybór, na których bokach ma być ramka (płyty / kostki).
// Analogicznie do WallTileSidesSelector — zielony = zaznaczona ramka.
// ══════════════════════════════════════════════════════════════

import React, { useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Point } from "../geometry";
import { colors, radii } from "../../../themes/designTokens";

interface FrameSidesSelectorProps {
  /** Punkty wielokąta (obrys) — mogą być zsamplowane (łuki → wiele punktów) */
  points: Point[];
  /** edgeIndices[i] = indeks logicznej krawędzi dla segmentu kończącego się w points[i].
   * Gdy brak: każdy segment = osobna krawędź (points.length krawędzi).
   * Gdy jest: segmenty łuku mają ten sam edgeIdx — jeden klik = cała krawędź. */
  edgeIndices?: number[];
  /** frameSidesEnabled[edgeIdx] = czy ramka na danej logicznej krawędzi */
  frameSidesEnabled: boolean[];
  onChange: (frameSidesEnabled: boolean[]) => void;
  width?: number;
  height?: number;
}

/** Hit test dla odcinka z grubością */
function hitTestLine(px: number, py: number, ax: number, ay: number, bx: number, by: number, thick: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return false;
  const t = ((px - ax) * dx + (py - ay) * dy) / (len * len);
  if (t < 0 || t > 1) return false;
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  return dist <= thick;
}

export const FrameSidesSelector: React.FC<FrameSidesSelectorProps> = ({
  points,
  edgeIndices: edgeIndicesProp,
  frameSidesEnabled,
  onChange,
  width = 280,
  height = 200,
}) => {
  const { t } = useTranslation(["calculator"]);
  const { segmentPaths, numLogicalEdges, toView } = useMemo(() => {
    if (points.length < 3) {
      return {
        segmentPaths: [] as { segmentIdx: number; edgeIdx: number; path: string; ax: number; ay: number; bx: number; by: number }[],
        numLogicalEdges: 0,
        toView: (_: Point) => ({ x: 0, y: 0 }),
      };
    }

    const n = points.length;
    const edgeIndices = edgeIndicesProp ?? points.map((_, i) => i);
    const numLogicalEdges = Math.max(...edgeIndices, -1) + 1;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = 24;
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

    const segmentPaths: { segmentIdx: number; edgeIdx: number; path: string; ax: number; ay: number; bx: number; by: number }[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const edgeIdx = edgeIndices[j];
      const a = points[i];
      const b = points[j];
      const va = toView(a);
      const vb = toView(b);
      segmentPaths.push({
        segmentIdx: i,
        edgeIdx,
        path: `M ${va.x} ${va.y} L ${vb.x} ${vb.y}`,
        ax: va.x,
        ay: va.y,
        bx: vb.x,
        by: vb.y,
      });
    }

    return { segmentPaths, numLogicalEdges, toView };
  }, [points, edgeIndicesProp, width, height]);

  const EDGE_HIT_THICK = 16;

  const effectiveEnabled = useMemo(() => {
    if (frameSidesEnabled.length >= numLogicalEdges) return frameSidesEnabled;
    return Array.from({ length: numLogicalEdges }, (_, i) => frameSidesEnabled[i] !== false);
  }, [numLogicalEdges, frameSidesEnabled]);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * width;
      const y = ((e.clientY - rect.top) / rect.height) * height;

      for (let k = segmentPaths.length - 1; k >= 0; k--) {
        const { edgeIdx, ax, ay, bx, by } = segmentPaths[k];
        if (hitTestLine(x, y, ax, ay, bx, by, EDGE_HIT_THICK)) {
          const next = Array.from({ length: numLogicalEdges }, (_, i) => effectiveEnabled[i] !== false);
          next[edgeIdx] = !next[edgeIdx];
          onChange(next);
          return;
        }
      }
    },
    [segmentPaths, effectiveEnabled, numLogicalEdges, onChange, width, height]
  );

  if (points.length < 3) {
    return (
      <div style={{ padding: 12, background: colors.bgDeep, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: radii.lg, fontSize: "0.75rem", color: colors.textLabel }}>
        Element ma za mało punktów.
      </div>
    );
  }

  const enabledCount = effectiveEnabled.filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 600, color: colors.textLabel, textTransform: "uppercase" }}>
        {t("calculator:frame_sides_count", { count: enabledCount })} — {t("calculator:frame_sides_hint")}
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ background: colors.bgInputDark, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: radii.lg, cursor: "pointer" }}
        onClick={handleClick}
      >
        <path
          d={points.map((p, i) => {
            const v = toView(p);
            return `${i === 0 ? "M" : "L"} ${v.x} ${v.y}`;
          }).join(" ") + " Z"}
          fill="rgba(45,55,72,0.5)"
          stroke={colors.bgDeepBorderLight}
          strokeWidth={1}
          strokeLinejoin="miter"
        />
        {segmentPaths.map(({ segmentIdx, edgeIdx, path }) => {
          const selected = effectiveEnabled[edgeIdx] !== false;
          return (
            <path
              key={segmentIdx}
              d={path}
              fill="none"
              stroke={selected ? colors.green : colors.textDim}
              strokeWidth={selected ? 5 : 2}
              strokeLinecap="round"
              strokeLinejoin="miter"
            />
          );
        })}
      </svg>
    </div>
  );
};
