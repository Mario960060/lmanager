import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Info, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity, FOOT_CARRY_SPEED_M_PER_H, DEFAULT_CARRIER_SPEED_M_PER_H } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import {
  getSegmentOuterLeafAvgM,
  getSegmentInnerLeafAvgM,
  type WallSegmentHeightRow,
} from '../../projectmanagement/canvacreator/linearElements';
import { WallTileSidesSelector } from '../../projectmanagement/canvacreator/objectCard/WallTileSidesSelector';
import TileInstallationCalculator from './TileInstallationCalculator';
import CopingInstallationCalculator from './CopingInstallationCalculator';
import {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
  radii,
  gradients,
} from '../../themes/designTokens';
import {
  TextInput,
  SelectDropdown,
  Checkbox,
  Button,
  Card,
  Label,
  DataTable,
} from '../../themes/uiComponents';

function formatDoubleWallLeafCaption(
  wallType: 'brick' | 'block4' | 'block7',
  brickBond: 'stretcher' | 'header',
  layingMethod: 'flat' | 'standing',
  t: TFunction
): string {
  const mat =
    wallType === 'brick'
      ? t('calculator:inner_wall_option_brick')
      : wallType === 'block4'
        ? t('calculator:inner_wall_option_block4')
        : t('calculator:inner_wall_option_block7');
  if (wallType === 'brick') {
    const bond = brickBond === 'header' ? t('calculator:brick_bond_header') : t('calculator:brick_bond_stretcher');
    return `${mat} · ${bond}`;
  }
  const lay = layingMethod === 'flat' ? t('calculator:flat_label') : t('calculator:standing_label');
  return `${mat} · ${lay}`;
}

function parseBulkHeightM(raw: string): number | null {
  const v = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

/** Task names in DB may still say "7-inch"; match both for block7 walls. */
function taskNameMatchesBlockWallType(taskName: string, wallKind: 'block4' | 'block7'): boolean {
  const n = taskName.toLowerCase();
  if (wallKind === 'block4') return n.includes('4-inch');
  return n.includes('6-inch') || n.includes('7-inch');
}

interface Shape {
  points: { x: number; y: number }[];
  elementType?: string;
  calculatorInputs?: Record<string, any>;
}

interface CalculatorProps {
  type: 'brick' | 'block4' | 'block7' | 'sleeper';
  onResultsChange?: (results: any) => void;
  onInputsChange?: (inputs: Record<string, any>) => void;
  isInProjectCreating?: boolean;
  initialLength?: number;
  savedInputs?: Record<string, any>;
  shape?: Shape;
  calculateTransport?: boolean;
  setCalculateTransport?: (value: boolean) => void;
  selectedTransportCarrier?: any;
  setSelectedTransportCarrier?: (value: any) => void;
  transportDistance?: string;
  setTransportDistance?: (value: string) => void;
  carriers?: any[];
  selectedExcavator?: any;
  /** Canvas Object Card mode — compact dark UI */
  canvasMode?: boolean;
  canvasLength?: number;
  recalculateTrigger?: number;
  /** From Project Card Equipment tab — used when isInProjectCreating, foundation inputs hidden */
  projectSoilType?: 'clay' | 'sand' | 'rock';
  projectDiggingMethod?: 'shovel' | 'small' | 'medium' | 'large';
  /** Canvas/sidebar subtype `double_wall` maps to type brick; keeps label distinct from plain brick wall */
  wallBrickVariant?: 'brick' | 'double_wall';
}

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

interface MaterialFromDB {
  id: string;
  name: string;
  unit: string;
  price: number | null;
}

interface MaterialUsageConfig {
  calculator_id: string;
  material_id: string;
}

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  "size (in tones)": number;
}

