import React, { useState, useEffect } from 'react';
import { Calculator as CalculatorIcon, Layers, BrickWall, Clock, Fence, Stars as Stairs, Trees as Grass, Rows4, Grid, Square, Minus, Pickaxe } from 'lucide-react';
import WallCalculator from '../components/Calculator/WallCalculator';
import MortarCalculator from '../components/Calculator/MortarCalculator';
import TimeEstimator from '../components/Calculator/TimeEstimator';
import FenceCalculator from '../components/Calculator/FenceCalculator';
import SlabCalculator from '../components/Calculator/SlabCalculator';
import StairCalculator from '../components/Calculator/StairCalculator';
import BackButton from '../components/BackButton';
import Type1AggregateCalculator from '../components/Calculator/Type1AggregateCalculator';
import SandCalculator from '../components/Calculator/SandCalculator';
import SoilExcavationCalculator from '../components/Calculator/SoilExcavationCalculator';
import AggregateCalculator from '../components/Calculator/AggregateCalculator';
import PavingCalculator from '../components/Calculator/PavingCalculator';
import ArtificialGrassCalculator from '../components/Calculator/ArtificialGrassCalculator';
import TileInstallationCalculator from '../components/Calculator/TileInstallationCalculator';
import GritSandCalculator from '../components/Calculator/GritSandCalculator';
import KerbsEdgesAndSetsCalculator from '../components/Calculator/KerbsEdgesAndSetsCalculator';
import FoundationCalculator from '../components/Calculator/FoundationCalculator';

type CalculatorType = 'aggregate' | 'wall' | 'mortar' | 'time' | 'fence' | 'steps' | 'deck' | 'grass' | 'slab' | 'paving' | 'tile' | 'kerbs' | 'foundation';
type SubCalculatorType = {
  aggregate: 'type1' | 'aggregate' | 'soil_excavation' | 'grit_sand' | 'mortar';
  wall: 'brick' | 'block4' | 'block7' | 'sleeper';
  mortar: 'slab' | 'general';
  time: 'task';
  fence: 'vertical' | 'horizontal';
  steps: 'standard';
  deck: 'coming_soon';
  grass: 'coming_soon';
  slab: 'default';
  paving: 'default';
  tile: 'default';
  kerbs: 'kl' | 'rumbled' | 'flat' | 'sets';
  foundation: 'default';
};

