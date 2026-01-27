import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Plus, X, AlertCircle, Loader2, Check, Pencil } from 'lucide-react';
import BackButton from '../components/BackButton';
import MainTaskModal from './MainTaskModal';
import CalculatorModal from './CalculatorModal';
import UnspecifiedMaterialModal from '../components/UnspecifiedMaterialModal';

// Types
interface CalculatorResults {
  name: string;
  materials?: {
    name: string;
    quantity: number;
    unit: string;
  }[];
  labor?: number;
  totalRows?: number;
  roundedDownHeight?: number;
  roundedUpHeight?: number;
  taskBreakdown?: TaskBreakdown[];
  excavationTime?: number;
  transportTime?: number;
  totalTime?: number;
  totalTons?: number;
  equipmentUsed?: {
    excavator?: string;
    carrier?: string;
  };
  unit?: string;
  amount?: number | string;
  hours_worked?: number;
}

interface MainTask {
  id: string;
  name: string;
  calculatorType: string;
  calculatorSubType: string;
  results: CalculatorResults | null;
}

interface TaskBreakdown {
  task: string;
  name?: string;  // Alias for 'task' for compatibility
  hours: number;
  amount: string;
  unit: string;
}

interface MinorTask {
  template_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  estimated_hours?: number;
  results?: {
    materials: {
      name: string;
      quantity: number;
      unit: string;
    }[];
    labor: number;
  } | null;
}

interface Material {
  template_id: string;
  quantity: number;
  name?: string;
  unit?: string;
  price?: number;
  description?: string;
  confirmed?: boolean;
}

interface FormData {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  status: 'planned' | 'scheduled' | 'in_progress';
  has_equipment: boolean;
  has_materials: boolean;
}

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  "size (in tones)": number | null;
}

interface TaskTemplate {
  id: string | null;
  name: string | null;
  description?: string | null;
  unit?: string | null;
  created_at?: string | null;
  materials?: {
    name: string;
    quantity: number;
    unit: string;
  }[];
  estimated_hours?: number | null;
  calculated_estimated_hours?: number | null;
}

