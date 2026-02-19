import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { format, addDays, parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { enUS, pl } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Clock, Package, AlertCircle, ChevronDown, ChevronUp, Wrench, Plus } from 'lucide-react';

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
  const { data: equipmentUsage = [] } = useQuery({
    queryKey: ['dashboard_equipment', companyId],
    queryFn: async () => {
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
        .eq('company_id', companyId)
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
      if (events.length === 0) return [];

      const { data, error } = await supabase
        .from('tasks_done')
        .select('*')
        .eq('company_id', companyId)
        .in('event_id', events.map(e => e.id));

      if (error) throw error;
      return data;
    },
    enabled: events.length > 0 && !!companyId
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned':
        return 'bg-gray-100 text-gray-800';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'finished':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
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

    // Group materials by project
    const materialsByProject = dayMaterials.reduce((acc: Record<string, any[]>, material) => {
      const eventId = material.event_id;
      if (!acc[eventId]) {
        acc[eventId] = [];
      }
      acc[eventId].push(material);
      return acc;
    }, {});

    // Group equipment by project
    const equipmentByProject = dayEquipment.reduce((acc: Record<string, any[]>, equipment) => {
      const eventId = equipment.event_id;
      if (!acc[eventId]) {
        acc[eventId] = [];
      }
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

    const handleCalendarClick = () => {
      // Navigate to calendar with date parameter
      navigate(`/calendar?date=${format(date, 'yyyy-MM-dd')}`);
    };

    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div 
          onClick={handleCalendarClick}
          className="flex items-center justify-between mb-6 cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors group"
        >
          <div className="flex items-center">
            <CalendarIcon className="w-6 h-6 text-blue-600 mr-3 group-hover:scale-110 transition-transform" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                {format(date, "EEEE", { locale: currentLocale })}
              </h2>
              <p className="text-gray-600">
                {format(date, "MMMM d, yyyy", { locale: currentLocale })}
              </p>
            </div>
          </div>
          <div className="text-sm text-gray-600">
            {dayEvents.length} {t('dashboard:events')}
          </div>
        </div>

        <div className="space-y-6">
          {/* Events Section */}
          <div className="space-y-4">
            {dayEvents.map(event => {
              const eventTasks = tasks.filter(t => t.event_id === event.id);
              const eventMaterials = materialsByProject[event.id] || [];
              const eventEquipment = equipmentByProject[event.id] || [];

              return (
                <div
                  key={event.id}
                  onClick={() => navigate(`/events/${event.id}`)}
                  className="bg-gray-50 p-4 rounded-lg hover:bg-gray-100 cursor-pointer transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-lg text-blue-600 hover:text-blue-800">
                        {event.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(event.status)}`}>
                        {formatStatus(event.status)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    {eventTasks.length > 0 && (
                      <div className="flex items-center text-gray-600">
                        <Wrench className="w-4 h-4 mr-2" />
                        <span>{eventTasks.length} {t('dashboard:tasks')}</span>
                      </div>
                    )}
                    {(eventMaterials.length > 0 || eventEquipment.length > 0) && (
                      <div className="flex items-center text-gray-600">
                        <Package className="w-4 h-4 mr-2" />
                        <span>
                          {eventMaterials.length > 0 && `${eventMaterials.length} ${t('dashboard:materials')}`}
                          {eventMaterials.length > 0 && eventEquipment.length > 0 && ', '}
                          {eventEquipment.length > 0 && `${eventEquipment.length} ${t('dashboard:equipment')}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Materials Section */}
                  {eventMaterials.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div 
                        className="flex items-center justify-between text-sm text-red-600 mb-2 cursor-pointer rounded-md p-2 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSection(event.id, 'materials');
                        }}
                      >
                        <div className="flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          <span>{t('dashboard:required_materials')}</span>
                        </div>
                        {isExpanded(event.id, 'materials') ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                      {isExpanded(event.id, 'materials') && (
                        <div className="space-y-2">
                          {eventMaterials.map(material => (
                            <div key={material.id} className="bg-white p-2 rounded-md text-sm">
                              <div className="flex justify-between">
                                <span className="font-medium">
                                  {material.material} - {material.quantity} {material.unit}
                                </span>
                                {material.notes && (
                                  <span className="text-red-600 text-xs">
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

                  {/* Required Equipment Section */}
                  {eventEquipment.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div 
                        className="flex items-center justify-between text-sm text-amber-600 mb-2 cursor-pointer rounded-md p-2 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSection(event.id, 'equipment');
                        }}
                      >
                        <div className="flex items-center">
                          <Wrench className="w-4 h-4 mr-1" />
                          <span>{t('dashboard:required_equipment')}</span>
                        </div>
                        {isExpanded(event.id, 'equipment') ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                      {isExpanded(event.id, 'equipment') && (
                        <div className="space-y-2">
                          {eventEquipment.map(equipment => (
                            <div key={equipment.id} className="bg-white p-2 rounded-md text-sm">
                              <div className="flex justify-between">
                                <span className="font-medium">
                                  {equipment.equipment?.name} - {equipment.quantity} {equipment.quantity > 1 ? t('dashboard:units') : t('dashboard:unit')}
                                </span>
                                {equipment.notes && (
                                  <span className="text-amber-600 text-xs">
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
                </div>
              );
            })}

            {dayEvents.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>{t('dashboard:no_events_scheduled')}</p>
              </div>
            )}
          </div>

          {/* Day Notes Section */}
          {dayNotesForDate.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-700">
              <h3 className="text-lg font-semibold text-gray-100 mb-4">{t('dashboard:day_notes')}</h3>
              <div className="space-y-3">
                {dayNotesForDate.map(note => (
                  <div key={note.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-400">
                          {note.events?.title || t('dashboard:unknown_event')}
                        </p>
                        <p className="text-gray-100 mt-2">{note.content}</p>
                        <p className="text-xs text-gray-400 mt-2">
                          {t('dashboard:by')} {note.profiles?.full_name} • {format(new Date(note.created_at), 'MMM d, h:mm a', { locale: currentLocale })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8 flex items-center justify-between md:flex-row flex-col">
        <h1 className="text-3xl font-bold text-gray-900">{t('dashboard:title')}</h1>
        <div className="flex gap-4 md:flex-row flex-col md:w-auto w-full">
          <button
            className="md:flex hidden items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            onClick={() => navigate('/user-hours')}
          >
            {t('dashboard:add_hours_progress')}
          </button>
          <button
            className="md:flex hidden items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            onClick={() => setShowAddMaterialModal(true)}
          >
            {t('dashboard:order_material_equipment')}
          </button>
        </div>
      </div>

      {/* Mobile Buttons */}
      <div className="md:hidden flex flex-col gap-2 mb-6">
        <button
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          onClick={() => navigate('/user-hours')}
        >
          {t('dashboard:add_hours_progress')}
        </button>
        <button
          className="w-full flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          onClick={() => setShowAddMaterialModal(true)}
        >
          {t('dashboard:order_material_equipment')}
        </button>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
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
      {showAddMaterialModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-semibold">{t('dashboard:order_material_equipment')}</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('dashboard:select_date')}
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
                  navigate(`/calendar?date=${materialDate}`);
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
    </div>
  );
};

export default Dashboard;
