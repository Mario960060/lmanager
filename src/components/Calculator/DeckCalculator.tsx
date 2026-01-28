import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';

interface DeckCalculatorProps {
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
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

interface TaskBreakdown {
  task: string;
  hours: number;
  amount: string;
  unit: string;
}

interface MaterialPrice {
  name: string;
  price: number | null;
}

interface DiggingEquipment {
  id: string;
  name: string;
  'size (in tones)': number;
}

const DeckCalculator: React.FC<DeckCalculatorProps> = ({
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
}) => {
  const companyId = useAuthStore(state => state.getCompanyId());
  console.log(`DeckCalculator.tsx: Component mounted`);

  // Inputs
  const [totalLength, setTotalLength] = useState('');
  const [totalWidth, setTotalWidth] = useState('');
  const [joistLength, setJoistLength] = useState('');
  const [distanceBetweenJoists, setDistanceBetweenJoists] = useState('');
  const [boardLength, setBoardLength] = useState('');
  const [boardWidth, setBoardWidth] = useState('');
  const [jointGaps, setJointGaps] = useState('');
  const [pattern, setPattern] = useState('Length');
  const [includeFrame, setIncludeFrame] = useState(false);
  const [postmixPerPost, setPostmixPerPost] = useState<string>('');

  // State
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<TaskBreakdown[]>([]);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Use carriers from props if available
  const carriers = propCarriers && propCarriers.length > 0 ? propCarriers : carriersLocal;

  // Sync transport props
  useEffect(() => {
    if (isInProjectCreating) {
      if (propCalculateTransport !== undefined) setCalculateTransport(propCalculateTransport);
      if (propSelectedTransportCarrier !== undefined) setSelectedTransportCarrier(propSelectedTransportCarrier);
      if (propTransportDistance !== undefined) setTransportDistance(propTransportDistance);
    }
  }, [isInProjectCreating, propCalculateTransport, propSelectedTransportCarrier, propTransportDistance]);

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

  // Fetch task templates
  const { data: taskTemplates = {} } = useQuery({
    queryKey: ['deck_tasks', companyId],
    queryFn: async () => {
      const taskNames = [
        'digging holes for posts',
        'setting up posts',
        'decking boards cuts',
        'cutting decking joists',
        'fixing decking frame',
        'fixing decking boards',
        'decking frame boards cuts'
      ];

      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId || '')
        .in('name', taskNames);

      if (error) {
        console.error('Error fetching deck tasks:', error);
        throw error;
      }

      console.log('Fetched deck tasks:', data);

      // Convert array to object for easy lookup
      const taskMap: Record<string, any> = {};
      if (data) {
        data.forEach(task => {
          taskMap[task.name] = task;
        });
      }
      console.log('Task map:', taskMap);
      return taskMap;
    },
    enabled: !!companyId
  });

  // Fetch equipment
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const companyId = useAuthStore.getState().getCompanyId();
        if (!companyId) return;

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

