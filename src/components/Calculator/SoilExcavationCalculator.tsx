import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
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
  SelectDropdown,
  Button,
  Card,
  Label,
  DataTable,
} from '../../themes/uiComponents';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';

// Define types for our equipment
interface DiggingEquipment {
  id: string;
  name: string;
  description: string | null;
  type: 'excavator' | 'barrows_dumpers';
  "size (in tones)": number | null;
  speed_m_per_hour?: number | null;
}

interface SoilExcavationCalculatorProps {
  onResultsChange?: (results: any) => void;
}

const SoilExcavationCalculator: React.FC<SoilExcavationCalculatorProps> = ({ onResultsChange }) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const companyId = useAuthStore(state => state.getCompanyId());
  
  // State for input values
  const [calculationMethod, setCalculationMethod] = useState<'direct' | 'area'>('area');
  const [tons, setTons] = useState<string>('');
  const [length, setLength] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [depth, setDepth] = useState<string>('');
  const [soilType, setSoilType] = useState<'clay' | 'sand' | 'rock'>('clay');

  const SOIL_DENSITY: Record<'clay' | 'sand' | 'rock', number> = {
    clay: 1.5,
    sand: 1.6,
    rock: 2.2,
  };
  
  // State for equipment selection
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  
  // State for results
  const [result, setResult] = useState<{
    totalTons: number;
    excavationTime: number;
    transportTime: number;
    totalTime: number;
  } | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('0');
  const resultsRef = useRef<HTMLDivElement>(null);

  // Fetch excavators
  const { data: excavators = [] } = useQuery({
    queryKey: ['excavators', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setup_digging')
        .select('*')
        .eq('type', 'excavator')
        .eq('company_id', companyId);
      
      if (error) throw error;
      return data as DiggingEquipment[];
    },
    enabled: !!companyId
  });

  // Fetch carriers
  const { data: carriers = [] } = useQuery({
    queryKey: ['carriers', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setup_digging')
        .select('*')
        .eq('type', 'barrows_dumpers')
        .eq('company_id', companyId);
      
      if (error) throw error;
      return data as DiggingEquipment[];
    },
    enabled: !!companyId
  });

  // Fetch task templates
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['event_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks')
        .select('*')
        .eq('company_id', companyId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Calculate soil weight from dimensions
  const calculateSoilWeight = () => {
    if (calculationMethod === 'direct') {
      return parseFloat(tons) || 0;
    } else {
      const l = parseFloat(length) || 0;
      const w = parseFloat(width) || 0;
      const d = parseFloat(depth) || 0;
      
      // Calculate volume in cubic meters
      const volumeInCubicMeters = l * w * (d / 100);
      
      // Convert to tons using soil type density
      return volumeInCubicMeters * SOIL_DENSITY[soilType];
    }
  };

  // Calculate time needed using NEW SYSTEM
  const calculateTime = () => {
    if (!selectedExcavator) {
      alert(t('calculator:please_select_excavator'));
      return;
    }
    
    const totalTons = calculateSoilWeight();
    
    if (totalTons <= 0) {
      alert(t('calculator:please_enter_valid_dimensions'));
      return;
    }
    
    // Get excavator details
    const excavatorSize = selectedExcavator["size (in tones)"] || 0;
    const excavatorName = selectedExcavator.name || '';
    
    // Find excavation task template by exact name pattern (NEW SYSTEM)
    const excavationTemplate = taskTemplates.find((template: any) => {
      const name = (template.name || '').toLowerCase();
      return name.includes('excavation soil') && 
             name.includes(excavatorName.toLowerCase()) &&
             name.includes(`(${excavatorSize}t)`);
    });

    let excavationTime = 0;
    if (excavationTemplate && excavationTemplate.estimated_hours) {
      excavationTime = excavationTemplate.estimated_hours * totalTons;
    } else {
      console.warn('Excavation template not found for:', `Excavation soil with ${excavatorName} (${excavatorSize}t)`);
      alert(t('calculator:template_not_found_excavator'));
      return;
    }

    // Calculate transport time (NEW SYSTEM with speed from database)
    let transportTime = 0;
    if (selectedCarrier && selectedCarrier.speed_m_per_hour) {
      const distance = parseFloat(transportDistance) || 0;
      
      if (distance > 0) {
        const carrierSpeed = selectedCarrier.speed_m_per_hour;
        const carrierSize = selectedCarrier["size (in tones)"] || 0;
        
        // Calculate number of trips
        const trips = Math.ceil(totalTons / carrierSize);
        
        // Calculate transport time per trip (in hours)
        const roundTripDistance = distance * 2; // tam i z powrotem
        const transportTimePerTrip = roundTripDistance / carrierSpeed; // hours
        
        // Total transport time
        transportTime = trips * transportTimePerTrip;
      }
    }
    
    // Set result
    setResult({
      totalTons,
      excavationTime,
      transportTime,
      totalTime: excavationTime + transportTime
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
      const taskBreakdown = [
        {
          task: 'Excavation',
          hours: result.excavationTime,
          amount: result.totalTons,
          unit: 'tonnes'
        }
      ];

      // Add transport if applicable
      if (result.transportTime > 0) {
        taskBreakdown.push({
          task: 'Transport',
          hours: result.transportTime,
          amount: result.totalTons,
          unit: 'tonnes'
        });
      }

      const formattedResults = {
        name: 'Soil Excavation',
        amount: result.totalTons,
        hours_worked: result.totalTime,
        materials: [
          {
            name: 'Soil',
            quantity: result.totalTons,
            unit: 'tons'
          }
        ],
        taskBreakdown
      };

      // Store results in data attribute
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      // Notify parent component
      onResultsChange(formattedResults);
    }
  }, [result, onResultsChange]);

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
      <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display }}>
        {t('calculator:soil_excavation_calculator_title')}
      </h2>
      
      <Card padding={`${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`}>
        <p 
          style={{ color: colors.accentBlue, cursor: 'pointer', marginBottom: spacing.md, fontSize: fontSizes.base, fontFamily: fonts.body }}
          onClick={() => setCalculationMethod(calculationMethod === 'direct' ? 'area' : 'direct')}
        >
          {calculationMethod === 'direct' ? t('calculator:calculate_by_area') : t('calculator:calculate_by_weight')}
        </p>
        
        {calculationMethod === 'direct' ? (
          <TextInput
            label={t('calculator:soil_weight_label')}
            value={tons}
            onChange={setTons}
            placeholder={t('calculator:enter_weight_tons')}
            unit="tons"
          />
        ) : (
          <CalculatorInputGrid columns={3}>
            <TextInput label={t('calculator:length_m_label')} value={length} onChange={setLength} placeholder={t('calculator:length_placeholder')} unit="m" />
            <TextInput label={t('calculator:width_m_label')} value={width} onChange={setWidth} placeholder={t('calculator:width_placeholder')} unit="m" />
            <TextInput label={t('calculator:depth_cm_label')} value={depth} onChange={setDepth} placeholder={t('calculator:depth_placeholder')} unit="cm" />
          </CalculatorInputGrid>
        )}

        {calculationMethod === 'area' && (
          <SelectDropdown
            label={t('calculator:soil_type')}
            value={soilType === 'clay' ? t('calculator:soil_type_clay') : soilType === 'sand' ? t('calculator:soil_type_sand') : t('calculator:soil_type_rock')}
            options={[t('calculator:soil_type_clay'), t('calculator:soil_type_sand'), t('calculator:soil_type_rock')]}
            onChange={(val) => setSoilType(val === t('calculator:soil_type_clay') ? 'clay' : val === t('calculator:soil_type_sand') ? 'sand' : 'rock')}
            placeholder={t('calculator:soil_type')}
          />
        )}
        
        <div>
          <Label>{t('calculator:select_excavator_label')}</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
            {excavators.length === 0 ? (
              <p style={{ fontSize: fontSizes.base, color: colors.textDim }}>{t('calculator:no_excavators_found')}</p>
            ) : (
              excavators.map((excavator) => (
                <div key={excavator.id} style={{ display: 'flex', alignItems: 'center', padding: spacing.md, cursor: 'pointer', borderRadius: radii.lg, background: selectedExcavator?.id === excavator.id ? colors.bgHover : 'transparent' }} onClick={() => setSelectedExcavator(excavator)}>
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
          <Label>{t('calculator:select_carrier_optional_label')}</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.sm }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: spacing.md, cursor: 'pointer', borderRadius: radii.lg, background: !selectedCarrier ? colors.bgHover : 'transparent' }} onClick={() => setSelectedCarrier(null)}>
              <div style={{ width: 16, height: 16, borderRadius: radii.full, border: `2px solid ${!selectedCarrier ? colors.accentBlue : colors.borderMedium}`, marginRight: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {!selectedCarrier && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
              </div>
              <span style={{ fontSize: fontSizes.base, color: colors.textSecondary }}>{t('calculator:no_transport_needed')}</span>
            </div>
            {carriers.length === 0 ? (
              <p style={{ fontSize: fontSizes.base, color: colors.textDim }}>{t('calculator:no_carriers_found')}</p>
            ) : (
              carriers.map((carrier) => (
                <div key={carrier.id} style={{ display: 'flex', alignItems: 'center', padding: spacing.md, cursor: 'pointer', borderRadius: radii.lg, background: selectedCarrier?.id === carrier.id ? colors.bgHover : 'transparent' }} onClick={() => setSelectedCarrier(carrier)}>
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

        {selectedCarrier && (
          <TextInput
            label={t('calculator:distance_meters_label')}
            value={transportDistance}
            onChange={setTransportDistance}
            placeholder={t('calculator:distance_placeholder')}
            unit="m"
            helperText={t('calculator:set_to_zero_no_transport')}
          />
        )}
        
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
                  <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateTaskName('Excavation', t)}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
                    <span style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display }}>{result.excavationTime.toFixed(2)}</span>
                    <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>{t('calculator:hours_label')}</span>
                  </div>
                </div>
                {result.transportTime > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: `${spacing.lg}px ${spacing["2xl"]}px`,
                      background: colors.bgTableRowAlt,
                      borderBottom: 'none',
                    }}
                  >
                    <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateTaskName('Transport', t)}</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
                      <span style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display }}>{result.transportTime.toFixed(2)}</span>
                      <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>{t('calculator:hours_label')}</span>
                    </div>
                  </div>
                )}
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
                  name: <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateMaterialName('Soil', t)}</span>,
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

export default SoilExcavationCalculator;