const CalculatorPage: React.FC = () => {
  const [activeCalculator, setActiveCalculator] = useState<CalculatorType | null>(null);
  const [activeSubType, setActiveSubType] = useState<string | null>(null);

  const calculatorButtons = [
    {
      type: 'aggregate' as CalculatorType,
      icon: Layers,
      label: 'Aggregate Calculator',
      subTypes: [
        { type: 'type1', label: 'Preparation' },
        { type: 'aggregate', label: 'Aggregate' },
        { type: 'soil_excavation', label: 'Soil Excavation' },
        { type: 'general', label: 'Mortar Calculator' },
        { type: 'grit_sand', label: 'Grit Sand Calculator' }
      ]
    },
    {
      type: 'paving' as CalculatorType,
      icon: Square,
      label: 'Paving Calculator',
      subTypes: [
        { type: 'default', label: 'Monoblock Paving' }
      ]
    },
    {
      type: 'tile' as CalculatorType,
      icon: Square,
      label: 'Wall finish Calculator',
      subTypes: [
        { type: 'default', label: 'Tile Installation' }
      ]
    },
    {
      type: 'wall' as CalculatorType,
      icon: BrickWall,
      label: 'Wall & Finish Calculator',
      subTypes: [
        { type: 'brick', label: 'Brick Wall Calculator' },
        { type: 'block4', label: '4-inch Block Wall Calculator' },
        { type: 'block7', label: '7-inch Block Wall Calculator' },
        { type: 'sleeper', label: 'Sleeper Wall Calculator' }
      ]
    },
    {
      type: 'slab' as CalculatorType,
      icon: Grid,
      label: 'Slab Calculator',
      subTypes: [
        { type: 'default', label: 'Slab Calculator' }
      ]
    },
    {
      type: 'time' as CalculatorType,
      icon: Clock,
      label: 'Time Estimation Tool',
      subTypes: [
        { type: 'task', label: 'Task Time Estimator' }
      ]
    },
    {
      type: 'fence' as CalculatorType,
      icon: Fence,
      label: 'Fence Calculator',
      subTypes: [
        { type: 'vertical', label: 'Vertical Fence' },
        { type: 'horizontal', label: 'Horizontal Fence' },
      ]
    },
    {
      type: 'steps' as CalculatorType,
      icon: Stairs,
      label: 'Steps Calculator',
      subTypes: [
        { type: 'standard', label: 'Standard Stairs' }
      ]
    },
    {
      type: 'deck' as CalculatorType,
      icon: Rows4,
      label: 'Deck Calculator',
      subTypes: [
        { type: 'coming_soon', label: 'Coming Soon' }
      ]
    },
    {
      type: 'grass' as CalculatorType,
      icon: Grass,
      label: 'Artificial Grass Calculator',
      subTypes: [
        { type: 'Artificial Grass', label: 'Artificial Grass' }
      ]
    },
    {
      type: 'kerbs' as CalculatorType,
      icon: Minus,
      label: 'Kerbs & Edges Calculator',
      subTypes: [
        { type: 'kl', label: 'KL Kerbs' },
        { type: 'rumbled', label: 'Rumbled Kerbs' },
        { type: 'flat', label: 'Flat Edges' },
        { type: 'sets', label: '10x10 Sets' }
      ]
    },
    {
      type: 'foundation' as CalculatorType,
      icon: Pickaxe,
      label: 'Foundation Calculator',
      subTypes: [
        { type: 'default', label: 'Foundation Excavation' }
      ]
    }
  ];

  const handleSubTypeChange = (calculatorType: CalculatorType, subType: string) => {
    console.log(`Calculator.tsx: Setting calculator type to ${calculatorType} and subType to ${subType}`);
    setActiveCalculator(calculatorType);
    setActiveSubType(subType);
    
    // Scroll to calculator on mobile
    setTimeout(() => {
      const calculatorElement = document.getElementById('calculator-container');
      if (calculatorElement) {
        calculatorElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

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
          case 'grit_sand':
            return <GritSandCalculator key={calculatorKey} />;
          default:
            return null;
        }
      case 'paving':
        return <PavingCalculator key={calculatorKey} />;
      case 'tile':
        return <TileInstallationCalculator key={calculatorKey} />;
      case 'wall':
        return <WallCalculator key={calculatorKey} type={activeSubType as SubCalculatorType['wall']} />;
      case 'time':
        return <TimeEstimator key={calculatorKey} />;
      case 'fence':
        console.log(`Calculator.tsx: Rendering FenceCalculator with fenceType=${activeSubType}`);
        return <FenceCalculator key={calculatorKey} fenceType={activeSubType as 'vertical' | 'horizontal'} />;
      case 'slab':
        return <SlabCalculator key={calculatorKey} />;
      case 'steps':
        return <StairCalculator key={calculatorKey} />;
      case 'deck':
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
    <div className="h-full w-full">
      <BackButton />
      <div className="flex items-center mb-8">
        <CalculatorIcon className="w-8 h-8 text-gray-600 mr-3" />
        <h1 className="text-3xl font-bold text-gray-900">Construction Calculator</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-6 h-full">
        <div className="md:w-64 flex-shrink-0 space-y-4 md:sticky md:top-4 md:self-start md:max-h-[calc(100vh-100px)] md:overflow-y-auto">
          {calculatorButtons.map((button) => (
            <div key={button.type} className="space-y-2">
              <button
                onClick={() => {
                  setActiveCalculator(button.type);
                  setActiveSubType(null);
                }}
                className={`w-full flex items-center p-4 rounded-lg shadow transition-colors ${
                  activeCalculator === button.type
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                <button.icon className="w-5 h-5 mr-2" />
                {button.label}
              </button>
              
              {activeCalculator === button.type && (
                <div className="pl-4 space-y-2">
                  {button.subTypes.map((subType) => (
                    <button
                      key={subType.type}
                      onClick={() => handleSubTypeChange(button.type, subType.type)}
                      className={`w-full text-left p-2 rounded-md ${
                        (activeSubType && typeof activeSubType === 'object' && activeSubType[button.type] === subType.type) ||
                        (activeSubType && typeof activeSubType === 'string' && activeSubType === subType.type && activeCalculator === button.type)
                          ? 'bg-blue-600 text-white font-medium'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {subType.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex-1" id="calculator-container">
          {activeCalculator && activeSubType ? (
            <div className="bg-white rounded-lg shadow-lg p-6 h-full w-full">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                {calculatorButtons
                  .find((b) => b.type === activeCalculator)
                  ?.subTypes.find((s) => s.type === activeSubType)?.label}
              </h2>
              {renderCalculator()}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-lg p-6 text-center text-gray-600 flex items-center justify-center min-h-[400px] w-full">
              <div>
                <p className="text-xl mb-2">Select a calculator from the left to begin</p>
                <p className="text-gray-500">Choose from our range of construction calculators to help with your project</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalculatorPage;
