import React, { useState } from 'react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Plus, Package, AlertCircle, Wrench, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CalendarMaterialModal from './CalendarMaterialModal';
import CalendarEquipmentModal from './CalendarEquipmentModal';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../themes/designTokens';
import { Modal, Button } from '../themes/uiComponents';

interface Event {
  id: string;
  title: string;
  status: string;
  description: string;
}

interface Equipment {
  id: string;
  name: string;
  type: string;
  status: string;
  equipment_id: string;
  event_id: string;
  quantity: number;
}

interface DayDetailsModalProps {
  date: Date;
  events: Event[];
  equipment: Equipment[];
  onClose: () => void;
}

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  in_progress: { label: 'W Trakcie', color: colors.orange, bg: colors.statusInProgress.bg, border: colors.statusInProgress.border },
  scheduled: { label: 'Zaplanowany', color: colors.green, bg: colors.statusPlanned.bg, border: colors.statusPlanned.border },
  planned: { label: 'Zaplanowany', color: colors.green, bg: colors.statusPlanned.bg, border: colors.statusPlanned.border },
  finished: { label: 'Zakończony', color: colors.textDim, bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)' },
};

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const cfg = statusConfig[status] || statusConfig.planned;
  const labelKey = `project:status_${status.replace(/-/g, '_')}`;
  const label = t(labelKey) !== labelKey ? t(labelKey) : cfg.label;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.sm,
        fontSize: fontSizes.sm,
        fontWeight: fontWeights.semibold,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: radii.pill,
        padding: `${spacing.xs}px ${spacing.lg}px ${spacing.xs}px ${spacing.md}px`,
        letterSpacing: 0.2,
      }}
    >
      <span style={{ width: spacing.sm, height: spacing.sm, borderRadius: radii.full, background: cfg.color }} />
      {label}
    </span>
  );
}

function CollapsibleSection({
  icon,
  label,
  count,
  children,
  defaultOpen = false,
  accentColor,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accentColor?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div style={{ marginTop: spacing.xs }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.md,
          width: '100%',
          padding: `${spacing.md}px 0`,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: fonts.body,
          color: accentColor || colors.textDim,
          fontSize: fontSizes.sm,
          fontWeight: fontWeights.semibold,
          letterSpacing: 0.2,
        }}
      >
        <span style={{ display: 'flex', opacity: 0.7 }}>{icon}</span>
        <span>{label}</span>
        <span
          style={{
            background: colors.bgOverlay,
            borderRadius: radii.xl,
            padding: `${spacing.xs / 2}px ${spacing.sm}px`,
            fontSize: fontSizes.sm,
            fontWeight: fontWeights.bold,
            color: colors.textMuted,
            minWidth: spacing["4xl"],
            textAlign: 'center',
          }}
        >
          {count}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', opacity: 0.5 }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && (
        <div
          style={{
            borderLeft: `2px solid ${colors.borderDefault}`,
            marginLeft: spacing.md,
            paddingLeft: spacing.xl,
            paddingBottom: spacing.xs,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  unitLabel,
  t,
}: {
  item: { name?: string; material?: string; quantity: number; unit?: string; notes?: string };
  unitLabel: string;
  t: (k: string) => string;
}) {
  const name = item.name ?? item.material ?? '';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        padding: '5px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: colors.textPrimary, fontWeight: 500 }}>{name}</span>
        <span style={{ fontSize: 11.5, color: colors.textDim }}>
          — {item.quantity} {item.unit || unitLabel}
        </span>
      </div>
      {item.notes && (
        <span
          style={{
            fontSize: 10.5,
            color: colors.textFaint,
            fontStyle: 'italic',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 100,
          }}
        >
          {item.notes}
        </span>
      )}
    </div>
  );
}

