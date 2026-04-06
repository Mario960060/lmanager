import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { translateTaskName, translateMaterialName } from '../../lib/translationMap';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { X, Trash2, ChevronDown, ChevronUp, User, Calendar, AlertCircle } from 'lucide-react';
import { Spinner, Button } from '../../themes/uiComponents';
import { colors } from '../../themes/designTokens';

interface AdditionalTaskRecord {
  id: string;
  user_id: string;
  event_id: string;
  description: string;
  created_at: string;
  progress: number;
  hours_spent: number;
  hours_needed: number;
  events?: {
    id: string;
    title: string;
  };
  additional_task_progress_entries?: {
    progress_percentage: number;
    hours_spent: number;
    created_at: string;
    notes?: string;
  }[];
  additional_task_materials?: {
    material: string;
    quantity: number;
    unit: string;
  }[];
}

interface UserGroup {
  user_id: string;
  user_name: string;
  records: AdditionalTaskRecord[];
}

interface AdminAdditionalTasksModalProps {
  onClose: () => void;
}

const AdminAdditionalTasksModal: React.FC<AdminAdditionalTasksModalProps> = ({ onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'calculator', 'material']);
  const queryClient = useQueryClient();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{recordId: string, recordName: string} | null>(null);

  // Fetch all additional tasks records
  const { data: userGroups = [], isLoading, isError } = useQuery({
    queryKey: ['admin_additional_tasks_records', companyId],
    queryFn: async () => {
      // Fetch all additional tasks with progress entries and event details
      const { data: records, error } = await supabase
        .from('additional_tasks')
        .select(`
          *,
          events (
            id,
            title
          ),
          additional_task_progress_entries (
            progress_percentage,
            hours_spent,
            created_at,
            notes
          ),
          additional_task_materials (
            material,
            quantity,
            unit
          )
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching additional tasks records:', error);
        throw error;
      }
      
      // Fetch all profiles to get user names
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('company_id', companyId);
      
      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        throw profilesError;
      }
      
      // Create a map of user IDs to names
      const userMap: Record<string, string> = {};
      profiles?.forEach(profile => {
        userMap[profile.id] = profile.full_name || 'Unknown User';
      });
      
      // Group records by user
      const groupedByUser: Record<string, UserGroup> = {};
      
      records?.forEach(record => {
        const userId = record.user_id;
        if (!userId) return;
        
        if (!groupedByUser[userId]) {
          groupedByUser[userId] = {
            user_id: userId,
            user_name: userMap[userId] || 'Unknown User',
            records: []
          };
        }
        
        groupedByUser[userId].records.push(record as AdditionalTaskRecord);
      });
      
      // Convert to array and sort by user name      
      return Object.values(groupedByUser).sort((a, b) => 
        a.user_name.localeCompare(b.user_name)
      );
    },
    enabled: !!companyId
  });

  // Delete record mutation
  const deleteRecord = useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase
        .from('additional_tasks')
        .delete()
        .eq('id', recordId)
        .eq('company_id', companyId);
      
      if (error) {
        console.error('Error deleting record:', error);
        throw error;
      }
      
      return recordId;
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['admin_additional_tasks_records', companyId] });
      setDeleteConfirmation(null);
    }
  });

  // Toggle user expansion
  const toggleUserExpand = (userId: string) => {
    setExpandedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId) 
        : [...prev, userId]
    );
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Filter user groups based on search term
  const filteredUserGroups = searchTerm
    ? userGroups.map(group => ({
        ...group,
        records: group.records.filter(record => {
          const searchLower = searchTerm.toLowerCase();
          return (
            record.description?.toLowerCase().includes(searchLower) ||
            record.events?.title?.toLowerCase().includes(searchLower)
          );
        })
      })).filter(group => group.records.length > 0)
    : userGroups;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" style={{ backgroundColor: colors.bgCard }}>
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center sticky top-0 z-10" style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgCard }}>
          <h2 className="text-xl font-semibold flex items-center">
            <Trash2 className="w-5 h-5 mr-2" style={{ color: colors.red }} />
            {t('event:delete_additional_tasks_records_title')}
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

        {/* Search */}
        <div className="p-4 border-b" style={{ borderColor: colors.borderDefault }}>
          <input
            type="text"
            placeholder={t('event:search_additional_tasks_records')}
            className="w-full px-4 py-2 border rounded-lg"
            style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgElevated }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex justify-center p-6">
              <Spinner size={32} color={colors.red} />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-12 h-12 mb-4" style={{ color: colors.red }} />
              <p className="text-center" style={{ color: colors.red }}>
                {t('event:error_loading_tasks_records')}
              </p>
            </div>
          ) : filteredUserGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-12 h-12 mb-4" style={{ color: colors.textMuted }} />
              <p className="text-center" style={{ color: colors.textSubtle }}>
                {searchTerm ? t('event:no_tasks_records_match_search') : t('event:no_additional_tasks_records')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUserGroups.map((group) => (
                <div 
                  key={group.user_id} 
                  className="border rounded-lg overflow-hidden"
                  style={{ borderColor: colors.borderDefault }}
                >
                  {/* User header */}
                  <div 
                    className="p-4 flex justify-between items-center cursor-pointer"
                    style={{ backgroundColor: colors.bgElevated }}
                    onClick={() => toggleUserExpand(group.user_id)}
                  >
                    <div className="flex items-center">
                      <User className="w-5 h-5 mr-2" style={{ color: colors.accentBlue }} />
                      <span className="font-medium">{group.user_name}</span>
                      <span className="ml-2 text-sm" style={{ color: colors.textSubtle }}>
                        ({group.records.length} {group.records.length !== 1 ? t('event:records_count_plural') : t('event:records_count')})
                      </span>
                    </div>
                    {expandedUsers.includes(group.user_id) ? (
                      <ChevronUp className="w-5 h-5" style={{ color: colors.textSubtle }} />
                    ) : (
                      <ChevronDown className="w-5 h-5" style={{ color: colors.textSubtle }} />
                    )}
                  </div>
                  
                  {/* User records */}
                  {expandedUsers.includes(group.user_id) && (
                    <div className="divide-y" style={{ borderColor: colors.borderDefault }}>
                      {group.records.map((record) => (
                        <div key={record.id} className="p-4" style={{ backgroundColor: colors.bgCard }}>
                          <div className="flex justify-between">
                            <div className="flex-1">
                              <h3 className="font-medium" style={{ color: colors.accentBlue }}>
                                {translateTaskName(record.description ?? '', t) || t('event:unnamed_task')}
                              </h3>
                              <div className="mt-1 text-sm">
                                <div className="flex items-center" style={{ color: colors.textSubtle }}>
                                  <Calendar className="w-4 h-4 mr-1" />
                                  {formatDate(record.created_at)}
                                </div>
                                {record.events?.title && (
                                  <div className="mt-1">
                                    <span className="font-medium">{t('event:project_colon')}</span> {record.events.title}
                                  </div>
                                )}
                                {record.additional_task_materials && record.additional_task_materials.length > 0 && (
                                  <div className="mt-1">
                                    <span className="font-medium">{t('event:materials_label')}:</span>{' '}
                                    {record.additional_task_materials.map((m) => `${translateMaterialName(m.material, t)} (${m.quantity} ${m.unit})`).join(', ')}
                                  </div>
                                )}
                                {record.description && (
                                  <div className="mt-1">
                                    <span className="font-medium">{t('event:description_colon')}</span> {record.description}
                                  </div>
                                )}
                                
                                {/* Progress Information */}
                                <div className="mt-3 space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium">{t('event:progress_colon')}</span>
                                    <span>{record.progress || 0}%</span>
                                  </div>
                                  <div className="w-full rounded-full h-2" style={{ backgroundColor: colors.bgElevated }}>
                                    <div
                                      className="h-2 rounded-full"
                                      style={{ backgroundColor: colors.accentBlue, width: `${record.progress || 0}%` }}
                                    ></div>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span>{t('event:hours_colon')} {record.hours_spent || 0} / {record.hours_needed || 0}</span>
                                    <span style={{ color: colors.textSubtle }}>
                                      {record.hours_needed ? ((record.hours_spent / record.hours_needed) * 100).toFixed(1) : 0}{t('event:percent_of_estimated_time')}
                                    </span>
                                  </div>
                                </div>

                                {/* Latest Progress Entry */}
                                {record.additional_task_progress_entries && record.additional_task_progress_entries.length > 0 && (
                                  <div className="mt-3 p-2 rounded" style={{ backgroundColor: colors.bgSubtle }}>
                                    <div className="font-medium mb-1">{t('event:latest_update')}</div>
                                    {record.additional_task_progress_entries
                                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                      .slice(0, 1)
                                      .map((entry, index) => (
                                        <div key={index} className="text-sm">
                                          <div>{t('event:progress_colon')} {entry.progress_percentage}%</div>
                                          <div>{t('event:hours_colon')} {t('form:add')}: {entry.hours_spent}</div>
                                          <div>{t('event:date_added')} {formatDate(entry.created_at)}</div>
                                          {entry.notes && <div>{t('event:notes_label')}: {entry.notes}</div>}
                                        </div>
                                      ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => setDeleteConfirmation({
                                recordId: record.id,
                                recordName: translateTaskName(record.description ?? '', t) || t('common:this_task')
                              })}
                              className="p-2 rounded-full self-start ml-4"
                              style={{ color: colors.red, backgroundColor: 'transparent' }}
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmation && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-lg shadow-xl p-6 max-w-md w-full" style={{ backgroundColor: colors.bgCard }}>
            <h3 className="text-xl font-semibold mb-4">{t('event:confirm_deletion_title')}</h3>
            <p className="mb-6">
              {t('event:delete_record_confirmation')}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteConfirmation(null)}>{t('form:cancel')}</Button>
              <Button variant="danger" onClick={() => deleteRecord.mutate(deleteConfirmation.recordId)} disabled={deleteRecord.isPending}>
                {deleteRecord.isPending ? t('event:deleting_action') : t('event:delete_action')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAdditionalTasksModal;
