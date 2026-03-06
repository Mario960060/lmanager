import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
  radii,
} from '../../themes/designTokens';
import {
  TextInput,
  SelectDropdown,
  Button,
  Card,
} from '../../themes/uiComponents';

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
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`} style={{ marginBottom: spacing["5xl"] }}>
        <SelectDropdown
          label={t('calculator:input_select_material')}
          value={selectedMaterial.name}
          options={materials.map((m) => m.name)}
          onChange={(val) => setSelectedMaterial(materials.find((m) => m.name === val) || materials[0])}
          placeholder={t('calculator:input_select_material')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: `0 ${spacing["5xl"]}px` }}>
          <TextInput label={t('calculator:input_length_m')} value={length} onChange={setLength} placeholder="0" unit="m" />
          <TextInput label={t('calculator:input_width_m')} value={width} onChange={setWidth} placeholder="0" unit="m" />
          <TextInput label={t('calculator:input_depth_cm')} value={depth} onChange={setDepth} placeholder={t('calculator:placeholder_enter_depth_cm')} unit="cm" />
        </div>
        <Button onClick={calculate} variant="primary" fullWidth>
          {t('calculator:calculate_button')}
        </Button>
        {result !== null && (
          <div ref={resultsRef} style={{ marginTop: spacing.xl, padding: spacing.base, background: colors.bgSubtle, borderRadius: radii.lg, border: `1px solid ${colors.borderDefault}` }}>
            <p style={{ fontSize: fontSizes.base, color: colors.textPrimary, fontFamily: fonts.body }}>
              Required Mass: <span style={{ fontWeight: fontWeights.bold }}>{result} tonnes</span>
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AggregateCalculator;
