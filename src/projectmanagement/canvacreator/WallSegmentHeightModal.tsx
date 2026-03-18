import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Shape, Point, distance, PIXELS_PER_METER, C } from "./geometry";
import { colors, spacing, radii, shadows } from "../../themes/designTokens";

export interface SegmentHeight {
  startH: number;
  endH: number;
}

interface WallSegmentHeightModalProps {
  shape: Shape;
  onSave: (segmentHeights: SegmentHeight[]) => void;
  onClose: () => void;
}

export default function WallSegmentHeightModal({ shape, onSave, onClose }: WallSegmentHeightModalProps) {
  const { t } = useTranslation(["project", "common", "form"]);
  const pts = shape.points;
  const n = Math.max(0, pts.length - 1);
  const defaultH = parseFloat(String(shape.calculatorInputs?.height ?? "1")) || 1;

  const [segmentHeights, setSegmentHeights] = useState<SegmentHeight[]>(() => {
    const existing = shape.calculatorInputs?.segmentHeights as SegmentHeight[] | undefined;
    if (existing && existing.length === n) return existing.map(s => ({ ...s }));
    return Array.from({ length: n }, () => ({ startH: defaultH, endH: defaultH }));
  });

  const [applyAllValue, setApplyAllValue] = useState<string>(String(defaultH));

  const segmentLengths = pts.length >= 2
    ? pts.slice(0, -1).map((p, i) => distance(p, pts[i + 1]) / PIXELS_PER_METER)
    : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") {
        e.preventDefault();
        onSave(segmentHeights);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onSave, segmentHeights]);

  const updateSegment = (idx: number, field: "startH" | "endH", value: number) => {
    setSegmentHeights(prev => {
      const next = [...prev];
      if (!next[idx]) next[idx] = { startH: defaultH, endH: defaultH };
      next[idx] = { ...next[idx], [field]: Math.max(0, value) };
      return next;
    });
  };

  const applyToAll = () => {
    const v = parseFloat(applyAllValue) || 0;
    const h = Math.max(0, v);
    setSegmentHeights(prev => prev.map(() => ({ startH: h, endH: h })));
  };

  const slopeCmPerM = (startH: number, endH: number, lenM: number): number | null => {
    if (lenM < 0.001) return null;
    return Math.abs((endH - startH) * 100 / lenM);
  };

  return (
    <div
      className="canvas-modal-backdrop"
      style={{ position: "fixed", inset: 0, background: colors.bgModalBackdrop, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onClick={onClose}
    >
      <div
        className="canvas-modal-content"
        style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 480, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 600, marginBottom: 16, color: C.text }}>{t("project:wall_segment_heights_title")}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          {segmentHeights.map((seg, i) => {
            const lenM = segmentLengths[i] ?? 0;
            const slope = slopeCmPerM(seg.startH, seg.endH, lenM);
            return (
              <div key={i} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: spacing.md, padding: spacing.md, background: "rgba(0,0,0,0.15)", borderRadius: radii.md }}>
                <span style={{ fontSize: 12, color: C.textDim, minWidth: 90 }}>
                  {t("project:wall_segment_label", { n: i + 1, len: lenM.toFixed(2) })}
                </span>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  {t("project:wall_segment_start")}
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={seg.startH}
                    onChange={e => updateSegment(i, "startH", parseFloat(e.target.value) || 0)}
                    style={{ width: 64, padding: "4px 6px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 4, color: C.text, fontSize: 12 }}
                  />
                  m
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  {t("project:wall_segment_end")}
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={seg.endH}
                    onChange={e => updateSegment(i, "endH", parseFloat(e.target.value) || 0)}
                    style={{ width: 64, padding: "4px 6px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 4, color: C.text, fontSize: 12 }}
                  />
                  m
                </label>
                {slope != null && slope > 0.01 && (
                  <span style={{ fontSize: 11, color: C.accent }}>{t("project:wall_slope", { val: slope.toFixed(0) })}</span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: C.textDim }}>{t("project:wall_apply_to_all")}</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={applyAllValue}
            onChange={e => setApplyAllValue(e.target.value)}
            style={{ width: 64, padding: "4px 6px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 4, color: C.text, fontSize: 12 }}
          />
          <span style={{ fontSize: 12, color: C.textDim }}>m</span>
          <button
            onClick={applyToAll}
            style={{ padding: "6px 12px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, cursor: "pointer", fontSize: 12 }}
          >
            {t("project:wall_apply")}
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 16px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, cursor: "pointer", fontSize: 13 }}
          >
            {t("common:cancel")}
          </button>
          <button
            onClick={() => onSave(segmentHeights)}
            style={{ padding: "8px 16px", background: C.accent, border: "none", borderRadius: 6, color: C.bg, cursor: "pointer", fontSize: 13 }}
          >
            {t("form:save")}
          </button>
        </div>
      </div>
    </div>
  );
}
