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
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Database } from '../lib/database.types';
import BackButton from '../components/BackButton';
import DayDetailsModal from '../components/DayDetailsModal';

type Event = Database['public']['Tables']['events']['Row'];

const Calendar = () => {
  const { t } = useTranslation(['common', 'dashboard', 'utilities', 'project']);
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

  const statusColors = {
    planned: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    finished: 'bg-green-100 text-green-800'
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
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <BackButton />
      <div className="flex justify-between items-center mb-6 md:flex-row flex-col">
        <h1 className="text-2xl font-bold text-gray-900">{t('dashboard:calendar_title')}</h1>
        <button
          onClick={() => setShowAddMaterialModal(true)}
          className="md:flex hidden items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t('dashboard:order_material_equipment')}
        </button>
      </div>

      {/* Mobile Button */}
      <button
        onClick={() => setShowAddMaterialModal(true)}
        className="md:hidden w-full mb-6 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        {t('dashboard:order_material_equipment')}
      </button>

      {/* Status Filter */}
      <div className="flex space-x-4 mb-6">
        {(['planned', 'scheduled', 'in_progress'] as const).map(status => (
          <button
            key={status}
            onClick={() => setSelectedStatus(selectedStatus === status ? null : status)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              selectedStatus === status ? statusColors[status] : 'bg-gray-100 text-gray-600'
            }`}
          >
            {formatStatus(status)}
          </button>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors md:block hidden"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentDate(prev => {
                const newDate = subDays(prev, 7);
                return newDate;
              })}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors md:hidden"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold">
              <span className="md:inline hidden">{format(currentDate, 'MMMM yyyy')}</span>
              <span className="md:hidden">
                {format(currentWeekStart, 'MMM d')} - {format(currentWeekEnd, 'MMM d, yyyy')}
              </span>
            </h2>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors md:block hidden"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentDate(prev => {
                const newDate = addDays(prev, 7);
                return newDate;
              })}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors md:hidden"
            >
              <ChevronRight className="w-5 h-5" />
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
              <div key={day} className="text-center font-medium text-gray-500 pb-4">
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

                  return (
                    <div
                      key={date.toISOString()}
                      onClick={() => setSelectedDate(date)}
                      className={`min-h-[120px] p-4 border rounded-lg cursor-pointer transition-all ${
                        !isSameMonth(date, currentDate)
                          ? 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                          : isToday(date)
                          ? 'bg-white border-blue-400 hover:bg-gray-50'
                          : isSelected
                          ? 'bg-blue-100 border-blue-300'
                          : 'bg-white hover:bg-gray-50'
                      } ${
                        isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                      }`}
                    >
                      <div className={`font-medium mb-2 flex items-center ${
                        !isSameMonth(date, currentDate)
                          ? 'text-gray-400'
                          : isToday(date)
                          ? 'text-blue-600'
                          : 'text-gray-900'
                      }`}>
                        {format(date, 'd')}
                        {isToday(date) && (
                          <span className="ml-2 w-2 h-2 rounded-full bg-blue-500"></span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {dayEvents.map(event => (
                          <button
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEventClick(event.id);
                            }}
                            className={`w-full text-left px-3 py-2 rounded text-sm font-medium ${statusColors[event.status]}`}
                          >
                            <span className="block truncate">{event.title}</span>
                          </button>
                        ))}
                        {dayEquipment.length > 0 && (
                          <div className={`text-xs ${
                            !isSameMonth(date, currentDate)
                              ? 'text-gray-400'
                              : 'text-gray-500'
                          }`}>
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

              return (
                <div
                  key={date.toISOString()}
                  onClick={() => setSelectedDate(date)}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    isToday(date)
                      ? 'bg-white border-blue-400'
                      : isSelected
                      ? 'bg-blue-100 border-blue-300'
                      : 'bg-white'
                  } ${
                    isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`font-medium flex items-center ${
                      isToday(date)
                        ? 'text-blue-600'
                        : 'text-gray-900'
                    }`}>
                      <span className="text-lg">{getDayAbbreviation(date)}</span>
                      <span className="ml-2">{format(date, 'd')}</span>
                      {isToday(date) && (
                        <span className="ml-2 w-2 h-2 rounded-full bg-blue-500"></span>
                      )}
                    </div>
                    {dayEquipment.length > 0 && (
                      <div className="text-xs text-gray-500">
                        {dayEquipment.length} {t('dashboard:equipment_in_use')}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {dayEvents.map(event => (
                      <button
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEventClick(event.id);
                        }}
                        className={`w-full text-left px-3 py-2 rounded text-sm font-medium ${statusColors[event.status]}`}
                      >
                        <span className="block truncate">{event.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Material & Equipment Modal */}
      {showAddMaterialModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-semibold">{t('dashboard:add_material_equipment')}</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('dashboard:select_date_modal')}
              </label>
              <input
                type="date"
                value={materialDate}
                onChange={(e) => setMaterialDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={() => setShowAddMaterialModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 rounded-md"
              >
                {t('dashboard:cancel')}
              </button>
              <button
                onClick={() => {
                  setSelectedDate(parseISO(materialDate));
                  setShowAddMaterialModal(false);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t('dashboard:go_to_day')}
              </button>
            </div>
          </div>
        </div>
      )}

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
