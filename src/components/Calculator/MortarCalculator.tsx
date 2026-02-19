import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface CalculatorProps {
  type: 'slab' | 'general';
  onResultsChange?: (results: any) => void;
}

const MortarCalculator: React.FC<CalculatorProps> = ({ type, onResultsChange }) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [thickness, setThickness] = useState('');
  const [area, setArea] = useState('');
  const [result, setResult] = useState<{ volume: number; cementBags: number; sand: number } | null>(null);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [materials, setMaterials] = useState<{ name: string; amount: number; unit: string }[]>([]);
  const [taskBreakdown, setTaskBreakdown] = useState<{ task: string; hours: number }[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  const calculate = () => {
    let volume = 0;
    let cement = 0;
    let sand = 0;

    if (type === 'slab') {
      // Slab Calculation: Use area input & fixed thickness (3cm = 0.03m)
      const a = parseFloat(area);
      if (isNaN(a) || a <= 0) return;

      const thickness = 0.03; // 3cm = 0.03m
      volume = a * thickness;

      cement = volume * 350; // 350kg cement per m³
      sand = volume * 1200; // 1200kg sand per m³
    } else {
      // General Calculation: Use length, width, and thickness inputs
      const l = parseFloat(length);
      const w = parseFloat(width);
      const t = parseFloat(thickness);

      if (isNaN(l) || isNaN(w) || isNaN(t) || l <= 0 || w <= 0 || t <= 0) return;

      volume = l * w * (t / 100); // Convert thickness from cm to m

      cement = volume * 400; // 400kg cement per m³ (for general)
      sand = volume * 1350; // 1350kg sand per m³ (for general)
    }

    const cementBags = Math.ceil(cement / 25); // Convert cement to 25kg bags

    setResult({
      volume: Number(volume.toFixed(3)),
      cementBags,
      sand: Number(sand.toFixed(1))
    });
  };

  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (totalHours !== null && materials.length > 0) {
      const formattedResults = {
        name: 'Mortar Mixing',
        amount: result?.volume || 0,
        hours_worked: totalHours,
        materials: materials.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit
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
  }, [totalHours, materials, taskBreakdown, result, onResultsChange]);

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
    <div className="space-y-4">
      {type === 'slab' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('calculator:input_mortar_area_m2')}</label>
          <input
            type="number"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('calculator:input_length_m')}</label>
            <input
              type="number"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('calculator:input_width_m')}</label>
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('calculator:input_mortar_height_cm')}</label>
            <input
              type="number"
              value={thickness}
              onChange={(e) => setThickness(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </>
      )}

      <button
        onClick={calculate}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
      >
        {t('calculator:calculate_button')}
      </button>

      {result && (
        <div ref={resultsRef} className="mt-6 space-y-4 bg-gray-800 p-4 rounded-md">
          <div>
            <h3 className="text-lg font-medium text-white">{t('calculator:total_volume_label')} <span className="text-blue-400">{result.volume} m³</span></h3>
            <p className="text-sm text-gray-300 mt-1">(Approximately {(result.volume * 1.5).toFixed(2)} tonnes)</p>
          </div>
          
          <div>
            <h3 className="font-medium mb-2 text-white">{t('calculator:materials_required_label')}</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-900">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Material
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Unit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  <tr className="bg-gray-800">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      Cement
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {result.cementBags}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      bags (25kg each)
                    </td>
                  </tr>
                  <tr className="bg-gray-900">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      Sand
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {result.sand.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      kg
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MortarCalculator;
