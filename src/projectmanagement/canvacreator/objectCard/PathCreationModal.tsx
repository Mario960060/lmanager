// ══════════════════════════════════════════════════════════════
// PathCreationModal — configure path before drawing / edit path
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../lib/store";
import { parseSlabDimensions, getFrameBorderRowCount } from "../visualization/slabPattern";
import { computeAutoFill } from "./autoFill";
import { getCalculatorInputDefaults } from "../../../lib/materialUsageDefaults";
import {
  MONOBLOCK_MIXES,
  defaultMonoblockMixEnabled,
  singleSizeToBlockCm,
  type MonoblockLayoutMode,
  type MonoblockSingleSizeKey,
  type MonoblockMixPieceKey,
} from "../visualization/monoblockMix";
import type { Shape } from "../geometry";
import SlabCalculator from "../../../components/Calculator/SlabCalculator";
import ConcreteSlabsCalculator from "../../../components/Calculator/ConcreteSlabsCalculator";
import PavingCalculator from "../../../components/Calculator/PavingCalculator";
import { getPathPolygon } from "../linearElements";
import { FrameSidesSelector } from "./FrameSidesSelector";
import { colors, spacing, radii, shadows, accentAlpha } from "../../../themes/designTokens";

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
  onCalculatorResultsChange?: (shapeIdx: number, results: any) => void;
  onViewResults?: (shapeIdx: number) => void;
  /** When > 0, triggers auto-calculate on mount (e.g. after path just drawn) */
  autoCalculateTrigger?: number;
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
  onCalculatorResultsChange,
  onViewResults,
  autoCalculateTrigger = 0,
}) => {
  const { t } = useTranslation(["project", "common", "calculator"]);
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
        if (subType === "monoblock") {
          d.widthMode = "meters";
          d.pathWidthMode = "meters";
          d.widthMeters = (Number(c.pathWidthCm) / 100).toFixed(2);
        } else {
          d.widthMode = "centimeters";
          d.pathWidthMode = "centimeters";
          d.widthCentimeters = String(Math.round(Number(c.pathWidthCm)));
        }
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
      if (c.monoblockLayoutMode === "mix" || c.monoblockLayoutMode === "single") d.monoblockLayoutMode = c.monoblockLayoutMode;
      if (c.monoblockSingleSize === "10x10" || c.monoblockSingleSize === "20x10") d.monoblockSingleSize = c.monoblockSingleSize;
      if (c.monoblockMixId != null) d.monoblockMixId = String(c.monoblockMixId);
      if (c.monoblockMixEnabledSizes && typeof c.monoblockMixEnabledSizes === "object") d.monoblockMixEnabledSizes = c.monoblockMixEnabledSizes;
      if (c.pathCornerType === "butt" || c.pathCornerType === "miter45") d.pathCornerType = c.pathCornerType;
      if (c.frameJointType === "butt" || c.frameJointType === "miter45") d.frameJointType = c.frameJointType;
      if (c.addFrameBoard || c.addFrameToMonoblock) {
        d.addFrameBoard = !!c.addFrameBoard;
        d.addFrameToMonoblock = !!c.addFrameToMonoblock;
        if (c.framePieceWidthCm != null) d.framePieceWidthCm = String(c.framePieceWidthCm);
        if (c.framePieceLengthCm != null) d.framePieceLengthCm = String(c.framePieceLengthCm);
        d.frameBorderRowCount = c.frameBorderRowCount ?? getFrameBorderRowCount(c as Record<string, unknown>);
        if (Array.isArray(c.frameSidesEnabled)) d.frameSidesEnabled = c.frameSidesEnabled;
        if (c.frameBorderMaterial === "slab" || c.frameBorderMaterial === "cobble") d.frameBorderMaterial = c.frameBorderMaterial;
      }
      if (subType === "monoblock" && (d.pathWidthMode === "centimeters" || d.widthMode === "centimeters")) {
        d.widthMode = "meters";
        d.pathWidthMode = "meters";
        if (d.widthMeters == null && c.pathWidthM != null) d.widthMeters = Number(c.pathWidthM).toFixed(2);
        if (d.widthMeters == null && c.pathWidthCm != null) d.widthMeters = (Number(c.pathWidthCm) / 100).toFixed(2);
      }
      return d;
    }
    const fromStorage = getPathDefaultsFromStorage(subType, companyId);
    if (
      subType === "monoblock" &&
      (fromStorage.pathWidthMode === "centimeters" || fromStorage.widthMode === "centimeters")
    ) {
      const cm = parseFloat(String(fromStorage.widthCentimeters ?? "60")) || 60;
      return {
        ...fromStorage,
        widthMode: "meters",
        pathWidthMode: "meters",
        widthMeters: (cm / 100).toFixed(2),
      };
    }
    return fromStorage;
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
  const [monoblockLayoutMode, setMonoblockLayoutMode] = useState<MonoblockLayoutMode>(() =>
    storedDefaults.monoblockLayoutMode === "mix" || storedDefaults.monoblockLayoutMode === "single"
      ? storedDefaults.monoblockLayoutMode
      : "single"
  );
  const [monoblockSingleSize, setMonoblockSingleSize] = useState<MonoblockSingleSizeKey>(() =>
    storedDefaults.monoblockSingleSize === "10x10" ? "10x10" : "20x10"
  );
  const [monoblockMixId, setMonoblockMixId] = useState<string>(() => String(storedDefaults.monoblockMixId ?? MONOBLOCK_MIXES[0].id));
  const [monoblockMixEnabledSizes, setMonoblockMixEnabledSizes] = useState<Record<MonoblockMixPieceKey, boolean>>(() => {
    const d = defaultMonoblockMixEnabled();
    const s = storedDefaults.monoblockMixEnabledSizes as Partial<Record<MonoblockMixPieceKey, boolean>> | undefined;
    return s ? { ...d, ...s } : d;
  });
  const [blockCount, setBlockCount] = useState<string>(storedDefaults.blockCount ?? "2");
  const [jointGapMm, setJointGapMm] = useState<string>(storedDefaults.jointGapMm ?? "1");
  const [groutWidthMm, setGroutWidthMm] = useState<string>(storedDefaults.vizGroutWidthMm ?? "5");
  const [vizPattern, setVizPattern] = useState<string>(storedDefaults.vizPattern ?? "grid");
  const pathPatternOptions =
    subType === "monoblock" && monoblockLayoutMode === "mix"
      ? (["grid", "brick", "onethird"] as const)
      : (["grid", "brick", "onethird", "herringbone"] as const);
  const [vizDirection, setVizDirection] = useState<number>(storedDefaults.vizDirection ?? 0);
  const [vizStartCorner, setVizStartCorner] = useState<number>(storedDefaults.vizStartCorner ?? 0);
  const [addFrame, setAddFrame] = useState<boolean>(!!(storedDefaults.addFrameBoard ?? storedDefaults.addFrameToMonoblock));
  const [framePieceWidthCm, setFramePieceWidthCm] = useState<string>(() =>
    String(storedDefaults.framePieceWidthCm ?? (subType === "monoblock" ? "10" : "15"))
  );
  const [framePieceLengthCm, setFramePieceLengthCm] = useState<string>(() =>
    String(storedDefaults.framePieceLengthCm ?? (subType === "monoblock" ? "20" : "90"))
  );
  const [frameBorderRowCount, setFrameBorderRowCount] = useState<string>(
    String(storedDefaults.frameBorderRowCount ?? getFrameBorderRowCount(storedDefaults as Record<string, unknown>) ?? 1)
  );
  const [pathCornerType, setPathCornerType] = useState<"butt" | "miter45">(storedDefaults.pathCornerType ?? storedDefaults.frameJointType ?? "butt");
  const [frameCornerType, setFrameCornerType] = useState<"butt" | "miter45">(
    (storedDefaults.frameJointType as "butt" | "miter45") ?? "butt"
  );
  const [frameBorderMaterial, setFrameBorderMaterial] = useState<"slab" | "cobble">(() => {
    if (storedDefaults.frameBorderMaterial === "slab" || storedDefaults.frameBorderMaterial === "cobble") {
      return storedDefaults.frameBorderMaterial;
    }
    return subType === "monoblock" ? "cobble" : "slab";
  });
  const [frameSidesEnabled, setFrameSidesEnabled] = useState<boolean[]>(Array.isArray(storedDefaults.frameSidesEnabled) ? storedDefaults.frameSidesEnabled : []);
  const [frameIncludedInfo, setFrameIncludedInfo] = useState<string>("");

  const [calculatorResults, setCalculatorResults] = useState<any>(null);
  const lastInputsRef = useRef<Record<string, any>>({});
  const localPushingRef = useRef(false);

  useEffect(() => {
    if (subType === "monoblock" && monoblockLayoutMode === "mix" && vizPattern === "herringbone") {
      setVizPattern("grid");
    }
  }, [subType, monoblockLayoutMode, vizPattern]);

  // Load from shape.calculatorInputs when in edit mode
  useEffect(() => {
    if (!isEdit || !shape?.calculatorInputs) return;
    if (localPushingRef.current) { localPushingRef.current = false; return; }
    const c = shape.calculatorInputs;
    if (c.pathWidthCm != null) {
      if (subType === "monoblock") {
        setWidthMode("meters");
        setWidthMeters((Number(c.pathWidthCm) / 100).toFixed(2));
      } else {
        setWidthMode("centimeters");
        setWidthCentimeters(String(Math.round(Number(c.pathWidthCm))));
      }
    } else if (c.pathWidthM != null) {
      const m = Number(c.pathWidthM);
      setWidthMeters(m.toFixed(2));
      setWidthCentimeters(String(Math.round(m * 100)));
    }
    if (
      c.pathWidthMode &&
      ["centimeters", "meters", "slab1", "slab1_5", "slab2", "blocks"].includes(String(c.pathWidthMode))
    ) {
      if (subType === "monoblock" && c.pathWidthMode === "centimeters") {
        setWidthMode("meters");
      } else {
        setWidthMode(c.pathWidthMode as "centimeters" | "meters" | "slab1" | "slab1_5" | "slab2" | "blocks");
      }
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
    if (c.monoblockLayoutMode === "mix" || c.monoblockLayoutMode === "single") setMonoblockLayoutMode(c.monoblockLayoutMode);
    if (c.monoblockSingleSize === "10x10" || c.monoblockSingleSize === "20x10") setMonoblockSingleSize(c.monoblockSingleSize);
    if (c.monoblockMixId != null) setMonoblockMixId(String(c.monoblockMixId));
    if (c.monoblockMixEnabledSizes && typeof c.monoblockMixEnabledSizes === "object") {
      setMonoblockMixEnabledSizes({ ...defaultMonoblockMixEnabled(), ...c.monoblockMixEnabledSizes });
    }
    if (c.vizDirection != null) setVizDirection(Number(c.vizDirection));
    if (c.vizStartCorner != null) setVizStartCorner(Number(c.vizStartCorner));
    if (c.pathCornerType === "butt" || c.pathCornerType === "miter45") setPathCornerType(c.pathCornerType);
    else if (c.frameJointType === "butt" || c.frameJointType === "miter45") setPathCornerType(c.frameJointType);
    if (c.frameJointType === "butt" || c.frameJointType === "miter45") setFrameCornerType(c.frameJointType);
    if (c.addFrameBoard || c.addFrameToMonoblock) {
      setAddFrame(true);
      if (c.framePieceWidthCm != null) setFramePieceWidthCm(String(c.framePieceWidthCm));
      if (c.framePieceLengthCm != null) setFramePieceLengthCm(String(c.framePieceLengthCm));
      setFrameBorderRowCount(String(getFrameBorderRowCount(c)));
      if (c.frameJointType === "butt" || c.frameJointType === "miter45") setFrameCornerType(c.frameJointType);
      if (Array.isArray(c.frameSidesEnabled)) setFrameSidesEnabled(c.frameSidesEnabled);
      if (c.frameBorderMaterial === "slab" || c.frameBorderMaterial === "cobble") setFrameBorderMaterial(c.frameBorderMaterial);
    }
    if (c.slabSizeKey && ["40x40", "60x60", "90x60"].includes(c.slabSizeKey)) setConcreteSlabSizeKey(c.slabSizeKey as "40x40" | "60x60" | "90x60");
    setCalculatorResults(shape.calculatorResults ?? null);
    lastInputsRef.current = { ...shape.calculatorInputs };
  }, [isEdit, shape?.calculatorInputs, shape?.calculatorResults, subType]);

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

  /** Stale ID from localStorage / deleted tasks breaks SlabCalculator lookup; default to first available type. */
  useEffect(() => {
    if (subType !== "slabs" || slabTypes.length === 0) return;
    const ok = slabTypes.some((t: { id: string }) => String(t.id) === selectedSlabId);
    if (!selectedSlabId || !ok) {
      setSelectedSlabId(String(slabTypes[0].id));
    }
  }, [subType, slabTypes, selectedSlabId]);

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
      if (widthMode === "meters") baseM = parseFloat(widthMeters) || 0.6;
      else if (widthMode === "blocks") {
        const dims =
          monoblockLayoutMode === "mix"
            ? { blockWidthCm: 10, blockLengthCm: 20 }
            : singleSizeToBlockCm(monoblockSingleSize);
        const bw = dims.blockWidthCm / 100;
        const bl = dims.blockLengthCm / 100;
        const gap = (parseFloat(jointGapMm) || 1) / 1000;
        const n = parseInt(blockCount, 10) || 2;
        const acrossM = slabOrientation === "along" ? bw : bl;
        baseM = n * acrossM + (n - 1) * gap;
      } else {
        baseM = parseFloat(widthMeters) || 0.6;
      }
    } else if (widthMode === "centimeters") baseM = (parseFloat(widthCentimeters) || 60) / 100;
    else if (widthMode === "meters") baseM = parseFloat(widthMeters) || 0.6;
    else baseM = 0.6;
    const rowCnt = Math.max(1, Math.min(50, Math.floor(Number(frameBorderRowCount) || 1)));
    const frameW =
      addFrame && subType !== "concreteSlabs"
        ? ((parseFloat(framePieceWidthCm) || 0) / 100) * rowCnt
        : 0;
    if (addFrame && subType !== "concreteSlabs") {
      const absoluteWidthModes = widthMode === "meters" || widthMode === "centimeters";
      if (absoluteWidthModes) {
        return baseM;
      }
      return baseM + 2 * frameW;
    }
    return baseM;
  }, [subType, widthMode, widthMeters, widthCentimeters, slabDims, slabOrientation, groutWidthMm, blockCount, jointGapMm, concreteSlabSizeKey, addFrame, framePieceWidthCm, frameBorderRowCount, monoblockLayoutMode, monoblockSingleSize]);

  useEffect(() => {
    if ((widthMode === "meters" || widthMode === "centimeters") && addFrame) {
      setFrameIncludedInfo(t("project:path_frame_included"));
    } else if ((widthMode.startsWith("slab") || widthMode === "blocks") && addFrame) {
      setFrameIncludedInfo(t("project:path_frame_separate"));
    } else {
      setFrameIncludedInfo("");
    }
  }, [widthMode, addFrame, t]);

  const pathOrientationLabelKey =
    subType === "monoblock" ? "project:path_kostka_orientation" : "project:path_slab_orientation";

  useEffect(() => {
    if (subType !== "monoblock" || widthMode !== "centimeters") return;
    setWidthMode("meters");
    setWidthMeters(((parseFloat(widthCentimeters) || 60) / 100).toFixed(2));
  }, [subType, widthMode, widthCentimeters]);

  const buildCalculatorInputs = useCallback((): Record<string, any> => {
    const widthM = Math.max(0.2, Math.min(10, computedWidthM));
    const calculatorInputs: Record<string, any> = {
      pathWidthM: widthM,
      pathWidthCm: widthMode === "centimeters" ? (parseFloat(widthCentimeters) || 60) : undefined,
      pathWidthMode: widthMode,
      vizPattern,
      vizDirection,
      vizStartCorner,
      pathCornerType,
      frameJointType: frameCornerType,
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
      calculatorInputs.monoblockLayoutMode = monoblockLayoutMode;
      if (monoblockLayoutMode === "single") {
        const d = singleSizeToBlockCm(monoblockSingleSize);
        calculatorInputs.blockWidthCm = String(d.blockWidthCm);
        calculatorInputs.blockLengthCm = String(d.blockLengthCm);
        calculatorInputs.monoblockSingleSize = monoblockSingleSize;
      } else {
        calculatorInputs.blockWidthCm = "10";
        calculatorInputs.blockLengthCm = "20";
        calculatorInputs.monoblockMixId = monoblockMixId;
        calculatorInputs.monoblockMixEnabledSizes = monoblockMixEnabledSizes;
      }
      calculatorInputs.blockCount = blockCount;
      calculatorInputs.jointGapMm = jointGapMm;
      calculatorInputs.slabOrientation = slabOrientation;
      calculatorInputs.vizDirection = slabOrientation === "across" ? 90 : 0;
    }
    if (addFrame && subType !== "concreteSlabs") {
      calculatorInputs.frameBorderRowCount = Math.max(1, Math.min(50, Math.floor(Number(frameBorderRowCount) || 1)));
      calculatorInputs.framePieceWidthCm = framePieceWidthCm;
      calculatorInputs.framePieceLengthCm = framePieceLengthCm;
      calculatorInputs.frameJointType = frameCornerType;
      calculatorInputs.frameBorderMaterial = frameBorderMaterial;
      if (frameSidesEnabled.length > 0) calculatorInputs.frameSidesEnabled = frameSidesEnabled;
      if (subType === "slabs") {
        calculatorInputs.addFrameBoard = true;
        calculatorInputs.addFrameToMonoblock = undefined;
      } else {
        calculatorInputs.addFrameToMonoblock = true;
        calculatorInputs.addFrameBoard = undefined;
      }
    } else if (subType !== "concreteSlabs") {
      /* Overwrite lastInputsRef so unchecked frame does not leave stale viz (matches slabPattern frame-off flags). */
      if (subType === "slabs") {
        calculatorInputs.addFrameBoard = false;
        calculatorInputs.addFrameToMonoblock = undefined;
      }
      if (subType === "monoblock") {
        calculatorInputs.addFrameToMonoblock = false;
        calculatorInputs.addFrameBoard = undefined;
      }
      calculatorInputs.frameBorderRowCount = undefined;
      calculatorInputs.framePieceWidthCm = undefined;
      calculatorInputs.framePieceLengthCm = undefined;
      calculatorInputs.frameSidesEnabled = undefined;
      calculatorInputs.frameBorderMaterial = undefined;
    }
    return { ...lastInputsRef.current, ...calculatorInputs };
  }, [
    computedWidthM, subType, vizPattern, vizDirection, vizStartCorner, pathCornerType, frameCornerType,
    groutWidthMm, selectedSlabId, slabDims, slabOrientation,
    blockWidthCm, blockLengthCm, blockCount, jointGapMm,
    monoblockLayoutMode, monoblockSingleSize, monoblockMixId, monoblockMixEnabledSizes,
    addFrame, framePieceWidthCm, framePieceLengthCm, frameBorderRowCount, frameCornerType, frameSidesEnabled, frameBorderMaterial, concreteSlabSizeKey,
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
      monoblockLayoutMode: subType === "monoblock" ? monoblockLayoutMode : undefined,
      monoblockSingleSize: subType === "monoblock" && monoblockLayoutMode === "single" ? monoblockSingleSize : undefined,
      monoblockMixId: subType === "monoblock" && monoblockLayoutMode === "mix" ? monoblockMixId : undefined,
      monoblockMixEnabledSizes: subType === "monoblock" && monoblockLayoutMode === "mix" ? monoblockMixEnabledSizes : undefined,
      vizGroutWidthMm: groutWidthMm,
      vizPattern,
      vizDirection,
      vizStartCorner,
      addFrameBoard: subType === "slabs" ? addFrame : undefined,
      addFrameToMonoblock: subType === "monoblock" ? addFrame : undefined,
      frameBorderRowCount: addFrame ? frameBorderRowCount : undefined,
      framePieceWidthCm,
      framePieceLengthCm,
      pathCornerType,
      frameJointType: frameCornerType,
      frameBorderMaterial: addFrame && subType !== "concreteSlabs" ? frameBorderMaterial : undefined,
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
    const built = buildCalculatorInputs();
    lastInputsRef.current = { ...built, ...inputs };
    localPushingRef.current = true;
    onCalculatorInputsChange?.(shapeIdx ?? 0, lastInputsRef.current);
  }, [shapeIdx, onCalculatorInputsChange, buildCalculatorInputs]);

  /** Edit mode: push path width, slabOrientation, vizDirection, etc. to canvas whenever modal fields change.
   * Without this, SlabCalculator-only partial updates left stale orientation in lastInputsRef and the hydrate
   * effect reset the UI. Deferred so React state from the same tick (e.g. setSlabOrientation) is applied first. */
  useEffect(() => {
    if (!isEdit || !onCalculatorInputsChange || shapeIdx == null) return;
    const tid = window.setTimeout(() => {
      const built = buildCalculatorInputs();
      lastInputsRef.current = { ...lastInputsRef.current, ...built };
      localPushingRef.current = true;
      onCalculatorInputsChange(shapeIdx, lastInputsRef.current);
    }, 0);
    return () => clearTimeout(tid);
  }, [isEdit, shapeIdx, onCalculatorInputsChange, buildCalculatorInputs]);

  const stableOnResultsChange = useCallback((results: any) => {
    setCalculatorResults(results);
    onCalculatorResultsChange?.(shapeIdx ?? 0, results);
  }, [shapeIdx, onCalculatorResultsChange]);

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
      monoblockLayoutMode: subType === "monoblock" ? monoblockLayoutMode : undefined,
      monoblockSingleSize: subType === "monoblock" && monoblockLayoutMode === "single" ? monoblockSingleSize : undefined,
      monoblockMixId: subType === "monoblock" && monoblockLayoutMode === "mix" ? monoblockMixId : undefined,
      monoblockMixEnabledSizes: subType === "monoblock" && monoblockLayoutMode === "mix" ? monoblockMixEnabledSizes : undefined,
      vizGroutWidthMm: groutWidthMm,
      vizPattern,
      vizDirection,
      vizStartCorner,
      addFrameBoard: subType === "slabs" ? addFrame : undefined,
      addFrameToMonoblock: subType === "monoblock" ? addFrame : undefined,
      frameBorderRowCount: addFrame ? frameBorderRowCount : undefined,
      framePieceWidthCm,
      framePieceLengthCm,
      pathCornerType,
      frameJointType: frameCornerType,
      frameBorderMaterial: addFrame && subType !== "concreteSlabs" ? frameBorderMaterial : undefined,
    };
  }, [computedWidthM, widthMode, widthCentimeters, slabOrientation, selectedSlabId, concreteSlabSizeKey, blockWidthCm, blockLengthCm, blockCount, jointGapMm, groutWidthMm, vizPattern, vizDirection, vizStartCorner, addFrame, frameBorderRowCount, framePieceWidthCm, framePieceLengthCm, frameCornerType, pathCornerType, subType, monoblockLayoutMode, monoblockSingleSize, monoblockMixId, monoblockMixEnabledSizes, frameBorderMaterial]);

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
    <div className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: colors.bgModalBackdrop, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: spacing["3xl"] }}>
      <div className="canvas-modal-content" style={{ background: colors.bgElevated, border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, width: "100%", maxWidth: isEdit ? 700 : 480, maxHeight: "90vh", overflowY: "auto", boxShadow: shadows.modal }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottom: `1px solid ${colors.borderDefault}` }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary }}>{isEdit ? t("project:path_title_edit", { label }) : t("project:path_title", { label })}</h2>
          <button onClick={handleClose} style={{ padding: 8, background: "transparent", border: "none", cursor: "pointer", color: colors.textPrimary }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 16 }}>
          {isEdit && autoFill && (
            <div style={{ marginBottom: 16, padding: 12, background: colors.bgCardInner, borderRadius: 6, fontSize: 13, color: colors.textDim }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: colors.textPrimary }}>{t("project:path_area_title")}</div>
              <div>{t("project:path_area_value")} <strong style={{ color: colors.accentBlue }}>{autoFill.areaM2?.toFixed(3) ?? "—"} m²</strong></div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: colors.textPrimary, fontSize: 13 }}>{t("project:path_width_title")}</div>
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
                        background: widthMode === v ? accentAlpha(0.27) : colors.bgOverlay,
                        border: `1px solid ${widthMode === v ? colors.accentBlue : colors.borderDefault}`,
                        borderRadius: 6,
                        color: colors.textPrimary,
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
                      style={{ width: 80, padding: "6px 10px", background: colors.bgInput, border: `1px solid ${colors.borderDefault}`, borderRadius: 6, color: colors.textPrimary, fontSize: 13 }}
                    />
                    <span style={{ marginLeft: 8, color: colors.textDim, fontSize: 13 }}>cm</span>
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
                      style={{ width: 80, padding: "6px 10px", background: colors.bgInput, border: `1px solid ${colors.borderDefault}`, borderRadius: 6, color: colors.textPrimary, fontSize: 13 }}
                    />
                    <span style={{ marginLeft: 8, color: colors.textDim, fontSize: 13 }}>m</span>
                  </div>
                )}
                {subType === "concreteSlabs" && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: colors.textDim, marginRight: 8 }}>{t("project:path_slab_size")}</label>
                    <select
                      value={concreteSlabSizeKey}
                      onChange={(e) => setConcreteSlabSizeKey(e.target.value as "40x40" | "60x60" | "90x60")}
                      style={{ padding: "6px 10px", background: colors.bgInput, border: `1px solid ${colors.borderDefault}`, borderRadius: 6, color: colors.textPrimary, fontSize: 13, minWidth: 120 }}
                    >
                      <option value="40x40">{t("project:path_slab_size_40x40")}</option>
                      <option value="60x60">{t("project:path_slab_size_60x60")}</option>
                      <option value="90x60">{t("project:path_slab_size_90x60")}</option>
                    </select>
                  </div>
                )}
                {subType === "slabs" && slabTypes.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: colors.textDim, marginRight: 8 }}>{t("project:path_slab_type")}</label>
                    <select
                      value={selectedSlabId}
                      onChange={(e) => setSelectedSlabId(e.target.value)}
                      style={{ padding: "6px 10px", background: colors.bgInput, border: `1px solid ${colors.borderDefault}`, borderRadius: 6, color: colors.textPrimary, fontSize: 13, minWidth: 180 }}
                    >
                      <option value="">{t("project:path_select_placeholder")}</option>
                      {slabTypes.map((t: { id: string; name: string }) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 4 }}>{t(pathOrientationLabelKey)}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setSlabOrientation("along")}
                      style={{
                        padding: "6px 12px",
                        background: slabOrientation === "along" ? accentAlpha(0.27) : colors.bgOverlay,
                        border: `1px solid ${slabOrientation === "along" ? colors.accentBlue : colors.borderDefault}`,
                        borderRadius: 6,
                        color: colors.textPrimary,
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
                        background: slabOrientation === "across" ? accentAlpha(0.27) : colors.bgOverlay,
                        border: `1px solid ${slabOrientation === "across" ? colors.accentBlue : colors.borderDefault}`,
                        borderRadius: 6,
                        color: colors.textPrimary,
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
                    { v: "meters" as const, labelKey: "path_width_m" },
                    { v: "blocks" as const, labelKey: "path_width_blocks" },
                  ].map(({ v, labelKey }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setWidthMode(v)}
                      style={{
                        padding: "6px 12px",
                        background: widthMode === v ? accentAlpha(0.27) : colors.bgOverlay,
                        border: `1px solid ${widthMode === v ? colors.accentBlue : colors.borderDefault}`,
                        borderRadius: 6,
                        color: colors.textPrimary,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {t(`project:${labelKey}`)}
                    </button>
                  ))}
                </div>
                {widthMode === "meters" && (
                  <div style={{ marginBottom: 8 }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.2"
                      max="10"
                      value={widthMeters}
                      onChange={(e) => setWidthMeters(e.target.value)}
                      style={{ width: 80, padding: "6px 10px", background: colors.bgInput, border: `1px solid ${colors.borderDefault}`, borderRadius: 6, color: colors.textPrimary, fontSize: 13 }}
                    />
                    <span style={{ marginLeft: 8, color: colors.textDim, fontSize: 13 }}>m</span>
                  </div>
                )}
                {widthMode === "blocks" && (
                  <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div>
                      <label style={{ fontSize: 11, color: colors.textDim }}>{t("project:path_block_count")}</label>
                      <input type="number" min={1} value={blockCount} onChange={(e) => setBlockCount(e.target.value)} style={{ width: 56, padding: 4, marginLeft: 4 }} />
                    </div>
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 4 }}>{t(pathOrientationLabelKey)}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setSlabOrientation("along")}
                      style={{
                        padding: "6px 12px",
                        background: slabOrientation === "along" ? accentAlpha(0.27) : colors.bgOverlay,
                        border: `1px solid ${slabOrientation === "along" ? colors.accentBlue : colors.borderDefault}`,
                        borderRadius: 6,
                        color: colors.textPrimary,
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
                        background: slabOrientation === "across" ? accentAlpha(0.27) : colors.bgOverlay,
                        border: `1px solid ${slabOrientation === "across" ? colors.accentBlue : colors.borderDefault}`,
                        borderRadius: 6,
                        color: colors.textPrimary,
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
            <div style={{ fontSize: 12, color: colors.textDim }}>
              {t("project:path_width_value")} <strong style={{ color: colors.accentBlue }}>{computedWidthM.toFixed(2)} m</strong>
            </div>
          </div>

          {subType === "slabs" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: colors.textPrimary, fontSize: 13 }}>{t("project:path_grout_width")}</div>
              <input type="number" value={groutWidthMm} onChange={(e) => setGroutWidthMm(e.target.value)} style={{ width: 60, padding: "6px 10px", background: colors.bgInput, border: `1px solid ${colors.borderDefault}`, borderRadius: 6, color: colors.textPrimary }} />
            </div>
          )}
          {subType === "concreteSlabs" && (
            <div style={{ marginBottom: 16, fontSize: 12, color: colors.textDim }}>{t("project:path_concrete_no_grout")}</div>
          )}

          {subType === "monoblock" && (
            <div style={{ marginBottom: 16, padding: 12, background: "rgba(0,0,0,0.15)", borderRadius: 6 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: colors.textPrimary, fontSize: 13 }}>{t("calculator:monoblock_size_mode")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: colors.textPrimary }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="path-monoblock-mode"
                    checked={monoblockLayoutMode === "single" && monoblockSingleSize === "20x10"}
                    onChange={() => {
                      setMonoblockLayoutMode("single");
                      setMonoblockSingleSize("20x10");
                    }}
                  />
                  {t("calculator:monoblock_single_20x10")}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="path-monoblock-mode"
                    checked={monoblockLayoutMode === "single" && monoblockSingleSize === "10x10"}
                    onChange={() => {
                      setMonoblockLayoutMode("single");
                      setMonoblockSingleSize("10x10");
                    }}
                  />
                  {t("calculator:monoblock_single_10x10")}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="path-monoblock-mode"
                    checked={monoblockLayoutMode === "mix"}
                    onChange={() => {
                      setMonoblockLayoutMode("mix");
                      setMonoblockMixEnabledSizes((prev) => ({ ...defaultMonoblockMixEnabled(), ...prev }));
                    }}
                  />
                  {t("calculator:monoblock_mode_mix")}
                </label>
              </div>
              {monoblockLayoutMode === "mix" && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>{t("calculator:monoblock_mix_choose")}</div>
                  {MONOBLOCK_MIXES.map((m) => (
                    <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 4 }}>
                      <input
                        type="radio"
                        name="path-monoblock-mix"
                        checked={monoblockMixId === m.id}
                        onChange={() => {
                          setMonoblockMixId(m.id);
                          setMonoblockMixEnabledSizes(defaultMonoblockMixEnabled());
                        }}
                      />
                      {t(m.labelKey)}
                    </label>
                  ))}
                  <div style={{ fontSize: 11, color: colors.textDim, marginTop: 8, marginBottom: 4 }}>{t("calculator:monoblock_mix_pieces")}</div>
                  {MONOBLOCK_MIXES.find((x) => x.id === monoblockMixId)?.pieces.map((p) => (
                    <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={monoblockMixEnabledSizes[p.key] !== false}
                        onChange={(e) =>
                          setMonoblockMixEnabledSizes((prev) => ({ ...prev, [p.key]: e.target.checked }))
                        }
                      />
                      {p.lengthCm}×{p.widthCm} cm
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: colors.textPrimary, fontSize: 13 }}>{t("project:path_pattern")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {pathPatternOptions.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setVizPattern(p)}
                  style={{
                    padding: "6px 12px",
                    background: vizPattern === p ? accentAlpha(0.27) : colors.bgOverlay,
                    border: `1px solid ${vizPattern === p ? colors.accentBlue : colors.borderDefault}`,
                    borderRadius: 6,
                    color: colors.textPrimary,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {p === "grid" ? t("project:path_pattern_grid") : p === "brick" ? t("project:path_pattern_brick") : p === "onethird" ? t("project:path_pattern_onethird") : t("project:path_pattern_herringbone")}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: colors.textPrimary, fontSize: 13 }}>{t("project:path_corners")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setPathCornerType("butt")}
                style={{
                  padding: "6px 12px",
                  background: pathCornerType === "butt" ? accentAlpha(0.27) : colors.bgOverlay,
                  border: `1px solid ${pathCornerType === "butt" ? colors.accentBlue : colors.borderDefault}`,
                  borderRadius: 6,
                  color: colors.textPrimary,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {t("project:path_corner_butt")}
              </button>
              <button
                type="button"
                onClick={() => setPathCornerType("miter45")}
                style={{
                  padding: "6px 12px",
                  background: pathCornerType === "miter45" ? accentAlpha(0.27) : colors.bgOverlay,
                  border: `1px solid ${pathCornerType === "miter45" ? colors.accentBlue : colors.borderDefault}`,
                  borderRadius: 6,
                  color: colors.textPrimary,
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
              <span style={{ color: colors.textPrimary, fontSize: 13 }}>{t("project:path_add_frame")}</span>
            </label>
            )}
            {addFrame && subType !== "concreteSlabs" && (
              <div style={{ marginTop: 8, padding: 8, background: colors.bgInput, borderRadius: 6 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: colors.textPrimary, fontSize: 12 }}>{t("project:path_frame_material_label")}</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setFrameBorderMaterial("slab")}
                    style={{
                      padding: "6px 12px",
                      background: frameBorderMaterial === "slab" ? accentAlpha(0.27) : colors.bgOverlay,
                      border: `1px solid ${frameBorderMaterial === "slab" ? colors.accentBlue : colors.borderDefault}`,
                      borderRadius: 6,
                      color: colors.textPrimary,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {t("project:path_frame_material_slab")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrameBorderMaterial("cobble")}
                    style={{
                      padding: "6px 12px",
                      background: frameBorderMaterial === "cobble" ? accentAlpha(0.27) : colors.bgOverlay,
                      border: `1px solid ${frameBorderMaterial === "cobble" ? colors.accentBlue : colors.borderDefault}`,
                      borderRadius: 6,
                      color: colors.textPrimary,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {t("project:path_frame_material_cobble")}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div>
                    <label style={{ fontSize: 11, color: colors.textDim }}>
                      {frameBorderMaterial === "cobble" ? t("project:path_frame_length_cobble") : t("project:path_frame_length_slab")}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={framePieceLengthCm}
                      onChange={(e) => setFramePieceLengthCm(e.target.value)}
                      style={{ width: 60, padding: 4, marginLeft: 4, background: colors.bgElevated, border: `1px solid ${colors.borderDefault}`, borderRadius: 4, color: colors.textPrimary }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: colors.textDim }}>
                      {frameBorderMaterial === "cobble" ? t("project:path_frame_width_cobble") : t("project:path_frame_width_slab")}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={framePieceWidthCm}
                      onChange={(e) => setFramePieceWidthCm(e.target.value)}
                      style={{ width: 60, padding: 4, marginLeft: 4, background: colors.bgElevated, border: `1px solid ${colors.borderDefault}`, borderRadius: 4, color: colors.textPrimary }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: colors.textDim }}>{t("project:path_frame_row_count_label")}</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={frameBorderRowCount}
                      onChange={(e) => setFrameBorderRowCount(e.target.value)}
                      style={{ width: 56, padding: 4, marginLeft: 4, background: colors.bgElevated, border: `1px solid ${colors.borderDefault}`, borderRadius: 4, color: colors.textPrimary }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, color: colors.textPrimary, fontSize: 11 }}>{t("project:path_frame_corners")}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setFrameCornerType("butt")}
                      style={{
                        padding: "6px 12px",
                        background: frameCornerType === "butt" ? accentAlpha(0.27) : colors.bgOverlay,
                        border: `1px solid ${frameCornerType === "butt" ? colors.accentBlue : colors.borderDefault}`,
                        borderRadius: 6,
                        color: colors.textPrimary,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {t("project:path_corner_butt")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFrameCornerType("miter45")}
                      style={{
                        padding: "6px 12px",
                        background: frameCornerType === "miter45" ? accentAlpha(0.27) : colors.bgOverlay,
                        border: `1px solid ${frameCornerType === "miter45" ? colors.accentBlue : colors.borderDefault}`,
                        borderRadius: 6,
                        color: colors.textPrimary,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {t("project:path_corner_mitre")}
                    </button>
                  </div>
                </div>
                {isEdit && shape?.closed && (() => {
                  const pts = getPathPolygon(shape);
                  if (!pts || pts.length < 3) return null;
                  return (
                    <div style={{ marginTop: 12 }}>
                      <FrameSidesSelector
                        points={pts}
                        frameSidesEnabled={frameSidesEnabled}
                        onChange={setFrameSidesEnabled}
                        width={280}
                        height={180}
                      />
                    </div>
                  );
                })()}
                {frameIncludedInfo && (
                  <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4 }}>{frameIncludedInfo}</div>
                )}
              </div>
            )}
          </div>

          {isEdit && shape && (
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${colors.borderDefault}` }}>
              <div style={{ fontWeight: 600, marginBottom: 12, color: colors.textPrimary, fontSize: 13 }}>{t("project:path_calculation")}</div>
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
                  recalculateTrigger={autoCalculateTrigger}
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
                  recalculateTrigger={autoCalculateTrigger}
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
                  recalculateTrigger={autoCalculateTrigger}
                />
              )}
            </div>
          )}
        </div>

        <div style={{ padding: 16, borderTop: `1px solid ${colors.borderDefault}`, display: "flex", justifyContent: "flex-end", gap: 12 }}>
          {isEdit && calculatorResults && onViewResults && shapeIdx != null && (
            <button
              onClick={() => { onViewResults(shapeIdx); handleClose(); }}
              style={{ padding: `${spacing.md}px ${spacing["3xl"]}px`, background: "rgba(139,92,246,0.15)", border: `1px solid ${colors.purpleLight}`, borderRadius: radii.md, color: colors.purpleLight, cursor: "pointer", fontSize: 13 }}
            >
              {`📊 ${t("project:path_view_results")}`}
            </button>
          )}
          <button
            onClick={handleClose}
            style={{ padding: "8px 16px", background: colors.bgOverlay, border: `1px solid ${colors.borderDefault}`, borderRadius: 6, color: colors.textPrimary, cursor: "pointer", fontSize: 13 }}
          >
            {t("common:cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            style={{
              padding: "8px 16px",
              background: isValid ? colors.accentBlue : colors.bgOverlay,
              border: "none",
              borderRadius: 6,
              color: isValid ? colors.bgInput : colors.textDim,
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
