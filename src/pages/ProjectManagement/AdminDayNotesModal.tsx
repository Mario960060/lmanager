import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { X, Trash2, ChevronDown, ChevronUp, User, Calendar, AlertCircle } from 'lucide-react';
import { Spinner, Button } from '../../themes/uiComponents';
import { colors } from '../../themes/designTokens';

interface DayNoteRecord {
  id: string;
  user_id: string;
  event_id: string;
  content: string;  // This will be displayed as the description
  created_at: string;
  event_title?: string;
}

interface UserGroup {
  user_id: string;
  user_name: string;
  records: DayNoteRecord[];
}

interface AdminDayNotesModalProps {
  onClose: () => void;
}

const AdminDayNotesModal: React.FC<AdminDayNotesModalProps> = ({ onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities']);
  const queryClient = useQueryClient();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{recordId: string, recordDate: string} | null>(null);

  // Fetch all day notes records
  const { data: userGroups = [], isLoading, isError } = useQuery({
    queryKey: ['admin_day_notes_records', companyId],
    queryFn: async () => {
      // Fetch all day notes with event titles
      const { data: records, error } = await supabase
        .from('day_notes')
        .select(`
          id,
          user_id,
          event_id,
          content,
          created_at,
          events(title)
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching day notes records:', error);
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
      
      // Process records to include event title
      const processedRecords = records.map(record => {
        // Check the structure of the joined data
        let eventTitle = 'Unknown Event';
        
        if (record.events && typeof record.events === 'object') {
          if (Array.isArray(record.events) && record.events.length > 0) {
            eventTitle = record.events[0].title || 'Unknown Event';
          } else if (record.events.title) {
            eventTitle = record.events.title;
          }
        }
        
        return {
          ...record,
          event_title: eventTitle
        };
      });
      
      // Group records by user
      const groupedByUser: Record<string, UserGroup> = {};
      
      processedRecords.forEach(record => {
        const userId = record.user_id;
        if (!userId) return;
        
        if (!groupedByUser[userId]) {
          groupedByUser[userId] = {
            user_id: userId,
            user_name: userMap[userId] || 'Unknown User',
            records: []
          };
        }
        
        groupedByUser[userId].records.push(record as DayNoteRecord);
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
        .from('day_notes')
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
      queryClient.invalidateQueries({ queryKey: ['admin_day_notes_records', companyId] });
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
            record.content?.toLowerCase().includes(searchLower) ||
            record.event_title?.toLowerCase().includes(searchLower)
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
            {t('event:delete_day_notes_records_title')}
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
            placeholder={t('event:search_day_notes')}
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
                {t('event:error_loading_day_notes')}
              </p>
            </div>
          ) : filteredUserGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-12 h-12 mb-4" style={{ color: colors.textMuted }} />
              <p className="text-center" style={{ color: colors.textSubtle }}>
                {searchTerm ? t('event:no_day_notes_records_match') : t('event:no_day_notes_records')}
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
                        ({group.records.length} {group.records.length !== 1 ? t('event:notes_label_plural') : t('event:notes_label')})
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
                            <div className="flex-1 pr-4">
                              <div className="flex items-center mb-2" style={{ color: colors.textSubtle }}>
                                <Calendar className="w-4 h-4 mr-1" />
                                {formatDate(record.created_at)}
                              </div>
                              {record.event_title && (
                                <div className="mb-2">
                                  <span className="font-medium">{t('event:project_colon')}</span> {record.event_title}
                                </div>
                              )}
                              <div className="mt-2">
                                <span className="font-medium">{t('event:description_colon')}</span>
                                <div className="mt-1 whitespace-pre-wrap" style={{ color: colors.textMuted }}>
                                  {record.content || t('event:no_description_provided')}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => setDeleteConfirmation({
                                recordId: record.id,
                                recordDate: formatDate(record.created_at)
                              })}
                              className="p-2 rounded-full h-fit"
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
              <Button variant="secondary" onClick={() => setDeleteConfirmation(null)}>
                {t('form:cancel')}
              </Button>
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

export default AdminDayNotesModal;
