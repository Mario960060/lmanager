  import React, { useState, useEffect, useRef } from 'react';
  import { useQuery } from '@tanstack/react-query';
  import { useTranslation } from 'react-i18next';
  import { supabase } from '../../lib/supabase';
  import { useAuthStore } from '../../lib/store';
  import { colors, fontSizes, fontWeights, spacing, radii } from '../../themes/designTokens';
  import { Button } from '../../themes/uiComponents';

  interface SlabFrameCalculatorProps {
    isOpen: boolean;
    onClose: () => void;
    /** Sync from parent slab frame fields when opening (e.g. Project Creation). */
    initialPieceLengthCm?: string;
    initialPieceWidthCm?: string;
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
    onResultsChange?: (
      results: {
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
      } | null
    ) => void;
  }

  const SlabFrameCalculator: React.FC<SlabFrameCalculatorProps> = ({
    isOpen,
    onClose,
    initialPieceLengthCm,
    initialPieceWidthCm,
    selectedSlabType,
    cuttingTasks = [],
    onResultsChange,
  }) => {
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
    } | null>(null);
    const resultsRef = useRef<HTMLDivElement>(null);
    const [pieceDimsNarrow, setPieceDimsNarrow] = useState(false);
    useEffect(() => {
      const mq = window.matchMedia("(max-width: 768px)");
      const fn = () => setPieceDimsNarrow(mq.matches);
      fn();
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    }, []);

    // Add useEffect to recalculate when selectedSlabType changes
    useEffect(() => {
      if (results) {
        calculate();
      }
    }, [selectedSlabType]);

    useEffect(() => {
      if (!isOpen) return;
      if (initialPieceLengthCm != null && initialPieceLengthCm !== "") {
        setPieceLengthCm(initialPieceLengthCm);
      }
      if (initialPieceWidthCm != null && initialPieceWidthCm !== "") {
        setPieceWidthCm(initialPieceWidthCm);
      }
    }, [isOpen, initialPieceLengthCm, initialPieceWidthCm]);

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

      // Add cutting hours to total hours (transport materiałów dla ramek liczy główny SlabCalculator)
      const finalTotalHours = totalHours + cuttingHours;

      const calculationResults = {
        totalFrameSlabs,
        totalHours: finalTotalHours,
        totalFrameAreaM2,
        taskName: frameTask?.name || taskName,
        task_id: frameTask?.id,
        sides: [...sides],
        framePieceLengthCm: pieceLengthCm,
        framePieceWidthCm: pieceWidthCm,
        frameSlabsName: `Frame slabs ${pieceLengthCm}x${pieceWidthCm}`,
        cuttingHours,
        cuttingTaskName,
        cutting_task_id: cuttingTaskId
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
      onResultsChange?.(null);
    };

    if (!isOpen) return null;

    return (
      <div className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: colors.bgModalBackdrop, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
        <div
          className="slab-frame-calculator-modal-panel canvas-modal-content"
          style={{ background: colors.bgCard, borderRadius: radii.lg, padding: spacing["6xl"], width: "100%", maxWidth: 672, maxHeight: "80vh", overflowY: "auto" }}
        >
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
            {/* Piece Dimensions — zawsze 2 kolumny na mobile (długość | szerokość w jednym rzędzie) */}
            <div
              className="slab-frame-piece-dims"
              style={{
                display: "grid",
                gridTemplateColumns: pieceDimsNarrow ? "minmax(0,1fr) minmax(0,1fr)" : "1fr 1fr",
                gap: pieceDimsNarrow ? spacing.md : spacing["3xl"],
              }}
            >
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

            {/* Action Buttons — wrap on narrow modals; type="button" avoids accidental form submit */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: spacing.sm,
                width: "100%",
              }}
            >
              <Button
                type="button"
                variant="primary"
                fullWidth
                disabled={!pieceLengthCm || !pieceWidthCm || sides.length === 0}
                onClick={calculate}
              >
                {t('calculator:calculate_frame_slabs_button')}
              </Button>
              <Button type="button" variant="secondary" fullWidth onClick={clearAll}>
                {t('calculator:clear_all_button')}
              </Button>
            </div>

            {/* Results */}
            {results && (
              <div ref={resultsRef} style={{ marginTop: spacing["6xl"], padding: spacing["3xl"], background: colors.bgSubtle, borderRadius: radii.lg, border: `1px solid ${colors.borderDefault}` }}>
                <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.textPrimary, marginBottom: spacing.xs }}>{t('calculator:frame_slab_results_title')}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs, fontSize: fontSizes.sm }}>
                  <p style={{ color: colors.textMuted }}><strong style={{ color: colors.textPrimary }}>{t('calculator:frame_slabs_format', { length: results.framePieceLengthCm ?? pieceLengthCm, width: results.framePieceWidthCm ?? pieceWidthCm })} {t('calculator:needed_label')}:</strong> {results.totalFrameSlabs}</p>
                  <p style={{ color: colors.textMuted }}><strong style={{ color: colors.textPrimary }}>{t('calculator:total_labor_hours_label')}:</strong> {results.totalHours.toFixed(2)} {t('calculator:hours_label')}</p>
                  <p style={{ color: colors.textMuted }}><strong style={{ color: colors.textPrimary }}>{t('calculator:total_frame_area_label')}:</strong> {results.totalFrameAreaM2.toFixed(2)} m²</p>
                  
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
                
                <div style={{ marginTop: spacing["3xl"], width: "100%" }}>
                  <Button variant="primary" fullWidth onClick={onClose}>
                    {t('calculator:accept_button')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  export default SlabFrameCalculator;
