import React, { useState } from 'react';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';

interface GritSandCalculatorProps {
  onResultsChange?: (results: any) => void;
}

interface DiggingEquipment {
  id: string;
  name: string;
  'size (in tones)': number;
}

const GritSandCalculator: React.FC<GritSandCalculatorProps> = ({ onResultsChange }) => {
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [thickness, setThickness] = useState(''); // Thickness in cm
  const [result, setResult] = useState<{ volume: number; gritSandTonnes: number; transportTime?: number; normalizedTransportTime?: number } | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);

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
    setCalculationError(null);
    const l = parseFloat(length);
    const w = parseFloat(width);
    const t = parseFloat(thickness); // Thickness in cm

    if (isNaN(l) || isNaN(w) || isNaN(t) || l <= 0 || w <= 0 || t <= 0) {
      setCalculationError('Please enter valid positive numbers for Length, Width, and Thickness.');
      setResult(null);
      return;
    }

    // Convert thickness from cm to meters
    const thicknessM = t / 100;

    // Calculate volume in cubic meters
    const volume = l * w * thicknessM;

    // Density of grit sand: 1800 kg/m³ = 1.8 tonnes/m³
    const gritSandTonnes = volume * 1.8;

    // Calculate transport time if enabled
    let transportTime = 0;
    let normalizedTransportTime = 0;

    if (calculateTransport && gritSandTonnes > 0) {
      let carrierSizeForTransport = 0.125;
      
      if (selectedTransportCarrier) {
        carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
      }

      const transportResult = calculateMaterialTransportTime(gritSandTonnes, carrierSizeForTransport, 'gritSand', parseFloat(transportDistance) || 30);
      transportTime = transportResult.totalTransportTime;
      normalizedTransportTime = transportResult.normalizedTransportTime;
    }

    setResult({
      volume: Number(volume.toFixed(3)),
      gritSandTonnes: Number(gritSandTonnes.toFixed(2)),
      transportTime: Number(transportTime.toFixed(2)),
      normalizedTransportTime: Number(normalizedTransportTime.toFixed(2))
    });

    // Optional: Notify parent component of results
    if (onResultsChange) {
       const formattedResults = {
        name: 'Grit Sand Required',
        amount: gritSandTonnes,
        unit: 'tonnes',
        volume_m3: volume,
        transportTime: transportTime,
        normalizedTransportTime: normalizedTransportTime
       };
      onResultsChange(formattedResults);
     }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Grit Sand Calculator</h2>
      <p className="text-sm text-gray-600">Calculate the amount of grit sand needed in tonnes.</p>

      <div>
        <label className="block text-sm font-medium text-gray-700">Length (m)</label>
        <input
          type="number"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
          placeholder="Enter length in meters"
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Width (m)</label>
        <input
          type="number"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
          placeholder="Enter width in meters"
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Thickness (cm)</label>
        <input
          type="number"
          value={thickness}
          onChange={(e) => setThickness(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
          placeholder="Enter thickness in centimeters"
          min="0"
          step="0.5"
        />
      </div>

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

      <div className="mb-4">
        <label className="inline-flex items-center">
          <input
            type="checkbox"
            checked={calculateTransport}
            onChange={(e) => setCalculateTransport(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="ml-2 text-sm font-medium text-gray-700">Calculate transport time (default as 0.125 wheelbarrow)</span>
        </label>
      </div>

      {calculateTransport && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Transport Carrier</label>
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
                {carrier.size}t Carrier - {carrier.speed} m/h
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={calculate}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
      >
        Calculate
      </button>

      {calculationError && (
        <div className="p-3 bg-red-50 text-red-700 rounded-md">
          {calculationError}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-4 bg-gray-800 p-4 rounded-md">
          <div>
            <h3 className="text-lg font-medium text-white">Grit Sand Required: <span className="text-blue-400">{result.gritSandTonnes} tonnes</span></h3>
            <p className="text-sm text-gray-300 mt-1">(Volume: {result.volume} m³)</p>
            {calculateTransport && result && result.transportTime !== undefined && result.transportTime > 0 && (
              <p className="text-sm text-gray-300 mt-2">Transport time: {result.transportTime.toFixed(2)} hours (normalized to 30m: {result.normalizedTransportTime?.toFixed(2) || 0} hours)</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GritSandCalculator;
