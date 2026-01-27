import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Loader2, Plus, X, CheckSquare } from 'lucide-react';
import BackButton from '../components/BackButton';

interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  unit: string;
  estimated_hours: number;
}

interface MaterialTemplate {
  id: string;
  name: string;
  description: string;
  unit: string;
}

interface TaskInput {
  template_id: string;
  name: string;
  quantity: number;
  unit: string;
}

interface MaterialInput {
  template_id: string;
  quantity: number;
}

const EventForm = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    status: 'planned',
    has_equipment: false,
    has_materials: false
  });
  const [tasks, setTasks] = useState<TaskInput[]>([]);
  const [materials, setMaterials] = useState<MaterialInput[]>([]);

  // Fetch task templates
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['event_tasks_with_dynamic_estimates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data as TaskTemplate[];
    },
    enabled: !!companyId
  });

  // Fetch material templates
  const { data: materialTemplates = [] } = useQuery({
    queryKey: ['materials', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data as MaterialTemplate[];
    },
    enabled: !!companyId
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      console.log('DEBUG EventForm: companyId =', companyId);
      
      if (!companyId) {
        throw new Error('ERROR: companyId is null! User must have a company assigned.');
      }
      
      // First create the event
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          ...data,
          company_id: companyId,
          created_by: user?.id
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // Then create tasks
      if (tasks.length > 0) {
        const tasksToCreate = tasks.map(task => {
          const template = taskTemplates.find(t => t.id === task.template_id);
          if (!template) return null;
          return {
            event_id: event.id,
            user_id: user?.id,
            name: task.name || template.name,
            description: template.description,
            amount: `${task.quantity} ${task.unit || template.unit}`,
            hours_worked: template.estimated_hours * task.quantity,
            unit: task.unit || template.unit,
            company_id: companyId
          };
        }).filter(Boolean);

        const { error: tasksError } = await supabase
          .from('tasks_done')
          .insert(tasksToCreate);

        if (tasksError) throw tasksError;
      }

      // Then create materials
      if (materials.length > 0) {
        const materialsToCreate = materials.map(material => {
          const template = materialTemplates.find(m => m.id === material.template_id);
          if (!template) return null;
          return {
            event_id: event.id,
            name: template.name,
            amount: 0,
            total_amount: material.quantity,
            unit: template.unit,
            company_id: companyId,
            status: 'pending'
          };
        }).filter(Boolean);

        const { error: materialsError } = await supabase
          .from('materials_delivered')
          .insert(materialsToCreate);

        if (materialsError) throw materialsError;
      }
    },
    onSuccess: () => {
      navigate('/calendar');
    }
  });

  const handleAddTask = () => {
    setTasks(prev => [...prev, { template_id: '', name: '', quantity: 1, unit: '' }]);
  };

  const handleAddMaterial = () => {
    // Add new material at the beginning of the array
    setMaterials(prev => [{ template_id: '', quantity: 1 }, ...prev]);
  };

  const handleRemoveTask = (index: number) => {
    setTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveMaterial = (index: number) => {
    setMaterials(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.start_date || !formData.end_date) return;
    createEventMutation.mutate(formData);
  };

  const getTemplateUnits = (templateId: string): string[] => {
    const template = taskTemplates.find(t => t.id === templateId);
    if (!template) return [];

    // Add common alternative units based on the template's unit
    switch (template.unit.toLowerCase()) {
      case 'meters':
        return ['meters', 'centimeters', 'kilometers'];
      case 'square meters':
        return ['square meters', 'square feet', 'square yards'];
      case 'cubic meters':
        return ['cubic meters', 'cubic feet', 'liters'];
      case 'pieces':
        return ['pieces', 'units', 'sets'];
      case 'hours':
        return ['hours', 'days', 'weeks'];
      default:
        return [template.unit];
    }
  };

  return (
    <div className="container mx-auto p-6">
      <BackButton />
      <div className="max-w-3xl mx-auto mt-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Event</h1>
        
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Information */}
          <div className="bg-white p-6 rounded-lg shadow space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
            
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
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">End Date</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  min={formData.start_date}
                  required
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

          {/* Tasks Section */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Tasks</h2>
              <button
                type="button"
                onClick={handleAddTask}
                className="flex items-center text-sm text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Task
              </button>
            </div>

            <div className="space-y-4">
              {tasks.map((task, index) => {
                const template = taskTemplates.find(t => t.id === task.template_id);
                return (
                  <div key={index} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Task Type</label>
                        <select
                          value={task.template_id}
                          onChange={(e) => {
                            const newTasks = [...tasks];
                            const selectedTemplate = taskTemplates.find(t => t.id === e.target.value);
                            newTasks[index] = {
                              ...newTasks[index],
                              template_id: e.target.value,
                              name: selectedTemplate?.name || '',
                              unit: selectedTemplate?.unit || ''
                            };
                            setTasks(newTasks);
                          }}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                          <option value="">Select a task type</option>
                          {taskTemplates.map(template => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {task.template_id && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Task Name</label>
                          <div className="mt-1 flex items-center space-x-2">
                            <CheckSquare className="w-5 h-5 text-blue-500" />
                            <input
                              type="text"
                              value={task.name}
                              onChange={(e) => {
                                const newTasks = [...tasks];
                                newTasks[index].name = e.target.value;
                                setTasks(newTasks);
                              }}
                              placeholder={template?.name || 'Enter task name'}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Quantity</label>
                          <input
                            type="number"
                            min="1"
                            value={task.quantity}
                            onChange={(e) => {
                              const newTasks = [...tasks];
                              newTasks[index].quantity = parseInt(e.target.value) || 1;
                              setTasks(newTasks);
                            }}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Unit</label>
                          <select
                            value={task.unit}
                            onChange={(e) => {
                              const newTasks = [...tasks];
                              newTasks[index].unit = e.target.value;
                              setTasks(newTasks);
                            }}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          >
                            <option value="">Select unit</option>
                            {getTemplateUnits(task.template_id).map(unit => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {template && (
                        <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-md">
                          <p className="font-medium text-blue-700 mb-1">Task Details</p>
                          <p>{template.description}</p>
                          <p className="mt-1">
                            <span className="text-blue-600">Estimated hours per unit:</span>{' '}
                            {template.estimated_hours}
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveTask(index)}
                      className="p-1 text-red-600 hover:text-red-700"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Materials Section */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Materials</h2>
              <button
                type="button"
                onClick={handleAddMaterial}
                className="flex items-center text-sm text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Material
              </button>
            </div>

            <div className="space-y-4">
              {materials.map((material, index) => (
                <div key={index} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Material</label>
                      <select
                        value={material.template_id}
                        onChange={(e) => {
                          const newMaterials = [...materials];
                          newMaterials[index].template_id = e.target.value;
                          setMaterials(newMaterials);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      >
                        <option value="">Select a material</option>
                        {materialTemplates.map(template => (
                          <option key={template.id} value={template.id}>
                            {template.name} ({template.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={material.quantity}
                        onChange={(e) => {
                          const newMaterials = [...materials];
                          newMaterials[index].quantity = parseInt(e.target.value) || 1;
                          setMaterials(newMaterials);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>

                    {materialTemplates.find(t => t.id === material.template_id)?.description && (
                      <div className="text-sm text-gray-600 bg-green-50 p-3 rounded-md">
                        {materialTemplates.find(t => t.id === material.template_id)?.description}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveMaterial(index)}
                    className="p-1 text-red-600 hover:text-red-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createEventMutation.isPending}
              className="flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 min-w-[200px]"
            >
              {createEventMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Create Event'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EventForm;
