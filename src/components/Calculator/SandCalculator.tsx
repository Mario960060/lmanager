import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';

const materials = [
  { name: 'Type 1 Aggregate', density: 2.1 },
  { name: 'Grid Sand', density: 1.6 },
  { name: 'Soil', density: 1.5 },
  { name: 'Gravel', density: 1.6 },
  { name: 'Crushed Stone', density: 2.4 },
];

interface SandCalculatorProps {
  onResultsChange?: (results: any) => void;
}

interface DiggingEquipment {
  id: string;
  name: string;
  'size (in tones)': number;
}

const SandCalculator: React.FC<SandCalculatorProps> = ({ onResultsChange }) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const [selectedMaterial, setSelectedMaterial] = useState(materials[0]);
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [result, setResult] = useState<number | null>(null);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState([]);
  const [volume, setVolume] = useState('');
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
    const l = parseFloat(length);
    const w = parseFloat(width);
    const h = parseFloat(height);

    if (isNaN(l) || isNaN(w) || isNaN(h)) {
      return;
    }

    let volume = l * w * (h / 1000); // Convert mm to m
    let mass = volume * selectedMaterial.density; // mass in tonnes

    // Calculate transport time if enabled
    let transportTime = 0;
    let normalizedTransportTime = 0;
    let materialTypeForTransport = 'sand';

    if (calculateTransport && mass > 0) {
      let carrierSizeForTransport = 0.125;
      
      if (selectedTransportCarrier) {
        carrierSizeForTransport = selectedTransportCarrier["size (in tones)"] || 0.125;
      }

      const transportResult = calculateMaterialTransportTime(mass, carrierSizeForTransport, materialTypeForTransport, parseFloat(transportDistance) || 30);
      transportTime = transportResult.totalTransportTime;
      normalizedTransportTime = transportResult.normalizedTransportTime;
    }

    setResult(Number(mass.toFixed(2)));
    setVolume(volume.toFixed(2));

    // Add useEffect to notify parent of result changes
    useEffect(() => {
      if (totalHours !== null && materials.length > 0) {
        const formattedResults = {
          name: 'Sand Delivery',
          amount: parseFloat(volume) || 0,
          hours_worked: totalHours,
          transportTime: transportTime,
          normalizedTransportTime: normalizedTransportTime,
          materials: materials.map(material => ({
            name: material.name,
            quantity: mass,
            unit: 'kg'
          })),
          taskBreakdown: taskBreakdown.map(task => ({
            task: task.task,
            hours: task.hours
          }))
        };

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
    }, [totalHours, materials, taskBreakdown, volume, onResultsChange, transportTime, normalizedTransportTime]);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_select_material')}</label>
        <select
          value={selectedMaterial.name}
          onChange={(e) =>
            setSelectedMaterial(materials.find((m) => m.name === e.target.value) || materials[0])
          }
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
        >
          {materials.map((material) => (
            <option key={material.name} value={material.name}>
              {material.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_length_m')}</label>
        <input
          type="number"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_width_m')}</label>
        <input
          type="number"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:height_mm_label')}</label>
        <input
          type="number"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
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
          <span className="ml-2 text-sm font-medium text-gray-700">{t('calculator:calculate_transport_time_label')}</span>
        </label>
      </div>

      {calculateTransport && (
        <>
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
        </>
      )}
      
      <button
        onClick={calculate}
        className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors"
      >
        {t('calculator:calculate_button')}
      </button>
      {result !== null && (
        <div className="mt-4 p-4 bg-gray-100 rounded-md">
          <p className="text-gray-900">
            Required Mass: <span className="font-bold">{result} kg</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default SandCalculator;
