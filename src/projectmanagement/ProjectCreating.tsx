import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Plus, X, AlertCircle, Loader2, Check, Pencil, Wrench, Trash2 } from 'lucide-react';
import PageInfoModal from '../components/PageInfoModal';
import BackButton from '../components/BackButton';
import MainTaskModal from './MainTaskModal';
import CalculatorModal from './CalculatorModal';
import UnspecifiedMaterialModal from '../components/UnspecifiedMaterialModal';
import { getMaterialCapacity, DEFAULT_CARRIER_SPEED_M_PER_H } from '../constants/materialCapacity';
import { translateTaskName, translateMaterialName, translateMaterialDescription, translateUnit } from '../lib/translationMap';
import { colors, fontSizes, fontWeights, spacing, radii } from '../themes/designTokens';
import { Card, Button } from '../themes/uiComponents';
import DatePicker from '../components/DatePicker';

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
  speed_m_per_hour?: number | null;
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
  const { t } = useTranslation(['project', 'form', 'utilities', 'common', 'nav', 'calculator', 'material', 'units']);
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

  // Add state for project equipment
  const [projectEquipment, setProjectEquipment] = useState<{
    equipment_id: string;
    quantity: number;
    start_date?: string;
    end_date?: string;
    equipment?: any;
  }[]>([]);
  const [showAddEquipmentModal, setShowAddEquipmentModal] = useState(false);
  const [selectedEquipmentToAdd, setSelectedEquipmentToAdd] = useState<any | null>(null);
  const [equipmentQuantity, setEquipmentQuantity] = useState(1);
  const [equipmentStartDate, setEquipmentStartDate] = useState('');
  const [equipmentEndDate, setEquipmentEndDate] = useState('');
  const [editingEquipmentIndex, setEditingEquipmentIndex] = useState<number | null>(null);
  const [equipmentConflict, setEquipmentConflict] = useState<{ conflictingDates: string[]; event: any } | null>(null);

  // Add new state variables for equipment selection
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [soilExcavationHours, setSoilExcavationHours] = useState(0);
  const [tape1Hours, setTape1Hours] = useState(0);
  const [excavationMeasureType, setExcavationMeasureType] = useState<'area' | 'weight'>('area');
  const [soilTransportDistance, setSoilTransportDistance] = useState('0');
  const [tape1TransportDistance, setTape1TransportDistance] = useState('0');

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

  // Fetch all equipment for adding to project
  const { data: allEquipment = [], isLoading: isAllEquipmentLoading } = useQuery({
    queryKey: ['all_equipment', useAuthStore.getState().getCompanyId(), showAddEquipmentModal],
    queryFn: async () => {
      const companyId = useAuthStore.getState().getCompanyId();
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('company_id', companyId || '')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: showAddEquipmentModal
  });

  // Check equipment availability for selected dates
  const { data: equipmentConflictData } = useQuery({
    queryKey: ['equipment_conflict', selectedEquipmentToAdd?.id, equipmentStartDate, equipmentEndDate],
    queryFn: async () => {
      if (!selectedEquipmentToAdd?.id || !equipmentStartDate || !equipmentEndDate) return null;

      const companyId = useAuthStore.getState().getCompanyId();
      
      // Fetch equipment usage for this equipment that overlaps with selected dates
      const { data, error } = await supabase
        .from('equipment_usage')
        .select('id, start_date, end_date, quantity, events(id, title)')
        .eq('equipment_id', selectedEquipmentToAdd.id)
        .eq('company_id', companyId || '')
        // Equipment is busy if it ends after our start date AND starts before our end date
        .gte('end_date', equipmentStartDate)
        .lte('start_date', equipmentEndDate);

      if (error) throw error;
      
      if (data && data.length > 0) {
        // Check if quantity is sufficient
        const totalReserved = data.reduce((sum, usage) => sum + usage.quantity, 0);
        const availableQuantity = selectedEquipmentToAdd.quantity - totalReserved;
        
        if (availableQuantity < equipmentQuantity) {
          return {
            conflicting: true,
            usages: data,
            availableQuantity
          };
        }
      }
      
      return { conflicting: false, usages: [] };
    },
    enabled: !!selectedEquipmentToAdd?.id && !!equipmentStartDate && !!equipmentEndDate
  });

  // Fetch excavators and carriers from setup_digging
  const { data: excavators = [] } = useQuery({
    queryKey: ['excavators', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setup_digging')
        .select('*')
        .eq('type', 'excavator')
        .eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId
  });

  const { data: carriers = [] } = useQuery({
    queryKey: ['carriers', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setup_digging')
        .select('*')
        .eq('type', 'barrows_dumpers')
        .eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId
  });

  // Calculator groups from Calculator.tsx, excluding specified ones
  const calculatorGroups = [
    {
      type: 'aggregate',
      label: t('nav:aggregate_calculator'),
      subTypes: [
        { type: 'type1', label: t('nav:preparation') },
        { type: 'soil_excavation', label: t('nav:soil_excavation') }
      ]
    },
    {
      type: 'paving',
      label: t('nav:paving_calculator'),
      subTypes: [
        { type: 'default', label: t('nav:monoblock_paving') }
      ]
    },
    {
      type: 'wall',
      label: t('project:wall_finish_calc'),
      subTypes: [
        { type: 'brick', label: t('nav:brick_wall_calculator') },
        { type: 'double_wall', label: t('nav:double_wall_calculator') },
        { type: 'block4', label: t('nav:block4_wall_calculator') },
        { type: 'block7', label: t('nav:block7_wall_calculator') },
        { type: 'sleeper', label: t('nav:sleeper_wall_calculator') }
      ]
    },
    {
      type: 'kerbs',
      label: t('nav:kerbs_edges_calculator'),
      subTypes: [
        { type: 'kl', label: t('nav:kl_kerbs') },
        { type: 'rumbled', label: t('nav:rumbled_kerbs') },
        { type: 'flat', label: t('nav:flat_edges') },
        { type: 'sets', label: t('nav:sets') }
      ]
    },
    {
      type: 'slab',
      label: t('nav:slab_calculator'),
      subTypes: [
        { type: 'default', label: t('nav:slab_calculator') },
        { type: 'concreteSlabs', label: t('nav:concrete_slabs_calculator') }
      ]
    },
    {
      type: 'fence',
      label: t('nav:fence_calculator'),
      subTypes: [
        { type: 'vertical', label: t('nav:vertical_fence') },
        { type: 'horizontal', label: t('nav:horizontal_fence') },
        { type: 'venetian', label: t('nav:venetian_fence_calculator') },
        { type: 'composite', label: t('nav:composite_fence_calculator') },
      ]
    },
    {
      type: 'steps',
      label: t('nav:steps_calculator'),
      subTypes: [
        { type: 'standard', label: t('nav:standard_stairs') },
        { type: 'l_shape', label: t('nav:l_shape_stairs') },
        { type: 'u_shape', label: t('nav:u_shape_stairs') }
      ]
    },
    {
      type: 'grass',
      label: t('nav:artificial_grass_calculator'),
      subTypes: [
        { type: 'default', label: t('nav:artificial_grass') }
      ]
    },
    {
      type: 'turf',
      label: t('nav:natural_turf_calculator'),
      subTypes: [
        { type: 'default', label: t('nav:natural_turf') }
      ]
    },
    {
      type: 'tile',
      label: t('nav:wall_finish_calculator'),
      subTypes: [
        { type: 'default', label: t('nav:tile_installation_calculator') },
        { type: 'coping', label: t('nav:coping_installation_calculator') }
      ]
    },
    {
      type: 'foundation',
      label: t('nav:foundation_calculator'),
      subTypes: [
        { type: 'default', label: t('nav:foundation_excavation') }
      ]
    },
    {
      type: 'groundwork',
      label: t('nav:groundwork_linear'),
      subTypes: [
        { type: 'drainage', label: t('nav:groundwork_drainage') },
        { type: 'canalPipe', label: t('nav:groundwork_canal_pipe') },
        { type: 'waterPipe', label: t('nav:groundwork_water_pipe') },
        { type: 'cable', label: t('nav:groundwork_cable') }
      ]
    },
    {
      type: 'deck',
      label: t('nav:deck_calculator'),
      subTypes: [
        { type: 'default', label: t('nav:decking_standard') },
        { type: 'composite_deck', label: t('nav:composite_decking') },
      ]
    }
  ].sort((a, b) => a.label.localeCompare(b.label))
   .map(calc => ({
     ...calc,
     subTypes: [...calc.subTypes].sort((a, b) => a.label.localeCompare(b.label))
   }));

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
          // Skip excavated soil from Foundation calculator - it's self-contained  
          if (selectedMainTask.calculatorType === 'foundation' && material.name.toLowerCase().includes('excavated')) {
            return;
          }
          // Skip excavated soil from Wall calculators when foundation is included - it's self-contained
          if (selectedMainTask.calculatorType === 'wall' && 
              results.includeFoundation && material.name.toLowerCase().includes('excavated')) {
            return;
          }
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
        // Foundation excavation is NOT added to totalSoilExcavation - it's self-contained
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
      
      // If no exact match and it's a cutting task, try specialized matching
      if (!matchingTemplate && normalizeTaskName(task.name).includes('cutting')) {
        matchingTemplate = findCuttingTemplate(task.name);
      }
      
      // Only if still no match, try includes matching
      if (!matchingTemplate) {
        matchingTemplate = taskTemplates.find(template => 
          template.name && normalizeTaskName(template.name || '').includes(normalizeTaskName(task.name))
        );
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
  // NEW SYSTEM: Calculate transport time with distance and carrier speed from database
  const calculateTransportTimeWithDistance = (
    carrierSize: number,
    totalTons: number,
    distanceMeters: number,
    carrierSpeed: number
  ) => {
    // Use carrier speed from database (not hardcoded)
    const speed = carrierSpeed || DEFAULT_CARRIER_SPEED_M_PER_H; // Fallback if not set (1t baseline m/h)
    
    // Get material capacity
    const materialCapacityTons = getMaterialCapacity('soil', carrierSize);
    
    // Calculate number of trips
    const trips = Math.ceil(totalTons / materialCapacityTons);
    
    // Calculate time per trip (round trip: distance * 2)
    const timePerTrip = (distanceMeters * 2) / speed; // in hours
    
    // Total transport time
    const totalTransportTime = trips * timePerTrip;
    
    return totalTransportTime;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Get fresh companyId from store
      const freshCompanyId = useAuthStore.getState().getCompanyId();
      
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

          // Create a task for each item in the task breakdown
          for (const taskItem of mainTask.results.taskBreakdown) {
            const taskName = taskItem.task;

            // Determine if we're dealing with porcelain or sandstone
            let matchingTaskTemplateId = null;
            let actualTaskName = taskName;

            // Special handling for Foundation Excavation - map to specific excavation method
            if (taskName.toLowerCase() === 'foundation excavation' && mainTask.calculatorType === 'foundation') {
              // Get the digging method from results - if available
              const diggingMethod = mainTask.results.diggingMethod || 'shovel';
              const excavationMethodMap = {
                'shovel': 'Excavating foundation with shovel',
                'small': 'Excavating foundation with with small excavator',
                'medium': 'Excavating foundation with with medium excavator',
                'large': 'Excavating foundation with with big excavator'
              };
              actualTaskName = excavationMethodMap[diggingMethod as keyof typeof excavationMethodMap] || 'Excavating foundation with shovel';
            }

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
              }
            }

            if (!matchingTemplate) {
              console.warn('WARNING: No template found for task:', actualTaskName, '- event_task_id will be NULL');
            } 

            // Use event_task_id from taskItem if available (calculator already found it), otherwise use matched template
            matchingTaskTemplateId = taskItem.event_task_id || matchingTemplate?.id || null;

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

              if (taskError) {
                console.error('Error creating task:', taskError);
                throw new Error('Failed to create task');
              }
            }
          }

          // Add "Loading Sand" task if excavator is selected and sand is present
          if (selectedExcavator && mainTask.results.materials) {
            const sandMaterial = mainTask.results.materials.find((m: any) => 
              m.name && m.name.toLowerCase().includes('sand')
            );
            
            if (sandMaterial && sandMaterial.quantity > 0) {
              // Get sand amount
              const sandAmount = sandMaterial.quantity || 0;
              // Find loading sand time estimate based on excavator size
              const excavatorSize = selectedExcavator["size (in tones)"] || 0;
              const loadingSandDiggerTimeEstimates = [
                { equipment: 'Shovel (1 Person)', sizeInTons: 0.02, timePerTon: 0.5 },
                { equipment: 'Digger 0.5T', sizeInTons: 0.5, timePerTon: 0.36 },
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

              }
          }
        } else if (mainTask.results) {
          // If no task breakdown but we have results, create a single task
          const taskName = mainTask.name || mainTask.results.name || 'Unnamed Task';

          // Find matching task template for the main task
          const matchingTemplate = taskTemplates.find(template => 
            template.name && taskName &&
            (template.name || '').trim().toLowerCase().includes(taskName.trim().toLowerCase())
          );
          const matchingTaskTemplateId = matchingTemplate?.id || null;

          // If mainTask.results doesn't have taskBreakdown, create a single task only if hours > 0
          if (!mainTask.results.taskBreakdown || mainTask.results.taskBreakdown.length === 0) {
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
              company_id: companyId,
              color: '#8B5CF6', // Purple color for excavation folder
              sort_order: -1 // Put excavation folder first
            })
            .select()
            .single();

          if (excavationFolderError) {
            console.error('Error creating excavation folder:', excavationFolderError);
            throw new Error('Failed to create excavation folder');
          } else {
            createdFolders.set(excavationFolderName, excavationFolder.id);
            excavationFolderId = excavationFolder.id;
          }
        } else {
          excavationFolderId = createdFolders.get(excavationFolderName) || null;
        }
      }

      // Add Soil Excavation and Transport tasks (NEW SYSTEM - separate tasks)
      if (selectedExcavator) {
        if (totalSoilExcavation > 0) {
          // Find excavation task template by exact name pattern
          const excavationTaskTemplate = taskTemplates.find(template => {
            const name = (template.name || '').toLowerCase();
            return name.includes('excavation soil') && 
                   name.includes(selectedExcavator.name.toLowerCase()) &&
                   name.includes(`(${selectedExcavator["size (in tones)"]}t)`);
          });
          
          // Calculate excavation hours from template
          const excavationHours = excavationTaskTemplate?.estimated_hours 
            ? totalSoilExcavation * excavationTaskTemplate.estimated_hours
            : 0;
          
          // Create Excavation task (always create, even if template not found)
          const { error: excavationError } = await supabase
            .from('tasks_done')
            .insert({
              event_id: event.id,
              user_id: user?.id,
              name: `Excavation soil with ${selectedExcavator.name} (${selectedExcavator["size (in tones)"]}t)`,
              description: `Total soil to excavate: ${totalSoilExcavation.toFixed(2)} tonnes${!excavationTaskTemplate ? ' (Warning: Template not found, hours estimated at 0)' : ''}`,
              unit: 'tonnes',
              amount: `${totalSoilExcavation.toFixed(2)} tonnes`,
              hours_worked: excavationHours,
              is_finished: false,
              event_task_id: excavationTaskTemplate?.id || null,
              folder_id: excavationFolderId,
              company_id: companyId
            });
          
          if (excavationError) {
            console.error('Error creating excavation task:', excavationError);
            throw new Error('Failed to create excavation task');
          }
          
          // Create Transport task (dynamic, no template) - only if distance > 0
          if (selectedCarrier) {
            const distance = parseFloat(soilTransportDistance) || 0;
            
            if (distance > 0) {
              const carrierSpeed = selectedCarrier.speed_m_per_hour || DEFAULT_CARRIER_SPEED_M_PER_H;
            
            const transportHours = calculateTransportTimeWithDistance(
              selectedCarrier["size (in tones)"] || 0,
              totalSoilExcavation,
              distance,
              carrierSpeed
            );
            
            // Calculate details for description
            const capacity = getMaterialCapacity('soil', selectedCarrier["size (in tones)"] || 0);
            const trips = Math.ceil(totalSoilExcavation / capacity);
            const roundTripDistance = distance * 2;
            
            const { error: transportError } = await supabase
              .from('tasks_done')
              .insert({
                event_id: event.id,
                user_id: user?.id,
                name: `Transporting soil with ${selectedCarrier.name} (${selectedCarrier["size (in tones)"]}t) - ${distance}m`,
                description: `Transport breakdown:\n- Total soil: ${totalSoilExcavation.toFixed(2)} tonnes\n- Carrier capacity: ${capacity} tonnes/trip\n- Number of trips: ${trips}\n- Distance (one way): ${distance}m\n- Round trip: ${roundTripDistance}m\n- Speed: ${carrierSpeed} m/h\n- Time per trip: ${(roundTripDistance / carrierSpeed).toFixed(4)} hours\n- Total transport time: ${transportHours.toFixed(4)} hours`,
                unit: 'tonnes',
                amount: `${totalSoilExcavation.toFixed(2)} tonnes`,
                hours_worked: transportHours,
                is_finished: false,
                event_task_id: null, // Dynamic task, no template
                folder_id: excavationFolderId,
                company_id: companyId
              });
            
            if (transportError) {
              console.error('Error creating transport task:', transportError);
              throw new Error('Failed to create transport task');
            }
            }
          }
        }

        // Add Tape 1 (Type 1) Loading and Transport tasks (NEW SYSTEM - separate tasks)
        if (totalTape1 > 0) {
          // Find loading task template by exact name pattern
          const tape1TaskTemplate = taskTemplates.find(template => {
            const name = (template.name || '').toLowerCase();
            return name.includes('loading tape1') && 
                   name.includes(selectedExcavator.name.toLowerCase()) &&
                   name.includes(`(${selectedExcavator["size (in tones)"]}t)`);
          });
          
          // Calculate loading hours from template
          const loadingHours = tape1TaskTemplate?.estimated_hours 
            ? totalTape1 * tape1TaskTemplate.estimated_hours
            : 0;
          
          // Create Loading task (always create, even if template not found)
          const { error: loadingError } = await supabase
            .from('tasks_done')
            .insert({
              event_id: event.id,
              user_id: user?.id,
              name: `Loading tape1 with ${selectedExcavator.name} (${selectedExcavator["size (in tones)"]}t)`,
              description: `Total Type 1 aggregate to load: ${totalTape1.toFixed(2)} tonnes${!tape1TaskTemplate ? ' (Warning: Template not found, hours estimated at 0)' : ''}`,
              unit: 'tonnes',
              amount: `${totalTape1.toFixed(2)} tonnes`,
              hours_worked: loadingHours,
              is_finished: false,
              event_task_id: tape1TaskTemplate?.id || null,
              folder_id: excavationFolderId,
              company_id: companyId
            });
          
          if (loadingError) {
            console.error('Error creating tape1 loading task:', loadingError);
            throw new Error('Failed to create tape1 loading task');
          }
          
          // Create Transport task for Tape1 (dynamic, no template) - only if distance > 0
          if (selectedCarrier) {
            const distance = parseFloat(tape1TransportDistance) || 0;
            
            if (distance > 0) {
              const carrierSpeed = selectedCarrier.speed_m_per_hour || DEFAULT_CARRIER_SPEED_M_PER_H;
            
            const transportHours = calculateTransportTimeWithDistance(
              selectedCarrier["size (in tones)"] || 0,
              totalTape1,
              distance,
              carrierSpeed
            );
            
            // Calculate details for description
            const capacity = getMaterialCapacity('soil', selectedCarrier["size (in tones)"] || 0);
            const trips = Math.ceil(totalTape1 / capacity);
            const roundTripDistance = distance * 2;
            
            const { error: transportError } = await supabase
              .from('tasks_done')
              .insert({
                event_id: event.id,
                user_id: user?.id,
                name: `Transporting Type 1 with ${selectedCarrier.name} (${selectedCarrier["size (in tones)"]}t) - ${distance}m`,
                description: `Transport breakdown:\n- Total Type 1: ${totalTape1.toFixed(2)} tonnes\n- Carrier capacity: ${capacity} tonnes/trip\n- Number of trips: ${trips}\n- Distance (one way): ${distance}m\n- Round trip: ${roundTripDistance}m\n- Speed: ${carrierSpeed} m/h\n- Time per trip: ${(roundTripDistance / carrierSpeed).toFixed(4)} hours\n- Total transport time: ${transportHours.toFixed(4)} hours`,
                unit: 'tonnes',
                amount: `${totalTape1.toFixed(2)} tonnes`,
                hours_worked: transportHours,
                is_finished: false,
                event_task_id: null, // Dynamic task, no template
                folder_id: excavationFolderId,
                company_id: companyId
              });
            
            if (transportError) {
              console.error('Error creating tape1 transport task:', transportError);
              throw new Error('Failed to create tape1 transport task');
            }
            }
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
          // Skip - zero/missing hours
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

      // Remove results from minor tasks - materials should only be in main_tasks or extra_materials
      const invoiceMinorTasks = minorTasks.map(task => ({
        template_id: task.template_id,
        name: task.name,
        quantity: task.quantity,
        unit: task.unit,
        estimated_hours: task.estimated_hours,
        description: task.description || '',
        pricePerUnit: 0 // Will be set by user in edit mode
      }));

      // Add equipment to the event
      if (projectEquipment.length > 0) {
        for (const equipmentItem of projectEquipment) {
          const { error: equipmentError } = await supabase
            .from('equipment_usage')
            .insert({
              event_id: event.id,
              equipment_id: equipmentItem.equipment_id,
              quantity: equipmentItem.quantity,
              start_date: equipmentItem.start_date || formData.start_date,
              end_date: equipmentItem.end_date || formData.end_date,
              is_returned: false,
              company_id: freshCompanyId
            });

          if (equipmentError) {
            console.error('Error adding equipment to event:', equipmentError);
            throw new Error('Failed to add equipment to event');
          }
        }
      }

      const { error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          project_id: event.id,
          company_id: freshCompanyId,
          main_tasks: invoiceMainTasks,
          main_breakdown: [],
          main_materials: [],
          minor_tasks: invoiceMinorTasks,
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
      setError(error instanceof Error ? error.message : t('project:error_creating_event'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update equipment conflict when data changes
  useEffect(() => {
    if (equipmentConflictData) {
      if (equipmentConflictData.conflicting) {
        setEquipmentConflict({
          conflictingDates: equipmentConflictData.usages.map((u: any) => 
            `${new Date(u.start_date).toLocaleDateString()} - ${new Date(u.end_date).toLocaleDateString()} (Event: ${u.events?.title || 'Unknown'})`
          ),
          event: equipmentConflictData.usages[0]?.events || null
        });
      } else {
        setEquipmentConflict(null);
      }
    }
  }, [equipmentConflictData]);

  // Update the useEffect that calculates totals
  useEffect(() => {
    let soilTotal = 0;
    let tape1Total = 0;

    // Calculate from main tasks
    mainTasks.forEach(task => {
      if (task.results?.materials) {
        task.results.materials.forEach(material => {
          // Skip excavated soil from Foundation calculator - it's self-contained
          if (task.calculatorType === 'foundation' && material.name.toLowerCase().includes('excavated')) {
            return;
          }
          // Skip excavated soil from Wall calculators when foundation is included - it's self-contained
          if (task.calculatorType === 'wall' && 
              task.results.includeFoundation && material.name.toLowerCase().includes('excavated')) {
            return;
          }
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

    // Add already calculated soil excavation hours
    total += soilExcavationHours;

    // Add already calculated tape 1 preparation hours
    total += tape1Hours;

    return total;
  };

  // Update the fetchEquipment function to use the correct table
  useEffect(() => {
    if (selectedExcavator && taskTemplates.length > 0) {
      // Find soil excavation task template by exact name pattern
      let soilExcavationTemplate = taskTemplates.find(template => {
        const name = (template.name || '').toLowerCase();
        return name.includes('excavation soil') && 
               name.includes(selectedExcavator.name.toLowerCase()) &&
               name.includes(`(${selectedExcavator["size (in tones)"]}t)`);
      });

      // Calculate excavation hours
      const excavationTime = soilExcavationTemplate?.estimated_hours 
        ? totalSoilExcavation * soilExcavationTemplate.estimated_hours
        : 0;
      
      // Calculate transport hours (NEW SYSTEM with speed from database) - only if distance > 0
      const distance = parseFloat(soilTransportDistance) || 0;
      const transportTime = (distance > 0 && selectedCarrier && selectedCarrier.speed_m_per_hour)
        ? calculateTransportTimeWithDistance(
            selectedCarrier["size (in tones)"] || 0, 
            totalSoilExcavation,
            distance,
            selectedCarrier.speed_m_per_hour
          )
        : 0;
      
      setSoilExcavationHours(excavationTime + transportTime);

      // Find tape1 loading task template by exact name pattern
      let tape1Template = taskTemplates.find(template => {
        const name = (template.name || '').toLowerCase();
        return name.includes('loading tape1') && 
               name.includes(selectedExcavator.name.toLowerCase()) &&
               name.includes(`(${selectedExcavator["size (in tones)"]}t)`);
      });

      // Calculate loading hours
      const loadingTime = tape1Template?.estimated_hours 
        ? totalTape1 * tape1Template.estimated_hours
        : 0;
      
      // Calculate transport hours for tape1 - only if distance > 0
      const tape1Distance = parseFloat(tape1TransportDistance) || 0;
      const tape1TransportTime = (tape1Distance > 0 && selectedCarrier && selectedCarrier.speed_m_per_hour)
        ? calculateTransportTimeWithDistance(
            selectedCarrier["size (in tones)"] || 0, 
            totalTape1,
            tape1Distance,
            selectedCarrier.speed_m_per_hour
          )
        : 0;
      
      setTape1Hours(loadingTime + tape1TransportTime);
    }
  }, [selectedExcavator, selectedCarrier, totalSoilExcavation, totalTape1, taskTemplates, soilTransportDistance, tape1TransportDistance]);

  // Add useEffect for handling additional excavation
  useEffect(() => {
    const additionalSoil = excavationMeasureType === 'weight' 
      ? Number(extraSoilExcavation.weight) || 0
      : Number(extraSoilExcavation.area) * 1.5; // Assuming 1.5 tonnes per square meter, adjust as needed
    
    setTotalSoilExcavation(prev => {
      const baseAmount = mainTasks.reduce((total, task) => {
        if (task.results?.materials) {
          task.results.materials.forEach(material => {
            // Skip excavated soil from Foundation calculator - it's self-contained
            if (task.calculatorType === 'foundation' && material.name.toLowerCase().includes('excavated')) {
              return;
            }
            // Skip excavated soil from Wall calculators when foundation is included - it's self-contained
            if (task.calculatorType === 'wall' && 
                task.results.includeFoundation && material.name.toLowerCase().includes('excavated')) {
              return;
            }
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
            <div className="flex items-center">
              <h1 className="text-3xl font-bold" style={{ color: colors.textPrimary }}>{t('project:create_new_project')}</h1>
              <PageInfoModal
                description={t('project:project_creating_info_description')}
                title={t('project:project_creating_info_title')}
                quickTips={[]}
              />
            </div>
          <button
          onClick={handleSubmit}
          disabled={isSubmitting || !formData.title || !formData.start_date || !formData.end_date}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Plus className="w-5 h-5 mr-2" />
            {isSubmitting ? t('form:loading') : t('project:create_new_project')}
          </button>
        </div>

        <div className="space-y-8">
          {/* Basic Information */}
          <Card>
            <h2 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary, marginBottom: spacing.xl }}>{t('project:basic_information')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('project:project_title')}</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="mt-1 block w-full rounded-md shadow-sm"
                  style={{ borderColor: colors.borderDefault }}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('project:project_description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="mt-1 block w-full rounded-md shadow-sm"
                  style={{ borderColor: colors.borderDefault }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('project:status')}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as FormData['status'] }))}
                  className="mt-1 block w-full rounded-md shadow-sm"
                  style={{ borderColor: colors.borderDefault }}
                >
                  <option value="planned">{t('project:planned')}</option>
                  <option value="scheduled">{t('project:ongoing')}</option>
                  <option value="in_progress">{t('project:ongoing')}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('project:start_date')}</label>
                  <DatePicker
                    value={formData.start_date}
                    onChange={(v) => setFormData(prev => ({ ...prev, start_date: v }))}
                    required
                    className="mt-1 cursor-pointer transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('project:end_date')}</label>
                  <DatePicker
                    value={formData.end_date}
                    onChange={(v) => setFormData(prev => ({ ...prev, end_date: v }))}
                    minDate={formData.start_date}
                    required
                    className="mt-1 cursor-pointer transition-colors"
                  />
                </div>
              </div>

              <div className="flex space-x-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.has_equipment}
                    onChange={(e) => setFormData(prev => ({ ...prev, has_equipment: e.target.checked }))}
                    className="rounded shadow-sm"
                    style={{ borderColor: colors.borderDefault, accentColor: colors.accentBlue }}
                  />
                  <span className="ml-2 text-sm" style={{ color: colors.textSubtle }}>{t('project:has_equipment')}</span>
                </label>
              </div>

              {/* Equipment Section */}
              {formData.has_equipment && (
                <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: colors.bgSubtle }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <Wrench className="w-5 h-5" style={{ color: colors.accentBlue }} />
                      <h3 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>{t('utilities:equipment_needed')}</h3>
                    </div>
                    <Button
                      onClick={() => {
                        setShowAddEquipmentModal(true);
                        setEquipmentStartDate(formData.start_date);
                        setEquipmentEndDate(formData.end_date);
                        setSelectedEquipmentToAdd(null);
                        setEquipmentQuantity(1);
                      }}
                      icon={<Plus className="w-4 h-4" />}
                      style={{ fontSize: fontSizes.sm }}
                    >
                      {t('utilities:add_equipment')}
                    </Button>
                  </div>

                  {/* Equipment List */}
                  {projectEquipment.length === 0 ? (
                    <p className="text-sm text-center py-4" style={{ color: colors.textMuted }}>{t('utilities:no_equipment_added')}</p>
                  ) : (
                    <div className="space-y-3">
                      {projectEquipment.map((item, index) => {
                        const equip = item.equipment || allEquipment.find(e => e.id === item.equipment_id);
                        return (
                          <div key={index} className="flex items-center justify-between p-3 rounded border" style={{ backgroundColor: colors.bgCard, borderColor: colors.borderLight }}>
                            <div className="flex-1">
                              <p className="font-medium" style={{ color: colors.textPrimary }}>{equip?.name || t('project:unknown_equipment')}</p>
                              <p className="text-sm" style={{ color: colors.textSubtle }}>{t('project:quantity_with_value', { count: item.quantity })}</p>
                              {item.start_date && item.end_date && (
                                <p className="text-xs" style={{ color: colors.textMuted }}>
                                  {new Date(item.start_date).toLocaleDateString()} - {new Date(item.end_date).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingEquipmentIndex(index);
                                  setSelectedEquipmentToAdd(equip);
                                  setEquipmentQuantity(item.quantity);
                                  setEquipmentStartDate(item.start_date || formData.start_date);
                                  setEquipmentEndDate(item.end_date || formData.end_date);
                                  setShowAddEquipmentModal(true);
                                }}
                                className="p-2 rounded-md transition-colors"
                                style={{ color: colors.accentBlue }}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setProjectEquipment(projectEquipment.filter((_, i) => i !== index));
                                }}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Main Tasks Section */}
        <Card style={{ marginTop: spacing.xl }}>
          <div className="flex justify-between items-center mb-4">
            <h2 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary }}>{t('utilities:main_tasks')}</h2>
              <Button
                onClick={() => setShowMainTaskModal(true)}
                icon={<Plus className="w-5 h-5" />}
              >
                {t('utilities:add_main_task')}
              </Button>
            </div>

              {mainTasks.map((task, index) => (
            <Card key={task.id} style={{ marginBottom: spacing.lg }}>
              <div className="flex justify-between items-start mb-4">
                <h3 style={{ fontSize: fontSizes.md, fontWeight: fontWeights.medium, color: colors.textPrimary }}>{translateTaskName(task.name, t)}</h3>
                    <button
                      onClick={() => {
                    const updatedTasks = mainTasks.filter((_, i) => i !== index);
                    setMainTasks(updatedTasks);
                  }}
                  style={{ color: colors.textMuted, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = colors.textPrimary;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = colors.textMuted;
                  }}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  {task.results && (
                <>
                  {/* Task Breakdown */}
                  <div className="mb-4">
                    <h4 style={{ color: colors.accentBlue, marginBottom: spacing.sm }}>{t('utilities:task_breakdown')}:</h4>
                    <div style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, overflow: 'hidden' }}>
                      {task.results.taskBreakdown?.map((breakdown, i) => (
                        <div key={i} className="flex justify-between" style={{ padding: `${spacing.lg}px ${spacing['4xl']}px`, background: i % 2 === 1 ? colors.bgTableRowAlt : undefined, borderBottom: i < (task.results.taskBreakdown?.length ?? 0) - 1 ? `1px solid ${colors.borderLight}` : 'none', color: colors.textSecondary }}>
                          <span>{translateTaskName(breakdown.name || breakdown.task, t)}</span>
                          <span>{breakdown.hours.toFixed(2)} {t('common:hrs_abbr')}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${colors.borderDefault}` }}>
                      <div className="flex justify-between font-medium" style={{ color: colors.textPrimary }}>
                        <span>{t('utilities:total_labor_hours')}</span>
                        <span>
                          {task.results.taskBreakdown?.reduce((sum, breakdown) => sum + (breakdown.hours || 0), 0).toFixed(2) || '0.00'} {t('common:hrs_abbr')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Materials */}
                  <div>
                    <h4 style={{ color: colors.accentBlue, marginBottom: spacing.sm }}>{t('utilities:materials_required')}:</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr style={{ color: colors.textMuted, fontSize: fontSizes.sm }}>
                            <th className="text-left py-2" style={{ color: colors.textMuted }}>{t('utilities:material')}</th>
                            <th className="text-right py-2" style={{ color: colors.textMuted }}>{t('utilities:quantity')}</th>
                            <th className="text-left py-2" style={{ color: colors.textMuted }}>{t('utilities:unit')}</th>
                          </tr>
                        </thead>
                        <tbody style={{ color: colors.textSecondary }}>
                          {task.results.materials?.map((material, i) => (
                            <tr key={i} style={{ background: i % 2 === 1 ? colors.bgTableRowAlt : undefined }}>
                              <td className="py-1" style={{ color: colors.textSecondary }}>{translateMaterialName(material.name, t)}</td>
                              <td className="text-right py-1" style={{ color: colors.textSecondary }}>{material.quantity.toFixed(2)}</td>
                              <td className="pl-4 py-1" style={{ color: colors.textSecondary }}>{translateUnit(material.unit, t)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
                  )}
                </Card>
              ))}
          </Card>

          {/* Minor Tasks Section */}
          <Card>
            <div className="flex justify-between items-center mb-6">
              <h2 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary }}>{t('utilities:minor_tasks')}</h2>
              <Button
                onClick={handleAddMinorTask}
                icon={<Plus className="w-5 h-5" />}
              >
                {t('utilities:add_minor_task')}
              </Button>
            </div>

            <div className="space-y-4">
            {minorTasks
              .filter(task => !task.name.toLowerCase().includes('preparation') && !task.name.toLowerCase().includes('excavation'))
              .map((task, index) => (
                <div key={index} className="flex items-start space-x-4 p-4 rounded-lg" style={{ backgroundColor: colors.bgSubtle }}>
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('utilities:task_name')}</label>
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
                        className="mt-1 block w-full rounded-md shadow-sm"
                        style={{ borderColor: colors.borderDefault }}
                      >
                        <option value="">{t('utilities:select_a_task_type')}</option>
                      {taskTemplates
                        .filter(template => 
                          !(template.name || '').toLowerCase().includes('preparation') && 
                          !(template.name || '').toLowerCase().includes('excavation')
                        )
                        .map(template => (
                          <option key={template.id || 'unknown'} value={template.id || ''}>
                            {translateTaskName(template.name, t)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {task.template_id && (
                      <>
                        <div>
                          <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('project:task_name')}</label>
                          <input
                            type="text"
                            value={task.name}
                            onChange={(e) => {
                              const newTasks = [...minorTasks];
                              newTasks[index].name = e.target.value;
                              setMinorTasks(newTasks);
                            }}
                            className="mt-1 block w-full rounded-md shadow-sm"
                            style={{ borderColor: colors.borderDefault }}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('project:quantity')}</label>
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
                              className="mt-1 block w-full rounded-md shadow-sm"
                              style={{ borderColor: colors.borderDefault }}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('project:unit')}</label>
                            <input
                              type="text"
                              value={translateUnit(task.unit, t)}
                              className="mt-1 block w-full rounded-md shadow-sm"
                              style={{ borderColor: colors.borderDefault }}
                              readOnly
                            />
                          </div>
                        </div>

                        {task.estimated_hours && !task.results && (
                          <div className="text-sm" style={{ color: colors.textSubtle }}>
                            {t('project:estimated_time')} {formatTime(task.estimated_hours * task.quantity)}
                          </div>
                        )}

                        {task.results && (
                          <div className="mt-4 space-y-2">
                            <div className="text-sm font-medium text-green-600">{t('project:task_accepted')}</div>
                            <div className="text-sm">
                              {t('project:labor_hours')}: {formatTime(task.results.labor)}
                            </div>
                            {task.results.materials.map((material, i) => (
                              <div key={i} className="text-sm">
                                {translateMaterialName(material.name, t)}: {material.quantity} {translateUnit(material.unit, t)}
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
                      className="p-2 transition-colors"
                      style={{ color: colors.red }}
                      title={t('project:delete_task')}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Materials Section */}
          <Card>
            <div className="flex justify-between items-center mb-6">
              <h2 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary }}>{t('project:materials')}</h2>
              <Button
                onClick={() => setMaterials(prev => [...prev, { template_id: '', quantity: 1, confirmed: false }])}
                icon={<Plus className="w-5 h-5" />}
              >
                {t('project:add_material')}
              </Button>
            </div>

            <div className="space-y-4">
              {materials.map((material, index) => (
                <div key={index} className="flex items-start space-x-4 p-4 rounded-lg" style={{ backgroundColor: colors.bgSubtle }}>
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('project:material_type')}</label>
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
                        className="mt-1 block w-full rounded-md shadow-sm"
                      style={{ borderColor: colors.borderDefault }}
                      disabled={material.confirmed}
                      >
                        <option value="">{t('project:select_a_material')}</option>
                        <option value="other" className="font-medium" style={{ color: colors.accentBlue }}>{t('project:other_custom_material')}</option>
{materialTemplates.map(template => (
                          <option key={template.id} value={template.id}>
                            {translateMaterialName(template.name, t)} ({translateUnit(template.unit, t)})
                          </option>
                        ))}
                      </select>
                    </div>

                  {translateMaterialDescription(material.name, material.description, t) && (
                    <div className="text-sm" style={{ color: colors.textSubtle }}>
                      {translateMaterialDescription(material.name, material.description, t)}
                    </div>
                  )}

                    <div>
                      <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('project:quantity')}</label>
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
                        className="mt-1 block w-full rounded-md shadow-sm"
                        style={{ borderColor: colors.borderDefault }}
                      disabled={material.confirmed}
                      />
                    </div>

                  {material.price !== undefined && material.price !== null && (
                    <div className="text-sm" style={{ color: colors.textSubtle }}>
                      {t('project:price_per_unit')}: £{material.price.toFixed(2)}
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
                        title={t('project:confirm_material')}
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
                        title={t('project:delete_material')}
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
className="p-2 transition-colors"
                        style={{ color: colors.accentBlue }}
                        title={t('project:edit_material')}
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                  )}
                </div>
                </div>
              ))}
            </div>
          </Card>

        {/* Shared Equipment Selection */}
        <div className="mb-8 p-6 rounded-lg shadow-sm" style={{ backgroundColor: colors.bgCard }}>
          <h2 className="text-xl font-semibold mb-4" style={{ color: colors.textPrimary }}>{t('project:equipment_selection')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-3" style={{ color: colors.textSecondary }}>{t('project:excavation_machinery')}</label>
              <div className="space-y-2">
                {excavators.length === 0 ? (
                  <p style={{ color: colors.textMuted }}>{t('project:no_excavators_found')}</p>
                ) : (
                  excavators.map((excavator) => (
                    <div 
                      key={excavator.id}
                      className="flex items-start p-2 cursor-pointer rounded-md"
                      onClick={() => setSelectedExcavator(excavator)}
                    >
                      <div className="w-4 h-4 rounded-full border mr-2 mt-0.5 flex-shrink-0" style={{ borderColor: colors.borderDefault }}>
                        <div className="w-2 h-2 rounded-full m-0.5" style={{ backgroundColor: selectedExcavator?.id === excavator.id ? colors.accentBlue : 'transparent' }}></div>
                      </div>
                      <div>
                        <div style={{ color: colors.textPrimary }}>{excavator.name}</div>
                        <div className="text-sm" style={{ color: colors.textSubtle }}>({excavator["size (in tones)"]} {t('project:tons')})</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {/* Carrier Machinery */}
            <div>
              <label className="block text-sm font-medium mb-3" style={{ color: colors.textSecondary }}>{t('project:carrier_machinery')}</label>
              <div className="space-y-2">
                {carriers.length === 0 ? (
                  <p style={{ color: colors.textMuted }}>{t('project:no_carriers_found')}</p>
                ) : (
                  carriers.map((carrier) => (
                    <div 
                      key={carrier.id}
                      className="flex items-start p-2 cursor-pointer rounded-md"
                      onClick={() => setSelectedCarrier(carrier)}
                    >
                      <div className="w-4 h-4 rounded-full border mr-2 mt-0.5 flex-shrink-0" style={{ borderColor: colors.borderDefault }}>
                        <div className="w-2 h-2 rounded-full m-0.5" style={{ backgroundColor: selectedCarrier?.id === carrier.id ? colors.accentBlue : 'transparent' }}></div>
                      </div>
                      <div>
                        <div style={{ color: colors.textPrimary }}>{carrier.name}</div>
                        <div className="text-sm" style={{ color: colors.textSubtle }}>({carrier["size (in tones)"]} {t('project:tons')}, {carrier.speed_m_per_hour || DEFAULT_CARRIER_SPEED_M_PER_H} {t('project:speed')})</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Soil Excavation Section */}
        <div className="mb-8 p-6 rounded-lg shadow-sm" style={{ backgroundColor: colors.bgCard }}>
              <h2 className="text-xl font-semibold text-white mb-4">{t('project:soil_excavation')}</h2>
          <div className="flex justify-between items-center mb-4">
            <p style={{ color: colors.textMuted }}>
              {t('project:soil_excavation_amount')}: {totalSoilExcavation.toFixed(2)} {t('project:tonnes')}
            </p>
            <p style={{ color: colors.textMuted }}>
              {t('project:estimated_time')}: <span className="font-medium">{formatTime(soilExcavationHours)}</span>
            </p>
          </div>
              
              <div className="mt-4">
            <h3 className="text-lg font-medium mb-2" style={{ color: colors.textPrimary }}>
              {t('project:additional_excavation')} <span className="text-sm font-normal" style={{ color: colors.textSubtle }}>({t('project:description_additional_excavation')})</span>

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
                    style={{ accentColor: colors.accentBlue }}
                  />
                  <span style={{ color: colors.textSecondary }}>{t('project:area_m3')}</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="excavationMeasureType"
                    value="weight"
                    checked={excavationMeasureType === 'weight'}
                    onChange={(e) => setExcavationMeasureType(e.target.value as 'area' | 'weight')}
                    style={{ accentColor: colors.accentBlue }}
                  />
                  <span style={{ color: colors.textSecondary }}>{t('project:weight_tonnes_label')}</span>
                </label>
              </div>

              {excavationMeasureType === 'area' ? (
                    <input
                      type="number"
                      value={extraSoilExcavation.area}
                  onChange={(e) => setExtraSoilExcavation(prev => ({ ...prev, area: e.target.value, weight: '' }))}
                  placeholder={t('project:enter_area_placeholder')}
                  className="block w-full rounded-md shadow-sm text-lg py-3"
                    style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgElevated, color: colors.textPrimary }}
                    />
              ) : (
                    <input
                      type="number"
                      value={extraSoilExcavation.weight}
                  onChange={(e) => setExtraSoilExcavation(prev => ({ ...prev, weight: e.target.value, area: '' }))}
                  placeholder={t('project:enter_weight_placeholder')}
                  className="block w-full rounded-md shadow-sm text-lg py-3"
                  style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgElevated, color: colors.textPrimary }}
                    />
              )}
              
              {/* Transport Distance Input for Soil Excavation */}
              {selectedCarrier && (
                <div className="mt-4">
                  <input
                    type="number"
                    value={soilTransportDistance}
                    onChange={(e) => setSoilTransportDistance(e.target.value)}
                    placeholder={t('project:transport_distance_placeholder')}
                    min="0"
                    step="1"
                    className="block w-full rounded-md shadow-sm text-lg py-3"
                    style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgElevated, color: colors.textPrimary }}
                  />
                  <label className="block text-xs mt-1" style={{ color: colors.textMuted }}>
                    {t('project:transport_distance_info')}
                  </label>
                </div>
              )}
                </div>
              </div>

              {/* Soil Excavation Results */}
              {mainTasks.some(task => task.calculatorType === 'soil_excavation' && task.results) && (
                <div className="mt-6 border-t pt-6">
                  <h3 className="text-lg font-medium mb-4" style={{ color: colors.textPrimary }}>{t('project:excavation_details')}</h3>
                  <div className="space-y-6">
                    {mainTasks
                      .filter(task => task.calculatorType === 'soil_excavation' && task.results)
                      .map((task, index) => (
                        <div key={index} className="p-4 rounded-lg" style={{ backgroundColor: colors.bgSubtle }}>
                          <h4 className="font-medium mb-3" style={{ color: colors.textPrimary }}>{translateTaskName(task.name, t)}</h4>
                          <div className="space-y-4">
                            {task.results?.totalTons && (
                              <div className="text-sm">
                                <span className="font-medium">{t('project:total_soil')}:</span> {task.results.totalTons.toFixed(2)} {t('project:tonnes')}
                              </div>
                            )}
                            {task.results?.excavationTime && (
                              <div className="text-sm">
                                <span className="font-medium">{t('project:excavation_time')}:</span> {formatTime(task.results.excavationTime)}
                              </div>
                            )}
                            {task.results?.transportTime && (
                              <div className="text-sm">
                                <span className="font-medium">{t('project:transport_time')}:</span> {formatTime(task.results.transportTime)}
                              </div>
                            )}
                            {task.results?.totalTime && (
                              <div className="text-sm">
                                <span className="font-medium">{t('project:total_time')}:</span> {formatTime(task.results.totalTime)}
                              </div>
                            )}
                            {task.results?.equipmentUsed && (
                              <div className="text-sm space-y-1">
                                <div className="font-medium">{t('project:equipment_used')}:</div>
                                {task.results.equipmentUsed.excavator && (
                                  <div>{t('project:excavator_label')}: {task.results.equipmentUsed.excavator}</div>
                                )}
                                {task.results.equipmentUsed.carrier && (
                                  <div>{t('project:carrier_label')}: {task.results.equipmentUsed.carrier}</div>
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
        <div className="mb-8 p-6 rounded-lg shadow-sm" style={{ backgroundColor: colors.bgCard }}>
              <h2 className="text-xl font-semibold mb-4" style={{ color: colors.textPrimary }}>{t('project:tape1_preparation')}</h2>
          <div className="flex justify-between items-center mb-4">
            <p style={{ color: colors.textMuted }}>
              {t('project:tape1_amount')}: {totalTape1.toFixed(2)} {t('project:tonnes')}
            </p>
            <p style={{ color: colors.textMuted }}>
              {t('project:estimated_time')}: <span className="font-medium">{formatTime(tape1Hours)}</span>
            </p>
            </div>
            
            {/* Transport Distance Input for Tape1 */}
            {selectedCarrier && (
              <div className="mt-4">
                <input
                  type="number"
                  value={tape1TransportDistance}
                  onChange={(e) => setTape1TransportDistance(e.target.value)}
                  placeholder={t('project:transport_distance_placeholder')}
                  min="0"
                  step="1"
                  className="block w-full rounded-md shadow-sm text-lg py-3"
                style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgElevated, color: colors.textPrimary }}
                />
                <label className="block text-xs mt-1" style={{ color: colors.textMuted }}>
                  {t('project:transport_distance_info')}
                </label>
              </div>
            )}
          </div>

          {/* Results Section */}
        <div className="mt-8 rounded-lg p-6" style={{ backgroundColor: colors.bgCard }}>
          <h2 className="text-xl font-semibold text-white mb-4">{t('project:total_results')}</h2>
          
          {/* Total Hours */}
          <div className="mb-6">
            <div className="flex justify-between text-white font-medium">
              <span>{t('project:total_labor_hours')}</span>
              <span>{calculateTotalHours().toFixed(2)} {t('common:hrs_abbr')}</span>
                          </div>
                            </div>

          {/* Combined Materials Table */}
          <div>
            <h3 className="mb-2" style={{ color: colors.accentBlue }}>{t('project:total_materials_required')}:</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-sm" style={{ color: colors.textSubtle }}>
                    <th className="text-left py-2">{t('project:material')}</th>
                    <th className="text-right py-2">{t('project:quantity')}</th>
                    <th className="text-left py-2">{t('project:unit')}</th>
                    <th className="text-right py-2">{t('common:price')}</th>
                    <th className="text-right py-2">{t('common:total')}</th>
                  </tr>
                </thead>
                <tbody style={{ color: colors.textMuted }}>
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
                              name: t('project:soil_excavation_label'),
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
                    <tr key={i} style={{ background: i % 2 === 1 ? colors.bgTableRowAlt : undefined }}>
                      <td className="py-1">
                        <div>{translateMaterialName(material.name, t)}</div>
                        {translateMaterialDescription(material.name, material.description, t) && <div className="text-sm" style={{ color: colors.textSubtle }}>{translateMaterialDescription(material.name, material.description, t)}</div>}
                        {material.category && <div className="text-sm" style={{ color: colors.textSubtle }}>{t('project:category')}: {material.category}</div>}
                      </td>
                      <td className="text-right py-1">{(material.quantity ?? 0).toFixed(2)}</td>
                      <td className="pl-4 py-1">{translateUnit(material.unit, t)}</td>
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
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t" style={{ borderColor: colors.borderLight }}>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2 rounded-lg transition-colors font-medium"
            style={{ backgroundColor: colors.bgCard, color: colors.textMuted }}
          >
            {t('project:cancel_button')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.title || !formData.start_date || !formData.end_date}
            className="flex items-center px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-medium"
          >
            <Plus className="w-5 h-5 mr-2" />
            {isSubmitting ? t('project:creating') : t('project:create_event_button')}
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
          selectedCarrier={selectedCarrier}
        />
      )}

      {showNamePrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="p-6 rounded-lg shadow-lg max-w-md w-full" style={{ backgroundColor: colors.bgCard }}>
            <h3 className="text-lg font-semibold mb-4">{t('project:enter_task_name')}</h3>
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder={t('project:enter_task_name_placeholder')}
              className="w-full p-2 border rounded mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setTaskName('');
                  setTempMainTask(null);
                  setShowNamePrompt(false);
                }}
                className="px-4 py-2 rounded transition-colors"
                style={{ backgroundColor: colors.bgCard, color: colors.textMuted }}
              >
                {t('project:cancel_button_label')}
              </button>
              <button
                onClick={handleConfirmTaskName}
                disabled={!taskName.trim()}
                className="px-4 py-2 rounded disabled:opacity-50"
                style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
              >
                {t('project:confirm_button_label')}
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
            title: t('project:new_project')
          }]}
        />
      )}

      {/* Add Equipment to Project Modal */}
      {showAddEquipmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-0 md:p-4">
          <div className="rounded-lg max-w-md w-full p-6 space-y-4" style={{ backgroundColor: colors.bgCard }}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                {editingEquipmentIndex !== null ? t('project:edit_equipment') : t('project:add_equipment_to_project')}
              </h3>
              <button
                onClick={() => {
                  setShowAddEquipmentModal(false);
                  setSelectedEquipmentToAdd(null);
                  setEquipmentQuantity(1);
                  setEquipmentStartDate('');
                  setEquipmentEndDate('');
                  setEditingEquipmentIndex(null);
                  setEquipmentConflict(null);
                }}
                className="p-2 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>{t('project:equipment')}</label>
              <select
                value={selectedEquipmentToAdd?.id || ''}
                onChange={(e) => {
                  const equip = allEquipment.find(eq => eq.id === e.target.value);
                  setSelectedEquipmentToAdd(equip || null);
                  setEquipmentQuantity(1);
                }}
                className="w-full px-3 py-2 border rounded-md"
                style={{ borderColor: colors.borderDefault }}
              >
                <option value="">{t('project:select_equipment')}</option>
                {allEquipment.map((equip: any) => (
                  <option key={equip.id} value={equip.id}>
                    {equip.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedEquipmentToAdd && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>{t('project:quantity')}</label>
                  <input
                    type="number"
                    min="1"
                    value={equipmentQuantity}
                    onChange={(e) => setEquipmentQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 border rounded-md"
                    style={{ borderColor: colors.borderDefault }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>{t('project:start_date')}</label>
                  <DatePicker
                    value={equipmentStartDate}
                    onChange={setEquipmentStartDate}
                    className="cursor-pointer transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>{t('project:end_date')}</label>
                  <DatePicker
                    value={equipmentEndDate}
                    onChange={setEquipmentEndDate}
                    minDate={equipmentStartDate}
                    className="cursor-pointer transition-colors"
                  />
                </div>

                {equipmentConflict && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm font-medium text-red-900 mb-2">{t('project:equipment_not_available')}</p>
                    <p className="text-xs text-red-700 mb-2">{t('calculator:equipment_busy_message')}</p>
                    <ul className="text-xs text-red-700 list-disc list-inside">
                      {equipmentConflict.conflictingDates.map((date, idx) => (
                        <li key={idx}>{date}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={() => {
                  setShowAddEquipmentModal(false);
                  setSelectedEquipmentToAdd(null);
                  setEquipmentQuantity(1);
                  setEquipmentStartDate('');
                  setEquipmentEndDate('');
                  setEditingEquipmentIndex(null);
                  setEquipmentConflict(null);
                }}
                className="px-4 py-2"
                style={{ color: colors.textSubtle }}
              >
                {t('project:cancel_button_label')}
              </button>
              <button
                onClick={() => {
                  if (selectedEquipmentToAdd) {
                    if (editingEquipmentIndex !== null) {
                      // Edit mode
                      const updated = [...projectEquipment];
                      updated[editingEquipmentIndex] = {
                        equipment_id: selectedEquipmentToAdd.id,
                        quantity: equipmentQuantity,
                        start_date: equipmentStartDate,
                        end_date: equipmentEndDate,
                        equipment: selectedEquipmentToAdd
                      };
                      setProjectEquipment(updated);
                    } else {
                      // Add mode
                      const existingIndex = projectEquipment.findIndex(e => e.equipment_id === selectedEquipmentToAdd.id);
                      if (existingIndex >= 0) {
                        const updated = [...projectEquipment];
                        updated[existingIndex].quantity += equipmentQuantity;
                        setProjectEquipment(updated);
                      } else {
                        setProjectEquipment([
                          ...projectEquipment,
                          {
                            equipment_id: selectedEquipmentToAdd.id,
                            quantity: equipmentQuantity,
                            start_date: equipmentStartDate,
                            end_date: equipmentEndDate,
                            equipment: selectedEquipmentToAdd
                          }
                        ]);
                      }
                    }
                    setShowAddEquipmentModal(false);
                    setSelectedEquipmentToAdd(null);
                    setEquipmentQuantity(1);
                    setEquipmentStartDate('');
                    setEquipmentEndDate('');
                    setEditingEquipmentIndex(null);
                  }
                }}
                disabled={!selectedEquipmentToAdd || !!equipmentConflict}
                className="px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
              >
                {editingEquipmentIndex !== null ? t('project:update_equipment') : t('project:add_equipment')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectCreating;
