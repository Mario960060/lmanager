import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Info, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
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
}) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const [layingMethod, setLayingMethod] = useState<'flat' | 'standing'>('standing');
  const [postMethod, setPostMethod] = useState<'concrete' | 'direct'>('concrete');
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

  const segmentLengths: number[] = savedInputs?.segmentLengths ?? [];
  const defH = parseFloat(height) || 1;
  const [wallConfigMode, setWallConfigMode] = useState<'single' | 'segments'>(
    segmentLengths.length > 1 ? 'segments' : 'single'
  );
  const [segmentHeights, setSegmentHeights] = useState<Array<{ startH: number; endH: number }>>(() => {
    const existing = savedInputs?.segmentHeights as Array<{ startH: number; endH: number }> | undefined;
    if (existing && existing.length === segmentLengths.length) return existing.map(s => ({ ...s }));
    return segmentLengths.map(() => ({ startH: defH, endH: defH }));
  });

  useEffect(() => {
    if (segmentLengths.length > 1) setWallConfigMode('segments');
  }, [segmentLengths.length]);

  useEffect(() => {
    const segLens = savedInputs?.segmentLengths ?? [];
    const existing = savedInputs?.segmentHeights as Array<{ startH: number; endH: number }> | undefined;
    const h = parseFloat(height) || 1;
    const next = existing && existing.length === segLens.length
      ? existing.map(s => ({ ...s }))
      : segLens.length > 0
        ? segLens.map(() => ({ startH: h, endH: h }))
        : null;
    if (next) setSegmentHeights(next);
  }, [savedInputs?.segmentLengths, savedInputs?.segmentHeights, height]);

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
    if (savedInputs?.copingSlabLength != null) setCopingSlabLength(String(savedInputs.copingSlabLength));
    if (savedInputs?.copingSlabWidth != null) setCopingSlabWidth(String(savedInputs.copingSlabWidth));
    if (savedInputs?.copingGap != null) setCopingGap(Number(savedInputs.copingGap));
    if (savedInputs?.copingAdhesiveThickness != null) setCopingAdhesiveThickness(String(savedInputs.copingAdhesiveThickness));
    if (savedInputs?.coping45Cut != null) setCoping45Cut(Boolean(savedInputs.coping45Cut));
    if (savedInputs?.copingGroutingId != null) setCopingGroutingId(String(savedInputs.copingGroutingId));
  }, [savedInputs?.copingSlabLength, savedInputs?.copingSlabWidth, savedInputs?.copingGap, savedInputs?.copingAdhesiveThickness, savedInputs?.coping45Cut, savedInputs?.copingGroutingId]);

  const updateSegmentHeight = (idx: number, field: 'startH' | 'endH', value: number) => {
    setSegmentHeights(prev => {
      const next = [...prev];
      if (!next[idx]) next[idx] = { startH: defH, endH: defH };
      next[idx] = { ...next[idx], [field]: Math.max(0, value) };
      return next;
    });
  };

  const setAllHeights = (h: number) => {
    setSegmentHeights(segmentLengths.map(() => ({ startH: h, endH: h })));
  };

  const setWallConfigModeWithSync = (mode: 'single' | 'segments') => {
    setWallConfigMode(mode);
    if (mode === 'single' && segmentHeights.length > 0) {
      setHeight(String(segmentHeights[0]?.startH ?? defH));
    }
  };

  const totalLengthCanvas = canvasLength ?? (segmentLengths.length > 0 ? segmentLengths.reduce((a, b) => a + b, 0) : parseFloat(length) || 0);

  const lastInputsSentRef = useRef<string>('');
  useEffect(() => {
    if (!onInputsChange || !isInProjectCreating) return;
    const inputs: Record<string, any> = { length, height, layingMethod, postMethod, includeFoundation, foundationLength, foundationWidth, foundationDepthCm, foundationDiggingMethod: effectiveFoundationDiggingMethod, foundationSoilType: effectiveFoundationSoilType };
    if (canvasMode && wallConfigMode === 'single') {
      const h = parseFloat(height) || 1;
      inputs.segmentLengths = [totalLengthCanvas];
      inputs.segmentHeights = [{ startH: h, endH: h }];
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
  }, [length, height, layingMethod, postMethod, includeFoundation, foundationLength, foundationWidth, foundationDepthCm, foundationDiggingMethod, foundationSoilType, segmentHeights, segmentLengths, segmentTileSides, frontFacesTiled, wallTileSlabThicknessCm, wallTileAdhesiveThicknessCm, wallConfigMode, canvasMode, totalLengthCanvas, onInputsChange, isInProjectCreating, type, includeCopings, includeTileInstallation, copingSlabLength, copingSlabWidth, copingGap, copingAdhesiveThickness, coping45Cut, copingGroutingId]);

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

  // Fetch task templates for wall building
  const { data: taskTemplates = [], isLoading } = useQuery({
    queryKey: ['wall_tasks', type, layingMethod, companyId],
    queryFn: async () => {
      let query = supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId);

      // Add specific filters based on wall type
      if (type === 'brick') {
        query = query.ilike('name', '%bricklaying%');
      } else if (type === 'block4') {
        // More specific queries for block types
        if (layingMethod === 'standing') {
          query = query.ilike('name', '%4-inch block%standing%');
        } else {
          query = query.ilike('name', '%4-inch block%flat%');
        }
      } else if (type === 'block7') {
        if (layingMethod === 'standing') {
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
    const carrierSpeed = carrierSpeedData?.speed || 4000;
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
    let segHeightsRaw: Array<{ startH: number; endH: number }> | undefined;
    if (canvasMode && wallConfigMode === 'single') {
      segLengths = [totalLengthCanvas];
      const singleH = parseFloat(height) || 1;
      segHeightsRaw = [{ startH: singleH, endH: singleH }];
    } else {
      segLengths = savedInputs?.segmentLengths ?? [l];
      const useLocalHeights = segmentHeights.length === segLengths.length;
      segHeightsRaw = useLocalHeights ? segmentHeights : (savedInputs?.segmentHeights as Array<{ startH: number; endH: number }> | undefined);
    }
    const hasValidSegmentHeights = segHeightsRaw && segHeightsRaw.length === segLengths.length;

    const hasValidLength = !isNaN(l) || (canvasMode && totalLengthCanvas > 0);
    if (!hasValidLength) return;
    if (!hasValidSegmentHeights && isNaN(h)) return;

    const segHeights: Array<{ startH: number; endH: number }> = hasValidSegmentHeights
      ? segHeightsRaw!
      : segLengths.map(() => ({ startH: defH, endH: defH }));

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
    const brickLength = 0.215; // Brick length in meters (21.5 cm)
    const mortarThickness = 0.01; // Mortar thickness in meters
    const totalRowHeight = brickHeight + mortarThickness;

    let blockHeight = 0.22; // Default block height
    let blockWidth = 0;
    let blockLength = 0.44; // Block length in meters

    if (type === 'block4') {
      blockWidth = 0.10;
    } else if (type === 'block7') {
      blockWidth = 0.14;
    }
    
    if (type === 'block4' || type === 'block7') {
      if (layingMethod === 'flat') {
        blockHeight = blockWidth;
      }
    }

    const calcSegmentUnits = (segLen: number, avgH: number): { units: number; mortarVolume: number } => {
      let segUnits = 0;
      let segMortar = 0;
      switch (type) {
        case 'brick': {
          const brickRows = Math.ceil(avgH / (brickHeight + mortarThickness));
          const bricksPerRow = Math.ceil(segLen / (brickLength + mortarThickness));
          segUnits = brickRows * bricksPerRow;
          segMortar = segUnits * 0.000269;
          break;
        }
        case 'block4': {
          const blockRows4 = Math.ceil(avgH / (blockHeight + mortarThickness));
          const blocksPerRow4 = Math.ceil(segLen / (blockLength + mortarThickness));
          segUnits = blockRows4 * blocksPerRow4;
          segMortar = segUnits * (layingMethod === 'flat' ? 0.001452 : 0.000871);
          break;
        }
        case 'block7': {
          const blockRows7 = Math.ceil(avgH / (blockHeight + mortarThickness));
          const blocksPerRow7 = Math.ceil(segLen / (blockLength + mortarThickness));
          segUnits = blockRows7 * blocksPerRow7;
          segMortar = segUnits * (layingMethod === 'flat' ? 0.001531 : 0.001109);
          break;
        }
        default:
          break;
      }
      return { units: segUnits, mortarVolume: segMortar };
    };

    for (let i = 0; i < segHeights.length; i++) {
      const segLen = segLengths[i] ?? l / segHeights.length;
      const avgH = (segHeights[i].startH + segHeights[i].endH) / 2;
      area += segLen * avgH;
      const seg = calcSegmentUnits(segLen, avgH);
      units += seg.units;
      mortarVolume += seg.mortarVolume;
    }

    if (type === 'sleeper') {
        // Calculate sleepers needed
        const sleeperLength = 2.4; // 2400mm = 2.4m
        const sleeperHeight = 0.2; // 200mm = 0.2m
        
        // Calculate sleepers per row and number of rows
        const sleepersPerRow = Math.ceil(l / sleeperLength);
        const numberOfRows = Math.ceil(h / sleeperHeight);
        units = sleepersPerRow * numberOfRows;
        
        // Calculate posts needed (1 at start + 2 for each sleeper in first row)
        const postsNeeded = 1 + (sleepersPerRow * 2);
        
        // Calculate actual height after rounding up rows
        const roundedUpHeight = numberOfRows * sleeperHeight;
        
        // Prepare task breakdown
        const taskBreakdown = [];
        
        // Add first layer task
        const firstLayerTask = taskTemplates.find(t => 
          t.name.toLowerCase().includes('sleeper wall') && 
          t.name.toLowerCase().includes('1st layer')
        );
        if (firstLayerTask) {
          taskBreakdown.push({
            task: firstLayerTask.name,
            hours: firstLayerTask.estimated_hours * sleepersPerRow,
            amount: sleepersPerRow,
            unit: 'sleepers'
          });
        }
        
        // Add additional layers task
        if (numberOfRows > 1) {
          const regularLayerTask = taskTemplates.find(t => {
            const name = t.name.toLowerCase();
            // Look for "building a sleeper wall (on top of 1st layer)" or similar
            // Match by looking for "(on top" in the name
            return name.includes('sleeper wall') && name.includes('on top');
          });
          if (regularLayerTask) {
            const additionalSleepers = units - sleepersPerRow;
            taskBreakdown.push({
              task: regularLayerTask.name,
              hours: regularLayerTask.estimated_hours * additionalSleepers,
              amount: additionalSleepers,
              unit: 'sleepers'
            });
          }
        }
        
        // Add post-related tasks
        if (postMethod === 'concrete') {
          const diggingTask = taskTemplates.find(t => 
            t.name.toLowerCase().includes('digging holes')
          );
          if (diggingTask) {
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
        if (settingPostsTask) {
          taskBreakdown.push({
            task: settingPostsTask.name,
            hours: settingPostsTask.estimated_hours * postsNeeded,
            amount: postsNeeded,
            unit: 'posts'
          });
        }
        
        // Calculate total hours
        const totalHours = taskBreakdown.reduce((sum, task) => sum + task.hours, 0);

        // Add transport tasks if enabled
        if (effectiveCalculateTransport) {
          let carrierSizeForTransport = 0.125;
          
          if (effectiveSelectedTransportCarrier) {
            carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
          }

          // Calculate sleepers transport - on foot, 1 per trip
          if (units > 0) {
            const sleepersPerTrip = 1;
            const sleeperTrips = Math.ceil(units / sleepersPerTrip);
            const sleeperCarrySpeed = 1500; // m/h for foot carrying
            const sleeperTimePerTrip = (parseFloat(effectiveTransportDistance) || 30) * 2 / sleeperCarrySpeed;
            const sleeperTransportTime = sleeperTrips * sleeperTimePerTrip;
            
            if (sleeperTransportTime > 0) {
              taskBreakdown.push({
                task: 'transport sleepers',
                hours: sleeperTransportTime,
                amount: units,
                unit: 'sleepers'
              });
            }
          }

          // Calculate posts transport - on foot, 1 per trip
          if (postsNeeded > 0) {
            const postsPerTrip = 1;
            const postTrips = Math.ceil(postsNeeded / postsPerTrip);
            const postCarrySpeed = 1500; // m/h for foot carrying
            const postTimePerTrip = (parseFloat(effectiveTransportDistance) || 30) * 2 / postCarrySpeed;
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

          // Calculate postmix transport - bags via carrier
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

        // Recalculate total hours with transport
        const finalTotalHours = taskBreakdown.reduce((sum, task) => sum + task.hours, 0);
        
        // Prepare materials list with hardcoded names
        const materials: Material[] = [
          { name: 'Sleepers', amount: units, unit: 'sleepers', price_per_unit: null, total_price: null },
          { name: 'Post', amount: postsNeeded, unit: 'posts', price_per_unit: null, total_price: null }
        ];

        // Add concrete if needed
        if (postMethod === 'concrete') {
          materials.push({ 
            name: 'Postmix', 
            amount: postsNeeded * 2, 
            unit: 'bags', 
            price_per_unit: null, 
            total_price: null 
          });
        }

        // Fetch material prices
        const materialsWithPrices = await fetchMaterialPrices(materials);
        
        // Set the result
        setResult({
          units,
          cementBags: 0,
          sandVolume: 0,
          sandTonnes: 0,
          rows: numberOfRows,
          roundedDownHeight: h,
          roundedUpHeight,
          totalHours: finalTotalHours,
          taskBreakdown,
          materials: materialsWithPrices
        });
        
        // Notify parent component of results
        if (onResultsChange) {
          onResultsChange({
            name: 'Sleeper Wall',
            totalHours: finalTotalHours,
            taskBreakdown,
            materials,
            labor: finalTotalHours
          });
        }
        
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

      // Calculate brick/block transport
      let materialType = 'bricks';
      if (type === 'block4' || type === 'block7') {
        materialType = 'blocks';
      }
      
      if (units > 0) {
        const unitResult = calculateMaterialTransportTime(units, carrierSizeForTransport, materialType, transportDistanceMeters);
        if (type === 'brick') {
          brickTransportTime = unitResult.totalTransportTime;
          normalizedBrickTransportTime = unitResult.normalizedTransportTime;
        } else {
          blockTransportTime = unitResult.totalTransportTime;
          normalizedBlockTransportTime = unitResult.normalizedTransportTime;
        }
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
    const rows = effectiveH / (blockHeight + mortarThickness);
    const roundedDownHeight = Math.floor(rows) * (blockHeight + mortarThickness);
    const roundedUpHeight = Math.ceil(rows) * (blockHeight + mortarThickness);

    // Calculate time estimates
    let totalHours = 0;
    const taskBreakdown: { task: string; hours: number; normalizedHours?: number }[] = [];

    if (taskTemplates && taskTemplates.length > 0) {
      let relevantTask;

      if (type === 'brick') {
        relevantTask = taskTemplates[0]; // Bricklaying task
      } else {
        // Improved task selection for blocks with better matching
        const blockType = type === 'block4' ? '4-inch' : '7-inch';
        
        // First try to find an exact match
        relevantTask = taskTemplates.find(task => 
          task.name.toLowerCase().includes(blockType.toLowerCase()) && 
          task.name.toLowerCase().includes(layingMethod.toLowerCase())
        );
        
        // If no exact match, try just the block type
        if (!relevantTask && taskTemplates.length > 0) {
          relevantTask = taskTemplates.find(task => 
            task.name.toLowerCase().includes(blockType.toLowerCase())
          );
        }
        
        // Last resort: just use the first task in the list
        if (!relevantTask && taskTemplates.length > 0) {
          relevantTask = taskTemplates[0];
        }
      }


      if (relevantTask && relevantTask.estimated_hours) {
        const taskHours = units * relevantTask.estimated_hours;
        totalHours = taskHours;
        taskBreakdown.push({
          task: relevantTask.name,
          hours: taskHours
        });

        // Add transport tasks if applicable
        if (effectiveCalculateTransport && (type === 'brick' && brickTransportTime > 0)) {
          taskBreakdown.push({
            task: 'transport bricks',
            hours: brickTransportTime,
            normalizedHours: normalizedBrickTransportTime
          });
        } else if (effectiveCalculateTransport && ((type === 'block4' || type === 'block7') && blockTransportTime > 0)) {
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

    // Add specific materials based on wall type
    if (type === 'brick') {
      materials.push({ name: 'Bricks', amount: units, unit: 'pieces', price_per_unit: null, total_price: null });
    } else {
      const blockType = type === 'block4' ? '4-inch blocks' : '7-inch blocks';
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
      materials: materialsWithPrices
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
        name: `${type === 'brick' ? 'Brick' : type === 'block4' ? '4-inch Block' : '7-inch Block'} Wall`,
        amount: result.units,
        unit: 'pieces',
        hours_worked: totalHours,
        includeFoundation,
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
  }, [result, type, layingMethod, onResultsChange, includeFoundation, effectiveFoundationDiggingMethod, canvasMode, includeCopings, includeTileInstallation, segmentTileSides, frontFacesTiled, segmentLengths, segmentHeights, defH, tileInstallationResults, copingInstallationResults, wallTileSlabThicknessCm, wallTileAdhesiveThicknessCm]);

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
  if (canvasMode && isInProjectCreating && type !== 'sleeper') {
    const totalLen = totalLengthCanvas;
    const segs = wallConfigMode === 'segments' ? segmentLengths : [totalLen];
    const heights = wallConfigMode === 'segments' ? segmentHeights : [{ startH: parseFloat(height) || 1, endH: parseFloat(height) || 1 }];
    const totalArea = segs.reduce((sum, len, i) => {
      const sh = heights[i];
      const avgH = sh ? (sh.startH + sh.endH) / 2 : parseFloat(height) || 1;
      return sum + len * avgH;
    }, 0);
    const allHeights = heights.flatMap(h => [h.startH, h.endH]);
    const uniformH = allHeights.length > 0 && allHeights.every(v => v === allHeights[0]);
    const displayHeight = uniformH && allHeights[0] > 0 ? allHeights[0] : null;

    return (
      <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
        {/* Info banner */}
        <div style={{ background: colors.tealBg, border: `1px solid ${colors.tealBorder}`, borderRadius: radii.md, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: fontSizes.base, color: colors.textCool }}>
          <Info size={14} style={{ color: colors.teal, flexShrink: 0 }} />
          <span>{t('calculator:from_canvas_length')} <strong style={{ color: colors.textPrimaryLight, fontWeight: 600 }}>{totalLen.toFixed(3)} m</strong></span>
        </div>

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

        <div style={{ height: 1, background: colors.bgDeepBorder, margin: '16px 0' }} />

        {/* Wall configuration toggle */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.textWarm, marginBottom: 6, display: 'block' }}>{t('calculator:wall_configuration_label')}</label>
          <div style={{ display: 'flex', background: colors.bgDeep, borderRadius: 8, border: `1px solid ${colors.bgDeepBorder}`, padding: 3, gap: 3 }}>
            <button
              type="button"
              disabled={segmentLengths.length > 1}
              onClick={() => segmentLengths.length <= 1 && setWallConfigModeWithSync('single')}
              title={segmentLengths.length > 1 ? t('calculator:remove_segments_single') : undefined}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 6, border: 'none', background: wallConfigMode === 'single' ? colors.greenBg : 'transparent',
                color: segmentLengths.length > 1 ? colors.textDisabled : (wallConfigMode === 'single' ? colors.green : colors.textLabel), fontWeight: 600, fontSize: '0.82rem', cursor: segmentLengths.length > 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: segmentLengths.length > 1 ? 0.5 : 1
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x={3} y={8} width={18} height={8} rx={1} /></svg>
              {t('calculator:single_wall_label')}
            </button>
            <button
              type="button"
              onClick={() => setWallConfigMode('segments')}
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
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.textWarm, marginBottom: 6, display: 'block' }}>{t('calculator:wall_length_m')}</label>
              <input type="text" readOnly value={totalLen.toFixed(3)} style={{ width: '100%', padding: '8px 12px', background: colors.bgInputDarkAlpha, border: `1px solid ${colors.borderInputDark}`, borderRadius: 8, color: colors.textCool, fontSize: '0.85rem', cursor: 'default' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.textWarm, marginBottom: 6, display: 'block' }}>{t('calculator:wall_height_m')}</label>
              <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} step={0.1} min={0.1} style={{ width: '100%', padding: '8px 12px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: 8, color: colors.textPrimaryLight, fontSize: '0.85rem', outline: 'none' }} />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.68rem', color: colors.textLabel, fontWeight: 600 }}>{t('calculator:set_all_label')}</span>
              {[0.6, 1.0, 1.2, 1.5, 1.8, 2.0].map(h => (
                <button key={h} type="button" onClick={() => setAllHeights(h)} style={{ padding: '3px 10px', borderRadius: 12, border: `1px solid ${colors.borderInputDark}`, background: 'transparent', color: colors.textLabel, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', fontWeight: 500, cursor: 'pointer' }}>
                  {h === 1 || h === 2 ? `${h}.0m` : `${h}m`}
                </button>
              ))}
            </div>
            <div style={{ background: colors.bgDeep, border: `1px solid ${colors.bgDeepBorder}`, borderRadius: 12, overflow: 'hidden', marginTop: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr 100px 100px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel, padding: '0 12px', textTransform: 'uppercase' }}>#</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel, padding: '0 12px', textTransform: 'uppercase' }}>{t('calculator:length_label')}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel, padding: '0 12px', textTransform: 'uppercase', textAlign: 'center' }}>{t('calculator:segment_start_h')}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel, padding: '0 12px', textTransform: 'uppercase', textAlign: 'center' }}>{t('calculator:segment_end_h')}</span>
              </div>
              {segmentLengths.map((segLen, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '46px 1fr 100px 100px', alignItems: 'center', padding: 0, borderBottom: idx < segmentLengths.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: idx % 2 === 1 ? 'rgba(255,255,255,0.022)' : undefined }}>
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
            </div>
          </div>
        )}

        {/* Add foundation - brick, block4, block7 only (not sleeper) */}
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
                          const avgH = ((sh?.startH ?? defH) + (sh?.endH ?? defH)) / 2;
                          segs.push({ length: segmentLengths[i], height: avgH });
                        }
                        if (frontFacesTiled[0]) {
                          const h0 = segmentHeights[0] ? (segmentHeights[0].startH + segmentHeights[0].endH) / 2 : defH;
                          segs.push({ length: frontThicknessM, height: h0 });
                        }
                        if (frontFacesTiled[1]) {
                          const hLast = segmentHeights.length > 0 ? (segmentHeights[segmentHeights.length - 1].startH + segmentHeights[segmentHeights.length - 1].endH) / 2 : defH;
                          segs.push({ length: frontThicknessM, height: hLast });
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

        <button onClick={calculate} style={{ width: '100%', padding: '9px 20px', borderRadius: 8, background: colors.green, color: colors.textOnAccent, fontWeight: 600, fontSize: '0.85rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <Check size={15} />
          {t('calculator:calculate_button')}
        </button>

        {result && (
          <div ref={resultsRef} style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: '0.9rem', color: colors.textPrimaryLight }}>{t('calculator:total_rows')} <strong>{Math.ceil(result.rows)}</strong> <span style={{ fontSize: '0.8rem', color: colors.accentBlue }}>{t('calculator:rounded_up_from', { val: result.rows.toFixed(2) })}</span></p>
              <p style={{ fontSize: '0.9rem', color: colors.textPrimaryLight }}>{t('calculator:rounded_up_height')} <strong>{result.roundedUpHeight} m</strong></p>
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: colors.textPrimaryLight, marginTop: 12 }}>{t('calculator:total_labor_hours_label')} <span style={{ color: colors.green }}>{(result.totalHours + (tileInstallationResults?.labor ?? 0) + (copingInstallationResults?.labor ?? 0)).toFixed(2)} {t('calculator:hours_abbreviation')}</span></h3>
            <div style={{ marginTop: 8 }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.textCool, marginBottom: 6 }}>{type === 'block4' ? t('calculator:block4_wall_label') : type === 'block7' ? t('calculator:block7_wall_label') : t('calculator:wall_label')} — {t('calculator:task_breakdown_label')}</h4>
              <ul style={{ listStyle: 'disc', paddingLeft: 20, color: colors.textPrimaryLight, fontSize: '0.85rem' }}>
                {result.taskBreakdown.map((task, i) => (
                  <li key={i}><span style={{ fontWeight: 500 }}>{translateTaskName(task.task, t)}:</span> {task.hours.toFixed(2)} {t('calculator:hours_label')}</li>
                ))}
              </ul>
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
                <ul style={{ listStyle: 'disc', paddingLeft: 20, color: colors.textPrimaryLight, fontSize: '0.85rem' }}>
                  {tileInstallationResults.taskBreakdown.map((task: any, i: number) => (
                    <li key={i}><span style={{ fontWeight: 500 }}>{translateTaskName(task.task, t)}:</span> {task.hours.toFixed(2)} {t('calculator:hours_label')}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.textCool, marginBottom: 6 }}>{type === 'block4' ? t('calculator:block4_wall_label') : type === 'block7' ? t('calculator:block7_wall_label') : t('calculator:wall_label')} — {t('calculator:materials_required_label')}</h4>
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
                      <tr key={i} style={{ borderBottom: `1px solid ${colors.bgDeepBorder}` }}>
                        <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{translateMaterialName(m.name, t)}</td>
                        <td style={{ padding: '8px 12px', color: colors.textPrimaryLight }}>{m.amount.toFixed(2)}</td>
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
                        <tr key={i} style={{ borderBottom: `1px solid ${colors.bgDeepBorder}` }}>
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
                        <tr key={i} style={{ borderBottom: `1px solid ${colors.bgDeepBorder}` }}>
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
      ) : (
        (type === 'block4' || type === 'block7') && (
          <div style={{ display: 'flex', gap: spacing.md }}>
            {chipBtn(layingMethod === 'standing', () => setLayingMethod('standing'), t('calculator:standing_label'))}
            {chipBtn(layingMethod === 'flat', () => setLayingMethod('flat'), t('calculator:flat_label'))}
          </div>
        )
      )}
      <TextInput label={t('calculator:wall_length_label')} value={length} onChange={setLength} placeholder="0" unit="m" />
      <TextInput label={t('calculator:wall_height_label')} value={height} onChange={setHeight} placeholder="0" unit="m" />

      {/* Wall segments (przełamania) - when segmentLengths from canvas */}
      {segmentLengths.length > 0 && type !== 'sleeper' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: colors.textSegment }}>{t('calculator:wall_segments_label')}</div>
          {segmentLengths.map((segLen, idx) => (
            <div key={idx} style={{ padding: '10px 12px', background: colors.bgOverlay, border: `1px solid ${colors.borderSegment}`, borderRadius: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: colors.textSegment, marginBottom: 8 }}>
                {t('calculator:wall_segment_n', { n: idx + 1 })}
                <span style={{ color: colors.teal, marginLeft: 8 }}>{segLen.toFixed(2)} m</span>
              </div>
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
            </div>
          ))}
        </div>
      )}
      
      {/* Foundation Calculator Tickbox - Only show for brick, block4, block7 */}
      {type !== 'sleeper' && (
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={includeFoundation}
            onChange={(e) => setIncludeFoundation(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">{t('calculator:include_foundation')}</span>
        </label>
      )}

      {/* Foundation Calculator Inputs - Only show if tickbox is checked */}
      {includeFoundation && type !== 'sleeper' && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">{t('calculator:foundation_details_label')}</h3>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('calculator:input_length_m')}</label>
              <input
                type="number"
                value={foundationLength}
                onChange={(e) => setFoundationLength(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('calculator:placeholder_enter_length_m')}
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('calculator:input_width_m')}</label>
              <input
                type="number"
                value={foundationWidth}
                onChange={(e) => setFoundationWidth(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('calculator:placeholder_enter_width')}
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('calculator:input_depth_in_cm')}</label>
              <input
                type="number"
                value={foundationDepthCm}
                onChange={(e) => setFoundationDepthCm(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
            <label className="block text-sm font-medium text-gray-700">{t('calculator:digging_method')}</label>
            <select
              value={foundationDiggingMethod}
              onChange={(e) => setFoundationDiggingMethod(e.target.value as any)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="shovel">{t('calculator:excavator_shovel')}</option>
              <option value="small">{t('calculator:excavator_small')}</option>
              <option value="medium">{t('calculator:excavator_medium')}</option>
              <option value="large">{t('calculator:excavator_large')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t('calculator:soil_type')}</label>
            <select
              value={foundationSoilType}
              onChange={(e) => setFoundationSoilType(e.target.value as any)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">{t('calculator:calculate_transport_time_label')}</span>
        </label>
      )}

      {/* Transport Carrier Selection */}
      {!isInProjectCreating && calculateTransport && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:transport_carrier_label')}</label>
          <div className="space-y-2">
            <div 
              className="flex items-center p-2 cursor-pointer border-2 border-dashed border-gray-300 rounded"
              onClick={() => setSelectedTransportCarrier(null)}
            >
              <div className={`w-4 h-4 rounded-full border mr-2 ${
                selectedTransportCarrier === null 
                  ? 'border-gray-400' 
                  : 'border-gray-400'
              }`}>
                <div className={`w-2 h-2 rounded-full m-0.5 ${
                  selectedTransportCarrier === null 
                    ? 'bg-gray-400' 
                    : 'bg-transparent'
                }`}></div>
              </div>
              <div>
                <span className="text-gray-800">{t('calculator:default_wheelbarrow')}</span>
              </div>
            </div>
            {carriers.length > 0 && carriers.map((carrier) => (
              <div 
                key={carrier.id}
                className="flex items-center p-2 cursor-pointer"
                onClick={() => setSelectedTransportCarrier(carrier)}
              >
                <div className={`w-4 h-4 rounded-full border mr-2 ${
                  selectedTransportCarrier?.id === carrier.id 
                    ? 'border-gray-400' 
                    : 'border-gray-400'
                }`}>
                  <div className={`w-2 h-2 rounded-full m-0.5 ${
                    selectedTransportCarrier?.id === carrier.id 
                      ? 'bg-gray-400' 
                      : 'bg-transparent'
                  }`}></div>
                </div>
                <div>
                  <span className="text-gray-800">{carrier.name}</span>
                  <span className="text-sm text-gray-600 ml-2">({carrier["size (in tones)"]} tons)</span>
                </div>
              </div>
            ))}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:transport_distance_label')}</label>
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
      
      <Button variant="accent" color={colors.accentBlue} onClick={calculate}>
        {t('calculator:calculate_button')}
      </Button>
      {result && (
        <div className="mt-6 space-y-4" ref={resultsRef}>
          <div>
            <div className="mt-2 space-y-2">
              <p>
                Total Rows: <span className="font-bold">{Math.ceil(result.rows)}</span> <span className="text-sm text-blue-600 font-semibold">(Rounded Up from {result.rows.toFixed(2)})</span>
              </p>
              <p>
                Rounded Up Height: <span className="font-bold">{result.roundedUpHeight} m</span>
              </p>
            </div>

            <h3 className="text-lg font-medium mt-4">{t('calculator:total_labor_hours_label')} <span className="text-blue-600">{result.totalHours.toFixed(2)} {t('calculator:hours_abbreviation')}</span></h3>
            
            <div className="mt-2">
              <h4 className="font-medium text-gray-700 mb-2">{t('calculator:task_breakdown_label')}</h4>
              <ul className="space-y-1 pl-5 list-disc">
                {result.taskBreakdown.map((task, index) => (
                  <li key={index} className="text-sm">
                    <span className="font-medium">{translateTaskName(task.task, t)}:</span> {task.hours.toFixed(2)} {t('calculator:hours_label')}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">{t('calculator:materials_required_label')}</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      {t('calculator:table_material_header')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      {t('calculator:table_quantity_header')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      {t('calculator:table_unit_header')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      {t('calculator:table_price_per_unit_header')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      {t('calculator:table_total_header')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {result.materials.map((material, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {translateMaterialName(material.name, t)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {translateUnit(material.unit, t)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.price_per_unit ? `£${material.price_per_unit.toFixed(2)}` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.total_price ? `£${material.total_price.toFixed(2)}` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-700">
                    <td colSpan={4} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white text-right">
                      {t('calculator:total_cost_colon')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-white">
                      {result.materials.reduce((sum, material) => sum + (material.total_price || 0), 0).toFixed(2) !== '0.00' 
                        ? `£${result.materials.reduce((sum, material) => sum + (material.total_price || 0), 0).toFixed(2)}`
                        : 'N/A'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WallCalculator;
