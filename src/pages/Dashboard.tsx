import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { format, addDays, parseISO, isWithinInterval } from 'date-fns';
import { enUS, pl } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronDown, ChevronUp, Wrench, Package, Truck } from 'lucide-react';
import PageInfoModal from '../components/PageInfoModal';
import DatePicker from '../components/DatePicker';
import {
  PageHeader,
  NavBtn,
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

const Dashboard = () => {
  const { t, i18n } = useTranslation(['dashboard', 'common', 'utilities', 'project']);
  const navigate = useNavigate();
  const companyId = useAuthStore(state => state.getCompanyId());
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const currentLocale = i18n.language === 'pl' ? pl : enUS;
  const [expandedSections, setExpandedSections] = useState<Record<string, Record<string, boolean>>>({});
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [materialDate, setMaterialDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));

  // Fetch events for today and tomorrow
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
    queryKey: ['dashboard_calendar_materials', companyId],
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
        .in('date', [format(today, 'yyyy-MM-dd'), format(tomorrow, 'yyyy-MM-dd')])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch calendar equipment
  const { data: calendarEquipment = [] } = useQuery({
    queryKey: ['dashboard_calendar_equipment', companyId],
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
        .in('date', [format(today, 'yyyy-MM-dd'), format(tomorrow, 'yyyy-MM-dd')])
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
    queryKey: ['dashboard_day_notes', companyId],
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
        .in('date', [format(today, 'yyyy-MM-dd'), format(tomorrow, 'yyyy-MM-dd')])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch tasks for the events
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

    const toggleSection = (eventId: string, section: 'materials' | 'equipment') => {
      setExpandedSections(prev => ({
        ...prev,
        [format(date, 'yyyy-MM-dd')]: {
          ...prev[format(date, 'yyyy-MM-dd')],
          [`${eventId}-${section}`]: !prev[format(date, 'yyyy-MM-dd')]?.[`${eventId}-${section}`]
        }
      }));
    };

    const isExpanded = (eventId: string, section: 'materials' | 'equipment') => {
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
          flex: '1 1 0',
          minWidth: layout.dayColumnMinWidth,
          maxWidth: layout.dayColumnMaxWidth,
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
              const eventTasks = tasks.filter(t => t.event_id === eventId);
              const eventMaterials = materialsByProject[eventId] || [];
              const eventEquipment = equipmentByProject[eventId] || [];

              return (
                <DashboardEventCard
                  key={eventId}
                  event={event}
                  eventTasks={eventTasks}
                  eventMaterials={eventMaterials}
                  eventEquipment={eventEquipment}
                  formatStatus={formatStatus}
                  getEventAccentColor={getEventAccentColor}
                  toggleSection={(s: 'materials' | 'equipment') => toggleSection(eventId, s)}
                  isExpanded={(s: 'materials' | 'equipment') => isExpanded(eventId, s)}
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
    eventTasks,
    eventMaterials,
    eventEquipment,
    formatStatus,
    getEventAccentColor,
    toggleSection,
    isExpanded,
    t,
    navigate,
  }: {
    event: any;
    eventTasks: any[];
    eventMaterials: any[];
    eventEquipment: any[];
    formatStatus: (s: string) => string;
    getEventAccentColor: (s: string) => string;
    toggleSection: (s: 'materials' | 'equipment') => void;
    isExpanded: (s: 'materials' | 'equipment') => boolean;
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
        {eventTasks.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', color: colors.textDim }}>
            <Wrench style={{ width: spacing["3xl"], height: spacing["3xl"], marginRight: spacing.sm }} />
            <span>{eventTasks.length} {t('dashboard:tasks')}</span>
          </div>
        )}
        {eventMaterials.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', color: colors.textDim }}>
            <Package style={{ width: spacing["3xl"], height: spacing["3xl"], marginRight: spacing.sm }} />
            <span>{eventMaterials.length} {t('dashboard:materials')}</span>
          </div>
        )}
        {eventEquipment.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', color: colors.textDim }}>
            <Truck style={{ width: spacing["3xl"], height: spacing["3xl"], marginRight: spacing.sm }} />
            <span>{eventEquipment.length} {t('dashboard:equipment')}</span>
          </div>
        )}
      </div>

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
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: colors.bgOverlay, borderRadius: radii.lg, padding: '4px 6px',
          border: `1px solid ${colors.borderDefault}`,
        }}>
          <NavBtn direction="left" />
          <span style={{ fontSize: 12, color: colors.textSubtle, fontFamily: fonts.body, fontWeight: 500, padding: '4px 10px', cursor: 'pointer' }}>
            {t('dashboard:this_week', 'Ten tydzień')}
          </span>
          <NavBtn direction="right" />
        </div>
        <Button variant="accent" color={colors.amber} icon="⏱" onClick={() => navigate('/user-hours')}>
          {t('dashboard:add_hours_progress')}
        </Button>
        <Button variant="accent" color={colors.accentBlue} icon="📦" onClick={() => setShowAddMaterialModal(true)}>
          {t('dashboard:order_material_equipment')}
        </Button>
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

      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
        <DayView 
          date={today} 
          dayEvents={events.filter(event => {
            const eventStart = parseISO(event.start_date);
            const eventEnd = parseISO(event.end_date);
            return isWithinInterval(today, { start: eventStart, end: eventEnd });
          })} 
        />
        <DayView 
          date={tomorrow} 
          dayEvents={events.filter(event => {
            const eventStart = parseISO(event.start_date);
            const eventEnd = parseISO(event.end_date);
            return isWithinInterval(tomorrow, { start: eventStart, end: eventEnd });
          })} 
        />
      </div>

      {/* Order Material & Equipment Modal */}
      <Modal
        open={showAddMaterialModal}
        onClose={() => setShowAddMaterialModal(false)}
        title={t('dashboard:order_material_equipment')}
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