  const fetchMaterialPrices = async (materials: Material[]): Promise<Material[]> => {
    try {
      const materialNames = materials.map(m => m.name);

      const { data, error } = await supabase
        .from('materials')
        .select('name, price')
        .in('name', materialNames);

      if (error) throw error;

      const priceMap = data.reduce((acc: Record<string, number | null>, item: MaterialPrice) => {
        acc[item.name] = item.price || null;
        return acc;
      }, {} as Record<string, number | null>);

      return materials.map(material => ({
        ...material,
        price_per_unit: priceMap[material.name] || null,
        total_price: priceMap[material.name] && material.amount ? priceMap[material.name]! * material.amount : null
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

  const calculate = async () => {
    console.log(`DeckCalculator.tsx: calculate called`);

    if (!totalLength || !totalWidth || !joistLength || !distanceBetweenJoists || !boardLength || !boardWidth || !jointGaps) {
      setCalculationError('Please fill in all required fields');
      return;
    }

    try {
      const tl = parseFloat(totalLength);
      const tw = parseFloat(totalWidth);
      const jl = parseFloat(joistLength);
      const dbj = parseFloat(distanceBetweenJoists);
      const bl = parseFloat(boardLength);
      const bw = parseFloat(boardWidth);
      const jg = parseFloat(jointGaps);

      if (isNaN(tl) || isNaN(tw) || isNaN(jl) || isNaN(dbj) || isNaN(bl) || isNaN(bw) || isNaN(jg)) {
        setCalculationError('Please enter valid numbers');
        return;
      }

      // ===== DECKING BOARDS CALCULATION =====
      const boardsPerRow = Math.ceil(tl / bl); // total_length / board_length
      const boardWidth_m = bw / 100; // Convert cm to m
      const jointGaps_m = jg / 1000; // Convert mm to m
      const rowsNeeded = Math.ceil(tw / (boardWidth_m + jointGaps_m));
      let totalBoards = Math.ceil(boardsPerRow * rowsNeeded);

      // ===== FRAME BOARDS CALCULATION (if includeFrame is checked) =====
      // Frame calculation: ((total_length - board_width) / board_length) + ((total_length - board_width) / board_length) + ((total_width - board_width) / board_length) + ((total_width - board_width) / board_length)
      let frameBoards = 0;
      if (includeFrame) {
        const adjustedLength = (tl - boardWidth_m) / bl;
        const adjustedWidth = (tw - boardWidth_m) / bl;
        
        frameBoards = Math.ceil(adjustedLength + adjustedLength + adjustedWidth + adjustedWidth);
        totalBoards += frameBoards;
      }

      // ===== BEARERS CALCULATION =====
      // Bearers are spaced 1.8m apart (fixed)
      const bearersInRow = Math.ceil(tl / jl); // total_length / joist_length (bearer length)
      const bearerRows = Math.ceil(tw / 1.8) + 1;
      const totalBearers = Math.ceil(bearersInRow * bearerRows);

      // ===== JOISTS CALCULATION =====
      const joistsInRow = Math.ceil(tw / jl); // total_width / joist_length
      const joistRows = Math.ceil(tl / dbj) + 1;
      const totalJoists = Math.ceil(joistsInRow * joistRows);

      // ===== POSTS CALCULATION =====
      const postsPerRow = Math.ceil(tl / 1.8) + 1;
      const postRows = Math.ceil(tw / 1.8) + 1;
      const totalPosts = Math.ceil(postsPerRow * postRows);

      // ===== POSTMIX CALCULATION =====
      const postmix = parseFloat(postmixPerPost) || 0;
      const totalPostmix = Math.ceil(totalPosts * postmix);

      // ===== TASK BREAKDOWN =====
      const breakdown: TaskBreakdown[] = [];

      // Digging holes for posts
      const diggingTask = taskTemplates['digging holes for posts'];
      if (diggingTask && diggingTask.estimated_hours && diggingTask.name) {
        breakdown.push({
          task: diggingTask.name,
          hours: totalPosts * diggingTask.estimated_hours,
          amount: totalPosts ? `${totalPosts} posts` : '0',
          unit: 'posts'
        });
      }

      // Setting up posts
      const settingPostsTask = taskTemplates['setting up posts'];
      if (settingPostsTask && settingPostsTask.estimated_hours && settingPostsTask.name) {
        breakdown.push({
          task: settingPostsTask.name,
          hours: totalPosts * settingPostsTask.estimated_hours,
          amount: totalPosts ? `${totalPosts} posts` : '0',
          unit: 'posts'
        });
      }

      // Decking board cuts
      // Pattern: 1 cut, 2 cuts, 1 cut, 2 cuts... = average 1.5 per row
      const totalBoardCuts = Math.ceil(rowsNeeded * 1.5);
      const boardCutsTask = taskTemplates['decking boards cuts'];
      if (boardCutsTask && boardCutsTask.estimated_hours && boardCutsTask.name) {
        breakdown.push({
          task: boardCutsTask.name,
          hours: totalBoardCuts * boardCutsTask.estimated_hours,
          amount: totalBoardCuts ? `${totalBoardCuts} cuts` : '0',
          unit: 'cuts'
        });
      }

      // Cutting decking joists (joists + bearers)
      const totalJoistCuts = joistRows + bearerRows;
      const joistCutsTask = taskTemplates['cutting decking joists'];
      if (joistCutsTask && joistCutsTask.estimated_hours && joistCutsTask.name) {
        breakdown.push({
          task: joistCutsTask.name,
          hours: totalJoistCuts * joistCutsTask.estimated_hours,
          amount: totalJoistCuts ? `${totalJoistCuts} cuts` : '0',
          unit: 'cuts'
        });
      }

      // Decking frame boards cuts (if includeFrame is checked)
      if (includeFrame) {
        const frameTask = taskTemplates['decking frame boards cuts'];
        if (frameTask && frameTask.estimated_hours && frameTask.name) {
          // Calculate frame boards amount for display
          const boardWidth_m = bw / 100; // Convert cm to m
          const adjustedLength = (tl - boardWidth_m) / bl;
          const adjustedWidth = (tw - boardWidth_m) / bl;
          const frameBoards = adjustedLength + adjustedLength + adjustedWidth + adjustedWidth;
          
          breakdown.push({
            task: frameTask.name,
            hours: frameBoards * frameTask.estimated_hours,
            amount: frameBoards ? `${Math.ceil(frameBoards)} boards` : '0',
            unit: 'boards'
          });
        }
      }

      // Fixing decking frame (joist + bearer + posts all related)
      const fixingFrameTask = taskTemplates['fixing decking frame'];
      if (fixingFrameTask && fixingFrameTask.estimated_hours && fixingFrameTask.name) {
        breakdown.push({
          task: fixingFrameTask.name,
          hours: totalJoists * fixingFrameTask.estimated_hours,
          amount: totalJoists ? `${totalJoists} joists` : '0',
          unit: 'joists'
        });
      }

      // Fixing decking boards
      const fixingBoardsTask = taskTemplates['fixing decking boards'];
      if (fixingBoardsTask && fixingBoardsTask.estimated_hours && fixingBoardsTask.name) {
        breakdown.push({
          task: fixingBoardsTask.name,
          hours: totalBoards * fixingBoardsTask.estimated_hours,
          amount: totalBoards ? `${totalBoards} boards` : '0',
          unit: 'boards'
        });
      }

      // Calculate total hours
      const totalHours = breakdown.reduce((sum, item) => sum + item.hours, 0);

      // ===== TRANSPORT CALCULATIONS =====
      let transportTime = 0;

      if (calculateTransport) {
        let carrierSizeForTransport = 0.125;

        if (selectedTransportCarrier) {
          carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
        }

        const distanceVal = parseFloat(transportDistance) || 30;

        // Transport boards (all boards including frame boards)
        if (totalBoards > 0) {
          const boardsResult = calculateMaterialTransportTime(totalBoards, carrierSizeForTransport, 'timber', distanceVal);
          const boardTransportTime = boardsResult.totalTransportTime;

          if (boardTransportTime > 0) {
            breakdown.push({
              task: 'transport decking boards',
              hours: boardTransportTime,
              amount: totalBoards ? `${totalBoards} boards` : '0',
              unit: 'boards'
            });
            transportTime += boardTransportTime;
          }
        }

        // Transport joists (heavier, use carrier)
        if (totalJoists > 0) {
          const joistsResult = calculateMaterialTransportTime(totalJoists, carrierSizeForTransport, 'timber', distanceVal);
          const joistTransportTime = joistsResult.totalTransportTime;

          if (joistTransportTime > 0) {
            breakdown.push({
              task: 'transport joists',
              hours: joistTransportTime,
              amount: totalJoists ? `${totalJoists} joists` : '0',
              unit: 'joists'
            });
            transportTime += joistTransportTime;
          }
        }

        // Transport bearers (heavier, use carrier)
        if (totalBearers > 0) {
          const bearersResult = calculateMaterialTransportTime(totalBearers, carrierSizeForTransport, 'timber', distanceVal);
          const bearerTransportTime = bearersResult.totalTransportTime;

          if (bearerTransportTime > 0) {
            breakdown.push({
              task: 'transport bearers',
              hours: bearerTransportTime,
              amount: totalBearers ? `${totalBearers} bearers` : '0',
              unit: 'bearers'
            });
            transportTime += bearerTransportTime;
          }
        }

        // Transport posts (1 per trip on foot)
        if (totalPosts > 0) {
          const postsPerTrip = 1;
          const trips = Math.ceil(totalPosts / postsPerTrip);
          const postCarrySpeed = 1500; // m/h
          const timePerTrip = (distanceVal * 2) / postCarrySpeed;
          const postTransportTime = trips * timePerTrip;

          if (postTransportTime > 0) {
            breakdown.push({
              task: 'transport posts',
              hours: postTransportTime,
              amount: totalPosts ? `${totalPosts} posts` : '0',
              unit: 'posts'
            });
            transportTime += postTransportTime;
          }
        }

        // Transport postmix (bags like cement)
        if (totalPostmix > 0) {
          const postmixResult = calculateMaterialTransportTime(totalPostmix, carrierSizeForTransport, 'cement', distanceVal);
          const postmixTransportTime = postmixResult.totalTransportTime;

          if (postmixTransportTime > 0) {
            breakdown.push({
              task: 'transport postmix',
              hours: postmixTransportTime,
              amount: totalPostmix ? `${totalPostmix} bags` : '0',
              unit: 'bags'
            });
            transportTime += postmixTransportTime;
          }
        }
      }

      // Final total hours
      const finalTotalHours = breakdown.reduce((sum, item) => sum + item.hours, 0);

      // ===== MATERIAL BREAKDOWN =====
      const normalBoards = totalBoards - frameBoards; // Calculate normal boards (without frame)
      const materialsList: Material[] = [
        { name: 'Decking Boards', amount: normalBoards, unit: 'boards', price_per_unit: null, total_price: null },
        { name: 'Posts', amount: totalPosts, unit: 'posts', price_per_unit: null, total_price: null },
        { name: 'Joists', amount: totalJoists, unit: 'joists', price_per_unit: null, total_price: null },
        { name: 'Bearers', amount: totalBearers, unit: 'bearers', price_per_unit: null, total_price: null },
        { name: 'Postmix', amount: totalPostmix, unit: 'bags', price_per_unit: null, total_price: null }
      ];

      // Add frame boards if included
      if (includeFrame && frameBoards > 0) {
        materialsList.push({
          name: 'Frame Boards',
          amount: frameBoards,
          unit: 'boards',
          price_per_unit: null,
          total_price: null
        });
      }

      // Fetch prices
      const materialsWithPrices = await fetchMaterialPrices(materialsList);

      setMaterials(materialsWithPrices);
      setTotalHours(finalTotalHours);
      setTaskBreakdown(breakdown);
      setCalculationError(null);
    } catch (error) {
      console.error('Calculation error:', error);
      setCalculationError('An error occurred during calculation. Please check your inputs.');
    }
  };

  // Notify parent of changes
  useEffect(() => {
    if (totalHours !== null && materials.length > 0) {
      const formattedResults = {
        name: 'Decking Standard Installation',
        amount: parseFloat(totalLength) || 0,
        unit: 'meters',
        hours_worked: totalHours,
        materials: materials.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit
        })),
        taskBreakdown: taskBreakdown.map(task => ({
          task: task.task,
          hours: task.hours,
          amount: task.amount,
          unit: task.unit
        }))
      };

      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      if (onResultsChange) {
        onResultsChange(formattedResults);
      }
    }
  }, [totalHours, materials, taskBreakdown, totalLength, onResultsChange]);

  // Scroll to results
  useEffect(() => {
    if ((totalHours !== null || materials.length > 0) && resultsRef.current) {
      setTimeout(() => {
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer && resultsRef.current) {
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [totalHours, materials]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Decking Standard Calculator</h2>
      <p className="text-sm text-gray-600">
        Calculate materials, time, and costs for decking installation projects.
      </p>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Total Length (m)</label>
          <input
            type="number"
            value={totalLength}
            onChange={(e) => setTotalLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter length"
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Total Width (m)</label>
          <input
            type="number"
            value={totalWidth}
            onChange={(e) => setTotalWidth(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter width"
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Joist Length (m)</label>
          <input
            type="number"
            value={joistLength}
            onChange={(e) => setJoistLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Each joist length"
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Distance Between Joists (m)</label>
          <input
            type="number"
            value={distanceBetweenJoists}
            onChange={(e) => setDistanceBetweenJoists(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Distance spacing"
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Board Length (m)</label>
          <input
            type="number"
            value={boardLength}
            onChange={(e) => setBoardLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Each board length"
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Board Width (cm)</label>
          <input
            type="number"
            value={boardWidth}
            onChange={(e) => setBoardWidth(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Board width"
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Joint Gaps (mm)</label>
          <input
            type="number"
            value={jointGaps}
            onChange={(e) => setJointGaps(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Gap between boards"
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Postmix Per Post (bags)</label>
          <input
            type="number"
            value={postmixPerPost}
            onChange={(e) => setPostmixPerPost(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Postmix per post"
            min="0"
            step="0.1"
          />
        </div>
      </div>

      {/* Pattern and Frame */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Pattern</label>
          <select
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="Length">Length</option>
            <option value="Width">Width</option>
            <option value="45 degree angle">45 Degree Angle</option>
          </select>
        </div>

        <div className="flex items-end">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={includeFrame}
              onChange={(e) => setIncludeFrame(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Include Frame</span>
          </label>
        </div>
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

      <button
        onClick={calculate}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
      >
        Calculate
      </button>

      {calculationError && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-md">
          {calculationError}
        </div>
      )}

      {totalHours !== null && (
        <div className="mt-6 space-y-4" ref={resultsRef}>
          <div>
            <h3 className="text-lg font-medium">Total Labor Hours: <span className="text-blue-600">{totalHours.toFixed(2)} hours</span></h3>

            <div className="mt-2">
              <h4 className="font-medium text-gray-700 mb-2">Task Breakdown:</h4>
              <ul className="space-y-1 pl-5 list-disc">
                {taskBreakdown.map((task, index) => (
                  <li key={index} className="text-sm">
                    <span className="font-medium">{task.task}:</span> {task.hours.toFixed(2)} hours
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">Materials Required:</h3>
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
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price per Unit
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {materials.map((material, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.unit}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.price_per_unit ? `£${material.price_per_unit.toFixed(2)}` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.total_price ? `£${material.total_price.toFixed(2)}` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total price row */}
              <div className="mt-4 text-right pr-6">
                <p className="text-sm font-medium">
                  Total Cost: {
                    materials.some(m => m.total_price !== null)
                      ? `£${materials.reduce((sum: number, m: Material) => sum + (m.total_price || 0), 0).toFixed(2)}`
                      : 'N/A'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeckCalculator;
