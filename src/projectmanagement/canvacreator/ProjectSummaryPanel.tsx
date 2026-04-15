// ══════════════════════════════════════════════════════════════
// ProjectSummaryPanel — Collapsible side panel listing elements + totals
// ══════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, ChevronLeft, Check, HelpCircle, FileDown } from "lucide-react";
import { Shape, polylineLengthMeters } from "./geometry";
import { colors } from "../../themes/designTokens";
import { computeAutoFill } from "./objectCard/autoFill";
import { getTypeBadgeText, getTypeBadgeColor } from "./canvasRenderers";
import { isLinearElement, isGroundworkLinear, groundworkLabel } from "./linearElements";
import { computePreparation } from "./preparationLogic";

interface ProjectSummaryPanelProps {
  shapes: Shape[];
  onCreateProject: () => void;
  onDownloadPDF?: () => void;
  isSubmitting?: boolean;
  onShapeClick?: (shapeIdx: number) => void;
  onShapeContextMenu?: (shapeIdx: number, e: React.MouseEvent) => void;
  /** Layer 5: excavation/fill volumes + groundwork — same scroll area as summary */
  preparationSection?: React.ReactNode;
}

export default function ProjectSummaryPanel({
  shapes,
  onCreateProject,
  onDownloadPDF,
  isSubmitting = false,
  onShapeClick,
  onShapeContextMenu,
  preparationSection,
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
        background: colors.bgElevated,
        borderLeft: `1px solid ${colors.borderDefault}`,
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
            color: colors.textDim,
            padding: 4,
          }}
        >
          <ChevronRight size={20} />
        </button>
        <div style={{ fontSize: 11, color: colors.textDim, marginTop: 8, transform: "rotate(-90deg)", whiteSpace: "nowrap" }}>
          {t("project:summary_count", { count: layer2Shapes.length })}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: 280,
      background: colors.bgElevated,
      borderLeft: `1px solid ${colors.borderDefault}`,
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
        borderBottom: `1px solid ${colors.borderDefault}`,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>{t("project:project_summary_title")}</span>
        <button
          onClick={() => setCollapsed(true)}
          style={{ background: "none", border: "none", cursor: "pointer", color: colors.textDim, padding: 4 }}
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 12, maxHeight: "clamp(200px, 45vh, 520px)", minHeight: 0 }}>
        {layer2Shapes.length === 0 ? (
          <div style={{ fontSize: 13, color: colors.textDim, textAlign: "center", padding: 24 }}>
            {t("project:no_elements_layer2")}
          </div>
        ) : (
          shapes.map((shape, idx) => ({ shape, idx })).filter(x => x.shape.layer === 2).map(({ shape, idx }) => {
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
                  background: colors.bgInput,
                  borderRadius: 8,
                  border: `1px solid ${colors.borderDefault}`,
                  fontSize: 12,
                  cursor: isClickable ? "pointer" : "default",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={e => { if (isClickable) e.currentTarget.style.borderColor = colors.accentBlue + "66"; }}
                onMouseLeave={e => { if (isClickable) e.currentTarget.style.borderColor = colors.borderDefault; }}
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
                  <span style={{ color: colors.textPrimary, flex: 1 }}>{shape.label}</span>
                  {hasResults ? (
                    <Check size={14} color={colors.accentBlue} />
                  ) : (
                    <HelpCircle size={14} color={colors.textDim} />
                  )}
                </div>
                <div style={{ color: colors.textDim, fontSize: 11 }}>
                  {t("project:area_hours_materials", { area: areaOrLength, hours: hours.toFixed(1), matCount })}
                </div>
              </div>
            );
          })
        )}

        {preparationSection}

        <div style={{
          marginTop: 12,
          padding: "12px",
          background: colors.bgInput,
          borderRadius: 8,
          border: `1px solid ${colors.borderDefault}`,
          fontSize: 13,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: colors.textDim }}>{t("project:total_hours")}</span>
            <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{totalHours.toFixed(1)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: colors.textDim }}>{t("project:total_materials")}</span>
            <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{totalMaterials}</span>
          </div>
          {layer2Shapes.length > 0 && withoutResults > 0 && (
            <div style={{ fontSize: 11, color: colors.orange, marginTop: 8 }}>
              {t("project:elements_without_calculator", { count: withoutResults })}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${colors.borderDefault}`, display: "flex", flexDirection: "column", gap: 8 }}>
        {onDownloadPDF && (
          <button
            onClick={onDownloadPDF}
            style={{
              width: "100%",
              padding: "10px 16px",
              background: colors.bgOverlay,
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: 8,
              color: colors.textPrimary,
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
            background: layer2Shapes.length > 0 && !isSubmitting ? colors.accentBlue : colors.bgOverlay,
            border: "none",
            borderRadius: 8,
            color: layer2Shapes.length > 0 && !isSubmitting ? "#fff" : colors.textDim,
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

/** Inline block for Layer 5 — excavation/fill from terrain vs element (inside project summary scroll). */
export function PreparationSidebarContent({
  shapes,
  soilType,
  levelingMaterial,
  onGroundworkClick,
}: {
  shapes: Shape[];
  soilType: "clay" | "sand" | "rock";
  levelingMaterial: "tape1" | "soil";
  onGroundworkClick?: (shapeIdx: number) => void;
}) {
  const { t } = useTranslation(["project"]);
  const result = computePreparation(shapes, soilType, levelingMaterial);
  const groundworkShapes = shapes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.layer === 2 && isGroundworkLinear(s) && s.points.length >= 2);

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.borderDefault}` }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: colors.textDim,
        marginBottom: 10,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}>
        {t("project:preparation_volumes_section")}
      </div>
      {groundworkShapes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, marginBottom: 8 }}>{t("project:groundwork_linear_label")}</div>
          {groundworkShapes.map(({ s, i }) => {
            const lenM = polylineLengthMeters(s.points);
            return (
              <div
                key={i}
                onClick={() => onGroundworkClick?.(i)}
                style={{
                  padding: "10px 12px",
                  marginBottom: 8,
                  background: colors.bgInput,
                  borderRadius: 8,
                  border: `1px solid ${colors.borderDefault}`,
                  fontSize: 12,
                  cursor: s.calculatorResults ? "pointer" : "default",
                }}
              >
                <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: 4 }}>{s.label || groundworkLabel(s)}</div>
                <div style={{ color: colors.textDim, fontSize: 11 }}>{t("project:total_length")}: {lenM.toFixed(2)} m</div>
                {s.calculatorResults && (
                  <div style={{ fontSize: 10, color: colors.accentBlue, marginTop: 4 }}>{t("project:click_view_results")}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!result.validation.ok ? (
        <div style={{ fontSize: 12, color: colors.red }}>
          {result.validation.elementsWithoutHeights && result.validation.elementsWithoutHeights.length > 0 && (
            <div>
              {t("project:elements_without_heights")}: {result.validation.elementsWithoutHeights.join(", ")}. {t("project:add_heights_geodesy")}
            </div>
          )}
        </div>
      ) : result.elements.length === 0 && groundworkShapes.length === 0 ? (
        <div style={{ fontSize: 13, color: colors.textDim, textAlign: "center", padding: 12 }}>
          {t("project:no_preparation_elements")}
        </div>
      ) : result.elements.length > 0 ? (
        <>
          {result.elements.map((el) => (
            <div
              key={el.shapeIdx}
              style={{
                padding: "10px 12px",
                marginBottom: 8,
                background: colors.bgInput,
                borderRadius: 8,
                border: `1px solid ${colors.borderDefault}`,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: 6 }}>{el.label}</div>
              <div style={{ color: colors.textDim, fontSize: 11 }}>
                {el.areaM2} m² · {t("project:excavation_label")}: {el.excavationM3} m³ ({el.excavationTonnes} t)
              </div>
              <div style={{ color: colors.textDim, fontSize: 11 }}>
                {t("project:fill_label")}: {el.fillM3} m³ ({el.fillTonnes} t) · {el.pctAreaNeedingFill}% {t("project:area_low")}
              </div>
            </div>
          ))}
          <div style={{
            marginTop: 8,
            padding: "12px",
            background: colors.bgInput,
            borderRadius: 8,
            border: `1px solid ${colors.borderDefault}`,
            fontSize: 13,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: colors.textDim }}>{t("project:total_excavation")}</span>
              <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{result.totalExcavationM3} m³</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: colors.textDim }}>{t("project:total_fill")}</span>
              <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{result.totalFillM3} m³</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: colors.textDim }}>{t("project:excavation_tonnes")}</span>
              <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{result.totalExcavationTonnes} t</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: colors.textDim }}>{t("project:fill_tonnes")}</span>
              <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{result.totalFillTonnes} t</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
