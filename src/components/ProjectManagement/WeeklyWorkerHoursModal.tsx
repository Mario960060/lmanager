import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { colors } from '../../themes/designTokens';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { format, startOfWeek, endOfWeek, subDays, subWeeks, isSameDay, eachWeekOfInterval } from 'date-fns';
import { pl } from 'date-fns/locale';
import { X, Search, Clock, Calendar, CheckCircle, AlertCircle, User, ChevronDown, ChevronUp, Calendar as CalendarIcon } from 'lucide-react';
import DatePicker from '../DatePicker';

interface WorkerHoursModalProps {
  onClose: () => void;
}

type TaskProgressEntry = {
  hours_spent: number;
  created_at: string;
  tasks_done: {
    name: string;
    amount: number | null;
  };
  events: {
    id: string;
    title: string;
  };
};

type AdditionalTaskEntry = {
  hours_spent: number;
  created_at: string;
  task_id: string;
  additional_tasks: {
    description: string;
    events: {
      id: string;
      title: string;
    };
  } | null;
};

const WeeklyWorkerHoursModal: React.FC<WorkerHoursModalProps> = ({ onClose }) => {
  const { t, i18n } = useTranslation(['common', 'form', 'utilities', 'event']);
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const [workerName, setWorkerName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'current' | 'last'>('current');
  const [selectedTimeRange, setSelectedTimeRange] = useState<'preset' | 'single' | 'weekly' | 'range'>('preset');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);



  // Get current week (Friday to Thursday)
  const currentFriday = subDays(new Date(), (new Date().getDay() + 2) % 7);
  const startOfCurrentWeek = startOfWeek(currentFriday, { weekStartsOn: 5 });
  const endOfCurrentWeek = endOfWeek(currentFriday, { weekStartsOn: 5 });

  // Get last week
  const lastFriday = subWeeks(currentFriday, 1);
  const startOfLastWeek = startOfWeek(lastFriday, { weekStartsOn: 5 });
  const endOfLastWeek = endOfWeek(lastFriday, { weekStartsOn: 5 });

  // Calculate date range based on selection
  let startDate: Date, endDate: Date;
  
  if (selectedTimeRange === 'preset') {
    startDate = timeRange === 'current' ? startOfCurrentWeek : startOfLastWeek;
    endDate = timeRange === 'current' ? endOfCurrentWeek : endOfLastWeek;
  } else if (selectedTimeRange === 'single' && selectedDate) {
    startDate = new Date(selectedDate);
    endDate = new Date(selectedDate);
  } else if (selectedTimeRange === 'range' && dateRange.start && dateRange.end) {
    startDate = new Date(dateRange.start);
    endDate = new Date(dateRange.end);
  } else {
    // Default fallback
    startDate = startOfCurrentWeek;
    endDate = endOfCurrentWeek;
  }

  // Fetch all workers
  const { data: workers = [], isLoading: isLoadingWorkers } = useQuery({
    queryKey: ['workers', workerName],
    queryFn: async () => {
      const companyId = useAuthStore.getState().getCompanyId();
      
      if (!companyId) return [];
      
      let query = supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('company_id', companyId)
        .order('full_name');
      
      // Apply search filter only if search term is provided
      if (workerName) {
        query = query.ilike('full_name', `%${workerName}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    }
  });

  // Fetch worker hours
  const { data: workerHours = [], isLoading: isLoadingHours } = useQuery({
    queryKey: ['worker_hours', selectedUserId, startDate, endDate, selectedTimeRange, selectedDate, selectedWeek, dateRange],
    queryFn: async () => {
      if (!selectedUserId) return [];

      // First query - keep exactly as is
      const { data, error } = await supabase
        .from('task_progress_entries')
        .select(`
          hours_spent,
          created_at,
          tasks_done (
            name,
            amount
          ),
          events (
            id,
            title
          )
        `)
        .eq('user_id', selectedUserId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Second query - fetch additional task progress
      const { data: additionalData, error: additionalError } = await supabase
        .from('additional_task_progress_entries')
        .select(`
          hours_spent,
          created_at,
          task_id,
          additional_tasks!task_id (
            description,
            events!inner (
              id,
              title
            )
          )
        `)
        .eq('user_id', selectedUserId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (additionalError) throw additionalError;

      // Transform additional data to match the structure
      const transformedAdditional = (additionalData || []).map((entry: any): TaskProgressEntry => ({
        hours_spent: entry.hours_spent,
        created_at: entry.created_at,
        tasks_done: {
          name: entry.additional_tasks?.description || t('event:additional_task'),
          amount: null
        },
        events: entry.additional_tasks?.events || { id: 'unknown', title: t('event:unknown_event') }
      }));

      // Return combined data
      return [...(data || []), ...transformedAdditional] as TaskProgressEntry[];
    },
    enabled: !!selectedUserId && (
      selectedTimeRange === 'preset' ||
      (selectedTimeRange === 'single' && !!selectedDate) ||
      (selectedTimeRange === 'range' && !!dateRange.start && !!dateRange.end)
    )
  });

  // Group hours by event and then by day
  const hoursByEvent = workerHours.reduce((acc: any, entry) => {
    const eventId = entry.events?.id;
    if (!eventId) return acc;

    if (!acc[eventId]) {
      acc[eventId] = {
        eventTitle: entry.events.title,
        totalHours: 0,
        tasks: {},
        dailyBreakdown: {}
      };
    }

    const entryDate = new Date(entry.created_at);
    const dateKey = format(entryDate, 'yyyy-MM-dd');
    
    // Initialize daily breakdown if not exists
    if (!acc[eventId].dailyBreakdown[dateKey]) {
      acc[eventId].dailyBreakdown[dateKey] = {
        date: entryDate,
        hours: 0,
        tasks: {}
      };
    }

    acc[eventId].totalHours += entry.hours_spent;
    acc[eventId].dailyBreakdown[dateKey].hours += entry.hours_spent;

    const taskName = entry.tasks_done?.name || t('common:unknown_task');
    
    // Update total tasks
    if (!acc[eventId].tasks[taskName]) {
      acc[eventId].tasks[taskName] = 0;
    }
    acc[eventId].tasks[taskName] += entry.hours_spent;

    // Update daily tasks
    if (!acc[eventId].dailyBreakdown[dateKey].tasks[taskName]) {
      acc[eventId].dailyBreakdown[dateKey].tasks[taskName] = 0;
    }
    acc[eventId].dailyBreakdown[dateKey].tasks[taskName] += entry.hours_spent;

    return acc;
  }, {});

  // State for expanded sections
  const [expandedEvents, setExpandedEvents] = useState<{[key: string]: boolean}>({});

  const toggleEventExpansion = (eventId: string) => {
    setExpandedEvents(prev => ({
      ...prev,
      [eventId]: !prev[eventId]
    }));
  };

  // Calculate total hours across all events
  const totalHours = Object.values(hoursByEvent).reduce((sum: number, event: any) => sum + event.totalHours, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-0 md:p-4">
      <div className="rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col" style={{ backgroundColor: colors.bgCard }}>
        <div className="flex justify-between items-center px-3 py-3 md:p-6 border-b flex-none">
          <h2 className="text-xl font-semibold">{t('event:weekly_worker_hours_title')}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-3 py-3 md:p-6 overflow-y-auto flex-1">
          {/* Time Range Selection - Stays at top */}
          <div className="sticky top-0 z-10 pb-4 mb-4 border-b" style={{ backgroundColor: colors.bgCard, borderColor: colors.borderDefault }}>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:select_time_range')}</label>
              {selectedUserId && (
                <p className="text-sm" style={{ color: colors.textSubtle }}>
                  {t('event:total_hours_label')} {totalHours}
                </p>
              )}
            </div>
            
            {/* Time Range Type Selection */}
            <div className="flex space-x-4 mb-4">
              <button
                onClick={() => {
                  setSelectedTimeRange('single');
                  setTimeRange('current');
                  setSelectedWeek('');
                  setDateRange({ start: '', end: '' });
                }}
                className="px-4 py-2 rounded-lg"
                style={selectedTimeRange === 'single' ? { backgroundColor: colors.bgElevated, color: colors.textOnAccent } : { backgroundColor: colors.bgSubtle }}
              >
                {t('event:single_day_button')}
              </button>
              <button
                onClick={() => {
                  setSelectedTimeRange('preset');
                  setTimeRange('current');
                  setSelectedDate('');
                  setSelectedWeek('');
                  setDateRange({ start: '', end: '' });
                }}
                className="px-4 py-2 rounded-lg"
                style={selectedTimeRange === 'preset' && timeRange === 'current' ? { backgroundColor: colors.bgElevated, color: colors.textOnAccent } : { backgroundColor: colors.bgSubtle }}
              >
                {t('event:this_week_button')}
              </button>
              <button
                onClick={() => {
                  setSelectedTimeRange('preset');
                  setTimeRange('last');
                  setSelectedDate('');
                  setSelectedWeek('');
                  setDateRange({ start: '', end: '' });
                }}
                className="px-4 py-2 rounded-lg"
                style={selectedTimeRange === 'preset' && timeRange === 'last' ? { backgroundColor: colors.bgElevated, color: colors.textOnAccent } : { backgroundColor: colors.bgSubtle }}
              >
                {t('event:last_week_button')}
              </button>
              <button
                onClick={() => {
                  setSelectedTimeRange('range');
                  setTimeRange('current');
                  setSelectedDate('');
                  setSelectedWeek('');
                }}
                className="px-4 py-2 rounded-lg"
                style={selectedTimeRange === 'range' ? { backgroundColor: colors.bgElevated, color: colors.textOnAccent } : { backgroundColor: colors.bgSubtle }}
              >
                {t('event:date_range_label')}
              </button>
            </div>

            {/* Single Day Selection */}
            {selectedTimeRange === 'single' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>{t('event:select_date_label')}</label>
                <div className="relative">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="block w-full rounded-md shadow-sm pr-10"
                    style={{ borderColor: colors.borderDefault }}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-blue-500 pointer-events-none"></span>
                </div>
              </div>
            )}



            {/* Date Range Selection */}
            {selectedTimeRange === 'range' && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>{t('event:start_date_button')}</label>
                  <DatePicker
                    value={dateRange.start}
                    onChange={(v) => setDateRange(prev => ({ ...prev, start: v }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>{t('event:end_date_button')}</label>
                  <DatePicker
                    value={dateRange.end}
                    onChange={(v) => setDateRange(prev => ({ ...prev, end: v }))}
                    minDate={dateRange.start}
                  />
                </div>
              </div>
            )}

            <div className="mt-2 flex items-center text-sm" style={{ color: colors.textMuted }}>
              <Calendar className="w-4 h-4 mr-1" />
              <span>
                {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
              </span>
            </div>
          </div>

          {/* Success message */}
          {successMessage && (
            <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center">
              <CheckCircle className="w-5 h-5 mr-2" />
              {successMessage}
            </div>
          )}

          {/* Error message */}
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {errorMessage}
            </div>
          )}

          {/* Worker Search */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:worker_name_label')}</label>
              <p className="text-sm" style={{ color: colors.textSubtle }}>
                {t('event:total_workers_label')} {workers.length}
              </p>
            </div>
            <div className="mt-1 relative">
              <input
                type="text"
                value={workerName}
                onChange={(e) => {
                  setWorkerName(e.target.value);
                  setSelectedUserId(null);
                }}
                className="block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
                placeholder={t('event:search_worker_placeholder')}
              />
              <Search className="absolute right-3 top-2.5 h-5 w-5" style={{ color: colors.textSubtle }} />
            </div>
          </div>

          {/* Workers List */}
          <div className="mb-6">
            {isLoadingWorkers ? (
              <p className="text-center py-4">{t('event:loading_workers')}</p>
            ) : workers.length === 0 ? (
              <p className="text-center py-4">{t('event:no_workers_found_weekly')}</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {workers.map(worker => (
                  <div
                    key={worker.id}
                    onClick={() => {
                      setSelectedUserId(worker.id === selectedUserId ? null : worker.id);
                      if (worker.id !== selectedUserId) {
                        setWorkerName(worker.full_name);
                      }
                    }}
                    className="p-3 rounded-lg cursor-pointer border transition-all"
                    style={worker.id === selectedUserId
                      ? { backgroundColor: colors.bgElevated, borderColor: colors.bgCard, color: colors.textOnAccent }
                      : { backgroundColor: colors.bgSubtle, borderColor: colors.borderLight }}
                  >
                    <div className="flex items-center">
                      <User className="w-5 h-5 mr-2" style={{ color: worker.id === selectedUserId ? colors.textMuted : colors.textSubtle }} />
                      <div>
                        <p className="font-medium">{worker.full_name}</p>
                        {worker.role && <p className="text-xs" style={{ color: worker.id === selectedUserId ? colors.textMuted : colors.textSubtle }}>{t('event:role_suffix')} {worker.role}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hours Display */}
          {selectedUserId && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium border-b pb-2">{t('event:hours_report')}</h3>
              {isLoadingHours ? (
                <p className="text-center py-4">{t('event:loading_hours_data')}</p>
              ) : Object.keys(hoursByEvent).length === 0 ? (
                <div className="text-center py-6 rounded-lg" style={{ backgroundColor: colors.bgSubtle }}>
                  <Clock className="w-12 h-12 mx-auto mb-2" style={{ color: colors.textSubtle }} />
                  <p style={{ color: colors.textMuted }}>{t('event:no_hours_recorded')}</p>
                </div>
              ) : (
                Object.entries(hoursByEvent).map(([eventId, eventData]: [string, any]) => (
                  <div key={eventId} className="p-4 rounded-lg" style={{ backgroundColor: colors.bgSubtle }}>
                    <div 
                      className="flex justify-between items-center cursor-pointer"
                      onClick={() => toggleEventExpansion(eventId)}
                    >
                      <div>
                    <h3 className="font-medium text-lg" style={{ color: colors.textSecondary }}>{eventData.eventTitle}</h3>
                    <p className="mt-1" style={{ color: colors.textMuted }}>
                      <span className="font-semibold" style={{ color: colors.textSecondary }}>{eventData.totalHours.toFixed(2)}</span> {t('event:hours_text')}
                    </p>
                      </div>
                      {expandedEvents[eventId] ? (
                        <ChevronUp className="w-5 h-5" style={{ color: colors.textSubtle }} />
                      ) : (
                        <ChevronDown className="w-5 h-5" style={{ color: colors.textSubtle }} />
                      )}
                    </div>
                    
                    {expandedEvents[eventId] && (
                      <>
                    <div className="mt-4 space-y-2">
                      <h4 className="font-medium" style={{ color: colors.textSecondary }}>{t('event:tasks_breakdown')}</h4>
                      {Object.entries(eventData.tasks).map(([taskName, hours]: [string, any]) => (
                        <div key={taskName} className="flex justify-between text-sm">
                          <span>{taskName}</span>
                          <span className="font-medium">{hours.toFixed(2)} {t('event:hours_text')}</span>
                        </div>
                      ))}
                    </div>

                        <div className="mt-6 space-y-4">
                          <h4 className="font-medium" style={{ color: colors.textSecondary }}>{t('event:daily_breakdown')}</h4>
                          {Object.entries(eventData.dailyBreakdown)
                            .sort(([dateA], [dateB]) => new Date(dateB).getTime() - new Date(dateA).getTime())
                            .map(([dateKey, dayData]: [string, any]) => (
                              <div key={dateKey} className="border-l-2 pl-3" style={{ borderColor: colors.borderDefault }}>
                                <div className="font-medium text-sm" style={{ color: colors.textMuted }}>
                                  {format(new Date(dayData.date), 'EEEE, MMM d', { locale: dateLocale })}
                                  <span className="ml-2 font-normal">
                                    ({dayData.hours.toFixed(2)} {t('event:hours_text')})
                                  </span>
                                </div>
                                <div className="mt-2 space-y-1">
                                  {Object.entries(dayData.tasks).map(([taskName, hours]: [string, any]) => (
                                    <div key={taskName} className="flex justify-between text-sm" style={{ color: colors.textSubtle }}>
                                      <span>{taskName}</span>
                                      <span>{hours.toFixed(2)} {t('event:hours_text')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeeklyWorkerHoursModal;
