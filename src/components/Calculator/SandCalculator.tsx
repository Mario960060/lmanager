import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { translateMaterialName } from '../../lib/translationMap';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
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
  Checkbox,
  Button,
  Card,
  Label,
} from '../../themes/uiComponents';

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
  };

  return (
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`} style={{ marginBottom: spacing["5xl"] }}>
        <SelectDropdown
          label={t('calculator:input_select_material')}
          value={translateMaterialName(selectedMaterial.name, t)}
          options={materials.map((m) => translateMaterialName(m.name, t))}
          onChange={(val) => setSelectedMaterial(materials.find((m) => translateMaterialName(m.name, t) === val) || materials[0])}
          placeholder={t('calculator:input_select_material')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: `0 ${spacing["5xl"]}px` }}>
          <TextInput label={t('calculator:input_length_m')} value={length} onChange={setLength} placeholder="0" unit="m" />
          <TextInput label={t('calculator:input_width_m')} value={width} onChange={setWidth} placeholder="0" unit="m" />
          <TextInput label={t('calculator:height_mm_label')} value={height} onChange={setHeight} placeholder="0" unit="mm" />
        </div>
        <Checkbox label={t('calculator:calculate_transport_time_label')} checked={calculateTransport} onChange={setCalculateTransport} />
        {calculateTransport && (
          <>
            <TextInput
              label={t('calculator:transport_distance_each_way_label')}
              value={transportDistance}
              onChange={setTransportDistance}
              placeholder={t('calculator:enter_transport_distance')}
            />
            <SelectDropdown
              label={t('calculator:transport_carrier_label')}
              value={selectedTransportCarrier ? (selectedTransportCarrier.id === 'default' ? t('calculator:default_wheelbarrow') : `${selectedTransportCarrier["size (in tones)"]}t Carrier`) : ''}
              options={[t('calculator:default_wheelbarrow'), ...carrierSpeeds.map(c => `${c.size}t Carrier`)]}
              onChange={(val) => {
                if (val === t('calculator:default_wheelbarrow')) {
                  setSelectedTransportCarrier({ id: 'default', name: '0.125t Wheelbarrow', 'size (in tones)': 0.125 });
                } else {
                  const match = val.match(/^([\d.]+)t Carrier$/);
                  if (match) {
                    const size = parseFloat(match[1]);
                    const carrier = carrierSpeeds.find(c => c.size === size);
                    if (carrier) {
                      setSelectedTransportCarrier({
                        id: carrier.size.toString(),
                        name: `${carrier.size}t Carrier`,
                        'size (in tones)': carrier.size
                      });
                    }
                  }
                }
              }}
              placeholder="-- Select Carrier --"
            />
          </>
        )}
        <Button onClick={calculate} variant="primary" fullWidth>
          {t('calculator:calculate_button')}
        </Button>
        {result !== null && (
          <div style={{ marginTop: spacing.xl, padding: spacing.base, background: colors.bgSubtle, borderRadius: radii.lg, border: `1px solid ${colors.borderDefault}` }}>
            <p style={{ fontSize: fontSizes.base, color: colors.textPrimary, fontFamily: fonts.body }}>
              {t('calculator:required_mass_label')} <span style={{ fontWeight: fontWeights.bold }}>{result} {t('calculator:tons_suffix')}</span>
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default SandCalculator;
