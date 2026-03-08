// ══════════════════════════════════════════════════════════════
// ResultsModal.tsx – Quick results view for canvas objects
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Clock, Package, Wrench, ChevronRight, Pencil } from "lucide-react";
import { C } from "../geometry";
import { Shape } from "../geometry";
import { isGroundworkLinear, isPathElement } from "../linearElements";
import { translateTaskName, translateUnit } from "../../../lib/translationMap";

interface ResultsModalProps {
  shape: Shape;
  onClose: () => void;
  onEdit: () => void;
  onRename?: (newLabel: string) => void;
}

const TYPE_KEYS: Record<string, string> = {
  wall: "results_type_wall",
  paving: "results_type_paving",
  grass: "results_type_grass",
  slab: "results_type_slab",
  fence: "results_type_fence",
  steps: "results_type_steps",
  kerbs: "results_type_kerbs",
  foundation: "results_type_foundation",
  deck: "results_type_deck",
  turf: "results_type_turf",
  drainage: "results_type_drainage",
  canalPipe: "results_type_canal_pipe",
  waterPipe: "results_type_water_pipe",
  cable: "results_type_cable",
};

const SUBTYPE_KEYS: Record<string, string> = {
  brick: "results_subtype_brick",
  block4: "results_subtype_block4",
  block7: "results_subtype_block7",
  sleeper: "results_subtype_sleeper",
  kl: "results_subtype_kl",
  rumbled: "results_subtype_rumbled",
  flat: "results_subtype_flat",
  sets: "results_subtype_sets",
  vertical: "results_subtype_vertical",
  horizontal: "results_subtype_horizontal",
  venetian: "results_subtype_venetian",
  composite: "results_subtype_composite",
  l_shape: "results_subtype_l_shape",
  u_shape: "results_subtype_u_shape",
};

export const ResultsModal: React.FC<ResultsModalProps> = ({ shape, onClose, onEdit, onRename }) => {
  const { t } = useTranslation(["project", "calculator", "common", "units"]);
  const r = shape.calculatorResults;
  if (!r) return null;

  const defaultName = t("project:results_object");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(shape.label || defaultName);
  useEffect(() => { setNameValue(shape.label || defaultName); }, [shape.label, defaultName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !editingName) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editingName, onClose]);

  const typeKey = shape.calculatorType ?? (isGroundworkLinear(shape) ? shape.elementType : "");
  const typeTKey = TYPE_KEYS[typeKey];
  let typeName = typeTKey ? t(`project:${typeTKey}`) : typeKey ?? "";
  const subTKey = SUBTYPE_KEYS[shape.calculatorSubType ?? ""];
  const subName = subTKey ? t(`project:${subTKey}`) : "";
  if (isPathElement(shape)) {
    typeName = shape.elementType === "pathSlabs" ? t("project:results_path_slabs") : shape.elementType === "pathConcreteSlabs" ? t("project:results_path_concrete_slabs") : t("project:results_path_monoblock");
  }
  const fullType = subName ? `${typeName} (${subName})` : typeName;

  const canEditName = !!onRename;

  const totalHours: number = r.hours_worked ?? r.totalHours ?? r.labor ?? 0;
  const materials: { name: string; quantity: number; unit: string }[] = r.materials ?? [];
  const tasks: { task?: string; name?: string; hours: number }[] = r.taskBreakdown ?? [];

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

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onMouseDown={onClose}
    >
      <div
        style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 10, width: "100%", maxWidth: "min(96vw, 900px)", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.6)", overflow: "hidden" }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.panelBorder}` }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
            {editingName && canEditName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={() => { if (nameValue.trim()) onRename?.(nameValue.trim()); setEditingName(false); }}
                onKeyDown={e => { if (e.key === "Enter") { if (nameValue.trim()) onRename?.(nameValue.trim()); setEditingName(false); } if (e.key === "Escape") { setNameValue(shape.label || defaultName); setEditingName(false); } }}
                style={{ width: "100%", padding: "4px 8px", background: C.bg, border: `1px solid ${C.accent}`, borderRadius: 4, color: C.text, fontSize: 15, fontWeight: 700 }}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{nameValue || t("project:results_object")}</div>
                {canEditName && (
                  <button onClick={() => setEditingName(true)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.textDim, padding: 2, display: "flex" }} title={t("project:results_edit_name")}>
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}
            <div style={{ fontSize: 12, color: C.accent, fontWeight: 500 }}>{fullType}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.textDim, padding: 4, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Total hours + amount */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <StatCard icon={<Clock size={15} />} label={t("project:results_total_labour")} value={fmtH(totalHours)} color={C.accent} />
            {r.amount != null && (
              <StatCard icon={<Package size={15} />} label={r.unit ? translateUnit(r.unit, t) : "units"} value={fmtQ(r.amount)} color="#6c5ce7" />
            )}
          </div>

          {/* Materials */}
          {materials.length > 0 && (
            <Section title={t("project:results_materials")} icon={<Package size={13} />}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {[t("project:results_material"), t("project:results_qty"), t("project:results_unit")].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: C.textDim, fontWeight: 500, fontSize: 11, borderBottom: `1px solid ${C.panelBorder}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                      <td style={{ padding: "6px 8px", color: C.text }}>{m.name}</td>
                      <td style={{ padding: "6px 8px", color: C.accent, fontWeight: 600 }}>{fmtQ(m.quantity)}</td>
                      <td style={{ padding: "6px 8px", color: C.textDim }}>{translateUnit(m.unit, t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Task breakdown */}
          {tasks.length > 0 && (
            <Section title={t("project:results_task_breakdown")} icon={<Wrench size={13} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {tasks.map((task, i) => {
                  const rawName = task.task ?? task.name ?? t("project:results_task_fallback", { n: i + 1 });
                  const name = translateTaskName(rawName, t);
                  const pct = totalHours > 0 ? (task.hours / totalHours) * 100 : 0;
                  return (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: C.text, flex: 1, paddingRight: 8 }}>{name}</span>
                        <span style={{ fontSize: 12, color: C.accent, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtH(task.hours)}</span>
                      </div>
                      <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: C.accent, borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.panelBorder}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {!isGroundworkLinear(shape) && (
            <button
              onClick={onEdit}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13, cursor: "pointer", fontWeight: 500 }}
            >
              {t("project:results_edit")} <ChevronRight size={14} />
            </button>
          )}
          <button
            onClick={onClose}
            style={{ padding: "7px 14px", background: C.accent + "22", border: `1px solid ${C.accent}44`, borderRadius: 6, color: C.accent, fontSize: 13, cursor: "pointer", fontWeight: 600 }}
          >
            {t("project:results_close")}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── helpers ──────────────────────────────────────────────────

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
  <div style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 5, color: C.textDim, fontSize: 11, fontWeight: 500 }}>
      {icon} {label}
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
  </div>
);

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: C.textDim, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {icon} {title}
    </div>
    <div style={{ background: "rgba(0,0,0,0.2)", border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "10px 4px 4px" }}>
      {children}
    </div>
  </div>
);

export default ResultsModal;
