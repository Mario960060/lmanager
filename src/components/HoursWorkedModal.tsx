import React from 'react';
import { useTranslation } from 'react-i18next';
import { colors } from '../themes/designTokens';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { X } from 'lucide-react';

interface HoursWorkedModalProps {
  eventId: string;
  onClose: () => void;
}

const HoursWorkedModal: React.FC<HoursWorkedModalProps> = ({ eventId, onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
  const companyId = useAuthStore(state => state.getCompanyId());
  // Fetch task progress entries with user information
  const { data: taskProgress = [], isLoading } = useQuery({
    queryKey: ['task_progress', eventId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_progress_entries')
        .select(`
          hours_spent,
          amount_completed,
          created_at,
          user_id,
          task_id,
          tasks_done (
            name,
            amount
          ),
          profiles (
            full_name
          )
        `)
        .eq('event_id', eventId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group entries by user and task
      const groupedEntries = data.reduce((acc: any, entry) => {
        const userId = entry.user_id;
        const userName = entry.profiles?.full_name || t('common:unknown_user');
        const taskName = entry.tasks_done?.name || t('event:unknown_task');
        
        if (!acc[userId]) {
          acc[userId] = {
            userId,
            userName,
            tasks: {}
          };
        }

        if (!acc[userId].tasks[taskName]) {
          acc[userId].tasks[taskName] = {
            totalHours: 0,
            totalCompleted: 0,
            unit: entry.tasks_done?.amount?.split(' ')[1] || t('common:units')
          };
        }

        acc[userId].tasks[taskName].totalHours += entry.hours_spent;
        acc[userId].tasks[taskName].totalCompleted += entry.amount_completed;

        return acc;
      }, {});

      return groupedEntries;
    },
    enabled: !!companyId
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-0 md:p-4">
        <div className="rounded-lg p-6" style={{ backgroundColor: colors.bgCard }}>
          <p>{t('common:loading')}</p>
        </div>
      </div>
    );
  }

  const totalHours = Object.values(taskProgress).reduce((sum: number, user: any) => {
    return sum + Object.values(user.tasks).reduce((taskSum: number, task: any) => {
      return taskSum + task.totalHours;
    }, 0);
  }, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-0 md:p-4">
      <div className="rounded-lg max-w-2xl w-full" style={{ backgroundColor: colors.bgCard }}>
        <div className="flex justify-between items-center p-6 border-b" style={{ borderColor: colors.borderDefault }}>
          <div>
            <h2 className="text-xl font-semibold">{t('event:hours_worked')}</h2>
            <p className="text-sm mt-1" style={{ color: colors.textMuted }}>{t('event:total_hours')}: {totalHours}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {Object.keys(taskProgress).length > 0 ? (
            <div className="space-y-6">
              {Object.entries(taskProgress).map(([userId, userData]: [string, any]) => (
                <div key={userId} className="rounded-lg p-4" style={{ backgroundColor: colors.bgSubtle }}>
                  <h3 className="font-medium text-lg" style={{ color: colors.textPrimary }}>{userData.userName}</h3>
                  
                  <div className="mt-4 space-y-3">
                    {Object.entries(userData.tasks).map(([taskName, taskData]: [string, any]) => (
                      <div key={taskName} className="p-3 rounded-md shadow-sm" style={{ backgroundColor: colors.bgCard }}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium" style={{ color: colors.textSecondary }}>{taskName}</p>
                            <p className="text-sm" style={{ color: colors.textMuted }}>
                              {t('event:completed')}: {taskData.totalCompleted} {taskData.unit}
                            </p>
                          </div>
                          <span className="font-medium" style={{ color: colors.accentBlue }}>
                            {taskData.totalHours} {t('event:hours_label')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center" style={{ color: colors.textMuted }}>{t('event:no_hours_recorded')}</p>
          )}
        </div>

        <div className="p-6 border-t" style={{ backgroundColor: colors.bgSubtle }}>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg transition-colors"
            style={{ backgroundColor: colors.borderLight, color: colors.textSecondary }}
          >
            {t('common:close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HoursWorkedModal;
