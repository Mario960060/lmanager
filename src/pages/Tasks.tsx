import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Loader2, X, Wrench, Package, Pencil, Info } from 'lucide-react';
import BackButton from '../components/BackButton';

interface Task {
  id: string;
  name: string;
  description: string;
  tools: string[];
  materials: string[];
}

const TaskRequirements = () => {
  const { t } = useTranslation(['common', 'form', 'utilities']);
  const queryClient = useQueryClient();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [newTask, setNewTask] = useState({
    name: '',
    description: '',
    tools: [''],
    materials: ['']
  });
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Fetch tasks from task_requirements
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['task_requirements', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_requirements')
        .select('id, name, description, tools, materials')
        .eq('company_id', companyId)
        .order('name');
      
      if (error) throw error;
      
      return data.map(task => ({
        ...task,
        tools: task.tools as string[],
        materials: task.materials as string[]
      })) as Task[];
    },
    enabled: !!companyId
  });

  // Add task mutation
  const addTaskMutation = useMutation({
    mutationFn: async (task: Omit<Task, 'id'>) => {
      const { error } = await supabase
        .from('task_requirements')
        .insert({
          name: task.name,
          description: task.description,
          tools: task.tools.filter(t => t.trim()),
          materials: task.materials.filter(m => m.trim()),
          company_id: companyId
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_requirements', companyId] });
      setShowAddModal(false);
      setNewTask({ name: '', description: '', tools: [''], materials: [''] });
    }
  });

  // Edit task mutation
  const editTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const { error } = await supabase
        .from('task_requirements')
        .update({
          name: task.name,
          description: task.description,
          tools: task.tools.filter(t => t.trim()),
          materials: task.materials.filter(m => m.trim())
        })
        .eq('id', task.id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_requirements', companyId] });
      setShowEditModal(false);
      setEditingTask(null);
    }
  });

  const handleAddTool = (isEditing: boolean = false) => {
    if (isEditing && editingTask) {
      setEditingTask(prev => ({
        ...prev!,
        tools: ['', ...prev!.tools]
      }));
    } else {
      setNewTask(prev => ({
        ...prev,
        tools: ['', ...prev.tools]
      }));
    }
  };

  const handleAddMaterial = (isEditing: boolean = false) => {
    if (isEditing && editingTask) {
      setEditingTask(prev => ({
        ...prev!,
        materials: ['', ...prev!.materials]
      }));
    } else {
      setNewTask(prev => ({
        ...prev,
        materials: ['', ...prev.materials]
      }));
    }
  };

  const handleToolChange = (index: number, value: string, isEditing: boolean = false) => {
    if (isEditing && editingTask) {
      setEditingTask(prev => ({
        ...prev!,
        tools: prev!.tools.map((t, i) => i === index ? value : t)
      }));
    } else {
      setNewTask(prev => ({
        ...prev,
        tools: prev.tools.map((t, i) => i === index ? value : t)
      }));
    }
  };

  const handleMaterialChange = (index: number, value: string, isEditing: boolean = false) => {
    if (isEditing && editingTask) {
      setEditingTask(prev => ({
        ...prev!,
        materials: prev!.materials.map((m, i) => i === index ? value : m)
      }));
    } else {
      setNewTask(prev => ({
        ...prev,
        materials: prev.materials.map((m, i) => i === index ? value : m)
      }));
    }
  };

  const handleRemoveTool = (index: number, isEditing: boolean = false) => {
    if (isEditing && editingTask) {
      setEditingTask(prev => ({
        ...prev!,
        tools: prev!.tools.filter((_, i) => i !== index)
      }));
    } else {
      setNewTask(prev => ({
        ...prev,
        tools: prev.tools.filter((_, i) => i !== index)
      }));
    }
  };

  const handleRemoveMaterial = (index: number, isEditing: boolean = false) => {
    if (isEditing && editingTask) {
      setEditingTask(prev => ({
        ...prev!,
        materials: prev!.materials.filter((_, i) => i !== index)
      }));
    } else {
      setNewTask(prev => ({
        ...prev,
        materials: prev.materials.filter((_, i) => i !== index)
      }));
    }
  };

  const handleSubmit = () => {
    if (!newTask.name || !newTask.description) return;
    
    addTaskMutation.mutate({
      name: newTask.name,
      description: newTask.description,
      tools: newTask.tools.filter(t => t.trim()),
      materials: newTask.materials.filter(m => m.trim())
    });
  };

  const handleEdit = () => {
    if (!editingTask?.name || !editingTask?.description) return;
    editTaskMutation.mutate(editingTask);
  };

  const handleEditClick = (task: Task) => {
    setEditingTask(task);
    setShowEditModal(true);
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setShowDetailsModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackButton />
      <div className="flex justify-between items-center md:flex-row flex-col">
        <h1 className="text-3xl font-bold text-gray-900">{t('utilities:task_requirements_title')}</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="md:flex hidden bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t('utilities:add_task_requirements')}
        </button>
      </div>

      {/* Mobile Button */}
      <button
        onClick={() => setShowAddModal(true)}
        className="md:hidden w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
      >
        {t('utilities:add_task_requirements')}
      </button>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <button
                  onClick={() => handleTaskClick(task)}
                  className="group flex items-center text-xl font-semibold text-gray-900 hover:text-blue-600"
                >
                  {task.name}
                  <Info className="w-4 h-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                <p className="text-gray-600 mt-2 line-clamp-2">{task.description}</p>
              </div>
              <button
                onClick={() => handleEditClick(task)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors ml-2"
                title={t('utilities:edit_task')}
              >
                <Pencil className="w-5 h-5 text-blue-600" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center text-sm text-blue-600">
                <Wrench className="w-4 h-4 mr-2" />
                <span>{t('utilities:tools')}: {task.tools.length}</span>
              </div>
              <div className="flex items-center text-sm text-green-600">
                <Package className="w-4 h-4 mr-2" />
                <span>{t('utilities:required_materials')}: {task.materials.length}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Details Modal */}
      {showDetailsModal && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-semibold text-gray-900">{selectedTask.name}</h2>
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedTask(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">{t('utilities:description')}</h3>
                <p className="text-gray-600">{selectedTask.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Tools Section */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-blue-900 mb-2">{t('utilities:required_tools')}</h3>
                  <ul className="space-y-2">
                    {selectedTask.tools.map((tool, index) => (
                      <li key={index} className="flex items-center text-blue-800">
                        <Wrench className="w-4 h-4 mr-2 flex-shrink-0" />
                        <span className="text-sm">{tool}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Materials Section */}
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-green-900 mb-2">{t('utilities:required_materials')}</h3>
                  <ul className="space-y-2">
                    {selectedTask.materials.map((material, index) => (
                      <li key={index} className="flex items-center text-green-800">
                        <Package className="w-4 h-4 mr-2 flex-shrink-0" />
                        <span className="text-sm">{material}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b">
              <div className="flex justify-between items-start">
                <h2 className="text-2xl font-semibold text-gray-900">{t('utilities:add_new_task_requirements')}</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('utilities:task_name')}</label>
                  <input
                    type="text"
                    value={newTask.name}
                    onChange={(e) => setNewTask(prev => ({ ...prev, name: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder={t('utilities:enter_task_name')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('utilities:description')}</label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder={t('utilities:enter_task_description')}
                  />
                </div>

                {/* Tools Section */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">{t('utilities:required_tools')}</label>
                    <button
                      type="button"
                      onClick={() => handleAddTool()}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {t('utilities:add_tool')}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {newTask.tools.map((tool, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={tool}
                          onChange={(e) => handleToolChange(index, e.target.value)}
                          className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder={t('utilities:enter_tool_name')}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveTool(index)}
                          className="p-2 text-red-600 hover:text-red-700"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Materials Section */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">{t('utilities:required_materials')}</label>
                    <button
                      type="button"
                      onClick={() => handleAddMaterial()}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {t('utilities:add_material')}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {newTask.materials.map((material, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={material}
                          onChange={(e) => handleMaterialChange(index, e.target.value)}
                          className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder={t('utilities:enter_material_name')}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveMaterial(index)}
                          className="p-2 text-red-600 hover:text-red-700"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50">
              <button
                onClick={handleSubmit}
                disabled={addTaskMutation.isPending || !newTask.name || !newTask.description}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {addTaskMutation.isPending ? t('utilities:adding') : t('utilities:add_task_requirements')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {showEditModal && editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b">
              <div className="flex justify-between items-start">
                <h2 className="text-2xl font-semibold text-gray-900">{t('utilities:edit_task_requirements')}</h2>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingTask(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('utilities:task_name')}</label>
                  <input
                    type="text"
                    value={editingTask.name}
                    onChange={(e) => setEditingTask(prev => ({ ...prev!, name: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder={t('utilities:enter_task_name')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('utilities:description')}</label>
                  <textarea
                    value={editingTask.description}
                    onChange={(e) => setEditingTask(prev => ({ ...prev!, description: e.target.value }))}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder={t('utilities:enter_task_description')}
                  />
                </div>

                {/* Tools Section */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">{t('utilities:required_tools')}</label>
                    <button
                      type="button"
                      onClick={() => handleAddTool(true)}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {t('utilities:add_tool')}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {editingTask.tools.map((tool, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={tool}
                          onChange={(e) => handleToolChange(index, e.target.value, true)}
                          className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder={t('utilities:enter_tool_name')}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveTool(index, true)}
                          className="p-2 text-red-600 hover:text-red-700"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Materials Section */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">{t('utilities:required_materials')}</label>
                    <button
                      type="button"
                      onClick={() => handleAddMaterial(true)}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {t('utilities:add_material')}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {editingTask.materials.map((material, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={material}
                          onChange={(e) => handleMaterialChange(index, e.target.value, true)}
                          className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder={t('utilities:enter_material_name')}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveMaterial(index, true)}
                          className="p-2 text-red-600 hover:text-red-700"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50">
              <button
                onClick={handleEdit}
                disabled={editTaskMutation.isPending || !editingTask.name || !editingTask.description}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {editTaskMutation.isPending ? t('utilities:saving') : t('utilities:save_changes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskRequirements;
