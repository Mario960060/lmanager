import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import WallCalculator from '../components/Calculator/WallCalculator';
import SleeperWallCalculator from '../components/Calculator/SleeperWallCalculator';
import KerbsEdgesAndSetsCalculator from '../components/Calculator/KerbsEdgesAndSetsCalculator';
import FenceCalculator from '../components/Calculator/FenceCalculator';
import SlabCalculator from '../components/Calculator/SlabCalculator';
import StairCalculator from '../components/Calculator/StairCalculator';
import LShapeStairCalculator from '../components/Calculator/LShapeStairCalculator';
import UShapeStairCalculator from '../components/Calculator/Ushapestaircalculator';
import Type1AggregateCalculator from '../components/Calculator/Type1AggregateCalculator';
import SoilExcavationCalculator from '../components/Calculator/SoilExcavationCalculator';
import PavingCalculator from '../components/Calculator/PavingCalculator';
import ArtificialGrassCalculator from '../components/Calculator/ArtificialGrassCalculator';
import WallFinishCalculator from '../components/Calculator/TileInstallationCalculator';
import CopingInstallationCalculator from '../components/Calculator/CopingInstallationCalculator';
import FoundationCalculator from '../components/Calculator/FoundationCalculator';
import DeckCalculator from '../components/Calculator/DeckCalculator';
import VenetianFenceCalculator from '../components/Calculator/VenetianFenceCalculator';
import CompositeFenceCalculator from '../components/Calculator/CompositeFenceCalculator';

interface CalculatorModalProps {
  calculatorType: string;
  calculatorSubType: string;
  onClose: () => void;
  onSaveResults: (results: any) => void;
  calculateTransport?: boolean;
  setCalculateTransport?: (value: boolean) => void;
  selectedTransportCarrier?: any;
  setSelectedTransportCarrier?: (value: any) => void;
  transportDistance?: string;
  setTransportDistance?: (value: string) => void;
  carriers?: any[];
  selectedExcavator?: any;
  mode?: 'ProjectCreating' | 'AddTask'; // ProjectCreating or AddTask mode
  eventId?: string; // Event ID for AddTask mode
}

