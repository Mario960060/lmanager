import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { format, parseISO } from 'date-fns';
import { Plus, Calendar, Package, Loader2, Search, CheckSquare } from 'lucide-react';
import Modal from '../components/Modal';
import BackButton from '../components/BackButton';
import type { Database } from '../lib/database.types';
import MainTaskModal from '../projectmanagement/MainTaskModal';
import CalculatorModal from '../projectmanagement/CalculatorModal';
import UnspecifiedMaterialModal from '../components/UnspecifiedMaterialModal';

type Event = Database['public']['Tables']['events']['Row'];
type TaskDone = Database['public']['Tables']['tasks_done']['Row'];
type EventTask = Database['public']['Tables']['event_tasks_with_dynamic_estimates']['Row'];
type Material = Database['public']['Tables']['materials']['Row'];

const Projects = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedTask, setSelectedTask] = useState<EventTask | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [quantity, setQuantity] = useState('');
  const [taskName, setTaskName] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [isMainTaskMode, setIsMainTaskMode] = useState(false);
  const [showMainTaskModal, setShowMainTaskModal] = useState(false);
  const [mainTaskResults, setMainTaskResults] = useState<any>(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [mainTaskName, setMainTaskName] = useState('');
  const [selectedCalculator, setSelectedCalculator] = useState<string | null>(null);
  const [selectedSubCalculator, setSelectedSubCalculator] = useState<string | null>(null);
  const [showUnspecifiedMaterialModal, setShowUnspecifiedMaterialModal] = useState(false);

  // Calculator groups definition
  const calculatorGroups = [
    {
      type: 'paving',
      label: 'Paving Calculator',
      subTypes: [
        { type: 'default', label: 'Monoblock Paving' }
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
      label: 'Kerbs & Edges Calculator',
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
        { type: 'horizontal', label: 'Horizontal Fence' }
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
      type: 'deck',
      label: 'Deck Calculator',
      subTypes: [
        { type: 'coming_soon', label: 'Coming Soon' }
      ]
    },
    {
      type: 'grass',
      label: 'Artificial Grass Calculator',
      subTypes: [
        { type: 'default', label: 'Artificial Grass' }
      ]
    }
  ];

  // Fetch projects and their associated tasks
  const { data: projects = [], isLoading: isProjectsLoading } = useQuery({
    queryKey: ['events', companyId],
    queryFn: async () => {
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('company_id', companyId)
        .order('start_date', { ascending: true });

      if (eventsError) throw eventsError;

      const eventsWithTasks = await Promise.all(
        events.map(async (event) => {
          const { data: tasks, error: tasksError } = await supabase
            .from('tasks_done')
            .select('*')
            .eq('event_id', event.id)
            .eq('company_id', companyId);

          if (tasksError) {
            console.error('Error fetching tasks:', tasksError);
            return { ...event, tasks: [] };
          }

          return { ...event, tasks: tasks || [] };
        })
      );

      return eventsWithTasks;
    },
    enabled: !!companyId
  });

  // Fetch task templates
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['task_templates', taskSearch, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('company_id', companyId)
        .ilike('name', `%${taskSearch}%`);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch materials
  const { data: materials = [] } = useQuery({
    queryKey: ['materials', materialSearch, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('company_id', companyId)
        .ilike('name', `%${materialSearch}%`);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Add task mutation
  const addTaskMutation = useMutation({
    mutationFn: async ({ eventId, task, quantity, name }: { eventId: string; task: EventTask; quantity: number; name: string }) => {
      const { error } = await supabase.from('tasks_done').insert({
        event_id: eventId,
        user_id: user?.id,
        name: name || task.name,
        description: task.description,
        amount: `${quantity} ${task.unit}`,
        hours_worked: task.estimated_hours * quantity,
        unit: task.unit,
        company_id: companyId,
        is_finished: false
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', companyId] });
      setShowTaskModal(false);
      setSelectedTask(null);
      setQuantity('');
      setTaskName('');
      setSelectedProject('');
    }
  });

  // Add material mutation
  const addMaterialMutation = useMutation({
    mutationFn: async ({ eventId, material, amount }: { eventId: string; material: Material; amount: number }) => {
      const { error } = await supabase.from('materials_delivered').insert({
        event_id: eventId,
        name: material.name,
        amount: 0,
        total_amount: amount,
        unit: material.unit,
        company_id: companyId,
        status: 'pending'
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', companyId] });
      setShowMaterialModal(false);
      setSelectedMaterial(null);
      setQuantity('');
      setSelectedProject('');
    }
  });

  // Add handler for unspecified material
  const handleAddUnspecifiedMaterial = async (materialData: {
    name: string;
    total_amount: number;
    unit: string;
    price_per_unit: number | null;
    event_id: string;
  }) => {
    try {
      const { error } = await supabase
        .from('materials_delivered')
        .insert({
          event_id: materialData.event_id,
          name: materialData.name,
          amount: 0,
          total_amount: materialData.total_amount,
          unit: materialData.unit,
          company_id: companyId,
          status: 'pending',
          price_per_unit: materialData.price_per_unit
        });

      if (error) {
        console.error('Error adding unspecified material:', error);
        alert('Failed to add material. Please try again.');
        return;
      }

      // Refresh the data
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      
      // Close both modals
      setShowUnspecifiedMaterialModal(false);
      setShowMaterialModal(false);
    } catch (error) {
      console.error('Error in handleAddUnspecifiedMaterial:', error);
      alert('An error occurred while adding the material. Please try again.');
    }
  };

  const handleTaskSubmit = () => {
    if (!selectedProject || !selectedTask || !quantity) return;
    addTaskMutation.mutate({
      eventId: selectedProject,
      task: selectedTask,
      quantity: parseFloat(quantity),
      name: taskName
    });
  };

  const handleMaterialSubmit = () => {
    if (!selectedProject || !selectedMaterial || !quantity) return;
    addMaterialMutation.mutate({
      eventId: selectedProject,
      material: selectedMaterial,
      amount: parseFloat(quantity)
    });
  };

  const getStatusColor = (status: Event['status']) => {
    switch (status) {
      case 'planned':
        return 'bg-gray-100 text-gray-800';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'finished':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: Event['status']) => {
    return status ? status.replace(/_/g, ' ') : 'Unknown';
  };

  // Helper to ensure hours_worked is always a positive, finite number (minimum 0.01)
  const safeNumber = (val: any) => {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : 0.01;
  };

  // Add main task to DB
  const handleAddMainTask = (results: any) => {
    // Store the full calculator result, including taskBreakdown, directly
    setMainTaskResults(results);
    setMainTaskName(''); // Always prompt for a new custom name
    setShowNamePrompt(true);
  };

  const handleConfirmMainTaskName = async () => {
    if (!selectedProject || !mainTaskResults) return;
    // Support both .results.taskBreakdown and .taskBreakdown for compatibility
    const results = mainTaskResults.results || mainTaskResults;
    const breakdown = results?.taskBreakdown;
    const userTaskName = mainTaskName.trim();
    const companyId = useAuthStore.getState().getCompanyId();
    const { data: taskTemplates, error: fetchTemplatesError } = await supabase
      .from('event_tasks_with_dynamic_estimates')
      .select('*')
      .eq('company_id', companyId);
    if (fetchTemplatesError) {
      console.error('Error fetching task templates:', fetchTemplatesError);
      return;
    }
    
    console.log('[TEMPLATES FETCHED]', taskTemplates?.map((t: any) => ({ id: t.id, name: t.name })));

    if (breakdown && breakdown.length > 0) {
      console.log('DEBUG: Full breakdown array:', breakdown);
      for (const taskItem of breakdown) {
        console.log('DEBUG: Current taskItem:', taskItem);
        let taskName = taskItem.task;
        let actualTaskName = taskName;
        // Special handling for cutting slabs (as in ProjectCreating)
        if (typeof taskName === 'string' && taskName.toLowerCase() === 'cutting slabs') {
          const isPorcelain =
            (typeof mainTaskResults.name === 'string' && mainTaskResults.name.toLowerCase().includes('porcelain')) ||
            (typeof results.name === 'string' && results.name.toLowerCase().includes('porcelain'));
          const isSandstone =
            (typeof mainTaskResults.name === 'string' && mainTaskResults.name.toLowerCase().includes('sandstone')) ||
            (typeof results.name === 'string' && results.name.toLowerCase().includes('sandstone'));
          if (isPorcelain) actualTaskName = 'cutting porcelain';
          else if (isSandstone) actualTaskName = 'cutting sandstones';
        }
        // Template matching logic (exact, task-specific, word-order, partial)
        let matchingTemplate = taskTemplates.find((template: any) =>
          typeof template.name === 'string' && typeof actualTaskName === 'string' && template.name.toLowerCase() === actualTaskName.toLowerCase()
        );
        if (!matchingTemplate && typeof actualTaskName === 'string' && actualTaskName.toLowerCase().includes('cutting')) {
          matchingTemplate = taskTemplates.find((template: any) => {
            const name = typeof template.name === 'string' ? template.name.toLowerCase() : '';
            return name.includes('cutting') && name.includes(actualTaskName.toLowerCase().replace('cutting ', ''));
          });
        }
        if (!matchingTemplate && typeof actualTaskName === 'string') {
          const taskWords = actualTaskName.toLowerCase().split(' ');
          matchingTemplate = taskTemplates.find((template: any) => {
            const templateWords = typeof template.name === 'string' ? template.name.toLowerCase().split(' ') : [];
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
        }
        if (!matchingTemplate && typeof actualTaskName === 'string') {
          matchingTemplate = taskTemplates.find((template: any) => {
            const name = typeof template.name === 'string' ? template.name.toLowerCase() : '';
            const taskNameLower = actualTaskName.toLowerCase();
            const templateWords = name.split(' ').filter((word: string) => word.length > 3);
            const taskWords = taskNameLower.split(' ').filter((word: string) => word.length > 3);
            return taskWords.every((taskWord: string) => templateWords.some((templateWord: string) => templateWord.includes(taskWord) || taskWord.includes(templateWord)));
          });
        }
        const matchingTaskTemplateId = matchingTemplate?.id || null;
        // Extract amount and unit from taskItem
        let amount = taskItem.amount;
        let unit = taskItem.unit;
        const insertObj = {
          event_id: selectedProject,
          user_id: user?.id,
          name: taskName,
          task_name: userTaskName,
          description: results.name || '',
          unit: typeof taskName === 'string' && taskName.toLowerCase() === 'cutting slabs' ? 'slabs' : (unit || ''),
          amount: `${amount} ${unit}`.trim(),
          hours_worked: taskItem.hours || 0,
          is_finished: false,
          event_task_id: matchingTaskTemplateId,
          company_id: companyId
        };
        console.log('Inserting breakdown task into tasks_done:', insertObj);
        const { error } = await supabase.from('tasks_done').insert(insertObj);
        if (error) {
          console.error('Supabase insert error (breakdown):', error);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } else {
      // No breakdown, do nothing and show error
      console.error('No task breakdown found in calculator results. No tasks were added.');
    }
    setShowTaskModal(false);
    setShowMainTaskModal(false);
    setShowNamePrompt(false);
    setMainTaskResults(null);
    setMainTaskName('');
    setSelectedProject('');
  };

  if (isProjectsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackButton />
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
          <button
            onClick={() => setShowTaskModal(true)}
            className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 w-full sm:w-auto"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Task
          </button>
          <button
            onClick={() => setShowMaterialModal(true)}
            className="inline-flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 w-full sm:w-auto"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Materials
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <div
            key={project.id}
            className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow cursor-pointer"
            onClick={() => navigate(`/events/${project.id}`)}
          >
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{project.title}</h3>
              <p className="text-gray-600 mb-4">{project.description}</p>
              <div className="flex items-center text-sm text-gray-500 mb-4">
                <Calendar className="w-4 h-4 mr-2" />
                <span>
                  {project.start_date ? format(parseISO(project.start_date), 'MMM dd, yyyy') : 'Date not set'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(project.status)}`}>
                  {formatStatus(project.status)}
                </span>
                {project.has_materials && (
                  <Package className="w-5 h-5 text-gray-400" />
                )}
              </div>
              {project.tasks && project.tasks.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-600">
                    Tasks: {project.tasks.length} | Hours: {project.tasks.reduce((sum, t) => sum + (t.hours_worked || 0), 0).toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <Modal title="Add Task" onClose={() => setShowTaskModal(false)}>
          <div className="flex flex-col h-[calc(100vh-16rem)]">
            <div className="space-y-4 flex-none">
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Project</label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Please select a project</option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>{proj.title}</option>
                  ))}
                </select>
                {!selectedProject && (
                  <p className="mt-2 text-sm text-red-600">Please select a project to continue</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsMainTaskMode(false)}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                    !isMainTaskMode 
                      ? 'bg-blue-600 text-white hover:border-2 hover:border-blue-400' 
                      : 'bg-gray-100 text-gray-700 hover:border-2 hover:border-blue-400'
                  }`}
                >
                  Minor Task
                </button>
                <button
                  onClick={() => setIsMainTaskMode(true)}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                    isMainTaskMode 
                      ? 'bg-blue-600 text-white hover:border-2 hover:border-blue-400' 
                      : 'bg-gray-100 text-gray-700 hover:border-2 hover:border-blue-400'
                  }`}
                >
                  Main Task
                </button>
              </div>
            </div>
            {!isMainTaskMode ? (
              <>
                <div className="flex flex-col h-[calc(100vh-16rem)]">
                  <div className="space-y-2 flex-none">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Search Tasks</label>
                      <div className="relative mt-1">
                        <input
                          type="text"
                          value={taskSearch}
                          onChange={(e) => setTaskSearch(e.target.value)}
                          className="block w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500"
                          placeholder="Search tasks..."
                        />
                        <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex-1 w-full">
                    {selectedTask ? (
                      <div
                        key={selectedTask.id}
                        onClick={() => {
                          setSelectedTask(null);
                          setTaskName('');
                        }}
                        className="w-full bg-gray-700 text-white p-2 rounded-lg cursor-pointer hover:bg-gray-600"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{selectedTask.name}</div>
                            <div className="text-sm text-gray-300">{selectedTask.description}</div>
                            <div className="text-sm mt-1">
                              <span className="text-gray-300">Unit: {selectedTask.unit}</span>
                              <span className="ml-3 text-gray-300">Est. Hours: {selectedTask.estimated_hours.toFixed(2)} per unit</span>
                            </div>
                          </div>
                          <div className="text-sm text-blue-300 ml-2">Click to change</div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {taskTemplates.map(task => (
                          <div
                            key={task.id}
                            onClick={() => {
                              setSelectedTask(task);
                              setTaskName(task.name);
                            }}
                            className="p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-gray-200 hover:border-blue-200 transition-all"
                          >
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">{task.name}</h3>
                              <p className="text-xs mt-0.5 text-gray-600">{task.description}</p>
                              <div className="flex items-center mt-1 space-x-3">
                                <span className="text-xs text-gray-500">Unit: {task.unit}</span>
                                <span className="text-xs text-gray-500">Est. Hours: {parseFloat(task.estimated_hours.toFixed(2))} per unit</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedTask && (
                    <div className="mt-2 pt-2 border-t space-y-2 flex-none">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Task Name</label>
                        <div className="mt-1 flex items-center space-x-2">
                          <CheckSquare className="w-5 h-5 text-blue-500 flex-none" />
                          <input
                            type="text"
                            value={taskName}
                            onChange={(e) => setTaskName(e.target.value)}
                            placeholder={selectedTask.name}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Quantity ({selectedTask.unit})</label>
                        <input
                          type="number"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder={`Enter quantity in ${selectedTask.unit}`}
                        />
                      </div>
                      <button
                        onClick={handleTaskSubmit}
                        disabled={!selectedProject || !selectedTask || !quantity || addTaskMutation.isPending}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {addTaskMutation.isPending ? 'Adding...' : 'Add Task'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Main Task Selection UI (inline, not a separate modal) */}
                <div className="space-y-4 flex-none">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Select Main Task Type</label>
                    <div className="space-y-4 mt-2">
                      {calculatorGroups.filter(group => group.type !== 'aggregate').map((group) => (
                        <div key={group.type} className="space-y-2">
                          <h4 className="font-medium text-gray-800">{group.label}</h4>
                          <div className="pl-4 space-y-2">
                            {group.subTypes.map((subType) => (
                              <button
                                key={subType.type}
                                onClick={() => {
                                  setSelectedCalculator(group.type);
                                  setSelectedSubCalculator(subType.type);
                                }}
                                className={`w-full text-left p-2 rounded-md ${selectedCalculator === group.type && selectedSubCalculator === subType.type ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                              >
                                {subType.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Calculator UI (inline) */}
                {selectedCalculator && selectedSubCalculator && (
                  <div className="mt-4 flex-1 overflow-y-auto min-h-0">
                    <CalculatorModal
                      calculatorType={selectedCalculator}
                      calculatorSubType={selectedSubCalculator}
                      onClose={() => {
                        setSelectedCalculator(null);
                        setSelectedSubCalculator(null);
                      }}
                      onSaveResults={handleAddMainTask}
                      mode="AddTask"
                      eventId={selectedProject}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </Modal>
      )}

      {showNamePrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Enter Task Name</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">Select Project</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">Please select a project</option>
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>{proj.title}</option>
                ))}
              </select>
              {!selectedProject && (
                <p className="mt-2 text-sm text-red-600">Please select a project to continue</p>
              )}
            </div>
            <input
              type="text"
              value={mainTaskName}
              onChange={(e) => setMainTaskName(e.target.value)}
              placeholder="Enter task name"
              className="w-full p-2 border rounded mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setMainTaskName('');
                  setMainTaskResults(null);
                  setShowNamePrompt(false);
                }}
                className="px-4 py-2 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMainTaskName}
                disabled={!mainTaskName.trim() || !selectedProject}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Materials Modal */}
      {showMaterialModal && (
        <Modal title="Add Materials" onClose={() => setShowMaterialModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Select Project</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">Please select a project</option>
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>{proj.title}</option>
                ))}
              </select>
              {!selectedProject && (
                <p className="mt-2 text-sm text-red-600">Please select a project to continue</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Search Materials</label>
              <div className="relative mt-1">
                <input
                  type="text"
                  value={materialSearch}
                  onChange={(e) => setMaterialSearch(e.target.value)}
                  className="block w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Search materials..."
                />
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </div>
            <div className="mt-4 max-h-60 overflow-y-auto">
              {/* Add "Other" option at the top */}
              <div
                onClick={() => {
                  setShowMaterialModal(false);
                  setShowUnspecifiedMaterialModal(true);
                }}
                className="p-3 hover:bg-gray-50 rounded-lg cursor-pointer mb-2 border-2 border-dashed border-gray-300"
              >
                <h3 className="font-medium">Other (Custom Material)</h3>
                <p className="text-sm text-gray-600">Add a custom material not in the list</p>
              </div>
              
              {/* Existing materials list */}
              {materials.map(material => (
                <div
                  key={material.id}
                  onClick={() => setSelectedMaterial(material)}
                  className={`p-3 hover:bg-gray-50 rounded-lg cursor-pointer ${
                    selectedMaterial?.id === material.id ? 'border-4 border-blue-500' : ''
                  }`}
                >
                  <h3 className="font-medium">{material.name}</h3>
                  <p className="text-sm text-gray-600">{material.description}</p>
                  <p className="text-xs text-gray-500">Unit: {material.unit}</p>
                </div>
              ))}
            </div>
            {selectedMaterial && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Quantity ({selectedMaterial.unit})
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder={`Enter quantity in ${selectedMaterial.unit}`}
                />
              </div>
            )}
            <button
              onClick={handleMaterialSubmit}
              disabled={!selectedProject || !selectedMaterial || !quantity || addMaterialMutation.isPending}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {addMaterialMutation.isPending ? 'Adding...' : 'Add Material'}
            </button>
          </div>
        </Modal>
      )}

      {showUnspecifiedMaterialModal && (
        <UnspecifiedMaterialModal
          onClose={() => {
            setShowUnspecifiedMaterialModal(false);
            setShowMaterialModal(true);
          }}
          onSave={handleAddUnspecifiedMaterial}
          projects={projects.map(project => ({
            id: project.id,
            title: project.title
          }))}
        />
      )}
    </div>
  );
};

export default Projects;
