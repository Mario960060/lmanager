import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { translateMaterialName, translateUnit } from '../../lib/translationMap';
import {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
  radii,
  gradients,
} from '../../themes/designTokens';
import {
  TextInput,
  CalculatorInputGrid,
  Button,
  Card,
  DataTable,
} from '../../themes/uiComponents';

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
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`} style={{ marginBottom: spacing["5xl"] }}>
        {type === 'slab' ? (
          <TextInput
            label={t('calculator:input_mortar_area_m2')}
            value={area}
            onChange={setArea}
            placeholder="0"
            unit="m²"
          />
        ) : (
          <CalculatorInputGrid columns={2}>
            <TextInput
              label={t('calculator:input_length_m')}
              value={length}
              onChange={setLength}
              placeholder="0"
              unit="m"
            />
            <TextInput
              label={t('calculator:input_width_m')}
              value={width}
              onChange={setWidth}
              placeholder="0"
              unit="m"
            />
            <TextInput
              label={t('calculator:input_mortar_height_cm')}
              value={thickness}
              onChange={setThickness}
              placeholder="0"
              unit="cm"
            />
          </CalculatorInputGrid>
        )}

        <Button onClick={calculate} variant="primary" fullWidth>
          {t('calculator:calculate_button')}
        </Button>

        {result && (
          <div ref={resultsRef} style={{ marginTop: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }}>
            <Card style={{ background: gradients.blueCard, border: `1px solid ${colors.accentBlueBorder}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.lg, flexWrap: 'wrap' }}>
                <span style={{ fontSize: fontSizes.md, color: colors.textSubtle, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>
                  {t('calculator:total_volume_label')}
                </span>
                <span style={{ fontSize: fontSizes["4xl"], fontWeight: fontWeights.extrabold, color: colors.accentBlue, fontFamily: fonts.display }}>
                  {result.volume} m³
                </span>
                <span style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>
                  ({t('calculator:approximately_tonnes_format', { value: (result.volume * 1.5).toFixed(2) })})
                </span>
              </div>
            </Card>
            <Card>
              <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display, letterSpacing: '0.3px', marginBottom: spacing["2xl"] }}>
                {t('calculator:materials_required_label')}
              </h3>
              <DataTable
                columns={[
                  { key: 'name', label: t('calculator:table_material_header'), width: '2fr' },
                  { key: 'quantity', label: t('calculator:table_quantity_header'), width: '1fr' },
                  { key: 'unit', label: t('calculator:table_unit_header'), width: '1fr' },
                ]}
                rows={[
                  {
                    name: <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateMaterialName('Cement', t)}</span>,
                    quantity: <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{result.cementBags}</span>,
                    unit: <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>{translateUnit('bags', t)}</span>,
                  },
                  {
                    name: <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateMaterialName('Sand', t)}</span>,
                    quantity: <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{result.sand.toFixed(2)}</span>,
                    unit: <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>kg</span>,
                  },
                ]}
              />
            </Card>
          </div>
        )}
      </Card>
    </div>
  );
};

export default MortarCalculator;
