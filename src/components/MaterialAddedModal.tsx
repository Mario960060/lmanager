import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Loader2, Search, X, Package, Trash2 } from 'lucide-react';

interface MaterialAddedModalProps {
  onClose: () => void;
}

interface DeleteConfirmationProps {
  recordId: string;
  recordType: string;
  recordName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

// Confirmation dialog component
const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({ 
  recordId, 
  recordType, 
  recordName, 
  onCancel, 
  onConfirm,
  t = (key) => key
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">{t('common:confirm_deletion')}</h3>
        <p className="mb-6">{t('common:want_delete_record')}</p>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          <strong>{t('common:type_label')}:</strong> {recordType}<br />
          <strong>{t('common:name_label')}:</strong> {recordName}
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t('common:no')}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            {t('common:yes')}
          </button>
        </div>
      </div>
    </div>
  );
};

const MaterialAddedModal: React.FC<MaterialAddedModalProps> = ({ onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    recordId: string;
    recordName: string;
  }>({ isOpen: false, recordId: '', recordName: '' });
  const [showRequestSent, setShowRequestSent] = useState(false);
  
  const queryClient = useQueryClient();

  // Keeping the exact same data fetching logic
  const { data: materialDeliveries = [], isLoading } = useQuery({
    queryKey: ['user_material_deliveries', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('material_deliveries')
        .select(`
          id,
          material_id,
          amount,
          delivery_date,
          notes,
          created_at,
          event_id,
          materials_delivered (
            name,
            unit
          ),
          events (
            id,
            title
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  // Mutation to create deletion request
  const createDeletionRequest = useMutation({
    mutationFn: async (recordId: string) => {
      const record = materialDeliveries.find(d => d.id === recordId);
      if (!record) throw new Error('Record not found');
      
      const { error } = await supabase
        .from('deletion_requests')
        .insert({
          user_id: user?.id,
          record_id: recordId,
          record_type: 'material_deliveries',
          record_details: {
            material: record.materials_delivered?.name || t('event:unknown_material'),
            project: record.events?.title || t('event:unknown_project'),
            amount: `${record.amount} ${record.materials_delivered?.unit || t('common:units')}`,
            date: new Date(record.delivery_date).toLocaleDateString(),
            notes: record.notes || t('event:no_notes')
          },
          status: 'pending'
        });
      
      if (error) {
        console.error('Error creating deletion request:', error);
        throw error;
      }
      setShowRequestSent(true);
      return recordId;
    },
    onSuccess: () => {
      setDeleteConfirmation({ isOpen: false, recordId: '', recordName: '' });
    },
    onError: (error) => {
      console.error('Failed to create deletion request:', error);
      alert(t('event:failed_delete_request'));
    }
  });

  // Handle delete button click
  const handleDeleteClick = (recordId: string, recordName: string) => {
    setDeleteConfirmation({
      isOpen: true,
      recordId,
      recordName
    });
  };

  // Handle confirmation
  const handleConfirmDelete = () => {
    if (deleteConfirmation.recordId) {
      createDeletionRequest.mutate(deleteConfirmation.recordId);
    }
  };

  // Filter materials based on search term
  const filteredMaterials = searchTerm 
    ? materialDeliveries.filter(delivery => 
        (delivery.materials_delivered?.name && delivery.materials_delivered.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (delivery.events?.title && delivery.events.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (delivery.amount && delivery.amount.toString().includes(searchTerm)) ||
        (delivery.notes && delivery.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (delivery.delivery_date && delivery.delivery_date.includes(searchTerm))
      )
    : materialDeliveries;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
            <h2 className="text-xl font-semibold flex items-center">
              <Package className="w-5 h-5 mr-2 text-blue-500" />
              {t('event:materials_added')}
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder={t('event:search_materials')}
                className="w-full pl-10 pr-4 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : filteredMaterials.length > 0 ? (
              <div className="space-y-4">
                {filteredMaterials.map((delivery) => (
                  <div key={delivery.id} className="border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-750">
                    <div className="flex justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-lg text-gray-900 dark:text-gray-100 mb-2">
                          {delivery.materials_delivered?.name || t('event:unknown_material')}
                        </h3>
                        <p className="text-gray-700 dark:text-gray-300 mb-1">
                          {t('event:project_label')}: <span className="font-medium">{delivery.events?.title || t('event:unknown_project')}</span>
                        </p>
                        <p className="text-gray-700 dark:text-gray-300 mb-1">
                          {t('event:amount_label')}: <span className="font-medium">{delivery.amount} {delivery.materials_delivered?.unit || 'units'}</span>
                        </p>
                        <p className="text-gray-700 dark:text-gray-300 mb-1">
                          {t('event:date_label')}: <span className="font-medium">{new Date(delivery.delivery_date).toLocaleDateString()}</span>
                        </p>
                        {delivery.notes && (
                          <p className="text-gray-700 dark:text-gray-300 mt-2">
                            <span className="font-medium">{t('event:notes_label')}:</span> {delivery.notes}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          {t('event:added_on')} {new Date(delivery.created_at).toLocaleDateString()} {t('event:at_time')} {new Date(delivery.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteClick(
                          delivery.id, 
                          delivery.materials_delivered?.name || t('event:unknown_material')
                        )}
                        className="text-red-600 hover:text-red-800 font-medium flex items-center h-fit"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        {t('event:delete_button')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {searchTerm ? t('event:no_materials_match_search') : t('event:no_material_deliveries_yet')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmation.isOpen && (
        <DeleteConfirmation
          recordId={deleteConfirmation.recordId}
          recordType={t('event:material_delivery_label')}
          recordName={deleteConfirmation.recordName}
          onCancel={() => setDeleteConfirmation({ isOpen: false, recordId: '', recordName: '' })}
          onConfirm={handleConfirmDelete}
          t={t}
        />
      )}

      {showRequestSent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('event:success')}
              </h3>
              <button
                onClick={() => setShowRequestSent(false)}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              {t('event:deletion_request_sent')}
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowRequestSent(false)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                {t('common:close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MaterialAddedModal;
