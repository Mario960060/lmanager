// ══════════════════════════════════════════════════════════════
// PathCreationModal — configure path before drawing / edit path
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../lib/store";
import { C } from "../geometry";
import { parseSlabDimensions } from "../visualization/slabPattern";
import { computeAutoFill } from "./autoFill";
import { getCalculatorInputDefaults } from "../../../lib/materialUsageDefaults";
import type { Shape } from "../geometry";
import SlabCalculator from "../../../components/Calculator/SlabCalculator";
import ConcreteSlabsCalculator from "../../../components/Calculator/ConcreteSlabsCalculator";
import PavingCalculator from "../../../components/Calculator/PavingCalculator";

export type PathSubType = "slabs" | "concreteSlabs" | "monoblock";

const PATH_DEFAULTS_KEY = "landscapeManager_pathDefaults";

function getPathDefaultsFromStorage(subType: PathSubType, companyId: string | null): Record<string, any> {
  try {
    const key = companyId ? `${PATH_DEFAULTS_KEY}_${companyId}` : PATH_DEFAULTS_KEY;
    const raw = localStorage.getItem(key);
    if (raw) {
      const all = JSON.parse(raw);
      return all[subType] || {};
    }
  } catch {}
  return {};
}

function savePathDefaultsToStorage(subType: PathSubType, companyId: string | null, inputs: Record<string, any>) {
  try {
    const key = companyId ? `${PATH_DEFAULTS_KEY}_${companyId}` : PATH_DEFAULTS_KEY;
    const raw = localStorage.getItem(key);
    const all = raw ? JSON.parse(raw) : {};
    all[subType] = inputs;
    localStorage.setItem(key, JSON.stringify(all));
  } catch {}
}

export interface PathConfig {
  pathType: PathSubType;
  pathWidthM: number;
  calculatorType: "slab" | "concreteSlabs" | "paving";
  calculatorInputs: Record<string, any>;
}

interface PathCreationModalProps {
  subType: PathSubType;
  label: string;
  onClose: () => void;
  /** Required in create mode; ignored in edit mode */
  onConfirm?: (config: PathConfig) => void;
  /** Edit mode: shape to edit, shapeIdx, onSave, onCalculatorInputsChange */
  mode?: "create" | "edit";
  shape?: Shape;
  shapeIdx?: number;
  /** All shapes (for fence cutout in area) */
  shapes?: Shape[];
  onSave?: (shapeIdx: number, updates: Partial<Shape>) => void;
  onCalculatorInputsChange?: (shapeIdx: number, inputs: Record<string, any>) => void;
  onViewResults?: (shapeIdx: number) => void;
}

