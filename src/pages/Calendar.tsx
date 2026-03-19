import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  addMonths,
  subMonths,
  parseISO,
  isSameMonth,
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
  isSameDay,
  subDays,
  addDays,
  getWeek,
} from 'date-fns';
import { pl } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ClipboardList, Package, Wrench } from 'lucide-react';
import PageInfoModal from '../components/PageInfoModal';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Database } from '../lib/database.types';
import BackButton from '../components/BackButton';
import DayDetailsModal from '../components/DayDetailsModal';
import DatePicker from '../components/DatePicker';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../themes/designTokens';
import { Button, Modal } from '../themes/uiComponents';

type Event = Database['public']['Tables']['events']['Row'];

// Status config matching the design from images
const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  in_progress: { label: 'W Trakcie', color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)' },
  scheduled: { label: 'Zaplanowany', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)' },
  planned: { label: 'Zaplanowany', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)' },
  finished: { label: 'Zakończony', color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)' },
};

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const cfg = statusConfig[status] || statusConfig.planned;
  const labelKey = `project:status_${status?.replace(/-/g, '_')}`;
  const label = t(labelKey) !== labelKey ? t(labelKey) : cfg.label;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10.5,
        fontWeight: 600,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 16,
        padding: '2px 8px 2px 6px',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color }} />
      {label}
    </span>
  );
}

