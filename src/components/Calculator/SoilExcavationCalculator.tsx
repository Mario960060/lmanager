import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';

// Define types for our equipment
interface DiggingEquipment {
  id: string;
  name: string;
  description: string | null;
  type: 'excavator' | 'barrows_dumpers';
  "size (in tones)": number | null;
  speed_m_per_hour?: number | null;
}

interface SoilExcavationCalculatorProps {
  onResultsChange?: (results: any) => void;
}

const SoilExcavationCalculator: React.FC<SoilExcavationCalculatorProps> = ({ onResultsChange }) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const companyId = useAuthStore(state => state.getCompanyId());
  
  // State for input values
  const [calculationMethod, setCalculationMethod] = useState<'direct' | 'area'>('area');
  const [tons, setTons] = useState<string>('');
  const [length, setLength] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [depth, setDepth] = useState<string>('');
  
  // State for equipment selection
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  
  // State for results
  const [result, setResult] = useState<{
    totalTons: number;
    excavationTime: number;
    transportTime: number;
    totalTime: number;
  } | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('0');
  const resultsRef = useRef<HTMLDivElement>(null);

  // Fetch excavators
  const { data: excavators = [] } = useQuery({
    queryKey: ['excavators', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setup_digging')
        .select('*')
        .eq('type', 'excavator')
        .eq('company_id', companyId);
      
      if (error) throw error;
      return data as DiggingEquipment[];
    },
    enabled: !!companyId
  });

  // Fetch carriers
  const { data: carriers = [] } = useQuery({
    queryKey: ['carriers', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setup_digging')
        .select('*')
        .eq('type', 'barrows_dumpers')
        .eq('company_id', companyId);
      
      if (error) throw error;
      return data as DiggingEquipment[];
    },
    enabled: !!companyId
  });

  // Fetch task templates
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['event_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks')
        .select('*')
        .eq('company_id', companyId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Calculate soil weight from dimensions
  const calculateSoilWeight = () => {
    if (calculationMethod === 'direct') {
      return parseFloat(tons) || 0;
    } else {
      const l = parseFloat(length) || 0;
      const w = parseFloat(width) || 0;
      const d = parseFloat(depth) || 0;
      
      // Calculate volume in cubic meters
      const volumeInCubicMeters = l * w * (d / 100);
      
      // Convert to tons (1 cubic meter = 1.5 tons)
      return volumeInCubicMeters * 1.5;
    }
  };

  // Calculate time needed using NEW SYSTEM
  const calculateTime = () => {
    if (!selectedExcavator) {
      alert(t('calculator:please_select_excavator'));
      return;
    }
    
    const totalTons = calculateSoilWeight();
    
    if (totalTons <= 0) {
      alert(t('calculator:please_enter_valid_dimensions'));
      return;
    }
    
    // Get excavator details
    const excavatorSize = selectedExcavator["size (in tones)"] || 0;
    const excavatorName = selectedExcavator.name || '';
    
    // Find excavation task template by exact name pattern (NEW SYSTEM)
    const excavationTemplate = taskTemplates.find((template: any) => {
      const name = (template.name || '').toLowerCase();
      return name.includes('excavation soil') && 
             name.includes(excavatorName.toLowerCase()) &&
             name.includes(`(${excavatorSize}t)`);
    });

    let excavationTime = 0;
    if (excavationTemplate && excavationTemplate.estimated_hours) {
      excavationTime = excavationTemplate.estimated_hours * totalTons;
      console.log('Found excavation template:', excavationTemplate.name, 'Time:', excavationTime);
    } else {
      console.warn('Excavation template not found for:', `Excavation soil with ${excavatorName} (${excavatorSize}t)`);
      alert(t('calculator:template_not_found_excavator'));
      return;
    }

    // Calculate transport time (NEW SYSTEM with speed from database)
    let transportTime = 0;
    if (selectedCarrier && selectedCarrier.speed_m_per_hour) {
      const distance = parseFloat(transportDistance) || 0;
      
      if (distance > 0) {
        const carrierSpeed = selectedCarrier.speed_m_per_hour;
        const carrierSize = selectedCarrier["size (in tones)"] || 0;
        
        // Calculate number of trips
        const trips = Math.ceil(totalTons / carrierSize);
        
        // Calculate transport time per trip (in hours)
        const roundTripDistance = distance * 2; // tam i z powrotem
        const transportTimePerTrip = roundTripDistance / carrierSpeed; // hours
        
        // Total transport time
        transportTime = trips * transportTimePerTrip;
        
        console.log('Transport calculation:', {
          carrier: selectedCarrier.name,
          speed: carrierSpeed,
          distance,
          trips,
          transportTime
        });
      }
    }
    
    // Set result
    setResult({
      totalTons,
      excavationTime,
      transportTime,
      totalTime: excavationTime + transportTime
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
      const taskBreakdown = [
        {
          task: 'Excavation',
          hours: result.excavationTime,
          amount: result.totalTons,
          unit: 'tonnes'
        }
      ];

      // Add transport if applicable
      if (result.transportTime > 0) {
        taskBreakdown.push({
          task: 'Transport',
          hours: result.transportTime,
          amount: result.totalTons,
          unit: 'tonnes'
        });
      }

      const formattedResults = {
        name: 'Soil Excavation',
        amount: result.totalTons,
        hours_worked: result.totalTime,
        materials: [
          {
            name: 'Soil',
            quantity: result.totalTons,
            unit: 'tons'
          }
        ],
        taskBreakdown
      };

      // Store results in data attribute
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      // Notify parent component
      onResultsChange(formattedResults);
    }
  }, [result, onResultsChange]);

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
      <h2 className="text-xl font-semibold text-gray-800">{t('calculator:soil_excavation_calculator_title')}</h2>
      
      {/* Calculation Method */}
      <div>
        <p 
          className="text-blue-600 cursor-pointer hover:underline mb-2"
          onClick={() => setCalculationMethod(calculationMethod === 'direct' ? 'area' : 'direct')}
        >
          {calculationMethod === 'direct' ? t('calculator:calculate_by_area') : t('calculator:calculate_by_weight')}
        </p>
        
        {calculationMethod === 'direct' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('calculator:soil_weight_label')}</label>
            <input
              type="number"
              value={tons}
              onChange={(e) => setTons(e.target.value)}
              className="w-full p-2 border rounded-md"
              placeholder={t('calculator:enter_weight_tons')}
              min="0"
              step="0.1"
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('calculator:length_m_label')}</label>
              <input
                type="number"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder={t('calculator:length_placeholder')}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('calculator:width_m_label')}</label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder={t('calculator:width_placeholder')}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('calculator:depth_cm_label')}</label>
              <input
                type="number"
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder={t('calculator:depth_placeholder')}
                min="0"
                step="0.01"
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Equipment Selection - Only Excavator */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:select_excavator_label')}</label>
        <div className="space-y-2">
          {excavators.length === 0 ? (
            <p className="text-gray-500">{t('calculator:no_excavators_found')}</p>
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
      
      {/* Carrier Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:select_carrier_optional_label')}</label>
        <div className="space-y-2">
          <div 
            className="flex items-center p-2 cursor-pointer hover:bg-gray-50 rounded-md"
            onClick={() => setSelectedCarrier(null)}
          >
            <div className={`w-4 h-4 rounded-full border mr-2 ${
              !selectedCarrier 
                ? 'border-blue-600' 
                : 'border-gray-400'
            }`}>
              <div className={`w-2 h-2 rounded-full m-0.5 ${
                !selectedCarrier 
                  ? 'bg-blue-600' 
                  : 'bg-transparent'
              }`}></div>
            </div>
            <span className="text-gray-800">{t('calculator:no_transport_needed')}</span>
          </div>
          {carriers.length === 0 ? (
            <p className="text-gray-500">{t('calculator:no_carriers_found')}</p>
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

      {/* Transport Distance */}
      {selectedCarrier && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('calculator:distance_meters_label')}
          </label>
          <input
            type="number"
            value={transportDistance}
            onChange={(e) => setTransportDistance(e.target.value)}
            className="w-full p-2 border rounded-md"
            placeholder={t('calculator:distance_placeholder')}
            min="0"
            step="1"
          />
          <p className="text-xs text-gray-500 mt-1">
            Set to 0 for no transporting
          </p>
        </div>
      )}
      
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
            <p>{t('calculator:total_soil_label')} <span className="font-medium">{result.totalTons.toFixed(2)} {t('calculator:tons_suffix')}</span></p>
            <p>{t('calculator:excavation_time_label')} <span className="font-medium">{formatTime(result.excavationTime)}</span></p>
            {result.transportTime > 0 && (
              <p>{t('calculator:transport_time_label')} <span className="font-medium">{formatTime(result.transportTime)}</span></p>
            )}
            <p className="pt-2 border-t border-gray-300">{t('calculator:total_time')} <span className="font-medium">{formatTime(result.totalTime)}</span></p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SoilExcavationCalculator;
