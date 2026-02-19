import React, { useState, useEffect, useRef } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName } from '../../lib/translationMap';

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

const GAP_OPTIONS = [2, 3, 4, 5];
const ADHESIVE_THICKNESS = [
  { value: 0.5, consumption: 6 },
  { value: 1, consumption: 12 }
];

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
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const [wallLength, setWallLength] = useState<string>('');
  const [wallHeight, setWallHeight] = useState<string>('');
  const [selectedSlab, setSelectedSlab] = useState<SlabDimension>(SLAB_DIMENSIONS[0]);
  const [slabOrientation, setSlabOrientation] = useState<'long' | 'side'>('long');
  const [selectedGap, setSelectedGap] = useState<number>(GAP_OPTIONS[0]);
  const [lengthCutType, setLengthCutType] = useState<'1cut' | '2cuts'>('1cut');
  const [heightCutType, setHeightCutType] = useState<'1cut' | '2cuts'>('1cut');
  const [adhesiveThickness, setAdhesiveThickness] = useState<number>(ADHESIVE_THICKNESS[0].value);
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

  // Sync local state back to parent when in ProjectCreating
  useEffect(() => {
    if (isInProjectCreating && propSetCalculateTransport) {
      propSetCalculateTransport(calculateTransport);
    }
  }, [calculateTransport, isInProjectCreating]);

  useEffect(() => {
    if (isInProjectCreating && propSetSelectedTransportCarrier) {
      propSetSelectedTransportCarrier(selectedTransportCarrier);
    }
  }, [selectedTransportCarrier, isInProjectCreating]);

  useEffect(() => {
    if (isInProjectCreating && propSetTransportDistance) {
      propSetTransportDistance(transportDistance);
    }
  }, [transportDistance, isInProjectCreating]);

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
    
    if (calculateTransport) {
      fetchEquipment();
    }
  }, [calculateTransport]);

  // Fetch all task templates (for tile installation)
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

  // Fetch cutting tasks
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
    const adhesiveConsumption = ADHESIVE_THICKNESS.find(t => t.value === adhesiveThickness)?.consumption || 6;
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
      if (groutingTask && groutingTask.estimated_hours !== undefined && groutingTask.estimated_hours !== null) {
        let groutingHours = groutingTask.estimated_hours;
        const unitLower = groutingTask.unit ? groutingTask.unit.toLowerCase() : '';
        if (unitLower === 'm2' || unitLower === 'square meters') {
          groutingHours = wallArea * groutingTask.estimated_hours;
        }
        taskBreakdown.push({
          task: groutingTask.name || 'Grouting',
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

    if (calculateTransport) {
      let carrierSizeForTransport = 0.125;
      
      if (selectedTransportCarrier) {
        carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
      }

      // Calculate tile transport
      const totalTiles = fullSlabs + cutSlabs.reduce((sum, cut) => sum + cut.quantity, 0);
      if (totalTiles > 0) {
        const tileResult = calculateMaterialTransportTime(totalTiles, carrierSizeForTransport, 'slabs', parseFloat(transportDistance) || 30);
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
        const adhesiveResult = calculateMaterialTransportTime(bagsNeeded, carrierSizeForTransport, 'cement', parseFloat(transportDistance) || 30);
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
      console.debug('[TileInstallationCalculator] onResultsChange payload:', formattedResults);
      onResultsChange(formattedResults);
    }
  };

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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('calculator:tile_installation_calculator_title_alt')}</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_tile_wall_length_m')}</label>
          <input
            type="number"
            value={wallLength}
            onChange={(e) => setWallLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder={t('calculator:placeholder_enter_wall_length_tile')}
            step="0.01"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_tile_wall_height_m')}</label>
          <input
            type="number"
            value={wallHeight}
            onChange={(e) => setWallHeight(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder={t('calculator:placeholder_enter_wall_height_tile')}
            step="0.01"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_tile_slab_dimensions')}</label>
        <select
          value={selectedSlab.label}
          onChange={(e) => {
            const selected = SLAB_DIMENSIONS.find(dim => dim.label === e.target.value);
            if (selected) setSelectedSlab(selected);
          }}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          {SLAB_DIMENSIONS.map((dim) => (
            <option key={dim.label} value={dim.label}>
              {dim.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_tile_slab_orientation')}</label>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
            <input
              type="radio"
              value="long"
              checked={slabOrientation === 'long'}
              onChange={(e) => setSlabOrientation(e.target.value as 'long' | 'side')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2">{t('calculator:input_tile_slabs_long_way')}</span>
          </label>
          <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
            <input
              type="radio"
              value="side"
              checked={slabOrientation === 'side'}
              onChange={(e) => setSlabOrientation(e.target.value as 'long' | 'side')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2">{t('calculator:input_tile_slabs_side_ways')}</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_tile_gaps')}</label>
        <select
          value={selectedGap}
          onChange={(e) => setSelectedGap(Number(e.target.value))}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          {GAP_OPTIONS.map((gap) => (
            <option key={gap} value={gap}>
              {gap}mm
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:input_tile_slab_cutting_length')}</label>
          <div className="grid grid-cols-1 gap-2">
            <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
              <input
                type="radio"
                value="1cut"
                checked={lengthCutType === '1cut'}
                onChange={(e) => setLengthCutType(e.target.value as '1cut' | '2cuts')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2">{t('calculator:input_tile_1cut_at_end')}</span>
            </label>
            <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
              <input
                type="radio"
                value="2cuts"
                checked={lengthCutType === '2cuts'}
                onChange={(e) => setLengthCutType(e.target.value as '1cut' | '2cuts')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2">{t('calculator:input_tile_2cuts_beginning_end')}</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:input_tile_slab_cutting_height')}</label>
          <div className="grid grid-cols-1 gap-2">
            <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
              <input
                type="radio"
                value="1cut"
                checked={heightCutType === '1cut'}
                onChange={(e) => setHeightCutType(e.target.value as '1cut' | '2cuts')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2">{t('calculator:input_tile_1cut_on_top')}</span>
            </label>
            <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
              <input
                type="radio"
                value="2cuts"
                checked={heightCutType === '2cuts'}
                onChange={(e) => setHeightCutType(e.target.value as '1cut' | '2cuts')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2">{t('calculator:input_tile_2cuts_bottom_top')}</span>
            </label>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_tile_adhesive_thickness')}</label>
        <select
          value={adhesiveThickness}
          onChange={(e) => setAdhesiveThickness(Number(e.target.value))}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          {ADHESIVE_THICKNESS.map((thickness) => (
            <option key={thickness.value} value={thickness.value}>
              {thickness.value} cm
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:type_of_slabs')}</label>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
            <input
              type="radio"
              value="porcelain"
              checked={slabType === 'porcelain'}
              onChange={() => setSlabType('porcelain')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2">{t('calculator:porcelain')}</span>
          </label>
          <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
            <input
              type="radio"
              value="sandstones"
              checked={slabType === 'sandstones'}
              onChange={() => setSlabType('sandstones')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2">{t('calculator:sandstones')}</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:grouting_method')}</label>
        <select
          value={selectedGroutingId}
          onChange={e => setSelectedGroutingId(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-select"
          disabled={isLoadingGrouting}
        >
          <option value="">Select grouting method</option>
          {groutingMethods.map((method: any) => (
            <option key={method.id} value={method.id}>{method.name}</option>
          ))}
        </select>
        {isLoadingGrouting && <p className="text-sm text-gray-500 mt-1">{t('calculator:loading_grouting_methods')}</p>}
        <p className="text-xs text-red-600 mt-1">{t('calculator:grouting_method_note')}</p>
      </div>

      <label className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={calculateTransport}
          onChange={(e) => setCalculateTransport(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-gray-700">{t('calculator:calculate_transport_time_label')}</span>
      </label>

      {/* Transport Carrier Selection */}
      {calculateTransport && (
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
            {carriers && carriers.length > 0 && carriers.map((carrier) => (
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
                placeholder={t('calculator:enter_transport_distance')}
                min="0"
                step="1"
              />
            </div>
          </div>
        )}

      <div className="flex justify-center">
        <button
          onClick={calculateResults}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Calculate
        </button>
      </div>

      {results && (
        <div className="mt-6 space-y-4" ref={resultsRef}>
          {/* Estimated Time Breakdown (styled as in screenshot) */}
          <div className="bg-transparent p-0">
            <div className="text-lg font-semibold mb-1">
              <span className="text-gray-100">{t('calculator:total_labor_hours')}</span>
              <span className="text-blue-400 text-2xl align-middle font-bold">{(results.labor).toFixed(2)} hours</span>
            </div>
            <div className="text-base font-medium text-gray-100 mb-1">{t('calculator:task_breakdown')}</div>
            <ul className="list-disc ml-6 text-gray-100">
              {results.taskBreakdown.map((task, index) => (
                <li key={index}>
                  <span className="font-bold">{translateTaskName(task.task, t)}:</span> {task.hours.toFixed(2)} hours
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">{t('calculator:slab_cutting_breakdown_label')}</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Length (cm)
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Height (cm)
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Only show Full Slabs row if quantity > 0 */}
                  {results.cuttingBreakdown.fullSlabs > 0 && (
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        Full Slabs
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {slabOrientation === 'long' ? selectedSlab.width : selectedSlab.height}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {slabOrientation === 'long' ? selectedSlab.height : selectedSlab.width}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {results.cuttingBreakdown.fullSlabs}
                      </td>
                    </tr>
                  )}
                  {/* Only show cut slabs with quantity > 0 */}
                  {results.cuttingBreakdown.cutSlabs.filter(cut => cut.quantity > 0).map((cut, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {cut.width === selectedSlab.width ? 'Height Cut' : 
                         cut.height === selectedSlab.height ? 'Length Cut' : 'Corner Cut'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {cut.width.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {cut.height.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {cut.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Materials Breakdown Table */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">{t('calculator:materials_breakdown_label')}</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Material
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unit
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.materials.map((material, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{material.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{material.amount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{material.unit}</td>
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
