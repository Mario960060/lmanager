import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName } from '../../lib/translationMap';

interface FoundationCalculatorProps {
  onResultsChange?: (results: any) => void;
}

interface TaskTemplate {
  id: string;
  name: string;
  unit: string;
  estimated_hours: number;
}

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  "size (in tones)": number | null;
}

const FoundationCalculator: React.FC<FoundationCalculatorProps> = ({ onResultsChange }) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const companyId = useAuthStore(state => state.getCompanyId());
  
  // Input states
  const [length, setLength] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [depthCm, setDepthCm] = useState<string>('');
  const [diggingMethod, setDiggingMethod] = useState<'shovel' | 'small' | 'medium' | 'large'>('shovel');
  const [soilType, setSoilType] = useState<'clay' | 'sand' | 'rock'>('clay');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);

  // Result states
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Constants
  const STANDARD_EXCAVATION = {
    length: 15,    // meters
    width: 0.6,    // meters
    depth: 0.6,    // meters
    volume: 5.4    // m³
  };

  const MANUAL_DIGGING_RATE = 0.45; // m³/hour

  const DIMENSION_WEIGHT = {
    length: 0.5,   // 50%
    width: 0.3,    // 30%
    depth: 0.2     // 20%
  };

  // Fetch excavation tasks from database
  const { data: excavationTasks = {} } = useQuery({
    queryKey: ['excavation_tasks', companyId],
    queryFn: async () => {
      if (!companyId) return {};
      
      const taskNames = [
        'Excavating foundation with shovel',
        'Excavating foundation with with small excavator',
        'Excavating foundation with with medium excavator',
        'Excavating foundation with with big excavator'
      ];

      const tasks: Record<string, TaskTemplate | null> = {};

      for (const taskName of taskNames) {
        const { data, error } = await supabase
          .from('event_tasks_with_dynamic_estimates')
          .select('id, name, unit, estimated_hours')
          .eq('company_id', companyId)
          .eq('name', taskName)
          .maybeSingle();

        if (error) {
          console.error(`Error fetching task "${taskName}":`, error);
        }
        
        if (data) {
          tasks[taskName] = {
            id: data.id || '',
            name: data.name || '',
            unit: data.unit || '',
            estimated_hours: data.estimated_hours || 0
          };
        } else {
          tasks[taskName] = null;
        }
      }

      return tasks;
    },
    enabled: !!companyId
  });

  const SOIL_DENSITY = {
    clay: 1.5,      // tonnes per m³
    sand: 1.6,      // tonnes per m³
    rock: 2.2       // tonnes per m³
  };

  // Loose volume coefficients (after excavation, soil expands)
  const LOOSE_VOLUME_COEFFICIENT = {
    clay: 1.2,      // 20% increase (1.1-1.3 average)
    sand: 1.025,    // 2.5% increase (1.0-1.05 average)
    rock: 1.075     // 7.5% increase (1.05-1.1 average)
  };

  // Concrete mix ratios (per m³)
  const CONCRETE_MIX = {
    cement: 350,    // kg per m³
    sand: 700,      // kg per m³
    aggregate: 1050 // kg per m³
  };

  // Scroll to results when they appear
  useEffect(() => {
    if (totalHours !== null && resultsRef.current) {
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [totalHours]);

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
        
        const carriers = (carrierData || []).map(carrier => ({
          id: carrier.id,
          name: carrier.name,
          type: carrier.type,
          "size (in tones)": carrier["size (in tones)"] || null
        }));
        setCarriersLocal(carriers);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    
    if (calculateTransport) {
      fetchEquipment();
    }
  }, [calculateTransport]);

  const getTaskHours = (method: 'shovel' | 'small' | 'medium' | 'large', baseHours: number): number => {
    const taskMap = {
      shovel: 'Excavating foundation with shovel',
      small: 'Excavating foundation with with small excavator',
      medium: 'Excavating foundation with with medium excavator',
      large: 'Excavating foundation with with big excavator'
    };

    const taskName = taskMap[method];
    const task = excavationTasks[taskName];

    if (task && task.estimated_hours) {
      return baseHours * task.estimated_hours;
    }

    // Fallback to hardcoded values if task not found
    const MACHINE_MULTIPLIER = {
      shovel: 1,
      small: 6,
      medium: 12,
      large: 25
    };
    return baseHours / MACHINE_MULTIPLIER[method];
  };

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

  const calculate = () => {
    // Validation
    if (!length || !width || !depthCm) {
      setCalculationError(t('calculator:fill_all_required_fields'));
      return;
    }

    setCalculationError(null);

    try {
      const lengthNum = parseFloat(length);
      const widthNum = parseFloat(width);
      const depthNum = parseFloat(depthCm) / 100; // Convert cm to meters

      // Validate positive numbers
      if (lengthNum <= 0 || widthNum <= 0 || depthNum <= 0) {
        setCalculationError(t('calculator:positive_dimensions_required'));
        return;
      }

      // 1. Calculate actual volume
      const actualVolume = lengthNum * widthNum * depthNum;

      // 2. Calculate relative coefficients
      const lengthRel = lengthNum / STANDARD_EXCAVATION.length;
      const widthRel = widthNum / STANDARD_EXCAVATION.width;
      const depthRel = depthNum / STANDARD_EXCAVATION.depth;

      // 3. Calculate time with dimension weights
      const timeBaseManual = actualVolume / MANUAL_DIGGING_RATE;
      const dimensionAdjustment = 
        (DIMENSION_WEIGHT.length * lengthRel) +
        (DIMENSION_WEIGHT.width * widthRel) +
        (DIMENSION_WEIGHT.depth * depthRel);
      const timeWithDimensions = timeBaseManual * dimensionAdjustment;

      // 4. Get final time using task template or fallback
      const excavationHours = getTaskHours(diggingMethod, timeWithDimensions);

      // 5. Calculate material weight (excavated soil)
      const soilDensity = SOIL_DENSITY[soilType];
      const excavatedSoilTonnes = actualVolume * soilDensity;
      
      // Calculate loose volume after excavation (soil expands)
      const looseVolumeCoefficient = LOOSE_VOLUME_COEFFICIENT[soilType];
      const looseVolume = actualVolume * looseVolumeCoefficient;

      // 6. Calculate concrete components
      // const cementKg = actualVolume * CONCRETE_MIX.cement; // Available for future use
      // const sandKg = actualVolume * CONCRETE_MIX.sand; // Not used in current materials list
      const aggregateKg = actualVolume * CONCRETE_MIX.aggregate;

      // const cementBags = Math.ceil(cementKg / 25); // 25kg bags - available for future use
      // const sandTonnes = sandKg / 1000; // Not used in materials list but available for future use
      const aggregateTonnes = aggregateKg / 1000;

      // Get transport distance in meters
      const transportDistanceMeters = parseFloat(transportDistance) || 30;

      // Calculate material transport times if "Calculate transport time" is checked
      let soilTransportTime = 0;

      if (calculateTransport) {
        let carrierSizeForTransport = 0.125;
        
        if (selectedTransportCarrier) {
          carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
        }

        // Calculate soil transport
        if (excavatedSoilTonnes > 0) {
          const soilResult = calculateMaterialTransportTime(excavatedSoilTonnes, carrierSizeForTransport, 'soil', transportDistanceMeters);
          soilTransportTime = soilResult.totalTransportTime;
        }
      }

      // Build task breakdown (single excavation task)
      const breakdown = [
        {
          task: 'Foundation Excavation',
          hours: excavationHours,
          amount: actualVolume.toFixed(2),
          unit: 'm³'
        }
      ];

      // Add transport task if applicable
      if (calculateTransport && soilTransportTime > 0) {
        breakdown.push({
          task: 'transport soil',
          hours: soilTransportTime,
          amount: excavatedSoilTonnes.toFixed(2),
          unit: 'tonnes'
        });
      }

      // Build materials list
      const materialsList = [
        { 
          name: `Excavated ${soilType.charAt(0).toUpperCase() + soilType.slice(1)} Soil (loose volume)`, 
          amount: looseVolume * soilDensity, 
          unit: 'tonnes',
          price_per_unit: null,
          total_price: null
        },
        { 
          name: 'Aggregate (for concrete)', 
          amount: aggregateTonnes, 
          unit: 'tonnes',
          price_per_unit: null,
          total_price: null
        }
      ];

      const hours = excavationHours + soilTransportTime;

      setTotalHours(hours);
      setTaskBreakdown(breakdown);
      setMaterials(materialsList);

      if (onResultsChange) {
        // Use the same excavated soil tonnage as shown in materials
        const materialExcavatedTonnes = materialsList.length > 0 ? materialsList[0].amount : 0;
        
        onResultsChange({
          name: 'Foundation Excavation & Concrete',
          amount: actualVolume,
          unit: 'm³',
          hours_worked: hours,
          diggingMethod: diggingMethod,
          excavatedSoilTonnes: materialExcavatedTonnes,
          materials: materialsList.map(material => ({
            name: material.name,
            quantity: material.amount,
            unit: material.unit
          })),
          taskBreakdown: breakdown
        });
      }
    } catch (error) {
      setCalculationError(t('calculator:calculation_error'));
      console.error(error);
    }
  };

  const clearAll = () => {
    setLength('');
    setWidth('');
    setDepthCm('');
    setDiggingMethod('shovel');
    setSoilType('clay');
    setCalculateTransport(false);
    setSelectedTransportCarrier(null);
    setTransportDistance('30');
    setTotalHours(null);
    setTaskBreakdown([]);
    setMaterials([]);
    setCalculationError(null);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('calculator:foundation_calculator_title_alt')}</h2>
      <p className="text-sm text-gray-600">
        Calculate excavation time, excavated soil volume, and concrete materials required for foundation work.
      </p>

      <div className="space-y-4">
        {/* Excavation Dimensions */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('calculator:input_length_in_cm')}</label>
            <input
              type="number"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder={t('calculator:placeholder_enter_length_m')}
              min="0"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('calculator:input_width_in_cm')}</label>
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder={t('calculator:placeholder_enter_width')}
              min="0"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('calculator:input_depth_in_cm')}</label>
            <input
              type="number"
              value={depthCm}
              onChange={(e) => setDepthCm(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder={t('calculator:placeholder_enter_depth_cm')}
              min="0"
              step="1"
            />
          </div>
        </div>

        {/* Digging Method */}
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:digging_method')}</label>
          <select
            value={diggingMethod}
            onChange={(e) => setDiggingMethod(e.target.value as any)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="shovel">Shovel (Manual)</option>
            <option value="small">Small Excavator (1-3t)</option>
            <option value="medium">Medium Excavator (3-7t)</option>
            <option value="large">Large Excavator (7+t)</option>
          </select>
        </div>

        {/* Soil Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:soil_type')}</label>
          <select
            value={soilType}
            onChange={(e) => setSoilType(e.target.value as any)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="clay">Clay</option>
            <option value="sand">Sand</option>
            <option value="rock">Rock</option>
          </select>
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
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:transport_carrier')}</label>
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
                {carriersLocal.length > 0 && carriersLocal.map((carrier) => (
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
          </>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4">
          <button
            onClick={calculate}
            disabled={!length || !width || !depthCm}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300"
          >
            {t('calculator:calculate_button')}
          </button>
          <button
            onClick={clearAll}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            {t('calculator:clear_button')}
          </button>
        </div>

        {/* Error Message */}
        {calculationError && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md">
            {calculationError}
          </div>
        )}

        {/* Results */}
        {totalHours !== null && (
          <div ref={resultsRef} className="mt-6 space-y-4">
            <div>
              <h3 className="text-lg font-medium">{t('calculator:total_labor_hours_label')} <span className="text-blue-600">{totalHours.toFixed(2)} {t('calculator:hours_abbreviation')}</span></h3>
              
              <div className="mt-2">
                <h4 className="font-medium text-gray-700 mb-2">{t('calculator:task_breakdown_label')}</h4>
                <ul className="space-y-1 pl-5 list-disc">
                  {taskBreakdown.map((task: any, index: number) => (
                    <li key={index} className="text-sm">
                      <span className="font-medium">{translateTaskName(task.task, t)}:</span> {task.hours.toFixed(2)} hours ({task.amount} {task.unit})
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FoundationCalculator;
