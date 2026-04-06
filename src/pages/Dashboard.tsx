import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { format, addDays, parseISO, isWithinInterval } from 'date-fns';
import { enUS, pl } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useSidebarSectionReset } from '../hooks/useSidebarSectionReset';
import { AlertCircle, ChevronDown, ChevronUp, Wrench, Package, ClipboardList } from 'lucide-react';
import PageInfoModal from '../components/PageInfoModal';
import DatePicker from '../components/DatePicker';
import {
  PageHeader,
  Button,
  SummaryBar,
  SectionHeader,
  Modal,
  Label,
  DayColumn,
  EmptyState,
  EventCard,
  colors,
  spacing,
  fonts,
  fontSizes,
  fontWeights,
  radii,
  transitions,
  layout,
} from '../themes';
import { translateTaskName, translateUnit } from '../lib/i18nTaskUtils';

type DashboardTaskFolderLite = { id: string; name: string; sort_order: number | null; event_id?: string | null };

type DashboardPlannedRow = {
  rowKey: string;
  folderId: string | null;
  display: string;
  quantity: number | null;
  unitLabel: string;
  priority: number;
  hourStart: number | null;
  hourEnd: number | null;
};

function dashboardExcavationPrepFolder(f: Pick<DashboardTaskFolderLite, 'name' | 'sort_order'>): boolean {
  if ((f.sort_order ?? 0) < 0) return true;
  const n = (f.name || '').toLowerCase();
  if (n.includes('excavation') && n.includes('preparation')) return true;
  if (n.includes('digging') && n.includes('preparation')) return true;
  if (n.includes('kopan') && (n.includes('przygotow') || n.includes('preparation'))) return true;
  return false;
}

function sortDashboardPlannedFolderKeys(
  keys: (string | '__none__')[],
  folderById: Map<string, DashboardTaskFolderLite>
): (string | '__none__')[] {
  const hasNone = keys.includes('__none__');
  const real = keys.filter((k): k is string => k !== '__none__');
  real.sort((a, b) => {
    const fa = folderById.get(a);
    const fb = folderById.get(b);
    const ae = fa && dashboardExcavationPrepFolder(fa);
    const be = fb && dashboardExcavationPrepFolder(fb);
    if (ae !== be) return ae ? -1 : 1;
    const soa = fa?.sort_order ?? 0;
    const sob = fb?.sort_order ?? 0;
    if (soa !== sob) return soa - sob;
    return (fa?.name || a).localeCompare(fb?.name || b);
  });
  return hasNone ? [...real, '__none__'] : real;
}

