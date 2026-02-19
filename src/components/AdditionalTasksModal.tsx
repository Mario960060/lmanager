import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Loader2, Search, X, ClipboardList, Trash2, Plus } from 'lucide-react';
import { Database } from '../types/supabase';

interface AdditionalTask {
  id: string;
  event_id: string;
  user_id: string;
  description?: string;
  date?: string;
  created_at: string;
  eventTitle?: string;
  materials?: AdditionalTaskMaterial[];
  progress: number;
  hours_spent: number;
  hours_needed: number;
  latest_progress?: {
    progress_percentage: number;
    hours_spent: number;
    created_at: string;
    notes?: string;
  } | null;
}

interface AdditionalTaskMaterial {
  id?: string;
  task_id?: string;
  material: string;
  quantity: number;
  unit: string;
}

interface AdditionalTasksModalProps {
  eventId: string;
  onClose: () => void;
}

interface DeleteConfirmationProps {
  recordId: string;
  recordType: string;
  recordName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

type TaskDone = Database['public']['Tables']['tasks_done']['Row'];
type TaskProgressEntry = Database['public']['Tables']['task_progress_entries']['Row'];

// Confirmation dialog component
const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({ 
  recordId, 
  recordType, 
  recordName, 
  onCancel, 
  onConfirm,
  t = (key) => key
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">{t('common:confirm_deletion')}</h3>
        <p className="mb-6">{t('common:want_delete_record')}</p>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          <strong>{t('common:type_label')}:</strong> {recordType}<br />
          <strong>{t('common:name_label')}:</strong> {recordName}
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t('common:no')}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            {t('common:yes')}
          </button>
        </div>
      </div>
    </div>
  );
};

