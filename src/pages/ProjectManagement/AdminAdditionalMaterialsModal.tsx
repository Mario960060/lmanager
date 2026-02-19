import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { X, Trash2, ChevronDown, ChevronUp, User, Calendar, AlertCircle } from 'lucide-react';

interface AdditionalMaterialRecord {
  id: string;
  user_id: string;
  event_id: string;
  material: string;  // Changed from 'materials' to 'material'
  unit: string;       // Added: This is the unit column directly in additional_materials
  quantity: number;
  created_at: string;
  event_title?: string;
}

interface UserGroup {
  user_id: string;
  user_name: string;
  records: AdditionalMaterialRecord[];
}

interface AdminAdditionalMaterialsModalProps {
  onClose: () => void;
}

const AdminAdditionalMaterialsModal: React.FC<AdminAdditionalMaterialsModalProps> = ({ onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities']);
  const queryClient = useQueryClient();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{recordId: string, recordName: string} | null>(null);

  // Fetch all additional materials records
  const { data: userGroups = [], isLoading, isError } = useQuery({
    queryKey: ['admin_additional_materials_records', companyId],
    queryFn: async () => {
      console.log('Fetching all additional materials records');
      
      // Fetch all additional materials with event titles
      const { data: records, error } = await supabase
        .from('additional_materials')
        .select(`
          id,
          user_id,
          event_id,
          material,
          unit,
          quantity,
          created_at,
          events(title)
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching additional materials records:', error);
        throw error;
      }
      
      console.log(`Found ${records?.length || 0} additional materials records`);
      if (records && records.length > 0) {
        console.log('Sample record:', records[0]);
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
        
        groupedByUser[userId].records.push(record as AdditionalMaterialRecord);
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
      console.log(`Deleting additional material record: ${recordId}`);
      
      const { error } = await supabase
        .from('additional_materials')
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
      queryClient.invalidateQueries({ queryKey: ['admin_additional_materials_records', companyId] });
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
            record.material?.toLowerCase().includes(searchLower) ||
            record.event_title?.toLowerCase().includes(searchLower)
          );
        })
      })).filter(group => group.records.length > 0)
    : userGroups;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-xl font-semibold flex items-center">
            <Trash2 className="w-5 h-5 mr-2 text-red-500" />
            {t('event:delete_additional_materials_records_title')}
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
          <input
            type="text"
            placeholder={t('event:search_additional_materials_records')}
            className="w-full px-4 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex justify-center p-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <p className="text-red-500 dark:text-red-400 text-center">
                {t('event:error_loading_records')}
              </p>
            </div>
          ) : filteredUserGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-center">
                {searchTerm ? t('event:no_records_match_search') : t('event:no_additional_materials_records')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUserGroups.map((group) => (
                <div 
                  key={group.user_id} 
                  className="border dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* User header */}
                  <div 
                    className="bg-gray-50 dark:bg-gray-700 p-4 flex justify-between items-center cursor-pointer"
                    onClick={() => toggleUserExpand(group.user_id)}
                  >
                    <div className="flex items-center">
                      <User className="w-5 h-5 mr-2 text-blue-500" />
                      <span className="font-medium">{group.user_name}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        ({group.records.length} {group.records.length !== 1 ? t('event:records_count_plural') : t('event:records_count')})
                      </span>
                    </div>
                    {expandedUsers.includes(group.user_id) ? (
                      <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  
                  {/* User records */}
                  {expandedUsers.includes(group.user_id) && (
                    <div className="divide-y dark:divide-gray-700">
                      {group.records.map((record) => (
                        <div key={record.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750">
                          <div className="flex justify-between">
                            <div>
                              <h3 className="font-medium text-blue-600 dark:text-blue-400">
                                {record.material || t('event:unnamed_material')}
                              </h3>
                              <div className="mt-1 text-sm">
                                <div className="flex items-center text-gray-500">
                                  <Calendar className="w-4 h-4 mr-1" />
                                  {formatDate(record.created_at)}
                                </div>
                                <div className="mt-1">
                                  <span className="font-medium">{t('event:quantity_colon')}</span> {record.quantity} {record.unit || ''}
                                </div>
                                {record.event_title && (
                                  <div className="mt-1">
                                    <span className="font-medium">{t('event:project_colon')}</span> {record.event_title}
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => setDeleteConfirmation({
                                recordId: record.id,
                                recordName: record.material || 'this material'
                              })}
                              className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold mb-4">{t('event:confirm_deletion_title')}</h3>
            <p className="mb-6">
              {t('event:delete_record_confirmation')}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirmation(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {t('form:cancel')}
              </button>
              <button
                onClick={() => deleteRecord.mutate(deleteConfirmation.recordId)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                disabled={deleteRecord.isPending}
              >
                {deleteRecord.isPending ? t('event:deleting_action') : t('event:delete_action')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAdditionalMaterialsModal;
