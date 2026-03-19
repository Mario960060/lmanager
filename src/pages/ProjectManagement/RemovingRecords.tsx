import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { supabase } from '../../lib/supabase';
import { X, Trash2, Check, AlertCircle, Search, FileText, User, Calendar, Info } from 'lucide-react';
import { Spinner, Button } from '../../themes/uiComponents';
import { colors } from '../../themes/designTokens';

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
  const { t, i18n } = useTranslation(['common', 'utilities', 'dashboard', 'form']);
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
      const { data, error } = await supabase
        .from('deletion_requests')
        .select('*');
      
      if (error) {
        console.error('Error fetching deletion requests:', error);
        throw error;
      }
      
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

        // Delete the request itself
        const { error: requestError } = await supabase
          .from('deletion_requests')
          .delete()
          .eq('id', requestId);
        
        if (requestError) {
          console.error('Error deleting request:', requestError);
          throw new Error(`Failed to delete request: ${requestError.message}`);
        }
        
        return { success: true, message: 'Record and request deleted successfully' };
      } catch (error) {
        console.error('Error in deletion process:', error);
        throw error;
      }
    },
    onSuccess: () => {
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
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MMM d, yyyy HH:mm', { locale: dateLocale });
  };

  // Extract key details from record_details for preview
  const getRecordSummary = (details: any) => {
    if (!details) return t('form:record_summary_no_details');
    
    // Try to extract the most relevant information
    const summary = [];
    
    if (details.project) {
      summary.push(`${t('form:record_summary_project')}: ${details.project}`);
    }
    
    if (details.description) {
      summary.push(`${t('form:record_summary_description')}: ${details.description}`);
    }
    
    if (details.material) {
      summary.push(`${t('form:record_summary_material')}: ${details.material}`);
    }
    
    if (details.date) {
      summary.push(`${t('form:record_summary_date')}: ${details.date}`);
    }
    
    return summary.length > 0 ? summary.join(' | ') : t('form:request_summary');
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" style={{ backgroundColor: colors.bgCard }}>
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center sticky top-0 z-10" style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgCard }}>
          <h2 className="text-xl font-semibold flex items-center">
            <Trash2 className="w-5 h-5 mr-2" style={{ color: colors.red }} />
            {t('form:removing_records_title')}
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

        {/* Main content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {!showRequests && !showTaskPerformanceModal && !showAdditionalTasksModal && 
           !showMaterialAddedModal && !showAdditionalMaterialsModal && !showDayNotesModal ? (
            // Initial screen with buttons
            <div className="space-y-6">
              {/* Approve Removals button */}
              <Button variant="primary" fullWidth onClick={() => setShowRequests(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <FileText className="w-5 h-5" />
                {t('form:approve_removal_requests')}
              </Button>
              
              {/* Admin record management buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button variant="danger" fullWidth onClick={() => setShowTaskPerformanceModal(true)}>{t('form:delete_task_performance_records_btn')}</Button>
                <Button variant="danger" fullWidth onClick={() => setShowMaterialAddedModal(true)}>{t('form:delete_material_added_records_btn')}</Button>
                <Button variant="danger" fullWidth onClick={() => setShowAdditionalTasksModal(true)}>{t('form:delete_additional_tasks_records_btn')}</Button>
                <Button variant="danger" fullWidth onClick={() => setShowAdditionalMaterialsModal(true)}>{t('form:delete_additional_materials_records_btn')}</Button>
                <Button variant="danger" fullWidth onClick={() => setShowDayNotesModal(true)} style={{ gridColumn: '1 / -1' }}>{t('form:delete_day_notes_records_btn')}</Button>
              </div>
            </div>
          ) : showRequests ? (
            // Requests list screen
            <>
              {/* Search */}
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: colors.textMuted }} />
                  <input
                    type="text"
                    placeholder={t('form:search_deletion_requests')}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg"
                    style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgElevated }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{t('form:deletion_requests_title')}</h3>
                <Button variant="primary" onClick={() => refetch()} style={{ padding: '4px 12px', fontSize: 13 }}>
                  <svg className="w-4 h-4" style={{ marginRight: 4 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {t('form:refresh')}
                </Button>
              </div>
              
              {isLoading ? (
                <div className="flex justify-center p-6">
                  <Spinner size={32} color={colors.red} />
                </div>
              ) : filteredRequests.length > 0 ? (
                <div className="space-y-6">
                  {filteredRequests.map((request) => (
                    <div key={request.id} className="border rounded-lg overflow-hidden" style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgCard }}>
                      {/* Request header */}
                      <div className="p-4 border-b" style={{ backgroundColor: colors.bgElevated, borderColor: colors.borderDefault }}>
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium text-lg" style={{ color: colors.accentBlue }}>
                              {formatRecordType(request.record_type)}
                            </h3>
                            <div className="mt-1 text-sm" style={{ color: colors.textMuted }}>
                              {getRecordSummary(request.record_details)}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="success"
                              onClick={() => approveDeletion.mutate(request.id)}
                              disabled={approveDeletion.isPending || rejectDeletion.isPending}
                              style={{ padding: '4px 12px', fontSize: 13 }}
                            >
                              <Check className="w-4 h-4" style={{ marginRight: 4 }} />
                              {approveDeletion.isPending ? t('form:approving') : t('form:approve')}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => rejectDeletion.mutate(request.id)}
                              disabled={approveDeletion.isPending || rejectDeletion.isPending}
                              style={{ padding: '4px 12px', fontSize: 13 }}
                            >
                              <X className="w-4 h-4" style={{ marginRight: 4 }} />
                              {rejectDeletion.isPending ? t('form:rejecting') : t('form:reject')}
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Request details */}
                      <div className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div className="flex items-center text-sm">
                            <User className="w-4 h-4 mr-2" style={{ color: colors.textSubtle }} />
                            <span className="font-medium mr-2">{t('form:requested_by')}</span>
                            <span>{t('form:user_id_label')}: {request.user_id}</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <Calendar className="w-4 h-4 mr-2" style={{ color: colors.textSubtle }} />
                            <span className="font-medium mr-2">{t('form:requested_on')}</span>
                            <span>{formatDate(request.created_at)}</span>
                          </div>
                        </div>
                        
                        <div className="mt-4">
                          <h4 className="font-medium mb-2 flex items-center">
                            <Info className="w-4 h-4 mr-2" style={{ color: colors.textSubtle }} />
                            {t('form:record_details_label')}
                          </h4>
                          <div className="p-4 rounded-md" style={{ backgroundColor: colors.bgElevated }}>
                            {Object.entries(request.record_details || {}).map(([key, value]) => (
                              <div key={key} className="mb-2">
                                <span className="font-medium" style={{ color: colors.textMuted }}>
                                  {key.replace(/\b\w/g, l => l.toUpperCase())}:
                                </span>{' '}
                                <span style={{ color: colors.textSecondary }}>
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
                  <AlertCircle className="w-12 h-12 mb-4" style={{ color: colors.textMuted }} />
                  <p className="text-center" style={{ color: colors.textSubtle }}>
                    {searchTerm ? t('form:no_requests_match_search') : t('form:no_deletion_requests')}
                  </p>
                </div>
              )}
              
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" onClick={() => setShowRequests(false)}>
                  {t('form:back')}
                </Button>
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
