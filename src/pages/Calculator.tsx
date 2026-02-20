import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator as CalculatorIcon } from 'lucide-react';
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

type CalculatorType = 'aggregate' | 'wall' | 'mortar' | 'time' | 'fence' | 'steps' | 'deck' | 'grass' | 'slab' | 'paving' | 'tile' | 'kerbs' | 'foundation';
type SubCalculatorType = {
  aggregate: 'type1' | 'aggregate' | 'soil_excavation' | 'mortar';
  wall: 'brick' | 'block4' | 'block7' | 'sleeper';
  mortar: 'slab' | 'general';
  time: 'task';
  fence: 'vertical' | 'horizontal' | 'venetian' | 'composite';
  steps: 'standard' | 'l_shape' | 'u_shape';
  deck: 'standard';
  grass: 'coming_soon';
  slab: 'default';
  paving: 'default';
  tile: 'default' | 'coping';
  kerbs: 'kl' | 'rumbled' | 'flat' | 'sets';
  foundation: 'default';
};

const CalculatorPage: React.FC = () => {
  const { t } = useTranslation(['calculator', 'common']);
  const [activeCalculator, setActiveCalculator] = useState<CalculatorType | null>(null);
  const [activeSubType, setActiveSubType] = useState<string | null>(null);
  const { setShowCalculatorMenu, setKeepSidebarOpenFor, setSelectedCalculatorType, setSelectedSubType, setExpandedCategory } = useCalculatorMenu();

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
      console.log('selectSubCalculator event received:', e.detail);
      const { calculatorType, subType } = e.detail;
      console.log('Setting activeCalculator to:', calculatorType, 'and activeSubType to:', subType);
      setActiveCalculator(calculatorType);
      setActiveSubType(subType);
    };
    
    window.addEventListener('selectSubCalculator', handleSelectSubCalculator);
    console.log('selectSubCalculator event listener attached');
    
    return () => {
      window.removeEventListener('selectSubCalculator', handleSelectSubCalculator);
      console.log('selectSubCalculator event listener removed');
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

    console.log(`Calculator.tsx: Rendering calculator for ${activeCalculator} with subType ${activeSubType}`);

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
        return <PavingCalculator key={calculatorKey} />;
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
        console.log(`Calculator.tsx: Rendering FenceCalculator with fenceType=${activeSubType}`);
        if (activeSubType === 'venetian') {
          return <VenetianFenceCalculator key={calculatorKey} />;
        } else if (activeSubType === 'composite') {
          return <CompositeFenceCalculator key={calculatorKey} />;
        }
        return <FenceCalculator key={calculatorKey} fenceType={activeSubType as 'vertical' | 'horizontal'} />;
      case 'slab':
        return <SlabCalculator key={calculatorKey} />;
      case 'steps':
        if (activeSubType === 'l_shape') {
          return <LShapeStairCalculator key={calculatorKey} />;
        }
        if (activeSubType === 'u_shape') {
          return <UShapeStairCalculator key={calculatorKey} />;
        }
        return <StairCalculator key={calculatorKey} />;
      case 'deck':
        console.log(`Calculator.tsx: Rendering DeckCalculator`);
        return <DeckCalculator key={calculatorKey} />;
      case 'grass':
        return <ArtificialGrassCalculator key={calculatorKey} />;
      case 'kerbs':
        return <KerbsEdgesAndSetsCalculator key={calculatorKey} type={activeSubType as SubCalculatorType['kerbs']} />;
      case 'foundation':
        return <FoundationCalculator key={calculatorKey} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col">
      <div className="flex items-center px-6 py-4">
        <CalculatorIcon className="w-8 h-8 text-gray-600 mr-3" />
        <h1 className="text-3xl font-bold text-gray-900">{t('calculator:construction_calculator_title')}</h1>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden px-6">
        <div className="flex-1 overflow-y-auto" id="calculator-container">
          {activeCalculator && activeSubType ? (
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 min-h-full w-full">
              <h2 className="text-xl font-semibold text-white mb-6">
                {activeSubType.charAt(0).toUpperCase() + activeSubType.slice(1).replace(/_/g, ' ')}
              </h2>
              {renderCalculator()}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-lg p-6 text-center text-gray-600 flex items-center justify-center min-h-[400px] w-full">
              <div>
                <p className="text-xl mb-2">{t('calculator:select_calculator_message')}</p>
                <p className="text-gray-500">{t('calculator:calculator_sidebar_hint')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalculatorPage;
