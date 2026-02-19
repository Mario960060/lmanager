import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';
import { Clock, X, Search, Info, Trash2, Settings, Save } from 'lucide-react';

interface Task {
  id: string;
  name: string;
  description: string;
  unit: string;
  estimated_hours: number;
  is_deletable?: boolean;
}

interface SetupTasksProps {
  onClose: () => void;
  wizardMode?: boolean;
}

const SetupTasks: React.FC<SetupTasksProps> = ({ onClose, wizardMode = false }) => {
  const { t } = useTranslation(['common', 'form', 'utilities']);
  const queryClient = useQueryClient();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [taskSearch, setTaskSearch] = useState('');
  const [newTask, setNewTask] = useState({ 
    name: '', 
    description: '', 
    unit: '', 
    estimated_hours: 0 
  });
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);

  // Fetch tasks
  const { data: tasks = [] } = useQuery({
    queryKey: ['event_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      
      if (error) throw error;
      return data as Task[];
    },
    enabled: !!companyId
  });

  // Add task mutation
  const addTaskMutation = useMutation({
    mutationFn: async (task: Omit<Task, 'id'>) => {
      const { data, error } = await supabase
        .from('event_tasks')
        .insert([{ 
          ...task, 
          company_id: companyId,
          is_deletable: true  // New user-created tasks are always deletable
        }])
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_tasks', companyId] });
      setNewTask({ name: '', description: '', unit: '', estimated_hours: 0 });
    }
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      // First check if the task is deletable
      const task = tasks.find(t => t.id === id);
      if (task && task.is_deletable === false) {
        throw new Error(t('form:system_task_cannot_delete'));
      }
      
      const { error } = await supabase
        .from('event_tasks')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_tasks', companyId] });
    },
    onError: (error: any) => {
      // Handle error - maybe show toast
      console.error('Delete error:', error.message);
    }
  });

  // Edit task mutation
  const editTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const { data, error } = await supabase
        .from('event_tasks')
        .update({
          name: task.name,
          description: task.description,
          unit: task.unit,
          estimated_hours: task.estimated_hours
        })
        .eq('id', task.id)
        .eq('company_id', companyId)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_tasks', companyId] });
      setEditingTaskId(null);
      setEditTask(null);
    }
  });

  // Filter tasks
  const filteredTasks = tasks.filter(task => 
    task.name.toLowerCase().includes(taskSearch.toLowerCase())
  );

  // Handle adding tasks
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTask.name) {
      addTaskMutation.mutate(newTask);
    }
  };

  // Handle editing tasks
  const handleEditTask = (task: Task) => {
    setEditTask(task);
    setEditingTaskId(task.id);
  };

  // Handle saving task edits
  const handleSaveTaskEdit = () => {
    if (editTask) {
      editTaskMutation.mutate(editTask);
    }
  };

  if (wizardMode) {
    return (
      <div className="p-6 overflow-y-auto h-full">
        <div className="bg-gray-100 p-3 rounded-lg mb-3 text-sm">
          <span className="text-sm text-red-600 font-medium">
            {t('form:task_creation_warning')}
          </span>
        </div>
        
        {/* Updated Add Task Form */}
        <form onSubmit={handleAddTask} className="mb-4">
          {/* Task Name - full width */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:task_name_label')}</label>
            <input
              type="text"
              placeholder={t('form:enter_task_name')}
              value={newTask.name}
              onChange={(e) => setNewTask({...newTask, name: e.target.value})}
              className="w-full p-2 border rounded text-sm"
            />
          </div>
          
          {/* Description - full width */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:description_label')}</label>
            <textarea
              placeholder={t('form:enter_task_description')}
              value={newTask.description}
              onChange={(e) => setNewTask({...newTask, description: e.target.value})}
              className="w-full p-2 border rounded text-sm resize-none"
              rows={2}
            />
          </div>

          {/* Unit and Estimated Hours - same row */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:unit_label')}</label>
              <input
                type="text"
                placeholder={t('form:unit_placeholder')}
                value={newTask.unit}
                onChange={(e) => setNewTask({...newTask, unit: e.target.value})}
                className="w-full p-2 border rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:estimated_hours_label')}</label>
              <input
                type="number"
                placeholder={t('form:base_time_estimate')}
                value={newTask.estimated_hours || ''}
                onChange={(e) => setNewTask({...newTask, estimated_hours: parseFloat(e.target.value)})}
                className="w-full p-2 border rounded text-sm"
              />
            </div>
          </div>
          
          {/* Add Button */}
          <button
            type="submit"
            className="w-full bg-gray-700 text-white p-2 rounded hover:bg-gray-800 text-sm"
          >
            {t('form:add_button')}
          </button>
        </form>
        
        {/* Search Tasks */}
        <div className="relative mb-3">
          <input
            type="text"
            placeholder={t('form:search_tasks_placeholder')}
            value={taskSearch}
            onChange={(e) => setTaskSearch(e.target.value)}
            className="w-full p-2 pl-8 border rounded text-sm"
          />
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
        </div>
        
        {/* Tasks List */}
        <div className="border rounded overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 md:px-4">{t('form:table_header_name')}</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 md:px-4">{t('form:table_header_description')}</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 md:px-4">{t('form:table_header_unit')}</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 md:px-4 whitespace-nowrap">{t('form:table_header_estimated_hours')}</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 md:px-4">{t('form:table_header_deletable')}</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 md:px-4">{t('form:table_header_actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTasks.map(task => (
                <tr key={task.id}>
                  <td className="text-sm font-medium text-gray-900 px-2 py-2 md:px-4">
                    {editingTaskId === task.id ? (
                      <input
                        type="text"
                        value={editTask?.name || ''}
                        onChange={(e) => setEditTask({...editTask!, name: e.target.value})}
                        className="w-full p-1 border rounded text-sm"
                      />
                    ) : (
                      task.name
                    )}
                  </td>
                  <td className="text-sm text-gray-500 px-2 py-2 md:px-4">
                    {editingTaskId === task.id ? (
                      <input
                        type="text"
                        value={editTask?.description || ''}
                        onChange={(e) => setEditTask({...editTask!, description: e.target.value})}
                        className="w-full p-1 border rounded text-sm"
                      />
                    ) : (
                      task.description
                    )}
                  </td>
                  <td className="text-sm text-gray-500 px-2 py-2 md:px-4">
                    {editingTaskId === task.id ? (
                      <input
                        type="text"
                        value={editTask?.unit || ''}
                        onChange={(e) => setEditTask({...editTask!, unit: e.target.value})}
                        className="w-full p-1 border rounded text-sm"
                      />
                    ) : (
                      task.unit
                    )}
                  </td>
                  <td className="text-sm text-gray-500 px-2 py-2 md:px-4 whitespace-nowrap">
                    {editingTaskId === task.id ? (
                      <input
                        type="number"
                        value={editTask?.estimated_hours || 0}
                        onChange={(e) => setEditTask({...editTask!, estimated_hours: parseFloat(e.target.value)})}
                        className="w-full p-1 border rounded text-sm"
                      />
                    ) : (
                      t('form:hours_format', { value: parseFloat((task.estimated_hours).toFixed(3)) })
                    )}
                  </td>
                  <td className="text-sm text-gray-500 px-2 py-2 md:px-4">
                    <span className={task.is_deletable === false ? 'font-medium text-red-600' : 'font-medium text-green-600'}>
                      {task.is_deletable === false ? t('form:system_label') : t('form:yes_label')}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-right text-sm font-medium px-2 py-2 md:px-4">
                    <div className="flex justify-end gap-1">
                      {editingTaskId === task.id ? (
                        <button
                          onClick={handleSaveTaskEdit}
                          className="text-green-500 hover:text-green-700 p-1"
                          title={t('form:save_button_title')}
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEditTask(task)}
                          className="text-green-500 hover:text-green-700 p-1"
                          title={t('form:edit_button_title')}
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteTaskMutation.mutate(task.id)}
                        disabled={task.is_deletable === false}
                        className={task.is_deletable === false ? 'text-gray-300 cursor-not-allowed p-1' : 'text-red-500 hover:text-red-700 p-1'}
                        title={t('form:delete_button_title')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTasks.length === 0 && (
            <p className="text-center text-gray-500 py-4 text-sm">{t('form:no_tasks_found')}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header and Content together - scrollable as one */}
        <div className="overflow-y-auto flex flex-col flex-1">
          {/* Header */}
          <div className="border-b">
            {/* First row - Tasks title and close button */}
            <div className="p-4 flex justify-between items-center">
              <div className="flex items-center">
                <Clock className="w-5 h-5 text-gray-700 mr-2" />
                <h2 className="text-lg font-semibold">{t('form:setup_tasks_label')}</h2>
              </div>
              <button 
                onClick={onClose}
                className="p-1 rounded-full hover:bg-gray-200 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            {/* Second row - Warning message */}
            <div className="px-4 pb-4">
              <span className="text-sm text-red-600 font-medium">
                {t('form:task_creation_warning')}
              </span>
            </div>
          </div>

          {/* Main content */}
          <div className="p-6">
          {/* Updated Add Task Form */}
          <form onSubmit={handleAddTask} className="mb-4">
            {/* Task Name - full width */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:task_name_label')}</label>
              <input
                type="text"
                placeholder={t('form:enter_task_name')}
                value={newTask.name}
                onChange={(e) => setNewTask({...newTask, name: e.target.value})}
                className="w-full p-2 border rounded text-sm"
              />
            </div>
            
            {/* Description - full width */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:description_label')}</label>
              <textarea
                placeholder={t('form:enter_task_description')}
                value={newTask.description}
                onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                className="w-full p-2 border rounded text-sm resize-none"
                rows={2}
              />
            </div>

            {/* Unit and Estimated Hours - same row */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:unit_label')}</label>
                  <input
                    type="text"
                    placeholder={t('form:unit_placeholder')}
                  value={newTask.unit}
                  onChange={(e) => setNewTask({...newTask, unit: e.target.value})}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:estimated_hours_label')}</label>
                  <input
                    type="number"
                    placeholder={t('form:base_time_estimate')}
                  value={newTask.estimated_hours || ''}
                  onChange={(e) => setNewTask({...newTask, estimated_hours: parseFloat(e.target.value)})}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
            </div>
            
            {/* Add Button */}
            <button
              type="submit"
              className="w-full bg-gray-700 text-white p-2 rounded hover:bg-gray-800 text-sm"
            >
              {t('form:add_button')}
            </button>
          </form>
          
          {/* Search Tasks */}
          <div className="relative mb-3">
            <input
              type="text"
              placeholder={t('form:search_tasks_placeholder')}
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              className="w-full p-2 pl-8 border rounded text-sm"
            />
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          </div>
          
          {/* Tasks List */}
          <div className="border rounded overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 md:px-4">{t('form:table_header_name')}</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 md:px-4">{t('form:table_header_description')}</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 md:px-4">{t('form:table_header_unit')}</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 md:px-4 whitespace-nowrap">{t('form:table_header_estimated_hours')}</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 md:px-4">{t('form:table_header_actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTasks.map(task => (
                  <tr key={task.id}>
                    <td className="text-sm font-medium text-gray-900 px-2 py-2 md:px-4">
                      {editingTaskId === task.id ? (
                        <input
                          type="text"
                          value={editTask?.name || ''}
                          onChange={(e) => setEditTask({...editTask!, name: e.target.value})}
                          className="w-full p-1 border rounded text-sm"
                        />
                      ) : (
                        task.name
                      )}
                    </td>
                    <td className="text-sm text-gray-500 px-2 py-2 md:px-4">
                      {editingTaskId === task.id ? (
                        <input
                          type="text"
                          value={editTask?.description || ''}
                          onChange={(e) => setEditTask({...editTask!, description: e.target.value})}
                          className="w-full p-1 border rounded text-sm"
                        />
                      ) : (
                        task.description
                      )}
                    </td>
                    <td className="text-sm text-gray-500 px-2 py-2 md:px-4">
                      {editingTaskId === task.id ? (
                        <input
                          type="text"
                          value={editTask?.unit || ''}
                          onChange={(e) => setEditTask({...editTask!, unit: e.target.value})}
                          className="w-full p-1 border rounded text-sm"
                        />
                      ) : (
                        task.unit
                      )}
                    </td>
                    <td className="text-sm text-gray-500 px-2 py-2 md:px-4 whitespace-nowrap">
                      {editingTaskId === task.id ? (
                        <input
                          type="number"
                          value={editTask?.estimated_hours || 0}
                          onChange={(e) => setEditTask({...editTask!, estimated_hours: parseFloat(e.target.value)})}
                          className="w-full p-1 border rounded text-sm"
                        />
                      ) : (
                        t('form:hours_format', { value: parseFloat((task.estimated_hours).toFixed(3)) })
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right text-sm font-medium px-2 py-2 md:px-4">
                      <div className="flex justify-end gap-1">
                          {editingTaskId === task.id ? (
                          <button
                            onClick={handleSaveTaskEdit}
                            className="text-green-500 hover:text-green-700 p-1"
                            title={t('form:save_button_title')}
                          >
                            <Save className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleEditTask(task)}
                            className="text-green-500 hover:text-green-700 p-1"
                            title={t('form:edit_button_title')}
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteTaskMutation.mutate(task.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title={t('form:delete_button_title')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTasks.length === 0 && (
              <p className="text-center text-gray-500 py-4 text-sm">{t('form:no_tasks_found')}</p>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupTasks;
