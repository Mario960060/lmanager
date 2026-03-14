import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { computeDeckCalculation } from './deckCalculatorLogic';
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
  CalculatorInputGrid,
  SelectDropdown,
  Checkbox,
  Button,
  Card,
  Label,
  DataTable,
} from '../../themes/uiComponents';

interface DeckCalculatorProps {
  onResultsChange?: (results: any) => void;
  onInputsChange?: (inputs: Record<string, any>) => void;
  isInProjectCreating?: boolean;
  initialArea?: number;
  savedInputs?: Record<string, any>;
  calculateTransport?: boolean;
  setCalculateTransport?: (value: boolean) => void;
  selectedTransportCarrier?: any;
  setSelectedTransportCarrier?: (value: any) => void;
  transportDistance?: string;
  setTransportDistance?: (value: string) => void;
  carriers?: any[];
  selectedExcavator?: any;
  recalculateTrigger?: number;
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
  onInputsChange,
  isInProjectCreating = false,
  initialArea,
  savedInputs = {},
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  setSelectedTransportCarrier: propSetSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  setTransportDistance: propSetTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator,
  recalculateTrigger = 0
}) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());

  // Inputs
  const sq = initialArea != null ? Math.sqrt(initialArea) : NaN;
  const initLen = savedInputs?.totalLength != null ? String(savedInputs.totalLength) : (!isNaN(sq) ? sq.toFixed(3) : '');
  const initWid = savedInputs?.totalWidth != null ? String(savedInputs.totalWidth) : (!isNaN(sq) ? sq.toFixed(3) : '');
  const [totalLength, setTotalLength] = useState(initLen);
  const [totalWidth, setTotalWidth] = useState(initWid);
  useEffect(() => {
    if (savedInputs?.totalLength != null) setTotalLength(String(savedInputs.totalLength));
    if (savedInputs?.totalWidth != null) setTotalWidth(String(savedInputs.totalWidth));
    if (savedInputs?.totalLength == null && savedInputs?.totalWidth == null && initialArea != null && initialArea > 0 && isInProjectCreating) {
      const s = Math.sqrt(initialArea).toFixed(3);
      setTotalLength(s);
      setTotalWidth(s);
    }
  }, [savedInputs?.totalLength, savedInputs?.totalWidth, initialArea, isInProjectCreating]);
  const [joistLength, setJoistLength] = useState(savedInputs?.joistLength ?? '');
  const [distanceBetweenJoists, setDistanceBetweenJoists] = useState(savedInputs?.distanceBetweenJoists ?? '');
  const [boardLength, setBoardLength] = useState(savedInputs?.boardLength ?? '');
  const [boardWidth, setBoardWidth] = useState(savedInputs?.boardWidth ?? '');
  const [jointGaps, setJointGaps] = useState(savedInputs?.jointGaps ?? '');
  const [pattern, setPattern] = useState(savedInputs?.pattern ?? 'Length');
  const [patternRotationDeg, setPatternRotationDeg] = useState<string>(String(savedInputs?.patternRotationDeg ?? '0'));
  const [includeFrame, setIncludeFrame] = useState(savedInputs?.includeFrame ?? false);
  const [frameJointType, setFrameJointType] = useState<'butt' | 'miter45'>(savedInputs?.frameJointType ?? 'butt');
  const [halfShift, setHalfShift] = useState(savedInputs?.halfShift ?? false);
  const [postmixPerPost, setPostmixPerPost] = useState<string>(savedInputs?.postmixPerPost ?? '');
  useEffect(() => {
    if (onInputsChange && isInProjectCreating) {
      onInputsChange({ totalLength, totalWidth, joistLength, distanceBetweenJoists, boardLength, boardWidth, jointGaps, pattern, patternRotationDeg, includeFrame, frameJointType, halfShift, postmixPerPost });
    }
  }, [totalLength, totalWidth, joistLength, distanceBetweenJoists, boardLength, boardWidth, jointGaps, pattern, patternRotationDeg, includeFrame, frameJointType, halfShift, postmixPerPost, onInputsChange, isInProjectCreating]);
  useEffect(() => {
    if (savedInputs?.includeFrame !== undefined) setIncludeFrame(!!savedInputs.includeFrame);
    if (savedInputs?.frameJointType === 'butt' || savedInputs?.frameJointType === 'miter45') setFrameJointType(savedInputs.frameJointType);
  }, [savedInputs?.includeFrame, savedInputs?.frameJointType]);
  useEffect(() => {
    if (savedInputs?.pattern != null) setPattern(savedInputs.pattern);
    if (savedInputs?.patternRotationDeg != null) setPatternRotationDeg(String(savedInputs.patternRotationDeg));
  }, [savedInputs?.pattern, savedInputs?.patternRotationDeg]);

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

  const effectiveCalculateTransport = isInProjectCreating ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSelectedTransportCarrier = isInProjectCreating ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;
  const effectiveTransportDistance = isInProjectCreating && propTransportDistance ? propTransportDistance : transportDistance;

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


      // Convert array to object for easy lookup
      const taskMap: Record<string, any> = {};
      if (data) {
        data.forEach(task => {
          taskMap[task.name] = task;
        });
      }
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

    if (effectiveCalculateTransport) {
      fetchEquipment();
    }
  }, [effectiveCalculateTransport]);

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

      // ===== DECKING BOARDS CALCULATION (uses deckCalculatorLogic) =====
      const calc = computeDeckCalculation({
        totalLength: tl,
        totalWidth: tw,
        joistLength: jl,
        distanceBetweenJoists: dbj,
        boardLength: bl,
        boardWidth: bw,
        jointGaps: jg,
        pattern: pattern as 'Length' | 'Width' | '45 degree angle',
        halfShift,
        includeFrame,
      });

      const {
        totalBoards,
        frameBoards,
        totalBoardCuts,
        bearersInRow,
        bearerRows,
        joistsInRow,
        joistRows,
        postsPerRow,
        postRows,
        totalBearers,
        totalJoists,
        totalPosts,
      } = calc;

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
      const joistCutsTask = taskTemplates['cutting decking joists'];
      if (joistCutsTask && joistCutsTask.estimated_hours && joistCutsTask.name) {
        breakdown.push({
          task: joistCutsTask.name,
          hours: totalJoistCuts * joistCutsTask.estimated_hours,
          amount: `${totalJoistCuts}`,
          unit: 'cuts'
        });
      }

      // Decking frame boards cuts (if includeFrame is checked)
      if (includeFrame && frameBoards > 0) {
        const frameTask = taskTemplates['decking frame boards cuts'];
        if (frameTask && frameTask.estimated_hours && frameTask.name) {
          breakdown.push({
            task: frameTask.name,
            hours: frameBoards * frameTask.estimated_hours,
            amount: `${frameBoards}`,
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

      if (effectiveCalculateTransport) {
        let carrierSizeForTransport = 0.125;

        if (effectiveSelectedTransportCarrier) {
          carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
        }

        const distanceVal = parseFloat(effectiveTransportDistance) || 30;

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

  // Recalculate when project settings (transport, equipment) change
  useEffect(() => {
    if (recalculateTrigger > 0 && isInProjectCreating) {
      void calculate();
    }
  }, [recalculateTrigger]);

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
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
      <h2 style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.bold, color: colors.textPrimary, fontFamily: fonts.display, marginBottom: spacing.sm }}>
        {t('calculator:decking_standard_calculator_title')}
      </h2>
      <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, lineHeight: 1.5 }}>
        Calculate materials, time, and costs for decking installation projects.
      </p>

      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`} style={{ marginBottom: spacing["5xl"] }}>
        <CalculatorInputGrid columns={2}>
          <TextInput label={t('calculator:input_length_m')} value={totalLength} onChange={setTotalLength} placeholder={t('calculator:placeholder_enter_length_m')} unit="m" helperText={t('calculator:along_direction_boards_run')} />
          <TextInput label={t('calculator:input_width_m')} value={totalWidth} onChange={setTotalWidth} placeholder={t('calculator:placeholder_enter_width')} unit="m" />
          <TextInput label={t('calculator:deck_joist_length_label')} value={joistLength} onChange={setJoistLength} placeholder={t('calculator:each_joist_length')} unit="m" />
          <TextInput label={t('calculator:deck_distance_between_joists_label')} value={distanceBetweenJoists} onChange={setDistanceBetweenJoists} placeholder={t('calculator:distance_spacing')} unit="m" />
          <TextInput label={t('calculator:deck_board_length_label')} value={boardLength} onChange={setBoardLength} placeholder={t('calculator:each_board_length')} unit="m" />
          <TextInput label={t('calculator:deck_board_width_label')} value={boardWidth} onChange={setBoardWidth} placeholder={t('calculator:board_width')} unit="m" />
          <TextInput label={t('calculator:deck_gaps_between_boards_label')} value={jointGaps} onChange={setJointGaps} placeholder={t('calculator:gap_between_boards')} unit="mm" />
          <TextInput label={t('calculator:postmix_per_post_label')} value={postmixPerPost} onChange={setPostmixPerPost} placeholder={t('calculator:enter_postmix_per_post')} />
        </CalculatorInputGrid>

        <SelectDropdown
          label={t('calculator:pattern_label')}
          value={pattern === 'Length' ? t('calculator:length_option') : pattern === 'Width' ? 'Width (90° from Length)' : t('calculator:degree_angle_option')}
          options={[t('calculator:length_option'), 'Width (90° from Length)', t('calculator:degree_angle_option')]}
          onChange={(val) => setPattern(val === t('calculator:length_option') ? 'Length' : val === 'Width (90° from Length)' ? 'Width' : '45 degree angle')}
          placeholder={t('calculator:pattern_label')}
        />
        <TextInput label={t('calculator:pattern_rotation') ?? 'Pattern rotation (°)'} value={patternRotationDeg} onChange={setPatternRotationDeg} placeholder="0" unit="°" />
        <Checkbox label={t('calculator:deck_pattern_staggered')} checked={halfShift} onChange={setHalfShift} />
        <Checkbox label={t('calculator:include_frame')} checked={includeFrame} onChange={setIncludeFrame} />
        {includeFrame && (
          <SelectDropdown
            label={t('calculator:frame_joint_type_label')}
            value={frameJointType === 'miter45' ? t('calculator:frame_joint_miter45') : t('calculator:frame_joint_butt')}
            options={[t('calculator:frame_joint_butt'), t('calculator:frame_joint_miter45')]}
            onChange={(val) => setFrameJointType(val === t('calculator:frame_joint_miter45') ? 'miter45' : 'butt')}
            placeholder={t('calculator:frame_joint_butt')}
          />
        )}
        {!isInProjectCreating && (
          <Checkbox label={t('calculator:calculate_transport_time_label')} checked={calculateTransport} onChange={setCalculateTransport} />
        )}

        {!isInProjectCreating && effectiveCalculateTransport && (
          <>
            <div>
              <Label>{t('calculator:transport_carrier_label')} ({t('calculator:default_wheelbarrow')})</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: spacing.md,
                    cursor: 'pointer',
                    borderRadius: radii.lg,
                    border: `2px dashed ${colors.borderInput}`,
                    background: effectiveSelectedTransportCarrier === null ? colors.bgHover : 'transparent',
                  }}
                  onClick={() => setSelectedTransportCarrier(null)}
                >
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: radii.full,
                    border: `2px solid ${colors.borderMedium}`,
                    marginRight: spacing.md,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {effectiveSelectedTransportCarrier === null && (
                      <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.textSubtle }} />
                    )}
                  </div>
                  <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{t('calculator:default_wheelbarrow')}</span>
                </div>
                {carriers.length > 0 && carriers.map((carrier) => (
                  <div
                    key={carrier.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: spacing.md,
                      cursor: 'pointer',
                      borderRadius: radii.lg,
                      background: effectiveSelectedTransportCarrier?.id === carrier.id ? colors.bgHover : 'transparent',
                    }}
                    onClick={() => setSelectedTransportCarrier(carrier)}
                  >
                    <div style={{
                      width: 16,
                      height: 16,
                      borderRadius: radii.full,
                      border: `2px solid ${colors.borderMedium}`,
                      marginRight: spacing.md,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {effectiveSelectedTransportCarrier?.id === carrier.id && (
                        <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.textSubtle }} />
                      )}
                    </div>
                    <div>
                      <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{carrier.name}</span>
                      <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing.md }}>({carrier["size (in tones)"]} tons)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <TextInput label={t('calculator:transport_distance_label')} value={transportDistance} onChange={setTransportDistance} placeholder={t('calculator:placeholder_enter_transport_distance')} />
          </>
        )}

        <Button onClick={calculate} variant="primary" fullWidth>
          {t('calculator:calculate_button')}
        </Button>

        {calculationError && (
          <div style={{ padding: spacing.base, background: 'rgba(239,68,68,0.15)', border: `1px solid ${colors.red}`, borderRadius: radii.lg, color: colors.textPrimary, marginTop: spacing.xl }}>
            {calculationError}
          </div>
        )}

        {totalHours !== null && (
          <div style={{ marginTop: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }} ref={resultsRef}>
            <Card style={{ background: gradients.blueCard, border: `1px solid ${colors.accentBlueBorder}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.lg }}>
                <span style={{ fontSize: fontSizes.md, color: colors.textSubtle, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>
                  {t('calculator:total_labor_hours_label')}
                </span>
                <span style={{ fontSize: fontSizes["4xl"], fontWeight: fontWeights.extrabold, color: colors.accentBlue, fontFamily: fonts.display }}>
                  {totalHours.toFixed(2)}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                {taskBreakdown.map((task, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: `${spacing.lg}px ${spacing["2xl"]}px`,
                      background: colors.bgSubtle,
                      borderRadius: radii.lg,
                      border: `1px solid ${colors.borderLight}`,
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
              rows={materials.map((m) => ({
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
                    {materials.some(m => m.total_price !== null)
                      ? `£${materials.reduce((sum: number, m: Material) => sum + (m.total_price || 0), 0).toFixed(2)}`
                      : t('calculator:not_available')}
                  </span>
                </div>
              }
            />
          </div>
        )}
      </Card>
    </div>
  );
};

export default DeckCalculator;
