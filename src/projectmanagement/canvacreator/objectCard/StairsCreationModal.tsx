// ══════════════════════════════════════════════════════════════
// StairsCreationModal — calculator first, shape added after Calculate
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../lib/store";
import { Shape, LayerID } from "../geometry";
import { C } from "../geometry";
import { makeRectangle } from "../geometry";
import { ProjectSettings } from "../types";
import { mapProjectCompactorToOption } from "../../../components/Calculator/CompactorSelector";
import { getFoundationDiggingMethodFromExcavator } from "../GroundworkLinearCalculator";

import { translateUnit } from "../../../lib/translationMap";
import StairCalculator from "../../../components/Calculator/StairCalculator";
import LShapeStairCalculator from "../../../components/Calculator/LShapeStairCalculator";
import UShapeStairCalculator from "../../../components/Calculator/Ushapestaircalculator";

export type StairsSubType = "standard" | "l_shape" | "u_shape";

interface StairsCreationModalProps {
  subType: StairsSubType;
  label: string;
  onClose: () => void;
  onCreate: (shape: Shape) => void;
  projectSettings: ProjectSettings;
  onProjectSettingsChange?: (updates: Partial<ProjectSettings>) => void;
  recalculateTrigger?: number;
  /** Center point for the new shape (world coords) */
  centerX: number;
  centerY: number;
  layer: LayerID;
}

const StairsCreationModal: React.FC<StairsCreationModalProps> = ({
  subType,
  label,
  onClose,
  onCreate,
  projectSettings,
  onProjectSettingsChange,
  recalculateTrigger = 0,
  centerX,
  centerY,
  layer,
}) => {
  const { t } = useTranslation(["project", "common", "units"]);
  const companyId = useAuthStore((s) => s.getCompanyId());
  const [calculatorInputs, setCalculatorInputs] = useState<Record<string, any>>({});
  const [calculatorResults, setCalculatorResults] = useState<any>(null);
  const [carriers, setCarriers] = useState<any[]>([]);

  const materialCarrier = projectSettings.selectedMaterialCarrier ?? projectSettings.selectedCarrier;
  const projectCompactor = mapProjectCompactorToOption(projectSettings.selectedCompactor);

  const onResultsChange = useCallback((results: any) => setCalculatorResults(results), []);
  const onInputsChange = useCallback((inputs: Record<string, any>) => {
    setCalculatorInputs((prev) => ({ ...prev, ...inputs }));
  }, []);

  const commonProps = {
    onResultsChange,
    onInputsChange,
    savedInputs: calculatorInputs,
    isInProjectCreating: true,
    calculateTransport: projectSettings.calculateTransport,
    setCalculateTransport: () => {},
    selectedTransportCarrier: materialCarrier,
    setSelectedTransportCarrier: (carrier: any) => onProjectSettingsChange?.({ selectedMaterialCarrier: carrier }),
    transportDistance: projectSettings.transportDistance,
    setTransportDistance: () => {},
    carriers,
    selectedExcavator: projectSettings.selectedExcavator,
    selectedCarrier: projectSettings.selectedCarrier,
    selectedCompactor: projectCompactor,
    recalculateTrigger,
    projectSoilType: projectSettings.soilType ?? "clay",
    projectDiggingMethod: getFoundationDiggingMethodFromExcavator(projectSettings.selectedExcavator),
  };

  useEffect(() => {
    if (!companyId) return;
    const fetchCarriers = async () => {
      try {
        const { data, error } = await supabase
          .from("setup_digging")
          .select("*")
          .eq("type", "barrows_dumpers")
          .eq("company_id", companyId);
        if (error) throw error;
        setCarriers(data || []);
      } catch (e) {
        console.error("Error fetching carriers:", e);
      }
    };
    fetchCarriers();
  }, [companyId]);

  const handleCreate = () => {
    // Extract dimensions from calculator (cm → m)
    const widthCm = calculatorResults?.canvasWidthCm ?? 300;
    const lengthCm = calculatorResults?.canvasLengthCm ?? 200;
    const widthM = Math.max(0.5, widthCm / 100);
    const lengthM = Math.max(0.5, lengthCm / 100);
    const shape = makeRectangle(centerX, centerY, layer, widthM, lengthM);
    const fullShape: Shape = {
      ...shape,
      calculatorType: "steps",
      calculatorSubType: subType,
      label,
      calculatorInputs: calculatorInputs,
      calculatorResults,
    };
    onCreate(fullShape);
    onClose();
  };

  const renderCalculator = () => {
    if (subType === "l_shape") return <LShapeStairCalculator {...commonProps} />;
    if (subType === "u_shape") return <UShapeStairCalculator {...commonProps} />;
    return <StairCalculator {...commonProps} />;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, width: "100%", maxWidth: 900, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottom: `1px solid ${C.panelBorder}` }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text }}>{t("project:stairs_title", { label })}</h2>
          <button onClick={onClose} style={{ padding: 8, background: "transparent", border: "none", cursor: "pointer", color: C.text }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <p style={{ fontSize: 13, color: C.textDim, marginBottom: 16 }}>
            {t("project:stairs_instruction")}
          </p>

          {carriers.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: C.text, fontSize: 13 }}>{t("project:stairs_material_carrier")}</div>
              <select
                value={(materialCarrier as any)?.id ?? ""}
                onChange={(e) => {
                  const c = carriers.find((x) => x.id === e.target.value) || null;
                  onProjectSettingsChange?.({ selectedMaterialCarrier: c });
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: C.bg,
                  border: `1px solid ${C.panelBorder}`,
                  borderRadius: 6,
                  color: C.text,
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
              >
                <option value="">{t("project:none")}</option>
                {carriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {(c["size (in tones)"] ?? c.size) != null ? `(${c["size (in tones)"] ?? c.size}t)` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {calculatorResults && (
            <div style={{ marginBottom: 16, padding: 12, background: "rgba(46,204,113,0.08)", border: `1px solid rgba(46,204,113,0.3)`, borderRadius: 6, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: C.text }}>{t("project:stairs_result_title")}</div>
              {calculatorResults.hours_worked != null && (
                <div style={{ color: C.text }}>
                  {t("project:stairs_hours")} <span style={{ color: "#2ecc71", fontWeight: 600 }}>{Number(calculatorResults.hours_worked).toFixed(2)} h</span>
                </div>
              )}
              {calculatorResults.materials && calculatorResults.materials.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ color: C.textDim, marginBottom: 4 }}>{t("project:stairs_materials")}</div>
                  {calculatorResults.materials.map((m: any, i: number) => (
                    <div key={i} style={{ color: C.text, paddingLeft: 8 }}>
                      {m.name}: {m.quantity ?? m.amount} {translateUnit(m.unit, t)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {renderCalculator()}
        </div>

        <div style={{ padding: 16, borderTop: `1px solid ${C.panelBorder}`, display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 16px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, cursor: "pointer", fontSize: 13 }}
          >
            {t("common:cancel")}
          </button>
          <button
            onClick={handleCreate}
            disabled={!calculatorResults}
            style={{
              padding: "8px 16px",
              background: calculatorResults ? C.accent : C.button,
              border: "none",
              borderRadius: 6,
              color: calculatorResults ? C.bg : C.textDim,
              cursor: calculatorResults ? "pointer" : "not-allowed",
              fontSize: 13,
            }}
          >
            {t("project:stairs_create_on_canvas")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StairsCreationModal;
