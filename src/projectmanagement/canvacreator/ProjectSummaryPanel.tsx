// ══════════════════════════════════════════════════════════════
// ProjectSummaryPanel — Collapsible side panel listing elements + totals
// ══════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, ChevronLeft, Check, HelpCircle, FileDown } from "lucide-react";
import { Shape } from "./geometry";
import { C } from "./geometry";
import { computeAutoFill } from "./objectCard/autoFill";
import { getTypeBadgeText, getTypeBadgeColor } from "./canvasRenderers";
import { isLinearElement } from "./linearElements";

interface ProjectSummaryPanelProps {
  shapes: Shape[];
  onCreateProject: () => void;
  onDownloadPDF?: () => void;
  isSubmitting?: boolean;
  onShapeClick?: (shapeIdx: number) => void;
  onShapeContextMenu?: (shapeIdx: number, e: React.MouseEvent) => void;
}

export default function ProjectSummaryPanel({
  shapes,
  onCreateProject,
  onDownloadPDF,
  isSubmitting = false,
  onShapeClick,
  onShapeContextMenu,
}: ProjectSummaryPanelProps) {
  const { t } = useTranslation(["project"]);
  const [collapsed, setCollapsed] = useState(false);

  const layer2Shapes = shapes.filter(s => s.layer === 2);
  const totalHours = layer2Shapes.reduce((sum, s) => {
    const h = s.calculatorResults?.hours_worked ?? s.calculatorResults?.totalTime ?? 0;
    return sum + (typeof h === "number" ? h : 0);
  }, 0);
  const totalMaterials = layer2Shapes.reduce((sum, s) => {
    const m = s.calculatorResults?.materials ?? [];
    return sum + m.length;
  }, 0);
  const withResults = layer2Shapes.filter(s => s.calculatorResults).length;
  const withoutResults = layer2Shapes.length - withResults;

  if (collapsed) {
    return (
      <div style={{
        width: 40,
        background: C.panel,
        borderLeft: `1px solid ${C.panelBorder}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 12,
      }}>
        <button
          onClick={() => setCollapsed(false)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: C.textDim,
            padding: 4,
          }}
        >
          <ChevronRight size={20} />
        </button>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, transform: "rotate(-90deg)", whiteSpace: "nowrap" }}>
          {t("project:summary_count", { count: layer2Shapes.length })}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: 280,
      background: C.panel,
      borderLeft: `1px solid ${C.panelBorder}`,
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: `1px solid ${C.panelBorder}`,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{t("project:project_summary_title")}</span>
        <button
          onClick={() => setCollapsed(true)}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, padding: 4 }}
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {layer2Shapes.length === 0 ? (
          <div style={{ fontSize: 13, color: C.textDim, textAlign: "center", padding: 24 }}>
            {t("project:no_elements_layer2")}
          </div>
        ) : (
          <>
            {shapes.map((shape, idx) => ({ shape, idx })).filter(x => x.shape.layer === 2).map(({ shape, idx }) => {
              const autoFill = computeAutoFill(shape, shapes);
              const hasResults = !!shape.calculatorResults;
              const areaOrLength = isLinearElement(shape)
                ? `${(autoFill.totalLengthM ?? 0).toFixed(2)} m`
                : `${(autoFill.areaM2 ?? 0).toFixed(2)} m²`;
              const hours = hasResults
                ? (shape.calculatorResults?.hours_worked ?? shape.calculatorResults?.totalTime ?? 0)
                : 0;
              const matCount = (shape.calculatorResults?.materials ?? []).length;
              const isClickable = !!onShapeClick;

              return (
                <div
                  key={idx}
                  onClick={isClickable ? () => onShapeClick!(idx) : undefined}
                  onContextMenu={onShapeContextMenu ? (e) => { e.preventDefault(); onShapeContextMenu(idx, e); } : undefined}
                  style={{
                    padding: "10px 12px",
                    marginBottom: 8,
                    background: C.bg,
                    borderRadius: 8,
                    border: `1px solid ${C.panelBorder}`,
                    fontSize: 12,
                    cursor: isClickable ? "pointer" : "default",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => { if (isClickable) e.currentTarget.style.borderColor = C.accent + "66"; }}
                  onMouseLeave={e => { if (isClickable) e.currentTarget.style.borderColor = C.panelBorder; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                        background: getTypeBadgeColor(shape.calculatorType) + "33",
                        color: getTypeBadgeColor(shape.calculatorType),
                      }}
                    >
                      {getTypeBadgeText(shape.calculatorType)}
                    </span>
                    <span style={{ color: C.text, flex: 1 }}>{shape.label}</span>
                    {hasResults ? (
                      <Check size={14} color={C.accent} />
                    ) : (
                      <HelpCircle size={14} color={C.textDim} />
                    )}
                  </div>
                  <div style={{ color: C.textDim, fontSize: 11 }}>
                    {t("project:area_hours_materials", { area: areaOrLength, hours: hours.toFixed(1), matCount })}
                  </div>
                </div>
              );
            })}

            <div style={{
              marginTop: 12,
              padding: "12px",
              background: C.bg,
              borderRadius: 8,
              border: `1px solid ${C.panelBorder}`,
              fontSize: 13,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: C.textDim }}>{t("project:total_hours")}</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{totalHours.toFixed(1)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: C.textDim }}>{t("project:total_materials")}</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{totalMaterials}</span>
              </div>
              {withoutResults > 0 && (
                <div style={{ fontSize: 11, color: C.open, marginTop: 8 }}>
                  {t("project:elements_without_calculator", { count: withoutResults })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${C.panelBorder}`, display: "flex", flexDirection: "column", gap: 8 }}>
        {onDownloadPDF && (
          <button
            onClick={onDownloadPDF}
            style={{
              width: "100%",
              padding: "10px 16px",
              background: C.button,
              border: `1px solid ${C.panelBorder}`,
              borderRadius: 8,
              color: C.text,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <FileDown size={16} />
            {t("project:plan_pdf_download")}
          </button>
        )}
        <button
          onClick={onCreateProject}
          disabled={isSubmitting || layer2Shapes.length === 0}
          style={{
            width: "100%",
            padding: "12px 20px",
            background: layer2Shapes.length > 0 && !isSubmitting ? C.accent : C.button,
            border: "none",
            borderRadius: 8,
            color: layer2Shapes.length > 0 && !isSubmitting ? "#fff" : C.textDim,
            fontSize: 14,
            fontWeight: 600,
            cursor: layer2Shapes.length > 0 && !isSubmitting ? "pointer" : "default",
          }}
        >
          {isSubmitting ? t("project:creating") : t("project:create_project")}
        </button>
      </div>
    </div>
  );
}
