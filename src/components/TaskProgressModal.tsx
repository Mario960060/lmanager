import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';
import { useAuthStore } from '../lib/store';

type TaskDone = Database['public']['Tables']['tasks_done']['Row'];

interface TaskProgressModalProps {
  task: TaskDone | null;
  onClose: () => void;
  createdAt?: string;
}

const TaskProgressModal: React.FC<TaskProgressModalProps> = ({ task, onClose, createdAt }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [amountCompleted, setAmountCompleted] = useState('');
  const [hoursSpent, setHoursSpent] = useState('');
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [totalHoursSpent, setTotalHoursSpent] = useState(0);

  // Fetch existing progress entries
  const { data: progressEntries = [] } = useQuery({
    queryKey: ['task_progress', task?.id, companyId],
    queryFn: async () => {
      if (!task?.id) return [];
      const { data, error } = await supabase
        .from('task_progress_entries')
        .select('amount_completed, hours_spent')
        .eq('task_id', task.id)
        .eq('company_id', companyId);
      if (error) throw error;
      return data;
    },
    enabled: !!task?.id && !!companyId
  });

  useEffect(() => {
    if (progressEntries.length > 0) {
      const totalAmount = progressEntries.reduce((sum, entry) => sum + (entry.amount_completed || 0), 0);
      const totalHours = progressEntries.reduce((sum, entry) => sum + (entry.hours_spent || 0), 0);
      setTotalCompleted(totalAmount);
      setTotalHoursSpent(totalHours);
    }
  }, [progressEntries]);

  // Add progress entry mutation
  const addProgressEntryMutation = useMutation({
    mutationFn: async ({ taskId, amount, hours }: { taskId: string; amount: number; hours: number }) => {
      if (!user?.id || !task?.event_id) throw new Error('Missing required data');
      
      // Get the task data including event_task_id
      const { data: taskDetails, error: taskError } = await supabase
        .from('tasks_done')
        .select('name, event_task_id')
        .eq('id', taskId)
        .single();
        
      if (taskError) throw taskError;
      
      // Add progress entry with event_tasks_id from the task
      const { error: entryError } = await supabase
        .from('task_progress_entries')
        .insert({
          task_id: taskId,
          event_id: task.event_id,
          user_id: user.id,
          amount_completed: amount,
          hours_spent: hours,
          event_tasks_id: taskDetails.event_task_id,
          company_id: companyId,
          ...(createdAt ? { created_at: createdAt } : {})
        });

      if (entryError) {
        console.error("Error inserting task progress entry:", entryError);
        throw entryError;
      }

      // Check if all tasks are completed for this event
      const { data: allTasks, error: tasksError } = await supabase
        .from('tasks_done')
        .select('id, amount')
        .eq('event_id', task.event_id)
        .eq('company_id', companyId);

      if (tasksError) throw tasksError;

      // Get progress for all tasks
      const { data: allProgress, error: progressError } = await supabase
        .from('task_progress_entries')
        .select('task_id, amount_completed')
        .eq('event_id', task.event_id)
        .eq('company_id', companyId);

      if (progressError) throw progressError;

      // Calculate completion status for each task
      const taskCompletionStatus = allTasks.map(task => {
        const [amount] = task.amount.split(' ');
        const totalRequired = parseFloat(amount);
        const completed = allProgress
          .filter(p => p.task_id === task.id)
          .reduce((sum, p) => sum + p.amount_completed, 0);
        return completed >= totalRequired;
      });

      // Update event status based on task completion
      const allTasksCompleted = taskCompletionStatus.every(status => status);
      const { error: updateError } = await supabase
        .from('events')
        .update({ status: allTasksCompleted ? 'finished' : 'in_progress' })
        .eq('id', task.event_id)
        .eq('company_id', companyId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_progress', task?.id, companyId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['events', companyId] });
      setAmountCompleted('');
      setHoursSpent('');
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!task?.id || !amountCompleted || !hoursSpent) return;
    
    const amount = parseFloat(amountCompleted);
    const hours = parseFloat(hoursSpent);
    
    if (isNaN(amount) || isNaN(hours) || amount <= 0 || hours <= 0) {
      return;
    }

    addProgressEntryMutation.mutate({
      taskId: task.id,
      amount,
      hours
    });
  };

  if (!task) return null;

  // Parse the amount from the task.amount string (e.g., "5 walls" -> 5)
  const [amount, ...unitParts] = task.amount.split(' ');
  const totalAmount = parseFloat(amount);
  const unit = unitParts.join(' ');
  const remainingAmount = totalAmount - totalCompleted;
  const remainingHours = (task.hours_worked || 0) - totalHoursSpent;

  return (
    <Modal title="Update Task Progress" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Amount Completed</label>
          <div className="mt-1 flex items-center">
            <input
              type="number"
              value={amountCompleted}
              onChange={(e) => setAmountCompleted(e.target.value)}
              min="0.01"
              step="0.01"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder={`Enter completed amount in ${unit}`}
            />
            <span className="ml-2 text-gray-500">{unit}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Hours Spent</label>
          <input
            type="number"
            value={hoursSpent}
            onChange={(e) => setHoursSpent(e.target.value)}
            min="0.01"
            step="0.01"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter hours spent"
          />
        </div>

        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          <p className="text-sm text-gray-600">
            Total Completed: <span className="font-medium">{parseFloat(totalCompleted.toFixed(2))} {unit}</span>
          </p>
          <p className="text-sm text-gray-600">
            Remaining: <span className="font-medium">{parseFloat(remainingAmount.toFixed(2))} {unit}</span>
          </p>
          <p className="text-sm text-gray-600">
            Total Hours Spent: <span className="font-medium">{parseFloat(totalHoursSpent.toFixed(2))}</span>
          </p>
          <p className="text-sm text-gray-600">
            Remaining Hours: <span className="font-medium">{parseFloat(remainingHours.toFixed(2))}</span>
          </p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={
            addProgressEntryMutation.isPending || 
            !amountCompleted || 
            !hoursSpent || 
            parseFloat(amountCompleted) <= 0 || 
            parseFloat(hoursSpent) <= 0
          }
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {addProgressEntryMutation.isPending ? 'Updating...' : 'Update Progress'}
        </button>
      </div>
    </Modal>
  );
};

export default TaskProgressModal;
