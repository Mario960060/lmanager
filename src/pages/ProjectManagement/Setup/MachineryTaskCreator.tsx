import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';
import { X, Loader, Check, AlertTriangle } from 'lucide-react';

interface MachineryTaskCreatorProps {
  onClose: () => void;
}

interface DiggingEquipment {
  id: string;
  name: string;
  description: string | null;
  status: 'free_to_use' | 'in_use' | 'broken';
  created_at?: string;
  updated_at?: string;
  type: 'excavator' | 'barrows_dumpers';
  quantity: number;
  in_use_quantity: number;
  "size (in tones)": number | null;
}

interface EventTask {
  id?: string;
  name: string;
  description: string;
  unit: string;
  estimated_hours: number;
}

// Define time estimates for different digger sizes (from SoilExcavationCalculator)
const soilDiggerTimeEstimates = [
  { size: 'Shovel (1 Person)', sizeInTons: 0.02, timePerTon: 0.5 },
  { size: 'Digger 1T', sizeInTons: 1, timePerTon: 0.14 },
  { size: 'Digger 2T', sizeInTons: 2, timePerTon: 0.06 },
  { size: 'Digger 3-5T', sizeInTons: 3, timePerTon: 0.02 },
  { size: 'Digger 6-10T', sizeInTons: 6, timePerTon: 0.01 },
  { size: 'Digger 11-20T', sizeInTons: 11, timePerTon: 0.003 },
  { size: 'Digger 21-30T', sizeInTons: 21, timePerTon: 0.0012 },
  { size: 'Digger 31-40T', sizeInTons: 31, timePerTon: 0.0007 },
  { size: 'Digger 41-50T', sizeInTons: 41, timePerTon: 0.0004 }
];

// Define time estimates for different carrier sizes (from SoilExcavationCalculator)
const carrierTimeEstimates = [
  { carrier: 'Wheelbarrow', size: 0.1, timePerTon: 0.355 },
  { carrier: 'Wheelbarrow', size: 0.125, timePerTon: 0.442 },
  { carrier: 'Wheelbarrow', size: 0.15, timePerTon: 0.530 },
  { carrier: 'Petrol Wheelbarrow', size: 0.3, timePerTon: 0.0766 },
  { carrier: 'Petrol Wheelbarrow', size: 0.5, timePerTon: 0.03416 },
  { carrier: 'Dumper', size: 1, timePerTon: 0.00967 },
  { carrier: 'Dumper', size: 3, timePerTon: 0.00283 },
  { carrier: 'Dumper', size: 5, timePerTon: 0.00157 },
  { carrier: 'Dumper', size: 10, timePerTon: 0.00068 }
];

// Define loading time estimates for different digger sizes (from Type1AggregateCalculator)
const preparationDiggerTimeEstimates = [
  { equipment: 'Shovel (1 Person)', sizeInTons: 0.02, timePerTon: 0.5 },
  { equipment: 'Digger 1T', sizeInTons: 1, timePerTon: 0.18 },
  { equipment: 'Digger 2T', sizeInTons: 2, timePerTon: 0.12 },
  { equipment: 'Digger 3-5T', sizeInTons: 3, timePerTon: 0.08 },
  { equipment: 'Digger 6-10T', sizeInTons: 6, timePerTon: 0.05 },
  { equipment: 'Digger 11-20T', sizeInTons: 11, timePerTon: 0.03 },
  { equipment: 'Digger 21-30T', sizeInTons: 21, timePerTon: 0.02 },
  { equipment: 'Digger 31-40T', sizeInTons: 31, timePerTon: 0.01 },
  { equipment: 'Digger 41-50T', sizeInTons: 41, timePerTon: 0.005 }
];

