import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Calendar, Tag, Truck, Wrench, FileText } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../lib/store";
import { ProjectSettings } from "./types";
import { C } from "./geometry";
import { COMPACTORS, type CompactorOption } from "../../components/Calculator/CompactorSelector";
import { getFoundationDiggingMethodFromExcavator } from "./GroundworkLinearCalculator";
import DatePicker from "../../components/DatePicker";
import { colors, radii, shadows } from "../../themes/designTokens";

interface ProjectCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectSettings: ProjectSettings;
  onSave: (updates: Partial<ProjectSettings>) => void;
}

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  "size (in tones)": number | null;
  speed_m_per_hour?: number | null;
}

type Tab = "details" | "equipment";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: C.bg,
  border: `1px solid ${C.panelBorder}`,
  borderRadius: 8,
  color: C.text,
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  transition: "border-color 0.2s",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: C.textDim,
  marginBottom: 6,
  fontWeight: 500,
  letterSpacing: "0.02em",
};

export default function ProjectCardModal({
  isOpen,
  onClose,
  projectSettings,
  onSave,
}: ProjectCardModalProps) {
  const { t } = useTranslation(["project"]);
  const companyId = useAuthStore((s) => s.getCompanyId());
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriers, setCarriers] = useState<DiggingEquipment[]>([]);
  const [compactors, setCompactors] = useState<DiggingEquipment[]>([]);
  const [loadingEquipment, setLoadingEquipment] = useState(false);

  useEffect(() => {
    if (!isOpen || !companyId) return;
    const fetchEquipment = async () => {
      setLoadingEquipment(true);
      try {
        const [excRes, carRes, compRes] = await Promise.all([
          supabase.from("setup_digging").select("*").eq("type", "excavator").eq("company_id", companyId),
          supabase.from("setup_digging").select("*").eq("type", "barrows_dumpers").eq("company_id", companyId),
          supabase.from("setup_digging").select("*").eq("type", "compactor").eq("company_id", companyId),
        ]);
        setExcavators(excRes.data || []);
        setCarriers(carRes.data || []);
        setCompactors(compRes.data || []);
      } catch (e) {
        console.error("Error fetching equipment:", e);
      } finally {
        setLoadingEquipment(false);
      }
    };
    fetchEquipment();
  }, [isOpen, companyId]);

  if (!isOpen) return null;

  const hasTitle = projectSettings.title.trim().length > 0;
  const hasDates = projectSettings.startDate && projectSettings.endDate;
  const completionItems = [
    { done: hasTitle, label: t("project:canvas_completion_title") },
    { done: hasDates, label: t("project:canvas_completion_dates") },
  ];
  const completionPct = completionItems.filter(i => i.done).length / completionItems.length;

  return (
    <div
      className="canvas-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        data-testid="project-card-modal"
        className="canvas-modal-content"
        style={{
          background: C.panel,
          border: `1px solid ${C.panelBorder}`,
          borderRadius: 16,
          width: "90%",
          maxWidth: 560,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: shadows.modal,
          overflow: "hidden",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 0",
            borderBottom: `1px solid ${C.panelBorder}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>
                {projectSettings.title || t("project:untitled_project")}
              </h2>
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>
                {completionItems.filter(i => !i.done).length === 0
                  ? t("project:ready_to_create")
                  : `${t("project:missing")}: ${completionItems.filter(i => !i.done).map(i => i.label).join(", ")}`}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: C.textDim,
                padding: 4,
                borderRadius: 6,
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ height: 3, background: C.panelBorder, borderRadius: 2, marginBottom: 16 }}>
            <div
              style={{
                height: "100%",
                width: `${completionPct * 100}%`,
                background: completionPct === 1 ? C.accent : C.open,
                borderRadius: 2,
                transition: "width 0.3s, background 0.3s",
              }}
            />
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0 }}>
            <TabButton
              active={activeTab === "details"}
              onClick={() => setActiveTab("details")}
              icon={<FileText size={14} />}
              label={t("project:project_details")}
            />
            <TabButton
              active={activeTab === "equipment"}
              onClick={() => setActiveTab("equipment")}
              icon={<Wrench size={14} />}
              label={t("project:equipment")}
            />
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {activeTab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Title */}
              <div>
                <label style={labelStyle}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Tag size={12} /> {t("project:project_title_label")}
                  </span>
                </label>
                <input
                  type="text"
                  placeholder={t("project:enter_project_name_placeholder")}
                  value={projectSettings.title}
                  onChange={e => onSave({ title: e.target.value })}
                  style={inputStyle}
                />
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>{t("project:description_optional")}</label>
                <textarea
                  placeholder={t("project:brief_description_placeholder")}
                  value={projectSettings.description}
                  onChange={e => onSave({ description: e.target.value })}
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    minHeight: 60,
                  }}
                />
              </div>

              {/* Dates row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Calendar size={12} /> {t("project:start_date")}
                    </span>
                  </label>
                  <DatePicker
                    value={projectSettings.startDate}
                    onChange={v => onSave({ startDate: v })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Calendar size={12} /> {t("project:end_date")}
                    </span>
                  </label>
                  <DatePicker
                    value={projectSettings.endDate}
                    onChange={v => onSave({ endDate: v })}
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label style={labelStyle}>{t("project:status_label")}</label>
                <div data-testid="status-buttons" style={{ display: "flex", gap: 8, flexWrap: "nowrap", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  {(["planned", "scheduled", "in_progress"] as const).map(status => {
                    const active = projectSettings.status === status;
                    const labels: Record<string, string> = {
                      planned: t("project:status_planned"),
                      scheduled: t("project:status_scheduled"),
                      in_progress: t("project:status_in_progress"),
                    };
                    const statusColors: Record<string, string> = {
                      planned: C.textDim,
                      scheduled: colors.accentBlue,
                      in_progress: C.accent,
                    };
                    return (
                      <button
                        key={status}
                        data-testid={`status-${status}`}
                        onClick={() => onSave({ status })}
                        style={{
                          flex: "1 1 0",
                          minWidth: 0,
                          padding: "8px 12px",
                          borderRadius: radii.lg,
                          border: `1px solid ${active ? statusColors[status] : C.panelBorder}`,
                          background: active ? statusColors[status] + "22" : C.button,
                          color: active ? statusColors[status] : C.textDim,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: active ? 600 : 400,
                          transition: "all 0.15s",
                          fontFamily: "inherit",
                        }}
                      >
                        {labels[status]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "equipment" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {loadingEquipment ? (
                <div style={{ color: C.textDim, fontSize: 14, textAlign: "center", padding: 32 }}>
                  {t("project:loading_equipment")}
                </div>
              ) : (
                <>
                  <div>
                    <label style={labelStyle}>{t("project:excavator_label_short")}</label>
                    <select
                      value={(projectSettings.selectedExcavator as any)?.id ?? ""}
                      onChange={e => {
                        const eq = excavators.find(x => x.id === e.target.value) || null;
                        onSave({ selectedExcavator: eq });
                      }}
                      style={inputStyle}
                    >
                      <option value="">{t("project:none")}</option>
                      {excavators.map(x => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x["size (in tones)"] ?? "?"}t)
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                      {t("project:foundation_digging_label")}: {(() => {
                        const method = getFoundationDiggingMethodFromExcavator(projectSettings.selectedExcavator);
                        const labels: Record<string, string> = {
                          shovel: t("project:foundation_digging_manual"),
                          small: t("project:foundation_digging_small"),
                          medium: t("project:foundation_digging_medium"),
                          large: t("project:foundation_digging_large"),
                        };
                        return labels[method] ?? t("project:foundation_digging_manual");
                      })()}
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>{t("project:carrier_soil_tape1")}</label>
                    <select
                      value={(projectSettings.selectedCarrier as any)?.id ?? ""}
                      onChange={e => {
                        const eq = carriers.find(x => x.id === e.target.value) || null;
                        onSave({ selectedCarrier: eq });
                      }}
                      style={inputStyle}
                    >
                      <option value="">None</option>
                      {carriers.map(x => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x["size (in tones)"] ?? "?"}t)
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{t("project:for_excavator_materials")}</div>
                  </div>

                  <div>
                    <label style={labelStyle}>{t("project:carrier_slabs_pavers")}</label>
                    <select
                      value={(projectSettings.selectedMaterialCarrier as any)?.id ?? ""}
                      onChange={e => {
                        const eq = carriers.find(x => x.id === e.target.value) || null;
                        onSave({ selectedMaterialCarrier: eq });
                      }}
                      style={inputStyle}
                    >
                      <option value="">{t("project:none")}</option>
                      {carriers.map(x => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x["size (in tones)"] ?? "?"}t)
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{t("project:for_calculator_materials")}</div>
                  </div>

                  <div>
                    <label style={labelStyle}>{t("project:wacker_compactor")}</label>
                    <select
                      value={(projectSettings.selectedCompactor as any)?.id ?? ""}
                      onChange={e => {
                        const val = e.target.value;
                        if (!val) {
                          onSave({ selectedCompactor: null });
                          return;
                        }
                        const fromDb = compactors.find(x => x.id === val);
                        if (fromDb) {
                          onSave({ selectedCompactor: fromDb });
                        } else {
                          const fromStatic = COMPACTORS.find(c => c.id === val);
                          if (fromStatic) onSave({ selectedCompactor: fromStatic });
                        }
                      }}
                      style={inputStyle}
                    >
                      <option value="">{t("project:none")}</option>
                      {compactors.length > 0 ? (
                        compactors.map(x => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))
                      ) : (
                        COMPACTORS.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.weightRange})</option>
                        ))
                      )}
                    </select>
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                      {compactors.length > 0 ? t("project:from_company_setup") : t("project:default_list_compactor")}
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>{t("project:soil_type")}</label>
                    <select
                      value={projectSettings.soilType ?? ""}
                      onChange={e => onSave({ soilType: e.target.value as "" | "clay" | "sand" | "rock" })}
                      style={inputStyle}
                    >
                      <option value="">{t("project:select")}</option>
                      <option value="clay">{t("project:clay")}</option>
                      <option value="sand">{t("project:sand")}</option>
                      <option value="rock">{t("project:rock")}</option>
                    </select>
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{t("project:for_excavation_tonnage")}</div>
                  </div>

                  <div>
                    <label style={labelStyle}>{t("project:pre_preparation_leveling")}</label>
                    <select
                      value={projectSettings.levelingMaterial ?? ""}
                      onChange={e => onSave({ levelingMaterial: e.target.value as "" | "tape1" | "soil" })}
                      style={inputStyle}
                    >
                      <option value="">{t("project:select")}</option>
                      <option value="tape1">{t("project:tape1_option")}</option>
                      <option value="soil">{t("project:soil_option")}</option>
                    </select>
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{t("project:when_terrain_low")}</div>
                  </div>

                  {/* Transport section */}
                  <div
                    style={{
                      padding: 16,
                      background: C.bg,
                      borderRadius: 10,
                      border: `1px solid ${C.panelBorder}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: projectSettings.calculateTransport ? 16 : 0 }}>
                      <Truck size={16} color={C.textDim} />
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: C.text, flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={projectSettings.calculateTransport}
                          onChange={e => onSave({ calculateTransport: e.target.checked })}
                          style={{ accentColor: C.accent }}
                        />
                        {t("project:calculate_transport")}
                      </label>
                    </div>

                    {projectSettings.calculateTransport && (
                      <div>
                        <label style={labelStyle}>{t("project:distance_meters")}</label>
                        <input
                          type="text"
                          value={projectSettings.transportDistance}
                          onChange={e => onSave({ transportDistance: e.target.value })}
                          placeholder={t("project:distance_placeholder_example")}
                          style={inputStyle}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: `1px solid ${C.panelBorder}`,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "10px 28px",
              background: C.accent,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
              fontWeight: 600,
              fontFamily: "inherit",
              transition: "opacity 0.15s",
            }}
          >
            {t("project:done")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 20px",
        background: "none",
        border: "none",
        borderBottom: `2px solid ${active ? C.accent : "transparent"}`,
        color: active ? C.accent : C.textDim,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        transition: "all 0.15s",
        fontFamily: "inherit",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
