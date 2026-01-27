import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';

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
  { size: 'Shovel (1 Person)', sizeInTons: 0.02, tonesPerHour: 2 },
  { size: 'Digger 1T', sizeInTons: 1, tonesPerHour: 7.14 },
  { size: 'Digger 2T', sizeInTons: 2, tonesPerHour: 16.67 },
  { size: 'Digger 3-5T', sizeInTons: 3, tonesPerHour: 50 },
  { size: 'Digger 6-10T', sizeInTons: 6, tonesPerHour: 100 },
  { size: 'Digger 11-20T', sizeInTons: 11, tonesPerHour: 333.33 },
  { size: 'Digger 21-30T', sizeInTons: 21, tonesPerHour: 833.33 },
  { size: 'Digger 31-40T', sizeInTons: 31, tonesPerHour: 1428.57 },
  { size: 'Digger 41-50T', sizeInTons: 41, tonesPerHour: 2500 }
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

interface SoilExcavationCalculatorProps {
  onResultsChange?: (results: any) => void;
}

const SoilExcavationCalculator: React.FC<SoilExcavationCalculatorProps> = ({ onResultsChange }) => {
  // State for input values
  const [calculationMethod, setCalculationMethod] = useState<'direct' | 'area'>('area');
  const [tons, setTons] = useState<string>('');
  const [length, setLength] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [depth, setDepth] = useState<string>('');
  const [excavationOption, setExcavationOption] = useState<'removal' | 'pile'>('removal');
  
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
    totalTime: number;
  } | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
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
      alert('Please select an excavator');
      return;
    }
    
    // Only require carrier selection for "Removal" option
    if (excavationOption === 'removal' && !selectedCarrier) {
      alert('Please select a carrier');
      return;
    }
    
    const totalTons = calculateSoilWeight();
    
    if (totalTons <= 0) {
      alert('Please enter valid dimensions or weight');
      return;
    }
    
    // Get excavator size and loading rate
    const excavatorSize = selectedExcavator["size (in tones)"] || 0;
    const loadingRatePerHour = findDiggerLoadingRate(excavatorSize);
    const excavationTime = totalTons / loadingRatePerHour; // Hours
    
    // Only calculate transport time for "Removal" option
    let transportTime = 0;
    if (excavationOption === 'removal' && selectedCarrier) {
      const carrierSize = selectedCarrier["size (in tones)"] || 0;
      const carrierSpeed = findCarrierSpeed(carrierSize);
      const transportDistanceMeters = parseFloat(transportDistance) || 0;
      
      // Calculate number of trips
      const trips = Math.ceil(totalTons / carrierSize);
      
      // Calculate transport time per trip (in hours)
      const distanceRoundTrip = transportDistanceMeters * 2; // tam i z powrotem
      const transportTimePerTrip = distanceRoundTrip / carrierSpeed; // hours
      
      // Total transport time
      transportTime = trips * transportTimePerTrip;
    }
    
    // Set result - total time is excavation time + transport time (if applicable)
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
    if (result) {
      // Calculate normalized transport time (for 30m baseline)
      let normalizedTransportTime = 0;
      if (excavationOption === 'removal' && selectedCarrier) {
        const carrierSize = selectedCarrier["size (in tones)"] || 0;
        const carrierSpeed = findCarrierSpeed(carrierSize);
        const trips = Math.ceil(result.totalTons / carrierSize);
        const normalizedDistance = 30; // baseline distance in meters
        const distanceRoundTrip = normalizedDistance * 2;
        const transportTimePerTrip = distanceRoundTrip / carrierSpeed;
        normalizedTransportTime = trips * transportTimePerTrip;
      }

      const formattedResults = {
        name: excavationOption === 'removal' ? 'Soil Excavation and Removal' : 'Soil Excavation and Pile Up',
        amount: result.totalTons,
        hours_worked: result.totalTime,
        materials: [
          {
            name: 'Soil',
            quantity: result.totalTons,
            unit: 'tons'
          }
        ],
        taskBreakdown: [
          {
            task: 'Excavation',
            hours: result.excavationTime,
            amount: result.totalTons,
            unit: 'tonnes'
          }
        ]
      };

      if (excavationOption === 'removal') {
        formattedResults.taskBreakdown.push({
          task: 'Transport',
          hours: normalizedTransportTime, // Store normalized time for statistics
          amount: result.totalTons,
          unit: 'tonnes'
        });
      }

      // Store results in data attribute
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      // Notify parent component
      if (onResultsChange) {
        onResultsChange(formattedResults);
      }
    }
  }, [result, excavationOption, onResultsChange, selectedCarrier]);

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
      <h2 className="text-xl font-semibold text-gray-800">Soil Excavation Calculator</h2>
      
      {/* Excavation Options */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          className={`p-4 border rounded-md text-center ${
            excavationOption === 'removal' 
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setExcavationOption('removal')}
        >
          Soil Excavation and Removal
        </button>
        <button
          className={`p-4 border rounded-md text-center ${
            excavationOption === 'pile' 
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setExcavationOption('pile')}
        >
          Soil Excavation and Pile Up
        </button>
      </div>
      
      {/* Calculation Method */}
      <div>
        <p 
          className="text-blue-600 cursor-pointer hover:underline mb-2"
          onClick={() => setCalculationMethod(calculationMethod === 'direct' ? 'area' : 'direct')}
        >
          {calculationMethod === 'direct' ? 'Calculate by area' : 'Calculate by weight'}
        </p>
        
        {calculationMethod === 'direct' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Soil Weight (tons)</label>
            <input
              type="number"
              value={tons}
              onChange={(e) => setTons(e.target.value)}
              className="w-full p-2 border rounded-md"
              placeholder="Enter weight in tons"
              min="0"
              step="0.1"
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Length (m)</label>
              <input
                type="number"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder="Length"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Width (m)</label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder="Width"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Depth (cm)</label>
              <input
                type="number"
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder="Depth"
                min="0"
                step="0.01"
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Equipment Selection */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-3">Excavation Machinery</label>
          <div className="space-y-2">
            {excavators.length === 0 ? (
              <p className="text-gray-500">No excavators found</p>
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
        
        {/* Only show Carrier Machinery for "Removal" option */}
        {excavationOption === 'removal' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Carrier Machinery</label>
            <div className="space-y-2">
              {carriers.length === 0 ? (
                <p className="text-gray-500">No carriers found</p>
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
        ) : (
          // Empty div to maintain the grid layout when Carrier Machinery is hidden
          <div></div>
        )}
      </div>
      
      {/* Transport Distance - Only show for "Removal" option */}
      {excavationOption === 'removal' && (
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
          <h3 className="text-lg font-semibold mb-2">Estimated Time</h3>
          <div className="space-y-2">
            <p>Total Soil: <span className="font-medium">{result.totalTons.toFixed(2)} tons</span></p>
            <p>Excavation Time: <span className="font-medium">{formatTime(result.excavationTime)}</span></p>
            {excavationOption === 'removal' && (
              <p>Transport Time: <span className="font-medium">{formatTime(result.transportTime)}</span></p>
            )}
            <p className="text-lg">
              Total Time: <span className="font-bold">
                {formatTime(result.totalTime)}
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SoilExcavationCalculator;
