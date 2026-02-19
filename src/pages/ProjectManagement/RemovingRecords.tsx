import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { X, Trash2, Check, AlertCircle, Search, FileText, User, Calendar, Info } from 'lucide-react';

// Admin modals for record management
import AdminTaskPerformanceModal from './AdminTaskPerformanceModal';
import AdminAdditionalTasksModal from './AdminAdditionalTasksModal';
import AdminMaterialAddedModal from './AdminMaterialAddedModal';
import AdminAdditionalMaterialsModal from './AdminAdditionalMaterialsModal';
import AdminDayNotesModal from './AdminDayNotesModal';

interface RemovingRecordsProps {
  onClose: () => void;
}

interface DeletionRequest {
  id: string;
  user_id: string;
  record_id: string;
  record_type: string;
  record_details: any;
  created_at: string;
}

const RemovingRecords: React.FC<RemovingRecordsProps> = ({ onClose }) => {
  const { t } = useTranslation(['common', 'utilities', 'dashboard']);
  const [showRequests, setShowRequests] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // States for admin modals
  const [showTaskPerformanceModal, setShowTaskPerformanceModal] = useState(false);
  const [showAdditionalTasksModal, setShowAdditionalTasksModal] = useState(false);
  const [showMaterialAddedModal, setShowMaterialAddedModal] = useState(false);
  const [showAdditionalMaterialsModal, setShowAdditionalMaterialsModal] = useState(false);
  const [showDayNotesModal, setShowDayNotesModal] = useState(false);

  // Fetch all deletion requests - no user name fetching
  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['deletion_requests_all'],
    queryFn: async () => {
      console.log('Fetching deletion requests');
      
      const { data, error } = await supabase
        .from('deletion_requests')
        .select('*');
      
      if (error) {
        console.error('Error fetching deletion requests:', error);
        throw error;
      }
      
      console.log('Deletion requests data:', data);
      return data as DeletionRequest[];
    },
    enabled: showRequests
  });

  // Force a refetch when showRequests changes to true
  useEffect(() => {
    if (showRequests) {
      refetch();
    }
  }, [showRequests, refetch]);

  // Approve deletion request
  const approveDeletion = useMutation({
    mutationFn: async (requestId: string) => {
      const request = requests.find(r => r.id === requestId);
      if (!request) throw new Error('Request not found');
      
      console.log('Starting deletion process for:', {
        requestId,
        recordType: request.record_type,
        recordId: request.record_id,
        details: request.record_details
      });

      try {
        // Check if user has admin permissions
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', (await supabase.auth.getUser()).data.user?.id)
          .single();

        if (profileError) {
          console.error('Error checking admin permissions:', profileError);
          throw new Error('Failed to verify admin permissions');
        }

        if (!profileData || profileData.role !== 'Admin') {
          throw new Error('You must be an admin to delete records');
        }

        // Start a transaction
        console.log('Starting transaction');
        
        // First verify the record exists
        const { data: recordExists, error: recordCheckError } = await supabase
          .from(request.record_type)
          .select('id')
          .eq('id', request.record_id)
          .maybeSingle();
          
        if (recordCheckError) {
          console.error('Error checking record existence:', recordCheckError);
          throw new Error(`Failed to verify record: ${recordCheckError.message}`);
        }
        
        if (!recordExists) {
          console.log('Record not found, proceeding to delete request only');
          const { error: requestError } = await supabase
            .from('deletion_requests')
            .delete()
            .eq('id', requestId);
            
          if (requestError) {
            throw new Error(`Failed to delete request: ${requestError.message}`);
          }
          
          return { success: true, message: 'Request deleted (record was already removed)' };
        }

        // Attempt to delete the record
        console.log('Record found, attempting to delete from table:', request.record_type);
        const { error: deleteError } = await supabase
          .from(request.record_type)
          .delete()
          .eq('id', request.record_id);
        
        if (deleteError) {
          console.error('Error deleting record:', deleteError);
          if (deleteError.code === '42501') {
            throw new Error('You do not have permission to delete this record');
          }
          throw new Error(`Failed to delete record: ${deleteError.message}`);
        }

        // Verify the record was actually deleted
        const { data: verifyDeletion, error: verifyError } = await supabase
          .from(request.record_type)
          .select('id')
          .eq('id', request.record_id)
          .maybeSingle();
          
        if (verifyError) {
          console.error('Error verifying deletion:', verifyError);
        } else if (verifyDeletion) {
          throw new Error('Record deletion failed - record still exists');
        }

        console.log('Record deleted successfully, now deleting request');

        // Delete the request itself
        const { error: requestError } = await supabase
          .from('deletion_requests')
          .delete()
          .eq('id', requestId);
        
        if (requestError) {
          console.error('Error deleting request:', requestError);
          throw new Error(`Failed to delete request: ${requestError.message}`);
        }
        
        console.log('Deletion process completed successfully');
        return { success: true, message: 'Record and request deleted successfully' };
      } catch (error) {
        console.error('Error in deletion process:', error);
        throw error;
      }
    },
    onSuccess: (result) => {
      console.log('Deletion mutation completed:', result);
      refetch();
    },
    onError: (error: any) => {
      console.error('Deletion mutation error:', error);
      alert(t('common:failed_delete_record', { error: error.message }));
    }
  });

  // Reject deletion request
  const rejectDeletion = useMutation({
    mutationFn: async (requestId: string) => {
      console.log('Rejecting deletion for request ID:', requestId);
      
      // Just delete the request
      const { error } = await supabase
        .from('deletion_requests')
        .delete()
        .eq('id', requestId);
      
      if (error) {
        console.error('Error rejecting deletion:', error);
        throw error;
      }
      return requestId;
    },
    onSuccess: () => {
      refetch();
    }
  });

  // Filter requests based on search term
  const filteredRequests = searchTerm 
    ? requests.filter(request => {
        const searchLower = searchTerm.toLowerCase();
        const details = JSON.stringify(request.record_details || {}).toLowerCase();
        const recordType = request.record_type.toLowerCase();
        
        return details.includes(searchLower) || recordType.includes(searchLower);
      })
    : requests;

  // Format record type for display
  const formatRecordType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Extract key details from record_details for preview
  const getRecordSummary = (details: any) => {
    if (!details) return 'No details available';
    
    // Try to extract the most relevant information
    const summary = [];
    
    if (details.project) {
      summary.push(`Project: ${details.project}`);
    }
    
    if (details.description) {
      summary.push(`Description: ${details.description}`);
    }
    
    if (details.material) {
      summary.push(`Material: ${details.material}`);
    }
    
    if (details.date) {
      summary.push(`Date: ${details.date}`);
    }
    
    return summary.length > 0 ? summary.join(' | ') : 'See details below';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-xl font-semibold flex items-center">
            <Trash2 className="w-5 h-5 mr-2 text-red-500" />
            {t('form:removing_records_title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Main content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {!showRequests && !showTaskPerformanceModal && !showAdditionalTasksModal && 
           !showMaterialAddedModal && !showAdditionalMaterialsModal && !showDayNotesModal ? (
            // Initial screen with buttons
            <div className="space-y-6">
              {/* Approve Removals button */}
              <button
                onClick={() => setShowRequests(true)}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
              >
                <FileText className="w-5 h-5 mr-2" />
                {t('form:approve_removal_requests')}
              </button>
              
              {/* Admin record management buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setShowTaskPerformanceModal(true)}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
                >
                  {t('form:delete_task_performance_records_btn')}
                </button>
                
                <button
                  onClick={() => setShowMaterialAddedModal(true)}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
                >
                  {t('form:delete_material_added_records_btn')}
                </button>
                
                <button
                  onClick={() => setShowAdditionalTasksModal(true)}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
                >
                  {t('form:delete_additional_tasks_records_btn')}
                </button>
                
                <button
                  onClick={() => setShowAdditionalMaterialsModal(true)}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
                >
                  {t('form:delete_additional_materials_records_btn')}
                </button>
                
                <button
                  onClick={() => setShowDayNotesModal(true)}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center md:col-span-2"
                >
                  {t('form:delete_day_notes_records_btn')}
                </button>
              </div>
            </div>
          ) : showRequests ? (
            // Requests list screen
            <>
              {/* Search */}
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder={t('form:search_deletion_requests')}
                    className="w-full pl-10 pr-4 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{t('form:deletion_requests_title')}</h3>
                <button 
                  onClick={() => refetch()}
                  className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm flex items-center"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {t('form:refresh')}
                </button>
              </div>
              
              {isLoading ? (
                <div className="flex justify-center p-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                </div>
              ) : filteredRequests.length > 0 ? (
                <div className="space-y-6">
                  {filteredRequests.map((request) => (
                    <div key={request.id} className="border dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-750">
                      {/* Request header */}
                      <div className="bg-gray-50 dark:bg-gray-700 p-4 border-b dark:border-gray-600">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium text-lg text-blue-600 dark:text-blue-400">
                              {formatRecordType(request.record_type)}
                            </h3>
                            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                              {getRecordSummary(request.record_details)}
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => approveDeletion.mutate(request.id)}
                              className={`px-3 py-1 text-white rounded flex items-center ${
                                approveDeletion.isPending ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'
                              }`}
                              disabled={approveDeletion.isPending || rejectDeletion.isPending}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              {approveDeletion.isPending ? t('form:approving') : t('form:approve')}
                            </button>
                            <button
                              onClick={() => rejectDeletion.mutate(request.id)}
                              className={`px-3 py-1 text-white rounded flex items-center ${
                                rejectDeletion.isPending ? 'bg-gray-400' : 'bg-gray-600 hover:bg-gray-700'
                              }`}
                              disabled={approveDeletion.isPending || rejectDeletion.isPending}
                            >
                              <X className="w-4 h-4 mr-1" />
                              {rejectDeletion.isPending ? t('form:rejecting') : t('form:reject')}
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Request details */}
                      <div className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div className="flex items-center text-sm">
                            <User className="w-4 h-4 mr-2 text-gray-500" />
                            <span className="font-medium mr-2">{t('form:requested_by')}</span>
                            <span>{t('form:user_id_label')}: {request.user_id}</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                            <span className="font-medium mr-2">{t('form:requested_on')}</span>
                            <span>{formatDate(request.created_at)}</span>
                          </div>
                        </div>
                        
                        <div className="mt-4">
                          <h4 className="font-medium mb-2 flex items-center">
                            <Info className="w-4 h-4 mr-2 text-gray-500" />
                            {t('form:record_details_label')}
                          </h4>
                          <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md">
                            {Object.entries(request.record_details || {}).map(([key, value]) => (
                              <div key={key} className="mb-2">
                                <span className="font-medium text-gray-700 dark:text-gray-300">
                                  {key.replace(/\b\w/g, l => l.toUpperCase())}:
                                </span>{' '}
                                <span className="text-gray-800 dark:text-gray-200">
                                  {typeof value === 'string' ? value : JSON.stringify(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10">
                  <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 text-center">
                    {searchTerm ? t('form:no_requests_match_search') : t('form:no_deletion_requests')}
                  </p>
                </div>
              )}
              
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setShowRequests(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {t('form:back')}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
      
      {/* Admin Modals */}
      {showTaskPerformanceModal && (
        <AdminTaskPerformanceModal 
          onClose={() => setShowTaskPerformanceModal(false)} 
        />
      )}
      
      {showAdditionalTasksModal && (
        <AdminAdditionalTasksModal 
          onClose={() => setShowAdditionalTasksModal(false)} 
        />
      )}
      
      {showMaterialAddedModal && (
        <AdminMaterialAddedModal 
          onClose={() => setShowMaterialAddedModal(false)} 
        />
      )}
      
      {showAdditionalMaterialsModal && (
        <AdminAdditionalMaterialsModal 
          onClose={() => setShowAdditionalMaterialsModal(false)} 
        />
      )}
      
      {showDayNotesModal && (
        <AdminDayNotesModal 
          onClose={() => setShowDayNotesModal(false)} 
        />
      )}
    </div>
  );
};

export default RemovingRecords;
