import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  computeGroundworkLinearResults,
  isManualExcavation,
  type GroundworkElementType,
} from '../../projectmanagement/canvacreator/GroundworkLinearCalculator';
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
  SelectDropdown,
  Button,
  Card,
  Label,
  HelperText,
} from '../../themes/uiComponents';

interface GroundworkLinearCalculatorProps {
  type: GroundworkElementType;
  onResultsChange?: (results: any) => void;
  onInputsChange?: (inputs: Record<string, any>) => void;
  isInProjectCreating?: boolean;
  initialLength?: number;
  savedInputs?: Record<string, any>;
  selectedExcavator?: { "size (in tones)"?: number } | null;
  projectDiggingMethod?: 'shovel' | 'small' | 'medium' | 'large';
  recalculateTrigger?: number;
}

const ELEMENT_LABELS: Record<GroundworkElementType, string> = {
  drainage: 'Drainage',
  canalPipe: 'Canal Pipe',
  waterPipe: 'Water Pipe',
  cable: 'Cable',
};

const GroundworkLinearCalculator: React.FC<GroundworkLinearCalculatorProps> = ({
  type,
  onResultsChange,
  onInputsChange,
  isInProjectCreating = false,
  initialLength,
  savedInputs = {},
  selectedExcavator,
  projectDiggingMethod,
  recalculateTrigger = 0,
}) => {
  const { t } = useTranslation(['calculator', 'common']);
  const initLength =
    savedInputs?.length != null
      ? String(savedInputs.length)
      : initialLength != null
        ? initialLength.toFixed(3)
        : '';
  const [length, setLength] = useState(initLength);
  const [excavationMethod, setExcavationMethod] = useState<'manual' | 'machinery'>(
    savedInputs?.excavationMethod ?? 'manual'
  );

  useEffect(() => {
    if (savedInputs?.length != null) setLength(String(savedInputs.length));
    else if (initialLength != null && isInProjectCreating) setLength(initialLength.toFixed(3));
  }, [savedInputs?.length, initialLength, isInProjectCreating]);

  const showExcavationSelector = !isInProjectCreating;
  const isManual = useCallback(() => {
    if (isInProjectCreating) {
      return isManualExcavation(projectDiggingMethod, selectedExcavator);
    }
    return excavationMethod === 'manual';
  }, [isInProjectCreating, projectDiggingMethod, selectedExcavator, excavationMethod]);

  const calculate = useCallback(() => {
    const lengthM = parseFloat(length);
    if (isNaN(lengthM) || lengthM <= 0) return;
    const results = computeGroundworkLinearResults({
      lengthM,
      elementType: type,
      isManual: isManual(),
    });
    onResultsChange?.(results);
    onInputsChange?.({ length, excavationMethod: isManual() ? 'manual' : 'machinery' });
  }, [length, type, isManual, onResultsChange, onInputsChange]);

  useEffect(() => {
    if (onInputsChange && isInProjectCreating) {
      onInputsChange({ length, excavationMethod: isManual() ? 'manual' : 'machinery' });
    }
  }, [length, isManual, onInputsChange, isInProjectCreating]);

  useEffect(() => {
    if (recalculateTrigger > 0 && length) {
      const lengthM = parseFloat(length);
      if (!isNaN(lengthM) && lengthM > 0) {
        const results = computeGroundworkLinearResults({
          lengthM,
          elementType: type,
          isManual: isManual(),
        });
        onResultsChange?.(results);
      }
    }
  }, [recalculateTrigger]);

  const lengthM = parseFloat(length);
  const isValid = !isNaN(lengthM) && lengthM > 0;
  const label = ELEMENT_LABELS[type];

  return (
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
      <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display }}>
        {label} — {t('calculator:groundwork_linear', { defaultValue: 'Groundwork linear elements' })}
      </h3>

      <TextInput
        label={t('calculator:length_m', { defaultValue: 'Length (m)' })}
        value={length}
        onChange={setLength}
        placeholder="0"
        unit="m"
      />

      {showExcavationSelector && (
        <SelectDropdown
          label={t('calculator:excavation_method', { defaultValue: 'Excavation method' })}
          value={excavationMethod === 'manual' ? 'Manual (shovel)' : 'Machinery (excavator)'}
          options={['Manual (shovel)', 'Machinery (excavator)']}
          onChange={(val) => setExcavationMethod(val === 'Manual (shovel)' ? 'manual' : 'machinery')}
          placeholder={t('calculator:excavation_method', { defaultValue: 'Excavation method' })}
        />
      )}

      {isInProjectCreating && selectedExcavator && (
        <p style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>
          {t('calculator:using_project_excavation', {
            defaultValue: 'Using project excavation equipment',
          })}{' '}
          ({selectedExcavator["size (in tones)"] ?? '?'} t) —{' '}
          {isManual() ? 'Manual' : 'Machinery'}
        </p>
      )}

      <Button onClick={calculate} disabled={!isValid} variant="primary">
        {t('calculator:calculate', { defaultValue: 'Calculate' })}
      </Button>

      {isValid && (
        <Card style={{ marginTop: spacing.xl }}>
          <p style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>
            {t('calculator:click_calculate_to_see_results', {
              defaultValue: 'Click Calculate to see results',
            })}
          </p>
        </Card>
      )}
    </div>
  );
};

export default GroundworkLinearCalculator;
