import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import TaskProgressModal from './TaskProgressModal';
import { format } from 'date-fns';
import { useAuthStore } from '../lib/store';
import Modal from './Modal';
import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import UnspecifiedMaterialModal from './UnspecifiedMaterialModal';

interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  unit: string;
  estimated_hours: number;
}

interface AdditionalTaskMaterial {
  material: string;
  quantity: string | number;
  unit: string;
}

interface NewTaskDetails {
  description: string;
  hours_needed: string;
  quantity: string;
  materials: AdditionalTaskMaterial[];
}

interface MaterialTemplate {
  id: string;
  name: string;
  unit: string;
}

const UserHoursPage: React.FC = () => {
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProject, setSelectedProject] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressTask, setProgressTask] = useState<any>(null);
  const [showAdditionalTaskProgressModal, setShowAdditionalTaskProgressModal] = useState(false);
  const [selectedAdditionalTask, setSelectedAdditionalTask] = useState<any>(null);
  const [showAdditionalTaskModal, setShowAdditionalTaskModal] = useState(false);
  const [progressDetails, setProgressDetails] = useState({ progress: '', hoursWorked: '', notes: '' });
  const [isUpdating, setIsUpdating] = useState(false);
  const [newTaskDetails, setNewTaskDetails] = useState<NewTaskDetails>({
    description: '',
    hours_needed: '',
    quantity: '',
    materials: []
  });
  const [selectedTaskTemplate, setSelectedTaskTemplate] = useState<string>('');
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskDetails, setTaskDetails] = useState<{
    description: string;
    start_date: string;
    end_date: string;
    hours_needed: string;
    quantity: string;
    materials: AdditionalTaskMaterial[];
  }>({
    description: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    hours_needed: '',
    quantity: '',
    materials: []
  });
  const [materialDetails, setMaterialDetails] = useState({
    material: '',
    quantity: '',
    unit: '',
  });
  const [showUnspecifiedMaterialModal, setShowUnspecifiedMaterialModal] = useState(false);
  const [selectedMaterialIndex, setSelectedMaterialIndex] = useState<number | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);

  const queryClient = useQueryClient();

  // Fetch projects (match Projects.tsx logic)
  const { data: projects = [], isLoading: isProjectsLoading } = useQuery({
    queryKey: ['events', companyId],
    queryFn: async () => {
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('company_id', companyId)
        .order('start_date', { ascending: true });
      if (eventsError) throw eventsError;
      return events;
    },
    enabled: !!companyId
  });

  // Fetch tasks for selected project
  const { data: tasks = [], isLoading: isTasksLoading } = useQuery({
    queryKey: ['tasks', selectedProject, companyId],
    queryFn: async () => {
      if (!selectedProject) return [];
      const { data, error } = await supabase
        .from('tasks_done')
        .select('*')
        .eq('event_id', selectedProject)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedProject && !!companyId
  });

  // Fetch folders for selected project
  const { data: folders = [], isLoading: isFoldersLoading } = useQuery({
    queryKey: ['task_folders', selectedProject, companyId],
    queryFn: async () => {
      if (!selectedProject) return [];
      const { data, error } = await supabase
        .from('task_folders')
        .select('*')
        .eq('event_id', selectedProject)
        .eq('company_id', companyId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedProject && !!companyId
  });

  // Fetch additional tasks for selected project
  const { data: additionalTasks = [], isLoading: isAdditionalTasksLoading } = useQuery({
    queryKey: ['additional_tasks', selectedProject, companyId],
    queryFn: async () => {
      if (!selectedProject) return [];
      const { data, error } = await supabase
        .from('additional_tasks')
        .select('*')
        .eq('event_id', selectedProject)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedProject && !!companyId
  });

  // Filter tasks by search
  const filteredTasks = tasks.filter(task =>
    task.name?.toLowerCase().includes(taskSearch.toLowerCase())
  );
  const filteredAdditionalTasks = additionalTasks.filter(task =>
    task.description?.toLowerCase().includes(taskSearch.toLowerCase())
  );

  // Group tasks by folder
  const tasksByFolder: Record<string, any[]> = {};
  filteredTasks.forEach(task => {
    const folderId = task.folder_id || 'unorganized';
    if (!tasksByFolder[folderId]) tasksByFolder[folderId] = [];
    tasksByFolder[folderId].push(task);
  });

  // Auto-expand folders with matching search results
  useEffect(() => {
    if (taskSearch) {
      const foldersWithMatches = Object.keys(tasksByFolder).filter(
        folderId => tasksByFolder[folderId]?.length > 0
      );
      setExpandedFolders(prev => {
        const newExpanded = [...new Set([...prev, ...foldersWithMatches])];
        return newExpanded;
      });
    }
  }, [taskSearch, tasksByFolder]);

  // Helper to combine selected date with current time
  function getCreatedAt(selectedDate: string) {
    const now = new Date();
    const [year, month, day] = selectedDate.split('-');
    // Use current time, but override date
    now.setFullYear(Number(year));
    now.setMonth(Number(month) - 1);
    now.setDate(Number(day));
    // Format as ISO string without milliseconds
    return now.toISOString().split('.')[0];
  }

  // Fetch task templates
  useEffect(() => {
    const fetchTaskTemplates = async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      
      if (error) {
        console.error('Error fetching task templates:', error);
        return;
      }
      
      setTaskTemplates(data || []);
    };

    if (companyId) {
      fetchTaskTemplates();
    }
  }, [companyId]);

  const handleTaskTemplateChange = (templateId: string) => {
    setSelectedTaskTemplate(templateId);
    if (templateId === 'other') {
      setTaskDetails(prev => ({
        ...prev,
        description: '',
        quantity: '',
        hours_needed: ''
      }));
    } else {
      const template = taskTemplates.find(t => t.id === templateId);
      if (template) {
        setTaskDetails(prev => ({
          ...prev,
          description: template.name,
          quantity: '1',
          hours_needed: (template.estimated_hours).toString()
        }));
      }
    }
  };

  const handleAddMaterial = () => {
    setTaskDetails(prev => ({
      ...prev,
      materials: [...prev.materials, { material: '', quantity: '', unit: '' }]
    }));
  };

  const handleRemoveMaterial = (index: number) => {
    setTaskDetails(prev => ({
      ...prev,
      materials: prev.materials.filter((_: any, i: number) => i !== index)
    }));
  };

  const handleMaterialChange = (index: number, field: 'material' | 'quantity' | 'unit', value: string) => {
    setTaskDetails(prev => ({
      ...prev,
      materials: prev.materials.map((m: any, i: number) => {
        if (i === index) {
          if (field === 'material') {
            const template = taskTemplates.find((t: any) => t.name === value);
            return {
              ...m,
              [field]: value,
              unit: template?.unit || m.unit
            };
          }
          return { ...m, [field]: value };
        }
        return m;
      })
    }));
  };

  const calculateHoursNeeded = (quantity: string | number, baseHours: number) => {
    const qty = parseFloat(quantity.toString()) || 0;
    return (qty * baseHours).toString();
  };

  const handleQuantityChange = (value: string) => {
    const template = taskTemplates.find((t: any) => t.id === selectedTaskTemplate);
    const baseHours = template ? template.estimated_hours : 0;
    setTaskDetails(prev => ({
      ...prev,
      quantity: value,
      hours_needed: calculateHoursNeeded(value, baseHours)
    }));
  };

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not logged in');
      const { data: task, error: taskError } = await supabase
        .from('additional_tasks')
        .insert({
          event_id: selectedProject,
          user_id: user.id,
          description: taskDetails.description,
          start_date: taskDetails.start_date,
          end_date: taskDetails.end_date,
          hours_needed: parseFloat(taskDetails.hours_needed.toString()),
          quantity: parseFloat(taskDetails.quantity.toString()),
          company_id: companyId,
          hours_spent: 0,
          progress: 0,
          is_finished: false
        })
        .select()
        .single();
      if (taskError) throw taskError;
      if (taskDetails.materials && taskDetails.materials.length > 0) {
        const validMaterials = taskDetails.materials.filter(m => m.material && m.quantity);
        if (validMaterials.length > 0) {
          const { error: materialsError } = await supabase
            .from('additional_materials')
            .insert(
              validMaterials.map(material => ({
                event_id: selectedProject,
                user_id: user.id,
                material: material.material,
                quantity: parseFloat(material.quantity.toString()),
                unit: material.unit,
                company_id: companyId
              }))
            );
          if (materialsError) throw materialsError;
        }
      }
      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['additional_tasks'] });
      queryClient.invalidateQueries({ queryKey: ['additional_materials'] });
      setShowTaskModal(false);
      setTaskDetails({
        description: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        hours_needed: '',
        quantity: '',
        materials: []
      });
      setSelectedTaskTemplate('');
    },
    onError: (error) => {
      console.error('Error in addTaskMutation:', error);
      alert('Failed to create task. Please try again.');
    }
  });

  const handleTaskSubmit = () => {
    if (!taskDetails.description || !taskDetails.start_date || !taskDetails.end_date || !taskDetails.hours_needed) return;
    addTaskMutation.mutate();
  };

  // Add toggle folder function
  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => 
      prev.includes(folderId) 
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Add Hours Progress</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Project</label>
            <select
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Select a project</option>
              {projects.map((proj: any) => (
                <option key={proj.id} value={proj.id}>{proj.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Search Tasks</label>
            <input
              type="text"
              value={taskSearch}
              onChange={e => setTaskSearch(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Search tasks..."
            />
          </div>
        </div>
        {/* Tasks List */}
        <div className="mt-4">
          <div className="font-semibold mb-2">Tasks</div>
          {isTasksLoading || isFoldersLoading ? (
            <div className="text-center text-gray-400">Loading tasks...</div>
          ) : (
            <>
              {folders.map((folder: any) => (
                <div key={folder.id} className="mb-4">
                  {/* Only show folder if it has matching tasks when searching */}
                  {(!taskSearch || tasksByFolder[folder.id]?.length > 0) && (
                    <>
                      <div 
                        className="font-medium text-white text-base mb-1 flex items-center justify-between cursor-pointer" 
                        style={{ background: '#1e293b', borderRadius: '0.375rem', padding: '0.25rem 0.75rem' }}
                        onClick={() => toggleFolder(folder.id)}
                      >
                        <div className="flex items-center">
                          {expandedFolders.includes(folder.id) ? (
                            <ChevronDown className="w-4 h-4 mr-2" />
                          ) : (
                            <ChevronRight className="w-4 h-4 mr-2" />
                          )}
                          {folder.name}
                          {taskSearch && tasksByFolder[folder.id]?.length > 0 && (
                            <span className="ml-2 text-sm bg-blue-500 px-2 py-0.5 rounded-full">
                              {tasksByFolder[folder.id].length}
                            </span>
                          )}
                        </div>
                      </div>
                      {expandedFolders.includes(folder.id) && (
                        <div className="space-y-2">
                          {(tasksByFolder[folder.id] || []).map(task => (
                            <div key={task.id} className="bg-gray-50 p-2 rounded flex items-center justify-between">
                              <span>{task.name}</span>
                              <button
                                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                                onClick={() => { setProgressTask(task); setShowProgressModal(true); }}
                              >
                                Update Progress
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              {/* Unorganized tasks */}
              {(tasksByFolder['unorganized'] || []).length > 0 && (!taskSearch || tasksByFolder['unorganized']?.length > 0) && (
                <div className="mb-4">
                  <div 
                    className="font-medium text-white text-base mb-1 flex items-center justify-between cursor-pointer" 
                    style={{ background: '#1e293b', borderRadius: '0.375rem', padding: '0.25rem 0.75rem' }}
                    onClick={() => toggleFolder('unorganized')}
                  >
                    <div className="flex items-center">
                      {expandedFolders.includes('unorganized') ? (
                        <ChevronDown className="w-4 h-4 mr-2" />
                      ) : (
                        <ChevronRight className="w-4 h-4 mr-2" />
                      )}
                      Other Tasks
                      {taskSearch && tasksByFolder['unorganized']?.length > 0 && (
                        <span className="ml-2 text-sm bg-blue-500 px-2 py-0.5 rounded-full">
                          {tasksByFolder['unorganized'].length}
                        </span>
                      )}
                    </div>
                  </div>
                  {expandedFolders.includes('unorganized') && (
                    <div className="space-y-2">
                      {tasksByFolder['unorganized'].map(task => (
                        <div key={task.id} className="bg-gray-50 p-2 rounded flex items-center justify-between">
                          <span>{task.name}</span>
                          <button
                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                            onClick={() => { setProgressTask(task); setShowProgressModal(true); }}
                          >
                            Update Progress
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* No results message */}
              {taskSearch && Object.values(tasksByFolder).every(tasks => tasks.length === 0) && (
                <div className="bg-gray-50 p-4 rounded-lg text-gray-500 text-center">
                  No tasks found matching "{taskSearch}"
                </div>
              )}
              {/* Empty state message */}
              {!taskSearch && folders.length === 0 && (tasksByFolder['unorganized'] || []).length === 0 && (
                <div className="bg-gray-50 p-4 rounded-lg text-gray-500 text-center">
                  No tasks found for this project.
                </div>
              )}
            </>
          )}
        </div>
        {/* Additional Tasks */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4" style={{ background: '#1e293b', borderRadius: '0.375rem', padding: '0.25rem 0.75rem' }}>
            <span className="font-medium text-white text-base">Additional Tasks</span>
            <button
              onClick={() => setShowTaskModal(true)}
              className="inline-flex items-center px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              style={{ fontSize: '0.95rem', height: '2rem' }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Task
            </button>
          </div>
          {isAdditionalTasksLoading ? (
            <div className="text-center text-gray-400">Loading additional tasks...</div>
          ) : (
            <div className="space-y-2">
              {filteredAdditionalTasks.map(task => (
                <div key={task.id} className="bg-gray-50 p-2 rounded flex items-center justify-between">
                  <span>{task.description}</span>
                  <button
                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                    onClick={() => {
                      setSelectedAdditionalTask(task);
                      setProgressDetails({ progress: '', hoursWorked: '', notes: '' });
                      setShowAdditionalTaskProgressModal(true);
                    }}
                  >
                    Update Progress
                  </button>
                </div>
              ))}
              {filteredAdditionalTasks.length === 0 && (
                <div className="bg-gray-50 p-4 rounded-lg text-gray-500 text-center">
                  No additional tasks found for this project.
                </div>
              )}
            </div>
          )}
        </div>
        {/* Progress Modal for normal tasks */}
        {showProgressModal && progressTask && progressTask.name && (
          <TaskProgressModal
            task={progressTask}
            onClose={() => { setShowProgressModal(false); setProgressTask(null); }}
            createdAt={getCreatedAt(selectedDate)}
          />
        )}
        {/* Progress Modal for additional tasks */}
        {showAdditionalTaskProgressModal && selectedAdditionalTask && (
          <Modal title="Update Additional Task Progress" onClose={() => { setShowAdditionalTaskProgressModal(false); setSelectedAdditionalTask(null); }}>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Current Progress:</span> {selectedAdditionalTask.progress || 0}%
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Hours Worked:</span> {selectedAdditionalTask.hours_spent || 0} / {selectedAdditionalTask.hours_needed || 0} hours
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Progress (%)</label>
                <input
                  type="number"
                  value={progressDetails.progress}
                  onChange={e => setProgressDetails(prev => ({ ...prev, progress: e.target.value }))}
                  min="0"
                  max="100"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter progress percentage"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Hours Worked</label>
                <input
                  type="number"
                  value={progressDetails.hoursWorked}
                  onChange={e => setProgressDetails(prev => ({ ...prev, hoursWorked: e.target.value }))}
                  min="0"
                  step="0.5"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter hours worked"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                <textarea
                  value={progressDetails.notes}
                  onChange={e => setProgressDetails(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Add any notes about this progress update"
                />
              </div>
              <button
                onClick={async () => {
                  if (!user?.id || !selectedAdditionalTask?.id || !progressDetails.progress || !progressDetails.hoursWorked) return;
                  setIsUpdating(true);
                  try {
                    // Insert progress entry
                    const { error: entryError } = await supabase
                      .from('additional_task_progress_entries')
                      .insert({
                        task_id: selectedAdditionalTask.id,
                        user_id: user.id,
                        event_id: selectedAdditionalTask.event_id,
                        progress_percentage: parseFloat(progressDetails.progress),
                        hours_spent: parseFloat(progressDetails.hoursWorked),
                        notes: progressDetails.notes || null,
                        created_at: getCreatedAt(selectedDate),
                        company_id: companyId
                      });
                    if (entryError) throw entryError;
                    // Fetch all progress entries for this task
                    const { data: entries } = await supabase
                      .from('additional_task_progress_entries')
                      .select('progress_percentage, hours_spent')
                      .eq('task_id', selectedAdditionalTask.id);
                    // Calculate totals
                    const totalProgress = Math.min((entries || []).reduce((sum, entry) => sum + (entry.progress_percentage || 0), 0), 100);
                    const totalHours = (entries || []).reduce((sum, entry) => sum + (entry.hours_spent || 0), 0);
                    // Update the additional_tasks table
                    const { error: taskError } = await supabase
                      .from('additional_tasks')
                      .update({
                        progress: totalProgress,
                        hours_spent: totalHours,
                        is_finished: totalProgress >= 100
                      })
                      .eq('id', selectedAdditionalTask.id);
                    if (taskError) throw taskError;
                    setShowAdditionalTaskProgressModal(false);
                    setSelectedAdditionalTask(null);
                    setProgressDetails({ progress: '', hoursWorked: '', notes: '' });
                    // Optionally refetch additional tasks
                  } catch (err) {
                    alert('Failed to update progress. Please try again.');
                  } finally {
                    setIsUpdating(false);
                  }
                }}
                disabled={isUpdating || !progressDetails.progress || !progressDetails.hoursWorked}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isUpdating ? 'Updating...' : 'Update Progress'}
              </button>
            </div>
          </Modal>
        )}
        {/* Add Additional Task Modal */}
        {showTaskModal && (
          <Modal title="Add Additional Task" onClose={() => setShowTaskModal(false)}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Task Type</label>
                <select
                  value={selectedTaskTemplate}
                  onChange={(e) => handleTaskTemplateChange(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Select a task type</option>
                  {taskTemplates.map((template: any) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                  <option value="other">Other (Custom Task)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Task Description</label>
                <textarea
                  value={taskDetails.description}
                  onChange={(e) => setTaskDetails({ ...taskDetails, description: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={3}
                  placeholder="Describe the task"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Date</label>
                  <input
                    type="date"
                    value={taskDetails.start_date}
                    onChange={(e) => setTaskDetails({ ...taskDetails, start_date: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">End Date</label>
                  <input
                    type="date"
                    value={taskDetails.end_date}
                    onChange={(e) => setTaskDetails({ ...taskDetails, end_date: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    min={taskDetails.start_date}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Quantity {selectedTaskTemplate && taskTemplates.find((t: any) => t.id === selectedTaskTemplate)?.unit ?
                    `(${taskTemplates.find((t: any) => t.id === selectedTaskTemplate)?.unit})` : ''}
                </label>
                <input
                  type="number"
                  value={taskDetails.quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter quantity"
                  min="0"
                  step="0.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Hours Needed (Auto-calculated)</label>
                <input
                  type="number"
                  value={taskDetails.hours_needed}
                  readOnly
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50"
                  placeholder="Hours will be calculated based on quantity"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Materials Needed</label>
                  <button
                    type="button"
                    onClick={handleAddMaterial}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Add Material
                  </button>
                </div>
                <div className="space-y-3">
                  {taskDetails.materials.map((material: any, index: number) => (
                    <div key={index} className="flex gap-2 items-start">
                      <div className="flex-1">
                        <select
                          value={material.material}
                          onChange={(e) => {
                            if (e.target.value === 'other') {
                              setSelectedMaterialIndex(index);
                              setShowUnspecifiedMaterialModal(true);
                              return;
                            }
                            handleMaterialChange(index, 'material', e.target.value);
                          }}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                          <option value="">Select material</option>
                          <option value="other" className="font-medium text-blue-600">Other (Custom Material)</option>
                          {taskTemplates.map((template: any) => (
                            <option key={template.id} value={template.name}>
                              {template.name} ({template.unit})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24">
                        <input
                          type="number"
                          value={material.quantity}
                          onChange={(e) => handleMaterialChange(index, 'quantity', e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder="Qty"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="w-24">
                        <input
                          type="text"
                          value={material.unit}
                          onChange={(e) => handleMaterialChange(index, 'unit', e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder="Unit"
                          readOnly={!!material.material && material.material !== 'other'}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterial(index)}
                        className="mt-1 text-red-600 hover:text-red-700"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={handleTaskSubmit}
                disabled={addTaskMutation.isPending}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {addTaskMutation.isPending ? 'Adding...' : 'Add Task'}
              </button>
            </div>
          </Modal>
        )}
        {showUnspecifiedMaterialModal && (
          <UnspecifiedMaterialModal
            onClose={() => setShowUnspecifiedMaterialModal(false)}
            onSave={(materialData: any) => {
              if (selectedMaterialIndex === null) return;
              setTaskDetails(prev => ({
                ...prev,
                materials: prev.materials.map((m, idx) => {
                  if (idx === selectedMaterialIndex) {
                    return {
                      material: materialData.name,
                      quantity: materialData.total_amount.toString(),
                      unit: materialData.unit
                    };
                  }
                  return m;
                })
              }));
              setShowUnspecifiedMaterialModal(false);
            }}
            projects={selectedProject ? [{ id: selectedProject, title: 'Current Project' }] : []}
          />
        )}
      </div>
    </div>
  );
};

export default UserHoursPage;
