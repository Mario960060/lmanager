import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { Modal } from '../../themes/uiComponents';
import { colors, fontSizes, spacing } from '../../themes/designTokens';
import { EventMembersPanel } from './EventMembersPanel';

function ProjectAssignmentsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['common']);
  const companyId = useAuthStore((s) => s.getCompanyId());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['company_events_for_assignments', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_date')
        .eq('company_id', companyId)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
    retry: false,
  });

  useEffect(() => {
    if (!events.length) {
      setSelectedEventId(null);
      return;
    }
    if (!selectedEventId || !events.some((e) => e.id === selectedEventId)) {
      setSelectedEventId(events[0]!.id);
    }
  }, [events, selectedEventId]);

  return (
    <Modal open onClose={onClose} title={t('common:project_assignments_title')} width={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
        <div>
          <label style={{ display: 'block', fontSize: fontSizes.sm, color: colors.textDim, marginBottom: 6 }}>
            {t('common:event_members_event_label')}
          </label>
          {isLoading ? (
            <span style={{ color: colors.textMuted }}>{t('common:loading')}</span>
          ) : events.length === 0 ? (
            <span style={{ color: colors.textMuted }}>—</span>
          ) : (
            <select
              value={selectedEventId ?? ''}
              onChange={(e) => setSelectedEventId(e.target.value || null)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${colors.borderDefault}`,
                background: colors.bgInput,
                color: colors.textPrimary,
                fontSize: fontSizes.sm,
              }}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          )}
        </div>
        <EventMembersPanel eventId={selectedEventId} />
      </div>
    </Modal>
  );
}

export default ProjectAssignmentsModal;