function MiniEventBar({ event, onClick }: { event: Event; onClick: () => void }) {
  const cfg = statusConfig[event.status || 'planned'] || statusConfig.planned;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 4,
        background: `${cfg.color}18`,
        overflow: 'hidden',
        minWidth: 0,
        cursor: 'pointer',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      <span style={{ fontSize: 10.5, color: cfg.color, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {event.title}
      </span>
    </div>
  );
}

function WeeklyEventCard({
  event,
  tasksCount,
  materialsCount,
  equipmentCount,
  onClick,
  t,
}: {
  event: Event;
  tasksCount: number;
  materialsCount: number;
  equipmentCount: number;
  onClick: () => void;
  t: (k: string) => string;
}) {
  const cfg = statusConfig[event.status || 'planned'] || statusConfig.planned;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      style={{
        background: colors.bgCard,
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
        transition: 'border-color 0.15s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
    >
      <div style={{ height: 2, background: cfg.color }} />
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>{event.title}</span>
          <StatusBadge status={event.status || 'planned'} t={t} />
        </div>
        <div style={{ fontSize: 11.5, color: colors.textDim, marginBottom: 8 }}>
          {event.description || t('event:no_description_provided')}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.textDim, fontWeight: 500 }}>
            <ClipboardList size={12} style={{ opacity: 0.6 }} />
            {tasksCount} {t('dashboard:tasks_short')}
          </span>
          {materialsCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.textDim, fontWeight: 500 }}>
              <Package size={12} style={{ opacity: 0.6 }} />
              {materialsCount} {t('dashboard:materials_short')}
            </span>
          )}
          {equipmentCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.textDim, fontWeight: 500 }}>
              <Wrench size={12} style={{ opacity: 0.6 }} />
              {equipmentCount} {t('dashboard:equipment_short')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const Calendar = () => {
  const { t, i18n } = useTranslation(['common', 'dashboard', 'utilities', 'project', 'event']);
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [selectedStatus, setSelectedStatus] = useState<Event['status'] | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [materialDate, setMaterialDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const companyId = useAuthStore(state => state.getCompanyId());

  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const parsedDate = parseISO(dateParam);
      setSelectedDate(parsedDate);
      setCurrentDate(parsedDate);
    }
  }, [searchParams]);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('company_id', companyId)
        .neq('status', 'finished')
        .order('start_date', { ascending: true });
      if (error) throw error;
      return data as Event[];
    },
    enabled: !!companyId,
  });

  const { data: equipmentUsage = [] } = useQuery({
    queryKey: ['equipment_usage', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_usage')
        .select(`*, equipment (id, name), events (id, status)`)
        .eq('company_id', companyId);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const filteredEvents = events.filter(event => {
    if (!event.start_date || !event.end_date) return false;
    if (selectedStatus && event.status !== selectedStatus) return false;
    return true;
  });

  const eventIds = useMemo(() => filteredEvents.map(e => e.id).filter(Boolean), [filteredEvents]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDates = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weekDateStrings = weekDates.map(d => format(d, 'yyyy-MM-dd'));

  const { data: tasksCountByEvent = {} } = useQuery({
    queryKey: ['tasks_done_count', eventIds, companyId],
    queryFn: async () => {
      if (eventIds.length === 0) return {};
      const { data, error } = await supabase
        .from('tasks_done')
        .select('event_id')
        .eq('company_id', companyId)
        .in('event_id', eventIds);
      if (error) throw error;
      const acc: Record<string, number> = {};
      (data || []).forEach((row: { event_id: string | null }) => {
        if (row.event_id) acc[row.event_id] = (acc[row.event_id] || 0) + 1;
      });
      return acc;
    },
    enabled: !!companyId && eventIds.length > 0,
  });

  const { data: weekMaterials = [] } = useQuery({
    queryKey: ['calendar_materials_week', weekDateStrings, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_materials')
        .select('event_id, date')
        .eq('company_id', companyId)
        .in('date', weekDateStrings);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && view === 'week' && weekDateStrings.length > 0,
  });

  const { data: weekEquipment = [] } = useQuery({
    queryKey: ['calendar_equipment_week', weekDateStrings, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_equipment')
        .select('event_id, date')
        .eq('company_id', companyId)
        .in('date', weekDateStrings);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && view === 'week' && weekDateStrings.length > 0,
  });

  const materialsByEventDate = useMemo(() => {
    const m: Record<string, number> = {};
    weekMaterials.forEach((row: { event_id: string | null; date: string }) => {
      if (row.event_id) {
        const key = `${row.event_id}:${row.date}`;
        m[key] = (m[key] || 0) + 1;
      }
    });
    return m;
  }, [weekMaterials]);

  const equipmentByEventDate = useMemo(() => {
    const e: Record<string, number> = {};
    weekEquipment.forEach((row: { event_id: string | null; date: string }) => {
      if (row.event_id) {
        const key = `${row.event_id}:${row.date}`;
        e[key] = (e[key] || 0) + 1;
      }
    });
    return e;
  }, [weekEquipment]);

  const filterEquipmentForDay = (date: Date) => {
    return equipmentUsage.filter(usage => {
      if (!usage.start_date || !usage.end_date) return false;
      if (usage.events?.status === 'finished') return false;
      const start = parseISO(usage.start_date);
      const end = parseISO(usage.end_date);
      return date >= start && date <= end;
    });
  };

  const handleEventClick = (eventId: string) => {
    navigate(`/events/${eventId}`);
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const weeks = eachWeekOfInterval({ start: calendarStart, end: calendarEnd }, { weekStartsOn: 1 });
  const weekNum = getWeek(currentDate, { weekStartsOn: 1 });

  const dayNamesShort = [
    t('dashboard:day_monday_short'),
    t('dashboard:day_tuesday_short'),
    t('dashboard:day_wednesday_short'),
    t('dashboard:day_thursday_short'),
    t('dashboard:day_friday_short'),
    t('dashboard:day_saturday_short'),
    t('dashboard:day_sunday_short'),
  ];

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: fonts.body }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid ${colors.borderLight}`, borderTopColor: colors.accentBlue, animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const statusFilterOptions = ['in_progress', 'planned', 'scheduled'] as const;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bgApp,
        fontFamily: fonts.body,
        padding: 20,
        position: 'relative',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
        <BackButton />
        {/* Header - toggle centered, more to the left to stay within card bounds */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.textPrimary, fontFamily: fonts.display }}>
                {t('dashboard:calendar_title')}
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textDim }}>{format(currentDate, 'MMMM yyyy', { locale: dateLocale })}</p>
            </div>
            <PageInfoModal description={t('dashboard:calendar_info_description')} title={t('dashboard:calendar_info_title')} quickTips={[]} />
          </div>
          <div
            style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden',
              marginLeft: 24,
            }}
          >
            {(['month', 'week'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '8px 16px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: view === v ? colors.textPrimary : colors.textDim,
                  background: view === v ? 'rgba(99,140,255,0.15)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s ease',
                }}
              >
                {v === 'month' ? t('dashboard:view_month') : t('dashboard:view_week')}
              </button>
            ))}
          </div>
        </div>

        {/* Order button - separate row below header to avoid overlapping Back button */}
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setShowAddMaterialModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 10,
              background: 'rgba(249,115,22,0.12)',
              border: '1px solid rgba(249,115,22,0.25)',
              color: colors.orange,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Package size={14} />
            {t('dashboard:order_material_equipment')}
          </button>
        </div>

        {/* Status filters */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {statusFilterOptions.map(key => {
            const cfg = statusConfig[key] || statusConfig.planned;
            const labelKey = `project:status_${key.replace(/_/g, '_')}`;
            const label = t(labelKey) !== labelKey ? t(labelKey) : cfg.label;
            return (
              <button
                key={key}
                onClick={() => setSelectedStatus(selectedStatus === key ? null : key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 12px',
                  borderRadius: 20,
                  background: selectedStatus === key ? cfg.bg : 'transparent',
                  border: `1px solid ${selectedStatus === key ? cfg.border : 'rgba(255,255,255,0.06)'}`,
                  color: cfg.color,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Calendar container */}
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.06)',
            background: colors.bgCard,
          }}
        >
          {/* Nav */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <button
              onClick={() => setCurrentDate(view === 'month' ? subMonths(currentDate, 1) : subDays(currentDate, 7))}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: colors.textDim,
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
              {view === 'month'
                ? format(currentDate, 'MMMM yyyy', { locale: dateLocale })
                : `${t('dashboard:view_week')} ${weekNum} — ${format(currentDate, 'MMMM yyyy', { locale: dateLocale })}`}
            </span>
            <button
              onClick={() => setCurrentDate(view === 'month' ? addMonths(currentDate, 1) : addDays(currentDate, 7))}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: colors.textDim,
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Month View */}
          {view === 'month' && (
            <div style={{ padding: '8px 12px 12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                {dayNamesShort.map(d => (
                  <div
                    key={d}
                    style={{
                      textAlign: 'center',
                      fontSize: 11,
                      fontWeight: 600,
                      color: colors.textDim,
                      padding: '6px 0',
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {weeks.map(week =>
                  eachDayOfInterval({
                    start: startOfWeek(week, { weekStartsOn: 1 }),
                    end: endOfWeek(week, { weekStartsOn: 1 }),
                  }).map(date => {
                    const dayEvents = filteredEvents.filter(event => {
                      const eventStart = parseISO(event.start_date);
                      const eventEnd = parseISO(event.end_date);
                      return date >= eventStart && date <= eventEnd;
                    });
                    const isOtherMonth = !isSameMonth(date, currentDate);
                    const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
                    const maxShow = 3;
                    const extra = dayEvents.length - maxShow;

                    return (
                      <button
                        key={date.toISOString()}
                        onClick={() => setSelectedDate(date)}
                        style={{
                          padding: '6px 5px 4px',
                          minHeight: 90,
                          background: isSelected ? 'rgba(99,140,255,0.08)' : isToday(date) ? 'rgba(99,140,255,0.04)' : 'transparent',
                          border: isSelected ? '1px solid rgba(99,140,255,0.3)' : '1px solid rgba(255,255,255,0.03)',
                          borderRadius: 10,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                          opacity: isOtherMonth ? 0.3 : 1,
                          transition: 'all 0.15s ease',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                        onMouseEnter={e => {
                          if (!isOtherMonth && !isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                        }}
                        onMouseLeave={e => {
                          if (!isOtherMonth && !isSelected) e.currentTarget.style.background = isToday(date) ? 'rgba(99,140,255,0.04)' : 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <span
                            style={{
                              fontSize: 12.5,
                              fontWeight: isToday(date) ? 800 : 500,
                              color: isToday(date) ? '#8bb4ff' : colors.textDim,
                              width: 22,
                              height: 22,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '50%',
                              background: isToday(date) ? 'rgba(99,140,255,0.15)' : 'none',
                            }}
                          >
                            {format(date, 'd')}
                          </span>
                          {dayEvents.length > 0 && isToday(date) && (
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#8bb4ff' }} />
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                          {dayEvents.slice(0, maxShow).map(ev => (
                            <MiniEventBar key={ev.id} event={ev} onClick={() => handleEventClick(ev.id)} />
                          ))}
                          {extra > 0 && (
                            <span style={{ fontSize: 10, color: colors.textDim, fontWeight: 500, paddingLeft: 4 }}>+{extra} więcej</span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Week View */}
          {view === 'week' && (
            <div style={{ padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                {weekDates.map((date, i) => {
                  const dayEvents = filteredEvents.filter(event => {
                    const eventStart = parseISO(event.start_date);
                    const eventEnd = parseISO(event.end_date);
                    return date >= eventStart && date <= eventEnd;
                  });
                  const isCurrentMonth = isSameMonth(date, currentDate);
                  const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
                  const dateStr = format(date, 'yyyy-MM-dd');

                  return (
                    <div key={date.toISOString()} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button
                        onClick={() => setSelectedDate(date)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 2,
                          padding: '8px 4px',
                          borderRadius: 10,
                          background: isSelected ? 'rgba(99,140,255,0.12)' : isToday(date) ? 'rgba(99,140,255,0.06)' : 'transparent',
                          border: isSelected ? '1px solid rgba(99,140,255,0.3)' : '1px solid transparent',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          opacity: isCurrentMonth ? 1 : 0.3,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ fontSize: 10, fontWeight: 600, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                          {dayNamesShort[i]}
                        </span>
                        <span
                          style={{
                            fontSize: 18,
                            fontWeight: isToday(date) ? 800 : 600,
                            color: isToday(date) ? '#8bb4ff' : colors.textPrimary,
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            background: isToday(date) ? 'rgba(99,140,255,0.15)' : 'none',
                          }}
                        >
                          {format(date, 'd')}
                        </span>
                      </button>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {dayEvents.map(ev => (
                          <WeeklyEventCard
                            key={ev.id}
                            event={ev}
                            tasksCount={tasksCountByEvent[ev.id] || 0}
                            materialsCount={materialsByEventDate[`${ev.id}:${dateStr}`] || 0}
                            equipmentCount={equipmentByEventDate[`${ev.id}:${dateStr}`] || 0}
                            onClick={() => handleEventClick(ev.id)}
                            t={t}
                          />
                        ))}
                        {dayEvents.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 11, color: colors.textFaint }}>—</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showAddMaterialModal}
        onClose={() => setShowAddMaterialModal(false)}
        title={t('dashboard:add_material_equipment')}
        width={448}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.base, paddingTop: spacing['5xl'] }}>
            <Button variant="secondary" onClick={() => setShowAddMaterialModal(false)}>
              {t('dashboard:cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setSelectedDate(parseISO(materialDate));
                setShowAddMaterialModal(false);
              }}
            >
              {t('dashboard:go_to_day')}
            </Button>
          </div>
        }
      >
        <div>
          <label style={{ display: 'block', fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textSecondary, marginBottom: spacing.sm, fontFamily: fonts.body }}>
            {t('dashboard:select_date_modal')}
          </label>
          <DatePicker value={materialDate} onChange={setMaterialDate} />
        </div>
      </Modal>

      {selectedDate && (
        <DayDetailsModal
          date={selectedDate}
          events={filteredEvents.filter(event => {
            const eventStart = parseISO(event.start_date);
            const eventEnd = parseISO(event.end_date);
            return selectedDate >= eventStart && selectedDate <= eventEnd;
          })}
          equipment={filterEquipmentForDay(selectedDate)}
          onClose={() => {
            setSelectedDate(null);
            navigate('/calendar', { replace: true });
          }}
        />
      )}
    </div>
  );
};

export default Calendar;
