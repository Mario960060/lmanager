import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { CompactorSelector, type CompactorOption } from './CompactorSelector';
import { calculateCompactingTime } from '../../lib/compactingCalculations';

// Define types for our equipment
interface DiggingEquipment {
  id: string;
  name: string;
  description: string | null;
  type: 'excavator' | 'barrows_dumpers';
  "size (in tones)": number | null;
}

// Define loading rates for different digger sizes (tons per hour)
const diggerLoadingRates = [
  { equipment: 'Shovel (manual)', sizeInTons: 0.02, tonesPerHour: 2 },
  { equipment: '0.5t mini digger', sizeInTons: 0.5, tonesPerHour: 4.35 },
  { equipment: '1t mini digger', sizeInTons: 1, tonesPerHour: 5.56 },
  { equipment: '1.5-2t digger', sizeInTons: 2, tonesPerHour: 6.67 },
  { equipment: '3-5t digger', sizeInTons: 3, tonesPerHour: 8.33 },
  { equipment: '6-10t digger', sizeInTons: 6, tonesPerHour: 12.5 },
  { equipment: '11-20t digger', sizeInTons: 11, tonesPerHour: 20 },
  { equipment: '21-30t digger', sizeInTons: 21, tonesPerHour: 33.33 },
  { equipment: '31-40t digger', sizeInTons: 31, tonesPerHour: 50 },
  { equipment: '40t+ digger', sizeInTons: 40, tonesPerHour: 100 }
];

// Define carrier speeds in meters per hour
const carrierSpeeds = [
  { size: 0.1, speed: 1500 },
  { size: 0.125, speed: 1500 },
  { size: 0.15, speed: 1500 },
  { size: 0.3, speed: 2500 },
  { size: 0.5, speed: 3000 },
  { size: 1, speed: 4000 },
  { size: 3, speed: 6000 },
  { size: 5, speed: 7000 },
  { size: 10, speed: 8000 }
];

interface Type1AggregateCalculatorProps {
  onResultsChange?: (results: any) => void;
}