const MachineryTaskCreator: React.FC<MachineryTaskCreatorProps> = ({ onClose }: MachineryTaskCreatorProps) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'calculator']);
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriers, setCarriers] = useState<DiggingEquipment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [creationStatus, setCreationStatus] = useState<{
    success: number;
    failed: number;
    skipped: number;
    total: number;
  }>({ success: 0, failed: 0, skipped: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState<boolean>(false);
  const [newExcavators, setNewExcavators] = useState<DiggingEquipment[]>([]);
  const [newCarriers, setNewCarriers] = useState<DiggingEquipment[]>([]);
  const [existingTasks, setExistingTasks] = useState<string[]>([]);

  useEffect(() => {
    fetchEquipment();
  }, []);

  const fetchEquipment = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch excavators
      const { data: excavatorData, error: excavatorError } = await supabase
        .from('setup_digging')
        .select('*')
        .eq('type', 'excavator')
        .eq('company_id', companyId);

      if (excavatorError) throw excavatorError;

      // Fetch carriers (barrows/dumpers)
      const { data: carrierData, error: carrierError } = await supabase
        .from('setup_digging')
        .select('*')
        .eq('type', 'barrows_dumpers')
        .eq('company_id', companyId);

      if (carrierError) throw carrierError;

      // Fetch existing tasks to check for duplicates
      const { data: taskData, error: taskError } = await supabase
        .from('event_tasks')
        .select('name')
        .eq('company_id', companyId)
        .eq('company_id', companyId);

      if (taskError) throw taskError;

      // Store all excavators and carriers
      setExcavators(excavatorData || []);
      setCarriers(carrierData || []);
      
      // Store existing task names for duplicate checking
      setExistingTasks((taskData || []).map((task: any) => task.name));

      // Determine which equipment combinations need new tasks
      const newExcavatorsList: DiggingEquipment[] = [];
      const newCarriersList: DiggingEquipment[] = [];

      // Check each excavator to see if it needs tasks
      for (const excavator of excavatorData || []) {
        if (excavator["size (in tones)"] === null) continue;
        
        let needsTasks = false;
        
        // For each carrier, check if soil and prep tasks already exist
        for (const carrier of carrierData || []) {
          if (carrier["size (in tones)"] === null) continue;
          
          // Get time estimates and names for soil excavation
          const soilDiggerEstimate = findSoilDiggerTimeEstimate(excavator["size (in tones)"]);
          const soilCarrierEstimate = findCarrierTimeEstimate(carrier["size (in tones)"]);
          
          // Get time estimates and names for preparation
          const prepDiggerEstimate = findPreparationDiggerTimeEstimate(excavator["size (in tones)"]);
          const prepCarrierEstimate = findCarrierTimeEstimate(carrier["size (in tones)"]);

          // Defensive: ensure all are objects with .name and .size
          const getName = (est: any) => typeof est === 'object' && est !== null && 'name' in est ? est.name : '';
          const getSize = (est: any) => typeof est === 'object' && est !== null && 'size' in est ? est.size : '';

          const soilDiggerName = getName(soilDiggerEstimate);
          const soilCarrierName = getName(soilCarrierEstimate);
          const soilCarrierSize = getSize(soilCarrierEstimate);
          const prepDiggerName = getName(prepDiggerEstimate);
          const prepCarrierName = getName(prepCarrierEstimate);
          const prepCarrierSize = getSize(prepCarrierEstimate);

          // Generate task names to check if they exist
          const soilTaskName = `Excavation soil with ${soilDiggerName} and ${soilCarrierName} ${soilCarrierSize}t`;
          const prepTaskName = `Preparation with ${prepDiggerName} and ${prepCarrierName} ${prepCarrierSize}t`;

          console.log('Checking tasks:', {
            soilTaskName,
            prepTaskName,
            exists: {
              soil: existingTasks.includes(soilTaskName),
              prep: existingTasks.includes(prepTaskName)
            }
          });

          // If any task doesn't exist, this excavator needs tasks
          if (!existingTasks.includes(soilTaskName) || 
              !existingTasks.includes(prepTaskName)) {
            needsTasks = true;
            break;
          }
        }

        // Check if Loading Sand task exists (only depends on excavator, not carrier)
        const loadingSandDiggerEstimate = findPreparationDiggerTimeEstimate(excavator["size (in tones)"]);
        const loadingSandDiggerName = typeof loadingSandDiggerEstimate === 'object' && loadingSandDiggerEstimate !== null && 'name' in loadingSandDiggerEstimate ? loadingSandDiggerEstimate.name : '';
        const loadingSandTaskName = `Loading Sand with ${loadingSandDiggerName}`;
        
        if (!existingTasks.includes(loadingSandTaskName)) {
          needsTasks = true;
        }
        
        // If this excavator needs tasks, add it to the new list
        if (needsTasks) {
          newExcavatorsList.push(excavator);
        }
      }

      // Check each carrier to see if it needs tasks
      for (const carrier of carrierData || []) {
        if (carrier["size (in tones)"] === null) continue;
        
        let needsTasks = false;
        
        // For each excavator, check if tasks already exist
        for (const excavator of excavatorData || []) {
          if (excavator["size (in tones)"] === null) continue;
          
          // Get time estimates and names for soil excavation
          const soilDiggerEstimate = findSoilDiggerTimeEstimate(excavator["size (in tones)"]);
          const soilCarrierEstimate = findCarrierTimeEstimate(carrier["size (in tones)"]);
          
          // Get time estimates and names for preparation
          const prepDiggerEstimate = findPreparationDiggerTimeEstimate(excavator["size (in tones)"]);
          const prepCarrierEstimate = findCarrierTimeEstimate(carrier["size (in tones)"]);

          // Defensive: ensure all are objects with .name and .size
          const getName = (est: any) => typeof est === 'object' && est !== null && 'name' in est ? est.name : '';
          const getSize = (est: any) => typeof est === 'object' && est !== null && 'size' in est ? est.size : '';

          const soilDiggerName = getName(soilDiggerEstimate);
          const soilCarrierName = getName(soilCarrierEstimate);
          const soilCarrierSize = getSize(soilCarrierEstimate);
          const prepDiggerName = getName(prepDiggerEstimate);
          const prepCarrierName = getName(prepCarrierEstimate);
          const prepCarrierSize = getSize(prepCarrierEstimate);

          // Generate task names to check if they exist
          const soilTaskName = `Excavation soil with ${soilDiggerName} and ${soilCarrierName} ${soilCarrierSize}t`;
          const prepTaskName = `Preparation with ${prepDiggerName} and ${prepCarrierName} ${prepCarrierSize}t`;
          const sandTaskName = `Load-in and compacting sand with ${prepDiggerName} and ${prepCarrierName} ${prepCarrierSize}t`;

          console.log('Checking tasks:', {
            soilTaskName,
            prepTaskName,
            sandTaskName,
            exists: {
              soil: existingTasks.includes(soilTaskName),
              prep: existingTasks.includes(prepTaskName),
              sand: existingTasks.includes(sandTaskName)
            }
          });

          // If any task doesn't exist, this carrier needs tasks
          if (!existingTasks.includes(soilTaskName) || 
              !existingTasks.includes(prepTaskName) ||
              !existingTasks.includes(sandTaskName)) {
            needsTasks = true;
            break;
          }
        }
        
        // If this carrier needs tasks, add it to the new list
        if (needsTasks) {
          newCarriersList.push(carrier);
        }
      }

      setNewExcavators(newExcavatorsList);
      setNewCarriers(newCarriersList);
    } catch (error) {
      console.error('Error fetching equipment:', error);
      setError(t('form:failed_fetch_equipment'));
    } finally {
      setIsLoading(false);
    }
  };

  // Find the closest digger time estimate for soil excavation
  const findSoilDiggerTimeEstimate = (sizeInTons: number) => {
    if (sizeInTons <= 0) return soilDiggerTimeEstimates[0].timePerTon;
    
    for (let i = 0; i < soilDiggerTimeEstimates.length - 1; i++) {
      if (
        sizeInTons >= soilDiggerTimeEstimates[i].sizeInTons &&
        sizeInTons < soilDiggerTimeEstimates[i + 1].sizeInTons
      ) {
        return {
          timePerTon: soilDiggerTimeEstimates[i].timePerTon,
          name: soilDiggerTimeEstimates[i].size
        };
      }
    }
    
    return {
      timePerTon: soilDiggerTimeEstimates[soilDiggerTimeEstimates.length - 1].timePerTon,
      name: soilDiggerTimeEstimates[soilDiggerTimeEstimates.length - 1].size
    };
  };

  // Find the closest digger time estimate for preparation
  const findPreparationDiggerTimeEstimate = (sizeInTons: number) => {
    if (sizeInTons <= 0) return preparationDiggerTimeEstimates[0].timePerTon;
    
    for (let i = 0; i < preparationDiggerTimeEstimates.length - 1; i++) {
      if (
        sizeInTons >= preparationDiggerTimeEstimates[i].sizeInTons &&
        sizeInTons < preparationDiggerTimeEstimates[i + 1].sizeInTons
      ) {
        return {
          timePerTon: preparationDiggerTimeEstimates[i].timePerTon,
          name: preparationDiggerTimeEstimates[i].equipment
        };
      }
    }
    
    return {
      timePerTon: preparationDiggerTimeEstimates[preparationDiggerTimeEstimates.length - 1].timePerTon,
      name: preparationDiggerTimeEstimates[preparationDiggerTimeEstimates.length - 1].equipment
    };
  };

  // Find carrier time estimate
  const findCarrierTimeEstimate = (sizeInTons: number) => {
    // Find the closest carrier size that's not larger than the selected one
    const sortedEstimates = [...carrierTimeEstimates].sort((a, b) => b.size - a.size);
    const estimate = sortedEstimates.find(est => est.size <= sizeInTons);
    
    if (!estimate) {
      return {
        timePerTon: carrierTimeEstimates[0].timePerTon,
        name: carrierTimeEstimates[0].carrier,
        size: carrierTimeEstimates[0].size
      };
    }
    
    return {
      timePerTon: estimate.timePerTon,
      name: estimate.carrier,
      size: estimate.size
    };
  };

  const createTasks = async () => {
    try {
      setIsCreating(true);
      setShowResults(false);
      setError(null);
      
      let successCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      
      // Calculate total potential tasks
      let totalNewTasks = 0;
      for (const excavator of newExcavators) {
        // Each excavator gets: 1 soil task (per carrier) + 1 prep task (per carrier) + 1 loading sand task (solo)
        totalNewTasks += (newCarriers.length * 2) + 1; // 2 per carrier + 1 solo loading sand
      }
      
      setCreationStatus({
        success: 0,
        failed: 0,
        skipped: 0,
        total: totalNewTasks
      });

      // Create tasks for each excavator and carrier combination (soil + prep)
      for (const excavator of newExcavators) {
        for (const carrier of newCarriers) {
          // Skip if either equipment doesn't have a size
          if (excavator["size (in tones)"] === null || carrier["size (in tones)"] === null) {
            continue;
          }

          // Get time estimates and names for soil excavation
          const soilDiggerEstimate = findSoilDiggerTimeEstimate(excavator["size (in tones)"]);
          const soilCarrierEstimate = findCarrierTimeEstimate(carrier["size (in tones)"]);
          
          // Get time estimates and names for preparation
          const prepDiggerEstimate = findPreparationDiggerTimeEstimate(excavator["size (in tones)"]);
          const prepCarrierEstimate = findCarrierTimeEstimate(carrier["size (in tones)"]);

          // Generate task names
          const soilTaskName = `Excavation soil with ${soilDiggerEstimate.name} and ${soilCarrierEstimate.name} ${soilCarrierEstimate.size}t`;
          const prepTaskName = `Preparation with ${prepDiggerEstimate.name} and ${prepCarrierEstimate.name} ${prepCarrierEstimate.size}t`;

          // Check if soil task already exists
          if (existingTasks.includes(soilTaskName)) {
            skippedCount++;
          } else {
            console.log('[MachineryTaskCreator] Creating SOIL task:', soilTaskName, {
              name: soilTaskName,
              description: t('form:time_estimated_one_person'),
              unit: t('form:tons_unit'),
              estimated_hours: (typeof soilDiggerEstimate === 'object' ? soilDiggerEstimate.timePerTon : 0) + (typeof soilCarrierEstimate === 'object' ? soilCarrierEstimate.timePerTon : 0)
            });
            // Create soil excavation task
            const soilTask = {
              name: soilTaskName,
              description: t('form:time_estimated_one_person'),
              unit: t('form:tons_unit'),
              estimated_hours: (typeof soilDiggerEstimate === 'object' ? soilDiggerEstimate.timePerTon : 0) + (typeof soilCarrierEstimate === 'object' ? soilCarrierEstimate.timePerTon : 0)
            };

            // Insert soil excavation task
            const { error: soilError } = await supabase
              .from('event_tasks')
              .insert([{ ...soilTask, company_id: companyId }]);

            if (soilError) {
              console.error('Error creating soil task:', soilError);
              failedCount++;
            } else {
              successCount++;
              // Add to existing tasks to prevent duplicates in this session
              existingTasks.push(soilTaskName);
            }
          }

          // Check if preparation task already exists
          if (existingTasks.includes(prepTaskName)) {
            skippedCount++;
          } else {
            console.log('[MachineryTaskCreator] Creating PREPARATION task:', prepTaskName, {
              name: prepTaskName,
              description: t('form:time_estimated_one_person'),
              unit: t('form:tons_unit'),
              estimated_hours: (typeof prepDiggerEstimate === 'object' ? prepDiggerEstimate.timePerTon : 0) + (typeof prepCarrierEstimate === 'object' ? prepCarrierEstimate.timePerTon : 0)
            });
            // Create preparation task
            const prepTask = {
              name: prepTaskName,
              description: t('form:time_estimated_one_person'),
              unit: t('form:tons_unit'),
              estimated_hours: (typeof prepDiggerEstimate === 'object' ? prepDiggerEstimate.timePerTon : 0) + (typeof prepCarrierEstimate === 'object' ? prepCarrierEstimate.timePerTon : 0)
            };

            // Insert preparation task
            const { error: prepError } = await supabase
              .from('event_tasks')
              .insert([{ ...prepTask, company_id: companyId }]);

            if (prepError) {
              console.error('Error creating preparation task:', prepError);
              failedCount++;
            } else {
              successCount++;
              // Add to existing tasks to prevent duplicates in this session
              existingTasks.push(prepTaskName);
            }
          }

          // Update status after each combination
          setCreationStatus({
            success: successCount,
            failed: failedCount,
            skipped: skippedCount,
            total: totalNewTasks
          });
        }

        // Create Loading Sand task for this excavator (no carrier needed)
        const loadingSandDiggerEstimate = findPreparationDiggerTimeEstimate(excavator["size (in tones)"]);
        const loadingSandDiggerName = typeof loadingSandDiggerEstimate === 'object' && loadingSandDiggerEstimate !== null && 'name' in loadingSandDiggerEstimate ? loadingSandDiggerEstimate.name : '';
        const loadingSandTaskName = `Loading Sand with ${loadingSandDiggerName}`;

        if (existingTasks.includes(loadingSandTaskName)) {
          skippedCount++;
        } else {
          console.log('[MachineryTaskCreator] Creating LOADING SAND task:', loadingSandTaskName, {
            name: loadingSandTaskName,
            description: t('form:time_estimated_one_person'),
            unit: t('form:tons_unit'),
            estimated_hours: typeof loadingSandDiggerEstimate === 'object' ? loadingSandDiggerEstimate.timePerTon : 0
          });
          // Create Loading Sand task
          const loadingSandTask = {
            name: loadingSandTaskName,
            description: t('form:time_estimated_one_person'),
            unit: t('form:tons_unit'),
            estimated_hours: typeof loadingSandDiggerEstimate === 'object' ? loadingSandDiggerEstimate.timePerTon : 0
          };

          // Insert loading sand task
          const { error: loadingSandError } = await supabase
            .from('event_tasks')
            .insert([{ ...loadingSandTask, company_id: companyId }]);

          if (loadingSandError) {
            console.error('Error creating loading sand task:', loadingSandError);
            failedCount++;
          } else {
            successCount++;
            existingTasks.push(loadingSandTaskName);
          }
        }

        // Update status after loading sand task
        setCreationStatus({
          success: successCount,
          failed: failedCount,
          skipped: skippedCount,
          total: totalNewTasks
        });
      }

      setShowResults(true);
    } catch (error) {
      console.error('Error creating tasks:', error);
      setError(t('form:unexpected_error_creating_tasks'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold dark:text-white">{t('form:machinery_task_creator_title')}</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-6 h-6 dark:text-gray-200" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-grow dark:bg-gray-800">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader className="w-8 h-8 text-gray-400 dark:text-gray-500 animate-spin mb-4" />
              <p className="text-gray-500 dark:text-gray-400">{t('form:loading_equipment_data')}</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md text-red-700 dark:text-red-400 mb-4">
              <p className="font-medium">{t('form:error_label')}</p>
              <p>{error}</p>
              <button 
                onClick={fetchEquipment}
                className="mt-2 px-3 py-1 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 rounded text-sm"
              >
                {t('form:try_again_button')}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  {t('form:machinery_task_creator_description')}
                </p>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  For each combination, three tasks will be created:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300 mb-4">
                  <li>{t('form:soil_excavation_task')}</li>
                  <li>{t('form:preparation_task')}</li>
                  <li>{t('form:load_sand_task')}</li>
                </ul>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md text-yellow-800 dark:text-yellow-300 text-sm border border-yellow-200 dark:border-yellow-800">
                  <p className="font-medium flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    {t('form:important_label')}
                  </p>
                  <p>
                    {t('form:machinery_found_summary', { excavators: newExcavators.length, carriers: newCarriers.length })}
                  </p>
                </div>
              </div>

              {showResults ? (
                <div className={`p-4 rounded-md mb-4 border ${
                  creationStatus.failed > 0 
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800' 
                    : 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800'
                }`}>
                  <p className="font-medium flex items-center">
                    {creationStatus.failed > 0 ? (
                      <AlertTriangle className="w-4 h-4 mr-2" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    {t('form:task_creation_results')}
                  </p>
                  <p>{t('form:tasks_created_success', { count: creationStatus.success })}</p>
                  <p>{t('form:tasks_skipped', { count: creationStatus.skipped })}</p>
                  {creationStatus.failed > 0 && (
                    <p>{t('form:tasks_failed', { count: creationStatus.failed })}</p>
                  )}
                </div>
              ) : null}

              <button
                onClick={createTasks}
                disabled={isCreating || newExcavators.length === 0 || newCarriers.length === 0}
                className={`w-full py-2 px-4 rounded font-medium flex items-center justify-center ${
                  isCreating || newExcavators.length === 0 || newCarriers.length === 0
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-800'
                }`}
              >
                {isCreating ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    {t('form:creating_tasks_progress', { current: creationStatus.success + creationStatus.failed + creationStatus.skipped, total: creationStatus.total })}
                  </>
                ) : (
                  t('form:create_tasks_button')
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MachineryTaskCreator;