const WallCalculator: React.FC<CalculatorProps> = ({ 
  type, 
  onResultsChange,
  onInputsChange,
  isInProjectCreating = false,
  initialLength,
  savedInputs = {},
  shape,
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  setSelectedTransportCarrier: propSetSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  setTransportDistance: propSetTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator,
  canvasMode = false,
  canvasLength,
  recalculateTrigger = 0,
  projectSoilType: propProjectSoilType,
  projectDiggingMethod: propProjectDiggingMethod,
  wallBrickVariant,
}) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const isDoubleWall = wallBrickVariant === 'double_wall';

  const defaultDoubleWallRow = (h: number): WallSegmentHeightRow => ({
    startH: h,
    endH: h,
    outerStartH: h,
    outerEndH: h,
    innerStartH: h,
    innerEndH: h,
  });
  const [layingMethod, setLayingMethod] = useState<'flat' | 'standing'>('standing');
  const [brickBond, setBrickBond] = useState<'stretcher' | 'header'>(
    savedInputs?.brickBond === 'header' ? 'header' : 'stretcher'
  );
  useEffect(() => {
    if (savedInputs?.brickBond === 'header') setBrickBond('header');
    else if (savedInputs?.brickBond === 'stretcher') setBrickBond('stretcher');
  }, [savedInputs?.brickBond]);
  const [outerWallType, setOuterWallType] = useState<'brick' | 'block4' | 'block7'>(() => {
    const w = savedInputs?.outerWallType;
    if (w === 'brick' || w === 'block4' || w === 'block7') return w;
    return 'brick';
  });
  const [innerWallType, setInnerWallType] = useState<'brick' | 'block4' | 'block7'>(() => {
    const w = savedInputs?.innerWallType;
    return w === 'brick' || w === 'block4' || w === 'block7' ? w : 'block4';
  });
  const [outerBrickBond, setOuterBrickBond] = useState<'stretcher' | 'header'>(() => {
    if (savedInputs?.outerBrickBond === 'header') return 'header';
    if (savedInputs?.outerBrickBond === 'stretcher') return 'stretcher';
    if (savedInputs?.brickBond === 'header') return 'header';
    return 'stretcher';
  });
  const [innerBrickBond, setInnerBrickBond] = useState<'stretcher' | 'header'>(() => {
    if (savedInputs?.innerBrickBond === 'header') return 'header';
    if (savedInputs?.innerBrickBond === 'stretcher') return 'stretcher';
    if (savedInputs?.brickBond === 'header') return 'header';
    return 'stretcher';
  });
  const [outerLayingMethod, setOuterLayingMethod] = useState<'flat' | 'standing'>(() =>
    savedInputs?.outerLayingMethod === 'flat' ? 'flat' : 'standing'
  );
  const [innerLayingMethod, setInnerLayingMethod] = useState<'flat' | 'standing'>(
    savedInputs?.innerLayingMethod === 'flat' ? 'flat' : 'standing'
  );
  useEffect(() => {
    const w = savedInputs?.outerWallType;
    if (w === 'brick' || w === 'block4' || w === 'block7') setOuterWallType(w);
  }, [savedInputs?.outerWallType]);
  useEffect(() => {
    const w = savedInputs?.innerWallType;
    if (w === 'brick' || w === 'block4' || w === 'block7') setInnerWallType(w);
  }, [savedInputs?.innerWallType]);
  useEffect(() => {
    if (savedInputs?.outerBrickBond === 'header') setOuterBrickBond('header');
    else if (savedInputs?.outerBrickBond === 'stretcher') setOuterBrickBond('stretcher');
  }, [savedInputs?.outerBrickBond]);
  useEffect(() => {
    if (savedInputs?.innerBrickBond === 'header') setInnerBrickBond('header');
    else if (savedInputs?.innerBrickBond === 'stretcher') setInnerBrickBond('stretcher');
  }, [savedInputs?.innerBrickBond]);
  useEffect(() => {
    if (savedInputs?.outerLayingMethod === 'flat') setOuterLayingMethod('flat');
    else if (savedInputs?.outerLayingMethod === 'standing') setOuterLayingMethod('standing');
  }, [savedInputs?.outerLayingMethod]);
  useEffect(() => {
    if (savedInputs?.innerLayingMethod === 'flat') setInnerLayingMethod('flat');
    else if (savedInputs?.innerLayingMethod === 'standing') setInnerLayingMethod('standing');
  }, [savedInputs?.innerLayingMethod]);
  const [postMethod, setPostMethod] = useState<'concrete' | 'direct'>(savedInputs?.postMethod ?? 'concrete');
  const [length, setLength] = useState<string>(initialLength != null ? initialLength.toFixed(3) : '');
  const [height, setHeight] = useState<string>('');
  useEffect(() => {
    if (initialLength != null && isInProjectCreating) setLength(initialLength.toFixed(3));
  }, [initialLength, isInProjectCreating]);
  const [result, setResult] = useState<{ 
    units: number; 
    cementBags: number;
    sandVolume: number;
    sandTonnes: number;
    rows: number; 
    roundedDownHeight: number; 
    roundedUpHeight: number;
    totalHours: number;
    taskBreakdown: { task: string; hours: number; normalizedHours?: number }[];
    materials: Material[];
    /** Inner leaf piece count when brick + cavity wall */
    innerLeafUnits?: number;
  } | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const effectiveCalculateTransport = isInProjectCreating ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSelectedTransportCarrier = isInProjectCreating ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;
  const effectiveTransportDistance = isInProjectCreating && propTransportDistance ? propTransportDistance : transportDistance;
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [includeFoundation, setIncludeFoundation] = useState<boolean>(savedInputs?.includeFoundation ?? false);
  const [includeCopings, setIncludeCopings] = useState<boolean>(savedInputs?.includeCopings ?? false);
  const [includeTileInstallation, setIncludeTileInstallation] = useState<boolean>(savedInputs?.includeTileInstallation ?? false);
  const [tileInstallationResults, setTileInstallationResults] = useState<any>(null);
  const [tileCalculateTrigger, setTileCalculateTrigger] = useState(0);
  const [copingInstallationResults, setCopingInstallationResults] = useState<any>(null);
  const [copingCalculateTrigger, setCopingCalculateTrigger] = useState(0);
  const [copingSlabLength, setCopingSlabLength] = useState<string>(savedInputs?.copingSlabLength ?? '90');
  const [copingSlabWidth, setCopingSlabWidth] = useState<string>(savedInputs?.copingSlabWidth ?? '60');
  const [copingGap, setCopingGap] = useState<number>(savedInputs?.copingGap ?? 2);
  const [copingAdhesiveThickness, setCopingAdhesiveThickness] = useState<string>(savedInputs?.copingAdhesiveThickness ?? '0.5');
  const [coping45Cut, setCoping45Cut] = useState<boolean>(savedInputs?.coping45Cut ?? false);
  const [copingGroutingId, setCopingGroutingId] = useState<string>(savedInputs?.copingGroutingId ?? '');
  const [segmentTileSides, setSegmentTileSides] = useState<boolean[][]>(() => {
    const existing = savedInputs?.segmentTileSides as boolean[][] | undefined;
    const n = savedInputs?.segmentLengths?.length ?? 0;
    if (existing && existing.length === n) return existing.map((row) => [...row]);
    return Array.from({ length: n }, () => [false, false]);
  });
  const [frontFacesTiled, setFrontFacesTiled] = useState<[boolean, boolean]>(() => {
    const existing = savedInputs?.frontFacesTiled as [boolean, boolean] | undefined;
    return existing ?? [false, false];
  });
  const [wallTileSlabThicknessCm, setWallTileSlabThicknessCm] = useState<string>(savedInputs?.wallTileSlabThicknessCm ?? '2');
  const [wallTileAdhesiveThicknessCm, setWallTileAdhesiveThicknessCm] = useState<string>(savedInputs?.wallTileAdhesiveThicknessCm ?? '0.5');
  // Foundation Calculator inputs
  const [foundationLength, setFoundationLength] = useState<string>(savedInputs?.foundationLength ?? '');
  const [foundationWidth, setFoundationWidth] = useState<string>(savedInputs?.foundationWidth ?? '');
  const [foundationDepthCm, setFoundationDepthCm] = useState<string>(savedInputs?.foundationDepthCm ?? '');
  const [foundationDiggingMethod, setFoundationDiggingMethod] = useState<'shovel' | 'small' | 'medium' | 'large'>(savedInputs?.foundationDiggingMethod ?? 'shovel');
  const [foundationSoilType, setFoundationSoilType] = useState<'clay' | 'sand' | 'rock'>(savedInputs?.foundationSoilType ?? 'clay');
  const effectiveFoundationDiggingMethod = isInProjectCreating && propProjectDiggingMethod ? propProjectDiggingMethod : foundationDiggingMethod;
  const effectiveFoundationSoilType = isInProjectCreating && propProjectSoilType ? propProjectSoilType : foundationSoilType;

  const segmentLengthsFromSaved: number[] = savedInputs?.segmentLengths ?? [];
  /** Manual segment lengths for sleeper wall when not from canvas (standalone / ProjectCreating). */
  const [manualSegmentLengths, setManualSegmentLengths] = useState<number[]>([]);

  const defH = parseFloat(height) || 1;
  const [wallConfigMode, setWallConfigMode] = useState<'single' | 'segments'>(
    segmentLengthsFromSaved.length > 1 ? 'segments' : 'single'
  );

  const segmentLengths: number[] = useMemo(() => {
    if (segmentLengthsFromSaved.length > 0) return segmentLengthsFromSaved;
    if (type === 'sleeper' && !canvasMode && wallConfigMode === 'segments' && manualSegmentLengths.length > 0) {
      return manualSegmentLengths;
    }
    return [];
  }, [segmentLengthsFromSaved, type, canvasMode, wallConfigMode, manualSegmentLengths]);

  const [segmentHeights, setSegmentHeights] = useState<WallSegmentHeightRow[]>(() => {
    const existing = savedInputs?.segmentHeights as WallSegmentHeightRow[] | undefined;
    const h0 = parseFloat(String(savedInputs?.height ?? '1')) || 1;
    if (existing && existing.length === segmentLengthsFromSaved.length) return existing.map(s => ({ ...s }));
    return segmentLengthsFromSaved.map(() =>
      wallBrickVariant === 'double_wall' ? defaultDoubleWallRow(h0) : { startH: h0, endH: h0 }
    );
  });

  /** Canvas / saved geometry: user cannot switch back to single length without editing the shape. */
  const segmentSingleLocked = segmentLengthsFromSaved.length > 1;

  useEffect(() => {
    if (segmentLengths.length > 1) setWallConfigMode('segments');
  }, [segmentLengths.length]);

  useEffect(() => {
    const segLens = savedInputs?.segmentLengths ?? [];
    const existing = savedInputs?.segmentHeights as WallSegmentHeightRow[] | undefined;
    const h = parseFloat(String(savedInputs?.height ?? '1')) || 1;
    const next =
      existing && existing.length === segLens.length
        ? existing.map((s) => ({ ...s }))
        : segLens.length > 0
          ? segLens.map(() => (isDoubleWall ? defaultDoubleWallRow(h) : { startH: h, endH: h }))
          : null;
    if (next) setSegmentHeights(next);
  }, [savedInputs?.segmentLengths, savedInputs?.segmentHeights, savedInputs?.height, isDoubleWall]);

  useEffect(() => {
    const segLens = savedInputs?.segmentLengths ?? segmentLengths;
    const existing = savedInputs?.segmentTileSides as boolean[][] | undefined;
    if (existing && existing.length === segLens.length) {
      setSegmentTileSides(existing.map((row) => [...row]));
    } else if (segLens.length > 0) {
      setSegmentTileSides((prev) =>
        segLens.map((_: unknown, i: number) => (prev[i] ? [...prev[i]] : [false, false]))
      );
    }
    const ff = savedInputs?.frontFacesTiled as [boolean, boolean] | undefined;
    if (ff) setFrontFacesTiled([...ff]);
  }, [savedInputs?.segmentLengths, savedInputs?.segmentTileSides, savedInputs?.frontFacesTiled, segmentLengths]);

  useEffect(() => {
    if (savedInputs?.postMethod === 'concrete' || savedInputs?.postMethod === 'direct') {
      setPostMethod(savedInputs.postMethod);
    }
  }, [savedInputs?.postMethod]);

  useEffect(() => {
    if (savedInputs?.copingSlabLength != null) setCopingSlabLength(String(savedInputs.copingSlabLength));
    if (savedInputs?.copingSlabWidth != null) setCopingSlabWidth(String(savedInputs.copingSlabWidth));
    if (savedInputs?.copingGap != null) setCopingGap(Number(savedInputs.copingGap));
    if (savedInputs?.copingAdhesiveThickness != null) setCopingAdhesiveThickness(String(savedInputs.copingAdhesiveThickness));
    if (savedInputs?.coping45Cut != null) setCoping45Cut(Boolean(savedInputs.coping45Cut));
    if (savedInputs?.copingGroutingId != null) setCopingGroutingId(String(savedInputs.copingGroutingId));
  }, [savedInputs?.copingSlabLength, savedInputs?.copingSlabWidth, savedInputs?.copingGap, savedInputs?.copingAdhesiveThickness, savedInputs?.coping45Cut, savedInputs?.copingGroutingId]);

  type SegmentHeightField = 'startH' | 'endH' | 'outerStartH' | 'outerEndH' | 'innerStartH' | 'innerEndH';
  const updateSegmentHeight = (idx: number, field: SegmentHeightField, value: number) => {
    setSegmentHeights((prev) => {
      const next = [...prev];
      if (!next[idx]) {
        next[idx] = isDoubleWall ? defaultDoubleWallRow(defH) : { startH: defH, endH: defH };
      }
      next[idx] = { ...next[idx], [field]: Math.max(0, value) };
      return next;
    });
  };

  /** Single-leaf wall: one height for all segments. Double wall: use setAllOuterHeights / setAllInnerHeights. */
  const setAllHeights = (h: number) => {
    setSegmentHeights(
      segmentLengths.map(() => (isDoubleWall ? defaultDoubleWallRow(h) : { startH: h, endH: h }))
    );
  };

  const setAllOuterHeights = (h: number) => {
    setSegmentHeights((prev) =>
      segmentLengths.map((_, idx) => {
        const prevRow = prev[idx];
        if (!isDoubleWall) return { startH: h, endH: h };
        const innerS = prevRow?.innerStartH ?? defH;
        const innerE = prevRow?.innerEndH ?? defH;
        return {
          ...prevRow,
          startH: h,
          endH: h,
          outerStartH: h,
          outerEndH: h,
          innerStartH: innerS,
          innerEndH: innerE,
        };
      })
    );
  };

  const setAllInnerHeights = (h: number) => {
    setSegmentHeights((prev) =>
      segmentLengths.map((_, idx) => {
        const prevRow = prev[idx];
        if (!isDoubleWall) return { startH: h, endH: h };
        const outerS = prevRow?.outerStartH ?? defH;
        const outerE = prevRow?.outerEndH ?? defH;
        return {
          ...prevRow,
          startH: h,
          endH: h,
          outerStartH: outerS,
          outerEndH: outerE,
          innerStartH: h,
          innerEndH: h,
        };
      })
    );
  };

  const [bulkSetAllInput, setBulkSetAllInput] = useState('');
  const [bulkSetOuterInput, setBulkSetOuterInput] = useState('');
  const [bulkSetInnerInput, setBulkSetInnerInput] = useState('');

  const doubleWallOuterCaption = useMemo(
    () => formatDoubleWallLeafCaption(outerWallType, outerBrickBond, outerLayingMethod, t),
    [outerWallType, outerBrickBond, outerLayingMethod, t]
  );
  const doubleWallInnerCaption = useMemo(
    () => formatDoubleWallLeafCaption(innerWallType, innerBrickBond, innerLayingMethod, t),
    [innerWallType, innerBrickBond, innerLayingMethod, t]
  );

  useEffect(() => {
    if (!canvasMode || !isInProjectCreating || !isDoubleWall || wallConfigMode !== 'single') return;
    if (segmentHeights.length >= 1) return;
    const h = parseFloat(height) || 1;
    setSegmentHeights([{ startH: h, endH: h, outerStartH: h, outerEndH: h, innerStartH: h, innerEndH: h }]);
  }, [canvasMode, isInProjectCreating, isDoubleWall, wallConfigMode, segmentHeights.length, height]);

  const setWallConfigModeWithSync = (mode: 'single' | 'segments') => {
    setWallConfigMode(mode);
    if (mode === 'single' && segmentHeights.length > 0) {
      setHeight(String(segmentHeights[0]?.startH ?? defH));
    }
    if (mode === 'single' && type === 'sleeper' && !canvasMode) {
      const sumFromManual = manualSegmentLengths.length > 0 ? manualSegmentLengths.reduce((a, b) => a + b, 0) : null;
      setManualSegmentLengths([]);
      if (sumFromManual != null && sumFromManual > 0) {
        setLength(sumFromManual.toFixed(3));
      } else if (segmentLengthsFromSaved.length > 0) {
        const s = segmentLengthsFromSaved.reduce((a, b) => a + b, 0);
        setLength(s.toFixed(3));
      }
    }
  };

  const enterSleeperStandaloneSegmentsMode = () => {
    const total = parseFloat(length) || 2;
    const a = Number((total / 2).toFixed(3));
    const b = Number((total - a).toFixed(3));
    const h = parseFloat(height) || 1;
    setManualSegmentLengths([a, b]);
    setSegmentHeights([{ startH: h, endH: h }, { startH: h, endH: h }]);
    setWallConfigMode('segments');
  };

  const updateManualSegmentLength = (idx: number, value: number) => {
    setManualSegmentLengths((prev) => {
      const next = [...prev];
      next[idx] = Math.max(0.01, value);
      return next;
    });
  };

  const addManualSleeperSegment = () => {
    setManualSegmentLengths((prev) => [...prev, 1]);
  };

  const removeManualSleeperSegment = () => {
    setManualSegmentLengths((prev) => (prev.length <= 2 ? prev : prev.slice(0, -1)));
  };

  useEffect(() => {
    if (type !== 'sleeper' || canvasMode) return;
    const n = segmentLengths.length;
    if (n === 0) return;
    setSegmentHeights((prev) => {
      const h = parseFloat(height) || 1;
      if (prev.length === n) return prev;
      if (prev.length > n) return prev.slice(0, n);
      return Array.from({ length: n }, (_, i) => prev[i] ?? { startH: h, endH: h });
    });
  }, [type, canvasMode, segmentLengths.length, height]);

  const totalLengthCanvas = canvasLength ?? (segmentLengths.length > 0 ? segmentLengths.reduce((a, b) => a + b, 0) : parseFloat(length) || 0);

  const lastInputsSentRef = useRef<string>('');
  useEffect(() => {
    if (!onInputsChange || !isInProjectCreating) return;
    const inputs: Record<string, any> = { length, height, layingMethod, postMethod, includeFoundation, foundationLength, foundationWidth, foundationDepthCm, foundationDiggingMethod: effectiveFoundationDiggingMethod, foundationSoilType: effectiveFoundationSoilType };
    if (type === 'brick') {
      if (isDoubleWall) {
        inputs.cavityWall = true;
        inputs.outerWallType = outerWallType;
        inputs.innerWallType = innerWallType;
        inputs.outerBrickBond = outerBrickBond;
        inputs.innerBrickBond = innerBrickBond;
        inputs.outerLayingMethod = outerLayingMethod;
        inputs.innerLayingMethod = innerLayingMethod;
      } else {
        inputs.brickBond = brickBond;
      }
    }
    if (canvasMode && wallConfigMode === 'single') {
      const h = parseFloat(height) || 1;
      inputs.segmentLengths = [totalLengthCanvas];
      const row0 = segmentHeights[0];
      if (isDoubleWall && row0) {
        inputs.segmentHeights = [
          {
            startH: h,
            endH: h,
            outerStartH: row0.outerStartH ?? h,
            outerEndH: row0.outerEndH ?? h,
            innerStartH: row0.innerStartH ?? h,
            innerEndH: row0.innerEndH ?? h,
          },
        ];
      } else {
        inputs.segmentHeights = [{ startH: h, endH: h }];
      }
    } else {
      inputs.segmentHeights = segmentHeights;
      if (segmentLengths.length > 0) inputs.segmentLengths = segmentLengths;
    }
    if (canvasMode && (type === 'block4' || type === 'block7')) {
      inputs.includeCopings = includeCopings;
      inputs.includeTileInstallation = includeTileInstallation;
      if (includeTileInstallation && segmentTileSides.length > 0) {
        inputs.segmentTileSides = segmentTileSides;
        inputs.frontFacesTiled = frontFacesTiled;
        inputs.wallTileSlabThicknessCm = wallTileSlabThicknessCm;
        inputs.wallTileAdhesiveThicknessCm = wallTileAdhesiveThicknessCm;
      }
      if (includeCopings) {
        inputs.copingSlabLength = copingSlabLength;
        inputs.copingSlabWidth = copingSlabWidth;
        inputs.copingGap = copingGap;
        inputs.copingAdhesiveThickness = copingAdhesiveThickness;
        inputs.coping45Cut = coping45Cut;
        inputs.copingGroutingId = copingGroutingId;
      }
    }
    const key = JSON.stringify(inputs);
    if (lastInputsSentRef.current === key) return;
    lastInputsSentRef.current = key;
    onInputsChange(inputs);
  }, [length, height, layingMethod, brickBond, isDoubleWall, outerWallType, innerWallType, outerBrickBond, innerBrickBond, outerLayingMethod, innerLayingMethod, postMethod, includeFoundation, foundationLength, foundationWidth, foundationDepthCm, foundationDiggingMethod, foundationSoilType, segmentHeights, segmentLengths, segmentTileSides, frontFacesTiled, wallTileSlabThicknessCm, wallTileAdhesiveThicknessCm, wallConfigMode, canvasMode, totalLengthCanvas, onInputsChange, isInProjectCreating, type, includeCopings, includeTileInstallation, copingSlabLength, copingSlabWidth, copingGap, copingAdhesiveThickness, coping45Cut, copingGroutingId]);

  // Use carriers from props if available (from ProjectCreating), otherwise use local state
  const carriers = propCarriers && propCarriers.length > 0 ? propCarriers : carriersLocal;

  // Sync transport props to local state when in ProjectCreating
  useEffect(() => {
    if (isInProjectCreating) {
      if (propCalculateTransport !== undefined) setCalculateTransport(propCalculateTransport);
      if (propSelectedTransportCarrier !== undefined) setSelectedTransportCarrier(propSelectedTransportCarrier);
      if (propTransportDistance !== undefined) setTransportDistance(propTransportDistance);
    }
  }, [
    isInProjectCreating,
    propCalculateTransport,
    propSelectedTransportCarrier,
    propTransportDistance
  ]);

  // Add equipment fetching
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const companyId = useAuthStore.getState().getCompanyId();
        if (!companyId) return;
        
        // Fetch excavators
        const { data: excavatorData, error: excavatorError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'excavator')
          .eq('company_id', companyId);
        
        if (excavatorError) throw excavatorError;
        
        // Fetch carriers
        const { data: carrierData, error: carrierError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'barrows_dumpers')
          .eq('company_id', companyId);
        
        if (carrierError) throw carrierError;
        
        setExcavators(excavatorData || []);
        setCarriersLocal(carrierData || []);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    
    if (effectiveCalculateTransport) {
      fetchEquipment();
    }
  }, [effectiveCalculateTransport]);

  const taskQueryType = isDoubleWall ? outerWallType : type;
  const taskQueryLaying = isDoubleWall ? outerLayingMethod : layingMethod;

  // Fetch task templates for wall building
  const { data: taskTemplates = [], isLoading } = useQuery({
    queryKey: ['wall_tasks', taskQueryType, taskQueryLaying, isDoubleWall, companyId],
    queryFn: async () => {
      let query = supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId);

      // Add specific filters based on wall type
      if (taskQueryType === 'brick') {
        query = query.ilike('name', '%bricklaying%');
      } else if (taskQueryType === 'block4') {
        if (taskQueryLaying === 'standing') {
          query = query.ilike('name', '%4-inch block%standing%');
        } else {
          query = query.ilike('name', '%4-inch block%flat%');
        }
      } else if (taskQueryType === 'block7') {
        if (taskQueryLaying === 'standing') {
          query = query.ilike('name', '%7-inch block%standing%');
        } else {
          query = query.ilike('name', '%7-inch block%flat%');
        }
      } else if (type === 'sleeper') {
        query = query.or('name.ilike.%sleeper wall%,name.ilike.%digging holes%,name.ilike.%setting up posts%');
      }

      const { data, error } = await query.order('name');
      
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  const { data: innerLeafBrickTasks = [] } = useQuery({
    queryKey: ['wall_tasks_inner_brick', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId!)
        .ilike('name', '%bricklaying%')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId && isDoubleWall && innerWallType === 'brick',
  });

  /** Task templates for inner leaf blocks (double wall) */
  const { data: innerLeafBlockTasks = [] } = useQuery({
    queryKey: ['wall_tasks_inner_leaf', innerWallType, innerLayingMethod, companyId],
    queryFn: async () => {
      let query = supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId!);
      if (innerWallType === 'block4') {
        query = innerLayingMethod === 'standing'
          ? query.ilike('name', '%4-inch block%standing%')
          : query.ilike('name', '%4-inch block%flat%');
      } else if (innerWallType === 'block7') {
        query = innerLayingMethod === 'standing'
          ? query.ilike('name', '%7-inch block%standing%')
          : query.ilike('name', '%7-inch block%flat%');
      } else {
        return [];
      }
      const { data, error } = await query.order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId && isDoubleWall && (innerWallType === 'block4' || innerWallType === 'block7'),
  });

  // Fetch task template for preparing for the wall (leveling)
  const { data: preparingForWallTask } = useQuery({
    queryKey: ['preparing_for_wall_task', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'preparing for the wall (leveling)')
        .single();
      if (error) {
        console.error('Error fetching preparing for the wall task:', error);
        throw error;
      }
      return data;
    },
    enabled: !!companyId
  });

  // Fetch task template for mixing mortar
  const { data: mixingMortarTask } = useQuery({
    queryKey: ['mixing_mortar_task', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'mixing mortar')
        .single();
      if (error) {
        console.error('Error fetching mixing mortar task:', error);
        throw error;
      }
      return data;
    },
    enabled: !!companyId
  });

  // Fetch excavation tasks for different methods (shovel, small, medium, large excavator)
  const { data: excavationTasks = {} } = useQuery({
    queryKey: ['excavation_tasks', companyId],
    queryFn: async () => {
      if (!companyId) return {};
      
      const taskNames = [
        'Excavating foundation with shovel',
        'Excavating foundation with with small excavator',
        'Excavating foundation with with medium excavator',
        'Excavating foundation with with big excavator'
      ];

      const tasks: Record<string, TaskTemplate | null> = {};

      for (const taskName of taskNames) {
        const { data, error } = await supabase
          .from('event_tasks_with_dynamic_estimates')
          .select('id, name, unit, estimated_hours')
          .eq('company_id', companyId)
          .eq('name', taskName)
          .maybeSingle();

        if (error) {
          console.error(`Error fetching task "${taskName}":`, error);
        }
        
        if (data) {
          tasks[taskName] = {
            id: data.id || '',
            name: data.name || '',
            unit: data.unit || '',
            estimated_hours: data.estimated_hours || 0
          };
        } else {
          tasks[taskName] = null;
        }
      }

      return tasks;
    },
    enabled: !!companyId
  });

  // Fetch material usage configuration for Wall Calculator
  const { data: materialUsageConfig } = useQuery<MaterialUsageConfig[]>({
    queryKey: ['materialUsageConfig', 'wall', type, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('material_usage_configs')
        .select('calculator_id, material_id')
        .eq('calculator_id', type === 'sleeper' ? 'sleeper_wall' : 'wall')
        .eq('company_id', companyId);

      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch brick/block mortar mix ratio
  const { data: brickBlockMortarMixRatioConfig } = useQuery<{ id: string; mortar_mix_ratio: string } | null>({
    queryKey: ['mortarMixRatio', 'brick', companyId],
    queryFn: async () => {
      if (!companyId) return null;

      const { data, error } = await supabase
        .from('mortar_mix_ratios')
        .select('id, mortar_mix_ratio')
        .eq('company_id', companyId)
        .eq('type', 'brick')
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
      return data;
    },
    enabled: !!companyId
  });

  // Get the material IDs from the config
  const materialIds = materialUsageConfig?.map(config => config.material_id) || [];

  // Fetch all materials that we might need based on material usage config
  const { data: materialsData } = useQuery<Material[]>({
    queryKey: ['materials', materialIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .in('id', materialIds);

      if (error) throw error;
      return data;
    },
    enabled: materialIds.length > 0
  });

  // Fetch details of the selected sand material
  const selectedSandMaterialId = materialUsageConfig?.[0]?.material_id;

  const { data: selectedSandMaterial, isLoading: isLoadingSelectedSand } = useQuery<MaterialFromDB>({
    queryKey: ['material', selectedSandMaterialId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, unit, price')
        .eq('id', selectedSandMaterialId)
        .single();

      if (error) throw error;
      return data as MaterialFromDB;
    },
    enabled: !!selectedSandMaterialId
  });

  const fetchMaterialPrices = async (materials: Material[]) => {
    try {
      const materialNames = materials.map(m => m.name);
      
      const { data, error } = await supabase
        .from('materials')
        .select('name, price')
        .in('name', materialNames);
      
      if (error) throw error;
      
      // Create a map of material names to prices
      const priceMap = data.reduce((acc: Record<string, number>, item) => {
        acc[item.name] = item.price;
        return acc;
      }, {});
      
      // Update materials with prices
      return materials.map(material => ({
        ...material,
        price_per_unit: priceMap[material.name] || null,
        total_price: priceMap[material.name] ? priceMap[material.name] * material.amount : null
      }));
    } catch (err) {
      console.error('Error fetching material prices:', err);
      return materials.map(material => ({
        ...material,
        price_per_unit: null,
        total_price: null
      }));
    }
  };

  // Helper function to calculate material transport time
  const calculateMaterialTransportTime = (
    materialAmount: number,
    carrierSize: number,
    materialType: string,
    transportDistanceMeters: number
  ) => {
    const carrierSpeedData = carrierSpeeds.find(c => c.size === carrierSize);
    const carrierSpeed = carrierSpeedData?.speed || DEFAULT_CARRIER_SPEED_M_PER_H;
    const materialCapacityUnits = getMaterialCapacity(materialType, carrierSize);
    const trips = Math.ceil(materialAmount / materialCapacityUnits);
    const timePerTrip = (transportDistanceMeters * 2) / carrierSpeed;
    const totalTransportTime = trips * timePerTrip;
    const normalizedTransportTime = (totalTransportTime * 30) / transportDistanceMeters;
    return { trips, totalTransportTime, normalizedTransportTime };
  };

  // Helper function to parse mortar mix ratio and get cement proportion
  const getMortarMixRatioProportion = (mixRatio: string | undefined = '1:4'): { cementProportion: number; sandProportion: number } => {
    const ratio = mixRatio || '1:4';
    const [cementPart, sandPart] = ratio.split(':').map(Number);
    const totalParts = cementPart + sandPart;
    const cementProportion = cementPart / totalParts;
    const sandProportion = sandPart / totalParts;
    return { cementProportion, sandProportion };
  };

  // Helper function to get excavation task hours from template or fallback
  const getTaskHours = (method: 'shovel' | 'small' | 'medium' | 'large', baseHours: number): number => {
    const taskMap = {
      shovel: 'Excavating foundation with shovel',
      small: 'Excavating foundation with with small excavator',
      medium: 'Excavating foundation with with medium excavator',
      large: 'Excavating foundation with with big excavator'
    };

    const taskName = taskMap[method];
    const task = excavationTasks[taskName];

    if (task && task.estimated_hours) {
      return baseHours * task.estimated_hours;
    }

    // Fallback to hardcoded values if task not found
    const MACHINE_MULTIPLIER = {
      shovel: 1,
      small: 6,
      medium: 12,
      large: 25
    };
    return baseHours / MACHINE_MULTIPLIER[method];
  };

  // Helper function to calculate foundation results
  const calculateFoundationResults = () => {
    if (!includeFoundation) return null;
    
    const lengthNum = parseFloat(foundationLength) || 0;
    const widthNum = parseFloat(foundationWidth) || 0;
    const depthNum = parseFloat(foundationDepthCm) / 100 || 0;

    if (lengthNum <= 0 || widthNum <= 0 || depthNum <= 0) {
      return null;
    }

    // Constants from FoundationCalculator
    const STANDARD_EXCAVATION = {
      length: 15,    // meters - baseline for calculation
      width: 0.6,    // meters - baseline for calculation
      depth: 0.6,    // meters - baseline for calculation
      volume: 5.4    // m³
    };

    const MANUAL_DIGGING_RATE = 0.45; // m³/hour

    // Dimension weights: how different dimensions affect digging difficulty
    // Length has most impact (50% - affects linear/lengthwise work)
    // Width has moderate impact (30% - affects lateral work)
    // Depth has least impact (20% - affects vertical digging efficiency)
    const DIMENSION_WEIGHT = {
      length: 0.5,   // 50% weight - length impacts work the most
      width: 0.3,    // 30% weight - width has moderate impact
      depth: 0.2     // 20% weight - depth has less impact due to equipment efficiency
    };

    // Soil type density (tonnes per m³) - affects how much soil is excavated
    const SOIL_DENSITY = {
      clay: 1.5,      // tonnes per m³ - denser, slower to dig
      sand: 1.6,      // tonnes per m³ - slightly denser
      rock: 2.2       // tonnes per m³ - very dense, requires more power
    };

    // Loose volume coefficients (after excavation, soil expands)
    // Soil becomes looser when excavated, taking up more space
    const LOOSE_VOLUME_COEFFICIENT = {
      clay: 1.2,      // 20% increase (1.1-1.3 average)
      sand: 1.025,    // 2.5% increase (1.0-1.05 average) - more compact
      rock: 1.075     // 7.5% increase (1.05-1.1 average)
    };

    // Concrete mix ratios (per m³) for foundation
    const CONCRETE_MIX = {
      cement: 350,    // kg per m³
      sand: 700,      // kg per m³
      aggregate: 1050 // kg per m³
    };

    // Calculate actual volume
    const actualVolume = lengthNum * widthNum * depthNum;

    // Calculate relative coefficients
    const lengthRel = lengthNum / STANDARD_EXCAVATION.length;
    const widthRel = widthNum / STANDARD_EXCAVATION.width;
    const depthRel = depthNum / STANDARD_EXCAVATION.depth;

    // Calculate time with dimension weights
    const timeBaseManual = actualVolume / MANUAL_DIGGING_RATE;
    const dimensionAdjustment = 
      (DIMENSION_WEIGHT.length * lengthRel) +
      (DIMENSION_WEIGHT.width * widthRel) +
      (DIMENSION_WEIGHT.depth * depthRel);
    const timeWithDimensions = timeBaseManual * dimensionAdjustment;

    // Get final time using task template or fallback
    const excavationHours = getTaskHours(effectiveFoundationDiggingMethod, timeWithDimensions);

    // Calculate material weight (excavated soil)
    const soilDensity = SOIL_DENSITY[foundationSoilType];
    
    // Calculate loose volume after excavation (soil expands)
    const looseVolumeCoefficient = LOOSE_VOLUME_COEFFICIENT[effectiveFoundationSoilType];
    const looseVolume = actualVolume * looseVolumeCoefficient;

    // Calculate concrete components
    const aggregateKg = actualVolume * CONCRETE_MIX.aggregate;
    const aggregateTonnes = aggregateKg / 1000;

    // Build task breakdown (single excavation task)
    // Map digging method to actual task name
    const taskNameMap = {
      'shovel': 'Excavating foundation with shovel',
      'small': 'Excavating foundation with with small excavator',
      'medium': 'Excavating foundation with with medium excavator',
      'large': 'Excavating foundation with with big excavator'
    };
    const taskName = taskNameMap[foundationDiggingMethod];

    const breakdown = [
      {
        task: taskName,
        hours: excavationHours
      }
    ];

    // Build materials list
    const materialsList = [
      { 
        name: `Excavated ${effectiveFoundationSoilType.charAt(0).toUpperCase() + effectiveFoundationSoilType.slice(1)} Soil (loose volume)`, 
        amount: looseVolume * soilDensity, 
        unit: 'tonnes',
        price_per_unit: null,
        total_price: null
      },
      { 
        name: 'Aggregate (for concrete)', 
        amount: aggregateTonnes, 
        unit: 'tonnes',
        price_per_unit: null,
        total_price: null
      }
    ];

    return {
      hours: excavationHours,
      taskBreakdown: breakdown,
      materials: materialsList,
      diggingMethod: effectiveFoundationDiggingMethod
    };
  };

  const calculate = async () => {
    const l = parseFloat(length);
    const h = parseFloat(height);
    const defH = parseFloat(height) || 1;

    let segLengths: number[];
    let segHeightsRaw: WallSegmentHeightRow[] | undefined;
    if (canvasMode && wallConfigMode === 'single') {
      segLengths = [totalLengthCanvas];
      const singleH = parseFloat(height) || 1;
      if (isDoubleWall && segmentHeights[0]) {
        const r = segmentHeights[0];
        segHeightsRaw = [
          {
            startH: singleH,
            endH: singleH,
            outerStartH: r.outerStartH ?? singleH,
            outerEndH: r.outerEndH ?? singleH,
            innerStartH: r.innerStartH ?? singleH,
            innerEndH: r.innerEndH ?? singleH,
          },
        ];
      } else {
        segHeightsRaw = [{ startH: singleH, endH: singleH }];
      }
    } else {
      segLengths = segmentLengths.length > 0 ? segmentLengths : [l];
      const useLocalHeights = segmentHeights.length === segLengths.length;
      segHeightsRaw = useLocalHeights ? segmentHeights : (savedInputs?.segmentHeights as WallSegmentHeightRow[] | undefined);
    }
    if (segLengths.length === 0 && canvasMode && totalLengthCanvas > 0) {
      segLengths = [totalLengthCanvas];
    } else if (segLengths.length === 0 && !isNaN(l) && l > 0) {
      segLengths = [l];
    }
    const hasValidSegmentHeights = segHeightsRaw && segHeightsRaw.length === segLengths.length;

    const hasValidLength = !isNaN(l) || (canvasMode && totalLengthCanvas > 0);
    if (!hasValidLength) return;
    if (!hasValidSegmentHeights && isNaN(h)) return;

    const segHeights: WallSegmentHeightRow[] = hasValidSegmentHeights
      ? segHeightsRaw!
      : segLengths.map(() => (isDoubleWall ? defaultDoubleWallRow(defH) : { startH: defH, endH: defH }));

    let area = 0;
    let units = 0;
    let mortarVolume = 0;

    // Constants for mortar components
    const cementDensity = 1500; // kg/m³
    const sandDensity = 1600; // kg/m³
    
    // Get configurable mortar mix ratio
    const mortarMixRatio = brickBlockMortarMixRatioConfig?.mortar_mix_ratio || '1:4';
    const { cementProportion, sandProportion } = getMortarMixRatioProportion(mortarMixRatio);

    const brickHeight = 0.06; // Brick height in meters
    const outerWallKind = isDoubleWall ? outerWallType : type;
    const bondOuter = isDoubleWall ? outerBrickBond : brickBond;
    const layingOuter = isDoubleWall ? outerLayingMethod : layingMethod;
    /** Wall thickness: `header` = 21.5 cm (PL „W poprzek”), `stretcher` = 10 cm (PL „Wzdłuż”). Along-wall module: header 0.1 m, stretcher 0.215 m. */
    const brickAlongOuterM = bondOuter === 'header' ? 0.1 : 0.215;
    const mortarThickness = 0.01; // Mortar thickness in meters (bricks)
    /** Block wall joints — 15 mm; volume constants below are scaled for this (vs former 10 mm). */
    const blockMortarThickness = 0.015;
    let blockHeight = 0.22; // Default block height
    let blockWidth = 0;
    let blockLength = 0.44; // Block length in meters

    if (outerWallKind === 'block4') {
      blockWidth = 0.10;
    } else if (outerWallKind === 'block7') {
      blockWidth = 0.14;
    }

    if (outerWallKind === 'block4' || outerWallKind === 'block7') {
      if (layingOuter === 'flat') {
        blockHeight = blockWidth;
      }
    }

    const calcSegmentUnits = (segLen: number, avgH: number): { units: number; mortarVolume: number } => {
      if (avgH <= 0) return { units: 0, mortarVolume: 0 };
      let segUnits = 0;
      let segMortar = 0;
      switch (outerWallKind) {
        case 'brick': {
          const brickRows = Math.ceil(avgH / (brickHeight + mortarThickness));
          const bricksPerRow = Math.ceil(segLen / (brickAlongOuterM + mortarThickness));
          segUnits = brickRows * bricksPerRow;
          segMortar = segUnits * 0.000269;
          break;
        }
        case 'block4': {
          const blockRows4 = Math.ceil(avgH / (blockHeight + blockMortarThickness));
          const blocksPerRow4 = Math.ceil(segLen / (blockLength + blockMortarThickness));
          segUnits = blockRows4 * blocksPerRow4;
          segMortar = segUnits * (layingOuter === 'flat' ? 0.002178 : 0.0013065);
          break;
        }
        case 'block7': {
          const blockRows7 = Math.ceil(avgH / (blockHeight + blockMortarThickness));
          const blocksPerRow7 = Math.ceil(segLen / (blockLength + blockMortarThickness));
          segUnits = blockRows7 * blocksPerRow7;
          segMortar = segUnits * (layingOuter === 'flat' ? 0.0022965 : 0.0016635);
          break;
        }
        default:
          break;
      }
      return { units: segUnits, mortarVolume: segMortar };
    };

    const brickAlongInnerM = innerBrickBond === 'header' ? 0.1 : 0.215;

    const calcInnerLeafSegment = (segLen: number, avgH: number): { units: number; mortarVolume: number } => {
      if (avgH <= 0) return { units: 0, mortarVolume: 0 };
      if (innerWallType === 'brick') {
        const brickRows = Math.ceil(avgH / (brickHeight + mortarThickness));
        const bricksPerRow = Math.ceil(segLen / (brickAlongInnerM + mortarThickness));
        const u = brickRows * bricksPerRow;
        return { units: u, mortarVolume: u * 0.000269 };
      }
      const iw = innerWallType === 'block4' ? 0.10 : 0.14;
      let ih = 0.22;
      const ilen = 0.44;
      if (innerLayingMethod === 'flat') ih = iw;
      const blockRows = Math.ceil(avgH / (ih + blockMortarThickness));
      const blocksPerRow = Math.ceil(segLen / (ilen + blockMortarThickness));
      const u = blockRows * blocksPerRow;
      const mv =
        u *
        (innerLayingMethod === 'flat'
          ? innerWallType === 'block7'
            ? 0.0022965
            : 0.002178
          : innerWallType === 'block7'
            ? 0.0016635
            : 0.0013065);
      return { units: u, mortarVolume: mv };
    };

    for (let i = 0; i < segHeights.length; i++) {
      const segLen = segLengths[i] ?? l / segHeights.length;
      const row = segHeights[i];
      if (isDoubleWall) {
        const outerAvg = getSegmentOuterLeafAvgM(row, defH, defH);
        const innerAvg = getSegmentInnerLeafAvgM(row, defH, defH);
        area += segLen * outerAvg + segLen * innerAvg;
        if (outerAvg > 0) {
          const seg = calcSegmentUnits(segLen, outerAvg);
          units += seg.units;
          mortarVolume += seg.mortarVolume;
        }
      } else {
        const avgH = (row.startH + row.endH) / 2;
        area += segLen * avgH;
        const seg = calcSegmentUnits(segLen, avgH);
        units += seg.units;
        mortarVolume += seg.mortarVolume;
      }
    }

    let innerLeafUnits = 0;
    if (isDoubleWall) {
      for (let i = 0; i < segHeights.length; i++) {
        const segLen = segLengths[i] ?? l / segHeights.length;
        const innerAvg = getSegmentInnerLeafAvgM(segHeights[i], defH, defH);
        if (innerAvg <= 0) continue;
        const seg = calcInnerLeafSegment(segLen, innerAvg);
        innerLeafUnits += seg.units;
        mortarVolume += seg.mortarVolume;
      }
    }

    if (type === 'sleeper') {
        const sleeperLength = 2.4; // 2400mm = 2.4m
        const sleeperHeight = 0.2; // 200mm = 0.2m

        if (segLengths.length === 0) return;

        let totalSleepers = 0;
        let postsNeeded = 0;
        let totalFirstRowSleepers = 0;
        let totalAdditionalSleepers = 0;
        let maxRows = 0;
        let sumAvgHeights = 0;

        for (let i = 0; i < segLengths.length; i++) {
          const segLen = segLengths[i] ?? 0;
          const avgH = (segHeights[i].startH + segHeights[i].endH) / 2;
          sumAvgHeights += avgH;
          const sleepersPerRowSeg = Math.ceil(segLen / sleeperLength);
          const numberOfRowsSeg = Math.ceil(avgH / sleeperHeight);
          const unitsSeg = sleepersPerRowSeg * numberOfRowsSeg;
          const postsSeg = 1 + sleepersPerRowSeg * 2;

          totalSleepers += unitsSeg;
          postsNeeded += postsSeg;
          totalFirstRowSleepers += sleepersPerRowSeg;
          totalAdditionalSleepers += Math.max(0, unitsSeg - sleepersPerRowSeg);
          maxRows = Math.max(maxRows, numberOfRowsSeg);
        }

        units = totalSleepers;
        const roundedUpHeight = maxRows * sleeperHeight;
        const roundedDownHeightAvg = segLengths.length > 0 ? sumAvgHeights / segLengths.length : parseFloat(height) || 0;

        const taskBreakdown: { task: string; hours: number; amount?: number; unit?: string }[] = [];

        const firstLayerTask = taskTemplates.find(t =>
          t.name.toLowerCase().includes('sleeper wall') &&
          t.name.toLowerCase().includes('1st layer')
        );
        if (firstLayerTask && totalFirstRowSleepers > 0) {
          taskBreakdown.push({
            task: firstLayerTask.name,
            hours: firstLayerTask.estimated_hours * totalFirstRowSleepers,
            amount: totalFirstRowSleepers,
            unit: 'pieces'
          });
        }

        if (totalAdditionalSleepers > 0) {
          const regularLayerTask = taskTemplates.find(t => {
            const name = t.name.toLowerCase();
            return name.includes('sleeper wall') && name.includes('on top');
          });
          if (regularLayerTask) {
            taskBreakdown.push({
              task: regularLayerTask.name,
              hours: regularLayerTask.estimated_hours * totalAdditionalSleepers,
              amount: totalAdditionalSleepers,
              unit: 'pieces'
            });
          }
        }

        if (postMethod === 'concrete') {
          const diggingTask = taskTemplates.find(t =>
            t.name.toLowerCase().includes('digging holes')
          );
          if (diggingTask && postsNeeded > 0) {
            taskBreakdown.push({
              task: diggingTask.name,
              hours: diggingTask.estimated_hours * postsNeeded,
              amount: postsNeeded,
              unit: 'holes'
            });
          }
        }

        const settingPostsTask = taskTemplates.find(t =>
          t.name.toLowerCase().includes('setting up posts')
        );
        if (settingPostsTask && postsNeeded > 0) {
          taskBreakdown.push({
            task: settingPostsTask.name,
            hours: settingPostsTask.estimated_hours * postsNeeded,
            amount: postsNeeded,
            unit: 'posts'
          });
        }

        if (effectiveCalculateTransport) {
          let carrierSizeForTransport = 0.125;

          if (effectiveSelectedTransportCarrier) {
            carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
          }

          if (units > 0) {
            const sleepersPerTrip = 1;
            const sleeperTrips = Math.ceil(units / sleepersPerTrip);
            const sleeperTimePerTrip = (parseFloat(effectiveTransportDistance) || 30) * 2 / FOOT_CARRY_SPEED_M_PER_H;
            const sleeperTransportTime = sleeperTrips * sleeperTimePerTrip;

            if (sleeperTransportTime > 0) {
              taskBreakdown.push({
                task: 'transport sleepers',
                hours: sleeperTransportTime,
                amount: units,
                unit: 'pieces'
              });
            }
          }

          if (postsNeeded > 0) {
            const postsPerTrip = 1;
            const postTrips = Math.ceil(postsNeeded / postsPerTrip);
            const postTimePerTrip = (parseFloat(effectiveTransportDistance) || 30) * 2 / FOOT_CARRY_SPEED_M_PER_H;
            const postTransportTime = postTrips * postTimePerTrip;

            if (postTransportTime > 0) {
              taskBreakdown.push({
                task: 'transport posts',
                hours: postTransportTime,
                amount: postsNeeded,
                unit: 'posts'
              });
            }
          }

          if (postMethod === 'concrete') {
            const postmixBags = postsNeeded * 2;
            if (postmixBags > 0) {
              const postmixResult = calculateMaterialTransportTime(postmixBags, carrierSizeForTransport, 'cement', parseFloat(effectiveTransportDistance) || 30);
              const postmixTransportTime = postmixResult.totalTransportTime;

              if (postmixTransportTime > 0) {
                taskBreakdown.push({
                  task: 'transport postmix',
                  hours: postmixTransportTime,
                  amount: postmixBags,
                  unit: 'bags'
                });
              }
            }
          }
        }

        const wallLenForLeveling = segLengths.reduce((a, b) => a + b, 0);
        if (
          preparingForWallTask &&
          preparingForWallTask.estimated_hours !== undefined &&
          wallLenForLeveling > 0
        ) {
          taskBreakdown.push({
            task: 'preparing for the wall (leveling)',
            hours: wallLenForLeveling * preparingForWallTask.estimated_hours,
            event_task_id: preparingForWallTask.id,
          });
        }

        const finalTotalHours = taskBreakdown.reduce((sum, task) => sum + task.hours, 0);

        const materials: Material[] = [
          { name: 'Sleepers', amount: units, unit: 'pieces', price_per_unit: null, total_price: null },
          { name: 'Post', amount: postsNeeded, unit: 'posts', price_per_unit: null, total_price: null }
        ];

        if (postMethod === 'concrete') {
          materials.push({
            name: 'Postmix',
            amount: postsNeeded * 2,
            unit: 'bags',
            price_per_unit: null,
            total_price: null
          });
        }

        const materialsWithPrices = await fetchMaterialPrices(materials);

        setResult({
          units,
          cementBags: 0,
          sandVolume: 0,
          sandTonnes: 0,
          rows: maxRows,
          roundedDownHeight: Number(roundedDownHeightAvg.toFixed(2)),
          roundedUpHeight,
          totalHours: finalTotalHours,
          taskBreakdown,
          materials: materialsWithPrices
        });

        return;
    }

    // Calculate cement and sand quantities
    const cementVolume = mortarVolume * cementProportion;
    const sandVolume = mortarVolume * sandProportion;
    
    // Convert cement volume to bags (1 bag = 25kg)
    const cementWeight = cementVolume * cementDensity;
    const cementBags = Math.ceil(cementWeight / 25);
    
    // Convert sand volume to tonnes (using sand density)
    const sandTonnes = sandVolume * sandDensity / 1000; // Convert kg to tonnes

    // Get transport distance in meters
    const transportDistanceMeters = parseFloat(effectiveTransportDistance) || 30;

    // Calculate material transport times if "Calculate transport time" is checked
    let brickTransportTime = 0;
    let blockTransportTime = 0;
    let sandTransportTime = 0;
    let cementTransportTime = 0;
    let normalizedBrickTransportTime = 0;
    let normalizedBlockTransportTime = 0;
    let normalizedSandTransportTime = 0;
    let normalizedCementTransportTime = 0;

    if (effectiveCalculateTransport) {
      let carrierSizeForTransport = 0.125;
      
      if (effectiveSelectedTransportCarrier) {
        carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
      }

      let brickPiecesForTransport = 0;
      let blockPiecesForTransport = 0;
      if (isDoubleWall) {
        if (outerWallType === 'brick') brickPiecesForTransport += units;
        if (innerWallType === 'brick') brickPiecesForTransport += innerLeafUnits;
        if (outerWallType === 'block4' || outerWallType === 'block7') blockPiecesForTransport += units;
        if (innerWallType === 'block4' || innerWallType === 'block7') blockPiecesForTransport += innerLeafUnits;
      } else if (type === 'brick') {
        brickPiecesForTransport = units;
      } else if (type === 'block4' || type === 'block7') {
        blockPiecesForTransport = units;
      }

      if (brickPiecesForTransport > 0) {
        const unitResult = calculateMaterialTransportTime(brickPiecesForTransport, carrierSizeForTransport, 'bricks', transportDistanceMeters);
        brickTransportTime = unitResult.totalTransportTime;
        normalizedBrickTransportTime = unitResult.normalizedTransportTime;
      }
      if (blockPiecesForTransport > 0) {
        const innerBt = calculateMaterialTransportTime(blockPiecesForTransport, carrierSizeForTransport, 'blocks', transportDistanceMeters);
        blockTransportTime = innerBt.totalTransportTime;
        normalizedBlockTransportTime = innerBt.normalizedTransportTime;
      }

      // Calculate sand transport
      if (sandTonnes > 0) {
        const sandResult = calculateMaterialTransportTime(sandTonnes, carrierSizeForTransport, 'sand', transportDistanceMeters);
        sandTransportTime = sandResult.totalTransportTime;
        normalizedSandTransportTime = sandResult.normalizedTransportTime;
      }

      // Calculate cement transport
      if (cementBags > 0) {
        const cementResult = calculateMaterialTransportTime(cementBags, carrierSizeForTransport, 'cement', transportDistanceMeters);
        cementTransportTime = cementResult.totalTransportTime;
        normalizedCementTransportTime = cementResult.normalizedTransportTime;
      }
    }

    const totalLen = segLengths.reduce((a, b) => a + b, 0) || l;
    const effectiveH = totalLen > 0 ? area / totalLen : h;
    const rowHeightM =
      outerWallKind === 'brick' ? brickHeight + mortarThickness : blockHeight + blockMortarThickness;
    const rows = effectiveH / rowHeightM;
    const roundedDownHeight = Math.floor(rows) * rowHeightM;
    const roundedUpHeight = Math.ceil(rows) * rowHeightM;

    // Calculate time estimates
    let totalHours = 0;
    const taskBreakdown: { task: string; hours: number; normalizedHours?: number }[] = [];

    if (taskTemplates && taskTemplates.length > 0) {
      let relevantTask: { id: string; name: string; unit: string; estimated_hours: number | null } | undefined;
      let innerLeafLaborHours = 0;
      let innerLeafTaskName: string | null = null;

      if (isDoubleWall) {
        if (outerWallType === 'brick') {
          relevantTask = taskTemplates[0];
        } else {
          relevantTask = taskTemplates.find(task =>
            taskNameMatchesBlockWallType(task.name, outerWallType) &&
            task.name.toLowerCase().includes(outerLayingMethod.toLowerCase())
          );
          if (!relevantTask && taskTemplates.length > 0) {
            relevantTask = taskTemplates.find(task =>
              taskNameMatchesBlockWallType(task.name, outerWallType)
            );
          }
          if (!relevantTask && taskTemplates.length > 0) {
            relevantTask = taskTemplates[0];
          }
        }
        if (innerLeafUnits > 0) {
          if (innerWallType === 'brick') {
            const brickTask = innerLeafBrickTasks[0] ?? (outerWallType === 'brick' ? taskTemplates[0] : undefined);
            if (brickTask?.estimated_hours) {
              innerLeafLaborHours = innerLeafUnits * brickTask.estimated_hours;
              innerLeafTaskName = brickTask.name;
            }
          } else if ((innerWallType === 'block4' || innerWallType === 'block7') && innerLeafBlockTasks.length > 0) {
            let innerTask = innerLeafBlockTasks.find(task =>
              taskNameMatchesBlockWallType(task.name, innerWallType) &&
              task.name.toLowerCase().includes(innerLayingMethod.toLowerCase())
            );
            if (!innerTask) innerTask = innerLeafBlockTasks.find(t => taskNameMatchesBlockWallType(t.name, innerWallType));
            if (!innerTask) innerTask = innerLeafBlockTasks[0];
            if (innerTask?.estimated_hours) {
              innerLeafLaborHours = innerLeafUnits * innerTask.estimated_hours;
              innerLeafTaskName = innerTask.name;
            }
          }
        }
      } else if (type === 'brick') {
        relevantTask = taskTemplates[0];
      } else {
        relevantTask = taskTemplates.find(task =>
          taskNameMatchesBlockWallType(task.name, type) &&
          task.name.toLowerCase().includes(layingMethod.toLowerCase())
        );

        if (!relevantTask && taskTemplates.length > 0) {
          relevantTask = taskTemplates.find(task =>
            taskNameMatchesBlockWallType(task.name, type)
          );
        }

        if (!relevantTask && taskTemplates.length > 0) {
          relevantTask = taskTemplates[0];
        }
      }

      if (relevantTask && relevantTask.estimated_hours) {
        if (isDoubleWall) {
          const outerHours = units * relevantTask.estimated_hours;
          totalHours = outerHours + innerLeafLaborHours;
          taskBreakdown.push({
            task: relevantTask.name,
            hours: outerHours
          });
          if (innerLeafUnits > 0 && innerLeafLaborHours > 0 && innerLeafTaskName) {
            taskBreakdown.push({
              task: `${innerLeafTaskName} (${t('calculator:inner_leaf_task_suffix')})`,
              hours: innerLeafLaborHours
            });
          }
        } else if (type === 'brick') {
          const outerHours = units * relevantTask.estimated_hours;
          totalHours = outerHours;
          taskBreakdown.push({
            task: relevantTask.name,
            hours: outerHours
          });
        } else {
          const taskHours = units * relevantTask.estimated_hours;
          totalHours = taskHours;
          taskBreakdown.push({
            task: relevantTask.name,
            hours: taskHours
          });
        }

        if (effectiveCalculateTransport && brickTransportTime > 0) {
          taskBreakdown.push({
            task: 'transport bricks',
            hours: brickTransportTime,
            normalizedHours: normalizedBrickTransportTime
          });
        }
        if (effectiveCalculateTransport && blockTransportTime > 0) {
          taskBreakdown.push({
            task: 'transport blocks',
            hours: blockTransportTime,
            normalizedHours: normalizedBlockTransportTime
          });
        }

        if (effectiveCalculateTransport && sandTransportTime > 0) {
          taskBreakdown.push({
            task: 'transport sand',
            hours: sandTransportTime,
            normalizedHours: normalizedSandTransportTime
          });
        }

        if (effectiveCalculateTransport && cementTransportTime > 0) {
          taskBreakdown.push({
            task: 'transport cement',
            hours: cementTransportTime,
            normalizedHours: normalizedCementTransportTime
          });
        }

        // Add preparing for the wall (leveling) task if available and foundation is NOT included
        if (!includeFoundation && preparingForWallTask && preparingForWallTask.estimated_hours !== undefined) {
          const lengthNum = parseFloat(length) || 0;
          taskBreakdown.push({
            task: 'preparing for the wall (leveling)',
            hours: lengthNum * preparingForWallTask.estimated_hours,
            event_task_id: preparingForWallTask.id
          });
          totalHours += lengthNum * preparingForWallTask.estimated_hours;
        }

        // Add mixing mortar task if available
        if (mixingMortarTask && mixingMortarTask.estimated_hours !== undefined) {
          // Calculate total mortar weight: cement (bags * 25kg) + sand (tonnes * 1000kg)
          const cementWeightKg = cementBags * 25;
          const sandWeightKg = sandTonnes * 1000;
          const totalMortarWeightKg = cementWeightKg + sandWeightKg;
          // Calculate number of batches (125kg per batch)
          const numberOfBatches = Math.ceil(totalMortarWeightKg / 125);
          if (numberOfBatches > 0) {
            taskBreakdown.push({
              task: 'mixing mortar',
              hours: numberOfBatches * mixingMortarTask.estimated_hours,
              event_task_id: mixingMortarTask.id
            });
            totalHours += numberOfBatches * mixingMortarTask.estimated_hours;
          }
        }

        totalHours += brickTransportTime + blockTransportTime + sandTransportTime + cementTransportTime;
      }
    } else {
    }

    // Prepare materials list
    const materials: Material[] = [
      { name: 'Cement', amount: cementBags, unit: 'bags', price_per_unit: null, total_price: null },
      { name: selectedSandMaterial?.name || 'Sand', amount: Number(sandTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: selectedSandMaterial?.price || null, total_price: null }
    ];

    // Add specific materials based on wall type (double wall: same material names as single wall, one line per leaf)
    const doubleWallLeafMaterialName = (wt: 'brick' | 'block4' | 'block7') =>
      wt === 'brick' ? 'Bricks' : wt === 'block4' ? '4-inch blocks' : '6-inch blocks';
    if (isDoubleWall) {
      if (units > 0) {
        materials.push({
          name: doubleWallLeafMaterialName(outerWallType),
          amount: units,
          unit: 'pieces',
          price_per_unit: null,
          total_price: null
        });
      }
      if (innerLeafUnits > 0) {
        materials.push({
          name: doubleWallLeafMaterialName(innerWallType),
          amount: innerLeafUnits,
          unit: 'pieces',
          price_per_unit: null,
          total_price: null
        });
      }
    } else if (type === 'brick') {
      materials.push({ name: 'Bricks', amount: units, unit: 'pieces', price_per_unit: null, total_price: null });
    } else {
      const blockType = type === 'block4' ? '4-inch blocks' : '6-inch blocks';
      materials.push({ name: blockType, amount: units, unit: 'pieces', price_per_unit: null, total_price: null });
    }

    // Add foundation materials if included
    if (includeFoundation) {
      const foundationData = calculateFoundationResults();
      if (foundationData) {
        // Add foundation materials to the list
        materials.push(...foundationData.materials);
        // Add foundation hours to total
        totalHours += foundationData.hours;
        // Add foundation task breakdown
        taskBreakdown.push(...foundationData.taskBreakdown);
      }
    }

    // Fetch material prices
    const materialsWithPrices = await fetchMaterialPrices(materials);

    setResult({
      units,
      cementBags,
      sandVolume: Number(sandVolume.toFixed(3)),
      sandTonnes: Number(sandTonnes.toFixed(2)),
      rows: Number(rows.toFixed(2)),
      roundedDownHeight: Number(roundedDownHeight.toFixed(2)),
      roundedUpHeight: Number(roundedUpHeight.toFixed(2)),
      totalHours,
      taskBreakdown,
      materials: materialsWithPrices,
      innerLeafUnits: isDoubleWall ? innerLeafUnits : undefined,
    });
    if (canvasMode && (type === 'block4' || type === 'block7')) {
      if (includeTileInstallation) setTileCalculateTrigger(prev => prev + 1);
      if (includeCopings) setCopingCalculateTrigger(prev => prev + 1);
    }
  };

  // Recalculate when project settings (transport, equipment) change
  useEffect(() => {
    if (recalculateTrigger > 0 && isInProjectCreating) {
      void calculate();
    }
  }, [recalculateTrigger]);

  // Add effect to expose results
  useEffect(() => {
    if (result && onResultsChange && type === 'sleeper') {
      const totalHours = result.totalHours;
      const materials = result.materials.map((m: Material) => ({ name: m.name, quantity: m.amount, unit: m.unit }));
      const taskBreakdown = result.taskBreakdown.map((item: any) => ({
        task: item.task,
        hours: item.hours,
        amount: item.amount ?? result.units,
        unit: item.unit ?? 'pieces',
      }));
      const formattedResults = {
        name: 'Sleeper Wall',
        amount: result.units,
        unit: 'pieces',
        hours_worked: totalHours,
        postMethod,
        includeFoundation: false,
        materials,
        taskBreakdown,
        wallTaskBreakdown: taskBreakdown,
        wallMaterials: result.materials.map((m: Material) => ({ name: m.name, quantity: m.amount, unit: m.unit })),
        tileTaskBreakdown: [] as any[],
        tileMaterials: [] as any[],
        copingMaterials: [] as any[],
        ...(segmentLengths.length > 0 && {
          segmentLengths,
          segmentHeights,
        }),
      };
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-calculator-results', JSON.stringify(formattedResults));
      }
      onResultsChange(formattedResults);
      return;
    }

    if (result && onResultsChange) {
      let tileInstallationAreaM2 = 0;
      if (canvasMode && (type === 'block4' || type === 'block7') && includeTileInstallation && segmentLengths.length > 0) {
        const wallThicknessM = layingMethod === 'flat' ? 0.215 : (type === 'block7' ? 0.14 : 0.10);
        const slabCm = parseFloat(wallTileSlabThicknessCm) || 2;
        const adhesiveCm = parseFloat(wallTileAdhesiveThicknessCm) || 0.5;
        const frontThicknessM = wallThicknessM + (2 * slabCm + 2 * adhesiveCm) / 100;
        for (let i = 0; i < segmentLengths.length; i++) {
          const [s0, s1] = segmentTileSides[i] ?? [false, false];
          const len = segmentLengths[i];
          const sh = segmentHeights[i];
          const avgH = ((sh?.startH ?? defH) + (sh?.endH ?? defH)) / 2;
          if (s0) tileInstallationAreaM2 += len * avgH;
          if (s1) tileInstallationAreaM2 += len * avgH;
        }
        if (frontFacesTiled[0]) {
          const h0 = segmentHeights[0] ? (segmentHeights[0].startH + segmentHeights[0].endH) / 2 : defH;
          tileInstallationAreaM2 += frontThicknessM * h0;
        }
        if (frontFacesTiled[1]) {
          const hLast = segmentHeights.length > 0 ? (segmentHeights[segmentHeights.length - 1].startH + segmentHeights[segmentHeights.length - 1].endH) / 2 : defH;
          tileInstallationAreaM2 += frontThicknessM * hLast;
        }
      }
      let totalHours = result.totalHours;
      let materials = result.materials.map((m: Material) => ({ name: m.name, quantity: m.amount, unit: m.unit }));
      let taskBreakdown = result.taskBreakdown.map((item: any) => ({
        task: item.task,
        hours: item.hours,
        amount: result.units,
        unit: 'pieces'
      }));

      if (canvasMode && (type === 'block4' || type === 'block7') && includeTileInstallation && tileInstallationResults) {
        totalHours += tileInstallationResults.labor ?? 0;
        materials = [...materials, ...(tileInstallationResults.materials?.map((m: any) => ({ name: m.name, quantity: m.quantity, unit: m.unit })) ?? [])];
        taskBreakdown = [...taskBreakdown, ...(tileInstallationResults.taskBreakdown ?? [])];
      }
      if (canvasMode && (type === 'block4' || type === 'block7') && includeCopings && copingInstallationResults) {
        totalHours += copingInstallationResults.labor ?? 0;
        materials = [...materials, ...(copingInstallationResults.materials?.map((m: any) => ({ name: m.name, quantity: m.quantity, unit: m.unit })) ?? [])];
        taskBreakdown = [...taskBreakdown, ...(copingInstallationResults.taskBreakdown ?? [])];
      }

      // Format results for database storage
      const formattedResults = {
        name: `${type === 'brick' ? 'Brick' : type === 'block4' ? '4-inch Block' : '6-inch Block'} Wall`,
        amount: result.units,
        unit: 'pieces',
        hours_worked: totalHours,
        includeFoundation,
        ...(type === 'brick' && !isDoubleWall && { brickBond }),
        ...(type === 'brick' && isDoubleWall && {
          cavityWall: true,
          outerWallType,
          innerWallType,
          outerBrickBond,
          innerBrickBond,
          outerLayingMethod,
          innerLayingMethod,
          innerLeafUnits: result.innerLeafUnits,
        }),
        ...(includeFoundation && { diggingMethod: effectiveFoundationDiggingMethod }),
        ...(canvasMode && (type === 'block4' || type === 'block7') && {
          includeCopings,
          includeTileInstallation,
          ...(includeTileInstallation && {
            tileInstallationAreaM2,
            segmentTileSides,
            frontFacesTiled,
          }),
          ...(includeCopings && {
            copingSlabLength,
            copingSlabWidth,
            copingGap,
            copingAdhesiveThickness,
            coping45Cut,
            copingGroutingId,
          }),
        }),
        materials,
        taskBreakdown,
        wallTaskBreakdown: result.taskBreakdown.map((item: any) => ({ task: item.task, hours: item.hours, amount: result.units, unit: 'pieces' })),
        tileTaskBreakdown: tileInstallationResults?.taskBreakdown ?? [],
        wallMaterials: result.materials.map((m: Material) => ({ name: m.name, quantity: m.amount, unit: m.unit })),
        tileMaterials: tileInstallationResults?.materials?.map((m: any) => ({ name: m.name, quantity: m.quantity, unit: m.unit })) ?? [],
        copingMaterials: copingInstallationResults?.materials?.map((m: any) => ({ name: m.name, quantity: m.quantity, unit: m.unit })) ?? [],
      };

      // Store results in a data attribute for the modal to access
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-calculator-results', JSON.stringify(formattedResults));
      }

      // Notify parent component of results
      onResultsChange(formattedResults);
    }
  }, [result, type, layingMethod, brickBond, isDoubleWall, outerWallType, innerWallType, outerBrickBond, innerBrickBond, outerLayingMethod, innerLayingMethod, onResultsChange, includeFoundation, effectiveFoundationDiggingMethod, canvasMode, includeCopings, includeTileInstallation, segmentTileSides, frontFacesTiled, segmentLengths, segmentHeights, defH, tileInstallationResults, copingInstallationResults, wallTileSlabThicknessCm, wallTileAdhesiveThicknessCm, postMethod]);

  // Scroll to results when they appear
  useEffect(() => {
    if (result && resultsRef.current) {
      setTimeout(() => {
        // Check if we're inside a modal (has ancestor with overflow-y-auto)
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer) {
          // Scroll within the modal
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else {
          // Scroll the page
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [result]);

  // ─── Canvas mode UI (Object Card — Wall) ─────────────────────────────────
  if (canvasMode && isInProjectCreating) {
    const totalLen = totalLengthCanvas;
    const segs = wallConfigMode === 'segments' ? segmentLengths : [totalLen];
    const fh = parseFloat(height) || 1;
    const heights: WallSegmentHeightRow[] =
      wallConfigMode === 'segments'
        ? segmentHeights
        : [
            {
              startH: fh,
              endH: fh,
              ...(isDoubleWall && segmentHeights[0]
                ? {
                    outerStartH: segmentHeights[0].outerStartH,
                    outerEndH: segmentHeights[0].outerEndH,
                    innerStartH: segmentHeights[0].innerStartH,
                    innerEndH: segmentHeights[0].innerEndH,
                  }
                : {}),
            },
          ];
    const totalArea = segs.reduce((sum, len, i) => {
      const sh = heights[i];
      if (!sh) return sum + len * fh;
      if (isDoubleWall) {
        const o = getSegmentOuterLeafAvgM(sh, fh, fh);
        const inn = getSegmentInnerLeafAvgM(sh, fh, fh);
        return sum + len * o + len * inn;
      }
      const avgH = (sh.startH + sh.endH) / 2;
      return sum + len * avgH;
    }, 0);
    const allHeights = heights.flatMap(h => {
      if (isDoubleWall) {
        return [
          getSegmentOuterLeafAvgM(h, fh, fh),
          getSegmentInnerLeafAvgM(h, fh, fh),
        ];
      }
      return [h.startH, h.endH];
    });
    const uniformH = allHeights.length > 0 && allHeights.every(v => v === allHeights[0]);
    const displayHeight = uniformH && allHeights[0] > 0 ? allHeights[0] : null;

    return (
      <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
        {/* Info banner */}
        <div style={{ background: colors.tealBg, border: `1px solid ${colors.tealBorder}`, borderRadius: radii.md, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: fontSizes.base, color: colors.textCool }}>
          <Info size={14} style={{ color: colors.teal, flexShrink: 0 }} />
          <span>{t('calculator:from_canvas_length')} <strong style={{ color: colors.textPrimaryLight, fontWeight: 600 }}>{totalLen.toFixed(3)} m</strong></span>
        </div>

        {type === 'brick' && !isDoubleWall && (
          <div>
            <div style={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.textLabel, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('calculator:brick_bond_label')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                type="button"
                onClick={() => setBrickBond('header')}
                style={{
                  padding: '6px 14px', borderRadius: radii.sm, border: brickBond === 'header' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`,
                  background: brickBond === 'header' ? colors.greenBg : colors.bgSubtle, color: brickBond === 'header' ? colors.green : colors.textCool,
                  fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer'
                }}
              >
                {t('calculator:brick_bond_stretcher')}
              </button>
              <button
                type="button"
                onClick={() => setBrickBond('stretcher')}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: brickBond === 'stretcher' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`,
                  background: brickBond === 'stretcher' ? colors.greenBg : colors.bgSubtle, color: brickBond === 'stretcher' ? colors.green : colors.textCool,
                  fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer'
                }}
              >
                {t('calculator:brick_bond_header')}
              </button>
            </div>
          </div>
        )}

        {type === 'brick' && isDoubleWall && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
            <div style={{ paddingBottom: spacing[3], borderBottom: `1px solid ${colors.bgDeepBorder}` }}>
              <SelectDropdown
                label={t('calculator:wall_layer1_material_label')}
                value={outerWallType}
                onChange={(v) => setOuterWallType(v as 'brick' | 'block4' | 'block7')}
                options={[
                  { value: 'brick', label: t('calculator:inner_wall_option_brick') },
                  { value: 'block4', label: t('calculator:inner_wall_option_block4') },
                  { value: 'block7', label: t('calculator:inner_wall_option_block7') },
                ]}
              />
              {outerWallType === 'brick' && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.textLabel, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('calculator:brick_bond_label')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button type="button" onClick={() => setOuterBrickBond('header')} style={{ padding: '6px 14px', borderRadius: radii.sm, border: outerBrickBond === 'header' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`, background: outerBrickBond === 'header' ? colors.greenBg : colors.bgSubtle, color: outerBrickBond === 'header' ? colors.green : colors.textCool, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>{t('calculator:brick_bond_stretcher')}</button>
                    <button type="button" onClick={() => setOuterBrickBond('stretcher')} style={{ padding: '6px 14px', borderRadius: 6, border: outerBrickBond === 'stretcher' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`, background: outerBrickBond === 'stretcher' ? colors.greenBg : colors.bgSubtle, color: outerBrickBond === 'stretcher' ? colors.green : colors.textCool, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>{t('calculator:brick_bond_header')}</button>
                  </div>
                </div>
              )}
              {(outerWallType === 'block4' || outerWallType === 'block7') && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.textLabel, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('calculator:element_type_label')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button type="button" onClick={() => setOuterLayingMethod('standing')} style={{ padding: '6px 14px', borderRadius: radii.sm, border: outerLayingMethod === 'standing' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`, background: outerLayingMethod === 'standing' ? colors.greenBg : colors.bgSubtle, color: outerLayingMethod === 'standing' ? colors.green : colors.textCool, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>{t('calculator:standing_label')}</button>
                    <button type="button" onClick={() => setOuterLayingMethod('flat')} style={{ padding: '6px 14px', borderRadius: 6, border: outerLayingMethod === 'flat' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`, background: outerLayingMethod === 'flat' ? colors.greenBg : colors.bgSubtle, color: outerLayingMethod === 'flat' ? colors.green : colors.textCool, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>{t('calculator:flat_label')}</button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <SelectDropdown
                label={t('calculator:wall_layer2_material_label')}
                value={innerWallType}
                onChange={(v) => setInnerWallType(v as 'brick' | 'block4' | 'block7')}
                options={[
                  { value: 'brick', label: t('calculator:inner_wall_option_brick') },
                  { value: 'block4', label: t('calculator:inner_wall_option_block4') },
                  { value: 'block7', label: t('calculator:inner_wall_option_block7') },
                ]}
              />
              {innerWallType === 'brick' && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.textLabel, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('calculator:brick_bond_label')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button type="button" onClick={() => setInnerBrickBond('header')} style={{ padding: '6px 14px', borderRadius: radii.sm, border: innerBrickBond === 'header' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`, background: innerBrickBond === 'header' ? colors.greenBg : colors.bgSubtle, color: innerBrickBond === 'header' ? colors.green : colors.textCool, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>{t('calculator:brick_bond_stretcher')}</button>
                    <button type="button" onClick={() => setInnerBrickBond('stretcher')} style={{ padding: '6px 14px', borderRadius: 6, border: innerBrickBond === 'stretcher' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`, background: innerBrickBond === 'stretcher' ? colors.greenBg : colors.bgSubtle, color: innerBrickBond === 'stretcher' ? colors.green : colors.textCool, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>{t('calculator:brick_bond_header')}</button>
                  </div>
                </div>
              )}
              {(innerWallType === 'block4' || innerWallType === 'block7') && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.textLabel, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('calculator:inner_leaf_laying_label')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button type="button" onClick={() => setInnerLayingMethod('standing')} style={{ padding: '6px 14px', borderRadius: radii.sm, border: innerLayingMethod === 'standing' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`, background: innerLayingMethod === 'standing' ? colors.greenBg : colors.bgSubtle, color: innerLayingMethod === 'standing' ? colors.green : colors.textCool, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>{t('calculator:standing_label')}</button>
                    <button type="button" onClick={() => setInnerLayingMethod('flat')} style={{ padding: '6px 14px', borderRadius: 6, border: innerLayingMethod === 'flat' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`, background: innerLayingMethod === 'flat' ? colors.greenBg : colors.bgSubtle, color: innerLayingMethod === 'flat' ? colors.green : colors.textCool, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>{t('calculator:flat_label')}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Standing / Flat chips (block4, block7) */}
        {(type === 'block4' || type === 'block7') && (
          <div>
            <div style={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.textLabel, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('calculator:element_type_label')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                type="button"
                onClick={() => setLayingMethod('standing')}
                style={{
                  padding: '6px 14px', borderRadius: radii.sm, border: layingMethod === 'standing' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`,
                  background: layingMethod === 'standing' ? colors.greenBg : colors.bgSubtle, color: layingMethod === 'standing' ? colors.green : colors.textCool,
                  fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer'
                }}
              >
                Standing
              </button>
              <button
                type="button"
                onClick={() => setLayingMethod('flat')}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: layingMethod === 'flat' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`,
                  background: layingMethod === 'flat' ? colors.greenBg : colors.bgSubtle, color: layingMethod === 'flat' ? colors.green : colors.textCool,
                  fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer'
                }}
              >
                Flat
              </button>
            </div>
          </div>
        )}

        {type === 'sleeper' && (
          <div>
            <div style={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.textLabel, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('calculator:input_post_installation_method')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                type="button"
                onClick={() => setPostMethod('concrete')}
                style={{
                  padding: '6px 14px', borderRadius: radii.sm, border: postMethod === 'concrete' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`,
                  background: postMethod === 'concrete' ? colors.greenBg : colors.bgSubtle, color: postMethod === 'concrete' ? colors.green : colors.textCool,
                  fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
                }}
              >
                {t('calculator:input_concrete_in_posts')}
              </button>
              <button
                type="button"
                onClick={() => setPostMethod('direct')}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: postMethod === 'direct' ? `1px solid ${colors.greenBorder}` : `1px solid ${colors.borderInputDark}`,
                  background: postMethod === 'direct' ? colors.greenBg : colors.bgSubtle, color: postMethod === 'direct' ? colors.green : colors.textCool,
                  fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
                }}
              >
                {t('calculator:input_drive_posts_directly')}
              </button>
            </div>
          </div>
        )}

        <div style={{ height: 1, background: colors.bgDeepBorder, margin: '16px 0' }} />

        {/* Wall configuration toggle */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.textWarm, marginBottom: 6, display: 'block' }}>{t('calculator:wall_configuration_label')}</label>
          <div style={{ display: 'flex', background: colors.bgDeep, borderRadius: 8, border: `1px solid ${colors.bgDeepBorder}`, padding: 3, gap: 3 }}>
            <button
              type="button"
              disabled={segmentSingleLocked}
              onClick={() => !segmentSingleLocked && setWallConfigModeWithSync('single')}
              title={segmentSingleLocked ? t('calculator:remove_segments_single') : undefined}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 6, border: 'none', background: wallConfigMode === 'single' ? colors.greenBg : 'transparent',
                color: segmentSingleLocked ? colors.textDisabled : (wallConfigMode === 'single' ? colors.green : colors.textLabel), fontWeight: 600, fontSize: '0.82rem', cursor: segmentSingleLocked ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: segmentSingleLocked ? 0.5 : 1
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x={3} y={8} width={18} height={8} rx={1} /></svg>
              {t('calculator:single_wall_label')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (type === 'sleeper' && !canvasMode && segmentLengthsFromSaved.length === 0 && manualSegmentLengths.length === 0) {
                  enterSleeperStandaloneSegmentsMode();
                } else {
                  setWallConfigMode('segments');
                }
              }}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 6, border: 'none', background: wallConfigMode === 'segments' ? colors.greenBg : 'transparent',
                color: wallConfigMode === 'segments' ? colors.green : colors.textLabel, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x={2} y={8} width={5} height={8} rx={1} /><rect x={9} y={8} width={6} height={8} rx={1} /><rect x={17} y={8} width={5} height={8} rx={1} /></svg>
              {t('calculator:segments_label')}
            </button>
          </div>
          <div style={{ fontSize: fontSizes.sm, color: colors.textLabel, marginTop: 6 }}>
            {wallConfigMode === 'single' ? t('calculator:wall_config_single_desc') : t('calculator:wall_config_segments_desc')}
          </div>
        </div>

        {/* Summary bar */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, background: colors.bgDeep, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: 8, padding: '10px 14px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${colors.teal}, transparent)` }} />
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: colors.textLabel, textTransform: 'uppercase', marginBottom: 3 }}>{t('calculator:total_length_label')}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1rem', fontWeight: 700, color: colors.textPrimaryLight }}>{totalLen.toFixed(3)} <span style={{ fontSize: '0.75rem', color: colors.textCool, marginLeft: 2 }}>m</span></div>
          </div>
          <div style={{ flex: 1, background: colors.bgDeep, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: 8, padding: '10px 14px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${colors.accentBlue}, transparent)` }} />
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: colors.textLabel, textTransform: 'uppercase', marginBottom: 3 }}>{t('calculator:height_label')}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1rem', fontWeight: 700, color: displayHeight != null ? colors.textPrimaryLight : colors.amber }}>{displayHeight != null ? `${displayHeight.toFixed(2)} m` : t('calculator:varied_label')} <span style={{ fontSize: '0.75rem', color: colors.textCool, marginLeft: 2 }}>{displayHeight != null ? '' : ''}</span></div>
          </div>
          <div style={{ flex: 1, background: colors.bgDeep, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: 8, padding: '10px 14px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${colors.amber}, transparent)` }} />
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: colors.textLabel, textTransform: 'uppercase', marginBottom: 3 }}>{t('calculator:area_label')}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1rem', fontWeight: 700, color: colors.textPrimaryLight }}>{totalArea.toFixed(2)} <span style={{ fontSize: '0.75rem', color: colors.textCool, marginLeft: 2 }}>m²</span></div>
          </div>
        </div>

        {/* Height notice */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', padding: '6px 10px', borderRadius: 6,
          ...(uniformH && displayHeight != null ? { color: colors.green, background: colors.greenBg } : { color: colors.amber, background: colors.amberBg })
        }}>
          {uniformH && displayHeight != null ? <Check size={13} /> : <AlertTriangle size={13} />}
          <span>{uniformH && displayHeight != null ? t('calculator:uniform_height_desc', { h: displayHeight.toFixed(2) }) : allHeights.length > 0 ? t('calculator:varied_height_desc', { min: Math.min(...allHeights).toFixed(2), max: Math.max(...allHeights).toFixed(2) }) : t('calculator:set_segment_heights')}</span>
        </div>

        {/* Single wall section */}
        {wallConfigMode === 'single' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.textWarm, marginBottom: 6, display: 'block' }}>{t('calculator:wall_length_m')}</label>
                <input type="text" readOnly value={totalLen.toFixed(3)} style={{ width: '100%', padding: '8px 12px', background: colors.bgInputDarkAlpha, border: `1px solid ${colors.borderInputDark}`, borderRadius: 8, color: colors.textCool, fontSize: '0.85rem', cursor: 'default' }} />
              </div>
              {!isDoubleWall ? (
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.textWarm, marginBottom: 6, display: 'block' }}>{t('calculator:wall_height_m')}</label>
                  <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} step={0.1} min={0.1} style={{ width: '100%', padding: '8px 12px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 8, color: colors.textPrimaryLight, fontSize: '0.85rem', outline: 'none' }} />
                </div>
              ) : (
                <div style={{ flex: 2, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: colors.textCool, letterSpacing: '0.02em' }}>{doubleWallOuterCaption}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: colors.textWarm, marginBottom: 4, display: 'block' }}>{t('calculator:double_wall_outer_start_h')}</label>
                        <input type="number" value={segmentHeights[0]?.outerStartH ?? fh} onChange={(e) => updateSegmentHeight(0, 'outerStartH', parseFloat(e.target.value) || 0)} step={0.1} min={0} style={{ width: '100%', padding: '6px 8px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 8, color: colors.textPrimaryLight, fontSize: '0.82rem', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: colors.textWarm, marginBottom: 4, display: 'block' }}>{t('calculator:double_wall_outer_end_h')}</label>
                        <input type="number" value={segmentHeights[0]?.outerEndH ?? fh} onChange={(e) => updateSegmentHeight(0, 'outerEndH', parseFloat(e.target.value) || 0)} step={0.1} min={0} style={{ width: '100%', padding: '6px 8px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 8, color: colors.textPrimaryLight, fontSize: '0.82rem', outline: 'none' }} />
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      borderTop: `1px dashed ${colors.borderInputDark}`,
                      paddingTop: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: colors.textCool, letterSpacing: '0.02em' }}>{doubleWallInnerCaption}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: colors.textWarm, marginBottom: 4, display: 'block' }}>{t('calculator:double_wall_inner_start_h')}</label>
                        <input type="number" value={segmentHeights[0]?.innerStartH ?? fh} onChange={(e) => updateSegmentHeight(0, 'innerStartH', parseFloat(e.target.value) || 0)} step={0.1} min={0} style={{ width: '100%', padding: '6px 8px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 8, color: colors.textPrimaryLight, fontSize: '0.82rem', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: colors.textWarm, marginBottom: 4, display: 'block' }}>{t('calculator:double_wall_inner_end_h')}</label>
                        <input type="number" value={segmentHeights[0]?.innerEndH ?? fh} onChange={(e) => updateSegmentHeight(0, 'innerEndH', parseFloat(e.target.value) || 0)} step={0.1} min={0} style={{ width: '100%', padding: '6px 8px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 8, color: colors.textPrimaryLight, fontSize: '0.82rem', outline: 'none' }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.62rem', color: colors.textLabel, lineHeight: 1.35 }}>{t('calculator:segment_zero_removes_leaf_hint')}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Segments section */}
        {wallConfigMode === 'segments' && segmentLengths.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.textCool, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x={2} y={8} width={5} height={8} rx={1} /><rect x={9} y={6} width={6} height={10} rx={1} /><rect x={17} y={9} width={5} height={7} rx={1} /></svg>
                {t('calculator:wall_segments_label')}
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.green, background: colors.greenBg, padding: '1px 8px', borderRadius: 10 }}>{segmentLengths.length}</span>
              </div>
              <button type="button" onClick={() => setAllHeights(1)} title={t('calculator:reset_heights_title')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: colors.textLabel, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                {t('calculator:reset_button')}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {isDoubleWall ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.68rem', color: colors.textLabel, fontWeight: 600 }}>{t('calculator:double_wall_set_all_outer_label')}</span>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      placeholder={defH.toFixed(1)}
                      value={bulkSetOuterInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setBulkSetOuterInput(raw);
                        const v = parseBulkHeightM(raw);
                        if (v != null) setAllOuterHeights(v);
                      }}
                      title={t('calculator:set_all_height_live_hint')}
                      aria-label={t('calculator:double_wall_set_all_outer_label')}
                      style={{ width: 88, padding: '5px 8px', borderRadius: 8, border: `1px solid ${colors.borderInputDark}`, background: colors.bgInputDark, color: colors.textPrimaryLight, fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace", outline: 'none' }}
                    />
                    <span style={{ fontSize: '0.62rem', color: colors.textLabel }}>m</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.68rem', color: colors.textLabel, fontWeight: 600 }}>{t('calculator:double_wall_set_all_inner_label')}</span>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      placeholder={defH.toFixed(1)}
                      value={bulkSetInnerInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setBulkSetInnerInput(raw);
                        const v = parseBulkHeightM(raw);
                        if (v != null) setAllInnerHeights(v);
                      }}
                      title={t('calculator:set_all_height_live_hint')}
                      aria-label={t('calculator:double_wall_set_all_inner_label')}
                      style={{ width: 88, padding: '5px 8px', borderRadius: 8, border: `1px solid ${colors.borderInputDark}`, background: colors.bgInputDark, color: colors.textPrimaryLight, fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace", outline: 'none' }}
                    />
                    <span style={{ fontSize: '0.62rem', color: colors.textLabel }}>m</span>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.68rem', color: colors.textLabel, fontWeight: 600 }}>{t('calculator:set_all_label')}</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    placeholder={defH.toFixed(1)}
                    value={bulkSetAllInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setBulkSetAllInput(raw);
                      const v = parseBulkHeightM(raw);
                      if (v != null) setAllHeights(v);
                    }}
                    title={t('calculator:set_all_height_live_hint')}
                    aria-label={t('calculator:set_all_label')}
                    style={{ width: 88, padding: '5px 8px', borderRadius: 8, border: `1px solid ${colors.borderInputDark}`, background: colors.bgInputDark, color: colors.textPrimaryLight, fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace", outline: 'none' }}
                  />
                  <span style={{ fontSize: '0.62rem', color: colors.textLabel }}>m</span>
                </div>
              )}
            </div>
            <div style={{ background: colors.bgDeep, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: 12, overflow: 'hidden', marginTop: 10 }}>
              {isDoubleWall ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr repeat(4, minmax(56px, 1fr))', padding: '6px 0 0', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ gridColumn: '1 / 3', minHeight: 4 }} />
                    <div
                      style={{
                        gridColumn: '3 / 5',
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        color: colors.textCool,
                        textAlign: 'center',
                        padding: '6px 4px',
                        borderLeft: `1px dashed ${colors.borderInputDark}`,
                        lineHeight: 1.3,
                      }}
                    >
                      {doubleWallOuterCaption}
                    </div>
                    <div
                      style={{
                        gridColumn: '5 / -1',
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        color: colors.textCool,
                        textAlign: 'center',
                        padding: '6px 4px',
                        borderLeft: `1px dashed ${colors.borderInputDark}`,
                        lineHeight: 1.3,
                      }}
                    >
                      {doubleWallInnerCaption}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr repeat(4, minmax(56px, 1fr))', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 4 }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: colors.textLabel, padding: '0 8px', textTransform: 'uppercase' }}>#</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: colors.textLabel, textTransform: 'uppercase' }}>{t('calculator:length_label')}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: colors.textLabel, textAlign: 'center', borderLeft: `1px dashed ${colors.borderInputDark}`, padding: '0 2px' }}>{t('calculator:segment_start_h_short')}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: colors.textLabel, textAlign: 'center' }}>{t('calculator:segment_end_h_short')}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: colors.textLabel, textAlign: 'center', borderLeft: `1px dashed ${colors.borderInputDark}`, padding: '0 2px' }}>{t('calculator:segment_start_h_short')}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: colors.textLabel, textAlign: 'center' }}>{t('calculator:segment_end_h_short')}</span>
                  </div>
                  <div style={{ fontSize: '0.6rem', color: colors.textLabel, padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', lineHeight: 1.35 }}>{t('calculator:segment_zero_removes_leaf_hint')}</div>
                  {segmentLengths.map((segLen, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '40px 1fr repeat(4, minmax(56px, 1fr))', alignItems: 'center', padding: '4px 0', gap: 4, borderBottom: idx < segmentLengths.length - 1 ? `1px solid ${colors.borderSubtle}` : 'none', background: idx % 2 === 1 ? colors.bgSubtle : undefined }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', fontWeight: 600, color: colors.textLabel, textAlign: 'center' }}>{idx + 1}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.82rem', fontWeight: 600, color: colors.textPrimaryLight, padding: '6px 8px' }}>{segLen.toFixed(2)} <span style={{ fontSize: '0.72rem', color: colors.textLabel }}>m</span></div>
                      <div style={{ padding: '4px', display: 'flex', justifyContent: 'center', borderLeft: `1px dashed ${colors.borderInputDark}` }}>
                        <input type="number" value={segmentHeights[idx]?.outerStartH ?? defH} step={0.1} min={0} onChange={(e) => updateSegmentHeight(idx, 'outerStartH', parseFloat(e.target.value) || 0)} style={{ width: '100%', maxWidth: 72, padding: '5px 4px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem', textAlign: 'center', outline: 'none' }} />
                      </div>
                      <div style={{ padding: '4px', display: 'flex', justifyContent: 'center' }}>
                        <input type="number" value={segmentHeights[idx]?.outerEndH ?? defH} step={0.1} min={0} onChange={(e) => updateSegmentHeight(idx, 'outerEndH', parseFloat(e.target.value) || 0)} style={{ width: '100%', maxWidth: 72, padding: '5px 4px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem', textAlign: 'center', outline: 'none' }} />
                      </div>
                      <div style={{ padding: '4px', display: 'flex', justifyContent: 'center', borderLeft: `1px dashed ${colors.borderInputDark}` }}>
                        <input type="number" value={segmentHeights[idx]?.innerStartH ?? defH} step={0.1} min={0} onChange={(e) => updateSegmentHeight(idx, 'innerStartH', parseFloat(e.target.value) || 0)} style={{ width: '100%', maxWidth: 72, padding: '5px 4px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem', textAlign: 'center', outline: 'none' }} />
                      </div>
                      <div style={{ padding: '4px', display: 'flex', justifyContent: 'center' }}>
                        <input type="number" value={segmentHeights[idx]?.innerEndH ?? defH} step={0.1} min={0} onChange={(e) => updateSegmentHeight(idx, 'innerEndH', parseFloat(e.target.value) || 0)} style={{ width: '100%', maxWidth: 72, padding: '5px 4px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem', textAlign: 'center', outline: 'none' }} />
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr 100px 100px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel, padding: '0 12px', textTransform: 'uppercase' }}>#</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel, padding: '0 12px', textTransform: 'uppercase' }}>{t('calculator:length_label')}</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel, padding: '0 12px', textTransform: 'uppercase', textAlign: 'center' }}>{t('calculator:segment_start_h')}</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel, padding: '0 12px', textTransform: 'uppercase', textAlign: 'center' }}>{t('calculator:segment_end_h')}</span>
                  </div>
                  {segmentLengths.map((segLen, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '46px 1fr 100px 100px', alignItems: 'center', padding: 0, borderBottom: idx < segmentLengths.length - 1 ? `1px solid ${colors.borderSubtle}` : 'none', background: idx % 2 === 1 ? colors.bgSubtle : undefined }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', fontWeight: 600, color: colors.textLabel, textAlign: 'center', padding: '10px 0' }}>{idx + 1}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.82rem', fontWeight: 600, color: colors.textPrimaryLight, padding: '10px 12px' }}>{segLen.toFixed(2)} <span style={{ fontSize: '0.72rem', color: colors.textLabel }}>m</span></div>
                      <div style={{ padding: '5px 6px', display: 'flex', justifyContent: 'center' }}>
                        <input type="number" value={segmentHeights[idx]?.startH ?? defH} step={0.1} min={0.1} onChange={(e) => updateSegmentHeight(idx, 'startH', parseFloat(e.target.value) || 0)} style={{ width: '100%', maxWidth: 80, padding: '6px 8px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', textAlign: 'center', outline: 'none' }} />
                      </div>
                      <div style={{ padding: '5px 6px', display: 'flex', justifyContent: 'center' }}>
                        <input type="number" value={segmentHeights[idx]?.endH ?? defH} step={0.1} min={0.1} onChange={(e) => updateSegmentHeight(idx, 'endH', parseFloat(e.target.value) || 0)} style={{ width: '100%', maxWidth: 80, padding: '6px 8px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', textAlign: 'center', outline: 'none' }} />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {type !== 'sleeper' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: colors.textPrimaryLight }}>
            <input
              type="checkbox"
              checked={includeFoundation}
              onChange={(e) => setIncludeFoundation(e.target.checked)}
              style={{ accentColor: colors.green }}
            />
            <span>{t('calculator:include_foundation')}</span>
          </label>
          {includeFoundation && (
            <div style={{ background: colors.bgDeep, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: colors.textLabel, textTransform: 'uppercase' }}>{t('calculator:foundation_details_label')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: '0.7rem', color: colors.textLabel, marginBottom: 2, display: 'block' }}>{t('calculator:input_length_m')}</label>
                  <input type="number" value={foundationLength} onChange={(e) => setFoundationLength(e.target.value)} placeholder="m" min={0} step={0.1} style={{ width: '100%', padding: '6px 10px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: colors.textLabel, marginBottom: 2, display: 'block' }}>{t('calculator:input_width_m')}</label>
                  <input type="number" value={foundationWidth} onChange={(e) => setFoundationWidth(e.target.value)} placeholder="m" min={0} step={0.1} style={{ width: '100%', padding: '6px 10px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: colors.textLabel, marginBottom: 2, display: 'block' }}>{t('calculator:input_depth_in_cm')}</label>
                  <input type="number" value={foundationDepthCm} onChange={(e) => setFoundationDepthCm(e.target.value)} placeholder="cm" min={0} step={1} style={{ width: '100%', padding: '6px 10px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontSize: 13 }} />
                </div>
              </div>
              {!isInProjectCreating && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: '0.7rem', color: colors.textLabel, marginBottom: 2, display: 'block' }}>{t('calculator:digging_method')}</label>
                  <select value={foundationDiggingMethod} onChange={(e) => setFoundationDiggingMethod(e.target.value as any)} style={{ width: '100%', padding: '6px 10px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontSize: 13 }}>
                    <option value="shovel">Shovel (Manual)</option>
                    <option value="small">Small Excavator (1-3t)</option>
                    <option value="medium">Medium Excavator (3-7t)</option>
                    <option value="large">Large Excavator (7+t)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: colors.textLabel, marginBottom: 2, display: 'block' }}>{t('calculator:soil_type')}</label>
                  <select value={foundationSoilType} onChange={(e) => setFoundationSoilType(e.target.value as any)} style={{ width: '100%', padding: '6px 10px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontSize: 13 }}>
                    <option value="clay">{t('calculator:soil_type_clay')}</option>
                    <option value="sand">{t('calculator:soil_type_sand')}</option>
                    <option value="rock">{t('calculator:soil_type_rock')}</option>
                  </select>
                </div>
              </div>
              )}
            </div>
          )}

          {/* Include copings - canvas only, block4/block7 */}
          {(type === 'block4' || type === 'block7') && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: colors.textPrimaryLight }}>
                <input
                  type="checkbox"
                  checked={includeCopings}
                  onChange={(e) => setIncludeCopings(e.target.checked)}
                  style={{ accentColor: colors.green }}
                />
                <span>{t('calculator:include_copings')}</span>
              </label>
              {includeCopings && segmentLengths.length > 0 && (
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: colors.bgDeep, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: colors.textLabel, textTransform: 'uppercase', marginBottom: 10 }}>{t('calculator:coping_installation_calculator_title')}</div>
                    <CopingInstallationCalculator
                      fromWallSegments
                      initialSegmentLengths={segmentLengths}
                      initialCornerCount={Math.max(0, segmentLengths.length - 1)}
                      canvasMode
                      isInProjectCreating
                      calculateTrigger={copingCalculateTrigger}
                      slabLength={copingSlabLength}
                      slabWidth={copingSlabWidth}
                      selectedGap={copingGap}
                      adhesiveThickness={copingAdhesiveThickness}
                      apply45DegreeCut={coping45Cut}
                      selectedGroutingId={copingGroutingId}
                      onSlabLengthChange={setCopingSlabLength}
                      onSlabWidthChange={setCopingSlabWidth}
                      onSelectedGapChange={setCopingGap}
                      onAdhesiveThicknessChange={setCopingAdhesiveThickness}
                      onApply45DegreeCutChange={setCoping45Cut}
                      onSelectedGroutingIdChange={setCopingGroutingId}
                      onResultsChange={(r) => setCopingInstallationResults(r)}
                      calculateTransport={effectiveCalculateTransport}
                      selectedTransportCarrier={effectiveSelectedTransportCarrier}
                      transportDistance={effectiveTransportDistance}
                      carriers={carriers}
                    />
                  </div>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: colors.textPrimaryLight }}>
                <input
                  type="checkbox"
                  checked={includeTileInstallation}
                  onChange={(e) => setIncludeTileInstallation(e.target.checked)}
                  style={{ accentColor: colors.green }}
                />
                <span>{t('calculator:include_tile_installation')}</span>
              </label>
              {includeTileInstallation && shape?.points && segmentLengths.length > 0 && (
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: colors.textLabel, marginBottom: 2, display: 'block' }}>{t('calculator:input_slab_thickness_cm')}</label>
                      <input type="number" value={wallTileSlabThicknessCm} onChange={(e) => setWallTileSlabThicknessCm(e.target.value)} min={0.5} step={0.5} style={{ width: '100%', padding: '6px 10px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: colors.textLabel, marginBottom: 2, display: 'block' }}>{t('calculator:input_tile_adhesive_thickness')} (cm)</label>
                      <input type="number" value={wallTileAdhesiveThicknessCm} onChange={(e) => setWallTileAdhesiveThicknessCm(e.target.value)} min={0} step={0.5} style={{ width: '100%', padding: '6px 10px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 6, color: colors.textPrimaryLight, fontSize: 13 }} />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: colors.textLabel, marginBottom: 6 }}>{t('calculator:wall_tile_sides_hint')}</div>
                  <WallTileSidesSelector
                    points={shape.points}
                    segmentTileSides={segmentTileSides.length === segmentLengths.length ? segmentTileSides : segmentLengths.map(() => [false, false])}
                    frontFacesTiled={frontFacesTiled}
                    onChange={(next) => setSegmentTileSides(next)}
                    onFrontFacesChange={(next) => setFrontFacesTiled(next)}
                    slabThicknessCm={parseFloat(wallTileSlabThicknessCm) || 2}
                    adhesiveThicknessCm={parseFloat(wallTileAdhesiveThicknessCm) || 0.5}
                    segmentHeights={segmentHeights}
                    wallType={type === 'block7' ? 'block7' : 'block4'}
                    layingMethod={layingMethod}
                  />
                  <div style={{ background: colors.bgDeep, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: colors.textLabel, textTransform: 'uppercase', marginBottom: 10 }}>{t('calculator:tile_installation_calculator_title_alt')}</div>
                    <TileInstallationCalculator
                      fromWallSegments
                      initialAreaM2={(() => {
                        const wallThicknessM = layingMethod === 'flat' ? 0.215 : (type === 'block7' ? 0.14 : 0.10);
                        const slabCm = parseFloat(wallTileSlabThicknessCm) || 2;
                        const adhesiveCm = parseFloat(wallTileAdhesiveThicknessCm) || 0.5;
                        const frontThicknessM = wallThicknessM + (2 * slabCm + 2 * adhesiveCm) / 100;
                        let a = 0;
                        for (let i = 0; i < segmentLengths.length; i++) {
                          const [s0, s1] = segmentTileSides[i] ?? [false, false];
                          const len = segmentLengths[i];
                          const sh = segmentHeights[i];
                          const avgH = ((sh?.startH ?? defH) + (sh?.endH ?? defH)) / 2;
                          if (s0) a += len * avgH;
                          if (s1) a += len * avgH;
                        }
                        if (frontFacesTiled[0]) {
                          const h0 = segmentHeights[0] ? (segmentHeights[0].startH + segmentHeights[0].endH) / 2 : defH;
                          a += frontThicknessM * h0;
                        }
                        if (frontFacesTiled[1]) {
                          const hLast = segmentHeights.length > 0 ? (segmentHeights[segmentHeights.length - 1].startH + segmentHeights[segmentHeights.length - 1].endH) / 2 : defH;
                          a += frontThicknessM * hLast;
                        }
                        return a;
                      })()}
                      initialWallLengthM={(() => {
                        const wallThicknessM = layingMethod === 'flat' ? 0.215 : (type === 'block7' ? 0.14 : 0.10);
                        const slabCm = parseFloat(wallTileSlabThicknessCm) || 2;
                        const adhesiveCm = parseFloat(wallTileAdhesiveThicknessCm) || 0.5;
                        const frontThicknessM = wallThicknessM + (2 * slabCm + 2 * adhesiveCm) / 100;
                        let len = 0;
                        for (let i = 0; i < segmentLengths.length; i++) {
                          const [s0, s1] = segmentTileSides[i] ?? [false, false];
                          const segLen = segmentLengths[i];
                          if (s0) len += segLen;
                          if (s1) len += segLen;
                        }
                        if (frontFacesTiled[0]) len += frontThicknessM;
                        if (frontFacesTiled[1]) len += frontThicknessM;
                        return len;
                      })()}
                      initialWallHeightM={(() => {
                        let area = 0, len = 0;
                        for (let i = 0; i < segmentLengths.length; i++) {
                          const [s0, s1] = segmentTileSides[i] ?? [false, false];
                          const segLen = segmentLengths[i];
                          const sh = segmentHeights[i];
                          const avgH = ((sh?.startH ?? defH) + (sh?.endH ?? defH)) / 2;
                          if (s0) { area += segLen * avgH; len += segLen; }
                          if (s1) { area += segLen * avgH; len += segLen; }
                        }
                        return len > 0 ? area / len : 0;
                      })()}
                      canvasMode
                      isInProjectCreating
                      calculateTrigger={tileCalculateTrigger}
                      initialSegmentDimensions={(() => {
                        const wallThicknessM = layingMethod === 'flat' ? 0.215 : (type === 'block7' ? 0.14 : 0.10);
                        const slabCm = parseFloat(wallTileSlabThicknessCm) || 2;
                        const adhesiveCm = parseFloat(wallTileAdhesiveThicknessCm) || 0.5;
                        const frontThicknessM = wallThicknessM + (2 * slabCm + 2 * adhesiveCm) / 100;
                        const segs: { length: number; height: number }[] = [];
                        for (let i = 0; i < segmentLengths.length; i++) {
                          const [s0, s1] = segmentTileSides[i] ?? [false, false];
                          if (!s0 && !s1) continue;
                          const sh = segmentHeights[i];
                          const h0 = sh?.startH ?? defH;
                          const h1 = sh?.endH ?? defH;
                          const avgH = (h0 + h1) / 2;
                          segs.push({ length: segmentLengths[i], height: avgH, startH: h0, endH: h1 });
                        }
                        if (frontFacesTiled[0]) {
                          const h0 = segmentHeights[0] ? (segmentHeights[0].startH + segmentHeights[0].endH) / 2 : defH;
                          segs.push({ length: frontThicknessM, height: h0, startH: h0, endH: h0 });
                        }
                        if (frontFacesTiled[1]) {
                          const hLast = segmentHeights.length > 0 ? (segmentHeights[segmentHeights.length - 1].startH + segmentHeights[segmentHeights.length - 1].endH) / 2 : defH;
                          segs.push({ length: frontThicknessM, height: hLast, startH: hLast, endH: hLast });
                        }
                        return segs;
                      })()}
                      onResultsChange={(r) => setTileInstallationResults(r)}
                      calculateTransport={effectiveCalculateTransport}
                      selectedTransportCarrier={effectiveSelectedTransportCarrier}
                      transportDistance={effectiveTransportDistance}
                      carriers={carriers}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        )}

        <Button variant="primary" fullWidth onClick={calculate}>
          <Check size={15} />
          {t('calculator:calculate_button')}
        </Button>

        {result && (
          <div ref={resultsRef} style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: '0.9rem', color: colors.textPrimaryLight }}>{t('calculator:total_rows')} <strong>{Math.ceil(result.rows)}</strong> <span style={{ fontSize: '0.8rem', color: colors.accentBlue }}>{t('calculator:rounded_up_from', { val: result.rows.toFixed(2) })}</span></p>
              <p style={{ fontSize: '0.9rem', color: colors.textPrimaryLight }}>{t('calculator:rounded_up_height')} <strong>{result.roundedUpHeight} m</strong></p>
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: colors.textPrimaryLight, marginTop: 12 }}>{t('calculator:total_labor_hours_label')} <span style={{ color: colors.green }}>{(result.totalHours + (tileInstallationResults?.labor ?? 0) + (copingInstallationResults?.labor ?? 0)).toFixed(2)} {t('calculator:hours_abbreviation')}</span></h3>
            <div style={{ marginTop: 8 }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.textCool, marginBottom: 6 }}>{type === 'sleeper' ? t('calculator:sleeper_wall_calculator_title_alt') : type === 'block4' ? t('calculator:block4_wall_label') : type === 'block7' ? t('calculator:block7_wall_label') : t('calculator:wall_label')} — {t('calculator:task_breakdown_label')}</h4>
              <div style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, overflow: 'hidden' }}>
                {result.taskBreakdown.map((task, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: i % 2 === 1 ? colors.bgTableRowAlt : undefined, borderBottom: i < result.taskBreakdown.length - 1 ? `1px solid ${colors.borderLight}` : 'none', color: colors.textPrimaryLight, fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 500 }}>{translateTaskName(task.task, t)}</span>
                    <span>{task.hours.toFixed(2)} {t('calculator:hours_label')}</span>
                  </div>
                ))}
              </div>
            </div>
            {includeCopings && copingInstallationResults?.taskBreakdown?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.textCool, marginBottom: 6 }}>{t('calculator:coping_installation_calculator_title')} — {t('calculator:task_breakdown_label')}</h4>
                <ul style={{ listStyle: 'disc', paddingLeft: 20, color: colors.textPrimaryLight, fontSize: '0.85rem' }}>
                  {copingInstallationResults.taskBreakdown.map((task: any, i: number) => (
                    <li key={i}><span style={{ fontWeight: 500 }}>{translateTaskName(task.task, t)}:</span> {task.hours.toFixed(2)} {t('calculator:hours_label')}</li>
                  ))}
                </ul>
              </div>
            )}
            {includeTileInstallation && tileInstallationResults?.taskBreakdown?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.textCool, marginBottom: 6 }}>{t('calculator:tile_installation_label')} — {t('calculator:task_breakdown_label')}</h4>
                <div style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, overflow: 'hidden' }}>
                  {tileInstallationResults.taskBreakdown.map((task: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: i % 2 === 1 ? colors.bgTableRowAlt : undefined, borderBottom: i < tileInstallationResults.taskBreakdown.length - 1 ? `1px solid ${colors.borderLight}` : 'none', color: colors.textPrimaryLight, fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 500 }}>{translateTaskName(task.task, t)}</span>
                      <span>{task.hours.toFixed(2)} {t('calculator:hours_label')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.textCool, marginBottom: 6 }}>{type === 'sleeper' ? t('calculator:sleeper_wall_calculator_title_alt') : type === 'block4' ? t('calculator:block4_wall_label') : type === 'block7' ? t('calculator:block7_wall_label') : t('calculator:wall_label')} — {t('calculator:materials_required_label')}</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: colors.bgDeep }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: colors.textCool, fontWeight: 600 }}>{t('calculator:table_material_header')}</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: colors.textCool, fontWeight: 600 }}>{t('calculator:table_quantity_header')}</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: colors.textCool, fontWeight: 600 }}>{t('calculator:table_unit_header')}</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: colors.textCool, fontWeight: 600 }}>{t('calculator:table_price_per_unit_header')}</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: colors.textCool, fontWeight: 600 }}>{t('calculator:table_total_header')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.materials.map((m, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${colors.bgDeepBorder}`, background: i % 2 === 1 ? colors.bgTableRowAlt : undefined }}>
                        <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{translateMaterialName(m.name, t)}</td>
                        <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{Number.isInteger(m.amount) ? String(m.amount) : m.amount.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{translateUnit(m.unit, t)}</td>
                        <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{m.price_per_unit ? `£${m.price_per_unit.toFixed(2)}` : t('calculator:na')}</td>
                        <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{m.total_price ? `£${m.total_price.toFixed(2)}` : t('calculator:na')}</td>
                      </tr>
                    ))}
                    <tr style={{ background: colors.bgDeep, fontWeight: 600 }}>
                      <td colSpan={4} style={{ padding: '8px 12px', textAlign: 'right', color: colors.textPrimaryLight }}>{t('calculator:total_cost_label')}</td>
                      <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{result.materials.reduce((s, m) => s + (m.total_price || 0), 0).toFixed(2) !== '0.00' ? `£${result.materials.reduce((s, m) => s + (m.total_price || 0), 0).toFixed(2)}` : t('calculator:na')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            {includeCopings && copingInstallationResults?.materials?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.textCool, marginBottom: 6 }}>{t('calculator:coping_installation_calculator_title')} — {t('calculator:materials_required_label')}</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: colors.bgDeep }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: colors.textCool, fontWeight: 600 }}>{t('calculator:material_label')}</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: colors.textCool, fontWeight: 600 }}>{t('calculator:quantity_label')}</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: colors.textCool, fontWeight: 600 }}>{t('calculator:unit_label')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {copingInstallationResults.materials.map((m: any, i: number) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${colors.bgDeepBorder}`, background: i % 2 === 1 ? colors.bgTableRowAlt : undefined }}>
                          <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{translateMaterialName(m.name, t)}</td>
                          <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{m.amount?.toFixed?.(2) ?? m.quantity}</td>
                          <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{translateUnit(m.unit, t)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {includeTileInstallation && tileInstallationResults?.materials?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.textCool, marginBottom: 6 }}>{t('calculator:tile_installation_label')} — {t('calculator:materials_required_label')}</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: colors.bgDeep }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: colors.textCool, fontWeight: 600 }}>{t('calculator:material_label')}</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: colors.textCool, fontWeight: 600 }}>{t('calculator:quantity_label')}</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: colors.textCool, fontWeight: 600 }}>{t('calculator:unit_label')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tileInstallationResults.materials.map((m: any, i: number) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${colors.bgDeepBorder}`, background: i % 2 === 1 ? colors.bgTableRowAlt : undefined }}>
                          <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{translateMaterialName(m.name, t)}</td>
                          <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{m.amount?.toFixed?.(2) ?? m.quantity}</td>
                          <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{translateUnit(m.unit, t)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const chipBtn = (active: boolean, onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: `${spacing.md}px ${spacing["5xl"]}px`,
        borderRadius: radii.lg,
        border: 'none',
        background: active ? colors.accentBlue : colors.bgCardInner,
        color: active ? colors.textOnAccent : colors.textMuted,
        fontWeight: fontWeights.semibold,
        fontSize: fontSizes.base,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }}>
      {type === 'sleeper' ? (
        <div style={{ display: 'flex', gap: spacing.md, marginBottom: spacing["5xl"] }}>
          {chipBtn(postMethod === 'concrete', () => setPostMethod('concrete'), t('calculator:input_concrete_in_posts'))}
          {chipBtn(postMethod === 'direct', () => setPostMethod('direct'), t('calculator:input_drive_posts_directly'))}
        </div>
      ) : type === 'brick' && !isDoubleWall ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginBottom: spacing["5xl"] }}>
          <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap' }}>
            {chipBtn(brickBond === 'header', () => setBrickBond('header'), t('calculator:brick_bond_stretcher'))}
            {chipBtn(brickBond === 'stretcher', () => setBrickBond('stretcher'), t('calculator:brick_bond_header'))}
          </div>
        </div>
      ) : type === 'brick' && isDoubleWall ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["5xl"], marginBottom: spacing["5xl"] }}>
          <div style={{ paddingBottom: spacing[4], borderBottom: `1px solid ${colors.borderDefault}` }}>
            <SelectDropdown
              label={t('calculator:wall_layer1_material_label')}
              value={outerWallType}
              onChange={(v) => setOuterWallType(v as 'brick' | 'block4' | 'block7')}
              options={[
                { value: 'brick', label: t('calculator:inner_wall_option_brick') },
                { value: 'block4', label: t('calculator:inner_wall_option_block4') },
                { value: 'block7', label: t('calculator:inner_wall_option_block7') },
              ]}
            />
            {outerWallType === 'brick' && (
              <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap', marginTop: spacing.md }}>
                {chipBtn(outerBrickBond === 'header', () => setOuterBrickBond('header'), t('calculator:brick_bond_stretcher'))}
                {chipBtn(outerBrickBond === 'stretcher', () => setOuterBrickBond('stretcher'), t('calculator:brick_bond_header'))}
              </div>
            )}
            {(outerWallType === 'block4' || outerWallType === 'block7') && (
              <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap', marginTop: spacing.md }}>
                {chipBtn(outerLayingMethod === 'standing', () => setOuterLayingMethod('standing'), t('calculator:standing_label'))}
                {chipBtn(outerLayingMethod === 'flat', () => setOuterLayingMethod('flat'), t('calculator:flat_label'))}
              </div>
            )}
          </div>
          <div>
            <SelectDropdown
              label={t('calculator:wall_layer2_material_label')}
              value={innerWallType}
              onChange={(v) => setInnerWallType(v as 'brick' | 'block4' | 'block7')}
              options={[
                { value: 'brick', label: t('calculator:inner_wall_option_brick') },
                { value: 'block4', label: t('calculator:inner_wall_option_block4') },
                { value: 'block7', label: t('calculator:inner_wall_option_block7') },
              ]}
            />
            {innerWallType === 'brick' && (
              <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap', marginTop: spacing.md }}>
                {chipBtn(innerBrickBond === 'header', () => setInnerBrickBond('header'), t('calculator:brick_bond_stretcher'))}
                {chipBtn(innerBrickBond === 'stretcher', () => setInnerBrickBond('stretcher'), t('calculator:brick_bond_header'))}
              </div>
            )}
            {(innerWallType === 'block4' || innerWallType === 'block7') && (
              <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap', marginTop: spacing.md }}>
                {chipBtn(innerLayingMethod === 'standing', () => setInnerLayingMethod('standing'), t('calculator:standing_label'))}
                {chipBtn(innerLayingMethod === 'flat', () => setInnerLayingMethod('flat'), t('calculator:flat_label'))}
              </div>
            )}
          </div>
        </div>
      ) : (type === 'block4' || type === 'block7') ? (
        <div style={{ display: 'flex', gap: spacing.md }}>
          {chipBtn(layingMethod === 'standing', () => setLayingMethod('standing'), t('calculator:standing_label'))}
          {chipBtn(layingMethod === 'flat', () => setLayingMethod('flat'), t('calculator:flat_label'))}
        </div>
      ) : null}
      {type === 'sleeper' && !canvasMode ? (
        <>
          <div>
            <label style={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.textMuted, marginBottom: spacing.sm, display: 'block' }}>{t('calculator:wall_configuration_label')}</label>
            <div style={{ display: 'flex', background: colors.bgCardInner, borderRadius: radii.lg, border: `1px solid ${colors.borderDefault}`, padding: 3, gap: 3 }}>
              <button
                type="button"
                disabled={segmentSingleLocked}
                onClick={() => !segmentSingleLocked && setWallConfigModeWithSync('single')}
                title={segmentSingleLocked ? t('calculator:remove_segments_single') : undefined}
                style={{
                  flex: 1, padding: `${spacing.lg}px ${spacing.xl}px`, borderRadius: radii.lg, border: 'none',
                  background: wallConfigMode === 'single' ? colors.accentBlueBg : 'transparent',
                  color: segmentSingleLocked ? colors.textDisabled : (wallConfigMode === 'single' ? colors.accentBlue : colors.textDim), fontWeight: fontWeights.semibold, fontSize: fontSizes.md, cursor: segmentSingleLocked ? 'not-allowed' : 'pointer', opacity: segmentSingleLocked ? 0.5 : 1,
                }}
              >
                {t('calculator:single_wall_label')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (segmentLengthsFromSaved.length === 0 && manualSegmentLengths.length === 0) {
                    enterSleeperStandaloneSegmentsMode();
                  } else {
                    setWallConfigMode('segments');
                  }
                }}
                style={{
                  flex: 1, padding: `${spacing.lg}px ${spacing.xl}px`, borderRadius: radii.lg, border: 'none',
                  background: wallConfigMode === 'segments' ? colors.accentBlueBg : 'transparent',
                  color: wallConfigMode === 'segments' ? colors.accentBlue : colors.textDim, fontWeight: fontWeights.semibold, fontSize: fontSizes.sm, cursor: 'pointer',
                }}
              >
                {t('calculator:segments_label')}
                {segmentLengths.length > 1 ? <span style={{ marginLeft: 6 }}>({segmentLengths.length})</span> : null}
              </button>
            </div>
            <div style={{ fontSize: fontSizes.sm, color: colors.textDim, marginTop: spacing.md }}>
              {wallConfigMode === 'single' ? t('calculator:wall_config_single_desc') : t('calculator:wall_config_segments_desc')}
            </div>
          </div>

          {wallConfigMode === 'single' ? (
            <>
              <TextInput label={t('calculator:wall_length_label')} value={length} onChange={setLength} placeholder="0" unit="m" />
              <TextInput label={t('calculator:wall_height_label')} value={height} onChange={setHeight} placeholder="0" unit="m" />
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.md, alignItems: 'center' }}>
                <span style={{ fontSize: fontSizes.sm, color: colors.textMuted }}>
                  {t('calculator:total_length_label')}: <strong style={{ color: colors.textPrimary }}>{segmentLengths.reduce((a, b) => a + b, 0).toFixed(3)} m</strong>
                </span>
                {segmentLengthsFromSaved.length === 0 && (
                  <>
                    <button
                      type="button"
                      onClick={addManualSleeperSegment}
                      style={{ padding: '6px 12px', borderRadius: radii.md, border: `1px solid ${colors.borderDefault}`, background: colors.bgCardInner, color: colors.textSecondary, fontSize: fontSizes.sm, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {t('calculator:add_segment')}
                    </button>
                    <button
                      type="button"
                      onClick={removeManualSleeperSegment}
                      disabled={manualSegmentLengths.length <= 2}
                      style={{ padding: '6px 12px', borderRadius: radii.md, border: `1px solid ${colors.borderDefault}`, background: colors.bgCardInner, color: colors.textSecondary, fontSize: fontSizes.sm, fontWeight: 600, cursor: manualSegmentLengths.length <= 2 ? 'not-allowed' : 'pointer', opacity: manualSegmentLengths.length <= 2 ? 0.5 : 1 }}
                    >
                      {t('calculator:remove_segment')}
                    </button>
                  </>
                )}
              </div>
              <div style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr', padding: `${spacing.md}px ${spacing.xl}px`, borderBottom: `1px solid ${colors.borderLight}`, fontSize: fontSizes.xs, fontWeight: 600, color: colors.textDim, textTransform: 'uppercase' }}>
                  <span>#</span>
                  <span>{t('calculator:length_label')}</span>
                  <span style={{ textAlign: 'center' }}>{t('calculator:segment_start_h')}</span>
                  <span style={{ textAlign: 'center' }}>{t('calculator:segment_end_h')}</span>
                </div>
                {segmentLengths.map((segLen, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 1fr 1fr 1fr',
                      alignItems: 'center',
                      padding: `${spacing.md}px ${spacing.xl}px`,
                      borderBottom: idx < segmentLengths.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
                      background: idx % 2 === 1 ? colors.bgTableRowAlt : undefined,
                    }}
                  >
                    <span style={{ fontWeight: fontWeights.semibold, color: colors.textDim }}>{idx + 1}</span>
                    <div>
                      {segmentLengthsFromSaved.length === 0 ? (
                        <input
                          type="number"
                          min={0.01}
                          step={0.01}
                          value={manualSegmentLengths[idx] ?? segLen}
                          onChange={(e) => updateManualSegmentLength(idx, parseFloat(e.target.value) || 0.01)}
                          style={{ width: '100%', maxWidth: 120, padding: '6px 10px', borderRadius: radii.md, border: `1px solid ${colors.borderInput}`, fontSize: fontSizes.sm }}
                        />
                      ) : (
                        <span style={{ fontWeight: fontWeights.semibold, color: colors.textSecondary }}>{segLen.toFixed(2)} m</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={segmentHeights[idx]?.startH ?? defH}
                        onChange={(e) => updateSegmentHeight(idx, 'startH', parseFloat(e.target.value) || 0)}
                        style={{ width: '100%', maxWidth: 100, padding: '6px 8px', borderRadius: radii.md, border: `1px solid ${colors.borderInput}`, fontSize: fontSizes.sm, textAlign: 'center' }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={segmentHeights[idx]?.endH ?? defH}
                        onChange={(e) => updateSegmentHeight(idx, 'endH', parseFloat(e.target.value) || 0)}
                        style={{ width: '100%', maxWidth: 100, padding: '6px 8px', borderRadius: radii.md, border: `1px solid ${colors.borderInput}`, fontSize: fontSizes.sm, textAlign: 'center' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <TextInput label={t('calculator:wall_length_label')} value={length} onChange={setLength} placeholder="0" unit="m" />
          {isDoubleWall && segmentLengths.length > 0 ? (
            <TextInput label={t('calculator:double_wall_default_height_label')} value={height} onChange={setHeight} placeholder="1" unit="m" />
          ) : (
            <TextInput label={t('calculator:wall_height_label')} value={height} onChange={setHeight} placeholder="0" unit="m" />
          )}

          {/* Wall segments (przełamania) — imported / canvas; not used for sleeper standalone (dedicated UI above) */}
          {segmentLengths.length > 0 && !(type === 'sleeper' && !canvasMode) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: colors.textSegment }}>{t('calculator:wall_segments_label')}</div>
              {segmentLengths.map((segLen, idx) => (
                <div key={idx} style={{ padding: '10px 12px', background: colors.bgOverlay, border: `1px solid ${colors.borderSegment}`, borderRadius: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: colors.textSegment, marginBottom: 8 }}>
                    {t('calculator:wall_segment_n', { n: idx + 1 })}
                    <span style={{ color: colors.teal, marginLeft: 8 }}>{segLen.toFixed(2)} m</span>
                  </div>
                  {isDoubleWall ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSegment, marginBottom: 6, lineHeight: 1.3 }}>{doubleWallOuterCaption}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: colors.textSegmentLabel, marginBottom: 2 }}>{t('calculator:double_wall_outer_start_h')}</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={segmentHeights[idx]?.outerStartH ?? defH}
                              onChange={(e) => updateSegmentHeight(idx, 'outerStartH', parseFloat(e.target.value) || 0)}
                              style={{ width: '100%', padding: '6px 10px', background: colors.bgSegmentInput, border: `1px solid ${colors.borderSegment}`, borderRadius: 6, color: colors.textSegment, fontSize: 13, outline: 'none' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: colors.textSegmentLabel, marginBottom: 2 }}>{t('calculator:double_wall_outer_end_h')}</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={segmentHeights[idx]?.outerEndH ?? segmentHeights[idx]?.endH ?? defH}
                              onChange={(e) => updateSegmentHeight(idx, 'outerEndH', parseFloat(e.target.value) || 0)}
                              style={{ width: '100%', padding: '6px 10px', background: colors.bgSegmentInput, border: `1px solid ${colors.borderSegment}`, borderRadius: 6, color: colors.textSegment, fontSize: 13, outline: 'none' }}
                            />
                          </div>
                        </div>
                      </div>
                      <div style={{ borderTop: `1px dashed ${colors.borderSegment}`, paddingTop: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSegment, marginBottom: 6, lineHeight: 1.3 }}>{doubleWallInnerCaption}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: colors.textSegmentLabel, marginBottom: 2 }}>{t('calculator:double_wall_inner_start_h')}</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={segmentHeights[idx]?.innerStartH ?? defH}
                              onChange={(e) => updateSegmentHeight(idx, 'innerStartH', parseFloat(e.target.value) || 0)}
                              style={{ width: '100%', padding: '6px 10px', background: colors.bgSegmentInput, border: `1px solid ${colors.borderSegment}`, borderRadius: 6, color: colors.textSegment, fontSize: 13, outline: 'none' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: colors.textSegmentLabel, marginBottom: 2 }}>{t('calculator:double_wall_inner_end_h')}</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={segmentHeights[idx]?.innerEndH ?? defH}
                              onChange={(e) => updateSegmentHeight(idx, 'innerEndH', parseFloat(e.target.value) || 0)}
                              style={{ width: '100%', padding: '6px 10px', background: colors.bgSegmentInput, border: `1px solid ${colors.borderSegment}`, borderRadius: 6, color: colors.textSegment, fontSize: 13, outline: 'none' }}
                            />
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: colors.textSegmentLabel, lineHeight: 1.35 }}>{t('calculator:segment_zero_removes_leaf_hint')}</div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: colors.textSegmentLabel, marginBottom: 2 }}>{t('calculator:segment_start_h')}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={segmentHeights[idx]?.startH ?? defH}
                          onChange={(e) => updateSegmentHeight(idx, 'startH', parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '6px 10px', background: colors.bgSegmentInput, border: `1px solid ${colors.borderSegment}`, borderRadius: 6, color: colors.textSegment, fontSize: 13, outline: 'none' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: colors.textSegmentLabel, marginBottom: 2 }}>{t('calculator:segment_end_h')}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={segmentHeights[idx]?.endH ?? defH}
                          onChange={(e) => updateSegmentHeight(idx, 'endH', parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '6px 10px', background: colors.bgSegmentInput, border: `1px solid ${colors.borderSegment}`, borderRadius: 6, color: colors.textSegment, fontSize: 13, outline: 'none' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      
      {/* Foundation Calculator Tickbox - Only show for brick, block4, block7 */}
      {type !== 'sleeper' && (
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={includeFoundation}
            onChange={(e) => setIncludeFoundation(e.target.checked)}
            style={{ accentColor: colors.accentBlue }}
          />
          <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>{t('calculator:include_foundation')}</span>
        </label>
      )}

      {/* Foundation Calculator Inputs - Only show if tickbox is checked */}
      {includeFoundation && type !== 'sleeper' && (
        <div className="space-y-4">
          <h3 style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textMuted }}>{t('calculator:foundation_details_label')}</h3>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:input_length_m')}</label>
              <input
                type="number"
                value={foundationLength}
                onChange={(e) => setFoundationLength(e.target.value)}
                className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderInput }}
                placeholder={t('calculator:placeholder_enter_length_m')}
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:input_width_m')}</label>
              <input
                type="number"
                value={foundationWidth}
                onChange={(e) => setFoundationWidth(e.target.value)}
                className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderInput }}
                placeholder={t('calculator:placeholder_enter_width')}
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:input_depth_in_cm')}</label>
              <input
                type="number"
                value={foundationDepthCm}
                onChange={(e) => setFoundationDepthCm(e.target.value)}
                className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderInput }}
                placeholder={t('calculator:placeholder_enter_depth_cm')}
                min="0"
                step="1"
              />
            </div>
          </div>

          {/* Digging method & soil type — hidden when in project mode (from Project Card Equipment) */}
          {!isInProjectCreating && (
          <>
          <div>
            <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:digging_method')}</label>
            <select
              value={foundationDiggingMethod}
              onChange={(e) => setFoundationDiggingMethod(e.target.value as any)}
              className="mt-1 block w-full rounded-md shadow-sm"
              style={{ borderColor: colors.borderInput }}
            >
              <option value="shovel">{t('calculator:excavator_shovel')}</option>
              <option value="small">{t('calculator:excavator_small')}</option>
              <option value="medium">{t('calculator:excavator_medium')}</option>
              <option value="large">{t('calculator:excavator_large')}</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:soil_type')}</label>
            <select
              value={foundationSoilType}
              onChange={(e) => setFoundationSoilType(e.target.value as any)}
              className="mt-1 block w-full rounded-md shadow-sm"
              style={{ borderColor: colors.borderInput }}
            >
              <option value="clay">{t('calculator:soil_type_clay')}</option>
              <option value="sand">{t('calculator:soil_type_sand')}</option>
              <option value="rock">{t('calculator:soil_type_rock')}</option>
            </select>
          </div>
          </>
          )}
        </div>
      )}
      
      {!isInProjectCreating && (
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={calculateTransport}
            onChange={(e) => setCalculateTransport(e.target.checked)}
            style={{ accentColor: colors.accentBlue }}
          />
          <span style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:calculate_transport_time_label')}</span>
        </label>
      )}

      {/* Transport Carrier Selection */}
      {!isInProjectCreating && calculateTransport && (
        <div>
          <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.lg }}>{t('calculator:transport_carrier_label')}</label>
          <div className="space-y-2">
            <div 
              style={{ display: 'flex', alignItems: 'center', padding: spacing['2xl'], cursor: 'pointer', border: `2px dashed ${colors.borderDefault}`, borderRadius: radii.md }}
              onClick={() => setSelectedTransportCarrier(null)}
            >
              <div className="w-4 h-4 rounded-full border mr-2" style={{ borderColor: colors.borderDefault }}>
                <div className="w-2 h-2 rounded-full m-0.5" style={{ background: selectedTransportCarrier === null ? colors.borderDefault : 'transparent' }}></div>
              </div>
              <div>
                <span style={{ color: colors.textPrimary }}>{t('calculator:default_wheelbarrow')}</span>
              </div>
            </div>
            {carriers.length > 0 && carriers.map((carrier) => (
              <div 
                key={carrier.id}
                className="flex items-center p-2 cursor-pointer"
                onClick={() => setSelectedTransportCarrier(carrier)}
              >
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.textSubtle}`, marginRight: spacing['2xl'] }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', margin: 2, background: selectedTransportCarrier?.id === carrier.id ? colors.textSubtle : 'transparent' }}></div>
                </div>
                <div>
                  <span style={{ color: colors.textPrimary }}>{carrier.name}</span>
                  <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing['2xl'] }}>({carrier["size (in tones)"]} tons)</span>
                </div>
              </div>
            ))}
            </div>

            <div className="mb-4">
              <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing['2xl'] }}>{t('calculator:transport_distance_label')}</label>
              <input
                type="number"
                value={transportDistance}
                onChange={(e) => setTransportDistance(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder={t('calculator:placeholder_enter_transport_distance')}
                min="0"
                step="1"
              />
            </div>
          </div>
        )}
      
      <Button variant="primary" fullWidth onClick={calculate}>
        {t('calculator:calculate_button')}
      </Button>
      {result && (
        <div style={{ marginTop: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }} ref={resultsRef}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
            <p style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>
              {t('calculator:total_rows')}: <span style={{ fontWeight: fontWeights.bold, color: colors.textPrimary }}>{Math.ceil(result.rows)}</span>{' '}
              <span style={{ fontSize: fontSizes.xs, color: colors.accentBlue, fontWeight: fontWeights.semibold }}>({t('calculator:rounded_up_from', { val: result.rows.toFixed(2) })})</span>
            </p>
            <p style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>
              {t('calculator:rounded_up_height')} <span style={{ fontWeight: fontWeights.bold, color: colors.textPrimary }}>{result.roundedUpHeight} m</span>
            </p>
          </div>

          <Card style={{ background: gradients.blueCard, border: `1px solid ${colors.accentBlueBorder}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.lg }}>
              <span style={{ fontSize: fontSizes.md, color: colors.textSubtle, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>
                {t('calculator:total_labor_hours_label')}
              </span>
              <span style={{ fontSize: fontSizes["4xl"], fontWeight: fontWeights.extrabold, color: colors.accentBlue, fontFamily: fonts.display }}>
                {result.totalHours.toFixed(2)}
              </span>
              <span style={{ fontSize: fontSizes.md, color: colors.accentBlue, fontFamily: fonts.body, fontWeight: fontWeights.medium }}>
                {t('calculator:hours_abbreviation')}
              </span>
            </div>
          </Card>

          <Card>
            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display, letterSpacing: '0.3px', marginBottom: spacing["2xl"] }}>
              {t('calculator:task_breakdown_label')}
            </h3>
            <div style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, overflow: 'hidden' }}>
              {result.taskBreakdown.map((task, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${spacing.lg}px ${spacing["2xl"]}px`,
                    background: index % 2 === 1 ? colors.bgTableRowAlt : undefined,
                    borderBottom: index < result.taskBreakdown.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
                  }}
                >
                  <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>
                    {translateTaskName(task.task, t)}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
                    <span style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display }}>
                      {task.hours.toFixed(2)}
                    </span>
                    <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>{t('calculator:hours_label')}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <DataTable
            columns={[
              { key: 'name', label: t('calculator:table_material_header'), width: '2fr' },
              { key: 'quantity', label: t('calculator:table_quantity_header'), width: '1fr' },
              { key: 'unit', label: t('calculator:table_unit_header'), width: '1fr' },
              { key: 'price', label: t('calculator:table_price_per_unit_header'), width: '1fr' },
              { key: 'total', label: t('calculator:table_total_header'), width: '1fr' },
            ]}
            rows={result.materials.map((m) => ({
              name: <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateMaterialName(m.name, t)}</span>,
              quantity: <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{m.amount.toFixed(2)}</span>,
              unit: <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>{translateUnit(m.unit, t)}</span>,
              price: <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{m.price_per_unit ? `£${m.price_per_unit.toFixed(2)}` : 'N/A'}</span>,
              total: <span style={{ fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: colors.textSecondary }}>{m.total_price ? `£${m.total_price.toFixed(2)}` : 'N/A'}</span>,
            }))}
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: spacing.md }}>
                <span style={{ fontSize: fontSizes.base, color: colors.textSubtle, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>
                  {t('calculator:total_cost_colon')}
                </span>
                <span style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.extrabold, color: colors.textPrimary, fontFamily: fonts.display }}>
                  {result.materials.reduce((sum, m) => sum + (m.total_price || 0), 0).toFixed(2) !== '0.00'
                    ? `£${result.materials.reduce((sum, m) => sum + (m.total_price || 0), 0).toFixed(2)}`
                    : t('calculator:not_available')}
                </span>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
};

export default WallCalculator;