const PathCreationModal: React.FC<PathCreationModalProps> = ({
  subType,
  label,
  t: tProp,
  onClose,
  onConfirm,
  mode = "create",
  shape,
  shapeIdx = 0,
  shapes,
  onSave,
  onCalculatorInputsChange,
  onViewResults,
}) => {
  const { t } = useTranslation(["project", "common"]);
  const companyId = useAuthStore((s) => s.getCompanyId());
  const isEdit = mode === "edit" && shape;
  const autoFill = useMemo(() => (shape ? computeAutoFill(shape, shapes) : null), [shape, shapes]);

  const storedDefaults = useMemo(() => {
    const c = shape?.calculatorInputs;
    if (isEdit && c) {
      const d: Record<string, any> = {};
      const validWidthMode = (v: any): v is "centimeters" | "meters" | "slab1" | "slab1_5" | "slab2" | "blocks" =>
        ["centimeters", "meters", "slab1", "slab1_5", "slab2", "blocks"].includes(v);
      if (validWidthMode(c.pathWidthMode)) {
        d.widthMode = c.pathWidthMode;
        d.pathWidthMode = c.pathWidthMode;
      }
      if (c.pathWidthCm != null) {
        d.widthMode = "centimeters";
        d.pathWidthMode = "centimeters";
        d.widthCentimeters = String(Math.round(Number(c.pathWidthCm)));
      } else if (c.pathWidthM != null) {
        if (!validWidthMode(c.pathWidthMode)) {
          d.widthMode = subType === "monoblock" ? "meters" : "meters";
          d.pathWidthMode = d.widthMode;
        }
        d.widthMeters = Number(c.pathWidthM).toFixed(2);
        d.widthCentimeters = String(Math.round(Number(c.pathWidthM) * 100));
      }
      if (c.slabOrientation === "across" || c.slabOrientation === "along") d.slabOrientation = c.slabOrientation;
      else if (c.vizDirection === 90) d.slabOrientation = "across";
      if (c.selectedSlabId != null) d.selectedSlabId = String(c.selectedSlabId);
      if (c.blockWidthCm != null) d.blockWidthCm = String(c.blockWidthCm);
      if (c.blockLengthCm != null) d.blockLengthCm = String(c.blockLengthCm);
      if (c.blockCount != null) d.blockCount = String(c.blockCount);
      if (c.jointGapMm != null) d.jointGapMm = String(c.jointGapMm);
      if (c.vizGroutWidthMm != null) d.vizGroutWidthMm = String(c.vizGroutWidthMm);
      if (c.vizPattern != null) d.vizPattern = String(c.vizPattern);
      if (c.frameJointType === "butt" || c.frameJointType === "miter45") d.frameJointType = c.frameJointType;
      if (c.addFrameBoard || c.addFrameToMonoblock) {
        d.addFrameBoard = !!c.addFrameBoard;
        d.addFrameToMonoblock = !!c.addFrameToMonoblock;
        if (c.framePieceWidthCm != null) d.framePieceWidthCm = String(c.framePieceWidthCm);
        if (c.framePieceLengthCm != null) d.framePieceLengthCm = String(c.framePieceLengthCm);
        if (Array.isArray(c.frameSidesEnabled)) d.frameSidesEnabled = c.frameSidesEnabled;
      }
      return d;
    }
    return getPathDefaultsFromStorage(subType, companyId);
  }, [isEdit, shape?.calculatorInputs, subType, companyId]);

  const defWidthMode = storedDefaults.pathWidthMode ?? storedDefaults.widthMode;
  const validWidthMode = (v: unknown): v is "centimeters" | "meters" | "slab1" | "slab1_5" | "slab2" | "blocks" =>
    ["centimeters", "meters", "slab1", "slab1_5", "slab2", "blocks"].includes(String(v));
  const [widthMode, setWidthMode] = useState<"centimeters" | "meters" | "slab1" | "slab1_5" | "slab2" | "blocks">(
    validWidthMode(defWidthMode) ? defWidthMode : (subType === "slabs" || subType === "concreteSlabs" ? "slab1" : "meters")
  );
  const [concreteSlabSizeKey, setConcreteSlabSizeKey] = useState<"40x40" | "60x60" | "90x60">(
    (storedDefaults.slabSizeKey as "40x40" | "60x60" | "90x60") ?? "60x60"
  );
  const [widthCentimeters, setWidthCentimeters] = useState<string>(storedDefaults.widthCentimeters ?? "60");
  const [widthMeters, setWidthMeters] = useState<string>(storedDefaults.widthMeters ?? "0.6");
  const [slabOrientation, setSlabOrientation] = useState<"along" | "across">(storedDefaults.slabOrientation ?? "along");
  const [selectedSlabId, setSelectedSlabId] = useState<string>(storedDefaults.selectedSlabId ?? "");
  const [blockWidthCm, setBlockWidthCm] = useState<string>(storedDefaults.blockWidthCm ?? "20");
  const [blockLengthCm, setBlockLengthCm] = useState<string>(storedDefaults.blockLengthCm ?? "10");
  const [blockCount, setBlockCount] = useState<string>(storedDefaults.blockCount ?? "2");
  const [jointGapMm, setJointGapMm] = useState<string>(storedDefaults.jointGapMm ?? "1");
  const [groutWidthMm, setGroutWidthMm] = useState<string>(storedDefaults.vizGroutWidthMm ?? "5");
  const [vizPattern, setVizPattern] = useState<string>(storedDefaults.vizPattern ?? "grid");
  const [vizDirection, setVizDirection] = useState<number>(storedDefaults.vizDirection ?? 0);
  const [vizStartCorner, setVizStartCorner] = useState<number>(storedDefaults.vizStartCorner ?? 0);
  const [addFrame, setAddFrame] = useState<boolean>(!!(storedDefaults.addFrameBoard ?? storedDefaults.addFrameToMonoblock));
  const [framePieceWidthCm, setFramePieceWidthCm] = useState<string>(storedDefaults.framePieceWidthCm ?? "10");
  const [framePieceLengthCm, setFramePieceLengthCm] = useState<string>(storedDefaults.framePieceLengthCm ?? "60");
  const [frameJointType, setFrameJointType] = useState<"butt" | "miter45">(storedDefaults.frameJointType ?? "butt");
  const [frameIncludedInfo, setFrameIncludedInfo] = useState<string>("");

  const [calculatorResults, setCalculatorResults] = useState<any>(null);
  const lastInputsRef = useRef<Record<string, any>>({});

  // Load from shape.calculatorInputs when in edit mode
  useEffect(() => {
    if (!isEdit || !shape?.calculatorInputs) return;
    const c = shape.calculatorInputs;
    if (c.pathWidthCm != null) {
      setWidthMode("centimeters");
      setWidthCentimeters(String(Math.round(Number(c.pathWidthCm))));
    } else if (c.pathWidthM != null) {
      const m = Number(c.pathWidthM);
      setWidthMeters(m.toFixed(2));
      setWidthCentimeters(String(Math.round(m * 100)));
    }
    if (c.slabOrientation === "across" || c.slabOrientation === "along") setSlabOrientation(c.slabOrientation);
    else if (c.vizDirection === 90) setSlabOrientation("across");
    if (c.selectedSlabId != null) setSelectedSlabId(String(c.selectedSlabId));
    if (c.blockWidthCm != null) setBlockWidthCm(String(c.blockWidthCm));
    if (c.blockLengthCm != null) setBlockLengthCm(String(c.blockLengthCm));
    if (c.blockCount != null) setBlockCount(String(c.blockCount));
    if (c.jointGapMm != null) setJointGapMm(String(c.jointGapMm));
    if (c.vizGroutWidthMm != null) setGroutWidthMm(String(c.vizGroutWidthMm));
    if (c.vizPattern != null) setVizPattern(String(c.vizPattern));
    if (c.vizDirection != null) setVizDirection(Number(c.vizDirection));
    if (c.vizStartCorner != null) setVizStartCorner(Number(c.vizStartCorner));
    if (c.frameJointType === "butt" || c.frameJointType === "miter45") setFrameJointType(c.frameJointType);
    if (c.addFrameBoard || c.addFrameToMonoblock) {
      setAddFrame(true);
      if (c.framePieceWidthCm != null) setFramePieceWidthCm(String(c.framePieceWidthCm));
      if (c.framePieceLengthCm != null) setFramePieceLengthCm(String(c.framePieceLengthCm));
    }
    if (c.slabSizeKey && ["40x40", "60x60", "90x60"].includes(c.slabSizeKey)) setConcreteSlabSizeKey(c.slabSizeKey as "40x40" | "60x60" | "90x60");
    setCalculatorResults(shape.calculatorResults ?? null);
    lastInputsRef.current = { ...shape.calculatorInputs };
  }, [isEdit, shape?.calculatorInputs, shape?.calculatorResults]);

  const { data: slabTypes = [] } = useQuery({
    queryKey: ["slab_laying_types", companyId || "no-company"],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("event_tasks_with_dynamic_estimates")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data || []).filter(
        (t: { name?: string }) => {
          const name = (t.name || "").toLowerCase();
          return name.includes("laying slabs") && !name.includes("(concrete)") && !name.includes("betonowe");
        }
      );
    },
    enabled: !!companyId && subType === "slabs",
  });

  const slabDims = useMemo(() => {
    if (subType !== "slabs" || !selectedSlabId) return null;
    const slab = slabTypes.find((t: { id: string }) => String(t.id) === selectedSlabId);
    return slab ? parseSlabDimensions(slab.name || "") : null;
  }, [subType, selectedSlabId, slabTypes]);

  const computedWidthM = useMemo(() => {
    let baseM: number;
    if (subType === "slabs") {
      if (widthMode === "centimeters") baseM = (parseFloat(widthCentimeters) || 60) / 100;
      else if (widthMode === "meters") baseM = parseFloat(widthMeters) || 0.6;
      else if (!slabDims) baseM = 0.6;
      else {
        const w = slabDims.widthCm / 100;
        const l = slabDims.lengthCm / 100;
        const longer = Math.max(w, l);
        const shorter = Math.min(w, l);
        const dim = slabOrientation === "along" ? shorter : longer;
        const grout = (parseFloat(groutWidthMm) || 5) / 1000;
        switch (widthMode) {
          case "slab1": baseM = dim + grout; break;
          case "slab1_5": baseM = (dim * 1.5) + grout; break;
          case "slab2": baseM = (dim * 2) + grout; break;
          default: baseM = 0.6;
        }
      }
    } else if (subType === "concreteSlabs") {
      if (widthMode === "centimeters") baseM = (parseFloat(widthCentimeters) || 60) / 100;
      else if (widthMode === "meters") baseM = parseFloat(widthMeters) || 0.6;
      else {
        const dims = concreteSlabSizeKey === "40x40" ? { w: 40, l: 40 } : concreteSlabSizeKey === "90x60" ? { w: 90, l: 60 } : { w: 60, l: 60 };
        const longer = Math.max(dims.w, dims.l) / 100;
        const shorter = Math.min(dims.w, dims.l) / 100;
        const dim = slabOrientation === "along" ? shorter : longer;
        switch (widthMode) {
          case "slab1": baseM = dim; break;
          case "slab1_5": baseM = dim * 1.5; break;
          case "slab2": baseM = dim * 2; break;
          default: baseM = 0.6;
        }
      }
    } else if (subType === "monoblock") {
      if (widthMode === "centimeters") baseM = (parseFloat(widthCentimeters) || 60) / 100;
      else if (widthMode === "meters") baseM = parseFloat(widthMeters) || 0.6;
      else {
        const bw = (parseFloat(blockWidthCm) || 20) / 100;
        const bl = (parseFloat(blockLengthCm) || 10) / 100;
        const gap = (parseFloat(jointGapMm) || 1) / 1000;
        const n = parseInt(blockCount, 10) || 2;
        baseM = n * Math.max(bw, bl) + (n - 1) * gap;
      }
    } else if (widthMode === "centimeters") baseM = (parseFloat(widthCentimeters) || 60) / 100;
    else if (widthMode === "meters") baseM = parseFloat(widthMeters) || 0.6;
    else baseM = 0.6;
    const frameW = (addFrame && subType !== "concreteSlabs") ? (parseFloat(framePieceWidthCm) || 0) / 100 : 0;
    return baseM + 2 * frameW;
  }, [subType, widthMode, widthMeters, widthCentimeters, slabDims, slabOrientation, groutWidthMm, blockWidthCm, blockLengthCm, blockCount, jointGapMm, concreteSlabSizeKey, addFrame, framePieceWidthCm]);

  useEffect(() => {
    if ((widthMode === "meters" || widthMode === "centimeters") && addFrame) {
      setFrameIncludedInfo(t("project:path_frame_included"));
    } else if ((widthMode.startsWith("slab") || widthMode === "blocks") && addFrame) {
      setFrameIncludedInfo(t("project:path_frame_separate"));
    } else {
      setFrameIncludedInfo("");
    }
  }, [widthMode, addFrame, t]);

  const buildCalculatorInputs = useCallback((): Record<string, any> => {
    const widthM = Math.max(0.2, Math.min(10, computedWidthM));
    const calculatorInputs: Record<string, any> = {
      pathWidthM: widthM,
      pathWidthCm: widthMode === "centimeters" ? (parseFloat(widthCentimeters) || 60) : undefined,
      pathWidthMode: widthMode,
      vizPattern,
      vizDirection,
      vizStartCorner,
      frameJointType,
    };
    if (subType === "slabs") {
      calculatorInputs.vizGroutWidthMm = groutWidthMm;
      calculatorInputs.selectedSlabId = selectedSlabId;
      calculatorInputs.slabOrientation = slabOrientation;
      calculatorInputs.vizDirection = slabOrientation === "across" ? 90 : 0;
      if (slabDims) {
        calculatorInputs.vizSlabWidth = slabDims.widthCm;
        calculatorInputs.vizSlabLength = slabDims.lengthCm;
      }
    } else if (subType === "concreteSlabs") {
      calculatorInputs.vizGroutWidthMm = 0;
      calculatorInputs.slabSizeKey = concreteSlabSizeKey;
      calculatorInputs.slabOrientation = slabOrientation;
      calculatorInputs.vizDirection = slabOrientation === "across" ? 90 : 0;
      const dims = concreteSlabSizeKey === "40x40" ? { w: 40, l: 40 } : concreteSlabSizeKey === "90x60" ? { w: 90, l: 60 } : { w: 60, l: 60 };
      calculatorInputs.vizSlabWidth = dims.w;
      calculatorInputs.vizSlabLength = dims.l;
    } else {
      calculatorInputs.blockWidthCm = blockWidthCm;
      calculatorInputs.blockLengthCm = blockLengthCm;
      calculatorInputs.blockCount = blockCount;
      calculatorInputs.jointGapMm = jointGapMm;
    }
    if (addFrame && subType !== "concreteSlabs") {
      calculatorInputs.framePieceWidthCm = framePieceWidthCm;
      calculatorInputs.framePieceLengthCm = framePieceLengthCm;
      if (subType === "slabs") {
        calculatorInputs.addFrameBoard = true;
      } else {
        calculatorInputs.addFrameToMonoblock = true;
      }
    }
    return { ...lastInputsRef.current, ...calculatorInputs };
  }, [
    computedWidthM, subType, vizPattern, vizDirection, vizStartCorner, frameJointType,
    groutWidthMm, selectedSlabId, slabDims, slabOrientation,
    blockWidthCm, blockLengthCm, jointGapMm,
    addFrame, framePieceWidthCm, framePieceLengthCm, concreteSlabSizeKey,
  ]);

  const handleConfirm = () => {
    const widthM = Math.max(0.2, Math.min(10, computedWidthM));
    const calculatorInputs = buildCalculatorInputs();
    const defaultsToStore = {
      pathWidthMode: widthMode,
      widthMode,
      widthCentimeters,
      widthMeters: String(widthM),
      slabOrientation,
      selectedSlabId,
      slabSizeKey: subType === "concreteSlabs" ? concreteSlabSizeKey : undefined,
      blockWidthCm,
      blockLengthCm,
      blockCount,
      jointGapMm,
      vizGroutWidthMm: groutWidthMm,
      vizPattern,
      vizDirection,
      vizStartCorner,
      addFrameBoard: subType === "slabs" ? addFrame : undefined,
      addFrameToMonoblock: subType === "monoblock" ? addFrame : undefined,
      framePieceWidthCm,
      framePieceLengthCm,
      frameJointType,
    };
    savePathDefaultsToStorage(subType, companyId, defaultsToStore);
    if (isEdit && onSave != null && shapeIdx != null && shape?.calculatorInputs) {
      const merged = { ...shape.calculatorInputs, ...calculatorInputs };
      onSave(shapeIdx, {
        calculatorInputs: merged,
        calculatorResults: calculatorResults ?? undefined,
      });
      onClose();
      return;
    }
    onConfirm({
      pathType: subType,
      pathWidthM: widthM,
      calculatorType: subType === "slabs" ? "slab" : subType === "concreteSlabs" ? "concreteSlabs" : "paving",
      calculatorInputs,
    });
    onClose();
  };

  const stableOnInputsChange = useCallback((inputs: Record<string, any>) => {
    lastInputsRef.current = { ...lastInputsRef.current, ...inputs };
    onCalculatorInputsChange?.(shapeIdx ?? 0, lastInputsRef.current);
  }, [shapeIdx, onCalculatorInputsChange]);

  const stableOnResultsChange = useCallback((results: any) => {
    setCalculatorResults(results);
  }, []);

  const materialDefaults = useMemo(
    () => getCalculatorInputDefaults(subType === "slabs" ? "slab" : subType === "concreteSlabs" ? "concreteSlabs" : "paving", companyId),
    [subType, companyId]
  );
  const THICKNESS_KEYS = ["tape1ThicknessCm", "sandThicknessCm", "mortarThicknessCm", "slabThicknessCm", "concreteSlabThicknessCm", "monoBlocksHeightCm"];
  const savedInputsForCalc = useMemo(() => {
    const base = buildCalculatorInputs();
    const area = autoFill?.areaM2;
    if (area != null) base.area = String(area);
    const filteredBase = { ...base };
    THICKNESS_KEYS.forEach((k) => {
      if (filteredBase[k] === "" || filteredBase[k] == null) delete filteredBase[k];
    });
    const merged = { ...materialDefaults, ...filteredBase };
    if (subType === "concreteSlabs") {
      delete merged.mortarThicknessCm;
      delete merged.slabThicknessCm;
      delete merged.selectedSlabId;
      delete merged.selectedSlabName;
      delete merged.selectedGroutingId;
      delete merged.addFrameBoard;
      delete merged.vizGroutWidthMm;
    }
    return merged;
  }, [materialDefaults, buildCalculatorInputs, autoFill?.areaM2, subType]);

  const isValid = computedWidthM >= 0.2 && computedWidthM <= 10;

  const initialArea = autoFill?.areaM2 ?? undefined;

  const getDefaultsToStore = useCallback(() => {
    const widthM = Math.max(0.2, Math.min(10, computedWidthM));
    return {
      pathWidthMode: widthMode,
      widthMode,
      widthCentimeters,
      widthMeters: String(widthM),
      slabOrientation,
      selectedSlabId,
      slabSizeKey: subType === "concreteSlabs" ? concreteSlabSizeKey : undefined,
      blockWidthCm,
      blockLengthCm,
      blockCount,
      jointGapMm,
      vizGroutWidthMm: groutWidthMm,
      vizPattern,
      vizDirection,
      vizStartCorner,
      addFrameBoard: subType === "slabs" ? addFrame : undefined,
      addFrameToMonoblock: subType === "monoblock" ? addFrame : undefined,
      framePieceWidthCm,
      framePieceLengthCm,
      frameJointType,
    };
  }, [computedWidthM, widthMode, widthCentimeters, slabOrientation, selectedSlabId, concreteSlabSizeKey, blockWidthCm, blockLengthCm, blockCount, jointGapMm, groutWidthMm, vizPattern, vizDirection, vizStartCorner, addFrame, framePieceWidthCm, framePieceLengthCm, frameJointType, subType]);

  const handleClose = useCallback(() => {
    savePathDefaultsToStorage(subType, companyId, getDefaultsToStore());
    onClose();
  }, [subType, companyId, getDefaultsToStore, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "Enter" && isValid) {
        e.preventDefault();
        handleConfirm();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleClose, handleConfirm, isValid]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, width: "100%", maxWidth: isEdit ? 700 : 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottom: `1px solid ${C.panelBorder}` }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text }}>{isEdit ? t("project:path_title_edit", { label }) : t("project:path_title", { label })}</h2>
          <button onClick={handleClose} style={{ padding: 8, background: "transparent", border: "none", cursor: "pointer", color: C.text }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 16 }}>
          {isEdit && autoFill && (
            <div style={{ marginBottom: 16, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 6, fontSize: 13, color: C.textDim }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: C.text }}>{t("project:path_area_title")}</div>
              <div>{t("project:path_area_value")} <strong style={{ color: C.accent }}>{autoFill.areaM2?.toFixed(3) ?? "—"} m²</strong></div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: C.text, fontSize: 13 }}>{t("project:path_width_title")}</div>
            {(subType === "slabs" || subType === "concreteSlabs") && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  {[
                    { v: "centimeters" as const, labelKey: "path_width_cm" },
                    { v: "meters" as const, labelKey: "path_width_m" },
                    { v: "slab1" as const, labelKey: "path_width_slab1" },
                    { v: "slab1_5" as const, labelKey: "path_width_slab1_5" },
                    { v: "slab2" as const, labelKey: "path_width_slab2" },
                  ].map(({ v, labelKey }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setWidthMode(v)}
                      style={{
                        padding: "6px 12px",
                        background: widthMode === v ? C.accent + "44" : C.button,
                        border: `1px solid ${widthMode === v ? C.accent : C.panelBorder}`,
                        borderRadius: 6,
                        color: C.text,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {t(`project:${labelKey}`)}
                    </button>
                  ))}
                </div>
                {widthMode === "centimeters" && (
                  <div style={{ marginBottom: 8 }}>
                    <input
                      type="number"
                      step="1"
                      min="20"
                      max="1000"
                      value={widthCentimeters}
                      onChange={(e) => setWidthCentimeters(e.target.value)}
                      style={{ width: 80, padding: "6px 10px", background: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }}
                    />
                    <span style={{ marginLeft: 8, color: C.textDim, fontSize: 13 }}>cm</span>
                  </div>
                )}
                {widthMode === "meters" && (
                  <div style={{ marginBottom: 8 }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.2"
                      max="10"
                      value={widthMeters}
                      onChange={(e) => setWidthMeters(e.target.value)}
                      style={{ width: 80, padding: "6px 10px", background: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }}
                    />
                    <span style={{ marginLeft: 8, color: C.textDim, fontSize: 13 }}>m</span>
                  </div>
                )}
                {subType === "concreteSlabs" && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: C.textDim, marginRight: 8 }}>{t("project:path_slab_size")}</label>
                    <select
                      value={concreteSlabSizeKey}
                      onChange={(e) => setConcreteSlabSizeKey(e.target.value as "40x40" | "60x60" | "90x60")}
                      style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13, minWidth: 120 }}
                    >
                      <option value="40x40">{t("project:path_slab_size_40x40")}</option>
                      <option value="60x60">{t("project:path_slab_size_60x60")}</option>
                      <option value="90x60">{t("project:path_slab_size_90x60")}</option>
                    </select>
                  </div>
                )}
                {subType === "slabs" && slabTypes.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: C.textDim, marginRight: 8 }}>{t("project:path_slab_type")}</label>
                    <select
                      value={selectedSlabId}
                      onChange={(e) => setSelectedSlabId(e.target.value)}
                      style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13, minWidth: 180 }}
                    >
                      <option value="">{t("project:path_select_placeholder")}</option>
                      {slabTypes.map((t: { id: string; name: string }) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>{t("project:path_slab_orientation")}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setSlabOrientation("along")}
                      style={{
                        padding: "6px 12px",
                        background: slabOrientation === "along" ? C.accent + "44" : C.button,
                        border: `1px solid ${slabOrientation === "along" ? C.accent : C.panelBorder}`,
                        borderRadius: 6,
                        color: C.text,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {t("project:path_orientation_along")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSlabOrientation("across")}
                      style={{
                        padding: "6px 12px",
                        background: slabOrientation === "across" ? C.accent + "44" : C.button,
                        border: `1px solid ${slabOrientation === "across" ? C.accent : C.panelBorder}`,
                        borderRadius: 6,
                        color: C.text,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {t("project:path_orientation_across")}
                    </button>
                  </div>
                </div>
              </>
            )}
            {subType === "monoblock" && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  {[
                    { v: "centimeters" as const, labelKey: "path_width_cm" },
                    { v: "meters" as const, labelKey: "path_width_m" },
                    { v: "blocks" as const, labelKey: "path_width_blocks" },
                  ].map(({ v, labelKey }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setWidthMode(v)}
                      style={{
                        padding: "6px 12px",
                        background: widthMode === v ? C.accent + "44" : C.button,
                        border: `1px solid ${widthMode === v ? C.accent : C.panelBorder}`,
                        borderRadius: 6,
                        color: C.text,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {t(`project:${labelKey}`)}
                    </button>
                  ))}
                </div>
                {widthMode === "centimeters" && (
                  <div style={{ marginBottom: 8 }}>
                    <input
                      type="number"
                      step="1"
                      min="20"
                      max="1000"
                      value={widthCentimeters}
                      onChange={(e) => setWidthCentimeters(e.target.value)}
                      style={{ width: 80, padding: "6px 10px", background: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }}
                    />
                    <span style={{ marginLeft: 8, color: C.textDim, fontSize: 13 }}>cm</span>
                  </div>
                )}
                {widthMode === "meters" && (
                  <div style={{ marginBottom: 8 }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.2"
                      max="10"
                      value={widthMeters}
                      onChange={(e) => setWidthMeters(e.target.value)}
                      style={{ width: 80, padding: "6px 10px", background: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }}
                    />
                    <span style={{ marginLeft: 8, color: C.textDim, fontSize: 13 }}>m</span>
                  </div>
                )}
                {widthMode === "blocks" && (
                  <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                    <div>
                      <label style={{ fontSize: 11, color: C.textDim }}>{t("project:path_block_width")}</label>
                      <input type="number" value={blockWidthCm} onChange={(e) => setBlockWidthCm(e.target.value)} style={{ width: 60, padding: 4, marginLeft: 4 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: C.textDim }}>{t("project:path_block_length")}</label>
                      <input type="number" value={blockLengthCm} onChange={(e) => setBlockLengthCm(e.target.value)} style={{ width: 60, padding: 4, marginLeft: 4 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: C.textDim }}>{t("project:path_block_count")}</label>
                      <input type="number" value={blockCount} onChange={(e) => setBlockCount(e.target.value)} style={{ width: 50, padding: 4, marginLeft: 4 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: C.textDim }}>{t("project:path_joint_gap")}</label>
                      <input type="number" value={jointGapMm} onChange={(e) => setJointGapMm(e.target.value)} style={{ width: 50, padding: 4, marginLeft: 4 }} />
                    </div>
                  </div>
                )}
              </>
            )}
            <div style={{ fontSize: 12, color: C.textDim }}>
              {t("project:path_width_value")} <strong style={{ color: C.accent }}>{computedWidthM.toFixed(2)} m</strong>
            </div>
          </div>

          {subType === "slabs" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: C.text, fontSize: 13 }}>{t("project:path_grout_width")}</div>
              <input type="number" value={groutWidthMm} onChange={(e) => setGroutWidthMm(e.target.value)} style={{ width: 60, padding: "6px 10px", background: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text }} />
            </div>
          )}
          {subType === "concreteSlabs" && (
            <div style={{ marginBottom: 16, fontSize: 12, color: C.textDim }}>{t("project:path_concrete_no_grout")}</div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: C.text, fontSize: 13 }}>{t("project:path_pattern")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["grid", "brick", "onethird"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setVizPattern(p)}
                  style={{
                    padding: "6px 12px",
                    background: vizPattern === p ? C.accent + "44" : C.button,
                    border: `1px solid ${vizPattern === p ? C.accent : C.panelBorder}`,
                    borderRadius: 6,
                    color: C.text,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {p === "grid" ? t("project:path_pattern_grid") : p === "brick" ? t("project:path_pattern_brick") : t("project:path_pattern_onethird")}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: C.text, fontSize: 13 }}>{t("project:path_corners")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setFrameJointType("butt")}
                style={{
                  padding: "6px 12px",
                  background: frameJointType === "butt" ? C.accent + "44" : C.button,
                  border: `1px solid ${frameJointType === "butt" ? C.accent : C.panelBorder}`,
                  borderRadius: 6,
                  color: C.text,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {t("project:path_corner_butt")}
              </button>
              <button
                type="button"
                onClick={() => setFrameJointType("miter45")}
                style={{
                  padding: "6px 12px",
                  background: frameJointType === "miter45" ? C.accent + "44" : C.button,
                  border: `1px solid ${frameJointType === "miter45" ? C.accent : C.panelBorder}`,
                  borderRadius: 6,
                  color: C.text,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {t("project:path_corner_mitre")}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            {subType !== "concreteSlabs" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={addFrame} onChange={(e) => setAddFrame(e.target.checked)} />
              <span style={{ color: C.text, fontSize: 13 }}>{t("project:path_add_frame")}</span>
            </label>
            )}
            {addFrame && subType !== "concreteSlabs" && (
              <div style={{ marginTop: 8, padding: 8, background: C.bg, borderRadius: 6 }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: C.textDim }}>{t("project:path_frame_length")}</label>
                    <input type="number" value={framePieceLengthCm} onChange={(e) => setFramePieceLengthCm(e.target.value)} style={{ width: 60, padding: 4, marginLeft: 4, background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, color: C.text }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.textDim }}>{t("project:path_frame_width")}</label>
                    <input type="number" value={framePieceWidthCm} onChange={(e) => setFramePieceWidthCm(e.target.value)} style={{ width: 60, padding: 4, marginLeft: 4, background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, color: C.text }} />
                  </div>
                </div>
                {frameIncludedInfo && (
                  <div style={{ fontSize: 11, color: C.geo, marginTop: 4 }}>{frameIncludedInfo}</div>
                )}
              </div>
            )}
          </div>

          {isEdit && shape && (
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.panelBorder}` }}>
              <div style={{ fontWeight: 600, marginBottom: 12, color: C.text, fontSize: 13 }}>{t("project:path_calculation")}</div>
              {subType === "slabs" ? (
                <SlabCalculator
                  key={`slab-path-${shapeIdx}`}
                  isInProjectCreating
                  initialArea={initialArea}
                  savedInputs={savedInputsForCalc}
                  shape={shape}
                  onResultsChange={stableOnResultsChange}
                  onInputsChange={stableOnInputsChange}
                  compactForPath
                />
              ) : subType === "concreteSlabs" ? (
                <ConcreteSlabsCalculator
                  key={`concrete-path-${shapeIdx}`}
                  isInProjectCreating
                  initialArea={initialArea}
                  savedInputs={{ ...savedInputsForCalc, slabSizeKey: concreteSlabSizeKey, vizSlabWidth: concreteSlabSizeKey === "40x40" ? 40 : concreteSlabSizeKey === "90x60" ? 90 : 60, vizSlabLength: concreteSlabSizeKey === "40x40" ? 40 : concreteSlabSizeKey === "90x60" ? 60 : 60, vizGroutWidthMm: 0 }}
                  shape={shape}
                  onResultsChange={stableOnResultsChange}
                  onInputsChange={stableOnInputsChange}
                  compactForPath
                />
              ) : (
                <PavingCalculator
                  key={`paving-path-${shapeIdx}`}
                  isInProjectCreating
                  initialArea={initialArea}
                  savedInputs={savedInputsForCalc}
                  shape={shape}
                  onResultsChange={stableOnResultsChange}
                  onInputsChange={stableOnInputsChange}
                  compactForPath
                />
              )}
            </div>
          )}
        </div>

        <div style={{ padding: 16, borderTop: `1px solid ${C.panelBorder}`, display: "flex", justifyContent: "flex-end", gap: 12 }}>
          {isEdit && calculatorResults && onViewResults && shapeIdx != null && (
            <button
              onClick={() => { onViewResults(shapeIdx); handleClose(); }}
              style={{ padding: "8px 16px", background: "#a29bfe44", border: `1px solid #a29bfe`, borderRadius: 6, color: "#a29bfe", cursor: "pointer", fontSize: 13 }}
            >
              {`📊 ${t("project:path_view_results")}`}
            </button>
          )}
          <button
            onClick={handleClose}
            style={{ padding: "8px 16px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, cursor: "pointer", fontSize: 13 }}
          >
            {t("common:cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            style={{
              padding: "8px 16px",
              background: isValid ? C.accent : C.button,
              border: "none",
              borderRadius: 6,
              color: isValid ? C.bg : C.textDim,
              cursor: isValid ? "pointer" : "not-allowed",
              fontSize: 13,
            }}
          >
            {isEdit ? t("project:path_calculate") : t("project:path_draw")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PathCreationModal;
