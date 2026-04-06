import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { CompactorSelector, type CompactorOption } from './CompactorSelector';
import { calculateCompactingTime } from '../../lib/compactingCalculations';
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
  Label,
  DataTable,
} from '../../themes/uiComponents';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { carrierSpeeds, DEFAULT_CARRIER_SPEED_M_PER_H } from '../../constants/materialCapacity';

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
  { equipment: 'Shovel (manual)', sizeInTons: 0.02, tonesPerHour: 2 },
  { equipment: '0.5t mini digger', sizeInTons: 0.5, tonesPerHour: 4.35 },
  { equipment: '1t mini digger', sizeInTons: 1, tonesPerHour: 5.56 },
  { equipment: '1.5-2t digger', sizeInTons: 2, tonesPerHour: 6.67 },
  { equipment: '3-5t digger', sizeInTons: 3, tonesPerHour: 8.33 },
  { equipment: '6-10t digger', sizeInTons: 6, tonesPerHour: 12.5 },
  { equipment: '11-20t digger', sizeInTons: 11, tonesPerHour: 20 },
  { equipment: '21-30t digger', sizeInTons: 21, tonesPerHour: 33.33 },
  { equipment: '31-40t digger', sizeInTons: 31, tonesPerHour: 50 },
  { equipment: '40t+ digger', sizeInTons: 40, tonesPerHour: 100 }
];

interface Type1AggregateCalculatorProps {
  onResultsChange?: (results: any) => void;
}

