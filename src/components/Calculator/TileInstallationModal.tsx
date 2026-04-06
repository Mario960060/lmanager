import React, { useState, useEffect, useRef } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity, DEFAULT_CARRIER_SPEED_M_PER_H } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { colors, fontSizes, fontWeights, spacing, radii } from '../../themes/designTokens';
import { Button } from '../../themes/uiComponents';

interface TaskTemplate {
  id: string;
  name: string;
  unit: string;
  estimated_hours: number;
}

interface TileInstallationCalculatorProps {
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
}

interface SlabDimension {
  width: number;
  height: number;
  label: string;
}

interface SlabCuttingBreakdown {
  fullSlabs: number;
  cutSlabs: {
    width: number;
    height: number;
    quantity: number;
  }[];
  totalCuts: number;
}

// Add Material interface for fetched materials
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
  'size (in tones)': number;
}

const SLAB_DIMENSIONS: SlabDimension[] = [
  { width: 120, height: 30, label: '120cm x 30cm' },
  { width: 80, height: 80, label: '80cm x 80cm' },
  { width: 90, height: 60, label: '90cm x 60cm' },
  { width: 80, height: 40, label: '80cm x 40cm' },
  { width: 60, height: 60, label: '60cm x 60cm' },
  { width: 60, height: 30, label: '60cm x 30cm' },
  { width: 30, height: 30, label: '30cm x 30cm' },
];

const GAP_OPTIONS = [2, 3, 4, 5, 10, 20];

