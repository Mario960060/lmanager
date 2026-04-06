import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { translateTaskName } from '../lib/translationMap';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';
import { useAuthStore } from '../lib/store';
import { Modal, Button, Label, TextInput, colors, spacing, radii, fontSizes, fontWeights, fonts, transitions } from '../themes';

type TaskDone = Database['public']['Tables']['tasks_done']['Row'];

interface TaskProgressModalProps {
  task: TaskDone | null;
  onClose: () => void;
  createdAt?: string;
  /** Folder was removed from project (canvas sync) — no new progress entries */
  progressLocked?: boolean;
}

const TaskProgressModal: React.FC<TaskProgressModalProps> = ({ task, onClose, createdAt, progressLocked }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event', 'calculator']);
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
    if (progressLocked) return;
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
    <Modal open={!!task} onClose={onClose} title={translateTaskName(task.name ?? '', t) || t('event:update_task_progress')} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
        <div style={{ background: colors.bgCardInner, padding: '16px 20px', borderRadius: radii["2xl"], border: `1px solid ${colors.borderDefault}`, marginBottom: spacing["5xl"] }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: fontSizes.base }}>
            <span style={{ color: colors.textDim, fontFamily: fonts.body }}>{t('event:total_completed')}</span>
            <span style={{ fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.body }}>{parseFloat(totalCompleted.toFixed(2))} / {totalAmount} {unit}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: fontSizes.base, marginTop: spacing.sm }}>
            <span style={{ color: colors.textDim, fontFamily: fonts.body }}>{t('event:total_hours_spent')}</span>
            <span style={{ fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.body }}>{parseFloat(totalHoursSpent.toFixed(2))} / {task.hours_worked || 0}h</span>
          </div>
          <div style={{ width: '100%', height: 3, background: colors.borderDefault, borderRadius: 2, marginTop: spacing.sm, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: colors.accentBlue, borderRadius: 2, width: `${progressPercent}%`, transition: 'width 0.5s' }} />
          </div>
        </div>

        {progressLocked && (
          <p style={{ fontSize: fontSizes.sm, color: colors.textMuted, marginBottom: spacing.sm }}>
            {t('event:progress_locked_hint')}
          </p>
        )}

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: 6 }}>
            <Label>{t('event:amount_completed')}</Label>
            <span style={{ background: colors.bgOverlay, color: colors.textFaint, fontSize: fontSizes.sm, padding: '2px 8px', borderRadius: radii.sm, fontWeight: fontWeights.medium }}>{unit}</span>
          </div>
          <TextInput type="text" value={amountCompleted} onChange={setAmountCompleted} disabled={progressLocked} placeholder={t('event:enter_completed_amount', { defaultValue: `Wpisz ukończoną ilość w ${unit}` }).replace('{unit}', unit)} />
        </div>

        <div>
          <Label style={{ marginBottom: 6 }}>{t('event:hours_spent')}</Label>
          <TextInput type="text" value={hoursSpent} onChange={setHoursSpent} disabled={progressLocked} placeholder={t('event:enter_hours_spent', { defaultValue: 'np. 2.5' })} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: spacing.sm }}>
            {[1, 2, 4, 8].map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setHoursSpent(h.toString())}
                style={{
                  padding: 10, borderRadius: radii.lg, border: `1px solid ${hoursSpent === h.toString() ? colors.accentBlue : colors.borderDefault}`,
                  background: hoursSpent === h.toString() ? colors.accentBlueBg : colors.bgCardInner,
                  color: hoursSpent === h.toString() ? colors.accentBlue : colors.textMuted,
                  fontSize: fontSizes.md, fontWeight: fontWeights.semibold, fontFamily: fonts.body, cursor: 'pointer', transition: transitions.fast,
                }}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>

        <Button variant="primary" fullWidth onClick={handleSubmit}
          disabled={progressLocked || addProgressEntryMutation.isPending || !amountCompleted || !hoursSpent || parseFloat(amountCompleted) <= 0 || parseFloat(hoursSpent) <= 0}
        >
          {addProgressEntryMutation.isPending ? t('event:updating') : t('event:update_progress')}
        </Button>
      </div>
    </Modal>
  );
};

export default TaskProgressModal;
