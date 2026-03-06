import React, { useState, useEffect } from 'react';
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
  isFuture,
  isAfter,
  subDays,
  addDays
} from 'date-fns';
import { pl } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import PageInfoModal from '../components/PageInfoModal';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Database } from '../lib/database.types';
import BackButton from '../components/BackButton';
import DayDetailsModal from '../components/DayDetailsModal';
import DatePicker from '../components/DatePicker';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../themes/designTokens';
import { Button, Card, Modal, ChipToggle } from '../themes/uiComponents';

type Event = Database['public']['Tables']['events']['Row'];

const Calendar = () => {
  const { t, i18n } = useTranslation(['common', 'dashboard', 'utilities', 'project']);
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedStatus, setSelectedStatus] = useState<Event['status'] | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [materialDate, setMaterialDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const companyId = useAuthStore(state => state.getCompanyId());

  // Get date from URL parameter
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const parsedDate = parseISO(dateParam);
      setSelectedDate(parsedDate);
      setCurrentDate(parsedDate); // Set current month to show the selected date
    }
  }, [searchParams]);

  // Fetch events from Supabase
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('company_id', companyId)
        .neq('status', 'finished') // Exclude finished events
        .order('start_date', { ascending: true });

      if (error) throw error;
      return data as Event[];
    },
    enabled: !!companyId
  });

  // Fetch equipment usage
  const { data: equipmentUsage = [] } = useQuery({
    queryKey: ['equipment_usage', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_usage')
        .select(`
          *,
          equipment (
            id,
            name
          ),
          events (
            id,
            status
          )
        `)
        .eq('company_id', companyId);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Filter events by selected status
  const filteredEvents = events.filter(event => {
    // Skip events with invalid dates
    if (!event.start_date || !event.end_date) return false;

    // If a status filter is active, apply it
    if (selectedStatus && event.status !== selectedStatus) {
      return false;
    }

    return true;
  });

  const getStatusBgColor = (status: Event['status']) => {
    switch (status) {
      case 'scheduled': return colors.accentBlue;
      case 'in_progress': return colors.orange;
      case 'finished': return colors.green;
      case 'planned':
      default: return colors.textFaint;
    }
  };

  const formatStatus = (status: Event['status']) => {
    if (!status) return t('project:unknown');
    
    const statusKey = `project:status_${status.replace(/_/g, '_')}`;
    const translated = t(statusKey);
    
    // Fallback if translation key doesn't exist
    if (translated === statusKey) {
      return status.replace('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
    }
    return translated;
  };

  // Helper function to get translated day abbreviation
  const getDayAbbreviation = (date: Date) => {
    const dayOfWeek = date.getDay();
    // Map day of week (0 = Sunday) to our dashboard translation keys
    const dayKeys = [
      'dashboard:day_sunday',
      'dashboard:day_monday',
      'dashboard:day_tuesday',
      'dashboard:day_wednesday',
      'dashboard:day_thursday',
      'dashboard:day_friday',
      'dashboard:day_saturday'
    ];
    return t(dayKeys[dayOfWeek]);
  };

  const handleEventClick = (eventId: string) => {
    navigate(`/events/${eventId}`);
  };

  // Get days for the current month, starting from Monday
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  // Get weeks for the calendar
  const weeks = eachWeekOfInterval(
    { start: calendarStart, end: calendarEnd },
    { weekStartsOn: 1 }
  );

  // Get current week for mobile view
  const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const currentWeekDays = eachDayOfInterval({
    start: currentWeekStart,
    end: currentWeekEnd
  });

  // Filter equipment for a specific date
  const filterEquipmentForDay = (date: Date) => {
    return equipmentUsage.filter(usage => {
      if (!usage.start_date || !usage.end_date) return false;
      
      const start = parseISO(usage.start_date);
      const end = parseISO(usage.end_date);
      
      // Skip equipment from finished events
      if (usage.events?.status === 'finished') {
        return false;
      }
      
      // For active events, check if the equipment is scheduled for this date
      return date >= start && date <= end;
    });
  };

  // Loading spinner
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: fonts.body }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid ${colors.borderLight}`, borderTopColor: colors.accentBlue, animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const statusOptions = ['planned', 'scheduled', 'in_progress'] as const;

  return (
    <div style={{ padding: spacing["6xl"], maxWidth: 1600, margin: '0 auto', fontFamily: fonts.body }}>
      <BackButton />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing["6xl"], flexDirection: 'column' }} className="md:flex-row">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1 style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.bold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>{t('dashboard:calendar_title')}</h1>
          <PageInfoModal
            description={t('dashboard:calendar_info_description')}
            title={t('dashboard:calendar_info_title')}
            quickTips={[]}
          />
        </div>
        <Button variant="accent" color={colors.accentBlue} icon="📦" onClick={() => setShowAddMaterialModal(true)} className="md:flex hidden">
          {t('dashboard:order_material_equipment')}
        </Button>
      </div>

      {/* Mobile Button - compact, not full width */}
      <Button variant="accent" color={colors.accentBlue} icon="📦" onClick={() => setShowAddMaterialModal(true)} style={{ alignSelf: 'flex-start', marginBottom: spacing["6xl"] }} className="md:hidden">
        {t('dashboard:order_material_equipment')}
      </Button>

      {/* Status Filter */}
      <div style={{ marginBottom: spacing["6xl"] }}>
        <ChipToggle
          options={statusOptions.map(s => formatStatus(s))}
          value={selectedStatus ? formatStatus(selectedStatus) : ''}
          onChange={(val) => {
            const s = statusOptions.find(x => formatStatus(x) === val);
            setSelectedStatus(s && selectedStatus === s ? null : s || null);
          }}
        />
      </div>

      {/* Calendar Grid */}
      <Card style={{ overflow: 'hidden' }}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              style={{ padding: spacing.sm, borderRadius: radii.full, background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer' }}
              className="md:block hidden"
            >
              <ChevronLeft style={{ width: 20, height: 20 }} />
            </button>
            <button
              onClick={() => setCurrentDate(prev => subDays(prev, 7))}
              style={{ padding: spacing.sm, borderRadius: radii.full, background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer' }}
              className="md:hidden"
            >
              <ChevronLeft style={{ width: 20, height: 20 }} />
            </button>
            <h2 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary, margin: 0 }}>
              <span className="md:inline hidden">{format(currentDate, 'MMMM yyyy', { locale: dateLocale })}</span>
              <span className="md:hidden">
                {format(currentWeekStart, 'MMM d', { locale: dateLocale })} - {format(currentWeekEnd, 'MMM d, yyyy', { locale: dateLocale })}
              </span>
            </h2>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              style={{ padding: spacing.sm, borderRadius: radii.full, background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer' }}
              className="md:block hidden"
            >
              <ChevronRight style={{ width: 20, height: 20 }} />
            </button>
            <button
              onClick={() => setCurrentDate(prev => addDays(prev, 7))}
              style={{ padding: spacing.sm, borderRadius: radii.full, background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer' }}
              className="md:hidden"
            >
              <ChevronRight style={{ width: 20, height: 20 }} />
            </button>
          </div>

          {/* Desktop Calendar View */}
          <div className="md:grid hidden grid-cols-7 gap-4">
            {/* Day headers - Starting from Monday */}
            {[
              t('dashboard:day_monday'),
              t('dashboard:day_tuesday'),
              t('dashboard:day_wednesday'),
              t('dashboard:day_thursday'),
              t('dashboard:day_friday'),
              t('dashboard:day_saturday'),
              t('dashboard:day_sunday')
            ].map(day => (
              <div key={day} style={{ textAlign: 'center', fontWeight: fontWeights.medium, color: colors.textDim, paddingBottom: spacing['4xl'] }}>
                {day}
              </div>
            ))}

            {/* Calendar weeks */}
            {weeks.map(week => (
              <React.Fragment key={week.toISOString()}>
                {eachDayOfInterval({
                  start: startOfWeek(week, { weekStartsOn: 1 }),
                  end: endOfWeek(week, { weekStartsOn: 1 })
                }).map(date => {
                  const dayEvents = filteredEvents.filter(event => {
                    const eventStart = parseISO(event.start_date);
                    const eventEnd = parseISO(event.end_date);
                    return date >= eventStart && date <= eventEnd;
                  });

                  const dayEquipment = filterEquipmentForDay(date);
                  const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;

                  const isOtherMonth = !isSameMonth(date, currentDate);
                  const dayCellStyle: React.CSSProperties = {
                    minHeight: 120, padding: spacing['4xl'], border: `1px solid ${
                      isOtherMonth ? colors.borderSubtle : isToday(date) ? colors.accentBlue : isSelected ? colors.accentBlueBorder : colors.borderDefault
                    }`, borderRadius: radii.lg, cursor: 'pointer', transition: 'all 0.2s ease',
                    background: isOtherMonth ? colors.bgSubtle : isToday(date) ? colors.accentBlueBg : isSelected ? colors.accentBlueBg : colors.bgCard,
                    boxShadow: isSelected ? `0 0 0 2px ${colors.accentBlue}` : undefined,
                  };
                  const dayNumColor = isOtherMonth ? colors.textFaint : isToday(date) ? colors.accentBlue : colors.textPrimary;

                  return (
                    <div key={date.toISOString()} onClick={() => setSelectedDate(date)} style={dayCellStyle}>
                      <div style={{ fontWeight: fontWeights.medium, marginBottom: spacing.sm, display: 'flex', alignItems: 'center', color: dayNumColor }}>
                        {format(date, 'd')}
                        {isToday(date) && (
                          <span style={{ marginLeft: spacing.sm, width: 8, height: 8, borderRadius: '50%', background: colors.accentBlue }} />
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                        {dayEvents.map(event => (
                          <button
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEventClick(event.id);
                            }}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: `${spacing.sm} ${spacing.base}`,
                              borderRadius: radii.lg,
                              fontSize: fontSizes.base,
                              fontWeight: fontWeights.medium,
                              background: getStatusBgColor(event.status),
                              color: '#fff',
                              border: 'none',
                              cursor: 'pointer',
                              fontFamily: fonts.body,
                            }}
                          >
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</span>
                          </button>
                        ))}
                        {dayEquipment.length > 0 && (
                          <div style={{ fontSize: fontSizes.xs, color: isOtherMonth ? colors.textFaint : colors.textDim }}>
                            {dayEquipment.length} {t('dashboard:equipment_in_use')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Mobile Calendar View - 7 Days */}
          <div className="md:hidden grid grid-cols-1 gap-4">
            {/* Day headers and content combined for mobile */}
            {currentWeekDays.map(date => {
              const dayEvents = filteredEvents.filter(event => {
                const eventStart = parseISO(event.start_date);
                const eventEnd = parseISO(event.end_date);
                return date >= eventStart && date <= eventEnd;
              });

              const dayEquipment = filterEquipmentForDay(date);
              const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;

              const mobileCellStyle: React.CSSProperties = {
                padding: spacing['4xl'], border: `1px solid ${isToday(date) ? colors.accentBlue : isSelected ? colors.accentBlueBorder : colors.borderDefault}`,
                borderRadius: radii.lg, cursor: 'pointer', transition: 'all 0.2s ease',
                background: isToday(date) ? colors.accentBlueBg : isSelected ? colors.accentBlueBg : colors.bgCard,
                boxShadow: isSelected ? `0 0 0 2px ${colors.accentBlue}` : undefined,
              };
              return (
                <div key={date.toISOString()} onClick={() => setSelectedDate(date)} style={mobileCellStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
                    <div style={{ fontWeight: fontWeights.medium, display: 'flex', alignItems: 'center', color: isToday(date) ? colors.accentBlue : colors.textPrimary }}>
                      <span className="text-lg">{getDayAbbreviation(date)}</span>
                      <span className="ml-2">{format(date, 'd')}</span>
                      {isToday(date) && (
                        <span className="ml-2 w-2 h-2 rounded-full bg-blue-500"></span>
                      )}
                    </div>
                    {dayEquipment.length > 0 && (
                      <div style={{ fontSize: fontSizes.xs, color: colors.textDim }}>
                        {dayEquipment.length} {t('dashboard:equipment_in_use')}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                    {dayEvents.map(event => (
                      <button
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEventClick(event.id);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: `${spacing.sm} ${spacing.base}`,
                          borderRadius: radii.lg,
                          fontSize: fontSizes.base,
                          fontWeight: fontWeights.medium,
                          background: getStatusBgColor(event.status),
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: fonts.body,
                        }}
                      >
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Add Material & Equipment Modal */}
      <Modal
        open={showAddMaterialModal}
        onClose={() => setShowAddMaterialModal(false)}
        title={t('dashboard:add_material_equipment')}
        width={448}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.base, paddingTop: spacing["5xl"] }}>
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

      {/* Day Details Modal */}
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
            // Remove date parameter from URL when closing modal
            navigate('/calendar', { replace: true });
          }}
        />
      )}
    </div>
  );
};

export default Calendar;
