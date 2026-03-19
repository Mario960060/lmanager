import React, { useState, useEffect, useRef } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { colors, fontSizes, fontWeights, spacing, radii } from '../../themes/designTokens';
import { Button, Checkbox, TextInput } from '../../themes/uiComponents';

interface TaskTemplate {
  id: string;
  name: string;
  unit: string;
  estimated_hours: number;
}

interface CopingInstallationCalculatorProps {
  onResultsChange?: (results: any) => void;
  isInProjectCreating?: boolean;
  calculateTransport?: boolean;
  setCalculateTransport?: (value: boolean) => void;
  selectedTransportCarrier?: any;
  setSelectedTransportCarrier?: (value: any) => void;
  transportDistance?: string;
  setTransportDistance?: (value: string) => void;
  carriers?: any[];
  selectedExcavator?: any;
  /** From wall segments on canvas — length and corners auto-filled from wall */
  fromWallSegments?: boolean;
  initialSegmentLengths?: number[];
  initialCornerCount?: number;
  /** Canvas Object Card dark UI */
  canvasMode?: boolean;
  /** When Wall Calculate is clicked, parent increments this to trigger calc */
  calculateTrigger?: number;
  /** Controlled inputs when embedded in WallCalculator (from parent state) */
  slabLength?: string;
  slabWidth?: string;
  selectedGap?: number;
  adhesiveThickness?: string;
  apply45DegreeCut?: boolean;
  selectedGroutingId?: string;
  onSlabLengthChange?: (v: string) => void;
  onSlabWidthChange?: (v: string) => void;
  onSelectedGapChange?: (v: number) => void;
  onAdhesiveThicknessChange?: (v: string) => void;
  onApply45DegreeCutChange?: (v: boolean) => void;
  onSelectedGroutingIdChange?: (v: string) => void;
}

interface Material {
  id?: string;
  name: string;
  description?: string | null;
  amount: number;
  unit: string;
  price?: number | null;
  price_per_unit: number | null;
  total_price: number | null;
  created_at?: string;
}

interface DiggingEquipment {
  id: string;
  name: string;
  'size (in tones)': number | null;
  company_id?: string | null;
  created_at?: string;
  description?: string | null;
  in_use_quantity?: number;
  quantity?: number;
  speed_m_per_hour?: number | null;
  status?: string;
  type?: string;
  updated_at?: string;
}

const GAP_OPTIONS = [2, 3, 4, 5];

