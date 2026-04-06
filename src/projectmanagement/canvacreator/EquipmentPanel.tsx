// ══════════════════════════════════════════════════════════════
// EquipmentPanel — Global equipment/transport settings modal
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../lib/store";
import { ProjectSettings } from "./types";
import { COMPACTORS } from "../../components/Calculator/CompactorSelector";
import { colors, radii, shadows } from "../../themes/designTokens";
import { useBackdropPointerDismiss } from "../../hooks/useBackdropPointerDismiss";

interface EquipmentPanelProps {
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

export default function EquipmentPanel({
  isOpen,
  onClose,
  projectSettings,
  onSave,
}: EquipmentPanelProps) {
  const { t } = useTranslation(["project", "common"]);
  const companyId = useAuthStore((s) => s.getCompanyId());
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriers, setCarriers] = useState<DiggingEquipment[]>([]);
  const [compactors, setCompactors] = useState<DiggingEquipment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !companyId) return;
    const fetch = async () => {
      setLoading(true);
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
        setLoading(false);
      }
    };
    fetch();
  }, [isOpen, companyId]);

  const backdropDismiss = useBackdropPointerDismiss(onClose, isOpen);

  if (!isOpen) return null;

  return (
    <div ref={backdropDismiss.backdropRef} className="canvas-modal-backdrop" style={{
      position: "fixed",
      inset: 0,
      background: colors.bgModalBackdrop,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }} onPointerDown={backdropDismiss.onBackdropPointerDown}>
      <div className="canvas-modal-content equipment-modal-panel" style={{
        background: colors.bgElevated,
        border: `1px solid ${colors.borderDefault}`,
        borderRadius: 12,
        padding: 24,
        maxWidth: 480,
        width: "90%",
        maxHeight: "85vh",
        overflow: "auto",
        boxShadow: shadows.xl,
      }} onPointerDownCapture={backdropDismiss.onPanelPointerDownCapture} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: colors.textPrimary }}>{t("project:equipment_transport_title")}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textDim }}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div style={{ color: colors.textDim, fontSize: 14 }}>{t("common:loading")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: colors.textDim, marginBottom: 6 }}>{t("project:excavator_label_short")}</label>
              <select
                value={(projectSettings.selectedExcavator as any)?.id ?? ""}
                onChange={e => {
                  const id = e.target.value;
                  const eq = excavators.find(x => x.id === id) || null;
                  onSave({ selectedExcavator: eq });
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: colors.bgInput,
                  border: `1px solid ${colors.borderDefault}`,
                  borderRadius: 6,
                  color: colors.textPrimary,
                  fontSize: 14,
                }}
              >
                <option value="">None</option>
                {excavators.map(x => (
                  <option key={x.id} value={x.id}>{x.name} ({x["size (in tones)"] ?? "?"}t)</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, color: colors.textDim, marginBottom: 6 }}>{t("project:carrier_soil_tape1")}</label>
              <select
                value={(projectSettings.selectedCarrier as any)?.id ?? ""}
                onChange={e => {
                  const id = e.target.value;
                  const eq = carriers.find(x => x.id === id) || null;
                  onSave({ selectedCarrier: eq });
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: colors.bgInput,
                  border: `1px solid ${colors.borderDefault}`,
                  borderRadius: 6,
                  color: colors.textPrimary,
                  fontSize: 14,
                }}
              >
                <option value="">None</option>
                {carriers.map(x => (
                  <option key={x.id} value={x.id}>{x.name} ({x["size (in tones)"] ?? "?"}t)</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4 }}>For excavator materials</div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, color: colors.textDim, marginBottom: 6 }}>{t("project:carrier_slabs_pavers")}</label>
              <select
                value={(projectSettings.selectedMaterialCarrier as any)?.id ?? ""}
                onChange={e => {
                  const id = e.target.value;
                  const eq = carriers.find(x => x.id === id) || null;
                  onSave({ selectedMaterialCarrier: eq });
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: colors.bgInput,
                  border: `1px solid ${colors.borderDefault}`,
                  borderRadius: 6,
                  color: colors.textPrimary,
                  fontSize: 14,
                }}
              >
                <option value="">{t("project:none")}</option>
                {carriers.map(x => (
                  <option key={x.id} value={x.id}>{x.name} ({x["size (in tones)"] ?? "?"}t)</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4 }}>{t("project:for_calculator_materials")}</div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, color: colors.textDim, marginBottom: 6 }}>Wacker / Compactor</label>
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
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: colors.bgInput,
                  border: `1px solid ${colors.borderDefault}`,
                  borderRadius: 6,
                  color: colors.textPrimary,
                  fontSize: 14,
                }}
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
            </div>

            <div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={projectSettings.calculateTransport}
                  onChange={e => onSave({ calculateTransport: e.target.checked })}
                />
                {t("project:calculate_transport")}
              </label>
            </div>

            {projectSettings.calculateTransport && (
              <div>
                <label style={{ display: "block", fontSize: 12, color: colors.textDim, marginBottom: 6 }}>Transport distance (m)</label>
                <input
                  type="text"
                  value={projectSettings.transportDistance}
                  onChange={e => onSave({ transportDistance: e.target.value })}
                  placeholder="e.g. 30"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: colors.bgInput,
                    border: `1px solid ${colors.borderDefault}`,
                    borderRadius: 6,
                    color: colors.textPrimary,
                    fontSize: 14,
                  }}
                />
              </div>
            )}

            <button
              onClick={onClose}
              style={{
                padding: "10px 20px",
                background: colors.accentBlue,
                border: "none",
                borderRadius: 6,
                color: "#fff",
                fontSize: 14,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {t("project:done")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
