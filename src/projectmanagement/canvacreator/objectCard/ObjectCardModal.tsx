// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — objectCard/ObjectCardModal.tsx
// Modal for assigning calculator type and configuring element
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../lib/store";
import { Shape } from "../geometry";
import { C } from "../geometry";
import { ProjectSettings } from "../types";
import { computeAutoFill } from "./autoFill";
import { getGroupsForElement, type CalcGroup, type CalcSubType } from "./calculatorGroups";
import { parseSlabDimensions } from "../visualization/slabPattern";
import { autoLayoutGrassPieces, autoJoinAdjacentPieces, validateCoverage, getEffectiveTotalArea, getEffectivePieceDimensionsForInput, type GrassPiece } from "../visualization/grassRolls";
import { computePreparation } from "../preparationLogic";
import { getCalculatorInputDefaults } from "../../../lib/materialUsageDefaults";
import { translateUnit } from "../../../lib/translationMap";

import WallCalculator from "../../../components/Calculator/WallCalculator";
import SleeperWallCalculator from "../../../components/Calculator/SleeperWallCalculator";
import KerbsEdgesAndSetsCalculator from "../../../components/Calculator/KerbsEdgesAndSetsCalculator";
import FenceCalculator from "../../../components/Calculator/FenceCalculator";
import SlabCalculator from "../../../components/Calculator/SlabCalculator";
import ConcreteSlabsCalculator from "../../../components/Calculator/ConcreteSlabsCalculator";
import StairCalculator from "../../../components/Calculator/StairCalculator";
import LShapeStairCalculator from "../../../components/Calculator/LShapeStairCalculator";
import UShapeStairCalculator from "../../../components/Calculator/Ushapestaircalculator";
import { mapProjectCompactorToOption } from "../../../components/Calculator/CompactorSelector";
import PavingCalculator from "../../../components/Calculator/PavingCalculator";
import ArtificialGrassCalculator from "../../../components/Calculator/ArtificialGrassCalculator";
import NaturalTurfCalculator from "../../../components/Calculator/NaturalTurfCalculator";
import FoundationCalculator from "../../../components/Calculator/FoundationCalculator";
import DeckCalculator from "../../../components/Calculator/DeckCalculator";
import GroundworkLinearCalculator from "../../../components/Calculator/GroundworkLinearCalculator";
import { getFoundationDiggingMethodFromExcavator } from "../GroundworkLinearCalculator";
import VenetianFenceCalculator from "../../../components/Calculator/VenetianFenceCalculator";
import CompositeFenceCalculator from "../../../components/Calculator/CompositeFenceCalculator";

interface ObjectCardModalProps {
  shapes: Shape[];
  shape: Shape;
  shapeIdx: number;
  onClose: () => void;
  onSave: (shapeIdx: number, updates: Partial<Shape>) => void;
  projectSettings: ProjectSettings;
  onProjectSettingsChange?: (updates: Partial<ProjectSettings>) => void;
  /** Live preview: update shape.calculatorInputs for canvas when modal is open */
  onCalculatorInputsChange?: (shapeIdx: number, inputs: Record<string, any>) => void;
  /** Incremented when projectSettings change — triggers calculator recalculation */
  recalculateTrigger?: number;
  /** Hide material transport carrier (set in project card when on canvas) */
  hideMaterialTransportCarrier?: boolean;
}