const Type1AggregateCalculator: React.FC<Type1AggregateCalculatorProps> = ({ onResultsChange }) => {
  // State for input values
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const [tons, setTons] = useState<string>('');
  const [length, setLength] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [depth, setDepth] = useState<string>('');
  const [calculationMethod, setCalculationMethod] = useState<'direct' | 'area'>('direct');
  
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
    compactingTime: number;
    compactingLayers: number;
    compactingCompactorName: string;
    totalTime: number;
  } | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [selectedCompactor, setSelectedCompactor] = useState<CompactorOption | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Fetch equipment from the database (same logic as Canvas/EquipmentPanel - fetch all carriers without filtering)
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        if (!companyId) return;

        const [excRes, carRes] = await Promise.all([
          supabase.from('setup_digging').select('*').eq('type', 'excavator').eq('company_id', companyId),
          supabase.from('setup_digging').select('*').eq('type', 'barrows_dumpers').eq('company_id', companyId),
        ]);

        if (excRes.error) throw excRes.error;
        if (carRes.error) throw carRes.error;

        setExcavators((excRes.data || []) as DiggingEquipment[]);
        setCarriers((carRes.data || []) as DiggingEquipment[]);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    fetchEquipment();
  }, [companyId]);

  // Calculate Type 1 aggregate weight from dimensions
  const calculateType1Weight = () => {
    if (calculationMethod === 'direct') {
      return parseFloat(tons) || 0;
    } else {
      const l = parseFloat(length) || 0;
      const w = parseFloat(width) || 0;
      const d = parseFloat(depth) || 0;
      
      // Calculate volume in cubic meters
      const volumeInCubicMeters = l * w * (d / 100);
      
      // Convert to tons (1 cubic meter = 2.3 tons for Type 1 aggregate)
      return volumeInCubicMeters * 2.3;
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
      alert(t('calculator:please_select_excavator'));
      return;
    }
    
    if (!selectedCarrier) {
      alert(t('calculator:please_select_carrier'));
      return;
    }

    if (!selectedCompactor) {
      alert(t('calculator:please_select_compactor'));
      return;
    }
    
    const totalTons = calculateType1Weight();
    
    if (totalTons <= 0) {
      alert(t('calculator:valid_dimensions_required'));
      return;
    }

    // Depth required only in area mode; in direct (tons) mode use default 10cm for compacting
    const depthCm = calculationMethod === 'direct' ? 10 : (parseFloat(depth) || 0);
    if (calculationMethod === 'area' && depthCm <= 0) {
      alert(t('calculator:valid_depth_required'));
      return;
    }
    
    // Get excavator size and loading rate
    const excavatorSize = selectedExcavator["size (in tones)"] || 0;
    const loadingRatePerHour = findDiggerLoadingRate(excavatorSize);
    const excavationTime = totalTons / loadingRatePerHour; // Hours
    
    // Calculate transport time
    const carrierSize = selectedCarrier["size (in tones)"] || 0;
    const carrierSpeed = findCarrierSpeed(carrierSize);
    const transportDistanceMeters = parseFloat(transportDistance) || 0;
    
    // Calculate number of trips
    const trips = Math.ceil(totalTons / carrierSize);
    
    // Calculate transport time per trip (in hours)
    const distanceRoundTrip = transportDistanceMeters * 2; // tam i z powrotem
    const transportTimePerTrip = distanceRoundTrip / carrierSpeed; // hours
    
    // Total transport time
    const transportTime = trips * transportTimePerTrip;

    // Calculate compacting time: in direct mode estimate area from tons (volume/2.3 = m³, area = volume/(depth/100))
    const areaM2 = calculationMethod === 'direct'
      ? (totalTons / 2.3) / (depthCm / 100)
      : (parseFloat(length) || 0) * (parseFloat(width) || 0);
    const compactingCalc = calculateCompactingTime(selectedCompactor, depthCm, 'type1');
    const compactingTimeTotal = areaM2 * compactingCalc.timePerM2 * compactingCalc.totalPasses;
    
    // Set result - total time is excavation time + transport time + compacting time
    setResult({
      totalTons,
      excavationTime,
      transportTime,
      compactingTime: compactingTimeTotal,
      compactingLayers: compactingCalc.numberOfLayers,
      compactingCompactorName: compactingCalc.compactorTaskName,
      totalTime: excavationTime + transportTime + compactingTimeTotal
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
    if (result && onResultsChange) {
      // Calculate normalized transport time (for 30m baseline)
      const carrierSize = selectedCarrier ? selectedCarrier["size (in tones)"] || 0 : 0;
      const carrierSpeed = selectedCarrier ? findCarrierSpeed(carrierSize) : DEFAULT_CARRIER_SPEED_M_PER_H;
      const trips = Math.ceil(result.totalTons / carrierSize);
      const normalizedDistance = 30; // baseline distance in meters
      const distanceRoundTrip = normalizedDistance * 2;
      const transportTimePerTrip = distanceRoundTrip / carrierSpeed;
      const normalizedTransportTime = trips * transportTimePerTrip;

      const formattedResults = {
        name: 'Type 1 Aggregate Installation',
        amount: result.totalTons,
        hours_worked: result.totalTime,
        materials: [],
        taskBreakdown: [
          {
            task: 'Preparation',
            hours: result.excavationTime,
            amount: result.totalTons,
            unit: 'tonnes'
          },
          {
            task: 'Transport',
            hours: normalizedTransportTime, // Store normalized time for statistics
            amount: result.totalTons,
            unit: 'tonnes'
          },
          {
            task: result.compactingCompactorName,
            hours: result.compactingTime,
            amount: result.totalTons,
            unit: 'tonnes',
            layers: result.compactingLayers
          }
        ]
      };

      // Store results in data attribute
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      // Notify parent component
      onResultsChange(formattedResults);
    }
  }, [result, onResultsChange, selectedCarrier]);

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
      <h2 style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.extrabold, color: colors.textPrimary, fontFamily: fonts.display, letterSpacing: '0.3px', margin: `${spacing.md}px 0 ${spacing.sm}px` }}>
        {t('calculator:input_prep_calculator')}
      </h2>
      <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, lineHeight: 1.5 }}>
        {t('calculator:type1_prep_description', { defaultValue: 'Calculate time for Type 1 aggregate preparation: loading, transport and compacting.' })}
      </p>
      
      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`} style={{ marginBottom: spacing["5xl"] }}>
        <p 
          style={{ color: colors.accentBlue, cursor: 'pointer', marginBottom: spacing["5xl"], fontSize: fontSizes.base, fontFamily: fonts.body, fontWeight: fontWeights.medium }}
          onClick={() => setCalculationMethod(calculationMethod === 'direct' ? 'area' : 'direct')}
        >
          {calculationMethod === 'direct' ? t('calculator:input_calculation_method_area') : t('calculator:input_calculation_method_weight')}
        </p>
        
        {calculationMethod === 'direct' ? (
          <>
            <TextInput
              label={t('calculator:input_aggregate_weight_tons')}
              value={tons}
              onChange={setTons}
              placeholder={t('calculator:placeholder_enter_weight_tons')}
              unit="tons"
              helperText={t('calculator:message_depth_default_compacting')}
            />
          </>
        ) : (
          <CalculatorInputGrid columns={3}>
            <TextInput label={t('calculator:input_length_m')} value={length} onChange={setLength} placeholder={t('calculator:placeholder_enter_length')} unit="m" />
            <TextInput label={t('calculator:input_width_m')} value={width} onChange={setWidth} placeholder={t('calculator:placeholder_enter_width')} unit="m" />
            <TextInput label={t('calculator:input_depth_cm')} value={depth} onChange={setDepth} placeholder={t('calculator:placeholder_enter_depth_cm')} unit="cm" helperText={t('calculator:message_enter_depth_cm')} />
          </CalculatorInputGrid>
        )}
        
        <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: spacing.xl, marginTop: spacing.xs, marginBottom: spacing["3xl"] }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `0 ${spacing["5xl"]}px` }}>
            <div>
              <Label style={{ marginBottom: spacing.lg }}>{t('calculator:input_excavation_machinery')}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {excavators.length === 0 ? (
                  <p style={{ fontSize: fontSizes.base, color: colors.textDim }}>{t('calculator:input_no_excavators')}</p>
                ) : (
                  excavators.map((excavator) => (
                    <div key={excavator.id} style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing["2xl"]}px`, cursor: 'pointer', borderRadius: radii.lg, background: selectedExcavator?.id === excavator.id ? colors.bgHover : 'transparent', border: `1px solid ${selectedExcavator?.id === excavator.id ? colors.accentBlueBorder : colors.borderLight}` }} onClick={() => setSelectedExcavator(excavator)}>
                      <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${selectedExcavator?.id === excavator.id ? colors.accentBlue : colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedExcavator?.id === excavator.id && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
                      </div>
                      <div>
                        <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{excavator.name}</span>
                        <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing.md }}>({excavator["size (in tones)"]} tons)</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <Label style={{ marginBottom: spacing.lg }}>{t('calculator:input_transport_carrier_for_aggregate')}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {carriers.length === 0 ? (
                  <p style={{ fontSize: fontSizes.base, color: colors.textDim }}>{t('calculator:input_no_carriers')}</p>
                ) : (
                  carriers.map((carrier) => (
                    <div key={carrier.id} style={{ display: 'flex', alignItems: 'center', padding: `${spacing.lg}px ${spacing["2xl"]}px`, cursor: 'pointer', borderRadius: radii.lg, background: selectedCarrier?.id === carrier.id ? colors.bgHover : 'transparent', border: `1px solid ${selectedCarrier?.id === carrier.id ? colors.accentBlueBorder : colors.borderLight}` }} onClick={() => setSelectedCarrier(carrier)}>
                      <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${selectedCarrier?.id === carrier.id ? colors.accentBlue : colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedCarrier?.id === carrier.id && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
                      </div>
                      <div>
                        <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{carrier.name}</span>
                        <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing.md }}>({carrier["size (in tones)"]} tons)</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        
        <CompactorSelector selectedCompactor={selectedCompactor} onCompactorChange={setSelectedCompactor} />
        
        <TextInput
          label={t('calculator:transport_distance_each_way_label')}
          value={transportDistance}
          onChange={setTransportDistance}
          placeholder={t('calculator:enter_transport_distance')}
          unit="m"
          helperText={t('calculator:set_to_zero_no_transport')}
        />
        
        <Button onClick={calculateTime} variant="primary" fullWidth>
          {t('calculator:calculate_time_button')}
        </Button>
        
        {result && (
          <div ref={resultsRef} style={{ marginTop: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }}>
            <Card style={{ background: gradients.blueCard, border: `1px solid ${colors.accentBlueBorder}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.lg }}>
                <span style={{ fontSize: fontSizes.md, color: colors.textSubtle, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>
                  {t('calculator:total_labor_hours_label')}
                </span>
                <span style={{ fontSize: fontSizes["4xl"], fontWeight: fontWeights.extrabold, color: colors.accentBlue, fontFamily: fonts.display }}>
                  {result.totalTime.toFixed(2)}
                </span>
                <span style={{ fontSize: fontSizes.md, color: colors.accentBlue, fontFamily: fonts.body, fontWeight: fontWeights.medium }}>
                  {t('calculator:hours_abbreviation')}
                </span>
              </div>
            </Card>

            <Card>
              <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display, letterSpacing: '0.3px', marginBottom: spacing["2xl"] }}>
                {t('calculator:task_breakdown_label')}
              </h3>
              <div style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${spacing.lg}px ${spacing["2xl"]}px`,
                    background: undefined,
                    borderBottom: `1px solid ${colors.borderLight}`,
                  }}
                >
                  <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateTaskName('Preparation', t)}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
                    <span style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display }}>{result.excavationTime.toFixed(2)}</span>
                    <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>{t('calculator:hours_label')}</span>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${spacing.lg}px ${spacing["2xl"]}px`,
                    background: colors.bgTableRowAlt,
                    borderBottom: `1px solid ${colors.borderLight}`,
                  }}
                >
                  <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateTaskName('Transport', t)}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
                    <span style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display }}>{result.transportTime.toFixed(2)}</span>
                    <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>{t('calculator:hours_label')}</span>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${spacing.lg}px ${spacing["2xl"]}px`,
                    background: undefined,
                    borderBottom: 'none',
                  }}
                >
                  <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateTaskName(result.compactingCompactorName, t)} ({result.compactingLayers} {t('calculator:layers_suffix', { defaultValue: 'layers' })})</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
                    <span style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display }}>{result.compactingTime.toFixed(2)}</span>
                    <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>{t('calculator:hours_label')}</span>
                  </div>
                </div>
              </div>
            </Card>

            <DataTable
              columns={[
                { key: 'name', label: t('calculator:table_material_header'), width: '2fr' },
                { key: 'quantity', label: t('calculator:table_quantity_header'), width: '1fr' },
                { key: 'unit', label: t('calculator:table_unit_header'), width: '1fr' },
              ]}
              rows={[
                {
                  name: <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateMaterialName('Type 1 aggregate', t)}</span>,
                  quantity: <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{result.totalTons.toFixed(2)}</span>,
                  unit: <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>{translateUnit('tonnes', t)}</span>,
                },
              ]}
            />
          </div>
        )}
      </Card>
    </div>
  );
};

export default Type1AggregateCalculator;
