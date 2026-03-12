import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator as CalculatorIcon } from 'lucide-react';
import PageInfoModal from '../components/PageInfoModal';
import { colors, fonts, fontSizes, fontWeights, spacing, radii, shadows } from '../themes/designTokens';
import { useAuthStore } from '../lib/store';
import { getCalculatorInputDefaults } from '../lib/materialUsageDefaults';
import { useCalculatorMenu } from '../contexts/CalculatorMenuContext';
import WallCalculator from '../components/Calculator/WallCalculator';
import MortarCalculator from '../components/Calculator/MortarCalculator';
import TimeEstimator from '../components/Calculator/TimeEstimator';
import Type1AggregateCalculator from '../components/Calculator/Type1AggregateCalculator';
import SoilExcavationCalculator from '../components/Calculator/SoilExcavationCalculator';
import AggregateCalculator from '../components/Calculator/AggregateCalculator';
import PavingCalculator from '../components/Calculator/PavingCalculator';
import ArtificialGrassCalculator from '../components/Calculator/ArtificialGrassCalculator';
import TileInstallationCalculator from '../components/Calculator/TileInstallationCalculator';
import CopingInstallationCalculator from '../components/Calculator/CopingInstallationCalculator';
import KerbsEdgesAndSetsCalculator from '../components/Calculator/KerbsEdgesAndSetsCalculator';
import FoundationCalculator from '../components/Calculator/FoundationCalculator';
import DeckCalculator from '../components/Calculator/DeckCalculator';
import VenetianFenceCalculator from '../components/Calculator/VenetianFenceCalculator';
import CompositeFenceCalculator from '../components/Calculator/CompositeFenceCalculator';
import FenceCalculator from '../components/Calculator/FenceCalculator';
import StairCalculator from '../components/Calculator/StairCalculator';
import LShapeStairCalculator from '../components/Calculator/LShapeStairCalculator';
import UShapeStairCalculator from '../components/Calculator/Ushapestaircalculator';
import SlabCalculator from '../components/Calculator/SlabCalculator';
import ConcreteSlabsCalculator from '../components/Calculator/ConcreteSlabsCalculator';
import NaturalTurfCalculator from '../components/Calculator/NaturalTurfCalculator';
import GroundworkLinearCalculator from '../components/Calculator/GroundworkLinearCalculator';

type CalculatorType = 'aggregate' | 'wall' | 'mortar' | 'time' | 'fence' | 'steps' | 'deck' | 'grass' | 'slab' | 'paving' | 'tile' | 'kerbs' | 'foundation' | 'groundwork' | 'turf';
type SubCalculatorType = {
  aggregate: 'type1' | 'aggregate' | 'soil_excavation' | 'mortar';
  wall: 'brick' | 'block4' | 'block7' | 'sleeper';
  mortar: 'slab' | 'general';
  time: 'task';
  fence: 'vertical' | 'horizontal' | 'venetian' | 'composite';
  steps: 'standard' | 'l_shape' | 'u_shape';
  deck: 'standard';
  grass: 'coming_soon';
  turf: 'default';
  slab: 'default' | 'concreteSlabs';
  paving: 'default';
  tile: 'default' | 'coping';
  kerbs: 'kl' | 'rumbled' | 'flat' | 'sets';
  foundation: 'default';
};

