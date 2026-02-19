import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Plus, X, CheckSquare, Clock, Package } from 'lucide-react';
import Modal from './Modal';
import { useAuthStore } from '../lib/store';
import UnspecifiedMaterialModal from './UnspecifiedMaterialModal';

interface AdditionalTaskMaterial {
  material: string;
  quantity: string | number;
  unit: string;
}

interface AdditionalTask {
  id?: string;
  event_id: string;
  user_id: string;
  description: string;
  start_date: string;
  end_date: string;
  hours_needed: string | number;
  quantity: string | number;
  hours_spent?: number;
  progress?: number;
  is_finished?: boolean;
  materials: AdditionalTaskMaterial[];
}

interface TaskProgressEntry {
  hours_spent: number;
  progress_percentage: number;
}

interface AdditionalMaterial {
  material: string;
  quantity: string;
  unit: string;
}

interface Props {
  eventId: string;
}

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
  unit: string;
}

const AdditionalFeatures: React.FC<Props> = ({ eventId }) => {
  const { t } = useTranslation(['common', 'utilities', 'form', 'project', 'event']);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [selectedTaskTemplate, setSelectedTaskTemplate] = useState<string>('');
  const [selectedMaterialTemplate, setSelectedMaterialTemplate] = useState<string>('');
  const [taskDetails, setTaskDetails] = useState<Omit<AdditionalTask, 'event_id' | 'user_id'>>({
    description: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    hours_needed: '',
    quantity: '',
    materials: []
  });
  const [materialDetails, setMaterialDetails] = useState<AdditionalMaterial>({
    material: '',
    quantity: '',
    unit: '',
  });
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AdditionalTask | null>(null);
  const [progressDetails, setProgressDetails] = useState({
    progress: '',
    hoursWorked: '',
    notes: ''
  });
  const [showUnspecifiedMaterialModal, setShowUnspecifiedMaterialModal] = useState(false);
  const [selectedMaterialIndex, setSelectedMaterialIndex] = useState<number | null>(null);

  // Fetch additional tasks
  const { data: additionalTasks = [] } = useQuery({
    queryKey: ['additional_tasks', eventId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('additional_tasks')
        .select(`
          *,
          profiles (
            full_name
          ),
          additional_task_progress_entries (
            hours_spent,
            created_at,
            progress_percentage
          ),
          additional_task_materials (
            id,
            material,
            quantity,
            unit
          )
        `)
        .eq('event_id', eventId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform the data to include total progress and hours
      return (data || []).map(task => {
        const progressEntries = task.additional_task_progress_entries || [];
        const totalProgress = progressEntries.reduce((sum: number, entry: TaskProgressEntry) => sum + (entry.progress_percentage || 0), 0);
        const totalHours = progressEntries.reduce((sum: number, entry: TaskProgressEntry) => sum + (entry.hours_spent || 0), 0);

        // Transform materials data to match the expected format
        const materials = (task.additional_task_materials || []).map((m: { material: string; quantity: number; unit: string }): AdditionalTaskMaterial => ({
          material: m.material,
          quantity: m.quantity,
          unit: m.unit
        }));

        return {
          ...task,
          progress: Math.min(totalProgress, 100),
          hours_spent: totalHours,
          materials: materials
        };
      });
    },
    enabled: !!companyId && !!eventId
  });

  // Fetch additional materials
  const { data: additionalMaterials = [] } = useQuery({
    queryKey: ['additional_materials', eventId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('additional_materials')
        .select(`
          *,
          profiles (
            full_name
          )
        `)
        .eq('event_id', eventId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!eventId
  });

  // Fetch task templates
  const { data: taskTemplates = [] } = useQuery<TaskTemplate[]>({
    queryKey: ['task_templates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId
  });

  // Fetch material templates
  const { data: materialTemplates = [] } = useQuery<MaterialTemplate[]>({
    queryKey: ['materials', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId
  });

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not logged in');

      // Insert the task
      const { data: task, error: taskError } = await supabase
        .from('additional_tasks')
        .insert({
          event_id: eventId,
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

      // Insert materials to both additional_materials (event-level) and additional_task_materials (task-level)
      if (taskDetails.materials && taskDetails.materials.length > 0) {
        const validMaterials = taskDetails.materials.filter(m => m.material && m.quantity);
        
        if (validMaterials.length > 0) {
          const { error: materialsError } = await supabase
            .from('additional_materials')
            .insert(
              validMaterials.map(material => ({
                event_id: eventId,
                user_id: user.id,
                material: material.material,
                quantity: parseFloat(material.quantity.toString()),
                unit: material.unit,
                company_id: companyId
              }))
            );

          if (materialsError) throw materialsError;

          const { error: taskMaterialsError } = await supabase
            .from('additional_task_materials')
            .insert(
              validMaterials.map(material => ({
                task_id: task.id,
                material: material.material,
                quantity: parseFloat(material.quantity.toString()),
                unit: material.unit,
                company_id: companyId
              }))
            );

          if (taskMaterialsError) throw taskMaterialsError;
        }
      }

      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['additional_tasks', eventId, companyId] });
      queryClient.invalidateQueries({ queryKey: ['additional_materials', eventId, companyId] });
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
      alert(t('common:failed_create_task'));
    }
  });

  const addMaterialMutation = useMutation({
    mutationFn: async (material: AdditionalMaterial) => {
      const { error } = await supabase
        .from('additional_materials')
        .insert({
          event_id: eventId,
          user_id: user?.id,
          material: material.material,
          quantity: parseFloat(material.quantity),
          unit: material.unit,
          company_id: companyId
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['additional_materials', eventId, companyId] });
      setShowMaterialModal(false);
      setMaterialDetails({
        material: '',
        quantity: '',
        unit: '',
      });
      setSelectedMaterialTemplate('');
    },
  });

  const handleTaskSubmit = () => {
    if (!taskDetails.description || !taskDetails.start_date || !taskDetails.end_date || !taskDetails.hours_needed) return;
    addTaskMutation.mutate();
  };

  const handleMaterialSubmit = () => {
    if (!materialDetails.material || !materialDetails.quantity || !materialDetails.unit) return;
    addMaterialMutation.mutate(materialDetails);
  };

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

  // Add function to calculate hours based on quantity
  const calculateHoursNeeded = (quantity: string | number, baseHours: number) => {
    const qty = parseFloat(quantity.toString()) || 0;
    return (qty * baseHours).toString();
  };

  // Update quantity change handler
  const handleQuantityChange = (value: string) => {
    const template = taskTemplates.find(t => t.id === selectedTaskTemplate);
    const baseHours = template ? template.estimated_hours : 0;
    
    setTaskDetails(prev => ({
      ...prev,
      quantity: value,
      hours_needed: calculateHoursNeeded(value, baseHours)
    }));
  };

  const handleMaterialTemplateChange = (templateId: string) => {
    setSelectedMaterialTemplate(templateId);
    if (templateId === 'other') {
      setMaterialDetails({
        material: '',
        quantity: '',
        unit: '',
      });
    } else {
      const template = materialTemplates.find((m: { id: string; name: string; unit: string }) => m.id === templateId);
      if (template) {
        setMaterialDetails(prev => ({
          ...prev,
          material: template.name,
          unit: template.unit,
        }));
      }
    }
  };

  // Add new function to handle material list
  const handleAddMaterial = () => {
    setTaskDetails(prev => ({
      ...prev,
      materials: [...prev.materials, { material: '', quantity: '', unit: '' }]
    }));
  };

  const handleRemoveMaterial = (index: number) => {
    setTaskDetails(prev => ({
      ...prev,
      materials: prev.materials.filter((_, i) => i !== index)
    }));
  };

  const handleMaterialChange = (index: number, field: 'material' | 'quantity' | 'unit', value: string) => {
    setTaskDetails(prev => ({
      ...prev,
      materials: prev.materials.map((m: AdditionalTaskMaterial, i): AdditionalTaskMaterial => {
        if (i === index) {
          if (field === 'material') {
            // Find the selected material template to get its unit
            const template = materialTemplates.find(t => t.name === value);
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

  // Update the addProgressMutation
  const addProgressMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !selectedTask?.id) throw new Error('Missing required data');

      // Add progress entry
      const { error: entryError } = await supabase
        .from('additional_task_progress_entries')
        .insert({
          task_id: selectedTask.id,
          user_id: user?.id,
          event_id: selectedTask.event_id,
          company_id: companyId,
          progress_percentage: parseFloat(progressDetails.progress),
          hours_spent: parseFloat(progressDetails.hoursWorked),
          notes: progressDetails.notes || null,
          created_at: new Date().toISOString()
        });

      if (entryError) throw entryError;

      // Get all progress entries for this task
      const { data: entries } = await supabase
        .from('additional_task_progress_entries')
        .select('progress_percentage, hours_spent')
        .eq('task_id', selectedTask.id)
        .eq('company_id', companyId);

      // Calculate total progress and hours
      const totalProgress = Math.min(
        (entries || []).reduce((sum, entry) => sum + (entry.progress_percentage || 0), 0),
        100
      );
      const totalHours = (entries || []).reduce((sum, entry) => sum + (entry.hours_spent || 0), 0);

      // Update task with total progress and hours
      const { error: taskError } = await supabase
        .from('additional_tasks')
        .update({
          progress: totalProgress,
          hours_spent: totalHours,
          is_finished: totalProgress >= 100
        })
        .eq('id', selectedTask.id)
        .eq('company_id', companyId);

      if (taskError) throw taskError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['additional_tasks'] });
      setShowProgressModal(false);
      setSelectedTask(null);
      setProgressDetails({ progress: '', hoursWorked: '', notes: '' });
    },
    onError: (error) => {
      console.error('Error in addProgressMutation:', error);
      alert(t('common:failed_update_progress'));
    }
  });

  const handleProgressSubmit = () => {
    if (!selectedTask?.id) return;
    
    addProgressMutation.mutate();
  };

  // Add handler for unspecified material
  const handleAddUnspecifiedMaterial = (materialData: {
    name: string;
    total_amount: number;
    unit: string;
    notes: string;
    event_id: string;
  }) => {
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
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Additional Tasks Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{t('event:additional_tasks_title')}</h2>
          <button
            onClick={() => setShowTaskModal(true)}
            className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-1" />
            {t('event:add_task_button')}
          </button>
        </div>

        {/* Display Additional Tasks */}
        <div className="space-y-4 mt-4">
          {additionalTasks.map(task => (
            <div key={task.id} className="border p-4 rounded-lg bg-gray-50">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium">{task.description}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {t('event:added_by')} {task.profiles?.full_name}
                  </p>
                  <div className="flex items-center mt-2 space-x-4 text-sm text-gray-600">
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      {task.hours_spent} / {task.hours_needed} hours
                    </div>
                  </div>
                  {task.materials && task.materials.length > 0 && (
                    <p className="text-sm text-gray-600 mt-2">
                      <Package className="w-4 h-4 inline mr-1" />
                      {t('event:materials_label_colon')} {task.materials.map(m => `${m.material} (${m.quantity} ${m.unit})`).join(', ')}
                    </p>
                  )}
                  <div className="mt-3 space-y-3">
                    {/* Progress Bar */}
                    <div>
                      <div className="flex justify-between items-center text-sm text-gray-600 mb-1">
                        <span>{t('event:progress_label_with_percent')} {task.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${task.progress || 0}%` }}
                        />
                      </div>
                    </div>
                    {/* Hours Progress Bar */}
                    <div>
                      <div className="flex justify-between items-center text-sm text-gray-600 mb-1">
                        <span>{t('event:hours_progress_label')} {((task.hours_spent / parseFloat(task.hours_needed.toString())) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min((task.hours_spent / parseFloat(task.hours_needed.toString())) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    {/* Update Progress Button */}
                    <button
                      onClick={() => {
                        setSelectedTask(task);
                        setProgressDetails({
                          progress: '',
                          hoursWorked: '',
                          notes: ''
                        });
                        setShowProgressModal(true);
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3 rounded-md transition-colors text-sm"
                    >
                      {t('event:update_progress_button')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {additionalTasks.length === 0 && (
            <p className="text-center text-gray-500 py-4">{t('event:no_additional_tasks_yet')}</p>
          )}
        </div>
      </div>

      {/* Additional Materials Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{t('event:additional_materials_title')}</h2>
          <button
            onClick={() => setShowMaterialModal(true)}
            className="inline-flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-1" />
            {t('event:add_material_button')}
          </button>
        </div>

        {/* Display Additional Materials */}
        <div className="space-y-4 mt-4">
          {additionalMaterials.map(material => (
            <div key={material.id} className="border p-4 rounded-lg bg-gray-50">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium">{material.material}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {t('event:quantity_label_parentheses')}: {material.quantity} {material.unit}
                  </p>
                  <p className="text-sm text-gray-600">
                    {t('event:added_by')} {material.profiles?.full_name}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {additionalMaterials.length === 0 && (
            <p className="text-center text-gray-500 py-4">{t('event:no_additional_materials_yet')}</p>
          )}
        </div>
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <Modal title={t('event:add_additional_task_modal_title')} onClose={() => setShowTaskModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:task_type_label')}</label>
              <select
                value={selectedTaskTemplate}
                onChange={(e) => handleTaskTemplateChange(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">{t('event:select_task_type')}</option>
                {taskTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
                <option value="other">{t('event:other_custom_task')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:task_description_label')}</label>
              <textarea
                value={taskDetails.description}
                onChange={(e) => setTaskDetails({ ...taskDetails, description: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                rows={3}
                placeholder={t('event:describe_task_placeholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('event:start_date_label')}</label>
                <input
                  type="date"
                  value={taskDetails.start_date}
                  onChange={(e) => setTaskDetails({ ...taskDetails, start_date: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('event:end_date_label')}</label>
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
                {t('event:quantity_label_parentheses')} {selectedTaskTemplate && taskTemplates.find(t => t.id === selectedTaskTemplate)?.unit ? 
                  `(${taskTemplates.find(t => t.id === selectedTaskTemplate)?.unit})` : ''}
              </label>
              <input
                type="number"
                value={taskDetails.quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('event:enter_quantity_placeholder')}
                min="0"
                step="0.5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:hours_needed_auto_calculated')}</label>
              <input
                type="number"
                value={taskDetails.hours_needed}
                readOnly
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50"
                placeholder={t('event:hours_calculated_based_on_quantity')}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">{t('event:materials_needed_label')}</label>
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {t('event:add_material_link')}
                </button>
              </div>
              <div className="space-y-3">
                {taskDetails.materials.map((material, index) => (
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
                        <option value="other" className="font-medium text-blue-600">{t('common:other_custom_material')}</option>
                        {materialTemplates.map(template => (
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
                        placeholder={t('calculator:qty_placeholder')}
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
                        placeholder={t('calculator:unit_placeholder')}
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
              {addTaskMutation.isPending ? `${t('event:saving_action')}...` : t('event:add_task_button')}
            </button>
          </div>
        </Modal>
      )}

      {/* Material Modal */}
      {showMaterialModal && (
        <Modal title={t('event:add_additional_material_modal_title')} onClose={() => setShowMaterialModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:material_type_label')}</label>
              <select
                value={selectedMaterialTemplate}
                onChange={(e) => handleMaterialTemplateChange(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">{t('event:select_material_placeholder')}</option>
                {materialTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.unit})
                  </option>
                ))}
                <option value="other">{t('event:other_custom_material')}</option>
              </select>
            </div>

            {selectedMaterialTemplate === 'other' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('event:material_name_label')}</label>
                <input
                  type="text"
                  value={materialDetails.material}
                  onChange={(e) => setMaterialDetails({ ...materialDetails, material: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder={t('event:enter_material_name_placeholder')}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:material_quantity_label')}</label>
              <input
                type="number"
                value={materialDetails.quantity}
                onChange={(e) => setMaterialDetails({ ...materialDetails, quantity: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('event:enter_quantity_placeholder')}
                min="0"
                step="0.01"
              />
            </div>

            {selectedMaterialTemplate === 'other' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('event:material_unit_label')}</label>
                <input
                  type="text"
                  value={materialDetails.unit}
                  onChange={(e) => setMaterialDetails({ ...materialDetails, unit: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder={t('event:unit_placeholder_example')}
                />
              </div>
            )}

            <button
              onClick={handleMaterialSubmit}
              disabled={addMaterialMutation.isPending}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {addMaterialMutation.isPending ? `${t('event:saving_action')}...` : t('event:add_material_button')}
            </button>
          </div>
        </Modal>
      )}

      {/* Progress Modal */}
      {showProgressModal && selectedTask && (
        <Modal title={t('event:update_task_progress_modal_title')} onClose={() => {
          setShowProgressModal(false);
          setSelectedTask(null);
          setProgressDetails({ progress: '', hoursWorked: '', notes: '' });
        }}>
          <div className="space-y-4">
            {/* Current Progress Information */}
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{t('event:current_progress_label')}</span> {selectedTask.progress}%
              </div>
              <div className="text-sm text-gray-600">
                <span className="font-medium">{t('event:hours_worked_label')}</span> {selectedTask.hours_spent} / {selectedTask.hours_needed} hours
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:progress_percentage_label')}</label>
              <input
                type="number"
                value={progressDetails.progress}
                onChange={(e) => setProgressDetails(prev => ({
                  ...prev,
                  progress: e.target.value
                }))}
                min="0"
                max="100"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('event:enter_progress_percentage')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:hours_worked_input_label')}</label>
              <input
                type="number"
                value={progressDetails.hoursWorked}
                onChange={(e) => setProgressDetails(prev => ({
                  ...prev,
                  hoursWorked: e.target.value
                }))}
                min="0"
                step="0.5"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('event:enter_hours_worked')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:notes_optional_label')}</label>
              <textarea
                value={progressDetails.notes}
                onChange={(e) => setProgressDetails(prev => ({
                  ...prev,
                  notes: e.target.value
                }))}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('event:add_notes_about_progress')}
              />
            </div>

            <button
              onClick={handleProgressSubmit}
              disabled={addProgressMutation.isPending || !progressDetails.progress || !progressDetails.hoursWorked}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {addProgressMutation.isPending ? `${t('event:updating_action')}...` : t('event:update_progress_button')}
            </button>
          </div>
        </Modal>
      )}

      {/* Add UnspecifiedMaterialModal */}
      {showUnspecifiedMaterialModal && (
        <UnspecifiedMaterialModal
          onClose={() => setShowUnspecifiedMaterialModal(false)}
          onSave={handleAddUnspecifiedMaterial}
          projects={[{
            id: eventId,
            title: 'Current Project'
          }]}
        />
      )}
    </div>
  );
};

export default AdditionalFeatures;