const ObjectCardModal: React.FC<ObjectCardModalProps> = ({
  shapes,
  shape,
  shapeIdx,
  onClose,
  onSave,
  projectSettings,
  onProjectSettingsChange,
  onCalculatorInputsChange,
  recalculateTrigger = 0,
  hideMaterialTransportCarrier = false,
}) => {
  const { t } = useTranslation(["project"]);
  const companyId = useAuthStore((s) => s.getCompanyId());
  const [calculatorType, setCalculatorType] = useState<string>(shape.calculatorType ?? "");
  const [calculatorSubType, setCalculatorSubType] = useState<string>(shape.calculatorSubType ?? "default");
  const [calculatorResults, setCalculatorResults] = useState<any>(shape.calculatorResults ?? null);
  const lastInputsRef = useRef<Record<string, any>>(shape.calculatorInputs ?? {});
  const resultsMatchInputsRef = useRef(true); // true = last Calculate used current inputs
  const [liveInputs, setLiveInputs] = useState<Record<string, any>>(shape.calculatorInputs ?? {});
  const [carriers, setCarriers] = useState<any[]>([]);
  const stableOnInputsChange = useCallback((inputs: Record<string, any>) => {
    lastInputsRef.current = { ...lastInputsRef.current, ...inputs };
    resultsMatchInputsRef.current = false; // user changed input without Calculate
    setLiveInputs((prev) => {
      const merged = { ...prev, ...inputs };
      const keys = new Set([...Object.keys(prev), ...Object.keys(inputs)]);
      for (const k of keys) {
        if (String(prev[k] ?? "") !== String(merged[k] ?? "")) return merged;
      }
      return prev;
    });
    onCalculatorInputsChange?.(shapeIdx, lastInputsRef.current);
  }, [shapeIdx, onCalculatorInputsChange]);
  const stableOnResultsChange = useCallback((results: any) => {
    setCalculatorResults(results);
    resultsMatchInputsRef.current = true; // user clicked Calculate, results match inputs
  }, []);

  const autoFill = computeAutoFill(shape, shapes);
  const groups = getGroupsForElement(shape.elementType, shape.calculatorType);

  const preparationForShape = useMemo(() => {
    if (calculatorType !== "paving" || !shapes?.length) return null;
    const result = computePreparation(
      shapes,
      projectSettings.soilType ?? "clay",
      projectSettings.levelingMaterial ?? "tape1"
    );
    return result.elements.find((el) => el.shapeIdx === shapeIdx) ?? null;
  }, [shapes, shapeIdx, calculatorType, projectSettings.soilType, projectSettings.levelingMaterial]);

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

  // Fetch slab types when slab calculator type — for immediate pattern viz (no need to select type first)
  const { data: slabTypesData = [] } = useQuery({
    queryKey: ["slab_laying_types", companyId || "no-company"],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("event_tasks_with_dynamic_estimates")
        .select("id, name, unit, estimated_hours")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data || []).filter(
        (t: { name?: string }) => (t.name || "").toLowerCase().includes("laying slabs")
      );
    },
    enabled: !!companyId && calculatorType === "slab",
  });

  useEffect(() => {
    setCalculatorType(shape.calculatorType ?? "");
    setCalculatorSubType(shape.calculatorSubType ?? "default");
    setCalculatorResults(shape.calculatorResults ?? null);
    lastInputsRef.current = shape.calculatorInputs ?? {};
    resultsMatchInputsRef.current = true; // loaded saved state, inputs match results
  }, [shape.calculatorType, shape.calculatorSubType, shape.calculatorResults]);

  const handleTypeSelect = (type: string, subType: string) => {
    setCalculatorType(type);
    setCalculatorSubType(subType);
    setCalculatorResults(null);
  };

  const handleSave = () => {
    if (calculatorResults) {
      // Only save inputs if user clicked Calculate (results match inputs).
      // If user changed input but didn't Calculate, keep old inputs to avoid mismatch.
      const inputsToSave = resultsMatchInputsRef.current
        ? lastInputsRef.current
        : (shape.calculatorInputs ?? {});
      const merged = { ...inputsToSave };
      if (calculatorType === "slab" && slabDims && calculatorSubType !== "concreteSlabs") {
        merged.vizPattern = vizPattern;
        merged.vizDirection = vizDirection;
        merged.vizStartCorner = vizStartCorner;
        merged.vizGroutWidthMm = vizGroutWidthMm;
        merged.vizSlabWidth = slabDims.widthCm;
        merged.vizSlabLength = slabDims.lengthCm;
        merged.frameJointType = lastInputsRef.current?.frameJointType;
      }
      if (calculatorType === "concreteSlabs" || (calculatorType === "slab" && calculatorSubType === "concreteSlabs")) {
        merged.vizPattern = vizPattern;
        merged.vizDirection = vizDirection;
        merged.vizStartCorner = vizStartCorner;
        merged.vizGroutWidthMm = 0;
        const slabSizeKey = lastInputsRef.current?.slabSizeKey ?? "60x60";
        const dims = slabSizeKey === "40x40" ? { widthCm: 40, lengthCm: 40 } : slabSizeKey === "90x60" ? { widthCm: 90, lengthCm: 60 } : { widthCm: 60, lengthCm: 60 };
        merged.vizSlabWidth = dims.widthCm;
        merged.vizSlabLength = dims.lengthCm;
        merged.slabSizeKey = slabSizeKey;
      }
      if (calculatorType === "paving") {
        merged.vizPattern = vizPattern;
        merged.vizDirection = vizDirection;
        merged.vizStartCorner = vizStartCorner;
        merged.blockWidthCm = merged.blockWidthCm ?? 20;
        merged.blockLengthCm = merged.blockLengthCm ?? 10;
        merged.jointGapMm = merged.jointGapMm ?? 1;
        merged.addFrameToMonoblock = lastInputsRef.current?.addFrameToMonoblock;
        merged.framePieceLengthCm = lastInputsRef.current?.framePieceLengthCm;
        merged.framePieceWidthCm = lastInputsRef.current?.framePieceWidthCm;
        merged.frameJointType = lastInputsRef.current?.frameJointType;
      }
      const updates: Partial<Shape> & { _createLinkedFoundation?: boolean } = {
        calculatorType,
        calculatorSubType,
        calculatorInputs: merged,
        calculatorResults,
      };
      if (calculatorType === "wall" && autoFill.edgeLengthsM && autoFill.edgeLengthsM.length > 0) {
        merged.segmentLengths = merged.segmentLengths ?? autoFill.edgeLengthsM;
        const defH = parseFloat(String(merged.height ?? "1")) || 1;
        const n = merged.segmentLengths?.length ?? 0;
        if (!merged.segmentHeights || merged.segmentHeights.length !== n) {
          merged.segmentHeights = Array.from({ length: n }, () => ({ startH: defH, endH: defH }));
        }
      }
      if (calculatorType === "fence" && autoFill.edgeLengthsM && autoFill.edgeLengthsM.length > 0) {
        merged.segmentLengths = merged.segmentLengths ?? autoFill.edgeLengthsM;
      }
      if (calculatorType === "kerbs" && autoFill.edgeLengthsM && autoFill.edgeLengthsM.length > 0) {
        merged.segmentLengths = merged.segmentLengths ?? autoFill.edgeLengthsM;
      }
      if (calculatorType === "wall" && merged.includeFoundation && !shape.linkedShapeIdx) {
        updates._createLinkedFoundation = true;
      }
      if (calculatorType === "grass") {
        merged.rollsOrientation = "along";
        merged.grassVizDirection = grassVizDirection;
        const shapeWithInputs = { ...shape, calculatorInputs: { ...shape.calculatorInputs, ...merged } };
        const laidOut = autoJoinAdjacentPieces(autoLayoutGrassPieces(shapeWithInputs, grassPieces));
        const cov = validateCoverage(shapeWithInputs, laidOut);
        const effectiveAreaM2 = getEffectiveTotalArea(laidOut);
        merged.vizPieces = laidOut.map((p, i) => {
          const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(p, laidOut, i);
          return { ...p, effectiveWidthM, effectiveLengthM };
        });
        merged.effectiveAreaM2 = effectiveAreaM2;
        merged.jointsLength = String(cov.joinLengthM.toFixed(2));
        merged.trimLength = String(cov.trimLengthM.toFixed(2));
      }
      onSave(shapeIdx, updates);
    }
  };

  const canSave = calculatorType !== "" && calculatorResults !== null;

  const savedInputsSnapshot = shape.calculatorInputs ?? {};
  const slabTypeName = savedInputsSnapshot.selectedSlabName ?? liveInputs.selectedSlabName ?? "";
  const firstSlabTypeName = slabTypesData.length > 0 ? slabTypesData[0]?.name ?? "" : "";
  const slabTypeNameForViz = slabTypeName || firstSlabTypeName;
  const slabDims = parseSlabDimensions(slabTypeNameForViz);
  const [vizPattern, setVizPattern] = useState<string>(savedInputsSnapshot.vizPattern ?? "grid");
  const normDir = (d: number): number => {
    const v = Number(d);
    if (isNaN(v)) return 0;
    return ((v % 360) + 360) % 360;
  };
  const [vizDirection, setVizDirection] = useState<number>(() => normDir(Number(savedInputsSnapshot.vizDirection ?? 0)));
  const [vizStartCorner, setVizStartCorner] = useState<number>(Number(savedInputsSnapshot.vizStartCorner ?? 0));
  const legacyGroutMm = savedInputsSnapshot.vizGroutWidth != null ? Math.round(Number(savedInputsSnapshot.vizGroutWidth) * 10) : undefined;
  const [vizGroutWidthMm, setVizGroutWidthMm] = useState<number>(Number(savedInputsSnapshot.vizGroutWidthMm ?? legacyGroutMm ?? 5));
  const grassLivePreviewInProgressRef = useRef(false);
  const [grassPieces, setGrassPieces] = useState<GrassPiece[]>(() => {
    const p = savedInputsSnapshot.vizPieces;
    if (Array.isArray(p) && p.length > 0) return p;
    return [{ id: "1", widthM: 4, lengthM: 10, x: 0, y: 0, rotation: 0 }];
  });
  const [grassVizDirection, setGrassVizDirection] = useState<number>(() =>
    normDir(Number(savedInputsSnapshot.grassVizDirection ?? savedInputsSnapshot.vizDirection ?? 0))
  );
  useEffect(() => {
    setVizPattern(savedInputsSnapshot.vizPattern ?? "grid");
    setVizDirection(normDir(Number(savedInputsSnapshot.vizDirection ?? 0)));
    setVizStartCorner(Number(savedInputsSnapshot.vizStartCorner ?? 0));
    const legacyMm = savedInputsSnapshot.vizGroutWidth != null ? Math.round(Number(savedInputsSnapshot.vizGroutWidth) * 10) : undefined;
    setVizGroutWidthMm(Number(savedInputsSnapshot.vizGroutWidthMm ?? legacyMm ?? 5));
    if (!grassLivePreviewInProgressRef.current) {
      const p = savedInputsSnapshot.vizPieces;
      if (Array.isArray(p) && p.length > 0) setGrassPieces(p);
    }
    grassLivePreviewInProgressRef.current = false;
    setGrassVizDirection(normDir(Number(savedInputsSnapshot.grassVizDirection ?? savedInputsSnapshot.vizDirection ?? 0)));
  }, [savedInputsSnapshot.vizPattern, savedInputsSnapshot.vizDirection, savedInputsSnapshot.vizStartCorner, savedInputsSnapshot.vizGroutWidthMm, savedInputsSnapshot.vizPieces, savedInputsSnapshot.grassVizDirection]);
  useEffect(() => {
    if (calculatorType !== "grass" || !onCalculatorInputsChange || !shape.closed || shape.points.length < 3) return;
    grassLivePreviewInProgressRef.current = true;
    const shapeWithInputs = { ...shape, calculatorInputs: { ...shape.calculatorInputs, rollsOrientation: "along", grassVizDirection } };
    const laidOut = autoJoinAdjacentPieces(autoLayoutGrassPieces(shapeWithInputs, grassPieces));
    const cov = validateCoverage(shapeWithInputs, laidOut);
    const effectiveAreaM2 = getEffectiveTotalArea(laidOut);
    const vizPieces = laidOut.map((p, i) => {
      const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(p, laidOut, i);
      return { ...p, effectiveWidthM, effectiveLengthM };
    });
    onCalculatorInputsChange(shapeIdx, {
      rollsOrientation: "along",
      grassVizDirection,
      vizPieces,
      effectiveAreaM2,
      jointsLength: String(cov.joinLengthM.toFixed(2)),
      trimLength: String(cov.trimLengthM.toFixed(2)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shape excluded to avoid loop: onCalculatorInputsChange updates parent -> new shape -> re-run
  }, [calculatorType, grassVizDirection, grassPieces, shapeIdx, onCalculatorInputsChange]);
  const materialCarrier = projectSettings.selectedMaterialCarrier ?? projectSettings.selectedCarrier;
  const projectCompactor = mapProjectCompactorToOption(projectSettings.selectedCompactor);
  const effectiveCalcTypeForDefaults = (calculatorType === "slab" && calculatorSubType === "concreteSlabs") ? "concreteSlabs" : calculatorType;
  const materialDefaults = useMemo(
    () => getCalculatorInputDefaults(effectiveCalcTypeForDefaults, companyId),
    [effectiveCalcTypeForDefaults, companyId]
  );
  const isConcreteSlabs = calculatorType === "concreteSlabs" || (calculatorType === "slab" && calculatorSubType === "concreteSlabs");
  const THICKNESS_KEYS = ["tape1ThicknessCm", "sandThicknessCm", "mortarThicknessCm", "monoBlocksHeightCm", "slabThicknessCm", "concreteSlabThicknessCm"];
  const savedInputsMerged = useMemo(() => {
    const filterEmpty = (obj: Record<string, any>) => {
      const out = { ...obj };
      THICKNESS_KEYS.forEach((k) => {
        const v = out[k];
        if (v === "" || v == null) delete out[k];
      });
      return out;
    };
    const base = { ...materialDefaults, ...filterEmpty(savedInputsSnapshot), ...filterEmpty(liveInputs) };
    if (isConcreteSlabs) {
      delete base.mortarThicknessCm;
      delete base.slabThicknessCm;
      delete base.selectedSlabId;
      delete base.selectedSlabName;
      delete base.selectedGroutingId;
      delete base.addFrameBoard;
    }
    return base;
  }, [materialDefaults, savedInputsSnapshot, liveInputs, isConcreteSlabs]);
  const commonProps = {
    onResultsChange: stableOnResultsChange,
    onInputsChange: stableOnInputsChange,
    savedInputs: savedInputsMerged,
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

  const renderCalculator = () => {
    const areaProps = {
      ...commonProps,
      initialArea: savedInputsSnapshot?.area != null ? parseFloat(String(savedInputsSnapshot.area)) : autoFill.areaM2,
      ...(calculatorType === "paving" && preparationForShape
        ? { fillTonnes: preparationForShape.fillTonnes, levelingMaterial: projectSettings.levelingMaterial ?? "tape1" }
        : {}),
    };
    const lengthProps = {
      ...commonProps,
      initialLength: savedInputsSnapshot?.length != null ? parseFloat(String(savedInputsSnapshot.length)) : autoFill.totalLengthM,
      ...(calculatorType === "wall" && autoFill.edgeLengthsM && autoFill.edgeLengthsM.length > 0
        ? { savedInputs: { ...savedInputsMerged, segmentLengths: savedInputsSnapshot.segmentLengths ?? autoFill.edgeLengthsM } }
        : {}),
      ...(calculatorType === "wall" ? { canvasMode: true, canvasLength: autoFill.totalLengthM, shape } : {}),
      ...(calculatorType === "fence" && autoFill.edgeLengthsM && autoFill.edgeLengthsM.length > 0
        ? { savedInputs: { ...savedInputsMerged, segmentLengths: savedInputsSnapshot.segmentLengths ?? autoFill.edgeLengthsM } }
        : {}),
      ...(calculatorType === "fence" ? { canvasMode: true, canvasLength: autoFill.totalLengthM } : {}),
      ...(calculatorType === "kerbs" && autoFill.edgeLengthsM && autoFill.edgeLengthsM.length > 0
        ? { savedInputs: { ...savedInputsMerged, segmentLengths: savedInputsSnapshot.segmentLengths ?? autoFill.edgeLengthsM } }
        : {}),
      ...(calculatorType === "kerbs" ? { canvasMode: true, canvasLength: autoFill.totalLengthM } : {}),
    };
    switch (calculatorType) {
      case "paving":
        return <PavingCalculator {...areaProps} shape={shape} />;
      case "concreteSlabs":
        return <ConcreteSlabsCalculator {...areaProps} shape={shape} />;
      case "slab":
        if (calculatorSubType === "concreteSlabs") return <ConcreteSlabsCalculator {...areaProps} shape={shape} />;
        return <SlabCalculator {...areaProps} shape={shape} />;
      case "wall":
        if (calculatorSubType === "sleeper") return <SleeperWallCalculator {...lengthProps} />;
        return <WallCalculator type={calculatorSubType as "brick" | "block4" | "block7"} {...lengthProps} />;
      case "kerbs":
        return <KerbsEdgesAndSetsCalculator type={calculatorSubType as "kl" | "rumbled" | "flat" | "sets"} {...lengthProps} />;
      case "fence":
        if (calculatorSubType === "venetian") return <VenetianFenceCalculator {...lengthProps} />;
        if (calculatorSubType === "composite") return <CompositeFenceCalculator {...lengthProps} />;
        return <FenceCalculator fenceType={calculatorSubType as "vertical" | "horizontal"} {...lengthProps} />;
      case "steps":
        if (calculatorSubType === "l_shape") return <LShapeStairCalculator {...commonProps} />;
        if (calculatorSubType === "u_shape") return <UShapeStairCalculator {...commonProps} />;
        return <StairCalculator {...commonProps} />;
      case "grass":
        return <ArtificialGrassCalculator {...areaProps} shape={shape} />;
      case "turf":
        return <NaturalTurfCalculator {...areaProps} shape={shape} />;
      case "foundation":
        return <FoundationCalculator {...lengthProps} />;
      case "groundwork":
        return (
          <GroundworkLinearCalculator
            type={calculatorSubType as "drainage" | "canalPipe" | "waterPipe" | "cable"}
            {...lengthProps}
            projectDiggingMethod={getFoundationDiggingMethodFromExcavator(projectSettings.selectedExcavator)}
            selectedExcavator={projectSettings.selectedExcavator}
          />
        );
      case "deck":
        return <DeckCalculator {...areaProps} />;
      default:
        return null;
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, paddingLeft: "max(16px, 240px)" }}>
      <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, width: "100%", maxWidth: 900, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottom: `1px solid ${C.panelBorder}` }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text }}>{t("project:object_card_title", { label: shape.label || "" })}</h2>
          <button onClick={onClose} style={{ padding: 8, background: "transparent", border: "none", cursor: "pointer", color: C.text }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {/* Auto-fill from canvas */}
          <div style={{ marginBottom: 16, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 6, fontSize: 13, color: C.textDim }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: C.text }}>{t("project:from_canvas")}</div>
            {autoFill.areaM2 !== undefined && <div>{t("project:object_card_area")} {autoFill.areaM2.toFixed(3)} m²</div>}
            {autoFill.totalLengthM !== undefined && <div>{t("project:object_card_length")} {autoFill.totalLengthM.toFixed(3)} m</div>}
            {autoFill.perimeterM !== undefined && <div>{t("project:object_card_perimeter")} {autoFill.perimeterM.toFixed(3)} m</div>}
            {autoFill.boundingBoxLengthM !== undefined && <div>{t("project:object_card_bounding_length")} {autoFill.boundingBoxLengthM.toFixed(3)} m</div>}
            {autoFill.boundingBoxWidthM !== undefined && <div>{t("project:object_card_bounding_width")} {autoFill.boundingBoxWidthM.toFixed(3)} m</div>}
          </div>

          {/* Material transport carrier (for calculator materials: slabs, pavers, etc. — not turf/grass, not wall in canvas) */}
          {!hideMaterialTransportCarrier && calculatorType && calculatorType !== "turf" && calculatorType !== "grass" && calculatorType !== "wall" && carriers.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: C.text, fontSize: 13 }}>{t("project:object_card_material_carrier")}</div>
              <select
                value={(materialCarrier as any)?.id ?? ""}
                onChange={e => {
                  const c = carriers.find(x => x.id === e.target.value) || null;
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
                {carriers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {(c["size (in tones)"] ?? c.size) != null ? `(${c["size (in tones)"] ?? c.size}t)` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Type selector */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: C.text }}>{t("project:object_card_element_type")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {groups.map((group: CalcGroup) =>
                group.subTypes.map((st: CalcSubType) => {
                  const active = calculatorType === group.type && calculatorSubType === st.type;
                  return (
                    <button
                      key={`${group.type}-${st.type}`}
                      onClick={() => handleTypeSelect(group.type, st.type)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 6,
                        border: `1px solid ${active ? C.accent : C.panelBorder}`,
                        background: active ? C.accent + "22" : C.button,
                        color: active ? C.accent : C.text,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {t(`project:${st.label}`)}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Saved results summary (shown immediately on re-open) */}
          {calculatorType && calculatorType !== "turf" && calculatorResults && (
            <div style={{ marginBottom: 16, padding: 12, background: "rgba(46,204,113,0.08)", border: `1px solid rgba(46,204,113,0.3)`, borderRadius: 6, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: C.text }}>{t("project:object_card_last_result")}</div>
              {calculatorResults.hours_worked != null && (
                <div style={{ color: C.text }}>{t("project:object_card_total_hours")} <span style={{ color: "#2ecc71", fontWeight: 600 }}>{Number(calculatorResults.hours_worked).toFixed(2)} h</span></div>
              )}
              {calculatorResults.materials && calculatorResults.materials.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ color: C.textDim, marginBottom: 4 }}>{t("project:object_card_materials")}</div>
                  {calculatorResults.materials.map((m: any, i: number) => (
                    <div key={i} style={{ color: C.text, paddingLeft: 8 }}>
                      {m.name}: {m.quantity ?? m.amount} {translateUnit(m.unit, t)}
                    </div>
                  ))}
                </div>
              )}
              {calculatorResults.taskBreakdown && calculatorResults.taskBreakdown.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ color: C.textDim, marginBottom: 4 }}>{t("project:object_card_tasks")}</div>
                  {calculatorResults.taskBreakdown.map((t: any, i: number) => (
                    <div key={i} style={{ color: C.text, paddingLeft: 8 }}>
                      {t.task ?? t.name}: {Number(t.hours).toFixed(2)} h
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: 11, color: C.textDim }}>{t("project:object_card_change_inputs")}</div>
            </div>
          )}

          {/* Slab pattern visualization (only when dimensions parseable) */}
          {calculatorType === "slab" && calculatorSubType !== "concreteSlabs" && slabDims && shape.closed && shape.points.length >= 3 && (
            <div style={{ marginTop: 16, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 6 }}>
              <div style={{ fontWeight: 600, marginBottom: 10, color: C.text }}>{t("project:object_card_pattern_viz")}</div>
              <div style={{ marginBottom: 8, fontSize: 12, color: C.textDim }}>{t("project:object_card_detected_slab")} {slabDims.widthCm} × {slabDims.lengthCm} cm</div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 }}>{t("project:object_card_pattern")}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["grid", "brick"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setVizPattern(p)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${vizPattern === p ? C.accent : C.panelBorder}`,
                        background: vizPattern === p ? C.accent + "22" : C.button,
                        color: vizPattern === p ? C.accent : C.text,
                        cursor: "pointer",
                        fontSize: 12,
                        textTransform: "capitalize",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 }}>{t("project:object_card_laying_direction")}</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {([0, 45, 90] as const).map((deg) => (
                    <button
                      key={deg}
                      onClick={() => setVizDirection(deg)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${vizDirection === deg ? C.accent : C.panelBorder}`,
                        background: vizDirection === deg ? C.accent + "22" : C.button,
                        color: vizDirection === deg ? C.accent : C.text,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {deg}°
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    max={359}
                    step={1}
                    value={vizDirection}
                    onChange={(e) => setVizDirection(normDir(parseFloat(e.target.value) || 0))}
                    style={{
                      width: 70,
                      padding: "6px 8px",
                      background: C.bg,
                      border: `1px solid ${C.panelBorder}`,
                      borderRadius: 6,
                      color: C.text,
                      fontSize: 12,
                    }}
                    title={t("project:custom_rotation_title")}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 }}>{t("project:object_card_grout_width")}</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={vizGroutWidthMm}
                  onChange={(e) => setVizGroutWidthMm(Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 5)))}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    background: C.bg,
                    border: `1px solid ${C.panelBorder}`,
                    borderRadius: 6,
                    color: C.text,
                    fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 }}>{t("project:object_card_starting_corner")}</label>
                <select
                  value={vizStartCorner}
                  onChange={(e) => setVizStartCorner(parseInt(e.target.value, 10))}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    background: C.bg,
                    border: `1px solid ${C.panelBorder}`,
                    borderRadius: 6,
                    color: C.text,
                    fontSize: 13,
                  }}
                >
                  {shape.points.map((_, i) => (
                    <option key={i} value={i}>{t("project:object_card_corner", { n: i + 1 })}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Concrete slabs pattern visualization (no grout - slabs touch) */}
          {isConcreteSlabs && shape.closed && shape.points.length >= 3 && (
            <div style={{ marginTop: 16, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 6 }}>
              <div style={{ fontWeight: 600, marginBottom: 10, color: C.text }}>{t("project:object_card_pattern_viz")}</div>
              <div style={{ marginBottom: 8, fontSize: 12, color: C.textDim }}>
                {t("project:path_slab_size")} {(() => {
                  const k = lastInputsRef.current?.slabSizeKey ?? savedInputsSnapshot.slabSizeKey ?? "60x60";
                  return k === "40x40" ? "40 × 40" : k === "90x60" ? "90 × 60" : "60 × 60";
                })()} cm ({t("project:object_card_slab_no_grout")})
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 }}>{t("project:object_card_pattern")}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["grid", "brick"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setVizPattern(p)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${vizPattern === p ? C.accent : C.panelBorder}`,
                        background: vizPattern === p ? C.accent + "22" : C.button,
                        color: vizPattern === p ? C.accent : C.text,
                        cursor: "pointer",
                        fontSize: 12,
                        textTransform: "capitalize",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 }}>{t("project:object_card_laying_direction")}</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {([0, 45, 90] as const).map((deg) => (
                    <button
                      key={deg}
                      onClick={() => setVizDirection(deg)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${vizDirection === deg ? C.accent : C.panelBorder}`,
                        background: vizDirection === deg ? C.accent + "22" : C.button,
                        color: vizDirection === deg ? C.accent : C.text,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {deg}°
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    max={359}
                    step={1}
                    value={vizDirection}
                    onChange={(e) => setVizDirection(normDir(parseFloat(e.target.value) || 0))}
                    style={{
                      width: 70,
                      padding: "6px 8px",
                      background: C.bg,
                      border: `1px solid ${C.panelBorder}`,
                      borderRadius: 6,
                      color: C.text,
                      fontSize: 12,
                    }}
                    title={t("project:custom_rotation_title")}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 }}>{t("project:object_card_starting_corner")}</label>
                <select
                  value={vizStartCorner}
                  onChange={(e) => setVizStartCorner(parseInt(e.target.value, 10))}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    background: C.bg,
                    border: `1px solid ${C.panelBorder}`,
                    borderRadius: 6,
                    color: C.text,
                    fontSize: 13,
                  }}
                >
                  {shape.points.map((_, i) => (
                    <option key={i} value={i}>{t("project:object_card_corner", { n: i + 1 })}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Paving pattern visualization */}
          {calculatorType === "paving" && shape.closed && shape.points.length >= 3 && (
            <div style={{ marginTop: 16, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 6 }}>
              <div style={{ fontWeight: 600, marginBottom: 10, color: C.text }}>{t("project:object_card_pattern_viz")}</div>
              <div style={{ marginBottom: 8, fontSize: 12, color: C.textDim }}>{t("project:object_card_blocks_dimensions")}</div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 }}>{t("project:object_card_pattern")}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["grid", "brick"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setVizPattern(p)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${vizPattern === p ? C.accent : C.panelBorder}`,
                        background: vizPattern === p ? C.accent + "22" : C.button,
                        color: vizPattern === p ? C.accent : C.text,
                        cursor: "pointer",
                        fontSize: 12,
                        textTransform: "capitalize",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 }}>{t("project:object_card_laying_direction")}</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {([0, 45, 90] as const).map((deg) => (
                    <button
                      key={deg}
                      onClick={() => setVizDirection(deg)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${vizDirection === deg ? C.accent : C.panelBorder}`,
                        background: vizDirection === deg ? C.accent + "22" : C.button,
                        color: vizDirection === deg ? C.accent : C.text,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {deg}°
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    max={359}
                    step={1}
                    value={vizDirection}
                    onChange={(e) => setVizDirection(normDir(parseFloat(e.target.value) || 0))}
                    style={{
                      width: 70,
                      padding: "6px 8px",
                      background: C.bg,
                      border: `1px solid ${C.panelBorder}`,
                      borderRadius: 6,
                      color: C.text,
                      fontSize: 12,
                    }}
                    title={t("project:custom_rotation_title")}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 }}>{t("project:object_card_starting_corner")}</label>
                <select
                  value={vizStartCorner}
                  onChange={(e) => setVizStartCorner(parseInt(e.target.value, 10))}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    background: C.bg,
                    border: `1px solid ${C.panelBorder}`,
                    borderRadius: 6,
                    color: C.text,
                    fontSize: 13,
                  }}
                >
                  {shape.points.map((_, i) => (
                    <option key={i} value={i}>{t("project:object_card_corner", { n: i + 1 })}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Grass pieces (for artificial grass) */}
          {calculatorType === "grass" && shape.closed && shape.points.length >= 3 && (
            <div style={{ marginTop: 16, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 6 }}>
              <div style={{ fontWeight: 600, marginBottom: 10, color: C.text }}>{t("project:object_card_grass_pieces")}</div>
              <p style={{ fontSize: 12, color: C.textDim, marginBottom: 10 }}>{t("project:object_card_grass_pieces_desc")}</p>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 }}>{t("project:object_card_laying_direction")}</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {([0, 45, 90, 135, 180] as const).map((deg) => (
                    <button
                      key={deg}
                      onClick={() => setGrassVizDirection(deg)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${grassVizDirection === deg ? C.accent : C.panelBorder}`,
                        background: grassVizDirection === deg ? C.accent + "22" : C.button,
                        color: grassVizDirection === deg ? C.accent : C.text,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {deg}°
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    max={359}
                    step={1}
                    value={grassVizDirection}
                    onChange={(e) => setGrassVizDirection(normDir(parseFloat(e.target.value) || 0))}
                    style={{
                      width: 70,
                      padding: "6px 8px",
                      background: C.bg,
                      border: `1px solid ${C.panelBorder}`,
                      borderRadius: 6,
                      color: C.text,
                      fontSize: 12,
                    }}
                    title={t("project:custom_rotation_title")}
                  />
                </div>
              </div>
              {grassPieces.map((piece, i) => (
                <div key={piece.id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: C.textDim, minWidth: 60 }}>{t("project:object_card_piece")} {i + 1}</span>
                  <input
                    type="number"
                    placeholder={t("project:object_card_length_m")}
                    value={piece.lengthM === 0 ? "" : piece.lengthM}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === "") setGrassPieces(prev => prev.map((p, j) => j === i ? { ...p, lengthM: 0 } : p));
                      else { const n = parseFloat(v); if (!isNaN(n)) setGrassPieces(prev => prev.map((p, j) => j === i ? { ...p, lengthM: n } : p)); }
                    }}
                    style={{ width: 80, padding: "6px 8px", background: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 12 }}
                  />
                  <span style={{ color: C.textDim }}>×</span>
                  <input
                    type="number"
                    placeholder={t("project:object_card_width_m")}
                    title={piece.trimEdges?.length ? t("project:object_card_effective_width") : undefined}
                    value={piece.trimEdges?.length ? getEffectivePieceDimensionsForInput(piece, grassPieces, i).effectiveWidthM : (piece.widthM === 0 ? "" : piece.widthM)}
                    onChange={e => {
                      if (piece.trimEdges?.length) return;
                      const v = e.target.value;
                      if (v === "") setGrassPieces(prev => prev.map((p, j) => j === i ? { ...p, widthM: 0 } : p));
                      else { const n = parseFloat(v); if (!isNaN(n)) setGrassPieces(prev => prev.map((p, j) => j === i ? { ...p, widthM: n } : p)); }
                    }}
                    readOnly={!!(piece.trimEdges?.length)}
                    style={{ width: 80, padding: "6px 8px", background: piece.trimEdges?.length ? "rgba(0,0,0,0.2)" : C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 12 }}
                  />
                  <span style={{ fontSize: 12, color: C.textDim }}>{piece.trimEdges?.length ? t("project:object_card_unit_effective") : t("project:object_card_unit_m")}</span>
                  {grassPieces.length > 1 && (
                    <button
                      onClick={() => setGrassPieces(prev => prev.filter((_, j) => j !== i))}
                      style={{ padding: "4px 8px", background: C.danger, border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 11 }}
                    >
                      {t("project:object_card_remove")}
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setGrassPieces(prev => [...prev, { id: String(Date.now()), widthM: 4, lengthM: 10, x: 0, y: 0, rotation: 0 }])}
                style={{ padding: "6px 12px", background: C.accent, border: "none", borderRadius: 6, color: C.bg, cursor: "pointer", fontSize: 12 }}
              >
                {t("project:object_card_add_piece")}
              </button>
            </div>
          )}

          {/* Calculator */}
          {calculatorType && (
            <div style={{ marginTop: 16 }}>{renderCalculator()}</div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: 16, borderTop: `1px solid ${C.panelBorder}`, background: "rgba(0,0,0,0.2)" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, cursor: "pointer", fontSize: 13 }}>
            {t("project:object_card_cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              padding: "8px 16px",
              background: canSave ? C.accent : C.button,
              border: `1px solid ${canSave ? C.accent : C.panelBorder}`,
              borderRadius: 6,
              color: canSave ? C.bg : C.textDim,
              cursor: canSave ? "pointer" : "default",
              fontSize: 13,
              opacity: canSave ? 1 : 0.5,
            }}
          >
            {t("project:object_card_save_to_shape")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ObjectCardModal;
