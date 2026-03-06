// ══════════════════════════════════════════════════════════════
// CreatePreviewModal — Preview task breakdown & materials before creating project
// UI matches dark theme design with DM Sans, teal/green accents
// ══════════════════════════════════════════════════════════════

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, Clock, Wrench, FileText, Check, Sparkles, AlertCircle } from "lucide-react";
import { translateTaskName, translateMaterialName, translateUnit } from "../../lib/translationMap";
import { Shape } from "./geometry";
import { ProjectSettings } from "./types";
import { isGroundworkLinear } from "./linearElements";

// Design tokens from preview modal spec
const D = {
  bgOverlay: "rgba(8, 14, 24, 0.75)",
  bgModal: "#141c2b",
  bgCard: "#1a2536",
  bgRowEven: "rgba(255, 255, 255, 0.025)",
  bgRowHover: "rgba(255, 255, 255, 0.045)",
  bgSectionHeader: "rgba(45, 65, 95, 0.25)",
  border: "#253350",
  borderSubtle: "#1e2d44",
  borderTable: "rgba(255, 255, 255, 0.04)",
  textPrimary: "#e4e9f0",
  textSecondary: "#8a9ab5",
  textMuted: "#556680",
  textSection: "#c8d4e4",
  accent: "#22c55e",
  accentDim: "rgba(34, 197, 94, 0.12)",
  teal: "#2dd4bf",
  tealDim: "rgba(45, 212, 191, 0.1)",
  blue: "#3b82f6",
  blueDim: "rgba(59, 130, 246, 0.1)",
  radius: 12,
  radiusSm: 8,
  radiusXs: 6,
} as const;

interface CreatePreviewModalProps {
  shapes: Shape[];
  projectSettings: ProjectSettings;
  onConfirm: () => void;
  onCancel: () => void;
  onOpenProjectCard?: () => void;
}

function isProjectCardComplete(ps: ProjectSettings): boolean {
  const hasDetails = !!(ps.title?.trim() && ps.startDate && ps.endDate);
  const hasEquipment = !ps.calculateTransport || (
    !!(parseFloat(ps.transportDistance || "0") > 0 && (ps.selectedCarrier || ps.selectedMaterialCarrier))
  );
  return hasDetails && hasEquipment;
}

type TaskItem = { task: string; name?: string; hours: number; amount?: number | string; unit?: string };
type MaterialItem = { name: string; quantity: number; unit: string };

