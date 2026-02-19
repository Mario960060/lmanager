import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [amountCompleted, setAmountCompleted] = useState('');
  const [hoursSpent, setHoursSpent] = useState('');
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [totalHoursSpent, setTotalHoursSpent] = useState(0);

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

  const addProgressEntryMutation = useMutation({
    mutationFn: async ({ taskId, amount, hours }: { taskId: string; amount: number; hours: number }) => {
      if (!user?.id || !task?.event_id) throw new Error('Missing required data');

      const { data: taskDetails, error: taskError } = await supabase
        .from('tasks_done')
        .select('name, event_task_id')
        .eq('id', taskId)
        .single();

      if (taskError) throw taskError;

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

      const { data: allTasks, error: tasksError } = await supabase
        .from('tasks_done')
        .select('id, amount')
        .eq('event_id', task.event_id)
        .eq('company_id', companyId);

      if (tasksError) throw tasksError;

      const { data: allProgress, error: progressError } = await supabase
        .from('task_progress_entries')
        .select('task_id, amount_completed')
        .eq('event_id', task.event_id)
        .eq('company_id', companyId);

      if (progressError) throw progressError;

      const taskCompletionStatus = allTasks.map(task => {
        const [amount] = task.amount.split(' ');
        const totalRequired = parseFloat(amount);
        const completed = allProgress
          .filter(p => p.task_id === task.id)
          .reduce((sum, p) => sum + p.amount_completed, 0);
        return completed >= totalRequired;
      });

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

    if (isNaN(amount) || isNaN(hours) || amount <= 0 || hours <= 0) return;

    addProgressEntryMutation.mutate({ taskId: task.id, amount, hours });
  };

  if (!task) return null;

  const [amount, ...unitParts] = task.amount.split(' ');
  const totalAmount = parseFloat(amount);
  const unit = unitParts.join(' ');
  const progressPercent = totalAmount > 0 ? Math.min(Math.round((totalCompleted / totalAmount) * 100), 100) : 0;

  return (
    <Modal title={task.name || t('event:update_task_progress')} onClose={onClose}>
      <div className="space-y-4">
        {/* Progress Summary */}
        <div className="bg-gray-50 p-3.5 rounded-lg space-y-2 border border-gray-200">
          <div className="flex justify-between items-center text-[13px]">
            <span className="text-gray-600">{t('event:total_completed')}</span>
            <span className="font-semibold">{parseFloat(totalCompleted.toFixed(2))} / {totalAmount} {unit}</span>
          </div>
          <div className="flex justify-between items-center text-[13px]">
            <span className="text-gray-600">{t('event:total_hours_spent')}</span>
            <span className="font-semibold">{parseFloat(totalHoursSpent.toFixed(2))} / {task.hours_worked || 0}h</span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPercent}%`,
                background: 'linear-gradient(90deg, #3b82f6, #60a5fa)'
              }}
            />
          </div>
        </div>

        {/* Amount Input */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <label className="block text-sm font-medium text-gray-700">{t('event:amount_completed')}</label>
            <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded font-medium">{unit}</span>
          </div>
          <input
            type="number"
            value={amountCompleted}
            onChange={(e) => setAmountCompleted(e.target.value)}
            min="0.01"
            step="0.01"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder={t('event:enter_completed_amount', { defaultValue: `Enter completed amount in ${unit}` }).replace('{unit}', unit)}
            inputMode="decimal"
          />
        </div>

        {/* Hours Input with Quick Picks */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('event:hours_spent')}</label>
          <input
            type="number"
            value={hoursSpent}
            onChange={(e) => setHoursSpent(e.target.value)}
            min="0.01"
            step="0.5"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder={t('event:enter_hours_spent', { defaultValue: 'np. 2.5' })}
            inputMode="decimal"
          />
          <div className="flex gap-1.5 mt-2">
            {[1, 2, 4, 8].map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setHoursSpent(h.toString())}
                className={`flex-1 py-1.5 text-[13px] font-semibold rounded-md border transition-colors min-h-0 ${
                  hoursSpent === h.toString()
                    ? 'bg-blue-600 bg-opacity-10 border-blue-600 text-blue-600'
                    : 'bg-gray-50 border-gray-200 text-gray-500 active:bg-gray-100'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={
            addProgressEntryMutation.isPending ||
            !amountCompleted ||
            !hoursSpent ||
            parseFloat(amountCompleted) <= 0 ||
            parseFloat(hoursSpent) <= 0
          }
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-bold text-[15px] hover:bg-blue-700 transition-colors disabled:opacity-40 active:scale-[0.98] mt-2"
        >
          {addProgressEntryMutation.isPending ? t('event:updating') : t('event:update_progress')}
        </button>
      </div>
    </Modal>
  );
};

export default TaskProgressModal;
