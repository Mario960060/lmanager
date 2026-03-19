import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { translateTaskName } from '../../lib/translationMap';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { ChevronDown, ChevronUp, Search, X, CheckCircle, Trash2, Users } from 'lucide-react';
import { Spinner, Button } from '../../themes/uiComponents';
import { colors } from '../../themes/designTokens';

interface CompanyTaskPerformanceModalProps {
  onClose: () => void;
}

interface DeleteConfirmationProps {
  recordId: string;
  recordType: string;
  recordName: string;
  onCancel: () => void;
  onConfirm: () => void;
  t?: (key: string) => string;
}

const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({
  recordId,
  recordType,
  recordName,
  onCancel,
  onConfirm,
  t = (key) => key
}) => (
  <div className="fixed inset-0 flex items-center justify-center z-[60] p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
    <div className="rounded-lg shadow-xl p-6 max-w-md w-full" style={{ backgroundColor: colors.bgCard }}>
      <h3 className="text-lg font-semibold mb-4">{t('common:confirm_deletion')}</h3>
      <p className="mb-6">{t('common:want_delete_record')}</p>
      <p className="mb-6 text-sm" style={{ color: colors.textSubtle }}>
        <strong>{t('common:type_label')}:</strong> {recordType}<br />
        <strong>{t('common:name_label')}:</strong> {recordName}
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={(e) => { e.stopPropagation(); onCancel(); }}>{t('common:no')}</Button>
        <Button variant="danger" onClick={(e) => { e.stopPropagation(); onConfirm(); }}>{t('common:yes')}</Button>
      </div>
    </div>
  </div>
);

