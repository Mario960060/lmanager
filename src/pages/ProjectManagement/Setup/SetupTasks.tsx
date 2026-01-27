import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';
import { Clock, X, Search, Info, Trash2, Settings, Save } from 'lucide-react';

interface Task {
  id: string;
  name: string;
  description: string;
  unit: string;
  estimated_hours: number;
}

interface SetupTasksProps {
  onClose: () => void;
}

const SetupTasks: React.FC<SetupTasksProps> = ({ onClose }) => {
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
        .insert([{ ...task, company_id: companyId }])
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
      const { error } = await supabase
        .from('event_tasks')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_tasks', companyId] });
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Content - scrollable container with everything */}
        <div className="overflow-y-auto flex flex-col flex-1">
          {/* Header */}
          <div className="border-b flex-shrink-0">
            {/* First row - Tasks title and close button */}
            <div className="p-4 flex justify-between items-center">
              <div className="flex items-center">
                <Clock className="w-5 h-5 text-gray-700 mr-2" />
                <h2 className="text-lg font-semibold">Tasks</h2>
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
                Dont create here any tasks that involving digging, tape1 preparation, compacting and loading-in sand. All of them will be created automaticly whenever u add you excavation and carrier tools in "Excavators & Dumpers/Barrows" window in setup page. Also please don't use any words "excavation" or "preparation" in names of your task.
              </span>
            </div>
          </div>

          {/* Main content */}
          <div className="p-6 flex flex-col flex-1 min-h-0">
          {/* Updated Add Task Form with Name and Description side by side */}
          <form onSubmit={handleAddTask} className="mb-4 flex-shrink-0">
            {/* Name and Description in one row */}
            <div className="grid items-start mb-3" style={{gridTemplateColumns: '33% 33% 16.5% 16.5%', gap: '0.75rem'}}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Name</label>
                <input
                  type="text"
                  placeholder="Enter task name"
                  value={newTask.name}
                  onChange={(e) => setNewTask({...newTask, name: e.target.value})}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  placeholder="Enter task description"
                  value={newTask.description}
                  onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                  className="w-full p-2 border rounded text-sm resize-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <input
                  type="text"
                  placeholder="e.g., m², hours, pieces"
                  value={newTask.unit}
                  onChange={(e) => setNewTask({...newTask, unit: e.target.value})}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Hours</label>
                <input
                  type="number"
                  placeholder="Base time estimate"
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
              Add Task
            </button>
          </form>
          
          {/* Search Tasks */}
          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Search tasks..."
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              className="w-full p-2 pl-8 border rounded text-sm"
            />
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          </div>
          
          {/* Tasks List - scrollable */}
          <div className="border rounded flex-1 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 w-full" style={{tableLayout: 'fixed'}}>
              <colgroup>
                <col style={{width: '33%'}} />
                <col style={{width: '33%'}} />
                <col style={{width: '16.5%'}} />
                <col style={{width: '16.5%'}} />
                <col style={{width: 'auto'}} />
              </colgroup>
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Est. Hours</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTasks.map(task => (
                  <tr key={task.id}>
                    <td className="text-sm font-medium text-gray-900">
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
                    <td className="text-sm text-gray-500">
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
                    <td className="text-sm text-gray-500">
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
                    <td className="text-sm text-gray-500">
                      {editingTaskId === task.id ? (
                        <input
                          type="number"
                          value={editTask?.estimated_hours || 0}
                          onChange={(e) => setEditTask({...editTask!, estimated_hours: parseFloat(e.target.value)})}
                          className="w-full p-1 border rounded text-sm"
                        />
                      ) : (
                        `${task.estimated_hours} hours`
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right text-sm font-medium">
                      {editingTaskId === task.id ? (
                        <button
                          onClick={handleSaveTaskEdit}
                          className="text-green-500 hover:text-green-700 mr-2"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEditTask(task)}
                          className="text-green-500 hover:text-green-700 mr-2"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteTaskMutation.mutate(task.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTasks.length === 0 && (
              <p className="text-center text-gray-500 py-4 text-sm">No tasks found</p>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default SetupTasks;
