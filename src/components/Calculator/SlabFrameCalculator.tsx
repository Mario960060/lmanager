  import React, { useState, useEffect, useRef } from 'react';
  import { useQuery } from '@tanstack/react-query';
  import { useTranslation } from 'react-i18next';
  import { supabase } from '../../lib/supabase';
  import { useAuthStore } from '../../lib/store';
  import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';

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
      frameSlabsName: string;
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
      frameSlabsName: string;
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
        console.log('Fetching frame task templates...');
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
        console.log('Fetched frame tasks:', data);
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
      console.log('Piece area:', pieceAreaM2, 'm²');

      // Determine which task template to use
      const taskName = pieceAreaM2 < 0.3 
        ? 'laying slab frame belove 0.3m2' 
        : 'laying slab frame above 0.3m2';
      console.log('Looking for task template:', taskName);

      const frameTask = frameTaskTemplates.find(task => 
        task.name && task.name.toLowerCase().includes(taskName.toLowerCase())
      );
      console.log('Found frame task:', frameTask);

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
        console.log('Total cutting hours:', cuttingHours);
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">{t('calculator:slab_frame_calculator_title')}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            {/* Piece Dimensions */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('calculator:piece_length_cm_label')}</label>
                <input
                  type="number"
                  value={pieceLengthCm}
                  onChange={(e) => setPieceLengthCm(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder={t('calculator:enter_length_cm')}
                  min="0"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('calculator:piece_width_cm_label')}</label>
                <input
                  type="number"
                  value={pieceWidthCm}
                  onChange={(e) => setPieceWidthCm(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder={t('calculator:enter_width_cm')}
                  min="0"
                  step="0.1"
                />
              </div>
            </div>

            {/* Side Length Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('calculator:add_side_length_label')}</label>
              <p className="text-xs text-gray-500 mb-2">{t('calculator:add_separate_every_single_side')}</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={sideLength}
                  onChange={(e) => setSideLength(e.target.value)}
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder={t('calculator:enter_side_length_meters')}
                  min="0"
                  step="0.01"
                />
                <button
                  onClick={addSide}
                  disabled={!sideLength || !pieceLengthCm}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300"
                >
                  Confirm
                </button>
              </div>
            </div>

            {/* Added Sides List */}
            {sides.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">{t('calculator:added_sides_label')}</h3>
                <div className="space-y-2">
                  {sides.map((side, index) => (
                    <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <span className="text-sm">
                        Side {index + 1}: {side.length}m → {side.slabs} frame slabs
                      </span>
                      <button
                        onClick={() => removeSide(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transport Distance */}
            {calculateTransport && (
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
            )}

            <div className="mb-4">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={calculateTransport}
                  onChange={(e) => setCalculateTransport(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">{t('calculator:calculate_transport_time_label')}</span>
              </label>
            </div>

            {calculateTransport && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:transport_carrier_label')}</label>
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
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">-- Select Carrier --</option>
                  <option value="default">0.125t Wheelbarrow (default)</option>
                  {carrierSpeeds.map(carrier => (
                    <option key={carrier.size} value={carrier.size.toString()}>
                      {carrier.size}t Carrier
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={calculate}
                disabled={!pieceLengthCm || !pieceWidthCm || sides.length === 0}
                className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-300"
              >
                {t('calculator:calculate_frame_slabs_button')}
              </button>
              <button
                onClick={clearAll}
                className="bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700"
              >
                {t('calculator:clear_all_button')}
              </button>
            </div>

            {/* Results */}
            {results && (
              <div ref={resultsRef} className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('calculator:frame_slab_results_title')}</h3>
                <div className="space-y-2 text-sm">
                  <p><strong>{results.frameSlabsName} {t('calculator:needed_label')}:</strong> {results.totalFrameSlabs}</p>
                  <p><strong>{t('calculator:total_labor_hours_label')}:</strong> {results.totalHours.toFixed(2)} {t('calculator:hours_label')}</p>
                  <p><strong>{t('calculator:total_frame_area_label')}:</strong> {results.totalFrameAreaM2.toFixed(2)} m²</p>
                  {calculateTransport && results && results.transportTime !== undefined && results.transportTime > 0 && (
                    <p><strong>{t('calculator:transport_time_label')}:</strong> {results.transportTime?.toFixed(2) || 0} {t('calculator:hours_label')} (normalized to 30m: {results.normalizedTransportTime?.toFixed(2) || 0} {t('calculator:hours_label')})</p>
                  )}
                  
                  <div className="mt-3">
                    <p className="font-medium">{t('calculator:side_breakdown')}:</p>
                    <ul className="list-disc list-inside ml-2">
                      {sides.map((side, index) => (
                        <li key={index}>
                          Side {index + 1}: {side.length}m = {side.slabs} slabs
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={onClose}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Accept
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