const CalculatorPage: React.FC = () => {
  const { t } = useTranslation(['calculator', 'common']);
  const companyId = useAuthStore((s) => s.getCompanyId());
  const [activeCalculator, setActiveCalculator] = useState<CalculatorType | null>(null);
  const [activeSubType, setActiveSubType] = useState<string | null>(null);
  const [activeCalculatorLabel, setActiveCalculatorLabel] = useState<string | null>(null);
  const { setShowCalculatorMenu, setKeepSidebarOpenFor, setSelectedCalculatorType, setSelectedSubType, setExpandedCategory } = useCalculatorMenu();

  const pageInfoDescription = React.useMemo(() => {
    if (!activeCalculator || !activeSubType) return t('calculator:info_description');
    if (activeCalculator === 'steps') {
      let desc = t('calculator:stairs_info_description');
      if (activeSubType === 'standard') desc += t('calculator:stairs_open_info_section');
      if (activeSubType === 'u_shape') desc += t('calculator:stairs_ushape_info_section');
      return desc;
    }
    if (activeCalculator === 'slab' && activeSubType === 'default') return t('calculator:slab_info_description');
    if (activeCalculator === 'kerbs') return t('calculator:kerbs_info_description');
    if (activeCalculator === 'foundation') return t('calculator:foundation_calculator_description');
    return t('calculator:info_description');
  }, [activeCalculator, activeSubType, t]);

  const pavingDefaults = useMemo(() => getCalculatorInputDefaults('paving', companyId), [companyId]);
  const slabDefaults = useMemo(() => getCalculatorInputDefaults('slab', companyId), [companyId]);
  const concreteSlabsDefaults = useMemo(() => getCalculatorInputDefaults('concreteSlabs', companyId), [companyId]);
  const grassDefaults = useMemo(() => getCalculatorInputDefaults('grass', companyId), [companyId]);
  const turfDefaults = useMemo(() => getCalculatorInputDefaults('turf', companyId), [companyId]);

  // Calculator buttons are now handled by the sidebar in Layout.tsx
  
  // Show calculator menu when component mounts
  useEffect(() => {
    setShowCalculatorMenu(true);
    setKeepSidebarOpenFor('/calculator');
    // Reset selection when entering calculator page (with no active calculator yet)
    setSelectedCalculatorType(null);
    setSelectedSubType(null);
    setExpandedCategory(null);
  }, [setShowCalculatorMenu, setKeepSidebarOpenFor, setSelectedCalculatorType, setSelectedSubType, setExpandedCategory]);

  // Handle calculator selection from sidebar
  useEffect(() => {
    const handleSelectSubCalculator = (e: any) => {
      const { calculatorType, subType, subTypeLabel } = e.detail;
      setActiveCalculator(calculatorType);
      setActiveSubType(subType);
      setActiveCalculatorLabel(subTypeLabel ?? null);
    };
    
    window.addEventListener('selectSubCalculator', handleSelectSubCalculator);
    
    return () => {
      window.removeEventListener('selectSubCalculator', handleSelectSubCalculator);
    };
  }, []);

  // Handle cleanup when leaving calculator page
  useEffect(() => {
    return () => {
      setShowCalculatorMenu(false);
      setKeepSidebarOpenFor(null);
    };
  }, [setShowCalculatorMenu, setKeepSidebarOpenFor]);

  const renderCalculator = () => {
    if (!activeCalculator || !activeSubType) return null;

    const calculatorKey = `${activeCalculator}-${activeSubType}`;

    switch (activeCalculator) {
      case 'aggregate':
        switch (activeSubType) {
          case 'type1':
            return <Type1AggregateCalculator key={calculatorKey} />;
          case 'aggregate':
            return <AggregateCalculator key={calculatorKey} />;
          case 'soil_excavation':
            return <SoilExcavationCalculator key={calculatorKey} />;
          case 'general':
            return <MortarCalculator key={calculatorKey} type='general' />;
          default:
            return null;
        }
      case 'paving':
        return <PavingCalculator key={calculatorKey} savedInputs={pavingDefaults} />;
      case 'tile':
        if (activeSubType === 'coping') {
          return <CopingInstallationCalculator key={calculatorKey} />;
        }
        return <TileInstallationCalculator key={calculatorKey} />;
      case 'wall':
        return <WallCalculator key={calculatorKey} type={activeSubType as SubCalculatorType['wall']} />;
      case 'time':
        return <TimeEstimator key={calculatorKey} />;
      case 'fence':
        if (activeSubType === 'venetian') {
          return <VenetianFenceCalculator key={calculatorKey} />;
        } else if (activeSubType === 'composite') {
          return <CompositeFenceCalculator key={calculatorKey} />;
        }
        return <FenceCalculator key={calculatorKey} fenceType={activeSubType as 'vertical' | 'horizontal'} />;
      case 'slab':
        return activeSubType === 'concreteSlabs'
          ? <ConcreteSlabsCalculator key={calculatorKey} savedInputs={concreteSlabsDefaults} />
          : <SlabCalculator key={calculatorKey} savedInputs={slabDefaults} />;
      case 'steps':
        if (activeSubType === 'l_shape') {
          return <LShapeStairCalculator key={calculatorKey} />;
        }
        if (activeSubType === 'u_shape') {
          return <UShapeStairCalculator key={calculatorKey} />;
        }
        return <StairCalculator key={calculatorKey} />;
      case 'deck':
        return <DeckCalculator key={calculatorKey} />;
      case 'grass':
        return <ArtificialGrassCalculator key={calculatorKey} savedInputs={grassDefaults} />;
      case 'turf':
        return <NaturalTurfCalculator key={calculatorKey} savedInputs={turfDefaults} />;
      case 'kerbs':
        return <KerbsEdgesAndSetsCalculator key={calculatorKey} type={activeSubType as SubCalculatorType['kerbs']} />;
      case 'foundation':
        return <FoundationCalculator key={calculatorKey} />;
      case 'groundwork':
        return <GroundworkLinearCalculator key={calculatorKey} type={activeSubType as SubCalculatorType['groundwork']} />;
      default:
        return null;
    }
  };

  return (
    <div style={{ height: '100vh', width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: fonts.body, background: colors.bgMain }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: `0 ${spacing["6xl"]}px` }}>
        <div style={{ flex: 1, overflowY: 'auto' }} id="calculator-container">
          {activeCalculator && activeSubType ? (
            <div style={{ background: colors.bgCard, borderRadius: radii["3xl"], boxShadow: '0 4px 20px rgba(0,0,0,0.3)', padding: spacing["6xl"], minHeight: '100%', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, marginBottom: spacing["6xl"] }}>
                <h2 style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>
                  {activeCalculatorLabel || activeSubType.replace(/_/g, ' ')}
                </h2>
                <PageInfoModal
                  description={pageInfoDescription}
                  title={t('calculator:info_title')}
                  quickTips={[]}
                />
              </div>
              {renderCalculator()}
            </div>
          ) : (
            <div style={{ background: colors.bgCard, borderRadius: radii["3xl"], boxShadow: shadows.lg, padding: spacing["6xl"], textAlign: 'center', color: colors.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: spacing["9xl"] * 10, width: '100%' }}>
              <div>
                <CalculatorIcon style={{ width: spacing["8xl"], height: spacing["8xl"], color: colors.textDim, marginBottom: spacing.lg }} />
                <p style={{ fontSize: fontSizes["2xl"], marginBottom: spacing.md, color: colors.textMuted }}>{t('calculator:select_calculator_message')}</p>
                <p style={{ color: colors.textFaint }}>{t('calculator:calculator_sidebar_hint')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalculatorPage;