function DashboardPlannedTasksGrouped({
  rows,
  folders,
  t,
}: {
  rows: DashboardPlannedRow[];
  folders: DashboardTaskFolderLite[];
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const { grouped, sortedKeys } = useMemo(() => {
    const g = new Map<string | '__none__', DashboardPlannedRow[]>();
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
    const sorted = sortDashboardPlannedFolderKeys(keys, folderById);
    return { grouped: g, sortedKeys: sorted };
  }, [rows, folderById]);

  const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`;

  return (
    <>
      {sortedKeys.map((fk, idx) => {
        const list = grouped.get(fk)!;
        const title =
          fk === '__none__' ? t('dashboard:day_plan_tasks_no_folder') : folderById.get(fk)?.name ?? '';
        return (
          <div key={String(fk)} style={{ marginTop: idx === 0 ? 0 : 12 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: fontWeights.bold,
                color: colors.accentBlue,
                fontFamily: fonts.display,
                marginBottom: 6,
                paddingLeft: 2,
              }}
            >
              {title}
            </div>
            <div style={{ paddingLeft: 6 }}>
              {list.map((row) => {
                const hasHours = row.hourStart !== null && row.hourEnd !== null;
                const qtyPart =
                  row.quantity !== null && !Number.isNaN(row.quantity) && row.quantity !== 0
                    ? ` — ${row.quantity}${row.unitLabel ? ` ${row.unitLabel}` : ''}`
                    : '';
                return (
                  <div
                    key={row.rowKey}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
                      <span style={{ fontSize: 12.5, color: colors.textPrimary, fontWeight: fontWeights.semibold }}>{row.display}</span>
                      {qtyPart ? (
                        <span style={{ fontSize: 12.5, color: colors.textDim, fontWeight: fontWeights.medium }}>{qtyPart}</span>
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
                        minWidth: 88,
                        flexShrink: 0,
                        textAlign: 'right',
                        fontSize: 12,
                        fontWeight: fontWeights.semibold,
                        color: hasHours ? colors.textSecondary : colors.textFaint,
                        fontFamily: fonts.display,
                      }}
                    >
                      {hasHours ? `${fmtHour(row.hourStart!)}–${fmtHour(row.hourEnd!)}` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

const Dashboard = () => {
  const { t, i18n } = useTranslation(['dashboard', 'common', 'utilities', 'project', 'event', 'calculator']);
  const navigate = useNavigate();
  const companyId = useAuthStore(state => state.getCompanyId());
  const today = new Date();
  const currentLocale = i18n.language === 'pl' ? pl : enUS;
  const DASHBOARD_SCROLL_DAYS = 14;
  const [compactHeader, setCompactHeader] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setCompactHeader(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const todayYmd = format(today, 'yyyy-MM-dd');
  const dashboardPlanDates = useMemo(() => {
    const base = new Date();
    return Array.from({ length: DASHBOARD_SCROLL_DAYS }, (_, i) => format(addDays(base, i), 'yyyy-MM-dd'));
  }, [todayYmd]);

  const [expandedSections, setExpandedSections] = useState<Record<string, Record<string, boolean>>>({});
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [materialDate, setMaterialDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));

  const daysScrollIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [daysScrollInteracting, setDaysScrollInteracting] = useState(false);

  useSidebarSectionReset('/', () => {
    setShowAddMaterialModal(false);
  });

  const handleDaysScroll = useCallback(() => {
    setDaysScrollInteracting(true);
    if (daysScrollIdleRef.current) clearTimeout(daysScrollIdleRef.current);
    daysScrollIdleRef.current = setTimeout(() => {
      setDaysScrollInteracting(false);
      daysScrollIdleRef.current = null;
    }, 900);
  }, []);

  useEffect(() => () => {
    if (daysScrollIdleRef.current) clearTimeout(daysScrollIdleRef.current);
  }, []);

  const { data: events = [] } = useQuery({
    queryKey: ['dashboard_events', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('events')
        .select(`
          id,
          title,
          description,
          start_date,
          end_date,
          status,
          has_equipment,
          has_materials
        `)
        .eq('company_id', companyId)
        .or(`status.eq.scheduled,status.eq.in_progress`)
        .order('start_date', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch calendar materials
  const { data: calendarMaterials = [] } = useQuery({
    queryKey: ['dashboard_calendar_materials', companyId, dashboardPlanDates.join(',')],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('calendar_materials')
        .select(`
          *,
          events (
            id,
            title
          ),
          profiles (
            full_name
          )
        `)
        .eq('company_id', companyId)
        .in('date', dashboardPlanDates)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch calendar equipment
  const { data: calendarEquipment = [] } = useQuery({
    queryKey: ['dashboard_calendar_equipment', companyId, dashboardPlanDates.join(',')],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('calendar_equipment')
        .select(`
          *,
          events (
            id,
            title
          ),
          equipment (
            id,
            name
          ),
          profiles (
            full_name
          )
        `)
        .eq('company_id', companyId)
        .in('date', dashboardPlanDates)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch equipment usage with equipment details
  const { data: _equipmentUsage = [] } = useQuery({
    queryKey: ['dashboard_equipment', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('equipment_usage')
        .select(`
          id,
          equipment_id,
          event_id,
          start_date,
          end_date,
          equipment:equipment_id (
            id,
            name,
            status
          )
        `)
        .eq('company_id', companyId)
        .eq('equipment.status', 'in_use');

      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch day notes
  const { data: dayNotes = [] } = useQuery({
    queryKey: ['dashboard_day_notes', companyId, dashboardPlanDates.join(',')],
    queryFn: async () => {
      const cid = companyId;
      if (!cid) return [];
      const { data, error } = await supabase
        .from('day_notes')
        .select(`
          id,
          event_id,
          content,
          date,
          created_at,
          user_id,
          events (id, title),
          profiles (id, full_name)
        `)
        .eq('company_id', cid)
        .in('date', dashboardPlanDates)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Project tasks (for summary / completed today)
  const { data: tasks = [] } = useQuery({
    queryKey: ['dashboard_tasks', events.map(e => e.id), companyId],
    queryFn: async () => {
      const cid = companyId;
      if (events.length === 0 || !cid) return [];

      const { data, error } = await supabase
        .from('tasks_done')
        .select('*')
        .eq('company_id', cid)
        .in('event_id', events.map(e => e.id).filter((id): id is string => id != null));

      if (error) throw error;
      return data;
    },
    enabled: events.length > 0 && !!companyId
  });

  const dashboardEventIdKey = events
    .map(e => e.id)
    .filter((id): id is string => id != null)
    .sort()
    .join(',');

  const { data: dashboardPlannedBlocks = [] } = useQuery({
    queryKey: ['dashboard_calendar_planned_tasks', companyId, dashboardPlanDates.join(','), dashboardEventIdKey],
    queryFn: async () => {
      const cid = companyId;
      const ids = events.map(e => e.id).filter((id): id is string => id != null);
      if (!cid || ids.length === 0) return [];

      const { data, error } = await supabase
        .from('calendar_day_plan_blocks')
        .select(
          `
          id,
          event_id,
          plan_date,
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
        .eq('company_id', cid)
        .in('plan_date', dashboardPlanDates)
        .in('event_id', ids);

      if (error) throw error;
      return data || [];
    },
    enabled: events.length > 0 && !!companyId,
  });

  const { data: dashboardTaskFolders = [] } = useQuery({
    queryKey: ['dashboard_task_folders', companyId, dashboardEventIdKey],
    queryFn: async () => {
      const cid = companyId;
      const ids = events.map((e) => e.id).filter((id): id is string => id != null);
      if (!cid || ids.length === 0) return [];
      const { data, error } = await supabase
        .from('task_folders')
        .select('id, name, sort_order, event_id')
        .eq('company_id', cid)
        .in('event_id', ids)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as DashboardTaskFolderLite[];
    },
    enabled: events.length > 0 && !!companyId,
  });

  const plannedTaskCountByEventAndDate = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const row of dashboardPlannedBlocks as Array<{
      event_id?: string | null;
      plan_date?: string | null;
      calendar_day_plan_block_tasks?: Array<{ tasks_done_id?: string | null }> | null;
    }>) {
      if (!row.event_id || !row.plan_date) continue;
      const key = `${row.event_id}__${row.plan_date}`;
      if (!m[key]) m[key] = new Set();
      for (const t of row.calendar_day_plan_block_tasks || []) {
        if (t.tasks_done_id) m[key].add(t.tasks_done_id);
      }
    }
    const out: Record<string, number> = {};
    for (const [k, set] of Object.entries(m)) out[k] = set.size;
    return out;
  }, [dashboardPlannedBlocks]);

  const plannedTaskRowsByEventDate = useMemo(() => {
    type BlockRow = {
      id: string;
      event_id?: string | null;
      plan_date?: string | null;
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
    const tasksById = new Map((tasks as Array<{ id: string; name?: string | null; task_name?: string | null; unit?: string | null; folder_id?: string | null }>).map((r) => [r.id, r]));
    const result: Record<string, DashboardPlannedRow[]> = {};
    const sortedBlocks = [...(dashboardPlannedBlocks as BlockRow[])].sort((a, z) => (a.sort_order ?? 0) - (z.sort_order ?? 0));
    let seq = 0;
    for (const block of sortedBlocks) {
      const eid = block.event_id;
      const pd = block.plan_date;
      if (!eid || !pd) continue;
      const key = `${eid}__${pd}`;
      if (!result[key]) result[key] = [];
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
        result[key].push({
          rowKey: `${block.id}-${tid}-${seq++}`,
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
    for (const k of Object.keys(result)) {
      result[k].sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : 0));
    }
    return result;
  }, [dashboardPlannedBlocks, tasks, t]);

  // Summary counts for SummaryBar (computed from events + tasks)
  const inProgressCount = events.filter(e => e.status === 'in_progress').length;
  const scheduledCount = events.filter(e => e.status === 'scheduled' || e.status === 'planned').length;
  const completedTodayCount = tasks.filter(t => {
    if (!t.completed_at) return false;
    const d = new Date(t.completed_at);
    return format(d, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
  }).length;
  const totalTasksCount = events.reduce((sum, e) => {
    const eventTasks = tasks.filter((t: { event_id?: string }) => t.event_id === e.id);
    return sum + eventTasks.length;
  }, 0) || events.length;

  const getEventAccentColor = (status: string) => {
    if (status === 'in_progress') return colors.orange;
    if (status === 'scheduled' || status === 'planned') return colors.green;
    return colors.accentBlue;
  };

  const formatStatus = (status: string) => {
    if (!status) return t('project:unknown');
    
    const statusKey = `project:status_${status.replace(/_/g, '_')}`;
    const translated = t(statusKey);
    
    // Fallback if translation key doesn't exist
    if (translated === statusKey) {
      return status.replace('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
    }
    return translated;
  };

  const DayView = ({ date, dayEvents }: { date: Date; dayEvents: typeof events }) => {
    const dayMaterials = calendarMaterials.filter(m =>
      format(parseISO(m.date), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
    );

    const dayEquipment = calendarEquipment.filter(e =>
      format(parseISO(e.date), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
    );

    const dayNotesForDate = dayNotes.filter(n =>
      n.date === format(date, 'yyyy-MM-dd')
    );

    const materialsByProject = dayMaterials.reduce((acc: Record<string, any[]>, material) => {
      const eventId = material.event_id ?? 'unknown';
      if (!acc[eventId]) acc[eventId] = [];
      acc[eventId].push(material);
      return acc;
    }, {});

    const equipmentByProject = dayEquipment.reduce((acc: Record<string, any[]>, equipment) => {
      const eventId = equipment.event_id ?? 'unknown';
      if (!acc[eventId]) acc[eventId] = [];
      acc[eventId].push(equipment);
      return acc;
    }, {});

    const toggleSection = (eventId: string, section: 'planned_tasks' | 'materials' | 'equipment') => {
      setExpandedSections(prev => ({
        ...prev,
        [format(date, 'yyyy-MM-dd')]: {
          ...prev[format(date, 'yyyy-MM-dd')],
          [`${eventId}-${section}`]: !prev[format(date, 'yyyy-MM-dd')]?.[`${eventId}-${section}`]
        }
      }));
    };

    const isExpanded = (eventId: string, section: 'planned_tasks' | 'materials' | 'equipment') => {
      return expandedSections[format(date, 'yyyy-MM-dd')]?.[`${eventId}-${section}`] || false;
    };

    const isToday = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');

    return (
      <DayColumn
        dayName={format(date, "EEEE", { locale: currentLocale })}
        date={format(date, "MMMM d, yyyy", { locale: currentLocale })}
        eventsCount={dayEvents.length}
        eventsLabel={`${dayEvents.length} ${t('dashboard:events')}`}
        isToday={isToday}
        todayLabel={t('dashboard:today')}
        onClick={() => navigate(`/calendar?date=${format(date, 'yyyy-MM-dd')}`)}
        style={{
          flex: '0 0 auto',
          minWidth: layout.dayColumnMinWidth,
          maxWidth: layout.dayColumnMaxWidth,
          scrollSnapAlign: 'start',
        }}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: spacing["6xl"],
          flex: 1,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }}>
            {dayEvents.filter(e => e.id).map(event => {
              const eventId = event.id!;
              const dateKey = format(date, 'yyyy-MM-dd');
              const plannedTaskCount = plannedTaskCountByEventAndDate[`${eventId}__${dateKey}`] ?? 0;
              const plannedTaskRows = plannedTaskRowsByEventDate[`${eventId}__${dateKey}`] ?? [];
              const eventTaskFolders = dashboardTaskFolders.filter((f) => f.event_id === eventId);
              const eventMaterials = materialsByProject[eventId] || [];
              const eventEquipment = equipmentByProject[eventId] || [];

              return (
                <DashboardEventCard
                  key={eventId}
                  event={event}
                  plannedTaskCount={plannedTaskCount}
                  plannedTaskRows={plannedTaskRows}
                  taskFolders={eventTaskFolders}
                  eventMaterials={eventMaterials}
                  eventEquipment={eventEquipment}
                  formatStatus={formatStatus}
                  getEventAccentColor={getEventAccentColor}
                  toggleSection={(s) => toggleSection(eventId, s)}
                  isExpanded={(s) => isExpanded(eventId, s)}
                  t={t}
                  navigate={navigate}
                />
              );
            })}

            {dayEvents.length === 0 && (
              <EmptyState
                icon="📭"
                title={t('dashboard:no_events_scheduled')}
                style={{ flex: 1, padding: spacing["6xl"] }}
              />
            )}
          </div>

          {dayNotesForDate.length > 0 && (
            <div style={{ paddingTop: spacing["6xl"], borderTop: `1px solid ${colors.borderLight}` }}>
              <SectionHeader title={t('dashboard:day_notes')} style={{ marginBottom: spacing["5xl"] }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
                {dayNotesForDate.map(note => (
                  <div key={note.id} style={{
                    background: colors.bgSubtle,
                    padding: spacing["5xl"],
                    borderRadius: radii.lg,
                    border: `1px solid ${colors.borderLight}`,
                  }}>
                    <p style={{
                      fontSize: fontSizes.base,
                      fontWeight: fontWeights.medium,
                      color: colors.accentBlue,
                      fontFamily: fonts.body,
                      margin: 0,
                    }}>
                      {note.events?.title || t('dashboard:unknown_event')}
                    </p>
                    <p style={{
                      color: colors.textPrimary,
                      fontFamily: fonts.body,
                      margin: `${spacing.sm}px 0 0 0`,
                    }}>
                      {note.content}
                    </p>
                    <p style={{
                      fontSize: fontSizes.xs,
                      color: colors.textDim,
                      fontFamily: fonts.body,
                      margin: `${spacing.sm}px 0 0 0`,
                    }}>
                      {t('dashboard:by')} {note.profiles?.full_name} • {note.created_at ? format(new Date(note.created_at), 'MMM d, h:mm a', { locale: currentLocale }) : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DayColumn>
    );
  };

  const DashboardEventCard = ({
    event,
    plannedTaskCount,
    plannedTaskRows = [],
    taskFolders = [],
    eventMaterials = [],
    eventEquipment = [],
    formatStatus,
    getEventAccentColor,
    toggleSection,
    isExpanded,
    t,
    navigate,
  }: {
    event: any;
    plannedTaskCount: number;
    plannedTaskRows?: DashboardPlannedRow[];
    taskFolders?: DashboardTaskFolderLite[];
    eventMaterials?: any[];
    eventEquipment?: any[];
    formatStatus: (s: string) => string;
    getEventAccentColor: (s: string) => string;
    toggleSection: (s: 'planned_tasks' | 'materials' | 'equipment') => void;
    isExpanded: (s: 'planned_tasks' | 'materials' | 'equipment') => boolean;
    t: any;
    navigate: (p: string) => void;
  }) => (
    <EventCard
      name={event.title}
      status={formatStatus(event.status)}
      accentColor={getEventAccentColor(event.status)}
      onClick={() => navigate(`/events/${event.id}`)}
    >
      {event.description && (
        <span style={{
          fontSize: fontSizes.base,
          color: colors.textDim,
          fontFamily: fonts.body,
          display: 'block',
          marginBottom: spacing.sm,
        }}>
          {event.description}
        </span>
      )}

      <div style={{
        marginTop: spacing["5xl"],
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: spacing["5xl"],
        fontSize: fontSizes.base,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', color: colors.textDim }}>
          <ClipboardList style={{ width: spacing["3xl"], height: spacing["3xl"], marginRight: spacing.sm }} />
          <span>
            {plannedTaskCount} {t('dashboard:planned_tasks_label')}
          </span>
        </div>
        {eventMaterials.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', color: colors.textDim }}>
            <Package style={{ width: spacing["3xl"], height: spacing["3xl"], marginRight: spacing.sm }} />
            <span>{eventMaterials.length} {t('dashboard:materials')}</span>
          </div>
        )}
        {eventEquipment.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', color: colors.textDim }}>
            <Wrench style={{ width: spacing["3xl"], height: spacing["3xl"], marginRight: spacing.sm }} />
            <span>{eventEquipment.length} {t('dashboard:equipment')}</span>
          </div>
        )}
      </div>

      {plannedTaskRows.length > 0 && (
        <div style={{ marginTop: spacing["5xl"], paddingTop: spacing["5xl"], borderTop: `1px solid ${colors.borderLight}` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: fontSizes.base,
              color: colors.accentBlue,
              marginBottom: spacing.sm,
              cursor: 'pointer',
              borderRadius: radii.md,
              padding: spacing.sm,
              transition: transitions.fast,
            }}
            onClick={(e) => {
              e.stopPropagation();
              toggleSection('planned_tasks');
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <ClipboardList style={{ width: spacing["3xl"], height: spacing["3xl"], marginRight: spacing.xs }} />
              <span>{t('dashboard:day_plan_section_scheduled_tasks', { count: plannedTaskRows.length })}</span>
            </div>
            {isExpanded('planned_tasks') ? (
              <ChevronUp style={{ width: spacing["3xl"], height: spacing["3xl"] }} />
            ) : (
              <ChevronDown style={{ width: spacing["3xl"], height: spacing["3xl"] }} />
            )}
          </div>
          {isExpanded('planned_tasks') && (
            <div style={{ padding: `0 ${spacing.sm}px ${spacing.sm}px` }}>
              <DashboardPlannedTasksGrouped rows={plannedTaskRows} folders={taskFolders} t={t} />
            </div>
          )}
        </div>
      )}

      {eventMaterials.length > 0 && (
        <div style={{ marginTop: spacing["5xl"], paddingTop: spacing["5xl"], borderTop: `1px solid ${colors.borderLight}` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: fontSizes.base,
              color: colors.red,
              marginBottom: spacing.sm,
              cursor: 'pointer',
              borderRadius: radii.md,
              padding: spacing.sm,
              transition: transitions.fast,
            }}
            onClick={(e) => {
              e.stopPropagation();
              toggleSection('materials');
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <AlertCircle style={{ width: spacing["3xl"], height: spacing["3xl"], marginRight: spacing.xs }} />
              <span>{t('dashboard:required_materials')}</span>
              <span style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.bold }}>{eventMaterials.length}</span>
            </div>
            {isExpanded('materials') ? (
              <ChevronUp style={{ width: spacing["3xl"], height: spacing["3xl"] }} />
            ) : (
              <ChevronDown style={{ width: spacing["3xl"], height: spacing["3xl"] }} />
            )}
          </div>
          {isExpanded('materials') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {eventMaterials.map((material: any) => (
                <div key={material.id} style={{
                  background: colors.bgCard,
                  padding: spacing.sm,
                  borderRadius: radii.md,
                  fontSize: fontSizes.base,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: fontWeights.medium, fontFamily: fonts.body }}>
                      {material.material} - {material.quantity} {material.unit}
                    </span>
                    {material.notes && (
                      <span style={{ color: colors.red, fontSize: fontSizes.xs, fontFamily: fonts.body }}>
                        {t('dashboard:note')}: {material.notes}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {eventEquipment.length > 0 && (
        <div style={{ marginTop: spacing["5xl"], paddingTop: spacing["5xl"], borderTop: `1px solid ${colors.borderLight}` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: fontSizes.base,
              color: colors.orange,
              marginBottom: spacing.sm,
              cursor: 'pointer',
              borderRadius: radii.md,
              padding: spacing.sm,
              transition: transitions.fast,
            }}
            onClick={(e) => {
              e.stopPropagation();
              toggleSection('equipment');
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <Wrench style={{ width: spacing["3xl"], height: spacing["3xl"], marginRight: spacing.xs }} />
              <span>{t('dashboard:required_equipment')}</span>
              <span style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.bold }}>{eventEquipment.length}</span>
            </div>
            {isExpanded('equipment') ? (
              <ChevronUp style={{ width: spacing["3xl"], height: spacing["3xl"] }} />
            ) : (
              <ChevronDown style={{ width: spacing["3xl"], height: spacing["3xl"] }} />
            )}
          </div>
          {isExpanded('equipment') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {eventEquipment.map((equipment: any) => (
                <div key={equipment.id} style={{
                  background: colors.bgCard,
                  padding: spacing.sm,
                  borderRadius: radii.md,
                  fontSize: fontSizes.base,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: fontWeights.medium, fontFamily: fonts.body }}>
                      {equipment.equipment?.name} - {equipment.quantity} {equipment.quantity > 1 ? t('dashboard:units') : t('dashboard:unit')}
                    </span>
                    {equipment.notes && (
                      <span style={{ color: colors.orange, fontSize: fontSizes.xs, fontFamily: fonts.body }}>
                        {t('dashboard:note')}: {equipment.notes}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </EventCard>
  );

  return (
    <div style={{
      maxWidth: layout.dashboardMaxWidth,
      margin: '0 auto',
      fontFamily: fonts.body,
    }}>
      <PageHeader
        title={t('dashboard:title')}
        infoButton={<PageInfoModal description={t('dashboard:info_description')} title={t('dashboard:info_title')} />}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            gap: compactHeader ? 6 : spacing.lg,
            width: compactHeader ? '100%' : 'auto',
            minWidth: 0,
            flexBasis: compactHeader ? '100%' : undefined,
            justifyContent: compactHeader ? 'stretch' : 'flex-start',
          }}
        >
          <Button
            onClick={() => navigate('/user-hours')}
            style={{
              flex: '1 1 0',
              minWidth: 0,
              padding: compactHeader ? `${spacing.md}px ${spacing.sm}px` : undefined,
              fontSize: compactHeader ? fontSizes.sm : undefined,
            }}
          >
            {t('dashboard:add_hours_short')}
          </Button>
          <Button
            onClick={() => setShowAddMaterialModal(true)}
            style={{
              flex: '1 1 0',
              minWidth: 0,
              padding: compactHeader ? `${spacing.md}px ${spacing.sm}px` : undefined,
              fontSize: compactHeader ? fontSizes.sm : undefined,
            }}
          >
            {t('dashboard:add_tasks_materials_gear_short')}
          </Button>
        </div>
      </PageHeader>

      <SummaryBar
        items={[
          { label: t('dashboard:in_progress', 'W Trakcie'), value: inProgressCount, color: colors.orange },
          { label: t('dashboard:scheduled', 'Zaplanowane'), value: scheduledCount, color: colors.green },
          { label: t('dashboard:completed_today', 'Ukończone dziś'), value: completedTodayCount, color: colors.accentBlue },
          { label: t('dashboard:total_tasks', 'Łączne zadania'), value: totalTasksCount, color: colors.purple },
        ]}
        style={{ marginBottom: spacing["6xl"] }}
      />

      <div
        className={`dashboard-days-scroll${daysScrollInteracting ? ' dashboard-days-scroll--interacting' : ''}`}
        onScroll={handleDaysScroll}
        style={{
          display: 'flex',
          gap: 14,
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: 8,
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x proximity',
        }}
      >
        {dashboardPlanDates.map((ymd) => {
          const dayDate = new Date(`${ymd}T12:00:00`);
          return (
            <DayView
              key={ymd}
              date={dayDate}
              dayEvents={events.filter((event) => {
                const eventStart = parseISO(event.start_date);
                const eventEnd = parseISO(event.end_date);
                return isWithinInterval(dayDate, { start: eventStart, end: eventEnd });
              })}
            />
          );
        })}
      </div>

      {/* Order Material & Equipment Modal */}
      <Modal
        open={showAddMaterialModal}
        onClose={() => setShowAddMaterialModal(false)}
        title={t('dashboard:add_tasks_materials_gear_modal_title')}
        width={448}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.lg, paddingTop: spacing["5xl"] }}>
            <Button variant="secondary" onClick={() => setShowAddMaterialModal(false)}>
              {t('dashboard:cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                navigate(`/calendar?date=${materialDate}`);
                setShowAddMaterialModal(false);
              }}
            >
              {t('dashboard:go_to_day')}
            </Button>
          </div>
        }
      >
        <div>
          <Label>{t('dashboard:select_date')}</Label>
          <DatePicker
            value={materialDate}
            onChange={setMaterialDate}
          />
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;
