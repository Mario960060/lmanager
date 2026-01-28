import React, { useState, useEffect, useRef } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';

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
  'size (in tones)': number;
}

const GAP_OPTIONS = [2, 3, 4, 5];
const ADHESIVE_THICKNESS = [
  { value: 0.5, consumption: 6 },
  { value: 1, consumption: 12 }
];

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
  selectedExcavator: propSelectedExcavator
}: CopingInstallationCalculatorProps) => {
  const companyId = useAuthStore(state => state.getCompanyId());
  const [wallLength, setWallLength] = useState<string>('');
  const [slabLength, setSlabLength] = useState<string>('');
  const [slabWidth, setSlabWidth] = useState<string>('');
  const [selectedGap, setSelectedGap] = useState<number>(GAP_OPTIONS[0]);
  const [adhesiveThickness, setAdhesiveThickness] = useState<number>(ADHESIVE_THICKNESS[0].value);
  const [amountOfCorners, setAmountOfCorners] = useState<string>('2');
  const [apply45DegreeCut, setApply45DegreeCut] = useState<boolean>(false);
  const [selectedGroutingId, setSelectedGroutingId] = useState<string>('');
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
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

  // Fetch all task templates (for coping installation)
  const { data: taskTemplates = [] }: UseQueryResult<TaskTemplate[]> = useQuery({
    queryKey: ['coping_task_templates', companyId],
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

  // Fetch cutting tasks
  const { data: cuttingTasks = [] }: UseQueryResult<TaskTemplate[]> = useQuery({
    queryKey: ['cutting_coping_tasks', companyId],
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
    if (!wallLength || !slabLength || !slabWidth) return;

    // Convert to centimeters for calculations
    const wallLengthCm = parseFloat(wallLength) * 100;
    const slabLengthCm = parseFloat(slabLength);
    const slabWidthCm = parseFloat(slabWidth);
    const gapCm = selectedGap / 10;

    // Calculate number of slabs: wallLength / (slabLength + gap)
    const numberOfSlabs = Math.floor(wallLengthCm / (slabLengthCm + gapCm));

    // Calculate corner cuts
    const corners = parseInt(amountOfCorners) || 2;
    const cutsPerCorner = apply45DegreeCut ? 2 : 1;
    const totalCuts = corners * cutsPerCorner;

    // Calculate adhesive needed and wall area in m²
    const wallArea = (wallLengthCm * slabWidthCm) / 10000; // Convert to m²
    const adhesiveConsumption = ADHESIVE_THICKNESS.find(t => t.value === adhesiveThickness)?.consumption || 6;
    const adhesiveNeeded = wallArea * adhesiveConsumption;

    // Find adhesive in materials table
    const adhesiveMaterial = materialsTable.find((m: Material) => m.name.toLowerCase().includes('adhesive'));
    let materials: { name: string; amount: number; unit: string; price_per_unit: number | null; total_price: number | null }[] = [];
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
    const copingTaskName = `Coping Installation ${slabLengthCm} × ${slabWidthCm}`;
    const cuttingTaskName = 'cutting porcelain'; // Default to porcelain for coping

    // Find the template for coping installation
    const copingTaskTemplate = taskTemplates.find(
      (t: TaskTemplate) => t.name.toLowerCase().includes('coping') && t.name.toLowerCase().includes('installation')
    );
    const copingTaskTime = copingTaskTemplate?.estimated_hours ?? 0.5;

    // Find the template for cutting
    const cuttingTaskTemplate = cuttingTasks.find(
      (t: TaskTemplate) => t.name.toLowerCase() === cuttingTaskName.toLowerCase()
    );
    const cuttingTaskTime = cuttingTaskTemplate?.estimated_hours ?? 0.5;

    const copingTaskTotal = numberOfSlabs * copingTaskTime;
    const cuttingTaskTotal = totalCuts * cuttingTaskTime;

    const taskBreakdown = [
      {
        task: `Coping Installation ${slabLengthCm} x ${slabWidthCm}`,
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
          amount: `${wallArea.toFixed(2)} square meters`,
          unit: 'square meters'
        });
      }
    }

    // Calculate material transport times if "Calculate transport time" is checked
    let copingTransportTime = 0;
    let adhesiveTransportTime = 0;
    let normalizedCopingTransportTime = 0;
    let normalizedAdhesiveTransportTime = 0;

    if (calculateTransport) {
      let carrierSizeForTransport = 0.125;
      
      if (selectedTransportCarrier) {
        carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
      }

      // Calculate coping transport
      if (numberOfSlabs > 0) {
        const copingResult = calculateMaterialTransportTime(numberOfSlabs, carrierSizeForTransport, 'slabs', parseFloat(transportDistance) || 30);
        copingTransportTime = copingResult.totalTransportTime;
        normalizedCopingTransportTime = copingResult.normalizedTransportTime;
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
      console.debug('[CopingInstallationCalculator] onResultsChange payload:', formattedResults);
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
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Coping Installation Calculator</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Wall Length (m)</label>
          <input
            type="number"
            value={wallLength}
            onChange={(e) => setWallLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter wall length"
            step="0.01"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Slab Length (cm)</label>
          <input
            type="number"
            value={slabLength}
            onChange={(e) => setSlabLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter slab length"
            step="0.1"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Slab Width (cm)</label>
        <input
          type="number"
          value={slabWidth}
          onChange={(e) => setSlabWidth(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter slab width"
          step="0.1"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Gaps (mm)</label>
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

      <div>
        <label className="block text-sm font-medium text-gray-700">Adhesive Thickness</label>
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
        <label className="block text-sm font-medium text-gray-700">Amount of Corners</label>
        <input
          type="number"
          value={amountOfCorners}
          onChange={(e) => setAmountOfCorners(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter amount of corners"
          min="0"
          step="1"
        />
      </div>

      <label className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={apply45DegreeCut}
          onChange={(e) => setApply45DegreeCut(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-gray-700">45 degree cut on corners</span>
      </label>

      <div>
        <label className="block text-sm font-medium text-gray-700">Grouting Method</label>
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
        {isLoadingGrouting && <p className="text-sm text-gray-500 mt-1">Loading grouting methods...</p>}
        <p className="text-xs text-red-600 mt-1">To add a new method, create a task that includes "grouting" in the name and add the amount of grout separately.</p>
      </div>

      <label className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={calculateTransport}
          onChange={(e) => setCalculateTransport(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-gray-700">Calculate transport time (default as 0.125 wheelbarrow)</span>
      </label>

      {/* Transport Carrier Selection */}
      {calculateTransport && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Transport Carrier (optional - defaults to 0.125 wheelbarrow)</label>
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
                <span className="text-gray-800">Default (0.125t Wheelbarrow)</span>
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
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Transport Distance in meters (each way)</label>
        <input
          type="number"
          value={transportDistance}
          onChange={(e) => setTransportDistance(e.target.value)}
          className="w-full p-2 border rounded-md"
          placeholder="Enter transport distance"
          min="0"
          step="1"
        />
      </div>

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
          {/* Estimated Time Breakdown */}
          <div className="bg-transparent p-0">
            <div className="text-lg font-semibold mb-1">
              <span className="text-gray-100">Total Labor Hours: </span>
              <span className="text-blue-400 text-2xl align-middle font-bold">{(results.labor).toFixed(2)} hours</span>
            </div>
            <div className="text-base font-medium text-gray-100 mb-1">Task Breakdown:</div>
            <ul className="list-disc ml-6 text-gray-100">
              {results.taskBreakdown.map((task, index) => (
                <li key={index}>
                  <span className="font-bold">{task.task}:</span> {task.hours.toFixed(2)} hours
                </li>
              ))}
            </ul>
          </div>

          {/* Coping Installation Details */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Installation Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Number of Slabs</p>
                <p className="text-2xl font-bold text-gray-900">{results.numberOfSlabs}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Cuts</p>
                <p className="text-2xl font-bold text-gray-900">{results.totalCuts}</p>
              </div>
            </div>
          </div>

          {/* Materials Breakdown Table */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Materials Breakdown</h3>
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

export default CopingInstallationCalculator;