const WallFinishCalculator: React.FC<TileInstallationCalculatorProps> = ({  
  onResultsChange,
  isInProjectCreating = false,
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  setSelectedTransportCarrier: propSetSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  setTransportDistance: propSetTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator
}: TileInstallationCalculatorProps) => {
  const companyId = useAuthStore(state => state.getCompanyId());
  const { t } = useTranslation(['calculator']);
  const [wallLength, setWallLength] = useState<string>('');
  const [wallHeight, setWallHeight] = useState<string>('');
  const [selectedSlab, setSelectedSlab] = useState<SlabDimension>(SLAB_DIMENSIONS[0]);
  const [slabOrientation, setSlabOrientation] = useState<'long' | 'side'>('long');
  const [selectedGap, setSelectedGap] = useState<number>(GAP_OPTIONS[0]);
  const [lengthCutType, setLengthCutType] = useState<'1cut' | '2cuts'>('1cut');
  const [heightCutType, setHeightCutType] = useState<'1cut' | '2cuts'>('1cut');
  const [adhesiveThickness, setAdhesiveThickness] = useState<string>('0.5');
  const [results, setResults] = useState<{
    totalSlabs: number;
    totalCuts: number;
    adhesiveNeeded: number;
    cuttingBreakdown: SlabCuttingBreakdown;
    taskBreakdown: { task: string; hours: number }[];
    materials: { name: string; amount: number; unit: string; price_per_unit: number | null; total_price: number | null }[];
    labor: number;
  } | null>(null);
  const [slabType, setSlabType] = useState<'porcelain' | 'sandstones'>('porcelain');
  const [selectedGroutingId, setSelectedGroutingId] = useState<string>('');
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  const effectiveCalculateTransport = isInProjectCreating ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSelectedTransportCarrier = isInProjectCreating ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;
  const effectiveTransportDistance = isInProjectCreating && propTransportDistance ? propTransportDistance : transportDistance;

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

  // Fetch all task templates (for tile installation)
  const { data: taskTemplates = [] }: UseQueryResult<TaskTemplate[]> = useQuery({
    queryKey: ['tile_task_templates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data as TaskTemplate[];
    },
    enabled: !!companyId
  });

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

  // Fetch cutting tasks
  const { data: cuttingTasks = [] }: UseQueryResult<TaskTemplate[]> = useQuery({
    queryKey: ['cutting_tile_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
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
        .select('*')
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

  const calculateResults = () => {
    if (!wallLength || !wallHeight) return;

    // Convert meters to centimeters for calculations
    const wallLengthCm = parseFloat(wallLength) * 100;
    const wallHeightCm = parseFloat(wallHeight) * 100;
    const gapCm = selectedGap / 10;

    // Determine slab dimensions based on orientation
    const slabWidth = slabOrientation === 'long' ? selectedSlab.width : selectedSlab.height;
    const slabHeight = slabOrientation === 'long' ? selectedSlab.height : selectedSlab.width;

    // Calculate slabs needed for length and height
    const slabsInLength = Math.floor((wallLengthCm + gapCm) / (slabWidth + gapCm));
    const slabsInHeight = Math.floor((wallHeightCm + gapCm) / (slabHeight + gapCm));

    // Calculate remaining space
    const remainingLength = wallLengthCm - (slabsInLength * slabWidth + (slabsInLength) * gapCm);
    const remainingHeight = wallHeightCm - (slabsInHeight * slabHeight + (slabsInHeight) * gapCm);

    // Initialize arrays for different types of cuts
    const cutSlabs = [];
    let totalCuts = 0;

    // Calculate full-length slabs (not cut at the ends)
    let fullLengthSlabs = slabsInLength;
    let cutLengthPieces = 0;
    let cutLengthPieceWidth = 0;
    if (remainingLength > 0 && lengthCutType === '2cuts') {
      // For each row, (slabsInLength - 1) full-length slabs, 2 cut pieces at ends
      fullLengthSlabs = Math.max(0, slabsInLength - 1);
      cutLengthPieces = 2;
      cutLengthPieceWidth = (slabWidth + remainingLength) / 2;
    }

    // Calculate full-height slabs (not cut at the top/bottom)
    let fullHeightSlabs = slabsInHeight;
    let cutHeightPieces = 0;
    let cutHeightPieceHeight = 0;
    if (remainingHeight > 0 && heightCutType === '2cuts') {
      // For each column, (slabsInHeight - 1) full-height slabs, 2 cut pieces at top/bottom
      fullHeightSlabs = Math.max(0, slabsInHeight - 1);
      cutHeightPieces = 2;
      cutHeightPieceHeight = (slabHeight + remainingHeight) / 2;
    }

    // Calculate full slabs (full length and full height)
    let fullSlabs = fullLengthSlabs * fullHeightSlabs;

    // Add cut slabs for length (ends of each row)
    if (cutLengthPieces > 0) {
      cutSlabs.push({
        width: cutLengthPieceWidth,
        height: slabHeight,
        quantity: cutLengthPieces * fullHeightSlabs
      });
      totalCuts += cutLengthPieces * fullHeightSlabs;
    }

    // Add cut slabs for height (top/bottom of each column)
    if (cutHeightPieces > 0) {
      cutSlabs.push({
        width: slabWidth,
        height: cutHeightPieceHeight,
        quantity: cutHeightPieces * fullLengthSlabs
      });
      totalCuts += cutHeightPieces * fullLengthSlabs;
    }

    // Handle remaining length (1 cut at the end)
    if (remainingLength > 0 && lengthCutType === '1cut') {
      cutSlabs.push({
        width: remainingLength,
        height: slabHeight,
        quantity: fullHeightSlabs
      });
      totalCuts += fullHeightSlabs;
    }

    // Handle remaining height (1 cut at the top)
    if (remainingHeight > 0 && heightCutType === '1cut') {
      cutSlabs.push({
        width: slabWidth,
        height: remainingHeight,
        quantity: fullLengthSlabs
      });
      totalCuts += fullLengthSlabs;
    }

    // Handle corner cuts (where both length and height need cuts)
    if (remainingLength > 0 && remainingHeight > 0) {
      if (lengthCutType === '2cuts' && heightCutType === '2cuts') {
        // Four corner pieces
        cutSlabs.push({
          width: cutLengthPieceWidth,
          height: cutHeightPieceHeight,
          quantity: 4
        });
        totalCuts += 4;
      } else if (lengthCutType === '2cuts' && heightCutType === '1cut') {
        // Two pieces at ends, cut in height
        cutSlabs.push({
          width: cutLengthPieceWidth,
          height: remainingHeight,
          quantity: 2
        });
        totalCuts += 2;
      } else if (lengthCutType === '1cut' && heightCutType === '2cuts') {
        // Two pieces at top/bottom, cut in length
        cutSlabs.push({
          width: remainingLength,
          height: cutHeightPieceHeight,
          quantity: 2
        });
        totalCuts += 2;
      } else if (lengthCutType === '1cut' && heightCutType === '1cut') {
        // One corner piece
        cutSlabs.push({
          width: remainingLength,
          height: remainingHeight,
          quantity: 1
        });
        totalCuts += 1;
      }
    }

    // Add extra cuts for each corner cut
    cutSlabs.forEach(cut => {
      if (
        cut.width !== selectedSlab.width &&
        cut.height !== selectedSlab.height
      ) {
        totalCuts += cut.quantity;
      }
    });

    // Calculate adhesive needed and wall area in m²
    const wallArea = wallLengthCm * wallHeightCm / 10000; // Convert to m²
    const adhesiveThicknessNum = parseFloat(adhesiveThickness) || 0.5;
    const adhesiveConsumption = adhesiveThicknessNum * 12; // kg/m² (12 kg per cm)
    const adhesiveNeeded = wallArea * adhesiveConsumption;

    // Find adhesive in materials table
    const adhesiveMaterial = materialsTable.find((m: Material) => m.name.toLowerCase().includes('adhesive'));
    let materials: { name: string; amount: number; unit: string; price_per_unit: number | null; total_price: number | null }[] = [];
    if (adhesiveMaterial) {
      // Calculate number of bags based on the unit size
      // Try to extract the bag size from the unit string (e.g., '20 kg bag')
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

    const cuttingBreakdown: SlabCuttingBreakdown = {
      fullSlabs,
      cutSlabs,
      totalCuts
    };

    // Prepare task breakdown
    const tileTaskName = `Tile Installation ${selectedSlab.width} × ${selectedSlab.height}`;
    const cuttingTaskName = slabType === 'porcelain' ? 'cutting porcelain' : 'cutting sandstones';

    // Find the template for tile installation
    const tileTaskTemplate = taskTemplates.find(
      (t: TaskTemplate) => t.name.toLowerCase() === tileTaskName.toLowerCase()
    );
    const tileTaskTime = tileTaskTemplate?.estimated_hours ?? 0.5;

    // Find the template for cutting
    const cuttingTaskTemplate = cuttingTasks.find(
      (t: TaskTemplate) => t.name.toLowerCase() === cuttingTaskName.toLowerCase()
    );
    const cuttingTaskTime = cuttingTaskTemplate?.estimated_hours ?? 0.5;

    const tileTaskTotal = wallArea * tileTaskTime;
    const cuttingTaskTotal = totalCuts * cuttingTaskTime;

    const taskBreakdown = [
      {
        task: `Tile Installation ${selectedSlab.width} x ${selectedSlab.height}`,
        hours: tileTaskTotal,
        amount: `${fullSlabs + cutSlabs.reduce((sum, cut) => sum + cut.quantity, 0)} pieces`,
        unit: 'pieces'
      },
      {
        task: `cutting ${slabType}`,
        hours: cuttingTaskTotal,
        amount: `${totalCuts} pieces`,
        unit: 'pieces'
      }
    ];

    // Add grouting method if selected
    if (selectedGroutingId) {
      const groutingTask = groutingMethods.find((g: any) => g.id.toString() === selectedGroutingId);
      if (groutingTask && groutingTask.estimated_hours !== undefined) {
        let groutingHours = groutingTask.estimated_hours;
        const unitLower = groutingTask.unit ? groutingTask.unit.toLowerCase() : '';
        if (unitLower === 'm2' || unitLower === 'square meters') {
          groutingHours = wallArea * groutingTask.estimated_hours;
        }
        taskBreakdown.push({
          task: groutingTask.name,
          hours: groutingHours,
          amount: `${wallArea} square meters`,
          unit: 'square meters'
        });
      }
    }

    // Calculate material transport times if "Calculate transport time" is checked
    let tileTransportTime = 0;
    let adhesiveTransportTime = 0;
    let normalizedTileTransportTime = 0;
    let normalizedAdhesiveTransportTime = 0;

    if (effectiveCalculateTransport) {
      let carrierSizeForTransport = 0.125;
      
      if (effectiveSelectedTransportCarrier) {
        carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
      }

      // Calculate tile transport
      const totalTiles = fullSlabs + cutSlabs.reduce((sum, cut) => sum + cut.quantity, 0);
      if (totalTiles > 0) {
        const tileResult = calculateMaterialTransportTime(totalTiles, carrierSizeForTransport, 'slabs', parseFloat(effectiveTransportDistance) || 30);
        tileTransportTime = tileResult.totalTransportTime;
        normalizedTileTransportTime = tileResult.normalizedTransportTime;
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
        normalizedAdhesiveTransportTime = adhesiveResult.normalizedTransportTime;
      }

      // Add transport tasks
      if (tileTransportTime > 0) {
        taskBreakdown.push({
          task: 'transport tiles',
          hours: tileTransportTime,
          amount: `${totalTiles} pieces`,
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

    const totalTransportTime = tileTransportTime + adhesiveTransportTime;
    
    const newResults = {
      totalSlabs: fullSlabs + cutSlabs.reduce((sum, cut) => sum + cut.quantity, 0),
      totalCuts,
      adhesiveNeeded,
      cuttingBreakdown,
      taskBreakdown,
      materials,
      labor: tileTaskTotal + cuttingTaskTotal + totalTransportTime
    };

    // Prepare formatted results for parent/modal (match other calculators)
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

  // Scroll to results when they appear
  useEffect(() => {
    if (results && resultsRef.current) {
      setTimeout(() => {
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer) {
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [results]);

  const inputStyle: React.CSSProperties = { marginTop: spacing.sm, display: 'block', width: '100%', borderRadius: radii.md, border: `1px solid ${colors.borderDefault}`, background: colors.bgInput, color: colors.textPrimary, padding: '8px 12px', outline: 'none' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['6xl'] }}>
      <h2 style={{ fontSize: fontSizes['2xl'], fontWeight: fontWeights.bold, color: colors.textPrimary, marginBottom: spacing['4xl'] }}>{t('calculator:tile_installation_calculator')}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing['4xl'] }}>
        <div>
          <label style={labelStyle}>{t('calculator:wall_length_m')}</label>
          <input type="number" value={wallLength} onChange={(e) => setWallLength(e.target.value)} style={inputStyle} placeholder={t('calculator:enter_wall_length')} step="0.01" />
        </div>
        <div>
          <label style={labelStyle}>{t('calculator:wall_height_m')}</label>
          <input type="number" value={wallHeight} onChange={(e) => setWallHeight(e.target.value)} style={inputStyle} placeholder={t('calculator:enter_wall_height')} step="0.01" />
        </div>
      </div>

      <div>
        <label style={labelStyle}>{t('calculator:slab_dimensions')}</label>
        <select
          value={selectedSlab.label}
          onChange={(e) => {
            const selected = SLAB_DIMENSIONS.find(dim => dim.label === e.target.value);
            if (selected) setSelectedSlab(selected);
          }}
          style={inputStyle}
        >
          {SLAB_DIMENSIONS.map((dim) => (
            <option key={dim.label} value={dim.label}>
              {dim.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>{t('calculator:slab_orientation_label')}</label>
        <div style={{ marginTop: spacing['2xl'], display: 'grid', gridTemplateColumns: '1fr', gap: spacing['2xl'] }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', padding: spacing['2xl'], borderRadius: radii.md }}>
            <input type="radio" value="long" checked={slabOrientation === 'long'} onChange={(e) => setSlabOrientation(e.target.value as 'long' | 'side')} style={{ accentColor: colors.accentBlue }} />
            <span style={{ marginLeft: spacing['2xl'] }}>{t('calculator:slabs_long_way')}</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', padding: spacing['2xl'], borderRadius: radii.md }}>
            <input type="radio" value="side" checked={slabOrientation === 'side'} onChange={(e) => setSlabOrientation(e.target.value as 'long' | 'side')} style={{ accentColor: colors.accentBlue }} />
            <span style={{ marginLeft: spacing['2xl'] }}>{t('calculator:slabs_side_ways')}</span>
          </label>
        </div>
      </div>

      <div>
        <label style={labelStyle}>{t('calculator:gaps_label')}</label>
        <select value={selectedGap} onChange={(e) => setSelectedGap(Number(e.target.value))} style={inputStyle}>
          {GAP_OPTIONS.map((gap) => (
            <option key={gap} value={gap}>
              {gap}{t('calculator:mm_suffix')}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['4xl'] }}>
        <div>
          <label style={{ ...labelStyle, marginBottom: spacing['2xl'] }}>{t('calculator:slab_cutting_length')}</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: spacing['2xl'] }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', padding: spacing['2xl'], borderRadius: radii.md }}>
              <input type="radio" value="1cut" checked={lengthCutType === '1cut'} onChange={(e) => setLengthCutType(e.target.value as '1cut' | '2cuts')} style={{ accentColor: colors.accentBlue }} />
              <span style={{ marginLeft: spacing['2xl'] }}>{t('calculator:cut_at_end')}</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', padding: spacing['2xl'], borderRadius: radii.md }}>
              <input type="radio" value="2cuts" checked={lengthCutType === '2cuts'} onChange={(e) => setLengthCutType(e.target.value as '1cut' | '2cuts')} style={{ accentColor: colors.accentBlue }} />
              <span style={{ marginLeft: spacing['2xl'] }}>{t('calculator:cuts_beginning_end')}</span>
            </label>
          </div>
        </div>
        <div>
          <label style={{ ...labelStyle, marginBottom: spacing['2xl'] }}>{t('calculator:slab_cutting_height')}</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: spacing['2xl'] }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', padding: spacing['2xl'], borderRadius: radii.md }}>
              <input type="radio" value="1cut" checked={heightCutType === '1cut'} onChange={(e) => setHeightCutType(e.target.value as '1cut' | '2cuts')} style={{ accentColor: colors.accentBlue }} />
              <span style={{ marginLeft: spacing['2xl'] }}>{t('calculator:cut_on_top')}</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', padding: spacing['2xl'], borderRadius: radii.md }}>
              <input type="radio" value="2cuts" checked={heightCutType === '2cuts'} onChange={(e) => setHeightCutType(e.target.value as '1cut' | '2cuts')} style={{ accentColor: colors.accentBlue }} />
              <span style={{ marginLeft: spacing['2xl'] }}>{t('calculator:cuts_bottom_top')}</span>
            </label>
          </div>
        </div>
      </div>

      <div>
        <label style={labelStyle}>{t('calculator:adhesive_thickness')}</label>
        <input type="number" value={adhesiveThickness} onChange={(e) => setAdhesiveThickness(e.target.value)} style={inputStyle} placeholder={t('calculator:cm_placeholder')} min="0" step="0.1" />
        <p style={{ fontSize: fontSizes.xs, color: colors.textDim, marginTop: spacing.sm }}>{t('calculator:consumption_label')} {((parseFloat(adhesiveThickness) || 0.5) * 12).toFixed(1)} {t('calculator:kg_m2_suffix')}</p>
      </div>

      <div>
        <label style={labelStyle}>{t('calculator:type_of_slabs')}</label>
        <div style={{ marginTop: spacing['2xl'], display: 'grid', gridTemplateColumns: '1fr', gap: spacing['2xl'] }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', padding: spacing['2xl'], borderRadius: radii.md }}>
            <input type="radio" value="porcelain" checked={slabType === 'porcelain'} onChange={() => setSlabType('porcelain')} style={{ accentColor: colors.accentBlue }} />
            <span style={{ marginLeft: spacing['2xl'] }}>{t('calculator:porcelain_option')}</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', padding: spacing['2xl'], borderRadius: radii.md }}>
            <input type="radio" value="sandstones" checked={slabType === 'sandstones'} onChange={() => setSlabType('sandstones')} style={{ accentColor: colors.accentBlue }} />
            <span style={{ marginLeft: spacing['2xl'] }}>{t('calculator:sandstones_option')}</span>
          </label>
        </div>
      </div>

      <div>
        <label style={labelStyle}>{t('calculator:grouting_method')}</label>
        <select value={selectedGroutingId} onChange={e => setSelectedGroutingId(e.target.value)} style={inputStyle} disabled={isLoadingGrouting}>
          <option value="">{t('calculator:select_grouting_method')}</option>
          {groutingMethods.map((method: { id: string; name: string }) => (
            <option key={method.id} value={method.id}>{method.name}</option>
          ))}
        </select>
        {isLoadingGrouting && <p style={{ fontSize: fontSizes.sm, color: colors.textDim, marginTop: spacing.sm }}>{t('calculator:loading_grouting_methods')}</p>}
        <p style={{ fontSize: fontSizes.xs, color: colors.red, marginTop: spacing.sm }}>{t('calculator:grouting_note')}</p>
      </div>

      {!isInProjectCreating && (
        <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xl'] }}>
          <input type="checkbox" checked={calculateTransport} onChange={(e) => setCalculateTransport(e.target.checked)} style={{ accentColor: colors.accentBlue }} />
          <span style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:calculate_transport_time')}</span>
        </label>
      )}

      {/* Transport Carrier Selection */}
      {!isInProjectCreating && calculateTransport && (
        <>
          <div>
            <label style={{ ...labelStyle, marginBottom: spacing.lg }}>{t('calculator:transport_carrier_label')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xl'] }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: spacing['2xl'], cursor: 'pointer', border: `2px dashed ${colors.borderDefault}`, borderRadius: radii.md }} onClick={() => setSelectedTransportCarrier(null)}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.textSubtle}`, marginRight: spacing['2xl'] }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', margin: 2, background: selectedTransportCarrier === null ? colors.textSubtle : 'transparent' }}></div>
                </div>
                <div><span style={{ color: colors.textPrimary }}>{t('calculator:default_wheelbarrow')}</span></div>
              </div>
              {carrierSpeeds && carrierSpeeds.length > 0 && carrierSpeeds.map((carrier) => (
                <div key={carrier.size} style={{ display: 'flex', alignItems: 'center', padding: spacing['2xl'], cursor: 'pointer' }} onClick={() => setSelectedTransportCarrier({ id: carrier.size.toString(), name: `${carrier.size}t`, 'size (in tones)': carrier.size })}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.textSubtle}`, marginRight: spacing['2xl'] }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', margin: 2, background: selectedTransportCarrier?.['size (in tones)'] === carrier.size ? colors.textSubtle : 'transparent' }}></div>
                  </div>
                  <div><span style={{ color: colors.textPrimary }}>{carrier.size}{t('calculator:carrier_suffix')}</span></div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: spacing['4xl'] }}>
            <label style={{ ...labelStyle, marginBottom: spacing['2xl'] }}>{t('calculator:transport_distance')}</label>
            <input type="number" value={transportDistance} onChange={(e) => setTransportDistance(e.target.value)} style={{ width: '100%', padding: spacing['2xl'], border: `1px solid ${colors.borderDefault}`, borderRadius: radii.md, background: colors.bgInput, color: colors.textPrimary }} placeholder={t('calculator:enter_transport_distance')} min="0" step="1" />
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        <Button variant="primary" fullWidth onClick={calculateResults}>
          {t('calculator:calculate_button')}
        </Button>
      </div>

      {results && (
        <div style={{ marginTop: spacing['6xl'], display: 'flex', flexDirection: 'column', gap: spacing['4xl'] }} ref={resultsRef}>
          <div style={{ background: 'transparent', padding: 0 }}>
            <div style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, marginBottom: spacing.sm }}>
              <span style={{ color: colors.textMuted }}>{t('calculator:total_labor_hours')}</span>
              <span style={{ color: colors.accentBlue, fontSize: fontSizes['2xl'], verticalAlign: 'middle', fontWeight: fontWeights.bold }}> {(results.labor).toFixed(2)} {t('calculator:hours_suffix')}</span>
            </div>
            <div style={{ fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.sm }}>{t('calculator:task_breakdown_heading')}</div>
            <div style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, overflow: 'hidden' }}>
              {results.taskBreakdown.map((task, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.lg}px ${spacing['4xl']}px`, background: index % 2 === 1 ? colors.bgTableRowAlt : undefined, borderBottom: index < results.taskBreakdown.length - 1 ? `1px solid ${colors.borderLight}` : 'none' }}>
                  <span style={{ color: colors.textPrimary, fontSize: fontSizes.sm, fontWeight: fontWeights.medium }}>{translateTaskName(task.task, t)}</span>
                  <span style={{ color: colors.textSecondary, fontSize: fontSizes.sm }}>{task.hours.toFixed(2)} {t('calculator:hours_suffix')}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: colors.bgCard, borderRadius: radii.lg }} className="p-3 sm:p-6">
            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginBottom: spacing['4xl'] }}>{t('calculator:slab_cutting_breakdown')}</h3>
            <div className="overflow-x-auto -mx-1 sm:mx-0">
              <table
                className="w-full border-collapse text-left text-[11px] leading-tight sm:text-sm sm:leading-normal [&_th]:px-1.5 [&_th]:py-2 sm:[&_th]:px-5 sm:[&_th]:py-3 [&_td]:px-1.5 [&_td]:py-2 sm:[&_td]:px-5 sm:[&_td]:py-4 [&_td]:align-middle [&_th]:align-middle"
                style={{ borderBottom: `1px solid ${colors.borderDefault}` }}
              >
                <thead style={{ background: colors.bgCard }}>
                  <tr>
                    <th scope="col" style={{ textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textDim, textTransform: 'uppercase' }}>{t('calculator:table_type_header')}</th>
                    <th scope="col" style={{ textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textDim, textTransform: 'uppercase' }}>{t('calculator:table_length_cm')}</th>
                    <th scope="col" style={{ textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textDim, textTransform: 'uppercase' }}>{t('calculator:table_height_cm')}</th>
                    <th scope="col" style={{ textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textDim, textTransform: 'uppercase' }}>{t('calculator:table_cut_pieces_header')}</th>
                    <th scope="col" style={{ textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textDim, textTransform: 'uppercase' }}>{t('calculator:table_source_slabs_header')}</th>
                  </tr>
                </thead>
                <tbody style={{ background: colors.bgInput }}>
                  {results.cuttingBreakdown.fullSlabs > 0 && (
                    <tr style={{ borderTop: `1px solid ${colors.borderDefault}` }}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>{t('calculator:full_slabs_row')}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>{slabOrientation === 'long' ? selectedSlab.width : selectedSlab.height}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>{slabOrientation === 'long' ? selectedSlab.height : selectedSlab.width}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>{results.cuttingBreakdown.fullSlabs}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>{results.cuttingBreakdown.fullSlabs}</td>
                    </tr>
                  )}
                  {results.cuttingBreakdown.cutSlabs.filter(cut => cut.quantity > 0).map((cut, index) => (
                    <tr key={index} style={{ borderTop: `1px solid ${colors.borderDefault}`, background: ((results.cuttingBreakdown.fullSlabs > 0 ? 1 : 0) + index) % 2 === 1 ? colors.bgTableRowAlt : undefined }}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>{cut.width === selectedSlab.width ? t('calculator:height_cut_type') : cut.height === selectedSlab.height ? t('calculator:length_cut_type') : t('calculator:corner_cut_type')}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>{cut.width.toFixed(1)}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>{cut.height.toFixed(1)}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>{cut.quantity}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: fontSizes.sm, color: colors.textPrimary }}>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: colors.bgCard, padding: spacing['4xl'], borderRadius: radii.lg }}>
            <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginBottom: spacing['4xl'] }}>{t('calculator:materials_breakdown_heading')}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: '100%', borderCollapse: 'collapse', borderBottom: `1px solid ${colors.borderDefault}` }}>
                <thead style={{ background: colors.bgCard }}>
                  <tr>
                    <th scope="col" style={{ padding: '12px 24px', textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textDim, textTransform: 'uppercase' }}>{t('calculator:table_material_header')}</th>
                    <th scope="col" style={{ padding: '12px 24px', textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textDim, textTransform: 'uppercase' }}>{t('calculator:table_quantity_header')}</th>
                    <th scope="col" style={{ padding: '12px 24px', textAlign: 'left', fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textDim, textTransform: 'uppercase' }}>{t('calculator:table_unit_header')}</th>
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

export default WallFinishCalculator;