const DayDetailsModal: React.FC<DayDetailsModalProps> = ({ date, events, equipment, onClose }) => {
  const { t, i18n } = useTranslation(['common', 'form', 'utilities', 'event', 'dashboard', 'project']);
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [selectedEventForMaterial, setSelectedEventForMaterial] = useState<string | null>(null);
  const [selectedEventForEquipment, setSelectedEventForEquipment] = useState<string | null>(null);

  const eventIds = events.map(e => e.id).filter(Boolean);

  // Fetch tasks count per event
  const { data: tasksData = [] } = useQuery({
    queryKey: ['tasks_done_count', eventIds, companyId],
    queryFn: async () => {
      if (eventIds.length === 0) return [];
      const { data, error } = await supabase
        .from('tasks_done')
        .select('event_id')
        .eq('company_id', companyId)
        .in('event_id', eventIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && eventIds.length > 0,
  });

  const tasksCountByEvent = (Array.isArray(tasksData) ? tasksData : []).reduce((acc: Record<string, number>, row: { event_id?: string | null }) => {
    if (row.event_id) {
      acc[row.event_id] = (acc[row.event_id] || 0) + 1;
    }
    return acc;
  }, {});

  // Fetch day notes
  const { data: notes = [] } = useQuery({
    queryKey: ['day_notes', date, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('day_notes')
        .select(`
          id, event_id, content, date, created_at, user_id,
          events (id, title),
          profiles (id, full_name)
        `)
        .eq('company_id', companyId)
        .eq('date', format(date, 'yyyy-MM-dd'))
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch calendar materials
  const { data: materials = [] } = useQuery({
    queryKey: ['calendar_materials', date, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_materials')
        .select('*')
        .eq('company_id', companyId)
        .eq('date', format(date, 'yyyy-MM-dd'));
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch calendar equipment
  const { data: calendarEquipment = [] } = useQuery({
    queryKey: ['calendar_equipment', date, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_equipment')
        .select(`
          id, equipment_id, event_id, quantity, notes,
          equipment (id, name, quantity)
        `)
        .eq('company_id', companyId)
        .eq('date', format(date, 'yyyy-MM-dd'));
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const materialsByProject = materials.reduce((acc: Record<string, any[]>, m) => {
    const eid = m.event_id || 'unassigned';
    if (!acc[eid]) acc[eid] = [];
    acc[eid].push(m);
    return acc;
  }, {});

  const equipmentByProject = calendarEquipment.reduce((acc: Record<string, any[]>, e) => {
    const eid = e.event_id || 'unassigned';
    if (!acc[eid]) acc[eid] = [];
    acc[eid].push(e);
    return acc;
  }, {});

  const addNoteMutation = useMutation({
    mutationFn: async ({ eventId, content }: { eventId: string; content: string }) => {
      const { error } = await supabase.from('day_notes').insert({
        event_id: eventId,
        content,
        date: format(date, 'yyyy-MM-dd'),
        user_id: user?.id,
        company_id: companyId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['day_notes', date, companyId] });
      setNoteContent('');
      setShowNoteForm(false);
    },
  });

  const handleAddNote = () => {
    if (!selectedEvent || !noteContent.trim()) return;
    addNoteMutation.mutate({ eventId: selectedEvent, content: noteContent });
  };

  const handleAddMaterial = (eventId: string | null) => {
    setSelectedEventForMaterial(eventId);
    setShowMaterialModal(true);
  };

  const handleAddEquipment = (eventId: string | null) => {
    setSelectedEventForEquipment(eventId);
    setShowEquipmentModal(true);
  };

  const dayAbbrev = format(date, 'EEE', { locale: dateLocale });
  const dayNum = format(date, 'd');
  const dayName = format(date, 'EEEE', { locale: dateLocale });
  const fullDate = format(date, 'MMMM d, yyyy', { locale: dateLocale });

  const EventCard = ({ event }: { event: Event }) => {
    const st = statusConfig[event.status] || statusConfig.planned;
    const taskCount = tasksCountByEvent[event.id] || 0;
    const eventMaterials = materialsByProject[event.id] || [];
    const eventEquipment = equipmentByProject[event.id] || [];
    const matItems = eventMaterials.map((m: any) => ({
      name: m.material,
      quantity: m.quantity,
      unit: m.unit,
      notes: m.notes,
    }));
    const eqItems = eventEquipment.map((e: any) => ({
      name: e.equipment?.name,
      quantity: e.quantity,
      unit: t('event:unit_singular'),
      notes: e.notes,
    }));

    return (
      <div
        style={{
          background: colors.bgCard,
          borderRadius: radii['3xl'],
          border: `1px solid ${colors.borderSubtle}`,
          overflow: 'hidden',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = colors.borderLight;
          e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = colors.borderSubtle;
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div style={{ height: 3, background: `linear-gradient(90deg, ${st.color}, transparent)` }} />
        <div style={{ padding: '14px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <div>
              <div
                style={{ fontSize: 15, fontWeight: 700, color: colors.textPrimary, lineHeight: 1.3, cursor: 'pointer', fontFamily: fonts.display }}
                onClick={() => navigate(`/events/${event.id}`)}
              >
                {event.title}
              </div>
              <div style={{ fontSize: 12, color: colors.textDim, marginTop: 2, fontFamily: fonts.body }}>
                {event.description || t('event:no_description_provided')}
              </div>
            </div>
            <StatusBadge status={event.status} t={t} />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 10,
              paddingBottom: 10,
              borderBottom: `1px solid ${colors.borderSubtle}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: colors.textDim, fontWeight: 500 }}>
              <ClipboardList size={13} style={{ opacity: 0.6 }} />
              {taskCount} {t('dashboard:tasks')}
            </div>
            {eventMaterials.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: colors.textDim, fontWeight: 500 }}>
                <Package size={13} style={{ opacity: 0.6 }} />
                {eventMaterials.length} {t('dashboard:materials')}
              </div>
            )}
            {eventEquipment.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: colors.textDim, fontWeight: 500 }}>
                <Wrench size={13} style={{ opacity: 0.6 }} />
                {eventEquipment.length} {t('dashboard:equipment')}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => handleAddMaterial(event.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: radii.lg,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: fonts.body,
                color: '#fff',
                background: colors.green,
              }}
            >
              <Package size={13} />
              {t('event:add_material')}
            </button>
            <button
              onClick={() => handleAddEquipment(event.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: radii.lg,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: fonts.body,
                color: '#fff',
                background: colors.orange,
              }}
            >
              <Wrench size={13} />
              {t('event:require_equipment')}
            </button>
          </div>

          <CollapsibleSection
            icon={<Package size={14} />}
            label={t('event:required_materials')}
            count={eventMaterials.length}
            accentColor={colors.red}
          >
            {matItems.map((m: any, i: number) => (
              <ItemRow key={i} item={m} unitLabel={t('common:units')} t={t} />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            icon={<Wrench size={14} />}
            label={t('event:required_equipment')}
            count={eventEquipment.length}
            accentColor={colors.orange}
          >
            {eqItems.map((eq: any, i: number) => (
              <ItemRow key={i} item={eq} unitLabel={t('event:unit_singular')} t={t} />
            ))}
          </CollapsibleSection>
        </div>
      </div>
    );
  };

  const UnassignedCard = () => {
    const unassignedMats = materialsByProject['unassigned'] || [];
    const unassignedEq = equipmentByProject['unassigned'] || [];
    if (unassignedMats.length === 0 && unassignedEq.length === 0) return null;
    const matItems = unassignedMats.map((m: any) => ({
      name: m.material,
      quantity: m.quantity,
      unit: m.unit,
      notes: m.notes,
    }));
    const eqItems = unassignedEq.map((e: any) => ({
      name: e.equipment?.name,
      quantity: e.quantity,
      unit: t('event:unit_singular'),
      notes: e.notes,
    }));
    return (
      <div
        style={{
          background: colors.bgCard,
          borderRadius: radii['3xl'],
          border: `1px solid ${colors.borderSubtle}`,
          overflow: 'hidden',
        }}
      >
        <div style={{ height: 3, background: `linear-gradient(90deg, ${colors.textDim}, transparent)` }} />
        <div style={{ padding: '14px 16px 16px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.textDim, marginBottom: 12, fontFamily: fonts.display }}>
            {t('event:add_for_this_day')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => handleAddMaterial(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: radii.lg,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: fonts.body,
                color: '#fff',
                background: colors.green,
              }}
            >
              <Package size={13} />
              {t('event:add_material')}
            </button>
            <button
              onClick={() => handleAddEquipment(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: radii.lg,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: fonts.body,
                color: '#fff',
                background: colors.orange,
              }}
            >
              <Wrench size={13} />
              {t('event:require_equipment')}
            </button>
          </div>
          <CollapsibleSection icon={<Package size={14} />} label={t('event:required_materials')} count={unassignedMats.length} accentColor={colors.red}>
            {matItems.map((m: any, i: number) => (
              <ItemRow key={i} item={m} unitLabel={t('common:units')} t={t} />
            ))}
          </CollapsibleSection>
          <CollapsibleSection icon={<Wrench size={14} />} label={t('event:required_equipment')} count={unassignedEq.length} accentColor={colors.orange}>
            {eqItems.map((eq: any, i: number) => (
              <ItemRow key={i} item={eq} unitLabel={t('event:unit_singular')} t={t} />
            ))}
          </CollapsibleSection>
        </div>
      </div>
    );
  };

  return (
    <>
      <Modal open={true} onClose={onClose} title={format(date, 'MMMM d, yyyy', { locale: dateLocale })} width={960}>
        <div style={{ fontFamily: fonts.body }}>
          {/* Day header - preview style */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              padding: '16px 20px',
              background: colors.bgCard,
              borderRadius: radii['3xl'],
              border: `1px solid ${colors.borderSubtle}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: radii.xl,
                  background: `linear-gradient(135deg, ${colors.orange}, ${colors.amber})`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                <span style={{ fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {dayAbbrev.toUpperCase()}
                </span>
                <span style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{dayNum}</span>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.textPrimary, fontFamily: fonts.display }}>{dayName}</div>
                <div style={{ fontSize: 12.5, color: colors.textDim, fontWeight: 500 }}>{fullDate}</div>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: colors.bgOverlay,
                borderRadius: 20,
                padding: '5px 12px',
                fontSize: 12.5,
                fontWeight: 600,
                color: colors.textDim,
              }}
            >
              {events.length} {t('dashboard:events')}
            </div>
          </div>

          {/* Events grid - 2 cols desktop, 1 col mobile */}
          <div
            className="day-details-events-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 14,
            }}
          >
            {events.length === 0 ? (
              <div
                style={{
                  background: colors.bgCard,
                  borderRadius: radii['3xl'],
                  border: `1px solid ${colors.borderSubtle}`,
                  padding: spacing['6xl'],
                  gridColumn: '1 / -1',
                }}
              >
                <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary, marginBottom: spacing.base, fontFamily: fonts.display }}>
                  {t('event:add_for_this_day')}
                </h3>
                <p style={{ fontSize: fontSizes.base, color: colors.textDim, marginBottom: spacing['5xl'], fontFamily: fonts.body }}>
                  {t('event:no_events_add_materials_equipment')}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm }}>
                  <button
                    onClick={() => handleAddMaterial(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 14px',
                      borderRadius: radii.lg,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: fonts.body,
                      color: '#fff',
                      background: colors.green,
                    }}
                  >
                    <Package size={13} />
                    {t('event:add_material')}
                  </button>
                  <button
                    onClick={() => handleAddEquipment(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 14px',
                      borderRadius: radii.lg,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: fonts.body,
                      color: '#fff',
                      background: colors.orange,
                    }}
                  >
                    <Wrench size={13} />
                    {t('event:require_equipment')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {events.map((ev) => (
                  <EventCard key={ev.id} event={ev} />
                ))}
                <UnassignedCard />
              </>
            )}
          </div>

          {/* Notes Section */}
          <div style={{ marginTop: spacing['8xl'], paddingTop: spacing['6xl'], borderTop: `1px solid ${colors.borderDefault}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing['5xl'] }}>
              <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display }}>
                {t('event:notes_label')}
              </h3>
              <button
                onClick={() => setShowNoteForm(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: fontSizes.base,
                  color: colors.accentBlue,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: fonts.body,
                }}
              >
                <Plus size={16} style={{ marginRight: spacing.xs }} />
                {t('event:add_note')}
              </button>
            </div>

            {showNoteForm && (
              <div
                style={{
                  background: colors.bgSubtle,
                  padding: spacing['5xl'],
                  borderRadius: radii.lg,
                  marginBottom: spacing['5xl'],
                  display: 'flex',
                  flexDirection: 'column',
                  gap: spacing['5xl'],
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textSecondary, fontFamily: fonts.body }}>
                    {t('event:event_label')}
                  </label>
                  <select
                    value={selectedEvent || ''}
                    onChange={(e) => setSelectedEvent(e.target.value)}
                    style={{
                      marginTop: spacing.xs,
                      width: '100%',
                      padding: spacing.xl,
                      borderRadius: radii.xl,
                      border: `1px solid ${colors.borderInput}`,
                      background: colors.bgInput,
                      fontFamily: fonts.body,
                      fontSize: fontSizes.base,
                    }}
                  >
                    <option value="">{t('event:select_event')}</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textSecondary, fontFamily: fonts.body }}>
                    {t('event:note_label')}
                  </label>
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    rows={3}
                    placeholder={t('event:enter_note')}
                    style={{
                      marginTop: spacing.xs,
                      width: '100%',
                      padding: spacing.xl,
                      borderRadius: radii.xl,
                      border: `1px solid ${colors.borderInput}`,
                      background: colors.bgInput,
                      fontFamily: fonts.body,
                      fontSize: fontSizes.base,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.base }}>
                  <Button variant="secondary" onClick={() => setShowNoteForm(false)}>
                    {t('common:cancel')}
                  </Button>
                  <Button onClick={handleAddNote} disabled={!selectedEvent || !noteContent.trim() || addNoteMutation.isPending}>
                    {addNoteMutation.isPending ? t('event:adding') : t('event:add_note')}
                  </Button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['5xl'] }}>
              {notes.map((note) => (
                <div key={note.id} style={{ background: colors.bgSubtle, padding: spacing['5xl'], borderRadius: radii.lg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body }}>
                        {t('event:event_label')}:{' '}
                        <span style={{ color: colors.accentBlue, cursor: 'pointer' }} onClick={() => navigate(`/events/${note.event_id}`)}>
                          {note.events?.title}
                        </span>
                      </p>
                      <p style={{ color: colors.textPrimary, marginTop: spacing.xs, fontFamily: fonts.body }}>{note.content}</p>
                    </div>
                    <span style={{ fontSize: fontSizes.xs, color: colors.textDim }}>
                      {format(new Date(note.created_at), 'MMM d, h:mm a', { locale: dateLocale })}
                    </span>
                  </div>
                  <p style={{ fontSize: fontSizes.xs, color: colors.textDim, marginTop: spacing.sm, fontFamily: fonts.body }}>
                    {t('event:added_by')} {note.profiles?.full_name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {showMaterialModal && (
        <CalendarMaterialModal
          eventId={selectedEventForMaterial}
          date={date}
          onClose={() => {
            setShowMaterialModal(false);
            setSelectedEventForMaterial(null);
          }}
        />
      )}

      {showEquipmentModal && (
        <CalendarEquipmentModal
          eventId={selectedEventForEquipment}
          date={date}
          onClose={() => {
            setShowEquipmentModal(false);
            setSelectedEventForEquipment(null);
          }}
        />
      )}
    </>
  );
};

export default DayDetailsModal;
