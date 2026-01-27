import React, { useState, useRef, useEffect } from 'react';

interface FoundationCalculatorProps {
  onResultsChange?: (results: any) => void;
}

const FoundationCalculator: React.FC<FoundationCalculatorProps> = ({ onResultsChange }) => {
  // Input states
  const [length, setLength] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [depthCm, setDepthCm] = useState<string>('');
  const [diggingMethod, setDiggingMethod] = useState<'shovel' | 'small' | 'medium' | 'large'>('shovel');
  const [soilType, setSoilType] = useState<'clay' | 'sand' | 'rock'>('clay');

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

  const MACHINE_MULTIPLIER = {
    shovel: 1,      // 1× (baseline)
    small: 6,       // 1/6
    medium: 12,     // 1/12
    large: 25       // 1/25
  };

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

  const calculate = () => {
    // Validation
    if (!length || !width || !depthCm) {
      setCalculationError('Please fill in all required fields');
      return;
    }

    setCalculationError(null);

    try {
      const lengthNum = parseFloat(length);
      const widthNum = parseFloat(width);
      const depthNum = parseFloat(depthCm) / 100; // Convert cm to meters

      // Validate positive numbers
      if (lengthNum <= 0 || widthNum <= 0 || depthNum <= 0) {
        setCalculationError('All dimensions must be positive numbers');
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

      // 4. Divide by machine multiplier to get final time
      const multiplier = MACHINE_MULTIPLIER[diggingMethod];
      const excavationHours = timeWithDimensions / multiplier;

      // 5. Calculate material weight (excavated soil)
      const soilDensity = SOIL_DENSITY[soilType];
      const excavatedSoilTonnes = actualVolume * soilDensity;
      
      // Calculate loose volume after excavation (soil expands)
      const looseVolumeCoefficient = LOOSE_VOLUME_COEFFICIENT[soilType];
      const looseVolume = actualVolume * looseVolumeCoefficient;

      // 6. Calculate concrete components
      const cementKg = actualVolume * CONCRETE_MIX.cement;
      const sandKg = actualVolume * CONCRETE_MIX.sand;
      const aggregateKg = actualVolume * CONCRETE_MIX.aggregate;

      const cementBags = Math.ceil(cementKg / 25); // 25kg bags
      const sandTonnes = sandKg / 1000;
      const aggregateTonnes = aggregateKg / 1000;

      // Build task breakdown (single excavation task)
      const breakdown = [
        {
          task: 'Foundation Excavation',
          hours: excavationHours,
          amount: actualVolume.toFixed(2),
          unit: 'm³'
        }
      ];

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

      const hours = excavationHours;

      setTotalHours(hours);
      setTaskBreakdown(breakdown);
      setMaterials(materialsList);

      if (onResultsChange) {
        onResultsChange({
          name: 'Foundation Excavation & Concrete',
          amount: actualVolume,
          unit: 'm³',
          hours_worked: hours,
          materials: materialsList.map(material => ({
            name: material.name,
            quantity: material.amount,
            unit: material.unit
          })),
          taskBreakdown: breakdown
        });
      }
    } catch (error) {
      setCalculationError('An error occurred during calculation');
      console.error(error);
    }
  };

  const clearAll = () => {
    setLength('');
    setWidth('');
    setDepthCm('');
    setDiggingMethod('shovel');
    setSoilType('clay');
    setTotalHours(null);
    setTaskBreakdown([]);
    setMaterials([]);
    setCalculationError(null);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Foundation Calculator</h2>
      <p className="text-sm text-gray-600">
        Calculate excavation time, excavated soil volume, and concrete materials required for foundation work.
      </p>

      <div className="space-y-4">
        {/* Excavation Dimensions */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Length (m)</label>
            <input
              type="number"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Enter length in meters"
              min="0"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Width (m)</label>
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Enter width in meters"
              min="0"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Depth (cm)</label>
            <input
              type="number"
              value={depthCm}
              onChange={(e) => setDepthCm(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Enter depth in centimeters"
              min="0"
              step="1"
            />
          </div>
        </div>

        {/* Digging Method */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Digging Method</label>
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
          <label className="block text-sm font-medium text-gray-700">Soil Type</label>
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

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4">
          <button
            onClick={calculate}
            disabled={!length || !width || !depthCm}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300"
          >
            Calculate
          </button>
          <button
            onClick={clearAll}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Clear
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
              <h3 className="text-lg font-medium">Total Labor Hours: <span className="text-blue-600">{totalHours.toFixed(2)} hours</span></h3>
              
              <div className="mt-2">
                <h4 className="font-medium text-gray-700 mb-2">Task Breakdown:</h4>
                <ul className="space-y-1 pl-5 list-disc">
                  {taskBreakdown.map((task: any, index: number) => (
                    <li key={index} className="text-sm">
                      <span className="font-medium">{task.task}:</span> {task.hours.toFixed(2)} hours ({task.amount} {task.unit})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Materials Required:</h3>
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
