  import React, { useState, useEffect, useRef } from 'react';
  import { useQuery } from '@tanstack/react-query';
  import { useTranslation } from 'react-i18next';
  import { supabase } from '../../lib/supabase';
  import { useAuthStore } from '../../lib/store';
  import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
  import { colors, fontSizes, fontWeights, spacing, radii } from '../../themes/designTokens';

  interface SlabFrameCalculatorProps {
    isOpen: boolean;
    onClose: () => void;
    selectedSlabType?: {
      id: number;
      name: string;
      unit: string;
      estimated_hours: number;
      is_porcelain: boolean;
    } | null;
    cuttingTasks?: Array<{
      id: string;
      name: string;
      unit: string;
      estimated_hours: number;
    }>;
    onResultsChange?: (results: {
      totalFrameSlabs: number;
      totalHours: number;
      totalFrameAreaM2: number;
      sides: Array<{ length: number; slabs: number }>;
      taskName: string;
      task_id?: string;
      framePieceLengthCm?: string;
      framePieceWidthCm?: string;
      cuttingHours: number;
      cuttingTaskName: string;
      cutting_task_id?: string;
    }) => void;
  }

  interface DiggingEquipment {
    id: string;
    name: string;
    'size (in tones)': number | null;
    speed_m_per_hour?: number | null;
    company_id?: string | null;
    type?: string;
  }

  const SlabFrameCalculator: React.FC<SlabFrameCalculatorProps> = ({ isOpen, onClose, selectedSlabType, cuttingTasks = [], onResultsChange }) => {
    const { t } = useTranslation(['calculator', 'utilities', 'common']);
    const companyId = useAuthStore(state => state.getCompanyId());
    const [pieceLengthCm, setPieceLengthCm] = useState<string>('');
    const [pieceWidthCm, setPieceWidthCm] = useState<string>('');
    const [sideLength, setSideLength] = useState<string>('');
    const [sides, setSides] = useState<Array<{ length: number; slabs: number }>>([]);
    const [results, setResults] = useState<{
      totalFrameSlabs: number;
      totalHours: number;
      totalFrameAreaM2: number;
      taskName: string;
      task_id?: string;
      framePieceLengthCm?: string;
      framePieceWidthCm?: string;
      cuttingHours: number;
      cuttingTaskName: string;
      cutting_task_id?: string;
      transportTime?: number;
      normalizedTransportTime?: number;
    } | null>(null);
    const [transportDistance, setTransportDistance] = useState<string>('30');
    const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
    const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
    const resultsRef = useRef<HTMLDivElement>(null);

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

    // Add useEffect to recalculate when selectedSlabType changes
    useEffect(() => {
      if (results) {
        calculate();
      }
    }, [selectedSlabType]);

    // Scroll to results when they appear
    useEffect(() => {
      if (results && resultsRef.current) {
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 100);
      }
    }, [results]);

    // Fetch task templates for slab frame laying
    const { data: frameTaskTemplates = [] } = useQuery({
      queryKey: ['slab_frame_tasks', companyId || 'no-company'],
      queryFn: async () => {
        if (!companyId) return [];
        const { data, error } = await supabase
          .from('event_tasks_with_dynamic_estimates')
          .select('id, name, unit, estimated_hours')
          .eq('company_id', companyId)
          .or('name.ilike.%laying slab frame belove 0.3m2%,name.ilike.%laying slab frame above 0.3m2%')
          .order('name');
        
        if (error) {
          console.error('Error fetching frame tasks:', error);
          throw error;
        }
        return data;
      },
      enabled: !!companyId
    });

    const addSide = () => {
      if (!sideLength || !pieceLengthCm) return;
      
      const sideLengthM = parseFloat(sideLength);
      const pieceLengthM = parseFloat(pieceLengthCm) / 100; // Convert cm to meters
      
      // Calculate number of slabs needed (round up)
      const slabsNeeded = Math.ceil(sideLengthM / pieceLengthM);
      
      const newSide = {
        length: sideLengthM,
        slabs: slabsNeeded
      };
      
      setSides(prev => [...prev, newSide]);
      setSideLength(''); // Clear input
    };

    const removeSide = (index: number) => {
      setSides(prev => prev.filter((_, i) => i !== index));
    };

    const calculate = () => {
      if (!pieceLengthCm || !pieceWidthCm || sides.length === 0) return;

      // Calculate piece area in m²
      const lengthM = parseFloat(pieceLengthCm) / 100;
      const widthM = parseFloat(pieceWidthCm) / 100;
      const pieceAreaM2 = lengthM * widthM;

      // Determine which task template to use
      const taskName = pieceAreaM2 < 0.3 
        ? 'laying slab frame belove 0.3m2' 
        : 'laying slab frame above 0.3m2';

      const frameTask = frameTaskTemplates.find(task => 
        task.name && task.name.toLowerCase().includes(taskName.toLowerCase())
      );

      // Calculate total frame slabs needed
      const totalFrameSlabs = sides.reduce((sum, side) => sum + side.slabs, 0);

      // Calculate total hours for laying frame slabs
      let totalHours = 0;
      if (frameTask && frameTask.estimated_hours !== undefined && frameTask.estimated_hours !== null) {
        // Assuming the task is per piece/slab
        totalHours = totalFrameSlabs * frameTask.estimated_hours;
      }

      // Calculate cutting hours (3 cuts per side)
      let cuttingHours = 0;
      let cuttingTaskName = '';
      let cuttingTaskId: string | undefined = undefined;
      const totalCuts = sides.length * 3; // 3 cuts per side

      if (selectedSlabType && totalCuts > 0) {
        const isPorcelain = selectedSlabType.name.toLowerCase().includes('slab') && 
                          !selectedSlabType.name.toLowerCase().includes('sandstone');
        
        const cuttingTaskSearchName = isPorcelain ? 'cutting porcelain' : 'cutting sandstones';
        const cuttingTask = cuttingTasks.find(task => 
          task.name.toLowerCase().includes(cuttingTaskSearchName)
        );
        
        if (cuttingTask && cuttingTask.estimated_hours !== undefined) {
          cuttingHours = totalCuts * cuttingTask.estimated_hours;
          cuttingTaskName = `${cuttingTask.name} (frame)`;
          cuttingTaskId = cuttingTask.id;
        } else {
          // Fallback calculation
          const minutesPerCut = isPorcelain ? 6 : 4;
          cuttingHours = (totalCuts * minutesPerCut) / 60;
          cuttingTaskName = isPorcelain ? 'Cutting porcelain (frame)' : 'Cutting sandstones (frame)';
        }
      }

      // Calculate total frame area in m²
      const totalFrameAreaM2 = sides.reduce((sum, side) => sum + side.length * widthM, 0);

      // Calculate transport time if enabled
      let transportTime = 0;
      let normalizedTransportTime = 0;

      if (calculateTransport && totalFrameSlabs > 0) {
        let carrierSizeForTransport = 0.125;
        
        if (selectedTransportCarrier) {
          carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
        }

        const transportResult = calculateMaterialTransportTime(totalFrameSlabs, carrierSizeForTransport, 'slabs', parseFloat(transportDistance) || 30);
        transportTime = transportResult.totalTransportTime;
        // Do NOT normalize transport time for frame slabs - just use actual transport time
      }

      // Add cutting hours to total hours (do NOT add transport - that's calculated in SlabCalculator)
      const finalTotalHours = totalHours + cuttingHours;

      const calculationResults = {
        totalFrameSlabs,
        totalHours: finalTotalHours,
        totalFrameAreaM2,
        taskName: frameTask?.name || taskName,
        task_id: frameTask?.id,
        sides: [...sides],
        frameSlabsName: `Frame slabs ${pieceLengthCm}x${pieceWidthCm}`,
        cuttingHours,
        cuttingTaskName,
        cutting_task_id: cuttingTaskId,
        transportTime,
        normalizedTransportTime
      };

      setResults(calculationResults as any);
      
      if (onResultsChange) {
        onResultsChange(calculationResults as any);
      }
    };

    const clearAll = () => {
      setPieceLengthCm('');
      setPieceWidthCm('');
      setSideLength('');
      setSides([]);
      setResults(null);
    };

    if (!isOpen) return null;

    return (
      <div style={{ position: "fixed", inset: 0, background: colors.bgModalBackdrop, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
        <div style={{ background: colors.bgCard, borderRadius: radii.lg, padding: spacing["6xl"], width: "100%", maxWidth: 672, maxHeight: "80vh", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing["6xl"] }}>
            <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary }}>{t('calculator:slab_frame_calculator_title')}</h2>
            <button
              onClick={onClose}
              style={{ color: colors.textSubtle, fontSize: fontSizes["2xl"], background: "none", border: "none", cursor: "pointer" }}
            >
              ×
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: spacing["3xl"] }}>
            {/* Piece Dimensions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: spacing["3xl"] }}>
              <div>
                <label style={{ display: "block", fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:piece_length_cm_label')}</label>
                <input
                  type="number"
                  value={pieceLengthCm}
                  onChange={(e) => setPieceLengthCm(e.target.value)}
                  style={{ marginTop: spacing.xs, display: "block", width: "100%", borderRadius: radii.md, border: `1px solid ${colors.borderInput}`, padding: `${spacing.sm}px ${spacing.xl}px`, background: colors.bgInput, color: colors.textPrimary, fontSize: fontSizes.base, outline: "none" }}
                  placeholder={t('calculator:enter_length_cm')}
                  min="0"
                  step="0.1"
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:piece_width_cm_label')}</label>
                <input
                  type="number"
                  value={pieceWidthCm}
                  onChange={(e) => setPieceWidthCm(e.target.value)}
                  style={{ marginTop: spacing.xs, display: "block", width: "100%", borderRadius: radii.md, border: `1px solid ${colors.borderInput}`, padding: `${spacing.sm}px ${spacing.xl}px`, background: colors.bgInput, color: colors.textPrimary, fontSize: fontSizes.base, outline: "none" }}
                  placeholder={t('calculator:enter_width_cm')}
                  min="0"
                  step="0.1"
                />
              </div>
            </div>

            {/* Side Length Input */}
            <div>
              <label style={{ display: "block", fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:add_side_length_label')}</label>
              <p style={{ fontSize: fontSizes.xs, color: colors.textDim, marginBottom: spacing.xs }}>{t('calculator:add_separate_every_single_side')}</p>
              <div style={{ display: "flex", gap: spacing.xs }}>
                <input
                  type="number"
                  value={sideLength}
                  onChange={(e) => setSideLength(e.target.value)}
                  style={{ flex: 1, borderRadius: radii.md, border: `1px solid ${colors.borderInput}`, padding: `${spacing.sm}px ${spacing.xl}px`, background: colors.bgInput, color: colors.textPrimary, fontSize: fontSizes.base, outline: "none" }}
                  placeholder={t('calculator:enter_side_length_meters')}
                  min="0"
                  step="0.01"
                />
                <button
                  onClick={addSide}
                  disabled={!sideLength || !pieceLengthCm}
                  style={{ padding: `${spacing.xs}px ${spacing["3xl"]}px`, background: colors.accentBlue, color: colors.textOnAccent, borderRadius: radii.md, border: "none", cursor: "pointer", fontWeight: fontWeights.medium, opacity: (!sideLength || !pieceLengthCm) ? 0.5 : 1 }}
                >
                  {t('calculator:confirm_button')}
                </button>
              </div>
            </div>

            {/* Added Sides List */}
            {sides.length > 0 && (
              <div>
                <h3 style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.xs }}>{t('calculator:added_sides_label')}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
                  {sides.map((side, index) => (
                    <div key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: spacing.xs, background: colors.bgSubtle, borderRadius: radii.md }}>
                      <span style={{ fontSize: fontSizes.sm, color: colors.textMuted }}>
                        {t('calculator:side_n_format', { n: index + 1 })}: {side.length}m → {side.slabs} {t('calculator:frame_slabs_label')}
                      </span>
                      <button
                        onClick={() => removeSide(index)}
                        style={{ color: colors.red, fontSize: fontSizes.sm, background: "none", border: "none", cursor: "pointer" }}
                      >
                        {t('calculator:remove_button')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transport Distance */}
            {calculateTransport && (
              <div style={{ marginBottom: spacing["3xl"] }}>
                <label style={{ display: "block", fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.xs }}>{t('calculator:transport_distance_label')}</label>
                <input
                  type="number"
                  value={transportDistance}
                  onChange={(e) => setTransportDistance(e.target.value)}
                  style={{ width: "100%", padding: spacing.xs, border: `1px solid ${colors.borderInput}`, borderRadius: radii.md, background: colors.bgInput, color: colors.textPrimary }}
                  placeholder={t('calculator:placeholder_enter_transport_distance')}
                  min="0"
                  step="1"
                />
              </div>
            )}

            <div style={{ marginBottom: spacing["3xl"] }}>
              <label style={{ display: "inline-flex", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={calculateTransport}
                  onChange={(e) => setCalculateTransport(e.target.checked)}
                  style={{ borderRadius: radii.sm, border: `1px solid ${colors.borderInput}` }}
                />
                <span style={{ marginLeft: spacing.xs, fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:calculate_transport_time_label')}</span>
              </label>
            </div>

            {calculateTransport && (
              <div style={{ marginBottom: spacing["3xl"] }}>
                <label style={{ display: "block", fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.xs }}>{t('calculator:transport_carrier_label')}</label>
                <select
                  value={selectedTransportCarrier?.id || ''}
                  onChange={(e) => {
                    if (e.target.value === 'default') {
                      setSelectedTransportCarrier({ id: 'default', name: '0.125t Wheelbarrow', 'size (in tones)': 0.125 });
                    } else if (e.target.value) {
                      const carrier = carrierSpeeds.find(c => c.size.toString() === e.target.value);
                      if (carrier) {
                        setSelectedTransportCarrier({
                          id: carrier.size.toString(),
                          name: `${carrier.size}t Carrier`,
                          'size (in tones)': carrier.size
                        });
                      }
                    }
                  }}
                  style={{ width: "100%", padding: spacing.xs, border: `1px solid ${colors.borderInput}`, borderRadius: radii.md, background: colors.bgInput, color: colors.textPrimary }}
                >
                  <option value="">-- {t('calculator:select_carrier_label')} --</option>
                  <option value="default">{t('calculator:default_wheelbarrow')}</option>
                  {carrierSpeeds.map(carrier => (
                    <option key={carrier.size} value={carrier.size.toString()}>
                      {carrier.size}t Carrier
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: spacing.xs }}>
              <button
                onClick={calculate}
                disabled={!pieceLengthCm || !pieceWidthCm || sides.length === 0}
                style={{ flex: 1, background: colors.green, color: colors.textOnAccent, padding: `${spacing.xs}px ${spacing["3xl"]}px`, borderRadius: radii.md, border: "none", cursor: "pointer", fontWeight: fontWeights.medium, opacity: (!pieceLengthCm || !pieceWidthCm || sides.length === 0) ? 0.5 : 1 }}
              >
                {t('calculator:calculate_frame_slabs_button')}
              </button>
              <button
                onClick={clearAll}
                style={{ background: colors.bgElevated, color: colors.textPrimary, padding: `${spacing.xs}px ${spacing["3xl"]}px`, borderRadius: radii.md, border: `1px solid ${colors.borderDefault}`, cursor: "pointer", fontWeight: fontWeights.medium }}
              >
                {t('calculator:clear_all_button')}
              </button>
            </div>

            {/* Results */}
            {results && (
              <div ref={resultsRef} style={{ marginTop: spacing["6xl"], padding: spacing["3xl"], background: colors.bgSubtle, borderRadius: radii.lg, border: `1px solid ${colors.borderDefault}` }}>
                <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginBottom: spacing.xs }}>{t('calculator:frame_slab_results_title')}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs, fontSize: fontSizes.sm }}>
                  <p style={{ color: colors.textMuted }}><strong style={{ color: colors.textPrimary }}>{t('calculator:frame_slabs_format', { length: results.framePieceLengthCm ?? pieceLengthCm, width: results.framePieceWidthCm ?? pieceWidthCm })} {t('calculator:needed_label')}:</strong> {results.totalFrameSlabs}</p>
                  <p style={{ color: colors.textMuted }}><strong style={{ color: colors.textPrimary }}>{t('calculator:total_labor_hours_label')}:</strong> {results.totalHours.toFixed(2)} {t('calculator:hours_label')}</p>
                  <p style={{ color: colors.textMuted }}><strong style={{ color: colors.textPrimary }}>{t('calculator:total_frame_area_label')}:</strong> {results.totalFrameAreaM2.toFixed(2)} m²</p>
                  {calculateTransport && results && results.transportTime !== undefined && results.transportTime > 0 && (
                    <p style={{ color: colors.textMuted }}><strong style={{ color: colors.textPrimary }}>{t('calculator:transport_time_label')}:</strong> {results.transportTime?.toFixed(2) || 0} {t('calculator:hours_label')} ({t('calculator:normalised_to_30m')}: {results.normalizedTransportTime?.toFixed(2) || 0} {t('calculator:hours_label')})</p>
                  )}
                  
                  <div style={{ marginTop: spacing.lg }}>
                    <p style={{ fontWeight: fontWeights.medium, color: colors.textPrimary }}>{t('calculator:side_breakdown')}:</p>
                    <ul style={{ listStyle: "disc", listStylePosition: "inside", marginLeft: spacing.xs, color: colors.textMuted }}>
                      {sides.map((side, index) => (
                        <li key={index}>
                          {t('calculator:side_length_slabs_format', { side: t('calculator:side_n_format', { n: index + 1 }), length: side.length, count: side.slabs })}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                
                <div style={{ marginTop: spacing["3xl"], display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={onClose}
                    style={{ padding: `${spacing.xs}px ${spacing["6xl"]}px`, background: colors.green, color: colors.textOnAccent, borderRadius: radii.md, border: "none", cursor: "pointer", fontWeight: fontWeights.medium }}
                  >
                    {t('calculator:accept_button')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  export default SlabFrameCalculator;
