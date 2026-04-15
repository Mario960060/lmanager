import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { translateTaskName, translateUnit } from '../lib/translationMap';
import { toolDisplayName } from '../lib/toolDisplay';
import { Package, Wrench, Hammer, ClipboardList, ChevronDown, ChevronUp, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import UnifiedEventDayModal, { type UnifiedDayTab } from './UnifiedEventDayModal';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../themes/designTokens';
import { Modal } from '../themes/uiComponents';

interface Event {
  id: string;
  title: string;
  status: string;
  description: string;
}

interface DayDetailsModalProps {
  date: Date;
  events: Event[];
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
  showWhenZero = false,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accentColor?: string;
  /** When true, show header even if count is 0 (user still sees the category). */
  showWhenZero?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0 && !showWhenZero) return null;
  return (
    <div style={{ borderTop: `1px solid ${colors.borderSubtle}` }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.md,
          width: '100%',
          boxSizing: 'border-box',
          padding: `${spacing['5xl']}px ${spacing.sm}px`,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: fonts.body,
          color: accentColor || colors.textDim,
          fontSize: fontSizes.sm,
          fontWeight: fontWeights.semibold,
          letterSpacing: 0.2,
          textAlign: 'left',
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

type PlannedTaskViewRow = {
  rowKey: string;
  tasksDoneId: string;
  folderId: string | null;
  display: string;
  quantity: number | null;
  unitLabel: string;
  priority: number;
  hourStart: number | null;
  hourEnd: number | null;
};

type TaskFolderLite = { id: string; name: string; sort_order: number | null; event_id?: string | null };

function isExcavationPrepFolderName(f: Pick<TaskFolderLite, 'name' | 'sort_order'>): boolean {
  if ((f.sort_order ?? 0) < 0) return true;
  const n = (f.name || '').toLowerCase();
  if (n.includes('excavation') && n.includes('preparation')) return true;
  if (n.includes('digging') && n.includes('preparation')) return true;
  if (n.includes('kopan') && (n.includes('przygotow') || n.includes('preparation'))) return true;
  return false;
}

function sortPlannedDisplayFolderKeys(
  keys: (string | '__none__')[],
  folderById: Map<string, TaskFolderLite>
): (string | '__none__')[] {
  const hasNone = keys.includes('__none__');
  const real = keys.filter((k): k is string => k !== '__none__');
  real.sort((a, b) => {
    const fa = folderById.get(a);
    const fb = folderById.get(b);
    const ae = fa && isExcavationPrepFolderName(fa);
    const be = fb && isExcavationPrepFolderName(fb);
    if (ae !== be) return ae ? -1 : 1;
    const soa = fa?.sort_order ?? 0;
    const sob = fb?.sort_order ?? 0;
    if (soa !== sob) return soa - sob;
    return (fa?.name || a).localeCompare(fb?.name || b);
  });
  return hasNone ? [...real, '__none__'] : real;
}

function PlannedTasksGroupedList({
  rows,
  folders,
  t,
}: {
  rows: PlannedTaskViewRow[];
  folders: TaskFolderLite[];
  t: (k: string) => string;
}) {
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const { grouped, sortedKeys } = useMemo(() => {
    const g = new Map<string | '__none__', PlannedTaskViewRow[]>();
    for (const r of rows) {
      const fid = r.folderId;
      const key: string | '__none__' = fid && folderById.has(fid) ? fid : '__none__';
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(r);
    }
    for (const arr of g.values()) {
      arr.sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : a.display.localeCompare(b.display)));
    }
    const keys = Array.from(g.keys()).filter((k) => (g.get(k)?.length ?? 0) > 0);
    const sorted = sortPlannedDisplayFolderKeys(keys, folderById);
    return { grouped: g, sortedKeys: sorted };
  }, [rows, folderById]);

  if (sortedKeys.length === 0) return null;

  return (
    <>
      {sortedKeys.map((key, idx) => {
        const list = grouped.get(key)!;
        const title =
          key === '__none__' ? t('dashboard:day_plan_tasks_no_folder') : (folderById.get(key)?.name ?? '');
        return (
          <div key={String(key)} style={{ marginTop: idx === 0 ? 0 : 14 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: colors.accentBlue,
                fontFamily: fonts.display,
                letterSpacing: '0.02em',
                marginBottom: 6,
                paddingLeft: 2,
              }}
            >
              {title}
            </div>
            <div style={{ paddingLeft: 6 }}>
              {list.map((pt) => (
                <PlannedTaskLine key={pt.rowKey} row={pt} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function PlannedTaskLine({ row }: { row: PlannedTaskViewRow }) {
  const hasHours = row.hourStart !== null && row.hourEnd !== null;
  const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const qtyPart =
    row.quantity !== null && !Number.isNaN(row.quantity) && row.quantity !== 0
      ? ` — ${row.quantity}${row.unitLabel ? ` ${row.unitLabel}` : ''}`
      : '';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
        <span style={{ fontSize: 12.5, color: colors.textPrimary, fontWeight: 600 }}>{row.display}</span>
        {qtyPart ? (
          <span style={{ fontSize: 12.5, color: colors.textDim, fontWeight: 500 }}>{qtyPart}</span>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 1, flexShrink: 0 }} aria-hidden>
        {[1, 2, 3].map((star) => (
          <span
            key={star}
            style={{
              fontSize: 13,
              color: row.priority >= star ? colors.amber : colors.textFaint,
              lineHeight: 1,
            }}
          >
            ★
          </span>
        ))}
      </div>
      <div
        style={{
          minWidth: 100,
          flexShrink: 0,
          textAlign: 'right',
          fontSize: 12,
          fontWeight: 600,
          color: hasHours ? colors.textSecondary : colors.textFaint,
          fontFamily: fonts.display,
        }}
      >
        {hasHours ? `${fmtHour(row.hourStart!)}–${fmtHour(row.hourEnd!)}` : '—'}
      </div>
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

const DayDetailsModal: React.FC<DayDetailsModalProps> = ({ date, events, onClose }) => {
  const { t, i18n } = useTranslation(['common', 'form', 'utilities', 'event', 'dashboard', 'project']);
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const navigate = useNavigate();
  const companyId = useAuthStore(state => state.getCompanyId());
  const queryClient = useQueryClient();
  const [unifiedDayModal, setUnifiedDayModal] = useState<{ event: Event; tab: UnifiedDayTab } | null>(null);

  const eventIds = events.map(e => e.id).filter(Boolean);
  const eventIdSet = useMemo(() => new Set(eventIds), [eventIds.join(',')]);
  const planDateStr = format(date, 'yyyy-MM-dd');

  const { data: plannedBlocksForDay = [] } = useQuery({
    queryKey: ['calendar_day_plan_day_details', planDateStr, eventIds.join(','), companyId],
    queryFn: async () => {
      if (eventIds.length === 0 || !companyId) return [];
      const { data, error } = await supabase
        .from('calendar_day_plan_blocks')
        .select(
          `
          id,
          event_id,
          start_hour,
          end_hour,
          sort_order,
          calendar_day_plan_block_tasks!block_id (
            tasks_done_id,
            planned_quantity,
            priority,
            sort_order
          )
        `
        )
        .eq('company_id', companyId)
        .eq('plan_date', planDateStr)
        .in('event_id', eventIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && eventIds.length > 0,
  });

  const { data: tasksDoneForEvents = [] } = useQuery({
    queryKey: ['tasks_done_day_details', eventIds.join(','), companyId],
    queryFn: async () => {
      if (!companyId || eventIds.length === 0) return [];
      const { data, error } = await supabase
        .from('tasks_done')
        .select('id, name, task_name, unit, event_id, folder_id')
        .eq('company_id', companyId)
        .in('event_id', eventIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && eventIds.length > 0,
  });

  const { data: taskFoldersForDayDetails = [] } = useQuery({
    queryKey: ['task_folders_day_details', eventIds.join(','), companyId],
    queryFn: async () => {
      if (!companyId || eventIds.length === 0) return [];
      const { data, error } = await supabase
        .from('task_folders')
        .select('id, name, sort_order, event_id')
        .eq('company_id', companyId)
        .in('event_id', eventIds)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as TaskFolderLite[];
    },
    enabled: !!companyId && eventIds.length > 0,
  });

  const plannedTasksListByEvent = useMemo(() => {
    type BlockRow = {
      id: string;
      event_id?: string | null;
      start_hour: number | null;
      end_hour: number | null;
      sort_order: number;
      calendar_day_plan_block_tasks?: Array<{
        tasks_done_id?: string | null;
        planned_quantity?: number | null;
        priority?: number | null;
        sort_order?: number | null;
      }> | null;
    };
    type TdRow = { id: string; name: string | null; task_name: string | null; unit: string | null };
    const tasksById = new Map((tasksDoneForEvents as TdRow[]).map((r) => [r.id, r]));
    const result: Record<string, PlannedTaskViewRow[]> = {};

    const blocks = [...(plannedBlocksForDay as BlockRow[])].sort((a, z) => (a.sort_order ?? 0) - (z.sort_order ?? 0));
    let seq = 0;
    for (const block of blocks) {
      const eid = block.event_id;
      if (!eid) continue;
      if (!result[eid]) result[eid] = [];
      const hs = block.start_hour !== null && block.end_hour !== null ? block.start_hour : null;
      const he = block.start_hour !== null && block.end_hour !== null ? block.end_hour : null;
      const taskRows = [...(block.calendar_day_plan_block_tasks || [])].sort(
        (a, z) => (a.sort_order ?? 0) - (z.sort_order ?? 0)
      );
      for (const tr of taskRows) {
        const tid = tr.tasks_done_id;
        if (!tid) continue;
        const td = tasksById.get(tid);
        const raw = td?.name || td?.task_name || '';
        const display = translateTaskName(raw, t) || raw || t('dashboard:day_plan_untitled_task');
        const unitRaw = td?.unit || '';
        const unitLabel = unitRaw ? translateUnit(unitRaw, t) : '';
        const pq = tr.planned_quantity;
        const quantity = pq !== null && pq !== undefined && !Number.isNaN(Number(pq)) ? Number(pq) : null;
        result[eid].push({
          rowKey: `${block.id}-${tid}-${seq++}`,
          tasksDoneId: tid,
          folderId: td?.folder_id ?? null,
          display,
          quantity: quantity !== null && quantity !== 0 ? quantity : null,
          unitLabel,
          priority: tr.priority != null ? Math.min(3, Math.max(1, tr.priority)) : 1,
          hourStart: hs,
          hourEnd: he,
        });
      }
    }
    for (const eid of Object.keys(result)) {
      result[eid].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return 0;
      });
    }
    return result;
  }, [plannedBlocksForDay, tasksDoneForEvents, t]);

  // Fetch calendar materials (date-only filter + company: include legacy rows with null company_id for this day)
  const { data: materials = [] } = useQuery({
    queryKey: ['calendar_materials', date, companyId, eventIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_materials')
        .select(`
          *,
          events (id, title)
        `)
        .eq('date', planDateStr);
      if (error) throw error;
      const rows = (data || []) as any[];
      return rows.filter((m) => {
        if (m.company_id === companyId) return true;
        if (m.company_id == null && (!m.event_id || eventIdSet.has(m.event_id))) return true;
        return false;
      });
    },
    enabled: !!companyId,
  });

  const { data: calendarEquipment = [] } = useQuery({
    queryKey: ['calendar_equipment', date, companyId, eventIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_equipment')
        .select(`
          id, equipment_id, event_id, quantity, notes,
          equipment (id, name, quantity),
          events (id, title)
        `)
        .eq('date', planDateStr);
      if (error) throw error;
      const rows = (data || []) as any[];
      return rows.filter((e) => {
        if (e.company_id === companyId) return true;
        if (e.company_id == null && (!e.event_id || eventIdSet.has(e.event_id))) return true;
        return false;
      });
    },
    enabled: !!companyId,
  });

  const { data: calendarTools = [] } = useQuery({
    queryKey: ['calendar_tools', date, companyId, eventIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_tools')
        .select(`
          id, tool_id, event_id, quantity,
          tools (id, name_en, name_pl, unit),
          events (id, title)
        `)
        .eq('date', planDateStr);
      if (error) throw error;
      const rows = (data || []) as any[];
      return rows.filter((r) => {
        if (r.company_id === companyId) return true;
        if (r.company_id == null && (!r.event_id || eventIdSet.has(r.event_id))) return true;
        return false;
      });
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

  const toolsByProject = (calendarTools as any[]).reduce((acc: Record<string, any[]>, row) => {
    const eid = row.event_id || 'unassigned';
    if (!acc[eid]) acc[eid] = [];
    acc[eid].push(row);
    return acc;
  }, {});

  const dayAbbrev = format(date, 'EEE', { locale: dateLocale });
  const dayNum = format(date, 'd');
  const dayName = format(date, 'EEEE', { locale: dateLocale });
  const fullDate = format(date, 'MMMM d, yyyy', { locale: dateLocale });

  const eventsPhrase =
    events.length === 0
      ? t('event:day_modal_events_zero')
      : i18n.language === 'pl'
        ? events.length === 1
          ? t('event:day_modal_events_one')
          : (() => {
              const n = events.length;
              const mod10 = n % 10;
              const mod100 = n % 100;
              if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} zdarzenia`;
              return `${n} zdarzeń`;
            })()
        : events.length === 1
          ? t('event:day_modal_events_one')
          : t('event:day_modal_events_other', { count: events.length });

  const modalHeaderTitle = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: radii.xl,
          flexShrink: 0,
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
      <span
        style={{
          fontSize: fontSizes.xl,
          fontWeight: fontWeights.bold,
          color: colors.textPrimary,
          fontFamily: fonts.display,
          lineHeight: 1.35,
          wordBreak: 'break-word',
        }}
      >
        {dayName}, {fullDate}, {eventsPhrase}
      </span>
    </div>
  );

  const EventCard = ({ event, fillHeight }: { event: Event; fillHeight?: boolean }) => {
    const st = statusConfig[event.status] || statusConfig.planned;
    const eventMaterials = materialsByProject[event.id] || [];
    const eventEquipment = equipmentByProject[event.id] || [];
    const eventTools = toolsByProject[event.id] || [];
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
    const toolItems = eventTools.map((row: any) => {
      const tr = row.tools as { name_en?: string; name_pl?: string; unit?: string } | null;
      const name = tr ? toolDisplayName({ name_en: tr.name_en || '', name_pl: tr.name_pl || '' }, i18n.language) : '';
      return {
        name,
        quantity: row.quantity,
        unit: tr?.unit ? translateUnit(tr.unit, t) : t('event:unit_singular'),
        notes: row.notes,
      };
    });
    const plannedTasksList = plannedTasksListByEvent[event.id] ?? [];

    return (
      <div
        style={{
          background: colors.bgCard,
          borderRadius: radii['3xl'],
          border: `1px solid ${colors.borderSubtle}`,
          overflow: 'hidden',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          flex: fillHeight ? 1 : undefined,
          minHeight: 0,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
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
        <div style={{ height: 3, background: `linear-gradient(90deg, ${st.color}, transparent)`, flexShrink: 0 }} />
        <div style={{ padding: '14px 16px 16px', flex: 1, minHeight: 0, overflow: 'auto' }}>
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

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setUnifiedDayModal({ event, tab: 'plan' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                minHeight: 44,
                borderRadius: radii.lg,
                border: `1px solid ${colors.accentBlueBorder}`,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: fonts.body,
                color: colors.accentBlue,
                background: colors.accentBlueBg,
              }}
            >
              <Timer size={15} />
              {t('dashboard:day_plan_plan_day')}
            </button>
            <button
              type="button"
              onClick={() => setUnifiedDayModal({ event, tab: 'materials' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                minHeight: 44,
                borderRadius: radii.lg,
                border: `1px solid ${colors.greenBorder}`,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: fonts.body,
                color: colors.green,
                background: colors.greenBg,
              }}
            >
              <Package size={15} />
              {t('dashboard:day_plan_tab_materials')}
            </button>
            <button
              type="button"
              onClick={() => setUnifiedDayModal({ event, tab: 'equipment' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                minHeight: 44,
                borderRadius: radii.lg,
                border: `1px solid ${colors.amber}`,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: fonts.body,
                color: colors.amber,
                background: 'rgba(245, 158, 11, 0.12)',
              }}
            >
              <Wrench size={15} />
              {t('dashboard:day_plan_tab_equipment')}
            </button>
            <button
              type="button"
              onClick={() => setUnifiedDayModal({ event, tab: 'tools' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                minHeight: 44,
                borderRadius: radii.lg,
                border: `1px solid rgba(168,85,247,0.45)`,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: fonts.body,
                color: colors.purple,
                background: 'rgba(168,85,247,0.1)',
              }}
            >
              <Hammer size={15} />
              {t('dashboard:day_plan_tab_tools')}
            </button>
          </div>

          <CollapsibleSection
            icon={<ClipboardList size={14} />}
            label={t('event:required_tasks')}
            count={plannedTasksList.length}
            accentColor={colors.accentBlue}
            showWhenZero
          >
            <PlannedTasksGroupedList
              rows={plannedTasksList}
              folders={taskFoldersForDayDetails.filter((f) => f.event_id === event.id)}
              t={t}
            />
          </CollapsibleSection>

          <CollapsibleSection
            icon={<Package size={14} />}
            label={t('event:required_materials')}
            count={eventMaterials.length}
            accentColor={colors.red}
            showWhenZero
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
            showWhenZero
          >
            {eqItems.map((eq: any, i: number) => (
              <ItemRow key={i} item={eq} unitLabel={t('event:unit_singular')} t={t} />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            icon={<Hammer size={14} />}
            label={t('event:required_tools')}
            count={eventTools.length}
            accentColor={colors.purple}
            showWhenZero
          >
            {toolItems.map((it: any, i: number) => (
              <ItemRow key={i} item={it} unitLabel={t('common:units')} t={t} />
            ))}
          </CollapsibleSection>
        </div>
      </div>
    );
  };

  return (
    <>
      <Modal
        open={true}
        onClose={onClose}
        title={modalHeaderTitle}
        width={1200}
        panelMaxHeight="92vh"
        bodyStyle={{
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            fontFamily: fonts.body,
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: spacing['5xl'],
            boxSizing: 'border-box',
          }}
        >
          {events.length === 0 ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: colors.bgCard,
                borderRadius: radii['3xl'],
                border: `1px solid ${colors.borderSubtle}`,
                padding: spacing['6xl'],
              }}
            >
              <p style={{ fontSize: fontSizes.base, color: colors.textDim, margin: 0, fontFamily: fonts.body, textAlign: 'center' }}>
                {t('event:no_events_add_materials_equipment')}
              </p>
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: spacing.md,
              }}
            >
              {events.map((ev) => (
                <EventCard key={ev.id} event={ev} fillHeight={events.length === 1} />
              ))}
            </div>
          )}
        </div>
      </Modal>

      {unifiedDayModal && (
        <UnifiedEventDayModal
          event={{
            id: unifiedDayModal.event.id,
            title: unifiedDayModal.event.title,
            description: unifiedDayModal.event.description,
          }}
          date={date}
          initialTab={unifiedDayModal.tab}
          statusAccentColor={(statusConfig[unifiedDayModal.event.status] || statusConfig.planned).color}
          onClose={() => {
            setUnifiedDayModal(null);
            queryClient.invalidateQueries({ queryKey: ['calendar_day_plan_day_details', planDateStr] });
            queryClient.invalidateQueries({ queryKey: ['calendar_materials', date, companyId] });
            queryClient.invalidateQueries({ queryKey: ['calendar_equipment', date, companyId] });
            queryClient.invalidateQueries({ queryKey: ['calendar_tools', date, companyId] });
          }}
        />
      )}
    </>
  );
};

export default DayDetailsModal;
