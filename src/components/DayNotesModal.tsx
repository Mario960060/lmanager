import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Search, Trash2 } from 'lucide-react';
import { Spinner, Modal, Button, ConfirmDialog } from '../themes/uiComponents';
import { colors, fontSizes, fonts, spacing, radii } from '../themes/designTokens';

interface DayNote {
  id: string;
  event_id: string;
  user_id: string;
  content: string;
  date: string;
  created_at: string;
  eventName?: string;
}

interface DayNotesModalProps {
  onClose: () => void;
}

const DayNotesModal: React.FC<DayNotesModalProps> = ({ onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [searchTerm, setSearchTerm] = useState('');
  const [eventNames, setEventNames] = useState<Record<string, string>>({});
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    recordId: string;
    recordName: string;
  }>({ isOpen: false, recordId: '', recordName: '' });
  const [showRequestSent, setShowRequestSent] = useState(false);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['day_notes', user?.id, companyId],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('day_notes')
        .select('id, event_id, user_id, content, date, created_at')
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!companyId
  });

  // Fetch event names
  useEffect(() => {
    const fetchEventNames = async () => {
      if (notes.length === 0) return;
      
      const eventIds = [...new Set(notes.map(note => note.event_id))];
      
      const { data, error } = await supabase
        .from('events')
        .select('id, title')
        .eq('company_id', companyId)
        .in('id', eventIds);
      
      if (error) {
        console.error('Error fetching event names:', error);
        return;
      }
      
      const eventNameMap: Record<string, string> = {};
      data.forEach(event => {
        eventNameMap[event.id] = event.title;
      });
      
      setEventNames(eventNameMap);
    };
    
    fetchEventNames();
  }, [notes, companyId]);

  // Mutation to create deletion request
  const createDeletionRequest = useMutation({
    mutationFn: async (recordId: string) => {
      const note = notes.find(n => n.id === recordId);
      if (!note) throw new Error('Record not found');
      
      const { error } = await supabase
        .from('deletion_requests')
        .insert({
          user_id: user?.id,
          record_id: recordId,
          record_type: 'day_notes',
          record_details: {
            content: note.content || 'No content',
            project: eventNames[note.event_id] || 'Unknown Project',
            date: new Date(note.date).toLocaleDateString(),
            created_at: new Date(note.created_at).toLocaleString()
          },
          status: 'pending',
          company_id: companyId
        });

      
      if (error) {
        console.error('Error creating deletion request:', error);
        throw error;
      }
      return recordId;
    },
    onSuccess: () => {
      setDeleteConfirmation({ isOpen: false, recordId: '', recordName: '' });
      setShowRequestSent(true);
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

  // Filter notes based on search term
  const filteredNotes = searchTerm 
    ? notes.filter(note => {
        const eventName = eventNames[note.event_id] || '';
        return (
          (note.content && note.content.toLowerCase().includes(searchTerm.toLowerCase())) ||
          eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (note.date && note.date.includes(searchTerm))
        );
      })
    : notes;

  return (
    <>
      <Modal open={true} onClose={onClose} title={t('event:day_notes')} width={896}>
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
          <div style={{ padding: spacing.lg, borderBottom: `1px solid ${colors.borderDefault}` }}>
            <div style={{ position: 'relative' }}>
              <Search size={20} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: colors.textDim }} />
              <input
                type="text"
                placeholder={t('event:search_notes')}
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
            ) : filteredNotes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
                {filteredNotes.map((note) => (
                  <div key={note.id} style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, padding: spacing.lg, background: colors.bgCardInner }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ fontWeight: 500, fontSize: fontSizes.lg, color: colors.textPrimary, marginBottom: spacing.sm }}>
                          {eventNames[note.event_id] || t('event:unknown_project')}
                        </h3>
                        <p style={{ color: colors.textMuted, marginBottom: 4 }}>{t('event:date_label')} <strong>{new Date(note.date).toLocaleDateString()}</strong></p>
                        <div style={{ marginTop: spacing.lg, padding: spacing.lg, background: colors.bgOverlay, borderRadius: radii.md }}>
                          {note.content || t('event:no_content')}
                        </div>
                        <p style={{ marginTop: spacing.sm, fontSize: fontSizes.xs, color: colors.textDim }}>
                          {t('event:added_on')} {new Date(note.created_at).toLocaleDateString()} {t('event:at_time')} {new Date(note.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <button
                        onClick={() => setDeleteConfirmation({ isOpen: true, recordId: note.id, recordName: eventNames[note.event_id] || t('event:unknown_project') })}
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
                {searchTerm ? t('event:no_notes_match_search') : t('event:no_day_notes_yet')}
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
        message={`${t('common:want_delete_record')}\n\n${t('common:type_label')}: ${t('event:day_note_label')}\n${t('common:name_label')}: ${deleteConfirmation.recordName}`}
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

export default DayNotesModal;