const CalculatorModal: React.FC<CalculatorModalProps> = ({
  calculatorType,
  calculatorSubType,
  onClose,
  onSaveResults,
  calculateTransport = false,
  setCalculateTransport,
  selectedTransportCarrier,
  setSelectedTransportCarrier,
  transportDistance = '30',
  setTransportDistance,
  carriers = [],
  selectedExcavator,
  mode = 'ProjectCreating',
  eventId
}) => {
  const { t } = useTranslation(['common', 'calculator', 'form']);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const calculatorContainerRef = useRef<HTMLDivElement>(null);
  const [calculatorResults, setCalculatorResults] = useState<any>(null);
  const [fetchedCarriers, setFetchedCarriers] = useState<any[]>([]);

  // Fetch carriers for both digging and materials in AddTask mode
  React.useEffect(() => {
    if (mode === 'AddTask') {
      const fetchCarriers = async () => {
        try {
          const { data, error } = await supabase
            .from('setup_digging')
            .select('*')
            .eq('type', 'barrows_dumpers')
            .eq('company_id', companyId);
          
          if (error) throw error;
          setFetchedCarriers(data || []);
        } catch (error) {
          console.error('Error fetching carriers:', error);
        }
      };
      
      fetchCarriers();
    }
  }, [mode, companyId]);

  // Use fetched carriers if in AddTask mode, otherwise use props
  const activeCarriers = mode === 'AddTask' ? fetchedCarriers : (carriers || []);

  // Mutation for saving task results
  const saveTaskMutation = useMutation({
    mutationFn: async (taskData: any) => {
      const { data, error } = await supabase
        .from('tasks_done')
        .insert([{
          event_id: taskData.event_id,
          name: taskData.name,
          amount: taskData.amount,
          hours_worked: taskData.hours_worked,
          progress_completed: 0,
          company_id: companyId,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  });

  // Mutation for saving material results
  const saveMaterialMutation = useMutation({
    mutationFn: async (materialData: any) => {
      const { data, error } = await supabase
        .from('materials_delivered')
        .insert([{
          event_id: materialData.event_id,
          name: materialData.name,
          total_amount: materialData.total_amount,
          unit: materialData.unit,
          company_id: companyId,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  });

  const renderCalculator = () => {
    const commonProps = {
      onResultsChange: setCalculatorResults,
      isInProjectCreating: true,
      calculateTransport,
      setCalculateTransport,
      selectedTransportCarrier,
      setSelectedTransportCarrier,
      transportDistance,
      setTransportDistance,
      carriers: activeCarriers,
      selectedExcavator
    };

    switch (calculatorType) {
      case 'aggregate':
        switch (calculatorSubType) {
          case 'type1':
            return <Type1AggregateCalculator {...commonProps} />;
          case 'soil_excavation':
            return <SoilExcavationCalculator {...commonProps} />;
          default:
            return null;
        }
      case 'paving':
        return <PavingCalculator {...commonProps} />;
      case 'wall':
        if (calculatorSubType === 'sleeper') {
          return <SleeperWallCalculator {...commonProps} />;
        }
        return <WallCalculator type={calculatorSubType as 'brick' | 'block4' | 'block7'} {...commonProps} />;
      case 'kerbs':
        return <KerbsEdgesAndSetsCalculator type={calculatorSubType as 'kl' | 'rumbled' | 'flat' | 'sets'} {...commonProps} />;
      case 'slab':
        return <SlabCalculator {...commonProps} />;
      case 'fence':
        if (calculatorSubType === 'venetian') {
          return <VenetianFenceCalculator {...commonProps} />;
        } else if (calculatorSubType === 'composite') {
          return <CompositeFenceCalculator {...commonProps} />;
        }
        return <FenceCalculator fenceType={calculatorSubType as 'vertical' | 'horizontal'} {...commonProps} />;
      case 'steps':
        if (calculatorSubType === 'l_shape') {
          return <LShapeStairCalculator {...commonProps} />;
        }
        if (calculatorSubType === 'u_shape') {
          return <UShapeStairCalculator {...commonProps} />;
        }
        return <StairCalculator {...commonProps} />;
      case 'grass':
        return <ArtificialGrassCalculator {...commonProps} />;
      case 'tile':
        if (calculatorSubType === 'coping') {
          return <CopingInstallationCalculator {...commonProps} />;
        }
        return <WallFinishCalculator {...commonProps} />;
      case 'foundation':
        return <FoundationCalculator {...commonProps} />;
      case 'deck':
        return <DeckCalculator {...commonProps} />;
      default:
        return null;
    }
  };

  const handleSaveResults = async () => {
    if (!calculatorResults) return;

    try {
      // First update the UI with the results
      onSaveResults(calculatorResults);

      // Then save to database if we have an event_id
      if (calculatorResults.event_id) {
        // Save task results
        if (calculatorResults.hours_worked) {
          await saveTaskMutation.mutateAsync({
            event_id: calculatorResults.event_id,
            name: calculatorResults.name,
            amount: calculatorResults.amount,
            hours_worked: calculatorResults.hours_worked
          });
        }

        // Save material results
        if (calculatorResults.materials && calculatorResults.materials.length > 0) {
          for (const material of calculatorResults.materials) {
            await saveMaterialMutation.mutateAsync({
              event_id: calculatorResults.event_id,
              name: material.name,
              total_amount: material.quantity,
              unit: material.unit
            });
          }
        }

        // Invalidate queries to refresh the data
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['materials'] });
      }

      // Close the modal
      onClose();
    } catch (error) {
      console.error('Error saving results:', error);
      // You might want to show an error message to the user here
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">{t('project:calculator_modal_title')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6" data-calculator-results ref={calculatorContainerRef}>
          {/* Calculator */}
          {renderCalculator()}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-gray-800 text-gray-300 rounded-md hover:bg-gray-700 transition-colors"
          >
            {t('project:cancel_button_label')}
          </button>
          <button
            onClick={handleSaveResults}
            disabled={!calculatorResults}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
          >
            {t('project:add_to_project_button')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalculatorModal;