const CompanyTaskPerformanceModal: React.FC<CompanyTaskPerformanceModalProps> = ({ onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event', 'calculator']);
  const { user } = useAuthStore();
  const profile = useAuthStore(state => state.profile);
  const companyId = useAuthStore(state => state.getCompanyId());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    recordId: string;
    recordName: string;
  }>({ isOpen: false, recordId: '', recordName: '' });
  const [showRequestSent, setShowRequestSent] = useState(false);

  const isViewingOwnData = selectedUserId === user?.id || !selectedUserId;

  // Fetch company members (employees)
  const { data: companyMembers = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ['company_members_task_performance', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('company_members')
        .select('id, user_id, role')
        .eq('company_id', profile.company_id)
        .eq('status', 'accepted')
        .order('joined_at');

      if (error) throw error;

      const userIds = data?.map(m => m.user_id) || [];
      if (userIds.length === 0) return [];

      const { data: profilesData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', userIds)
        .eq('is_active', true);

      if (profileError) throw profileError;

      return (profilesData || []).map(prof => {
        const member = data?.find(m => m.user_id === prof.id);
        return {
          ...prof,
          memberId: member?.id,
          userId: prof.id
        };
      });
    },
    enabled: !!profile?.company_id
  });

  // Fetch task progress entries for selected user
  const { data: taskProgressEntries = [], isLoading: isLoadingProgress, refetch } = useQuery({
    queryKey: ['company_user_task_progress', selectedUserId, companyId],
    queryFn: async () => {
      if (!selectedUserId) return [];

      const { data, error } = await supabase
        .from('task_progress_entries')
        .select(`
          id,
          task_id,
          amount_completed,
          hours_spent,
          created_at,
          event_tasks_id,
          event_id,
          tasks_done (
            id,
            name,
            amount,
            unit,
            event_id
          )
        `)
        .eq('user_id', selectedUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const eventIds = [...new Set(data.map(entry => entry.event_id).filter(Boolean))];

      if (eventIds.length > 0) {
        const { data: events, error: eventsError } = await supabase
          .from('events')
          .select('id, title')
          .eq('company_id', companyId)
          .in('id', eventIds);

        if (!eventsError && events) {
          const eventTitleMap = new Map(events.map(event => [event.id, event.title]));
          return data.map(entry => ({
            ...entry,
            eventTitle: entry.event_id ? eventTitleMap.get(entry.event_id) || t('common:unknown_project') : t('common:unknown_project')
          }));
        }
      }

      return data.map(entry => ({ ...entry, eventTitle: t('common:unknown_project') }));
    },
    enabled: !!selectedUserId && !!companyId
  });

  const createDeletionRequest = useMutation({
    mutationFn: async (recordId: string) => {
      const entry = taskProgressEntries.find(e => e.id === recordId);
      if (!entry) throw new Error('Record not found');

      const { error } = await supabase
        .from('deletion_requests')
        .insert({
          user_id: user?.id,
          record_id: recordId,
          record_type: 'task_progress_entries',
          record_details: {
            task: entry.tasks_done?.name || t('common:unknown_task'),
            project: entry.eventTitle || t('common:unknown_project'),
            amount: `${entry.amount_completed} ${entry.tasks_done?.unit || t('common:units')}`,
            hours: `${entry.hours_spent} ${t('event:hours')}`,
            date: new Date(entry.created_at).toLocaleDateString()
          },
          status: 'pending'
        });

      if (error) throw error;
      setShowRequestSent(true);
      return recordId;
    },
    onSuccess: () => {
      setDeleteConfirmation({ isOpen: false, recordId: '', recordName: '' });
      refetch();
    },
    onError: (error) => {
      console.error('Failed to create deletion request:', error);
      alert(t('event:failed_delete_request'));
    }
  });

  const handleDeleteClick = (recordId: string, recordName: string) => {
    setDeleteConfirmation({ isOpen: true, recordId, recordName });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmation.recordId) {
      createDeletionRequest.mutate(deleteConfirmation.recordId);
    }
  };

  const taskPerformance = React.useMemo(() => {
    const taskGroups: Record<string, {
      taskName: string;
      eventTasksId: string;
      totalAmount: number;
      totalHours: number;
      unit: string;
      efficiency: number;
      entries: Array<{ id: string; amount: number; hours: number; efficiency: number; date: string; eventTitle: string }>;
      eventTitle: string;
    }> = {};

    taskProgressEntries.forEach(entry => {
      if (!entry.tasks_done?.name || !entry.event_tasks_id) return;

      const taskName = entry.tasks_done.name;
      const eventTasksId = entry.event_tasks_id;
      const unit = entry.tasks_done.unit || t('common:units');
      const eventTitle = entry.eventTitle || 'Unknown Project';

      if (!taskGroups[eventTasksId]) {
        taskGroups[eventTasksId] = {
          taskName,
          eventTasksId,
          totalAmount: 0,
          totalHours: 0,
          unit,
          efficiency: 0,
          entries: [],
          eventTitle
        };
      }

      taskGroups[eventTasksId].entries.push({
        id: entry.id,
        amount: entry.amount_completed,
        hours: entry.hours_spent,
        efficiency: entry.amount_completed / entry.hours_spent,
        date: new Date(entry.created_at).toLocaleDateString(),
        eventTitle
      });
      taskGroups[eventTasksId].totalAmount += entry.amount_completed;
      taskGroups[eventTasksId].totalHours += entry.hours_spent;
    });

    Object.values(taskGroups).forEach(group => {
      group.efficiency = group.totalHours > 0 ? group.totalAmount / group.totalHours : 0;
    });

    return Object.values(taskGroups);
  }, [taskProgressEntries, t]);

  const toggleTaskDetails = (eventTasksId: string) => {
    setExpandedTaskId(expandedTaskId === eventTasksId ? null : eventTasksId);
  };

  const filteredTaskPerformance = searchTerm
    ? taskPerformance.filter(task =>
        task.taskName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.eventTitle.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : taskPerformance;

  const selectedEmployee = companyMembers.find(m => m.userId === selectedUserId);

  return (
    <>
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" style={{ backgroundColor: colors.bgCard }}>
          {/* Header */}
          <div className="p-4 border-b flex justify-between items-center sticky top-0 z-10" style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgCard }}>
            <h2 className="text-xl font-semibold flex items-center">
              <CheckCircle className="w-5 h-5 mr-2" style={{ color: colors.accentBlue }} />
              {t('common:company_task_performance_title')}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full transition-colors"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.bgHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Employee selector */}
          <div className="p-4 border-b" style={{ borderColor: colors.borderDefault }}>
            <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {t('common:select_employee')}
            </label>
            <div className="relative">
              <select
                value={selectedUserId || ''}
                onChange={(e) => setSelectedUserId(e.target.value || null)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg appearance-none cursor-pointer"
                style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgElevated, color: colors.textPrimary }}
              >
                <option value="">{t('common:select_employee_placeholder')}</option>
                {companyMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.full_name || t('common:unknown_user')} {member.role ? `(${member.role})` : ''}
                  </option>
                ))}
              </select>
              <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 pointer-events-none" style={{ color: colors.textMuted }} />
            </div>
          </div>

          {selectedUserId && (
            <>
              {/* Search */}
              <div className="p-4 border-b" style={{ borderColor: colors.borderDefault }}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: colors.textMuted }} />
                  <input
                    type="text"
                    placeholder={t('event:search_tasks_project')}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg"
                    style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgElevated }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {isLoadingProgress ? (
                  <div className="flex justify-center p-6">
                    <Spinner size={32} />
                  </div>
                ) : filteredTaskPerformance.length > 0 ? (
                  <div className="space-y-4">
                    <p className="text-sm mb-2" style={{ color: colors.textSubtle }}>
                      {t('common:task_performance_for')}: <strong style={{ color: colors.textPrimary }}>{selectedEmployee?.full_name || t('common:unknown_user')}</strong>
                    </p>
                    {filteredTaskPerformance.map((task) => (
                      <div key={task.eventTasksId} className="border rounded-lg overflow-hidden" style={{ borderColor: colors.borderDefault }}>
                        <button
                          onClick={() => toggleTaskDetails(task.eventTasksId)}
                          className="w-full flex items-center justify-between p-4 text-left transition-colors"
                          style={{ backgroundColor: colors.bgElevated }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.bgHover; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.bgElevated; }}
                        >
                          <div>
                            <h3 className="font-medium" style={{ color: colors.textPrimary }}>
                              {translateTaskName(task.taskName, t)}
                            </h3>
                            <p className="text-sm" style={{ color: colors.textSubtle }}>
                              {t('event:project_label')}: {task.eventTitle}
                            </p>
                            <div className="mt-1 grid grid-cols-2 gap-4">
                              <div>
                                <span className="text-sm" style={{ color: colors.textSubtle }}>{t('event:average_time')}:</span>
                                <span className="ml-2 font-medium">{(1 / task.efficiency).toFixed(2)} hrs/{task.unit}</span>
                              </div>
                              <div>
                                <span className="text-sm" style={{ color: colors.textSubtle }}>{t('event:total_hours')}:</span>
                                <span className="ml-2 font-medium">{task.totalHours.toFixed(2)} {t('common:hrs_abbr')}</span>
                              </div>
                            </div>
                          </div>
                          {expandedTaskId === task.eventTasksId ? (
                            <ChevronUp className="h-5 w-5" style={{ color: colors.textMuted }} />
                          ) : (
                            <ChevronDown className="h-5 w-5" style={{ color: colors.textMuted }} />
                          )}
                        </button>

                        {expandedTaskId === task.eventTasksId && (
                          <div className="p-4" style={{ backgroundColor: colors.bgCard }}>
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <thead>
                                  <tr className="border-b" style={{ borderColor: colors.borderDefault }}>
                                    <th className="text-left py-2 px-4">{t('common:date')}</th>
                                    <th className="text-left py-2 px-4">{t('event:project_label')}</th>
                                    <th className="text-right py-2 px-4">{t('event:total_completed')}</th>
                                    <th className="text-right py-2 px-4">{t('event:hours_spent')}</th>
                                    <th className="text-right py-2 px-4">{t('event:amount_per_hour')}</th>
                                    {isViewingOwnData && (
                                      <th className="text-right py-2 px-4">{t('event:actions_label')}</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {task.entries.map((entry, index) => (
                                    <tr key={entry.id} className="border-b" style={{ borderColor: colors.borderDefault, background: index % 2 === 1 ? colors.bgTableRowAlt : undefined }}>
                                      <td className="py-2 px-4">{entry.date}</td>
                                      <td className="py-2 px-4">{task.eventTitle}</td>
                                      <td className="text-right py-2 px-4">
                                        {entry.amount.toFixed(2)} {task.unit}
                                      </td>
                                      <td className="text-right py-2 px-4">{entry.hours.toFixed(2)} hrs</td>
                                      <td className="text-right py-2 px-4">
                                        {entry.efficiency.toFixed(2)} {task.unit}/{t('common:hrs_abbr')}
                                      </td>
                                      {isViewingOwnData && (
                                        <td className="text-right py-2 px-4">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDeleteClick(
                                                entry.id,
                                                `${translateTaskName(task.taskName, t)} (${entry.date})`
                                              );
                                            }}
                                            className="font-medium flex items-center ml-auto"
                                            style={{ color: colors.red }}
                                          >
                                            <Trash2 className="w-4 h-4 mr-1" />
                                            {t('event:delete_button')}
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8" style={{ color: colors.textSubtle }}>
                    {searchTerm ? t('event:no_tasks_match') : t('event:no_task_progress_yet')}
                  </div>
                )}
              </div>
            </>
          )}

          {!selectedUserId && (
            <div className="flex-1 flex items-center justify-center p-8" style={{ color: colors.textSubtle }}>
              <p>{t('common:select_employee_to_view_performance')}</p>
            </div>
          )}
        </div>
      </div>

      {deleteConfirmation.isOpen && (
        <DeleteConfirmation
          recordId={deleteConfirmation.recordId}
          recordType={t('event:task_performance_entry')}
          recordName={deleteConfirmation.recordName}
          onCancel={() => setDeleteConfirmation({ isOpen: false, recordId: '', recordName: '' })}
          onConfirm={handleConfirmDelete}
          t={t}
        />
      )}

      {showRequestSent && (
        <div className="fixed inset-0 flex items-center justify-center z-[60]" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-lg shadow-xl p-6 max-w-sm w-full" style={{ backgroundColor: colors.bgCard }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center">
                <svg className="w-5 h-5 mr-2" style={{ color: colors.green }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('event:success')}
              </h3>
              <button
                onClick={() => setShowRequestSent(false)}
                className="p-1 rounded-full transition-colors"
                style={{ backgroundColor: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.bgHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="mb-4" style={{ color: colors.textMuted }}>
              {t('event:deletion_request_sent')}
            </p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setShowRequestSent(false)}>
                {t('common:close')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CompanyTaskPerformanceModal;