const AdditionalTasksModal: React.FC<AdditionalTasksModalProps> = ({ eventId, onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    recordId: string;
    recordName: string;
  }>({ isOpen: false, recordId: '', recordName: '' });
  const [showRequestSent, setShowRequestSent] = useState(false);
  
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['additional_tasks', user?.id, companyId],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('additional_tasks')
        .select(`
          *,
          events (
            id,
            title
          ),
          additional_task_materials (
            id,
            material,
            quantity,
            unit
          ),
          additional_task_progress_entries (
            progress_percentage,
            hours_spent,
            created_at,
            notes
          )
        `)
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      // Process the data to include the latest progress
      const processedData = data.map(task => ({
        ...task,
        progress: task.progress || 0,
        hours_spent: task.hours_spent || 0,
        hours_needed: task.hours_needed || 0,
        latest_progress: task.additional_task_progress_entries?.length > 0 
          ? task.additional_task_progress_entries.reduce((latest: any, entry: any) => {
              return !latest || new Date(entry.created_at) > new Date(latest.created_at) ? entry : latest;
            }, null)
          : null
      }));
      
      return processedData;
    },
    enabled: !!user?.id && !!companyId
  });

  // Mutation to create deletion request
  const createDeletionRequest = useMutation({
    mutationFn: async (recordId: string) => {
      const task = tasks.find(t => t.id === recordId);
      if (!task) throw new Error('Record not found');
      
      const { error } = await supabase
        .from('deletion_requests')
        .insert({
          user_id: user?.id,
          record_id: recordId,
          record_type: 'additional_tasks',
          company_id: companyId,
          record_details: {
            description: task.description || 'No description',
            project: task.events?.title || 'Unknown Project',
            created_at: new Date(task.created_at).toLocaleString()
          },
          status: 'pending'
        });
      
      if (error) {
        console.error('Error creating deletion request:', error);
        throw error;
      }
      setShowRequestSent(true);
      return recordId;
    },
    onSuccess: () => {
      setDeleteConfirmation({ isOpen: false, recordId: '', recordName: '' });
    },
    onError: (error) => {
      console.error('Failed to create deletion request:', error);
      alert(t('event:failed_delete_request'));
    }
  });

  // Handle delete button click
  const handleDeleteClick = (recordId: string, recordName: string) => {
    setDeleteConfirmation({
      isOpen: true,
      recordId,
      recordName
    });
  };

  // Handle confirmation
  const handleConfirmDelete = () => {
    if (deleteConfirmation.recordId) {
      createDeletionRequest.mutate(deleteConfirmation.recordId);
    }
  };

  // Filter tasks based on search term
  const filteredTasks = searchTerm 
    ? tasks.filter(task => {
        return (
          (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (task.events?.title && task.events.title.toLowerCase().includes(searchTerm.toLowerCase()))
        );
      })
    : tasks;

  // New state variables for progress tracking
  const [selectedTask, setSelectedTask] = useState<TaskDone | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [hoursWorked, setHoursWorked] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [showProgressForm, setShowProgressForm] = useState(false);
  
  // Fetch tasks
  useEffect(() => {
    fetchTasks();
  }, [eventId]);
  
  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('event_id', eventId);
        
      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Add new task function
  const addTask = async () => {
    if (!newTask.trim()) return;
    
    try {
      // Create a new task_done record
      const { data: taskData, error: taskError } = await supabase
        .from('tasks_done')
        .insert({
          name: newTask,
          event_id: eventId,
          created_at: new Date().toISOString(),
          is_finished: false,
          amount: '100 percent', // Default value
          hours_worked: 0,
          unit: 'percent',
          description: 'Additional task',
          company_id: companyId
        })
        .select();
        
      if (taskError) throw taskError;
      
      // Create event_tasks record using the ID generated by the database
      if (taskData && taskData[0]) {
        const { error: eventTaskError } = await supabase
          .from('event_tasks')
          .insert({
            event_id: eventId,
            task_id: taskData[0].id
          });
          
        if (eventTaskError) throw eventTaskError;
      }
      
      setNewTask('');
      fetchTasks(); // Refresh the task list
    } catch (error) {
      console.error('Error adding task:', error);
    }
  };
  
  // Function to open progress form for a task
  const openProgressForm = (task: TaskDone) => {
    setSelectedTask(task);
    setProgress('');
    setHoursWorked('');
    setNotes('');
    setShowProgressForm(true);
  };

  // Update progress function
  const updateProgress = async () => {
    if (!selectedTask || !progress || !hoursWorked) return;
    
    const progressNum = parseFloat(progress);
    const hoursNum = parseFloat(hoursWorked);
    
    if (isNaN(progressNum) || isNaN(hoursNum) || progressNum < 0 || progressNum > 100 || hoursNum < 0) {
      return;
    }
    
    try {
      // Update the task_done record
      const { error: updateError } = await supabase
        .from('tasks_done')
        .update({
          hours_worked: hoursNum,
          is_finished: progressNum === 100,
          amount: `${progressNum} percent`
        })
        .eq('id', selectedTask.id);
        
      if (updateError) throw updateError;
      
      // Add entry to task_progress_entries
      const { error: progressError } = await supabase
        .from('task_progress_entries')
        .insert({
          task_id: selectedTask.id,
          progress_percentage: progressNum,
          hours_worked: hoursNum,
          notes: notes || null,
          created_at: new Date().toISOString(),
          company_id: companyId
        });
        
      if (progressError) throw progressError;
      
      // Reset form and refresh tasks
      setShowProgressForm(false);
      setSelectedTask(null);
      setProgress('');
      setHoursWorked('');
      setNotes('');
      fetchTasks();
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
            <h2 className="text-xl font-semibold flex items-center">
              <ClipboardList className="w-5 h-5 mr-2 text-blue-500" />
              {t('event:additional_tasks')}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Search */}
          <div className="p-4 border-b dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder={t('event:search_tasks')}
                className="w-full pl-10 pr-4 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : filteredTasks.length > 0 ? (
              <div className="mt-4 space-y-4">
                {filteredTasks.map((task: AdditionalTask) => (
                  <div key={task.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold">{task.description}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {t('event:project_label')}: {task.events?.title}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteClick(task.id, task.description || t('event:unnamed_task'))}
                        className="text-red-600 hover:text-red-700 p-1"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                    
                    {/* Progress Information */}
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">{t('event:progress_label')}:</span>
                        <span className="text-sm">{task.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full"
                          style={{ width: `${task.progress}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span>{t('event:hours_label')}: {task.hours_spent} / {task.hours_needed}</span>
                        <span className="text-gray-600">
                          {((task.hours_spent / task.hours_needed) * 100).toFixed(1)}% {t('event:of_estimated_time')}
                        </span>
                      </div>
                    </div>

                    {/* Latest Progress Update */}
                    {task.latest_progress && (
                      <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                        <p>{t('event:last_updated')}: {new Date(task.latest_progress.created_at).toLocaleDateString()}</p>
                        {task.latest_progress.notes && (
                          <p className="mt-1">{t('event:notes_label')}: {task.latest_progress.notes}</p>
                        )}
                      </div>
                    )}

                    {/* Materials Section */}
                    {task.additional_task_materials && task.additional_task_materials.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-sm font-medium mb-2">{t('event:materials_label')}:</h4>
                        <div className="space-y-1">
                          {task.additional_task_materials.map((material, index) => (
                            <p key={index} className="text-sm text-gray-600 dark:text-gray-400">
                              {material.material}: {material.quantity} {material.unit}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {filteredTasks.length === 0 && !isLoading && (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {t('event:no_additional_tasks')}
                  </div>
                )}
                {isLoading && (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {searchTerm ? t('event:no_tasks_match') : t('event:no_additional_tasks_yet')}
              </div>
            )}
          </div>

          {/* Add Task Button - Fixed at bottom */}
          <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
            <button
              onClick={() => {/* Your add task logic */}}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              {t('event:add_task')}
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmation.isOpen && (
        <DeleteConfirmation
          recordId={deleteConfirmation.recordId}
          recordType={t('event:additional_task_label')}
          recordName={deleteConfirmation.recordName}
          onCancel={() => setDeleteConfirmation({ isOpen: false, recordId: '', recordName: '' })}
          onConfirm={handleConfirmDelete}
          t={t}
        />
      )}

      {showRequestSent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('event:success')}
              </h3>
              <button
                onClick={() => setShowRequestSent(false)}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              {t('event:deletion_request_sent')}
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowRequestSent(false)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                {t('common:close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress update form */}
      {showProgressForm && selectedTask && (
        <div>
          <h3 className="font-medium mb-3">{t('event:update_progress')}: {selectedTask.name}</h3>
          
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('event:progress_percentage')}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
              className="w-full p-2 border rounded-md"
              placeholder={t('event:enter_progress_percentage')}
            />
          </div>
          
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('event:hours_worked_label')}
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={hoursWorked}
              onChange={(e) => setHoursWorked(e.target.value)}
              className="w-full p-2 border rounded-md"
              placeholder={t('event:enter_hours_worked')}
            />
          </div>
          
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('event:notes_label')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 border rounded-md"
              rows={3}
              placeholder={t('event:add_notes_progress')}
            />
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={updateProgress}
              disabled={!progress || !hoursWorked || parseFloat(progress) < 0 || parseFloat(progress) > 100 || parseFloat(hoursWorked) < 0}
              className="bg-blue-600 text-white px-4 py-2 rounded-md flex-1 hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {t('event:save_progress')}
            </button>
            <button
              onClick={() => {
                setShowProgressForm(false);
                setSelectedTask(null);
                setProgress('');
                setHoursWorked('');
                setNotes('');
              }}
              className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors"
            >
              {t('common:cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AdditionalTasksModal;
