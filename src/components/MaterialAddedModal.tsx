import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Search, Trash2 } from 'lucide-react';
import { Spinner, Modal, Button, ConfirmDialog } from '../themes/uiComponents';
import { colors, fontSizes, fonts, spacing, radii } from '../themes/designTokens';

interface MaterialAddedModalProps {
  onClose: () => void;
}

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
      <Modal open={true} onClose={onClose} title={t('event:materials_added')} width={896}>
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
          <div style={{ padding: spacing.lg, borderBottom: `1px solid ${colors.borderDefault}` }}>
            <div style={{ position: 'relative' }}>
              <Search size={20} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: colors.textDim }} />
              <input
                type="text"
                placeholder={t('event:search_materials')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%', paddingLeft: 40, paddingRight: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm,
                  border: `1px solid ${colors.borderInput}`, borderRadius: radii.lg, background: colors.bgInput,
                  fontFamily: fonts.body, fontSize: fontSizes.base, color: colors.textPrimary,
                }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: spacing.lg }}>
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: spacing["6xl"] }}>
                <Spinner size={32} />
              </div>
            ) : filteredMaterials.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
                {filteredMaterials.map((delivery) => (
                  <div key={delivery.id} style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, padding: spacing.lg, background: colors.bgCardInner }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ fontWeight: 500, fontSize: fontSizes.lg, color: colors.textPrimary, marginBottom: spacing.sm }}>
                          {delivery.materials_delivered?.name || t('event:unknown_material')}
                        </h3>
                        <p style={{ color: colors.textMuted, marginBottom: 4 }}>{t('event:project_label')}: <strong>{delivery.events?.title || t('event:unknown_project')}</strong></p>
                        <p style={{ color: colors.textMuted, marginBottom: 4 }}>{t('event:amount_label')}: <strong>{delivery.amount} {delivery.materials_delivered?.unit || t('common:units')}</strong></p>
                        <p style={{ color: colors.textMuted, marginBottom: 4 }}>{t('event:date_label')}: <strong>{new Date(delivery.delivery_date).toLocaleDateString()}</strong></p>
                        {delivery.notes && (
                          <p style={{ color: colors.textMuted, marginTop: spacing.sm }}><strong>{t('event:notes_label')}:</strong> {delivery.notes}</p>
                        )}
                        <p style={{ marginTop: spacing.sm, fontSize: fontSizes.xs, color: colors.textDim }}>
                          {t('event:added_on')} {new Date(delivery.created_at).toLocaleDateString()} {t('event:at_time')} {new Date(delivery.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteClick(delivery.id, delivery.materials_delivered?.name || t('event:unknown_material'))}
                        style={{ color: colors.red, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontFamily: fonts.body }}
                      >
                        <Trash2 size={16} />
                        {t('event:delete_button')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: spacing["6xl"], color: colors.textDim }}>
                {searchTerm ? t('event:no_materials_match_search') : t('event:no_material_deliveries_yet')}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteConfirmation.isOpen}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmation({ isOpen: false, recordId: '', recordName: '' })}
        title={t('common:confirm_deletion')}
        message={`${t('common:want_delete_record')}\n\n${t('common:type_label')}: ${t('event:material_delivery_label')}\n${t('common:name_label')}: ${deleteConfirmation.recordName}`}
        confirmLabel={t('common:yes')}
        cancelLabel={t('common:no')}
        variant="danger"
        loading={createDeletionRequest.isPending}
      />

      <Modal open={showRequestSent} onClose={() => setShowRequestSent(false)} title={t('event:success')} width={400} footer={
        <Button variant="primary" onClick={() => setShowRequestSent(false)}>{t('common:close')}</Button>
      }>
        <p style={{ fontSize: fontSizes.md, color: colors.textMuted }}>{t('event:deletion_request_sent')}</p>
      </Modal>
    </>
  );
};

export default MaterialAddedModal;