const ProjectCreating = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    status: 'planned',
    has_equipment: false,
    has_materials: false
  });

  // Add refs for date inputs
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  // Handle date input clicks to ensure calendar opens
  const handleDateInputClick = (ref: React.RefObject<HTMLInputElement>) => {
    if (ref.current) {
      ref.current.focus();
    }
  };

  const [mainTasks, setMainTasks] = useState<MainTask[]>([]);
  const [minorTasks, setMinorTasks] = useState<MinorTask[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [showMainTaskModal, setShowMainTaskModal] = useState(false);
  const [selectedCalculator, setSelectedCalculator] = useState<string | null>(null);
  const [selectedSubCalculator, setSelectedSubCalculator] = useState<string | null>(null);
  const [extraSoilExcavation, setExtraSoilExcavation] = useState({
    area: '',
    weight: ''
  });
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [selectedMainTask, setSelectedMainTask] = useState<MainTask | null>(null);
  const [totalSoilExcavation, setTotalSoilExcavation] = useState(0);
  const [totalTape1, setTotalTape1] = useState(0);
  const [totalHours, setTotalHours] = useState(0);

  // Add state for the created event
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);

  // Add new state variables for equipment selection
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriers, setCarriers] = useState<DiggingEquipment[]>([]);
  const [excavationOption, setExcavationOption] = useState<'removal' | 'pile'>('removal');
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [selectedTape1Excavator, setSelectedTape1Excavator] = useState<DiggingEquipment | null>(null);
  const [selectedTape1Carrier, setSelectedTape1Carrier] = useState<DiggingEquipment | null>(null);
  const [soilExcavationHours, setSoilExcavationHours] = useState(0);
  const [tape1Hours, setTape1Hours] = useState(0);
  const [excavationMeasureType, setExcavationMeasureType] = useState<'area' | 'weight'>('area');

  // Add state for transport and digging options in calculators
  const [calculateTransport, setCalculateTransport] = useState(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [transportDistance, setTransportDistance] = useState('30');

  // Add new state variables for name prompt
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [tempMainTask, setTempMainTask] = useState<MainTask | null>(null);
  const [taskName, setTaskName] = useState('');

  // Add state for unspecified material modal
  const [showUnspecifiedMaterialModal, setShowUnspecifiedMaterialModal] = useState(false);

  // Add mutation for creating event
  const createEventMutation = useMutation({
    mutationFn: async (eventData: FormData) => {
      const companyId = useAuthStore.getState().getCompanyId();
      console.log('DEBUG: Creating event with companyId:', companyId);
      
      if (!companyId) {
        throw new Error('No company_id available! User must have a company assigned.');
      }
      
      const { data, error } = await supabase
        .from('events')
        .insert([{
          title: eventData.title,
          description: eventData.description,
          start_date: eventData.start_date,
          end_date: eventData.end_date,
          status: eventData.status,
          has_equipment: eventData.has_equipment,
          has_materials: eventData.has_materials,
          company_id: companyId,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  });

  // Fetch task templates
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['event_tasks_with_dynamic_estimates', useAuthStore.getState().getCompanyId()],
    queryFn: async () => {
      const companyId = useAuthStore.getState().getCompanyId();
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('company_id', companyId || '')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // Fetch material templates
  const { data: materialTemplates = [] } = useQuery({
    queryKey: ['materials', useAuthStore.getState().getCompanyId()],
    queryFn: async () => {
      const companyId = useAuthStore.getState().getCompanyId();
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, description, unit, price, created_at')
        .eq('company_id', companyId || '')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // Calculator groups from Calculator.tsx, excluding specified ones
  const calculatorGroups = [
    {
      type: 'aggregate',
      label: 'Aggregate Calculator',
      subTypes: [
        { type: 'type1', label: 'Preparation' },
        { type: 'soil_excavation', label: 'Soil Excavation' }
      ]
    },
    {
      type: 'paving',
      label: 'Paving Calculator',
      subTypes: [
        { type: 'default', label: 'Monoblock Paving' }
      ]
    },
    {
      type: 'wall',
      label: 'Wall & Finish Calculator',
      subTypes: [
        { type: 'brick', label: 'Brick Wall Calculator' },
        { type: 'block4', label: '4-inch Block Wall Calculator' },
        { type: 'block7', label: '7-inch Block Wall Calculator' },
        { type: 'sleeper', label: 'Sleeper Wall Calculator' }
      ]
    },
    {
      type: 'kerbs',
      label: 'Kerbs & Sets Calculator',
      subTypes: [
        { type: 'kl', label: 'KL Kerbs' },
        { type: 'rumbled', label: 'Rumbled Kerbs' },
        { type: 'flat', label: 'Flat Edges' },
        { type: 'sets', label: '10x10 Sets' }
      ]
    },
    {
      type: 'slab',
      label: 'Slab Calculator',
      subTypes: [
        { type: 'default', label: 'Slab Calculator' }
      ]
    },
    {
      type: 'fence',
      label: 'Fence Calculator',
      subTypes: [
        { type: 'vertical', label: 'Vertical Fence' },
        { type: 'horizontal', label: 'Horizontal Fence' },
      ]
    },
    {
      type: 'steps',
      label: 'Steps Calculator',
      subTypes: [
        { type: 'standard', label: 'Standard Stairs' }
      ]
    },
    {
      type: 'grass',
      label: 'Artificial Grass Calculator',
      subTypes: [
        { type: 'default', label: 'Artificial Grass' }
      ]
    },
    {
      type: 'tile',
      label: 'Wall finish Calculator',
      subTypes: [
        { type: 'default', label: 'Tile Installation' }
      ]
    },
    {
      type: 'foundation',
      label: 'Foundation Calculator',
      subTypes: [
        { type: 'default', label: 'Foundation Excavation' }
      ]
    }
  ];

  // Add helper function at the top level of the component
  const normalizeTaskName = (name: string): string => name.toLowerCase().trim();

  const findExactTemplate = (taskName: string): TaskTemplate | undefined => {
    const normalizedTaskName = normalizeTaskName(taskName);
    return taskTemplates.find((template: TaskTemplate) => 
      template.name && normalizeTaskName(template.name || '') === normalizedTaskName
    );
  };

  const findCuttingTemplate = (taskName: string): TaskTemplate | undefined => {
    return taskTemplates.find((template: TaskTemplate) => {
      const normalizedTemplateName = template.name ? normalizeTaskName(template.name || '') : '';
      const normalizedTaskName = normalizeTaskName(taskName);
      return normalizedTemplateName && normalizedTemplateName.includes('cutting') &&
             normalizedTemplateName.includes(normalizedTaskName.replace('cutting', '').trim());
    });
  };

  // Add handlers for main tasks
  const handleAddMainTask = (task: MainTask) => {
    setTempMainTask(task);
    setShowNamePrompt(true);
  };

  const handleConfirmTaskName = () => {
    if (tempMainTask && taskName.trim()) {
      const taskWithName = {
        ...tempMainTask,
        name: taskName.trim()
      };
      setMainTasks(prev => [...prev, taskWithName]);
      setTaskName('');
      setTempMainTask(null);
      setShowNamePrompt(false);
    }
  };

  const handleSaveCalculatorResults = (results: CalculatorResults) => {
    if (selectedMainTask) {
      const newTask = {
        ...selectedMainTask,
        results
      };

      // Update totals
      if (results.materials) {
        results.materials.forEach(material => {
          if (material.name.toLowerCase().includes('soil')) {
            setTotalSoilExcavation(prev => prev + material.quantity);
          } else if (material.name.toLowerCase().includes('tape 1')) {
            setTotalTape1(prev => prev + material.quantity);
          }
        });
      }

      if (results?.totalTons) {
        if (selectedMainTask.calculatorType === 'soil_excavation') {
          setTotalSoilExcavation(prev => prev + (results.totalTons || 0));
        } else if (selectedMainTask.calculatorType === 'tape1') {
          setTotalTape1(prev => prev + (results.totalTons || 0));
        }
      }
      if (results.labor || results.totalTime) {
        setTotalHours(prev => prev + (results.labor || results.totalTime || 0));
      }

      setMainTasks(prev => [...prev, newTask]);
    }
    setShowCalculatorModal(false);
    setSelectedMainTask(null);
  };

  const handleAddMinorTask = () => {
    const newTask = { template_id: '', name: '', quantity: 1, unit: '' };
    setMinorTasks(prev => [...prev, newTask]);
  };

  const handleSaveMinorTask = (index: number) => {
    const task = minorTasks[index];
    if (task.template_id && task.name && task.quantity) {
      // First try exact match
      let matchingTemplate = findExactTemplate(task.name);
      console.log('Task name:', task.name);
      console.log('Found template:', matchingTemplate?.name || 'No match');
      
      // If no exact match and it's a cutting task, try specialized matching
      if (!matchingTemplate && normalizeTaskName(task.name).includes('cutting')) {
        matchingTemplate = findCuttingTemplate(task.name);
        console.log('Trying cutting template match:', matchingTemplate?.name || 'No match');
      }
      
      // Only if still no match, try includes matching
      if (!matchingTemplate) {
        matchingTemplate = taskTemplates.find(template => 
          template.name && normalizeTaskName(template.name || '').includes(normalizeTaskName(task.name))
        );
        console.log('Trying partial match:', matchingTemplate?.name || 'No match');
      }

      if (matchingTemplate) {
        const results = {
          materials: matchingTemplate.materials?.map(m => ({
            name: m.name,
            quantity: m.quantity * task.quantity,
            unit: m.unit
          })) || [],
          labor: (matchingTemplate.estimated_hours || 0) * task.quantity
        };

        // Update the task with the results and template ID
        const updatedTask = {
          ...task,
          results,
          template_id: matchingTemplate.id // Ensure template ID is set
        };

        setMinorTasks(prev => {
          const newTasks = [...prev];
          newTasks[index] = updatedTask;
          return newTasks;
        });

        // Update totals
        results.materials.forEach(material => {
          if (material.name.toLowerCase().includes('soil')) {
            setTotalSoilExcavation(prev => prev + material.quantity);
          } else if (material.name.toLowerCase().includes('tape 1')) {
            setTotalTape1(prev => prev + material.quantity);
          }
        });
        setTotalHours(prev => prev + results.labor);
      }
    }
  };

  const handleDeleteMinorTask = (index: number) => {
    const task = minorTasks[index];
    if (task.results) {
      // Subtract from totals
      if (task.results.materials) {
        task.results.materials.forEach(material => {
          if (material.name.toLowerCase().includes('soil')) {
            setTotalSoilExcavation(prev => prev - material.quantity);
          } else if (material.name.toLowerCase().includes('tape 1')) {
            setTotalTape1(prev => prev - material.quantity);
          }
        });
      }
      if (task.results.labor) {
        setTotalHours(prev => prev - task.results.labor);
      }
    }
    const newTasks = [...minorTasks];
    newTasks.splice(index, 1);
    setMinorTasks(newTasks);
  };

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

  // Handle form submission
  // Add calculation functions BEFORE handleSubmit so they're available
  const findDiggerTimeEstimate = (sizeInTons: number, totalTons: number) => {
    if (sizeInTons <= 3) return totalTons * 0.5;
    if (sizeInTons <= 8) return totalTons * 0.35;
    return totalTons * 0.25;
  };

  const findCarrierTimeEstimate = (sizeInTons: number, totalTons: number) => {
    if (sizeInTons <= 3) return totalTons * 0.4;
    if (sizeInTons <= 8) return totalTons * 0.3;
    return totalTons * 0.2;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Get fresh companyId from store
      const freshCompanyId = useAuthStore.getState().getCompanyId();
      console.log('DEBUG: Fresh companyId in handleSubmit =', freshCompanyId);
      
      if (!freshCompanyId) {
        throw new Error('No company_id available');
      }

      // Validate required fields
      if (!formData.title || !formData.start_date || !formData.end_date) {
        throw new Error('Please fill in all required fields');
      }

      // Create the event first
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          title: formData.title,
          description: formData.description,
          start_date: formData.start_date,
          end_date: formData.end_date,
          status: formData.status,
          has_equipment: formData.has_equipment,
          has_materials: formData.has_materials,
          created_by: user?.id,
          company_id: freshCompanyId
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // Track created folders for automatic organization
      const createdFolders = new Map<string, string>(); // folderName -> folderId

      // Process main tasks and create folders automatically
      for (const mainTask of mainTasks) {
        let mainTaskFolderId: string | null = null;

        // Create folder for this main task if it has task breakdown
        if (mainTask.results?.taskBreakdown && mainTask.results.taskBreakdown.length > 0) {
          const folderName = mainTask.name;
          
          if (!createdFolders.has(folderName)) {
            const { data: folder, error: folderError } = await supabase
              .from('task_folders')
              .insert({
                name: folderName,
                event_id: event.id,
                color: '#3B82F6',
                sort_order: createdFolders.size,
                company_id: freshCompanyId
              })
              .select()
              .single();

            if (folderError) {
              console.error('Error creating folder:', folderError);
            } else {
              createdFolders.set(folderName, folder.id);
              mainTaskFolderId = folder.id;
            }
          } else {
            mainTaskFolderId = createdFolders.get(folderName) || null;
          }

          // Log the full calculator results and breakdown
          console.log('DEBUG: Calculator results received:', mainTask.results);
          console.log('DEBUG: Task breakdown array:', mainTask.results.taskBreakdown);
          // Log all available template names and IDs before matching
          console.log('DEBUG: Available taskTemplates:', taskTemplates.map(t => ({ id: t.id, name: t.name })));
          // Create a task for each item in the task breakdown
          for (const taskItem of mainTask.results.taskBreakdown) {
            // Log each taskItem before inserting
            console.log('DEBUG: Current taskItem:', taskItem);
            // Use the original task name for template matching
            const taskName = taskItem.task;
            console.log('Processing task:', taskName, 'with amount:', taskItem.amount);

            // Determine if we're dealing with porcelain or sandstone
            let matchingTaskTemplateId = null;
            let actualTaskName = taskName;

            // If the task is "Cutting Slabs", determine the correct type based on the main task name
            if (taskName.toLowerCase() === 'cutting slabs') {
              const isPortcelain = mainTask.name.toLowerCase().includes('porcelain') || 
                                  mainTask.results.name?.toLowerCase().includes('porcelain');
              const isSandstone = mainTask.name.toLowerCase().includes('sandstone') || 
                                 mainTask.results.name?.toLowerCase().includes('sandstone');

              if (isPortcelain) {
                actualTaskName = 'cutting porcelain';
              } else if (isSandstone) {
                actualTaskName = 'cutting sandstones';
              }
            }

            // Try multiple matching strategies, from most specific to least specific
            let matchingTemplate = null;
            let matchStage = '';

            // 1. Try exact match first
            matchingTemplate = taskTemplates.find(template => 
              template.name && (template.name || '').toLowerCase() === actualTaskName.toLowerCase()
            );
            if (matchingTemplate) {
              matchStage = 'exact';
              console.log('Found exact match:', matchingTemplate.name);
            }

            // 2. If no exact match, try matching task type specifically
            if (!matchingTemplate) {
              // For cutting tasks, ensure we match with cutting templates
              if (actualTaskName.toLowerCase().includes('cutting')) {
                matchingTemplate = taskTemplates.find(template => {
                  const name = (template.name || '').toLowerCase();
                  return name.includes('cutting') && 
                         name.includes(actualTaskName.toLowerCase().replace('cutting ', ''));
                });
                if (matchingTemplate) {
                  matchStage = 'task-specific';
                  console.log('Found task-specific match:', matchingTemplate.name);
                }
              }
            }

            // 3. If still no match, try matching main words in order
            if (!matchingTemplate) {
              const taskWords = actualTaskName.toLowerCase().split(' ');
              matchingTemplate = taskTemplates.find(template => {
                const templateWords = (template.name || '').toLowerCase().split(' ');
                // Words must appear in the same order
                let templateIndex = 0;
                return taskWords.every((word: string) => {
                  while (templateIndex < templateWords.length) {
                    if (templateWords[templateIndex].includes(word)) {
                      templateIndex++;
                      return true;
                    }
                    templateIndex++;
                  }
                  return false;
                });
              });
              if (matchingTemplate) {
                matchStage = 'word-order';
                console.log('Found word-order match:', matchingTemplate.name);
              }
            }

            // 4. Last resort: try partial match with key terms
            if (!matchingTemplate) {
              matchingTemplate = taskTemplates.find(template => {
                const name = (template.name || '').toLowerCase();
                const taskNameLower = actualTaskName.toLowerCase();
                
                // Split both names into words and find common significant words
                const templateWords = name.split(' ').filter((word: string) => word.length > 3);
                const taskWords = taskNameLower.split(' ').filter((word: string) => word.length > 3);
                
                // Require all task words to be present in template
                return taskWords.every((taskWord: string) => 
                  templateWords.some((templateWord: string) => 
                    templateWord.includes(taskWord) || taskWord.includes(templateWord)
                  )
                );
              });
              if (matchingTemplate) {
                matchStage = 'partial';
                console.log('Found partial match:', matchingTemplate.name);
              }
            }

            // Log the matching results
            console.log('Template matching results:', {
              taskName: actualTaskName,
              matchStage,
              matchedTemplate: matchingTemplate?.name || 'No match found'
            });

            matchingTaskTemplateId = matchingTemplate?.id || null;

            // Skip tasks with 0 or negative hours (database constraint requires hours_worked > 0)
            if (taskItem.hours && taskItem.hours > 0) {
              const { error: taskError } = await supabase
                .from('tasks_done')
                .insert({
                  event_id: event.id,
                  user_id: user?.id,
                  name: actualTaskName.toLowerCase() === 'bricklaying' ? 'Bricklaying' : actualTaskName.toLowerCase(),
                  task_name: mainTask.name,
                  description: mainTask.results.name || '',
                  unit: taskName.toLowerCase() === 'cutting slabs' ? 'slabs' : (taskItem.unit || ''),
                  amount: `${taskItem.amount || 0} ${taskName.toLowerCase() === 'cutting slabs' ? 'slabs' : (taskItem.unit || '')}`.trim(),
                  hours_worked: taskItem.hours,
                  is_finished: false,
                  event_task_id: matchingTaskTemplateId,
                  folder_id: mainTaskFolderId,
                  company_id: freshCompanyId
                });

              // Log the object being inserted
              console.log('DEBUG: Inserting into tasks_done:', {
                event_id: event.id,
                user_id: user?.id,
                name: actualTaskName.toLowerCase() === 'bricklaying' ? 'Bricklaying' : actualTaskName.toLowerCase(),
                task_name: mainTask.name,
                description: mainTask.results.name || '',
                unit: taskName.toLowerCase() === 'cutting slabs' ? 'slabs' : (taskItem.unit || ''),
                amount: `${taskItem.amount || 0} ${taskName.toLowerCase() === 'cutting slabs' ? 'slabs' : (taskItem.unit || '')}`.trim(),
                hours_worked: taskItem.hours,
                is_finished: false,
                event_task_id: matchingTaskTemplateId
              });

              if (taskError) {
                console.error('Error creating task:', taskError);
                throw new Error('Failed to create task');
              }
            } else {
              // Log skipped tasks with 0 or negative hours
              console.log('Skipping task with zero/negative hours:', {
                taskName: actualTaskName,
                hours: taskItem.hours
              });
            }
          }

          // Add "Loading Sand" task if excavator is selected and sand is present
          console.log('DEBUG: Checking for Loading Sand:', {
            hasExcavator: !!selectedExcavator,
            excavator: selectedExcavator,
            hasMaterials: !!mainTask.results.materials,
            materials: mainTask.results.materials
          });
          
          if (selectedExcavator && mainTask.results.materials) {
            const sandMaterial = mainTask.results.materials.find((m: any) => 
              m.name && m.name.toLowerCase().includes('sand')
            );
            
            console.log('DEBUG: Found sand material:', sandMaterial);
            
            if (sandMaterial && sandMaterial.quantity > 0) {
              // Get sand amount
              const sandAmount = sandMaterial.quantity || 0;
              // Find loading sand time estimate based on excavator size
              const excavatorSize = selectedExcavator["size (in tones)"] || 0;
              const loadingSandDiggerTimeEstimates = [
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

              let loadingSandTimePerTon = loadingSandDiggerTimeEstimates[0].timePerTon;
              if (excavatorSize > 0) {
                for (let i = 0; i < loadingSandDiggerTimeEstimates.length - 1; i++) {
                  if (
                    excavatorSize >= loadingSandDiggerTimeEstimates[i].sizeInTons &&
                    excavatorSize < loadingSandDiggerTimeEstimates[i + 1].sizeInTons
                  ) {
                    loadingSandTimePerTon = loadingSandDiggerTimeEstimates[i].timePerTon;
                    break;
                  }
                }
                if (excavatorSize >= loadingSandDiggerTimeEstimates[loadingSandDiggerTimeEstimates.length - 1].sizeInTons) {
                  loadingSandTimePerTon = loadingSandDiggerTimeEstimates[loadingSandDiggerTimeEstimates.length - 1].timePerTon;
                }
              }

              const loadingSandHours = loadingSandTimePerTon * sandAmount;

              // Find "Loading Sand" template
              const loadingSandTemplate = taskTemplates.find(template => {
                const name = (template.name || '').toLowerCase();
                return name.includes('loading sand') || name.includes('loading') && name.includes('sand');
              });

              // Create "Loading Sand" task only if hours > 0
              if (loadingSandHours > 0) {
                await supabase
                  .from('tasks_done')
                  .insert({
                    event_id: event.id,
                    user_id: user?.id,
                    name: 'Loading sand',
                    task_name: mainTask.name,
                    description: mainTask.results.name || '',
                    unit: 'tonnes',
                    amount: `${sandAmount.toFixed(2)} tonnes`,
                    hours_worked: loadingSandHours,
                    is_finished: false,
                    company_id: freshCompanyId,
                    event_task_id: loadingSandTemplate?.id || null,
                  folder_id: mainTaskFolderId
                });

                console.log('Added Loading Sand task:', {
                  excavatorSize,
                  sandAmount: sandAmount,
                  hours: loadingSandHours
                });
              }
          }
        } else if (mainTask.results) {
          // If no task breakdown but we have results, create a single task
          const taskName = mainTask.name || mainTask.results.name || 'Unnamed Task';
          
          console.log('Task breakdown:', mainTask.results.taskBreakdown); // Debug log
          console.log('Full results:', mainTask.results); // Debug log

          // Find matching task template for the main task
          const matchingTemplate = taskTemplates.find(template => 
            template.name && taskName &&
            (template.name || '').trim().toLowerCase().includes(taskName.trim().toLowerCase())
          );
          const matchingTaskTemplateId = matchingTemplate?.id || null;

          if (mainTask.results.taskBreakdown && mainTask.results.taskBreakdown.length > 0) {
            // Create a task for each item in the task breakdown
            for (const taskItem of mainTask.results.taskBreakdown) {
              console.log('Processing task item:', taskItem); // Debug log

              // Find matching task template for this specific breakdown item
              const itemMatchingTemplate = taskTemplates.find(template => 
                template.name && taskItem.name &&
                (template.name || '').trim().toLowerCase() === taskItem.name.trim().toLowerCase()
              );
              const itemMatchingTaskTemplateId = itemMatchingTemplate?.id || null;
              if (!itemMatchingTemplate) {
                console.error('No template found for task:', taskItem.name);
              }

              // Extract amount from task name if it's in brackets
              let amount = 0;
              let unit = '';
              const amountMatch = taskItem.task.match(/\[([\d.]+)\s*([^\]]+)\]/);
              if (amountMatch) {
                amount = parseFloat(amountMatch[1]);
                unit = amountMatch[2].trim();
              } else {
                // Fallback to task item's amount and unit if available
                // Parse amount if it's a string like "22 meters"
                if (typeof taskItem.amount === 'string') {
                  const numberMatch = taskItem.amount.match(/^([\d.]+)/);
                  amount = numberMatch ? parseFloat(numberMatch[1]) : 0;
                } else {
                  amount = taskItem.amount || 0;
                }
                unit = taskItem.unit || '';
              }

              console.log('Task amount and unit:', { amount, unit }); // Debug log

              // Only insert tasks with positive hours (database constraint requires hours_worked > 0)
              if (taskItem.hours && taskItem.hours > 0) {
                const { error: taskError } = await supabase
                  .from('tasks_done')
                  .insert({
                    event_id: event.id,
                    user_id: user?.id,
                    name: taskItem.task.toLowerCase(),  // Convert to lowercase here
                    task_name: mainTask.name,
                    description: mainTask.results.name || '',
                    unit: unit,
                    amount: `${amount} ${unit}`.trim(),
                    hours_worked: taskItem.hours,
                    is_finished: false,
                    company_id: freshCompanyId,
                    event_task_id: itemMatchingTaskTemplateId
                  });

                if (taskError) {
                  console.error('Error creating task:', taskError);
                  throw new Error('Failed to create task');
                }
              } else {
                console.log('Skipping task with zero/negative hours:', {
                  taskName: taskItem.task,
                  hours: taskItem.hours
                });
              }
            }
          } else {
            // If no task breakdown, create a single task only if hours > 0
            const taskHours = parseFloat((mainTask.results.totalTime || mainTask.results.labor || 0).toFixed(2));
            
            if (taskHours > 0) {
              const { error: taskError } = await supabase
                .from('tasks_done')
                .insert({
                  event_id: event.id,
                  user_id: user?.id,
                  name: taskName,
                  description: mainTask.results.name || '',
                  unit: mainTask.results.unit || '',
                  amount: `${mainTask.results.amount || 0} ${mainTask.results.unit || ''}`.trim(),
                  hours_worked: taskHours,
                  is_finished: false,
                  event_task_id: matchingTaskTemplateId,
                  company_id: freshCompanyId
                });

              if (taskError) {
                console.error('Error creating task:', taskError);
                throw new Error('Failed to create task');
              }
            } else {
              console.log('Skipping single task with zero hours:', { taskName, hours: taskHours });
            }
          }
        }

        // Process materials from main task
        if (mainTask.results?.materials) {
          for (const material of mainTask.results.materials) {
            // Skip materials with zero or negative quantity
            if (!material.quantity || material.quantity <= 0) continue;

            const { error: materialError } = await supabase
              .from('materials_delivered')
              .insert({
                event_id: event.id,
                amount: 0,
                total_amount: material.quantity,
                unit: material.unit,
                status: 'pending',
                name: material.name,
                company_id: freshCompanyId
              });

            if (materialError) {
              console.error('Error creating material:', materialError);
              throw new Error('Failed to create material');
            }
          }
        }
      }

      // Add this after processing main tasks but before processing minor tasks
      // Create "Excavation and Preparation" folder for soil excavation and tape1 tasks
      let excavationFolderId: string | null = null;
      if (selectedExcavator && (totalSoilExcavation > 0 || totalTape1 > 0)) {
        const excavationFolderName = 'Excavation and Preparation';
        
        if (!createdFolders.has(excavationFolderName)) {
          const { data: excavationFolder, error: excavationFolderError } = await supabase
            .from('task_folders')
            .insert({
              name: excavationFolderName,
              event_id: event.id,
              color: '#8B5CF6', // Purple color for excavation folder
              sort_order: -1 // Put excavation folder first
            })
            .select()
            .single();

          if (excavationFolderError) {
            console.error('Error creating excavation folder:', excavationFolderError);
          } else {
            createdFolders.set(excavationFolderName, excavationFolder.id);
            excavationFolderId = excavationFolder.id;
          }
        } else {
          excavationFolderId = createdFolders.get(excavationFolderName) || null;
        }
      }

      // Add Soil Excavation and Tape 1 Preparation tasks
      if (selectedExcavator) {
        if (totalSoilExcavation > 0) {
          const excavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, totalSoilExcavation);
          const transportTime = excavationOption === 'removal' && selectedCarrier
            ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, totalSoilExcavation)
            : 0;
          
          // Format the hours to 2 decimal places
          const totalHours = parseFloat((excavationTime + transportTime).toFixed(2));
          
          // Create task name with equipment details
          const equipmentDetails = selectedCarrier
            ? `(${selectedExcavator["size (in tones)"]}t digger and ${selectedCarrier["size (in tones)"]}t ${selectedCarrier.type === 'barrows_dumpers' ? 'barrow' : 'carrier'})`
            : `(${selectedExcavator["size (in tones)"]}t digger)`;
          
          // Find excavation task template with matching equipment
          const excavatorSize = selectedExcavator["size (in tones)"] || 0;
          const carrierSize = selectedCarrier ? selectedCarrier["size (in tones)"] || 0 : 0;
          const carrierType = selectedCarrier ? 
            (selectedCarrier.type === 'barrows_dumpers' ? 'barrow' : 'carrier') : '';

          // Log information for debugging
          console.log('DEBUG: Soil Excavation - Template search info:', {
            excavatorSize,
            carrierSize,
            carrierType,
            allTemplateNames: taskTemplates.map(t => t.name)
          });

          let excavationTaskTemplate = null;

          // Find matching task template for soil excavation
          if (selectedExcavator && selectedCarrier) {
            const excavatorSize = selectedExcavator["size (in tones)"] || 0;
            const carrierSize = selectedCarrier["size (in tones)"] || 0;
            const carrierType = selectedCarrier.type === 'barrows_dumpers' ? 'barrow' : 'carrier';

            // Search for template with both excavator and carrier
            excavationTaskTemplate = taskTemplates.find(template => {
              const name = (template.name || '').toLowerCase();
              const nameMatches = name.includes('excavation') && name.includes('soil');
              const diggerMatches = matchesDiggerSize(name, excavatorSize);
              const carrierMatches = name.includes(`${carrierSize}t`) && 
                                    (name.includes('barrow') || 
                                     name.includes('wheelbarrow') || 
                                     name.includes('carrier') || 
                                     name.includes('dumper'));
              
              const result = nameMatches && diggerMatches && carrierMatches;
              
              if (result) {
                // Get estimated hours from event_tasks_with_dynamic_estimates
                const estimatedHours = template.estimated_hours || template.calculated_estimated_hours || 0;
                setSoilExcavationHours(estimatedHours);
              }
              
              return result;
              });
          }

          // Find matching task template for tape1 preparation
          if (selectedExcavator && selectedTape1Carrier) {
            const excavatorSize = selectedExcavator["size (in tones)"] || 0;
            const carrierSize = selectedTape1Carrier["size (in tones)"] || 0;
            const carrierType = selectedTape1Carrier.type === 'barrows_dumpers' ? 'barrow' : 'carrier';

            let tape1TaskTemplate = null;
            
            // Search for template with both excavator and carrier
            tape1TaskTemplate = taskTemplates.find(template => {
              const name = (template.name || '').toLowerCase();
              const nameMatches = 
                name.includes('tape 1') || 
                name.includes('preparation') || 
                name.includes('type 1');
              const diggerMatches = matchesDiggerSize(name, excavatorSize);
              const carrierMatches = name.includes(`${carrierSize}t`) && 
                                   (name.includes('barrow') || 
                                    name.includes('wheelbarrow') || 
                                    name.includes('carrier') || 
                                    name.includes('dumper'));

              const result = nameMatches && diggerMatches && carrierMatches;
              
              if (result) {
                // Get estimated hours from event_tasks_with_dynamic_estimates
                const estimatedHours = template.estimated_hours || template.calculated_estimated_hours || 0;
                setTape1Hours(estimatedHours);
              }
              
              return result;
            });
          }

          if (!excavationTaskTemplate) {
            excavationTaskTemplate = taskTemplates.find(template => {
              const name = (template.name || '').toLowerCase();
              return name.includes('excavation') || name.includes('soil');
            });
            
            console.log('Found generic excavation template as last resort:', excavationTaskTemplate?.name || 'None');
          }

          // Create Soil Excavation task only if hours > 0
          if (totalHours > 0) {
            const { error: soilTaskError } = await supabase
              .from('tasks_done')
              .insert({
                event_id: event.id,
                user_id: user?.id,
                name: `Soil Excavation ${equipmentDetails}`,
                description: `Total soil to excavate: ${totalSoilExcavation.toFixed(2)} tonnes`,
                unit: 'tonnes',
                amount: `${totalSoilExcavation.toFixed(2)} tonnes`,
                hours_worked: totalHours,
                is_finished: false,
                event_task_id: excavationTaskTemplate?.id || null,
                folder_id: excavationFolderId,
                company_id: companyId
              });

            if (soilTaskError) {
              console.error('Error creating soil excavation task:', soilTaskError);
              throw new Error('Failed to create soil excavation task');
            }
          } else {
            console.log('Skipping soil excavation task with zero hours');
          }
        }

        if (totalTape1 > 0) {
          const tape1ExcavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, totalTape1);
          const tape1TransportTime = excavationOption === 'removal' && selectedCarrier
            ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, totalTape1)
            : 0;
          
          const totalTape1Hours = tape1ExcavationTime + tape1TransportTime;
          
          // Only create task if hours > 0
          if (totalTape1Hours > 0) {
          const equipmentDetails = selectedCarrier
            ? `(${selectedExcavator["size (in tones)"]}t digger and ${selectedCarrier["size (in tones)"]}t ${selectedCarrier.type === 'barrows_dumpers' ? 'barrow' : 'carrier'})`
            : `(${selectedExcavator["size (in tones)"]}t digger)`;
          
          // Find tape1 task template with matching equipment
          const excavatorSize = selectedExcavator["size (in tones)"] || 0;
          const carrierSize = selectedCarrier ? selectedCarrier["size (in tones)"] || 0 : 0;
          const carrierType = selectedCarrier ? 
            (selectedCarrier.type === 'barrows_dumpers' ? 'barrow' : 'carrier') : '';

          // Log information for debugging
          console.log('DEBUG: Tape1 Preparation - Template search info:', {
            excavatorSize,
            carrierSize,
            carrierType,
            allTemplateNames: taskTemplates.map(t => t.name)
          });

          let tape1TaskTemplate = null;

          if (selectedCarrier) {
            // Search for template with both excavator and carrier
            tape1TaskTemplate = taskTemplates.find(template => {
              const name = (template.name || '').toLowerCase();
              const nameMatches = 
                name.includes('tape 1') || 
                name.includes('preparation') || 
                name.includes('type 1');
              const diggerMatches = matchesDiggerSize(name, excavatorSize);
              const carrierMatches = name.includes(`${carrierSize}t`) && 
                                    (name.includes('barrow') || 
                                     name.includes('wheelbarrow') || 
                                     name.includes('carrier') || 
                                     name.includes('dumper'));
                
              return nameMatches && diggerMatches && carrierMatches;
            });

            // If no exact match, try matching with excavator size and carrier type
            if (!tape1TaskTemplate) {
              tape1TaskTemplate = taskTemplates.find(template => {
                const name = (template.name || '').toLowerCase();
                const isPreparation = 
                  name.includes('tape 1') || 
                  name.includes('preparation') || 
                  name.includes('type 1');
                const hasExcavatorSize = matchesDiggerSize(name, excavatorSize);
                const hasCarrierType = selectedCarrier.type === 'barrows_dumpers' 
                  ? (name.includes('barrow') || name.includes('wheelbarrow'))
                  : name.includes('carrier');
                
                // Match any carrier type
                const hasAnyCarrier = 
                  name.includes('barrows') || 
                  name.includes('dumper') || 
                  name.includes('petrol barrows') ||
                  name.includes('wheelbarrows');
                  
                return isPreparation && hasAnyCarrier;
              });
            }

            // If still no match, try a looser match with just excavator size and carrier type
            if (!tape1TaskTemplate) {
              tape1TaskTemplate = taskTemplates.find(template => {
                const name = (template.name || '').toLowerCase();
                const isPreparation = 
                  name.includes('tape 1') || 
                  name.includes('preparation') || 
                  name.includes('type 1');
                const hasExcavatorSize = matchesDiggerSize(name, excavatorSize);
                const hasAnyCarrier = 
                  name.includes('barrows') || 
                  name.includes('dumper') || 
                  name.includes('petrol barrows') ||
                  name.includes('wheelbarrows');
                
                return isPreparation && hasExcavatorSize && hasAnyCarrier;
              });
            }

            // Fall back to just matching preparation with excavator size
            if (!tape1TaskTemplate) {
              tape1TaskTemplate = taskTemplates.find(template => {
                const name = (template.name || '').toLowerCase();
                return (name.includes('tape 1') || name.includes('preparation') || name.includes('type 1')) && 
                       matchesDiggerSize(name, excavatorSize);
              });
            }
          } else {
            // Search for template with just excavator
            tape1TaskTemplate = taskTemplates.find(template => {
              const name = (template.name || '').toLowerCase();
              const nameMatches = 
                name.includes('tape 1') || 
                name.includes('preparation') || 
                name.includes('type 1');
              const diggerMatches = matchesDiggerSize(name, excavatorSize);
              const noCarrierMention = 
                !name.includes('barrows') && 
                !name.includes('dumper') && 
                !name.includes('petrol barrows') &&
                !name.includes('wheelbarrows');
              
              return nameMatches && diggerMatches && noCarrierMention;
            });

            // Fall back to just matching preparation with excavator size
            if (!tape1TaskTemplate) {
              tape1TaskTemplate = taskTemplates.find(template => {
                const name = (template.name || '').toLowerCase();
                return (name.includes('tape 1') || name.includes('preparation') || name.includes('type 1')) && 
                       matchesDiggerSize(name, excavatorSize);
              });
            }
          }

          // Absolute fallback - just find any preparation task if everything else fails
          if (!tape1TaskTemplate) {
            tape1TaskTemplate = taskTemplates.find(template => {
              const name = (template.name || '').toLowerCase();
              return name.includes('tape 1') || name.includes('preparation') || name.includes('type 1');
            });
          }

          // Create Tape 1 Preparation task
          console.log('DEBUG: Final tape1 preparation template used:', {
            templateName: tape1TaskTemplate?.name || 'No template found',
            templateId: tape1TaskTemplate?.id || 'No ID',
            excavatorSize,
            carrierSize,
            carrierType
          });

            const { error: tape1TaskError } = await supabase
              .from('tasks_done')
              .insert({
                event_id: event.id,
                user_id: user?.id,
                name: `Tape 1 Preparation ${equipmentDetails}`,
                description: `Total Type 1 aggregate to prepare: ${totalTape1.toFixed(2)} tonnes`,
                unit: 'tonnes',
                amount: `${totalTape1.toFixed(2)} tonnes`,
                hours_worked: totalTape1Hours,
                is_finished: false,
                event_task_id: tape1TaskTemplate?.id || null,
                folder_id: excavationFolderId,
                company_id: companyId
              });

            console.log('DEBUG: Final tape1 preparation template used:', {
              templateName: tape1TaskTemplate?.name || 'None',
              templateId: tape1TaskTemplate?.id || 'None',
              equipmentDetails,
              totalTape1,
              tape1ExcavationTime: tape1ExcavationTime,
              tape1TransportTime: tape1TransportTime
              });

            if (tape1TaskError) {
              console.error('Error creating tape 1 preparation task:', tape1TaskError);
              throw new Error('Failed to create tape 1 preparation task');
            }
          } else {
            console.log('Skipping tape 1 preparation task with zero hours');
          }
        }
      }

      // Process minor tasks
      for (const minorTask of minorTasks) {
        if (minorTask.template_id && minorTask.estimated_hours && minorTask.estimated_hours > 0) {
          // Create task in tasks_done only if hours > 0
          const { error: taskError } = await supabase
            .from('tasks_done')
            .insert({
              event_id: event.id,
              event_task_id: minorTask.template_id,
              user_id: user?.id,
              name: minorTask.name,
              description: minorTask.name || '',
              unit: minorTask.unit,
              amount: `${minorTask.quantity} ${minorTask.unit}`,
              hours_worked: minorTask.estimated_hours,
              is_finished: false,
              company_id: companyId
            });

          if (taskError) {
            console.error('Error creating minor task:', taskError);
            throw new Error('Failed to create minor task');
          }
        } else if (minorTask.template_id) {
          console.log('Skipping minor task with zero/missing hours:', {
            taskName: minorTask.name,
            hours: minorTask.estimated_hours
          });
        }

          // Process materials from minor task
          if (minorTask.results?.materials) {
            for (const material of minorTask.results.materials) {
              // Skip materials with zero or negative quantity
              if (!material.quantity || material.quantity <= 0) continue;

              const { error: materialError } = await supabase
                .from('materials_delivered')
                .insert({
                  event_id: event.id,
                  amount: 0,
                  total_amount: material.quantity,
                  unit: material.unit,
                  status: 'pending',
                  name: material.name,
                  company_id: freshCompanyId
                });

              if (materialError) {
                console.error('Error creating material:', materialError);
                throw new Error('Failed to create material');
              }
            }
          }
        }
      }

      // Process direct materials
      for (const material of materials) {
        if (material.template_id && material.quantity > 0) {
          const materialTemplate = materialTemplates.find(t => t.id === material.template_id);
          const { error: materialError } = await supabase
            .from('materials_delivered')
            .insert({
              event_id: event.id,
              amount: 0,
              total_amount: material.quantity,
              unit: material.unit || materialTemplate?.unit || '',
              status: 'pending',
              name: material.name || materialTemplate?.name || '',
              company_id: companyId
            });

          if (materialError) {
            console.error('Error creating material:', materialError);
            throw new Error('Failed to create material');
          }
        }
      }

      // Create invoice record for work pricing
      const invoiceMainTasks = mainTasks.map(task => ({
        id: task.id,
        name: task.name,
        description: '',
        results: task.results || {
          taskBreakdown: [],
          materials: []
        }
      }));

      const { error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          project_id: event.id,
          company_id: freshCompanyId,
          main_tasks: invoiceMainTasks,
          main_breakdown: [],
          main_materials: [],
          minor_tasks: minorTasks,
          extra_materials: [],
          totals: {
            totalHours: 0
          },
          additional_costs: []
        } as any);

      if (invoiceError) {
        console.error('Error creating invoice:', invoiceError);
        throw new Error('Failed to create invoice');
      }

      // Navigate to projects page on success
      navigate('/projects');
    } catch (error) {
      console.error('Error creating event:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while creating the event');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update the useEffect that calculates totals
  useEffect(() => {
    let soilTotal = 0;
    let tape1Total = 0;

    // Calculate from main tasks
    mainTasks.forEach(task => {
      if (task.results?.materials) {
        task.results.materials.forEach(material => {
          // Check for soil excavation
          if (material.name.toLowerCase().includes('soil')) {
            soilTotal += material.quantity;
          }
          // Check for tape1
          if (material.name.toLowerCase().includes('tape1') || 
              material.name.toLowerCase().includes('tape 1')) {
            tape1Total += material.quantity;
          }
        });
      }
      // Add totalTons if it exists (for soil excavation tasks)
      if (task.calculatorType === 'soil_excavation' && task.results?.totalTons) {
        soilTotal += task.results.totalTons;
      }
    });

    // Calculate from minor tasks
    minorTasks.forEach(task => {
      // Check if task name includes 'excavation' or 'preparation'
      const isExcavation = task.name.toLowerCase().includes('excavation');
      const isPreparation = task.name.toLowerCase().includes('preparation');

      if (task.results?.materials) {
        task.results.materials.forEach(material => {
          if (isExcavation && material.name.toLowerCase().includes('soil')) {
            // For excavation tasks, multiply by task quantity
            soilTotal += material.quantity * task.quantity;
          }
          if (isPreparation && (material.name.toLowerCase().includes('tape1') || 
              material.name.toLowerCase().includes('tape 1'))) {
            // For preparation tasks, multiply by task quantity
            tape1Total += material.quantity * task.quantity;
          }
        });
      } else if (isExcavation) {
        // If no materials but task is excavation, use quantity directly
        soilTotal += task.quantity;
      } else if (isPreparation) {
        // If no materials but task is preparation, use quantity directly
        tape1Total += task.quantity;
      }
    });

    setTotalSoilExcavation(soilTotal);
    setTotalTape1(tape1Total);
  }, [mainTasks, minorTasks]);

  // Update the total hours calculation to include minor tasks
  const calculateTotalHours = () => {
    let total = 0;

    // Add hours from main tasks
    mainTasks.forEach(task => {
      if (task.results?.taskBreakdown) {
        total += task.results.taskBreakdown.reduce((sum, breakdown) => sum + (breakdown.hours || 0), 0);
      }
    });

    // Add hours from minor tasks
    minorTasks.forEach(task => {
      if (task.results?.labor) {
        total += task.results.labor;
      } else if (task.estimated_hours) {
        total += task.estimated_hours * task.quantity;
      }
    });

    // Add additional excavation time if there is any
    if (extraSoilExcavation.area || extraSoilExcavation.weight) {
      const additionalTons = excavationMeasureType === 'area' 
        ? Number(extraSoilExcavation.area) * 1.5 // Convert m³ to tonnes (1.5 tonnes per m³)
        : Number(extraSoilExcavation.weight);

      if (additionalTons > 0 && selectedExcavator) {
        const excavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, additionalTons);
        const transportTime = excavationOption === 'removal' && selectedCarrier
          ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, additionalTons)
          : 0;
        total += excavationTime + transportTime;
      }
    }

    // Add soil excavation hours based on selected machinery
    if (selectedExcavator && totalSoilExcavation > 0) {
      const excavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, totalSoilExcavation);
      const transportTime = excavationOption === 'removal' && selectedCarrier
        ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, totalSoilExcavation)
        : 0;
      total += excavationTime + transportTime;
    }

    // Add tape 1 preparation hours based on selected machinery
    if (selectedExcavator && totalTape1 > 0) {
      const excavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, totalTape1);
      const transportTime = excavationOption === 'removal' && selectedCarrier
        ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, totalTape1)
        : 0;
      total += excavationTime + transportTime;
    }

    return total;
  };

  // Update the fetchEquipment function to use the correct table
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const companyId = useAuthStore.getState().getCompanyId();
        if (!companyId) return;
        
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
        
        setExcavators(excavatorData || []);
        setCarriers(carrierData || []);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    
    fetchEquipment();
  }, []);

  useEffect(() => {
    if (selectedExcavator && taskTemplates.length > 0) {
      const excavatorSize = selectedExcavator["size (in tones)"] || 0;
      const carrierSize = selectedCarrier?.["size (in tones)"] || 0;

      // Find soil excavation task template
      let soilExcavationTemplate = taskTemplates.find(template => {
        const name = (template.name || '').toLowerCase();
        const nameMatches = name.includes('excavation') && name.includes('soil');
        const diggerMatches = matchesDiggerSize(name, excavatorSize);
        const carrierMatches = excavationOption === 'removal' 
          ? (name.includes(`${carrierSize}t`) && 
             (name.includes('barrow') || 
              name.includes('wheelbarrow') || 
              name.includes('carrier') || 
              name.includes('dumper')))
          : true; // For pile, don't require carrier match

        return nameMatches && diggerMatches && carrierMatches;
      });

      // Fallback to generic soil excavation template
      if (!soilExcavationTemplate) {
        soilExcavationTemplate = taskTemplates.find(template => {
          const name = (template.name || '').toLowerCase();
          return name.includes('excavation') && name.includes('soil');
        });
      }

      // Calculate soil excavation hours using template or fallback
      if (soilExcavationTemplate && soilExcavationTemplate.estimated_hours && totalSoilExcavation > 0) {
        setSoilExcavationHours(soilExcavationTemplate.estimated_hours * totalSoilExcavation);
      } else {
        // Fallback to manual calculation
      const excavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, totalSoilExcavation);
      const transportTime = excavationOption === 'removal' && selectedCarrier
        ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, totalSoilExcavation)
        : 0;
      setSoilExcavationHours(excavationTime + transportTime);
      }

      // Find tape1 preparation task template
      let tape1Template = taskTemplates.find(template => {
        const name = (template.name || '').toLowerCase();
        const nameMatches = 
          name.includes('tape 1') || 
          name.includes('preparation') || 
          name.includes('type 1');
        const diggerMatches = matchesDiggerSize(name, excavatorSize);
        const carrierMatches = excavationOption === 'removal' 
          ? (name.includes(`${carrierSize}t`) && 
             (name.includes('barrow') || 
              name.includes('wheelbarrow') || 
              name.includes('carrier') || 
              name.includes('dumper')))
          : true; // For pile, don't require carrier match
        
        return nameMatches && diggerMatches && carrierMatches;
      });

      // Fallback to generic tape1 preparation template
      if (!tape1Template) {
        tape1Template = taskTemplates.find(template => {
          const name = (template.name || '').toLowerCase();
          return name.includes('tape 1') || name.includes('preparation') || name.includes('type 1');
        });
      }

      // Calculate tape1 preparation hours using template or fallback
      if (tape1Template && tape1Template.estimated_hours && totalTape1 > 0) {
        setTape1Hours(tape1Template.estimated_hours * totalTape1);
      } else {
        // Fallback to manual calculation
      const tape1ExcavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, totalTape1);
      const tape1TransportTime = excavationOption === 'removal' && selectedCarrier
        ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, totalTape1)
        : 0;
      setTape1Hours(tape1ExcavationTime + tape1TransportTime);
    }
    }
  }, [selectedExcavator, selectedCarrier, excavationOption, totalSoilExcavation, totalTape1, taskTemplates]);

  // Add useEffect for handling additional excavation
  useEffect(() => {
    const additionalSoil = excavationMeasureType === 'weight' 
      ? Number(extraSoilExcavation.weight) || 0
      : Number(extraSoilExcavation.area) * 1.5; // Assuming 1.5 tonnes per square meter, adjust as needed
    
    setTotalSoilExcavation(prev => {
      const baseAmount = mainTasks.reduce((total, task) => {
        if (task.results?.materials) {
          task.results.materials.forEach(material => {
            if (material.name.toLowerCase().includes('soil')) {
              total += material.quantity;
            }
          });
        }
        return total;
      }, 0);
      
      return baseAmount + additionalSoil;
    });
  }, [extraSoilExcavation, excavationMeasureType, mainTasks]);

  // Add helper function for flexible digger size matching
  function matchesDiggerSize(templateName: string, excavatorSize: number): boolean {
    // Match patterns like "41-50T", "40t+", "3-5T", "1T"
    const regex = /([0-9]+)(?:-([0-9]+))?t\+?/gi;
    let match;
    while ((match = regex.exec(templateName.toLowerCase()))) {
      const min = parseInt(match[1], 10);
      const max = match[2] ? parseInt(match[2], 10) : null;
      if (max) {
        if (excavatorSize >= min && excavatorSize <= max) return true;
      } else if (templateName.includes('+')) {
        if (excavatorSize >= min) return true;
      } else {
        if (excavatorSize === min) return true;
      }
    }
    return false;
  }

  // Add handler for unspecified material
  const handleAddUnspecifiedMaterial = (materialData: {
    name: string;
    total_amount: number;
    unit: string;
    price_per_unit: number;
  }) => {
    const newMaterial = {
      template_id: 'custom',
      name: materialData.name,
      quantity: materialData.total_amount,
      unit: materialData.unit,
      price: materialData.price_per_unit,
      confirmed: true
    };
    setMaterials(prev => [...prev, newMaterial]);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
        <BackButton />
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create New Project</h1>
          <button
          onClick={handleSubmit}
          disabled={isSubmitting || !formData.title || !formData.start_date || !formData.end_date}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Plus className="w-5 h-5 mr-2" />
            {isSubmitting ? 'Creating...' : 'Create Event'}
          </button>
        </div>

        <div className="space-y-8">
          {/* Basic Information */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Basic Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as FormData['status'] }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="planned">Planned</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Date</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 cursor-pointer hover:bg-gray-50 transition-colors"
                    required
                    placeholder="dd/mm/yyyy"
                    ref={startDateRef}
                    onClick={() => handleDateInputClick(startDateRef)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">End Date</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 cursor-pointer hover:bg-gray-50 transition-colors"
                    min={formData.start_date}
                    required
                    placeholder="dd/mm/yyyy"
                    ref={endDateRef}
                    onClick={() => endDateRef.current?.showPicker?.()}
                  />
                </div>
              </div>

              <div className="flex space-x-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.has_equipment}
                    onChange={(e) => setFormData(prev => ({ ...prev, has_equipment: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">Requires Equipment</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.has_materials}
                    onChange={(e) => setFormData(prev => ({ ...prev, has_materials: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">Requires Materials</span>
                </label>
              </div>
            </div>
          </div>

          {/* Main Tasks Section */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Main Tasks</h2>
              <button
                onClick={() => setShowMainTaskModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
              >
              <Plus className="w-5 h-5" />
                Add Main Task
              </button>
            </div>

              {mainTasks.map((task, index) => (
            <div key={task.id} className="bg-gray-700 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-medium text-white">{task.name}</h3>
                    <button
                      onClick={() => {
                    const updatedTasks = mainTasks.filter((_, i) => i !== index);
                    setMainTasks(updatedTasks);
                  }}
                  className="text-gray-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  {task.results && (
                <>
                  {/* Task Breakdown */}
                  <div className="mb-4">
                    <h4 className="text-blue-300 mb-2">Task Breakdown:</h4>
                    {task.results.taskBreakdown?.map((breakdown, i) => (
                      <div key={i} className="flex justify-between text-gray-300">
                        <span>{breakdown.name || breakdown.task}</span>
                        <span>{breakdown.hours.toFixed(2)} hours</span>
                      </div>
                    ))}
                    <div className="mt-2 pt-2 border-t border-gray-600">
                      <div className="flex justify-between text-white font-medium">
                        <span>Total Labor Hours</span>
                        <span>
                          {task.results.taskBreakdown?.reduce((sum, breakdown) => sum + (breakdown.hours || 0), 0).toFixed(2) || '0.00'} hours
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Materials */}
                  <div>
                    <h4 className="text-blue-300 mb-2">Materials Required:</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="text-gray-400 text-sm">
                            <th className="text-left py-2">Material</th>
                            <th className="text-right py-2">Quantity</th>
                            <th className="text-left py-2">Unit</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-300">
                          {task.results.materials?.map((material, i) => (
                            <tr key={i}>
                              <td className="py-1">{material.name}</td>
                              <td className="text-right py-1">{material.quantity.toFixed(2)}</td>
                              <td className="pl-4 py-1">{material.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
                  )}
                </div>
              ))}
          </div>

          {/* Minor Tasks Section */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Minor Tasks</h2>
              <button
                onClick={handleAddMinorTask}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Minor Task
              </button>
            </div>

            <div className="space-y-4">
            {minorTasks
              .filter(task => !task.name.toLowerCase().includes('preparation') && !task.name.toLowerCase().includes('excavation'))
              .map((task, index) => (
                <div key={index} className="flex items-start space-x-4 bg-gray-50 p-4 rounded-lg">
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Task Type</label>
                      <select
                        value={task.template_id || ''}
                        onChange={(e) => {
                          const newTasks = [...minorTasks];
                          const selectedTemplate = taskTemplates.find(t => t.id === e.target.value);
                          newTasks[index] = {
                            ...newTasks[index],
                            template_id: e.target.value,
                            name: selectedTemplate?.name || '',
                            unit: selectedTemplate?.unit || '',
                            estimated_hours: selectedTemplate?.estimated_hours || 0,
                            results: null
                          };
                          setMinorTasks(newTasks);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      >
                        <option value="">Select a task type</option>
                      {taskTemplates
                        .filter(template => 
                          !(template.name || '').toLowerCase().includes('preparation') && 
                          !(template.name || '').toLowerCase().includes('excavation')
                        )
                        .map(template => (
                          <option key={template.id || 'unknown'} value={template.id || ''}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {task.template_id && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Task Name</label>
                          <input
                            type="text"
                            value={task.name}
                            onChange={(e) => {
                              const newTasks = [...minorTasks];
                              newTasks[index].name = e.target.value;
                              setMinorTasks(newTasks);
                            }}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Quantity</label>
                            <input
                              type="number"
                              min="1"
                              value={task.quantity}
                              onChange={(e) => {
                                const newTasks = [...minorTasks];
                                newTasks[index].quantity = parseInt(e.target.value) || 1;
                                newTasks[index].results = null;
                                setMinorTasks(newTasks);
                              }}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700">Unit</label>
                            <input
                              type="text"
                              value={task.unit}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                              readOnly
                            />
                          </div>
                        </div>

                        {task.estimated_hours && !task.results && (
                          <div className="text-sm text-gray-600">
                            Estimated time: {formatTime(task.estimated_hours * task.quantity)}
                          </div>
                        )}

                        {task.results && (
                          <div className="mt-4 space-y-2">
                            <div className="text-sm font-medium text-green-600">Task Accepted</div>
                            <div className="text-sm">
                              Labor Hours: {formatTime(task.results.labor)}
                            </div>
                            {task.results.materials.map((material, i) => (
                              <div key={i} className="text-sm">
                                {material.name}: {material.quantity} {material.unit}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleDeleteMinorTask(index)}
                      className="p-2 text-red-600 hover:text-red-700"
                      title="Delete Task"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Materials Section */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Materials</h2>
              <button
              onClick={() => setMaterials(prev => [...prev, { template_id: '', quantity: 1, confirmed: false }])}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Material
              </button>
            </div>

            <div className="space-y-4">
              {materials.map((material, index) => (
                <div key={index} className="flex items-start space-x-4 bg-gray-50 p-4 rounded-lg">
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Material Type</label>
                      <select
                        value={material.template_id}
                        onChange={(e) => {
                          if (e.target.value === 'other') {
                            const newMaterials = [...materials];
                            newMaterials.splice(index, 1);
                            setMaterials(newMaterials);
                            setShowUnspecifiedMaterialModal(true);
                            return;
                          }
                          const newMaterials = [...materials];
                        const selectedTemplate = materialTemplates.find(t => t.id === e.target.value);
                        newMaterials[index] = {
                          template_id: e.target.value,
                          quantity: newMaterials[index].quantity,
                          name: selectedTemplate?.name || '',
                          unit: selectedTemplate?.unit || '',
                          price: selectedTemplate?.price || undefined,
                          description: selectedTemplate?.description || '',
                          confirmed: false
                        };
                          setMaterials(newMaterials);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      disabled={material.confirmed}
                      >
                        <option value="">Select a material</option>
                        <option value="other" className="font-medium text-blue-600">Other (Custom Material)</option>
                        {materialTemplates.map(template => (
                          <option key={template.id} value={template.id}>
                          {template.name} ({template.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                  {material.description && (
                    <div className="text-sm text-gray-600">
                      {material.description}
                    </div>
                  )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={material.quantity}
                        onChange={(e) => {
                          const newMaterials = [...materials];
                          newMaterials[index].quantity = parseInt(e.target.value) || 1;
                        newMaterials[index].confirmed = false;
                          setMaterials(newMaterials);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      disabled={material.confirmed}
                      />
                    </div>

                  {material.price !== undefined && material.price !== null && (
                    <div className="text-sm text-gray-600">
                      Price per unit: £{material.price.toFixed(2)}
                    </div>
                  )}
                  </div>

                <div className="flex flex-col gap-2">
                  {!material.confirmed ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (!material.template_id || !material.quantity || material.quantity <= 0) return;
                          const newMaterials = [...materials];
                          newMaterials[index].confirmed = true;
                          setMaterials(newMaterials);
                        }}
                        disabled={!material.template_id || !material.quantity || material.quantity <= 0}
                        className="p-2 text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Confirm Material"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newMaterials = [...materials];
                      newMaterials.splice(index, 1);
                      setMaterials(newMaterials);
                    }}
                        className="p-2 text-red-600 hover:text-red-700"
                        title="Delete Material"
                  >
                    <X className="w-5 h-5" />
                  </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const newMaterials = [...materials];
                        newMaterials[index].confirmed = false;
                        setMaterials(newMaterials);
                      }}
                      className="p-2 text-blue-600 hover:text-blue-700"
                      title="Edit Material"
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                  )}
                </div>
                </div>
              ))}
            </div>
          </div>

        {/* Shared Equipment Selection */}
        <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Equipment Selection</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Excavation Machinery</label>
              <div className="space-y-2">
                {excavators.length === 0 ? (
                  <p className="text-gray-500">No excavators found</p>
                ) : (
                  excavators.map((excavator) => (
                    <div 
                      key={excavator.id}
                      className="flex items-start p-2 cursor-pointer hover:bg-gray-50 rounded-md"
                      onClick={() => setSelectedExcavator(excavator)}
                    >
                      <div className={`w-4 h-4 rounded-full border mr-2 mt-0.5 flex-shrink-0 ${
                        selectedExcavator?.id === excavator.id 
                          ? 'border-gray-400' 
                          : 'border-gray-400'
                      }`}>
                        <div className={`w-2 h-2 rounded-full m-0.5 ${
                          selectedExcavator?.id === excavator.id 
                            ? 'bg-gray-400' 
                            : 'bg-transparent'
                        }`}></div>
                      </div>
                      <div>
                        <div className="text-gray-800">{excavator.name}</div>
                        <div className="text-sm text-gray-600">({excavator["size (in tones)"]} tons)</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {/* Only show Carrier Machinery for "Removal" option */}
            {excavationOption === 'removal' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Carrier Machinery</label>
                <div className="space-y-2">
                  {carriers.length === 0 ? (
                    <p className="text-gray-500">No carriers found</p>
                  ) : (
                    carriers.map((carrier) => (
                      <div 
                        key={carrier.id}
                        className="flex items-start p-2 cursor-pointer hover:bg-gray-50 rounded-md"
                        onClick={() => setSelectedCarrier(carrier)}
                      >
                        <div className={`w-4 h-4 rounded-full border mr-2 mt-0.5 flex-shrink-0 ${
                          selectedCarrier?.id === carrier.id 
                            ? 'border-gray-400' 
                            : 'border-gray-400'
                        }`}>
                          <div className={`w-2 h-2 rounded-full m-0.5 ${
                            selectedCarrier?.id === carrier.id 
                              ? 'bg-gray-400' 
                              : 'bg-transparent'
                          }`}></div>
                        </div>
                        <div>
                          <div className="text-gray-800">{carrier.name}</div>
                          <div className="text-sm text-gray-600">({carrier["size (in tones)"]} tons)</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              // Empty div to maintain the grid layout when Carrier Machinery is hidden
              <div></div>
            )}
          </div>
        </div>

        {/* Soil Excavation Section */}
        <div className="mb-8 bg-gray-800 p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-semibold text-white mb-4">Soil Excavation</h2>
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-300">
              Based on all your tasks, amount of soil to be excavated will be approximately: {totalSoilExcavation.toFixed(2)} tonnes
            </p>
            <p className="text-gray-300">
              Estimated Time: <span className="font-medium">{formatTime(soilExcavationHours)}</span>
            </p>
          </div>

          {/* Excavation Options */}
          <div className="mt-4 mb-6">
            <h3 className="text-lg font-medium text-gray-800 mb-2">Excavation Type</h3>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="excavationOption"
                  value="removal"
                  checked={excavationOption === 'removal'}
                  onChange={(e) => setExcavationOption(e.target.value as 'removal' | 'pile')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Soil Excavation and Removal</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="excavationOption"
                  value="pile"
                  checked={excavationOption === 'pile'}
                  onChange={(e) => setExcavationOption(e.target.value as 'removal' | 'pile')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Soil Excavation and Pile Up</span>
              </label>
            </div>
          </div>
              
              <div className="mt-4">
            <h3 className="text-lg font-medium text-gray-800 mb-2">
              Additional Excavation <span className="text-sm font-normal text-gray-600">(We calculate amount of soil to be excavated based for every single main tasks but if there is any exceeded amount of soil which is above final level of any of main tasks please describe it here)</span>

            </h3>
            
            <div className="space-y-4">
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="excavationMeasureType"
                    value="area"
                    checked={excavationMeasureType === 'area'}
                    onChange={(e) => setExcavationMeasureType(e.target.value as 'area' | 'weight')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Area (m³)</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="excavationMeasureType"
                    value="weight"
                    checked={excavationMeasureType === 'weight'}
                    onChange={(e) => setExcavationMeasureType(e.target.value as 'area' | 'weight')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Weight (tonnes)</span>
                </label>
              </div>

              {excavationMeasureType === 'area' ? (
                    <input
                      type="number"
                      value={extraSoilExcavation.area}
                  onChange={(e) => setExtraSoilExcavation(prev => ({ ...prev, area: e.target.value, weight: '' }))}
                  placeholder="Enter area in m²"
                  className="block w-full rounded-md border-gray-300 bg-gray-700 text-white placeholder-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-lg py-3"
                    />
              ) : (
                    <input
                      type="number"
                      value={extraSoilExcavation.weight}
                  onChange={(e) => setExtraSoilExcavation(prev => ({ ...prev, weight: e.target.value, area: '' }))}
                  placeholder="Enter weight in tonnes"
                  className="block w-full rounded-md border-gray-300 bg-gray-700 text-white placeholder-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-lg py-3"
                    />
              )}
                </div>
              </div>

              {/* Soil Excavation Results */}
              {mainTasks.some(task => task.calculatorType === 'soil_excavation' && task.results) && (
                <div className="mt-6 border-t pt-6">
                  <h3 className="text-lg font-medium text-gray-800 mb-4">Excavation Details</h3>
                  <div className="space-y-6">
                    {mainTasks
                      .filter(task => task.calculatorType === 'soil_excavation' && task.results)
                      .map((task, index) => (
                        <div key={index} className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="font-medium text-gray-900 mb-3">{task.name}</h4>
                          <div className="space-y-4">
                            {task.results?.totalTons && (
                              <div className="text-sm">
                                <span className="font-medium">Total Soil:</span> {task.results.totalTons.toFixed(2)} tonnes
                              </div>
                            )}
                            {task.results?.excavationTime && (
                              <div className="text-sm">
                                <span className="font-medium">Excavation Time:</span> {formatTime(task.results.excavationTime)}
                              </div>
                            )}
                            {task.results?.transportTime && (
                              <div className="text-sm">
                                <span className="font-medium">Transport Time:</span> {formatTime(task.results.transportTime)}
                              </div>
                            )}
                            {task.results?.totalTime && (
                              <div className="text-sm">
                                <span className="font-medium">Total Time:</span> {formatTime(task.results.totalTime)}
                              </div>
                            )}
                            {task.results?.equipmentUsed && (
                              <div className="text-sm space-y-1">
                                <div className="font-medium">Equipment Used:</div>
                                {task.results.equipmentUsed.excavator && (
                                  <div>Excavator: {task.results.equipmentUsed.excavator}</div>
                                )}
                                {task.results.equipmentUsed.carrier && (
                                  <div>Carrier: {task.results.equipmentUsed.carrier}</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

        {/* Tape 1 Preparation Section */}
        <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Tape 1 Preparation</h2>
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-300">
              Based on all your tasks, amount of Tape 1 will be approximately: {totalTape1.toFixed(2)} tonnes
            </p>
            <p className="text-gray-300">
              Estimated Time: <span className="font-medium">{formatTime(tape1Hours)}</span>
            </p>
            </div>
          </div>

          {/* Results Section */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Total Results</h2>
          
          {/* Total Hours */}
          <div className="mb-6">
            <div className="flex justify-between text-white font-medium">
              <span>Total Labor Hours</span>
              <span>{calculateTotalHours().toFixed(2)} hours</span>
                          </div>
                            </div>

          {/* Combined Materials Table */}
          <div>
            <h3 className="text-blue-300 mb-2">Total Materials Required:</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-gray-400 text-sm">
                    <th className="text-left py-2">Material</th>
                    <th className="text-right py-2">Quantity</th>
                    <th className="text-left py-2">Unit</th>
                    <th className="text-right py-2">Price/Unit</th>
                    <th className="text-right py-2">Total Price</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {mainTasks.reduce((materials, task) => {
                    // Process main task materials
                    if (task.results?.materials) {
                      task.results.materials.forEach(material => {
                        const existingMaterial = materials.find(m => 
                          m.name === material.name && m.unit === material.unit
                        );
                        
                        // Find material price from materials table
                        const materialFromTable = materialTemplates?.find(m => m.name === material.name);
                        const pricePerUnit = materialFromTable?.price ?? 0;
                        const quantity = material.quantity ?? 0;
                        
                        if (existingMaterial) {
                          existingMaterial.quantity = (existingMaterial.quantity ?? 0) + quantity;
                          existingMaterial.totalPrice = existingMaterial.quantity * pricePerUnit;
                        } else {
                          materials.push({ 
                            ...material,
                            quantity,
                            pricePerUnit,
                            totalPrice: quantity * pricePerUnit,
                            description: materialFromTable?.description || undefined
                          });
                        }
                      });
                    }

                    // Process additional excavation if this is the last task
                    if (task === mainTasks[mainTasks.length - 1]) {
                      if (extraSoilExcavation.area || extraSoilExcavation.weight) {
                        const additionalTons = excavationMeasureType === 'area' 
                          ? Number(extraSoilExcavation.area) * 1.5 // Convert area to tonnes (1.5 tonnes per m³)
                          : Number(extraSoilExcavation.weight);

                        if (additionalTons > 0) {
                          const soilMaterial = materialTemplates?.find(m => m.name.toLowerCase().includes('soil'));
                          const pricePerUnit = soilMaterial?.price || 0;
                          
                          // Find existing soil excavation material
                          const existingSoilMaterial = materials.find(m => 
                            m.name.toLowerCase().includes('soil') && m.unit === 'tonnes'
                          );

                          if (existingSoilMaterial) {
                            existingSoilMaterial.quantity += additionalTons;
                            existingSoilMaterial.totalPrice = existingSoilMaterial.quantity * pricePerUnit;
                          } else {
                            materials.push({
                              name: 'Soil Excavation',
                              quantity: additionalTons,
                              unit: 'tonnes',
                              pricePerUnit,
                              totalPrice: additionalTons * pricePerUnit,
                              description: soilMaterial?.description || undefined
                            });
                          }
                        }
                      }
                    }
                    
                    return materials;
                  }, [] as { name: string; quantity: number; unit: string; pricePerUnit: number; totalPrice: number; description?: string }[])
                  .concat(
                    // Add materials from minor tasks
                    minorTasks.reduce((materials, task) => {
                      if (task.results?.materials) {
                        task.results.materials.forEach(material => {
                          const existingMaterial = materials.find(m => 
                            m.name === material.name && m.unit === material.unit
                          );
                          
                          // Find material price from materials table
                          const materialFromTable = materialTemplates?.find(m => m.name === material.name);
                          const pricePerUnit = materialFromTable?.price ?? 0;
                          const quantity = material.quantity ?? 0;
                          
                          if (existingMaterial) {
                            existingMaterial.quantity = (existingMaterial.quantity ?? 0) + quantity;
                            existingMaterial.totalPrice = existingMaterial.quantity * pricePerUnit;
                          } else {
                            materials.push({ 
                              ...material,
                              quantity,
                              pricePerUnit,
                              totalPrice: quantity * pricePerUnit,
                              description: materialFromTable?.description || undefined
                            });
                          }
                        });
                      }
                      return materials;
                    }, [] as { name: string; quantity: number; unit: string; pricePerUnit: number; totalPrice: number; description?: string }[])
                  )
                  // Add directly added confirmed materials
                  .concat(
                    materials
                      .filter(material => material.confirmed)
                      .map(material => {
                        const materialFromTable = materialTemplates?.find(t => t.id === material.template_id);
                        const pricePerUnit = materialFromTable?.price ?? 0;
                        return {
                          name: material.name || materialFromTable?.name || '',
                          quantity: material.quantity,
                          unit: material.unit || materialFromTable?.unit || '',
                          pricePerUnit,
                          totalPrice: material.quantity * pricePerUnit,
                          description: material.description || materialFromTable?.description || undefined
                        };
                      })
                  )
                  .reduce((merged, material) => {
                    // Merge any duplicate materials after concatenation
                    const existingMaterial = merged.find(m => 
                      m.name === material.name && m.unit === material.unit
                    );
                    
                    if (existingMaterial) {
                      existingMaterial.quantity += material.quantity;
                      existingMaterial.totalPrice = existingMaterial.quantity * existingMaterial.pricePerUnit;
                    } else {
                      merged.push(material);
                    }
                    
                    return merged;
                  }, [] as { name: string; quantity: number; unit: string; pricePerUnit: number; totalPrice: number; description?: string; category?: string }[])
                  .map((material, i) => (
                    <tr key={i}>
                      <td className="py-1">
                        <div>{material.name}</div>
                        {material.description && <div className="text-sm text-gray-400">{material.description}</div>}
                        {material.category && <div className="text-sm text-gray-400">Category: {material.category}</div>}
                      </td>
                      <td className="text-right py-1">{(material.quantity ?? 0).toFixed(2)}</td>
                      <td className="pl-4 py-1">{material.unit}</td>
                      <td className="text-right py-1">£{(material.pricePerUnit ?? 0).toFixed(2)}</td>
                      <td className="text-right py-1">£{(material.totalPrice ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Bottom Action Buttons */}
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.title || !formData.start_date || !formData.end_date}
            className="flex items-center px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-medium"
          >
            <Plus className="w-5 h-5 mr-2" />
            {isSubmitting ? 'Creating...' : 'Create Event'}
          </button>
        </div>
      </div>

      {showMainTaskModal && (
        <MainTaskModal
          onClose={() => setShowMainTaskModal(false)}
          onAddTask={handleAddMainTask}
          calculatorGroups={calculatorGroups}
        />
      )}

      {showCalculatorModal && selectedMainTask && (
        <CalculatorModal
          calculatorType={selectedMainTask.calculatorType}
          calculatorSubType={selectedMainTask.calculatorSubType}
          onClose={() => {
            setShowCalculatorModal(false);
            setSelectedMainTask(null);
          }}
          onSaveResults={handleSaveCalculatorResults}
          calculateTransport={calculateTransport}
          setCalculateTransport={setCalculateTransport}
          selectedTransportCarrier={selectedTransportCarrier}
          setSelectedTransportCarrier={setSelectedTransportCarrier}
          transportDistance={transportDistance}
          setTransportDistance={setTransportDistance}
          carriers={carriers}
          selectedExcavator={selectedExcavator}
        />
      )}

      {showNamePrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Enter Task Name</h3>
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Enter task name"
              className="w-full p-2 border rounded mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setTaskName('');
                  setTempMainTask(null);
                  setShowNamePrompt(false);
                }}
                className="px-4 py-2 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTaskName}
                disabled={!taskName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showUnspecifiedMaterialModal && (
        <UnspecifiedMaterialModal
          onClose={() => setShowUnspecifiedMaterialModal(false)}
          onSave={handleAddUnspecifiedMaterial}
          projects={[{
            id: 'new',
            title: 'New Project'
          }]}
        />
      )}
    </div>
  );
};

export default ProjectCreating;