const Type1AggregateCalculator: React.FC<Type1AggregateCalculatorProps> = ({ onResultsChange }) => {
  // State for input values
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const [tons, setTons] = useState<string>('');
  const [length, setLength] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [depth, setDepth] = useState<string>('');
  
  // State for equipment selection
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriers, setCarriers] = useState<DiggingEquipment[]>([]);
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  
  // State for results
  const [result, setResult] = useState<{
    totalTons: number;
    excavationTime: number;
    transportTime: number;
    compactingTime: number;
    compactingLayers: number;
    compactingCompactorName: string;
    totalTime: number;
  } | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [selectedCompactor, setSelectedCompactor] = useState<CompactorOption | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Fetch equipment from the database
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const companyId = useAuthStore.getState().getCompanyId();
        if (!companyId) return;
        
        // Fetch excavators
        const { data: excavatorData, error: excavatorError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'excavator')
          .eq('company_id', companyId);
        
        if (excavatorError) throw excavatorError;
        
        // Fetch carriers (barrows/dumpers)
        const { data: carrierData, error: carrierError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'barrows_dumpers')
          .eq('company_id', companyId);
        
        if (carrierError) throw carrierError;
        
        setExcavators(excavatorData || []);
        setCarriers(carrierData || []);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    
    fetchEquipment();
  }, []);

  // Calculate Type 1 aggregate weight from dimensions
  const calculateType1Weight = () => {
    if (calculationMethod === 'direct') {
      return parseFloat(tons) || 0;
    } else {
      const l = parseFloat(length) || 0;
      const w = parseFloat(width) || 0;
      const d = parseFloat(depth) || 0;
      
      // Calculate volume in cubic meters
      const volumeInCubicMeters = l * w * (d / 100);
      
      // Convert to tons (1 cubic meter = 2.3 tons for Type 1 aggregate)
      return volumeInCubicMeters * 2.3;
    }
  };

  // Find the digger loading rate based on size
  const findDiggerLoadingRate = (sizeInTons: number) => {
    if (sizeInTons <= 0) return diggerLoadingRates[0].tonesPerHour;
    
    for (let i = 0; i < diggerLoadingRates.length - 1; i++) {
      if (
        sizeInTons >= diggerLoadingRates[i].sizeInTons &&
        sizeInTons < diggerLoadingRates[i + 1].sizeInTons
      ) {
        return diggerLoadingRates[i].tonesPerHour;
      }
    }
    
    return diggerLoadingRates[diggerLoadingRates.length - 1].tonesPerHour;
  };

  // Find carrier speed based on carrier size
  const findCarrierSpeed = (sizeInTons: number) => {
    // Find the closest carrier size that's not larger than the selected one
    const sortedSpeeds = [...carrierSpeeds].sort((a, b) => b.size - a.size);
    const speed = sortedSpeeds.find(s => s.size <= sizeInTons);
    
    if (!speed) {
      return carrierSpeeds[0].speed; // Default to smallest if none found
    }
    
    return speed.speed;
  };

  // Calculate time needed
  const calculateTime = () => {
    if (!selectedExcavator) {
      alert(t('calculator:please_select_excavator'));
      return;
    }
    
    if (!selectedCarrier) {
      alert(t('calculator:please_select_carrier'));
      return;
    }

    if (!selectedCompactor) {
      alert(t('calculator:please_select_compactor'));
      return;
    }
    
    const totalTons = calculateType1Weight();
    
    if (totalTons <= 0) {
      alert(t('calculator:valid_dimensions_required'));
      return;
    }

    const depthCm = parseFloat(depth) || 0;
    if (depthCm <= 0) {
      alert(t('calculator:valid_depth_required'));
      return;
    }
    
    // Get excavator size and loading rate
    const excavatorSize = selectedExcavator["size (in tones)"] || 0;
    const loadingRatePerHour = findDiggerLoadingRate(excavatorSize);
    const excavationTime = totalTons / loadingRatePerHour; // Hours
    
    // Calculate transport time
    const carrierSize = selectedCarrier["size (in tones)"] || 0;
    const carrierSpeed = findCarrierSpeed(carrierSize);
    const transportDistanceMeters = parseFloat(transportDistance) || 0;
    
    // Calculate number of trips
    const trips = Math.ceil(totalTons / carrierSize);
    
    // Calculate transport time per trip (in hours)
    const distanceRoundTrip = transportDistanceMeters * 2; // tam i z powrotem
    const transportTimePerTrip = distanceRoundTrip / carrierSpeed; // hours
    
    // Total transport time
    const transportTime = trips * transportTimePerTrip;

    // Calculate compacting time
    const areaM2 = (parseFloat(length) || 0) * (parseFloat(width) || 0);
    const compactingCalc = calculateCompactingTime(selectedCompactor, depthCm, 'type1');
    const compactingTimeTotal = areaM2 * compactingCalc.timePerM2 * compactingCalc.totalPasses;
    
    // Set result - total time is excavation time + transport time + compacting time
    setResult({
      totalTons,
      excavationTime,
      transportTime,
      compactingTime: compactingTimeTotal,
      compactingLayers: compactingCalc.numberOfLayers,
      compactingCompactorName: compactingCalc.compactorTaskName,
      totalTime: excavationTime + transportTime + compactingTimeTotal
    });
  };

  // Format time to hours and minutes
  const formatTime = (hours: number) => {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    
    if (wholeHours === 0) {
      return `${minutes} minutes`;
    } else if (minutes === 0) {
      return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''}`;
    } else {
      return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
  };

  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (result && onResultsChange) {
      // Calculate normalized transport time (for 30m baseline)
      const carrierSize = selectedCarrier ? selectedCarrier["size (in tones)"] || 0 : 0;
      const carrierSpeed = selectedCarrier ? findCarrierSpeed(carrierSize) : 6000;
      const trips = Math.ceil(result.totalTons / carrierSize);
      const normalizedDistance = 30; // baseline distance in meters
      const distanceRoundTrip = normalizedDistance * 2;
      const transportTimePerTrip = distanceRoundTrip / carrierSpeed;
      const normalizedTransportTime = trips * transportTimePerTrip;

      const formattedResults = {
        name: 'Type 1 Aggregate Installation',
        amount: result.totalTons,
        hours_worked: result.totalTime,
        materials: [],
        taskBreakdown: [
          {
            task: 'Preparation',
            hours: result.excavationTime,
            amount: result.totalTons,
            unit: 'tonnes'
          },
          {
            task: 'Transport',
            hours: normalizedTransportTime, // Store normalized time for statistics
            amount: result.totalTons,
            unit: 'tonnes'
          },
          {
            task: result.compactingCompactorName,
            hours: result.compactingTime,
            amount: result.totalTons,
            unit: 'tonnes',
            layers: result.compactingLayers
          }
        ]
      };

      // Store results in data attribute
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      // Notify parent component
      onResultsChange(formattedResults);
    }
  }, [result, onResultsChange, selectedCarrier]);

  useEffect(() => {
    if (result !== null && resultsRef.current) {
      setTimeout(() => {
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer && resultsRef.current) {
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else if (resultsRef.current) {
          resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [result]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-800">{t('calculator:input_prep_calculator')}</h2>
      
      {/* Calculation Method */}
      <div>
        <p 
          className="text-blue-600 cursor-pointer hover:underline mb-2"
          onClick={() => setCalculationMethod(calculationMethod === 'direct' ? 'area' : 'direct')}
        >
          {calculationMethod === 'direct' ? t('calculator:input_calculation_method_area') : t('calculator:input_calculation_method_weight')}
        </p>
        
        {calculationMethod === 'direct' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('calculator:input_aggregate_weight_tons')}</label>
            <input
              type="number"
              value={tons}
              onChange={(e) => setTons(e.target.value)}
              className="w-full p-2 border rounded-md"
              placeholder={t('calculator:placeholder_enter_weight_tons')}
              min="0"
              step="0.1"
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('calculator:input_length_m')}</label>
              <input
                type="number"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder={t('calculator:placeholder_enter_length')}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('calculator:input_width_m')}</label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder={t('calculator:placeholder_enter_width')}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('calculator:input_depth_cm')}</label>
              <input
                type="number"
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder={t('calculator:placeholder_enter_depth_cm')}
                min="0"
                step="0.01"
              />
              <span className="text-xs text-gray-500">{t('calculator:message_enter_depth_cm')}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Equipment Selection */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:input_excavation_machinery')}</label>
          <div className="space-y-2">
            {excavators.length === 0 ? (
              <p className="text-gray-500">{t('calculator:input_no_excavators')}</p>
            ) : (
              excavators.map((excavator) => (
                <div 
                  key={excavator.id}
                  className="flex items-center p-2 cursor-pointer hover:bg-gray-50 rounded-md"
                  onClick={() => setSelectedExcavator(excavator)}
                >
                  <div className={`w-4 h-4 rounded-full border mr-2 ${
                    selectedExcavator?.id === excavator.id 
                      ? 'border-blue-600' 
                      : 'border-gray-400'
                  }`}>
                    <div className={`w-2 h-2 rounded-full m-0.5 ${
                      selectedExcavator?.id === excavator.id 
                        ? 'bg-blue-600' 
                        : 'bg-transparent'
                    }`}></div>
                  </div>
                  <div>
                    <span className="text-gray-800">{excavator.name}</span>
                    <span className="text-sm text-gray-600 ml-2">({excavator["size (in tones)"]} tons)</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:input_transport_carrier_for_aggregate')}</label>
          <div className="space-y-2">
            {carriers.length === 0 ? (
              <p className="text-gray-500">{t('calculator:input_no_carriers')}</p>
            ) : (
              carriers.map((carrier) => (
                <div 
                  key={carrier.id}
                  className="flex items-center p-2 cursor-pointer hover:bg-gray-50 rounded-md"
                  onClick={() => setSelectedCarrier(carrier)}
                >
                  <div className={`w-4 h-4 rounded-full border mr-2 ${
                    selectedCarrier?.id === carrier.id 
                      ? 'border-blue-600' 
                      : 'border-gray-400'
                  }`}>
                    <div className={`w-2 h-2 rounded-full m-0.5 ${
                      selectedCarrier?.id === carrier.id 
                        ? 'bg-blue-600' 
                        : 'bg-transparent'
                    }`}></div>
                  </div>
                  <div>
                    <span className="text-gray-800">{carrier.name}</span>
                    <span className="text-sm text-gray-600 ml-2">({carrier["size (in tones)"]} tons)</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {/* Compactor Selection */}
      <div className="mb-6">
        <CompactorSelector 
          selectedCompactor={selectedCompactor}
          onCompactorChange={setSelectedCompactor}
        />
      </div>
      
      {/* Transport Distance */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:transport_distance_each_way_label')}</label>
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
      
      {/* Calculate Button */}
      <button
        onClick={calculateTime}
        className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 transition-colors"
      >
        Calculate Time
      </button>
      
      {/* Results */}
      {result && (
        <div ref={resultsRef} className="mt-4 p-6 bg-gray-100 rounded-md">
          <h3 className="text-lg font-semibold mb-2">{t('calculator:estimated_time_label')}</h3>
          <div className="space-y-2">
            <p>Total Aggregate: <span className="font-medium">{result.totalTons.toFixed(2)} tons</span></p>
            <p>Loading Time: <span className="font-medium">{formatTime(result.excavationTime)}</span></p>
            <p>Transport Time: <span className="font-medium">{formatTime(result.transportTime)}</span></p>
            <p>Compacting ({result.compactingCompactorName}, {result.compactingLayers} layers): <span className="font-medium">{formatTime(result.compactingTime)}</span></p>
            <p className="text-lg">
              Total Time: <span className="font-bold">
                {formatTime(result.totalTime)}
              </span>
            </p>
            <p className="text-sm text-gray-500 italic mt-2"></p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Type1AggregateCalculator;
