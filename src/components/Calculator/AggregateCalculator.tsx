import * as React from 'react';
import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface Material {
  name: string;
  density: number;
  amount?: number;
  unit?: string;
}

interface Task {
  task: string;
  hours: number;
}

const materials: Material[] = [
  { name: 'Type 1 Aggregate', density: 2.1 },
  { name: 'Grid Sand', density: 1.6 },
  { name: 'Soil', density: 1.5 },
  { name: 'Gravel', density: 1.6 },
  { name: 'Crushed Stone', density: 2.4 },
];

interface FormattedResults {
  name: string;
  amount: number;
  hours_worked: number;
  materials: { name: string; quantity: number; unit: string }[];
  taskBreakdown: { task: string; hours: number }[];
}

interface AggregateCalculatorProps {
  onResultsChange?: (results: FormattedResults) => void;
}

const AggregateCalculator: React.FC<AggregateCalculatorProps> = ({ onResultsChange }) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const [selectedMaterial, setSelectedMaterial] = useState<Material>(materials[0]);
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [depth, setDepth] = useState('');
  const [result, setResult] = useState<number | null>(null);
  const totalHours = null; // Not currently calculated
  const taskBreakdown: Task[] = []; // Not currently populated
  const area = ''; // Not currently set
  const resultsRef = useRef<HTMLDivElement>(null);

  const calculate = () => {
    const l = parseFloat(length);
    const w = parseFloat(width);
    const d = parseFloat(depth);

    if (isNaN(l) || isNaN(w) || isNaN(d)) {
      return;
    }

    let volume = l * w * (d / 100); // Convert cm to m
    let mass = volume * selectedMaterial.density;
    
    // Convert kg to tonnes
    let massInTonnes = mass;
    
    setResult(Number(massInTonnes.toFixed(2)));
  };

  useEffect(() => {
    if (totalHours !== null && materials.length > 0) {
      const formattedResults: FormattedResults = {
        name: 'Aggregate Installation',
        amount: parseFloat(area) || 0,
        hours_worked: totalHours,
        materials: materials.map(material => ({
          name: material.name,
          quantity: material.amount || 0,
          unit: material.unit || 'tonnes'
        })),
        taskBreakdown: taskBreakdown.map((task: Task) => ({
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
  }, [totalHours, materials, taskBreakdown, area, onResultsChange]);

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
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_select_material')}</label>
        <select
          value={selectedMaterial.name}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
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
          onChange={(e: ChangeEvent<HTMLInputElement>) => setLength(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_width_m')}</label>
        <input
          type="number"
          value={width}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setWidth(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_depth_cm')}</label>
        <input
          type="number"
          value={depth}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDepth(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
          placeholder={t('calculator:placeholder_enter_depth_cm')}
        />
      </div>
      <button
        onClick={calculate}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
      >
        {t('calculator:calculate_button')}
      </button>
      {result !== null && (
        <div ref={resultsRef} className="mt-4 p-4 bg-gray-100 rounded-md">
          <p className="text-gray-900">
            Required Mass: <span className="font-bold">{result} tonnes</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default AggregateCalculator;