function aggregatePreview(shapes: Shape[]) {
  const layer2Shapes = shapes.filter((s) => s.layer === 2 && s.calculatorResults);
  const tasksByElement: { elementName: string; tasks: TaskItem[]; isGroundwork: boolean }[] = [];
  const materialMap = new Map<string, MaterialItem>();
  let totalHours = 0;

  for (const shape of layer2Shapes) {
    const r = shape.calculatorResults!;
    const elementName = shape.label || r.name || shape.calculatorType || t("project:create_preview_element_fallback");
    const isGroundwork = isGroundworkLinear(shape);

    if (r.taskBreakdown && r.taskBreakdown.length > 0) {
      const tasks: TaskItem[] = r.taskBreakdown
        .map((t: any) => ({
          task: t.task ?? t.name ?? "",
          name: t.name,
          hours: t.hours ?? 0,
          amount: t.amount,
          unit: t.unit,
        }))
        .sort((a: TaskItem, b: TaskItem) => (b.hours ?? 0) - (a.hours ?? 0)); // most hours first
      tasksByElement.push({ elementName, tasks, isGroundwork });
      totalHours += tasks.reduce((s, t) => s + (t.hours ?? 0), 0);
    } else {
      const h = r.hours_worked ?? r.totalTime ?? r.labor ?? 0;
      if (h > 0) {
        tasksByElement.push({
          elementName,
          tasks: [{ task: elementName, hours: h, amount: r.amount, unit: r.unit }],
          isGroundwork,
        });
        totalHours += h;
      }
    }

    if (r.materials) {
      for (const m of r.materials) {
        if (!m.quantity || m.quantity <= 0) continue;
        const key = `${(m.name || "").trim()}|${(m.unit || "").trim()}`;
        const existing = materialMap.get(key);
        if (existing) {
          existing.quantity += m.quantity;
        } else {
          materialMap.set(key, { name: m.name || "", quantity: m.quantity, unit: m.unit || "" });
        }
      }
    }
  }

  const materials = Array.from(materialMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Sort: groundwork linear always at the end; otherwise by total hours (most first)
  tasksByElement.sort((a, b) => {
    if (a.isGroundwork !== b.isGroundwork) return a.isGroundwork ? 1 : -1;
    const sumA = a.tasks.reduce((s, t) => s + (t.hours ?? 0), 0);
    const sumB = b.tasks.reduce((s, t) => s + (t.hours ?? 0), 0);
    return sumB - sumA;
  });

  return { tasksByElement, materials, totalHours };
}

function calcGroupTotal(tasks: TaskItem[]): string {
  const totalMin = tasks.reduce((s, t) => {
    // t.hours is in hours; convert to minutes for sum
    return s + t.hours * 60;
  }, 0);
  const h = totalMin / 60;
  return `${h.toFixed(1)} h`;
}

export default function CreatePreviewModal({
  shapes,
  projectSettings,
  onConfirm,
  onCancel,
  onOpenProjectCard,
}: CreatePreviewModalProps) {
  const { t } = useTranslation(["project", "calculator", "material", "units"]);
  const { tasksByElement, materials, totalHours } = aggregatePreview(shapes, t("project:create_preview_element_fallback"));
  const isCardComplete = isProjectCardComplete(projectSettings);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const fmtH = (h: number) => {
    if (!h) return "0 h";
    if (h < 1) return `${Math.round(h * 60)} min`;
    return `${h.toFixed(1)} h`;
  };

  const fmtQ = (q: number | undefined) => {
    if (q == null) return "—";
    if (Number.isInteger(q)) return q.toString();
    return q.toFixed(2);
  };

  const statusLabel = projectSettings.status
    ? String(projectSettings.status).replace(/_/g, " ").toLowerCase()
    : "planned";

  const modalContent = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: D.bgOverlay,
        backdropFilter: "blur(6px)",
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onMouseDown={onCancel}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 800,
          maxHeight: "90vh",
          background: D.bgModal,
          borderRadius: 16,
          border: `1px solid ${D.border}`,
          display: "flex",
          flexDirection: "column",
          boxShadow:
            "0 24px 80px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)",
          overflow: "hidden",
          fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "20px 24px",
            borderBottom: `1px solid ${D.borderSubtle}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 10,
              background: D.tealDim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FileText size={22} color={D.teal} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: D.textPrimary, lineHeight: 1.3, margin: 0 }}>
              {t("project:create_preview_title")}
            </h2>
            <p style={{ fontSize: "0.9rem", color: D.textSecondary, marginTop: 1, margin: 0 }}>
              {t("project:create_preview_subtitle")}
            </p>
          </div>
          <button
            onClick={onCancel}
            style={{
              width: 34,
              height: 34,
              borderRadius: D.radiusXs,
              border: "none",
              background: "transparent",
              color: D.textMuted,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px 8px",
            scrollbarWidth: "thin",
          }}
        >
          {/* Project Card incomplete alert */}
          {!isCardComplete && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: 16,
                marginBottom: 20,
                background: "rgba(255, 159, 67, 0.12)",
                border: "1px solid rgba(255, 159, 67, 0.35)",
                borderRadius: D.radius,
              }}
            >
              <div style={{ flexShrink: 0 }}><AlertCircle size={22} color="#ff9f43" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: D.textPrimary, marginBottom: 4 }}>
                  {t("project:create_preview_card_incomplete_title")}
                </div>
                <div style={{ fontSize: "0.88rem", color: D.textSecondary, lineHeight: 1.45, marginBottom: 12 }}>
                  {t("project:create_preview_card_incomplete_message")}
                </div>
                {onOpenProjectCard && (
                  <button
                    onClick={() => { onCancel(); onOpenProjectCard(); }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: D.radiusSm,
                      fontFamily: "inherit",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      border: "1px solid rgba(255, 159, 67, 0.5)",
                      background: "rgba(255, 159, 67, 0.2)",
                      color: "#ff9f43",
                    }}
                  >
                    {t("project:create_preview_open_project_card")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Project info */}
          <SectionLabel title={t("project:create_preview_project_info")} icon={<FileText size={17} />} />
          <div
            style={{
              background: D.bgCard,
              borderRadius: D.radius,
              border: `1px solid ${D.borderSubtle}`,
              overflow: "hidden",
              marginBottom: 20,
            }}
          >
            <InfoRow label={t("project:create_preview_title_label")} value={projectSettings.title || "—"} first />
            <InfoRow
              label={t("project:create_preview_dates")}
              value={
                projectSettings.startDate && projectSettings.endDate
                  ? `${projectSettings.startDate} — ${projectSettings.endDate}`
                  : "—"
              }
              even
            />
            <InfoRow
              label={t("project:create_preview_status")}
              value={
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: "0.96rem",
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 20,
                    background: D.blueDim,
                    color: D.blue,
                    textTransform: "capitalize",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                  {statusLabel}
                </span>
              }
              even={false}
            />
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
            <StatCard
              type="hours"
              label={t("project:create_preview_total_hours")}
              value={`${totalHours.toFixed(1)}`}
              unit="h"
            />
            <StatCard
              type="materials"
              label={t("project:create_preview_total_materials")}
              value={materials.length.toString()}
            />
          </div>

          {/* Task breakdown */}
          {tasksByElement.length > 0 && (
            <>
              <SectionLabel title={t("project:create_preview_task_breakdown")} icon={<Wrench size={17} />} />
              <div
                style={{
                  background: D.bgCard,
                  borderRadius: D.radius,
                  border: `1px solid ${D.borderSubtle}`,
                  overflow: "hidden",
                  marginBottom: 22,
                }}
              >
                {tasksByElement.map(({ elementName, tasks }, ei) => (
                  <React.Fragment key={ei}>
                    <div
                      style={{
                        textAlign: "center",
                        padding: "10px 16px",
                        background: D.bgSectionHeader,
                        borderTop: ei > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: "0.92rem",
                          fontWeight: 700,
                          color: D.textSection,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        <span
                          style={{
                            width: 30,
                            height: 1,
                            background: `linear-gradient(90deg, transparent, ${D.textMuted})`,
                          }}
                        />
                        {elementName}
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            color: D.textMuted,
                            background: "rgba(255,255,255,0.04)",
                            padding: "1px 7px",
                            borderRadius: 10,
                            marginLeft: 2,
                          }}
                        >
                          {tasks.length}
                        </span>
                        <span
                          style={{
                            width: 30,
                            height: 1,
                            background: `linear-gradient(90deg, ${D.textMuted}, transparent)`,
                          }}
                        />
                      </span>
                    </div>
                    {tasks.map((task, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 16px",
                          background: i % 2 === 1 ? D.bgRowEven : "transparent",
                        }}
                      >
                        <span style={{ fontSize: "0.94rem", color: D.textPrimary, fontWeight: 450 }}>
                          {translateTaskName(task.task || task.name || t("project:results_task_fallback", { n: i + 1 }), (k) => t(k))}
                        </span>
                        <span
                          style={{
                            fontSize: "0.9rem",
                            fontWeight: 600,
                            color: D.textSecondary,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {fmtH(t.hours)}
                        </span>
                      </div>
                    ))}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 16px 8px",
                        borderTop: "1px dashed rgba(255,255,255,0.06)",
                      }}
                    >
                      <span style={{ fontSize: "0.82rem", color: D.textMuted, fontWeight: 600, fontStyle: "italic" }}>
                        {t("project:create_preview_subtotal")}
                      </span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: "0.9rem",
                          fontWeight: 700,
                          color: D.teal,
                        }}
                      >
                        {calcGroupTotal(tasks)}
                      </span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </>
          )}

          {/* Materials */}
          {materials.length > 0 && (
            <>
              <SectionLabel title={t("project:create_preview_materials")} icon={<Sparkles size={17} />} />
              <div
                style={{
                  background: D.bgCard,
                  borderRadius: D.radius,
                  border: `1px solid ${D.borderSubtle}`,
                  overflow: "hidden",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 90px 100px",
                    padding: "9px 16px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: D.textMuted }}>
                    {t("project:create_preview_material")}
                  </span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: D.textMuted, textAlign: "center" }}>
                    {t("project:create_preview_qty")}
                  </span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: D.textMuted }}>
                    {t("project:create_preview_unit")}
                  </span>
                </div>
                {materials.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 90px 100px",
                      padding: "9px 16px",
                      alignItems: "center",
                      background: i % 2 === 1 ? D.bgRowEven : "transparent",
                      borderTop: i > 0 ? `1px solid ${D.borderTable}` : "none",
                    }}
                  >
                    <span style={{ fontSize: "0.94rem", color: D.textPrimary, fontWeight: 500 }}>{translateMaterialName(m.name, (k) => t(k))}</span>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "0.92rem",
                        fontWeight: 600,
                        color: D.accent,
                        textAlign: "center",
                      }}
                    >
                      {fmtQ(m.quantity)}
                    </span>
                    <span style={{ fontSize: "0.9rem", color: D.textMuted, fontWeight: 500 }}>{translateUnit(m.unit, t)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            padding: "16px 24px",
            borderTop: `1px solid ${D.borderSubtle}`,
            flexShrink: 0,
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "9px 22px",
              borderRadius: D.radiusSm,
              fontFamily: "inherit",
              fontSize: "0.96rem",
              fontWeight: 600,
              cursor: "pointer",
              border: `1px solid ${D.border}`,
              background: "transparent",
              color: D.textSecondary,
            }}
          >
            {t("project:cancel_button_label")}
          </button>
          <button
            onClick={isCardComplete ? onConfirm : undefined}
            disabled={!isCardComplete}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 22px",
              borderRadius: D.radiusSm,
              fontFamily: "inherit",
              fontSize: "0.96rem",
              fontWeight: 600,
              cursor: isCardComplete ? "pointer" : "default",
              border: "none",
              background: isCardComplete ? D.accent : "rgba(255,255,255,0.1)",
              color: isCardComplete ? "#fff" : D.textMuted,
              opacity: isCardComplete ? 1 : 0.7,
            }}
          >
            <Check size={17} />
            {t("project:create_preview_confirm")}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

const SectionLabel: React.FC<{ title: string; icon: React.ReactNode }> = ({ title, icon }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontSize: "0.82rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: D.textSecondary,
      marginBottom: 10,
      marginTop: 4,
    }}
  >
    <span style={{ color: D.textMuted }}>{icon}</span>
    {title}
  </div>
);

const InfoRow: React.FC<{
  label: string;
  value: React.ReactNode;
  even?: boolean;
  first?: boolean;
}> = ({ label, value, even = false, first = false }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px 16px",
      background: even ? D.bgRowEven : "transparent",
      borderTop: first ? "none" : `1px solid ${D.borderTable}`,
    }}
  >
    <span style={{ fontSize: "0.94rem", color: D.textSecondary, fontWeight: 500 }}>{label}</span>
    <span
      style={{
        fontSize: "0.94rem",
        color: typeof value === "string" && value === "—" ? D.textMuted : D.textPrimary,
        fontWeight: 600,
        textAlign: "right",
        maxWidth: "60%",
      }}
    >
      {value}
    </span>
  </div>
);

const StatCard: React.FC<{
  type: "hours" | "materials";
  label: string;
  value: string;
  unit?: string;
}> = ({ type, label, value, unit }) => (
  <div
    style={{
      background: D.bgCard,
      border: `1px solid ${D.borderSubtle}`,
      borderRadius: D.radius,
      padding: "14px 16px",
      position: "relative",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: type === "hours" ? `linear-gradient(90deg, ${D.teal}, transparent)` : `linear-gradient(90deg, ${D.accent}, transparent)`,
      }}
    />
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: "0.82rem",
        fontWeight: 600,
        color: D.textSecondary,
        marginBottom: 6,
      }}
    >
      {type === "hours" ? <Clock size={16} color={D.teal} /> : <Sparkles size={16} color={D.accent} />}
      {label}
    </div>
    <div style={{ fontSize: "1.8rem", fontWeight: 800, lineHeight: 1, color: D.textPrimary }}>
      {value}
      {unit && <span style={{ fontSize: "1rem", fontWeight: 600, color: D.textSecondary, marginLeft: 2 }}>{unit}</span>}
    </div>
  </div>
);