const CopingInstallationCalculator: React.FC<CopingInstallationCalculatorProps> = ({
  onResultsChange,
  isInProjectCreating = false,
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  setSelectedTransportCarrier: propSetSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  setTransportDistance: propSetTransportDistance,
  carriers: propCarriers = [],
  fromWallSegments = false,
  initialSegmentLengths,
  initialCornerCount,
  canvasMode = false,
  calculateTrigger = 0,
  slabLength: propSlabLength,
  slabWidth: propSlabWidth,
  selectedGap: propSelectedGap,
  adhesiveThickness: propAdhesiveThickness,
  apply45DegreeCut: propApply45DegreeCut,
  selectedGroutingId: propSelectedGroutingId,
  onSlabLengthChange,
  onSlabWidthChange,
  onSelectedGapChange,
  onAdhesiveThicknessChange,
  onApply45DegreeCutChange,
  onSelectedGroutingIdChange,
}: CopingInstallationCalculatorProps) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const [wallLength, setWallLength] = useState<string>('');
  const [slabLength, setSlabLength] = useState<string>(propSlabLength ?? '90');
  const [slabWidth, setSlabWidth] = useState<string>(propSlabWidth ?? '60');
  const [selectedGap, setSelectedGap] = useState<number>(propSelectedGap ?? GAP_OPTIONS[0]);
  const [adhesiveThickness, setAdhesiveThickness] = useState<string>(propAdhesiveThickness ?? '0.5');
  const [amountOfCorners, setAmountOfCorners] = useState<string>('2');
  const [apply45DegreeCut, setApply45DegreeCut] = useState<boolean>(propApply45DegreeCut ?? false);
  const [selectedGroutingId, setSelectedGroutingId] = useState<string>(propSelectedGroutingId ?? '');

  const slabLengthVal = fromWallSegments && propSlabLength != null ? propSlabLength : slabLength;
  const slabWidthVal = fromWallSegments && propSlabWidth != null ? propSlabWidth : slabWidth;
  const selectedGapVal = fromWallSegments && propSelectedGap != null ? propSelectedGap : selectedGap;
  const adhesiveThicknessVal = fromWallSegments && propAdhesiveThickness != null ? propAdhesiveThickness : adhesiveThickness;
  const apply45DegreeCutVal = fromWallSegments && propApply45DegreeCut != null ? propApply45DegreeCut : apply45DegreeCut;
  const selectedGroutingIdVal = fromWallSegments && propSelectedGroutingId != null ? propSelectedGroutingId : selectedGroutingId;

  const setSlabLengthFn = onSlabLengthChange ?? setSlabLength;
  const setSlabWidthFn = onSlabWidthChange ?? setSlabWidth;
  const setSelectedGapFn = onSelectedGapChange ?? setSelectedGap;
  const setAdhesiveThicknessFn = onAdhesiveThicknessChange ?? setAdhesiveThickness;
  const setApply45DegreeCutFn = onApply45DegreeCutChange ?? setApply45DegreeCut;
  const setSelectedGroutingIdFn = onSelectedGroutingIdChange ?? setSelectedGroutingId;

  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);

  const effectiveCalculateTransport = isInProjectCreating ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSelectedTransportCarrier = isInProjectCreating ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;
  const effectiveTransportDistance = isInProjectCreating && propTransportDistance ? propTransportDistance : transportDistance;

  const [results, setResults] = useState<{
    numberOfSlabs: number;
    totalCuts: number;
    adhesiveNeeded: number;
    taskBreakdown: { task: string; hours: number }[];
    materials: { name: string; amount: number; unit: string; price_per_unit: number | null; total_price: number | null }[];
    labor: number;
  } | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

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
        
        // Fetch carriers
        const { data: carrierData, error: carrierError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'barrows_dumpers')
          .eq('company_id', companyId);
        
        if (carrierError) throw carrierError;
        
        setCarriersLocal(carrierData || []);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    
    if (effectiveCalculateTransport) {
      fetchEquipment();
    }
  }, [effectiveCalculateTransport]);

  // Fetch all task templates (for tile installation - same approach as TileInstallationCalculator)
  const { data: taskTemplates = [] }: UseQueryResult<TaskTemplate[]> = useQuery({
    queryKey: ['tile_task_templates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId || '')
        .order('name');
      if (error) throw error;
      return data as TaskTemplate[];
    },
    enabled: !!companyId
  });

  // Fetch cutting tasks (same approach as TileInstallationCalculator)
  const { data: cuttingTasks = [] }: UseQueryResult<TaskTemplate[]> = useQuery({
    queryKey: ['cutting_tile_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId || '')
        .or('name.ilike.%cutting%,name.ilike.%cut%')
        .order('name');
      if (error) throw error;
      return data as TaskTemplate[];
    },
    enabled: !!companyId
  });

  // Fetch adhesive material from materials table
  const { data: materialsTable = [] }: UseQueryResult<Material[]> = useQuery({
    queryKey: ['materials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, description, unit, price, created_at')
        .order('name');
      if (error) throw error;
      return data as Material[];
    }
  });

  // Fetch grouting methods (tasks with 'grouting' in the name)
  const { data: groutingMethods = [], isLoading: isLoadingGrouting } = useQuery({
    queryKey: ['grouting_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .ilike('name', '%grouting%')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

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

  const calculateResults = () => {
    const slabLengthCm = parseFloat(slabLengthVal);
    const slabWidthCm = parseFloat(slabWidthVal);
    if (!slabLengthCm || !slabWidthCm) return;

    const gapCm = selectedGapVal / 10;

    let numberOfSlabs: number;
    let wallLengthCm: number;

    if (fromWallSegments && initialSegmentLengths && initialSegmentLengths.length > 0) {
      // Per-segment: ceil(segmentLength / (slabLength + gap)) then sum
      numberOfSlabs = initialSegmentLengths.reduce((sum, segLenM) => {
        const segLenCm = segLenM * 100;
        const slabsForSeg = Math.ceil(segLenCm / (slabLengthCm + gapCm));
        return sum + slabsForSeg;
      }, 0);
      wallLengthCm = initialSegmentLengths.reduce((a, b) => a + b, 0) * 100;
    } else {
      if (!wallLength) return;
      wallLengthCm = parseFloat(wallLength) * 100;
      // ceil: enough slabs to cover the length (1 full + docinek = 2 slabs)
      numberOfSlabs = Math.ceil(wallLengthCm / (slabLengthCm + gapCm));
    }

    // Calculate corner cuts: from wall segments or manual input
    const corners = fromWallSegments && initialCornerCount != null ? initialCornerCount : (parseInt(amountOfCorners) || 2);
    const cutsPerCorner = apply45DegreeCutVal ? 2 : 1;
    const totalCuts = corners * cutsPerCorner;

    // Calculate adhesive needed and wall area in m²
    const wallArea = (wallLengthCm * slabWidthCm) / 10000; // Convert to m²
    const adhesiveThicknessNum = parseFloat(adhesiveThickness) || 0.5;
    const adhesiveConsumption = adhesiveThicknessNum * 12; // kg/m² (12 kg per cm)
    const adhesiveNeeded = wallArea * adhesiveConsumption;

    // Find adhesive in materials table
    const adhesiveMaterial = materialsTable.find((m: Material) => m.name.toLowerCase().includes('adhesive'));
    let materials: { name: string; amount: number; unit: string; price_per_unit: number | null; total_price: number | null }[] = [];
    
    // Add copings as first material (with dimensions in breakdown)
    materials.push({
      name: `Copings (${slabLengthCm} × ${slabWidthCm})`,
      amount: numberOfSlabs,
      unit: 'pieces',
      price_per_unit: null,
      total_price: null
    });
    
    if (adhesiveMaterial) {
      // Calculate number of bags based on the unit size
      const match = adhesiveMaterial.unit.match(/(\d+\.?\d*)\s*kg/i);
      let bagSize = 20; // default to 20 if not found
      if (match) {
        bagSize = parseFloat(match[1]);
      }
      const bagsNeeded = Math.max(1, Math.ceil(adhesiveNeeded / bagSize));
      materials.push({
        name: adhesiveMaterial.name,
        amount: bagsNeeded,
        unit: adhesiveMaterial.unit,
        price_per_unit: adhesiveMaterial.price ?? null,
        total_price: adhesiveMaterial.price ? bagsNeeded * adhesiveMaterial.price : null
      });
    }

    // Prepare task breakdown
    const tileTaskName = `Tile Installation ${slabLengthCm} × ${slabWidthCm}`;

    // Find the template for tile installation (same approach as TileInstallationCalculator)
    let tileTaskTemplate = taskTemplates.find(
      (t: TaskTemplate) => t.name.toLowerCase() === tileTaskName.toLowerCase()
    );
    
    // If exact match not found, try best match approach (similar to StairCalculator)
    if (!tileTaskTemplate) {
      // Extract dimensions from available tasks and find best match
      const dimensionPattern = /(\d+)\s*[×x]\s*(\d+)/;
      const targetLength = slabLengthCm;
      const targetWidth = slabWidthCm;
      
      let bestMatch: TaskTemplate | undefined = undefined;
      let bestScore = -1;
      
      for (const t of taskTemplates) {
        const lowerName = t.name.toLowerCase();
        if (lowerName.includes('tile') && lowerName.includes('installation')) {
          const dimensionMatch = t.name.match(dimensionPattern);
          if (dimensionMatch) {
            const dim1 = parseInt(dimensionMatch[1]);
            const dim2 = parseInt(dimensionMatch[2]);
            
            // Calculate score - prioritize length match, then width
            let score = 0;
            if (dim1 === targetLength && dim2 === targetWidth) {
              score = 100; // Perfect match
            } else if (dim1 === targetLength) {
              score = 50; // Length matches
            } else if (dim2 === targetWidth) {
              score = 30; // Width matches
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = t;
            }
          }
        }
      }
      
      if (bestMatch) {
        tileTaskTemplate = bestMatch;
      }
    }
    
    const tileTaskTime = tileTaskTemplate?.estimated_hours ?? 0.5;

    // Find the template for cutting (same approach as TileInstallationCalculator)
    const cuttingTaskTemplate = cuttingTasks.find(
      (t: TaskTemplate) => t.name.toLowerCase() === 'cutting porcelain'
    );
    const cuttingTaskTime = cuttingTaskTemplate?.estimated_hours ?? 0.5;

    const copingTaskTotal = numberOfSlabs * tileTaskTime;
    const cuttingTaskTotal = totalCuts * cuttingTaskTime;

    const taskBreakdown = [
      {
        task: `Tile Installation ${slabLengthCm} × ${slabWidthCm}`,
        hours: copingTaskTotal,
        amount: `${numberOfSlabs} pieces`,
        unit: 'pieces'
      },
      {
        task: `cutting coping`,
        hours: cuttingTaskTotal,
        amount: `${totalCuts} pieces`,
        unit: 'pieces'
      }
    ];

    // Add grouting method if selected
    if (selectedGroutingIdVal) {
      const groutingTask = groutingMethods.find((g: any) => g.id.toString() === selectedGroutingIdVal);
      if (groutingTask && groutingTask.estimated_hours !== undefined && groutingTask.estimated_hours !== null) {
        let groutingHours = groutingTask.estimated_hours;
        const unitLower = groutingTask.unit ? groutingTask.unit.toLowerCase() : '';
        if (unitLower === 'm2' || unitLower === 'square meters') {
          groutingHours = wallArea * groutingTask.estimated_hours;
        }
        taskBreakdown.push({
          task: groutingTask.name || 'Grouting',
          hours: groutingHours,
          amount: `${wallArea.toFixed(2)} square meters`,
          unit: 'square meters'
        });
      }
    }

    // Calculate material transport times if "Calculate transport time" is checked
    let copingTransportTime = 0;
    let adhesiveTransportTime = 0;

    if (effectiveCalculateTransport) {
      let carrierSizeForTransport = 0.125;
      
      if (effectiveSelectedTransportCarrier) {
        carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
      }

      // Calculate coping transport
      if (numberOfSlabs > 0) {
        const copingResult = calculateMaterialTransportTime(numberOfSlabs, carrierSizeForTransport, 'slabs', parseFloat(effectiveTransportDistance) || 30);
        copingTransportTime = copingResult.totalTransportTime;
      }

      // Calculate adhesive transport
      const match = adhesiveMaterial?.unit.match(/(\d+\.?\d*)\s*kg/i);
      let bagSize = 20;
      if (match) {
        bagSize = parseFloat(match[1]);
      }
      const bagsNeeded = Math.max(1, Math.ceil(adhesiveNeeded / bagSize));
      if (bagsNeeded > 0) {
        const adhesiveResult = calculateMaterialTransportTime(bagsNeeded, carrierSizeForTransport, 'cement', parseFloat(effectiveTransportDistance) || 30);
        adhesiveTransportTime = adhesiveResult.totalTransportTime;
      }

      // Add transport tasks
      if (copingTransportTime > 0) {
        taskBreakdown.push({
          task: 'transport coping',
          hours: copingTransportTime,
          amount: `${numberOfSlabs} pieces`,
          unit: 'pieces'
        });
      }

      if (adhesiveTransportTime > 0) {
        taskBreakdown.push({
          task: 'transport adhesive',
          hours: adhesiveTransportTime,
          amount: `${bagsNeeded} bags`,
          unit: 'bags'
        });
      }
    }

    const totalTransportTime = copingTransportTime + adhesiveTransportTime;
    
    const newResults = {
      numberOfSlabs,
      totalCuts,
      adhesiveNeeded,
      taskBreakdown,
      materials,
      labor: copingTaskTotal + cuttingTaskTotal + totalTransportTime
    };

    // Prepare formatted results for parent/modal
    const formattedResults = {
      ...newResults,
      materials: materials.map(material => ({
        name: material.name,
        quantity: material.amount,
        unit: material.unit
      }))
    };

    setResults(newResults);
    if (onResultsChange) {
      onResultsChange(formattedResults);
    }
  };

  // Auto-calculate when Wall Calculate is clicked (fromWallSegments + canvas mode)
  useEffect(() => {
    if (fromWallSegments && (canvasMode || isInProjectCreating) && calculateTrigger > 0 && initialSegmentLengths && initialSegmentLengths.length > 0) {
      calculateResults();
    }
  }, [calculateTrigger, fromWallSegments, canvasMode, isInProjectCreating, initialSegmentLengths?.length]);

  // Scroll to results when they appear
  useEffect(() => {
    if (results && resultsRef.current) {
      setTimeout(() => {
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer && resultsRef.current) {
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [results]);

  const inputStyle = canvasMode
    ? { width: '100%', padding: '6px 10px', background: colors.bgInputDark, border: `1px solid ${colors.borderInputDark}`, borderRadius: radii.md, color: colors.textPrimaryLight, fontSize: 13 } as React.CSSProperties
    : undefined;
  const inputStyleDefault = !canvasMode ? { marginTop: spacing.sm, display: 'block', width: '100%', borderRadius: radii.md, border: `1px solid ${colors.borderDefault}`, background: colors.bgInput, color: colors.textPrimary, padding: '8px 12px', outline: 'none' } as React.CSSProperties : undefined;
  const labelStyleDefault = !canvasMode ? { display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted } as React.CSSProperties : undefined;
  const labelStyle = canvasMode ? { display: 'block', fontSize: '0.7rem', color: colors.textLabel, marginBottom: 2 } as React.CSSProperties : undefined;

  return (
    <div className={canvasMode ? "space-y-4" : "space-y-6"}>
      {!canvasMode && <h2 style={{ fontSize: fontSizes['2xl'], fontWeight: fontWeights.bold, color: colors.textPrimary, marginBottom: spacing['4xl'] }}>{t('calculator:coping_installation_calculator_title')}</h2>}
      
      {!fromWallSegments && (
        <div>
          <label style={labelStyle ?? labelStyleDefault}>{t('calculator:wall_length_label')}</label>
          <input
            type="number"
            value={wallLength}
            onChange={(e) => setWallLength(e.target.value)}
            style={inputStyle ?? inputStyleDefault}
            placeholder={t('calculator:enter_wall_length')}
            step="0.01"
          />
        </div>
      )}

      <div>
        <label style={labelStyle ?? labelStyleDefault}>{t('calculator:slab_length_cm_label')}</label>
        <select
          value={slabLengthVal}
          onChange={(e) => setSlabLengthFn(e.target.value)}
          style={inputStyle ?? inputStyleDefault}
        >
          <option value="120">120 cm</option>
          <option value="90">90 cm</option>
          <option value="80">80 cm</option>
          <option value="60">60 cm</option>
          <option value="40">40 cm</option>
          <option value="30">30 cm</option>
        </select>
      </div>

      <div>
        <label style={labelStyle ?? labelStyleDefault}>{t('calculator:slab_width_cm_label')}</label>
        <select
          value={slabWidthVal}
          onChange={(e) => setSlabWidthFn(e.target.value)}
          style={inputStyle ?? inputStyleDefault}
        >
          <option value="120">120 cm</option>
          <option value="90">90 cm</option>
          <option value="80">80 cm</option>
          <option value="60">60 cm</option>
          <option value="40">40 cm</option>
          <option value="30">30 cm</option>
          <option value="20">20 cm</option>
          <option value="15">15 cm</option>
        </select>
      </div>

      <div>
        <label style={labelStyle ?? labelStyleDefault}>{t('calculator:gaps_mm_label')}</label>
        <select
          value={selectedGapVal}
          onChange={(e) => setSelectedGapFn(Number(e.target.value))}
          style={inputStyle ?? inputStyleDefault}
        >
          {GAP_OPTIONS.map((gap) => (
            <option key={gap} value={gap}>
              {gap}mm
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle ?? labelStyleDefault}>{t('calculator:adhesive_thickness_label')}</label>
        <input
          type="number"
          value={adhesiveThicknessVal}
          onChange={(e) => setAdhesiveThicknessFn(e.target.value)}
          style={inputStyle ?? inputStyleDefault}
          placeholder="cm"
          min="0"
          step="0.1"
        />
        {!canvasMode && (
          <p style={{ fontSize: fontSizes.xs, color: colors.textDim, marginTop: spacing.sm }}>
            Consumption: {((parseFloat(adhesiveThicknessVal) || 0.5) * 12).toFixed(1)} kg/m²
          </p>
        )}
      </div>

      {!fromWallSegments && (
        <div>
          <label style={labelStyle ?? labelStyleDefault}>{t('calculator:amount_of_corners_label')}</label>
          <input
            type="number"
            value={amountOfCorners}
            onChange={(e) => setAmountOfCorners(e.target.value)}
            style={inputStyle ?? inputStyleDefault}
            placeholder={t('calculator:enter_amount_of_corners')}
            min="0"
            step="1"
          />
        </div>
      )}

      <label className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={apply45DegreeCutVal}
          onChange={(e) => setApply45DegreeCutFn(e.target.checked)}
          style={canvasMode ? { accentColor: colors.green } : { accentColor: colors.accentBlue }}
        />
        <span style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: canvasMode ? colors.textPrimaryLight : colors.textMuted }}>{t('calculator:degree_cut_corners')}</span>
      </label>

      <div>
        <label style={labelStyle ?? labelStyleDefault}>{t('calculator:grouting_method_label')}</label>
        <select
          value={selectedGroutingIdVal}
          onChange={e => setSelectedGroutingIdFn(e.target.value)}
          style={inputStyle ?? inputStyleDefault}
          disabled={isLoadingGrouting}
        >
          <option value="">{t('calculator:select_grouting_method_placeholder')}</option>
          {groutingMethods.map((method: any) => (
            <option key={method.id} value={method.id}>{translateTaskName(method.name, t)}</option>
          ))}
        </select>
        {isLoadingGrouting && <p style={{ fontSize: fontSizes.sm, color: colors.textDim, marginTop: spacing.sm }}>{t('calculator:loading_grouting_methods')}</p>}
        <p style={{ fontSize: fontSizes.xs, color: colors.red, marginTop: spacing.sm }}>{t('calculator:grouting_method_note')}</p>
      </div>

      {!isInProjectCreating && !fromWallSegments && (
        <Checkbox label={t('calculator:calculate_transport_time_label')} checked={calculateTransport} onChange={setCalculateTransport} />
      )}

      {!isInProjectCreating && !fromWallSegments && calculateTransport && (
        <>
          <div>
            <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.lg }}>{t('calculator:transport_carrier')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              <div
                style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing["2xl"]}px`, cursor: 'pointer', borderRadius: radii.lg, background: !selectedTransportCarrier ? colors.bgHover : 'transparent', border: `1px solid ${!selectedTransportCarrier ? colors.accentBlueBorder : colors.borderLight}` }}
                onClick={() => setSelectedTransportCarrier(null)}
              >
                <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${!selectedTransportCarrier ? colors.accentBlue : colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {!selectedTransportCarrier && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
                </div>
                <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{t('calculator:default_wheelbarrow')}</span>
              </div>
              {carriers && carriers.length > 0 && carriers.map((carrier) => (
                <div
                  key={carrier.id}
                  style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing["2xl"]}px`, cursor: 'pointer', borderRadius: radii.lg, background: selectedTransportCarrier?.id === carrier.id ? colors.bgHover : 'transparent', border: `1px solid ${selectedTransportCarrier?.id === carrier.id ? colors.accentBlueBorder : colors.borderLight}` }}
                  onClick={() => setSelectedTransportCarrier(carrier)}
                >
                  <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${selectedTransportCarrier?.id === carrier.id ? colors.accentBlue : colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selectedTransportCarrier?.id === carrier.id && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
                  </div>
                  <div>
                    <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{carrier.name}</span>
                    <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing.md }}>({carrier["size (in tones)"]} tons)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <TextInput
            label={t('calculator:transport_distance_label')}
            value={transportDistance}
            onChange={setTransportDistance}
            placeholder={t('calculator:placeholder_enter_transport_distance')}
            unit="m"
            helperText={t('calculator:set_to_zero_no_transport')}
          />
        </>
      )}

      {!fromWallSegments && (
        <div className="flex justify-center">
          <Button variant="accent" color={colors.accentBlue} onClick={calculateResults}>
            {t('calculator:calculate_button')}
          </Button>
        </div>
      )}

      {results && !fromWallSegments && (
        <div className="mt-6 space-y-4" ref={resultsRef}>
          {/* Estimated Time Breakdown */}
          <div className="bg-transparent p-0">
            <div className="text-lg font-semibold mb-1">
              <span style={{ color: colors.textMuted }}>{t('calculator:total_labor_hours')}</span>
              <span style={{ color: colors.accentBlue, fontSize: fontSizes['2xl'], verticalAlign: 'middle', fontWeight: fontWeights.bold }}> {(results.labor).toFixed(2)} {t('calculator:hours_label')}</span>
            </div>
            <div style={{ fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.sm }}>{t('calculator:task_breakdown')}:</div>
            <div style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, overflow: 'hidden' }}>
              {results.taskBreakdown.map((task, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.lg}px ${spacing['4xl']}px`, background: index % 2 === 1 ? colors.bgTableRowAlt : undefined, borderBottom: index < results.taskBreakdown.length - 1 ? `1px solid ${colors.borderLight}` : 'none' }}>
                  <span style={{ color: colors.textPrimary, fontSize: fontSizes.sm, fontWeight: fontWeights.medium }}>{translateTaskName(task.task, t)}</span>
                  <span style={{ color: colors.textSecondary, fontSize: fontSizes.sm }}>{task.hours.toFixed(2)} {t('calculator:hours_label')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Materials Breakdown Table */}
          <div style={{ background: colors.bgCard, padding: spacing['4xl'], borderRadius: radii.lg }}>
            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginBottom: spacing['4xl'] }}>{t('calculator:materials_breakdown_label')}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: '100%', borderCollapse: 'collapse', borderBottom: `1px solid ${colors.borderDefault}` }}>
                <thead style={{ background: colors.bgCard }}>
                  <tr>
                    <th scope="col" style={{ padding: '12px 24px', textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textDim, textTransform: 'uppercase' }}>Material</th>
                    <th scope="col" style={{ padding: '12px 24px', textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textDim, textTransform: 'uppercase' }}>Quantity</th>
                    <th scope="col" style={{ padding: '12px 24px', textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textDim, textTransform: 'uppercase' }}>Unit</th>
                  </tr>
                </thead>
                <tbody style={{ background: colors.bgInput }}>
                  {results.materials.map((material, idx) => (
                    <tr key={idx} style={{ borderTop: `1px solid ${colors.borderDefault}`, background: idx % 2 === 1 ? colors.bgTableRowAlt : undefined }}>
                      <td style={{ padding: '16px 24px', whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>{translateMaterialName(material.name, t)}</td>
                      <td style={{ padding: '16px 24px', whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>{material.amount}</td>
                      <td style={{ padding: '16px 24px', whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>{translateUnit(material.unit, t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CopingInstallationCalculator;
