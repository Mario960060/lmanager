import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName } from '../../lib/translationMap';

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
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
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
  const [halfShift, setHalfShift] = useState(false);
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
      setCalculationError(t('calculator:fill_all_required_fields'));
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
        setCalculationError(t('calculator:valid_numbers_required'));
        return;
      }

      // ===== DECKING BOARDS CALCULATION =====
      const boardWidth_m = bw / 100; // Convert cm to m
      const jointGaps_m = jg / 1000; // Convert mm to m
      const sqrt2 = Math.sqrt(2);

      let boardsPerRow: number;
      let rowsNeeded: number;
      let bearersInRow: number;
      let bearerRows: number;
      let joistsInRow: number;
      let joistRows: number;
      let postsPerRow: number;
      let postRows: number;
      let totalBoardCuts: number;

      // ===== PATTERN-SPECIFIC CALCULATIONS =====
      let totalBoards = 0; // Declare here for both patterns
      
      if (pattern === '45 degree angle') {
        console.log('Using 45° angle pattern');

        // 45° ANGLE PATTERN - PRECISE CALCULATION
        const d = Math.sqrt(tl * tl + tw * tw); // Diagonal = longest row
        const t = boardWidth_m + jointGaps_m; // Row width
        const delta = 1.414 * t; // Row length decrease per row
        const effectiveLengthForJoists = (tl + tw) / sqrt2;

        // Calculate boards per row accurately
        let totalBoardsCalculated = 0;
        let actualRowsNeeded = 0;
        
        for (let i = 0; ; i++) {
          // Calculate row length
          let Li;
          if (halfShift) {
            Li = d - (i + 0.5) * delta;
          } else {
            Li = d - i * delta;
          }
          
          // Stop when row length becomes zero or negative
          if (Li <= 0) break;
          
          actualRowsNeeded++;
          
          // Calculate boards needed for this row
          let boardsInThisRow;
          if (halfShift) {
            boardsInThisRow = Math.ceil((Li + bl / 2) / bl);
          } else {
            boardsInThisRow = Math.ceil(Li / bl);
          }
          
          totalBoardsCalculated += boardsInThisRow;
        }
        
        rowsNeeded = actualRowsNeeded;
        
        // Override boardsPerRow calculation - it's now calculated above
        // We'll use totalBoardsCalculated later instead of boardsPerRow * rowsNeeded

        // Bearers
        bearersInRow = Math.ceil(effectiveLengthForJoists / jl);
        bearerRows = Math.ceil((d / 1.8)) + 1;

        // Joists
        joistsInRow = Math.ceil(effectiveLengthForJoists / jl);
        joistRows = Math.ceil(d / dbj) + 1;

        // Posts
        postsPerRow = Math.ceil(effectiveLengthForJoists / 1.8) + 1;
        postRows = Math.ceil(d / 1.8) + 1;

        // Cięcia - ZAWSZE 2 na rząd dla 45°
        totalBoardCuts = rowsNeeded * 2;
        
        // Use precise calculation instead of average
        totalBoards = totalBoardsCalculated;
      } else {
        // DEFAULT (LENGTH) PATTERN
        console.log('Using default length pattern');

        // Deski
        boardsPerRow = Math.ceil(tl / bl);
        rowsNeeded = Math.ceil(tw / (boardWidth_m + jointGaps_m));

        // Bearers
        bearersInRow = Math.ceil(tl / jl);
        bearerRows = Math.ceil(tw / 1.8) + 1;

        // Joists
        joistsInRow = Math.ceil(tw / jl);
        joistRows = Math.ceil(tl / dbj) + 1;

        // Posts
        postsPerRow = Math.ceil(tl / 1.8) + 1;
        postRows = Math.ceil(tw / 1.8) + 1;

        // Cięcia - alternacja 1-2-1-2 (średnia 1.5 na rząd)
        totalBoardCuts = Math.ceil(rowsNeeded * 1.5);
        
        // For Length pattern, use simple calculation
        totalBoards = Math.ceil(boardsPerRow * rowsNeeded);
      }

      // ===== FRAME BOARDS CALCULATION (if includeFrame is checked) =====
      // Frame calculation: ((total_length - board_width) / board_length) + ((total_length - board_width) / board_length) + ((total_width - board_width) / board_length) + ((total_width - board_width) / board_length)
      let frameBoards = 0;
      if (includeFrame) {
        const adjustedLength = (tl - boardWidth_m) / bl;
        const adjustedWidth = (tw - boardWidth_m) / bl;
        
        frameBoards = Math.ceil(adjustedLength + adjustedLength + adjustedWidth + adjustedWidth);
        totalBoards += frameBoards;
      }

      // ===== MATERIAL COUNTS (using pattern-specific values from above) =====
      const totalBearers = Math.ceil(bearersInRow * bearerRows);
      const totalJoists = Math.ceil(joistsInRow * joistRows);
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
          amount: `${totalPosts}`,
          unit: 'posts'
        });
      }

      // Setting up posts
      const settingPostsTask = taskTemplates['setting up posts'];
      if (settingPostsTask && settingPostsTask.estimated_hours && settingPostsTask.name) {
        breakdown.push({
          task: settingPostsTask.name,
          hours: totalPosts * settingPostsTask.estimated_hours,
          amount: `${totalPosts}`,
          unit: 'posts'
        });
      }

      // Decking board cuts
      const boardCutsTask = taskTemplates['decking boards cuts'];
      if (boardCutsTask && boardCutsTask.estimated_hours && boardCutsTask.name) {
        breakdown.push({
          task: boardCutsTask.name,
          hours: totalBoardCuts * boardCutsTask.estimated_hours,
          amount: `${totalBoardCuts}`,
          unit: 'cuts'
        });
      }

      // Cutting decking joists (joists + bearers)
      const totalJoistCuts = joistRows + bearerRows;
      const joistCutsTask = taskTemplates['cutting decking  joists'];
      if (joistCutsTask && joistCutsTask.estimated_hours && joistCutsTask.name) {
        breakdown.push({
          task: joistCutsTask.name,
          hours: totalJoistCuts * joistCutsTask.estimated_hours,
          amount: `${totalJoistCuts}`,
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
            amount: `${Math.ceil(frameBoards)}`,
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
          amount: `${totalJoists}`,
          unit: 'joists'
        });
      }

      // Fixing decking boards
      const fixingBoardsTask = taskTemplates['fixing decking boards'];
      if (fixingBoardsTask && fixingBoardsTask.estimated_hours && fixingBoardsTask.name) {
        breakdown.push({
          task: fixingBoardsTask.name,
          hours: totalBoards * fixingBoardsTask.estimated_hours,
          amount: `${totalBoards}`,
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
              amount: `${totalBoards}`,
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
              amount: `${totalJoists}`,
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
              amount: `${totalBearers}`,
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
              amount: `${totalPosts}`,
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
              amount: `${totalPostmix}`,
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
      setCalculationError(t('calculator:calculation_error'));
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
      <h2 className="text-lg font-semibold">{t('calculator:decking_standard_calculator_title')}</h2>
      <p className="text-sm text-gray-600">
        Calculate materials, time, and costs for decking installation projects.
      </p>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_length_in_cm')}</label>
          <p className="text-xs text-red-600 mb-1">{t('calculator:along_direction_boards_run')}</p>
          <input
            type="number"
            value={totalLength}
            onChange={(e) => setTotalLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder={t('calculator:placeholder_enter_length')}
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_width_in_cm')}</label>
          <input
            type="number"
            value={totalWidth}
            onChange={(e) => setTotalWidth(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder={t('calculator:placeholder_enter_width')}
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_slat_length_cm')}</label>
          <input
            type="number"
            value={joistLength}
            onChange={(e) => setJoistLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder={t('calculator:each_joist_length')}
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_gaps_between_slats_mm')}</label>
          <input
            type="number"
            value={distanceBetweenJoists}
            onChange={(e) => setDistanceBetweenJoists(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder={t('calculator:distance_spacing')}
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_slat_length_cm')}</label>
          <input
            type="number"
            value={boardLength}
            onChange={(e) => setBoardLength(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder={t('calculator:each_board_length')}
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_slat_width_cm')}</label>
          <input
            type="number"
            value={boardWidth}
            onChange={(e) => setBoardWidth(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder={t('calculator:board_width')}
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:joint_gaps_label')}</label>
          <input
            type="number"
            value={jointGaps}
            onChange={(e) => setJointGaps(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder={t('calculator:gap_between_boards')}
            step="0.1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:postmix_per_post_label')}</label>
            <input
              type="number"
              value={postmixPerPost}
              onChange={(e) => setPostmixPerPost(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder={t('calculator:enter_postmix_per_post')}
            min="0"
            step="0.1"
          />
        </div>
      </div>

      {/* Pattern and Frame */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:pattern_label')}</label>
          <select
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="Length">Length</option>
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
            <span className="text-sm font-medium text-gray-700">{t('calculator:include_frame')}</span>
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
        <span className="text-sm font-medium text-gray-700">{t('calculator:calculate_transport_time_label')}</span>
      </label>

      {/* Transport Carrier Selection */}
      {calculateTransport && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:transport_carrier_label')} ({t('calculator:default_wheelbarrow')})</label>
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

      <button
        onClick={calculate}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
      >
        {t('calculator:calculate_button')}
      </button>

      {calculationError && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-md">
          {calculationError}
        </div>
      )}

      {totalHours !== null && (
        <div className="mt-6 space-y-4" ref={resultsRef}>
          <div>
            <h3 className="text-lg font-medium">{t('calculator:total_labor_hours_label')} <span className="text-blue-600">{totalHours.toFixed(2)} {t('calculator:hours_abbreviation')}</span></h3>

            <div className="mt-2">
              <h4 className="font-medium text-gray-700 mb-2">{t('calculator:task_breakdown_label')}</h4>
              <ul className="space-y-1 pl-5 list-disc">
                {taskBreakdown.map((task, index) => (
                  <li key={index} className="text-sm">
                    <span className="font-medium">{translateTaskName(task.task, t)}:</span> {task.hours.toFixed(2)} hours
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {material.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {material.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {material.unit}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {material.price_per_unit ? `£${material.price_per_unit.toFixed(2)}` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
