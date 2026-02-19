import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import Modal from './Modal';
import { ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { useAuthStore } from '../lib/store';
import { format, parseISO, addDays, subDays, isFriday, startOfDay, endOfDay, isToday, isSameDay, eachWeekOfInterval, startOfWeek, endOfWeek } from 'date-fns';

const getThisWeekRange = () => {
  const today = new Date();
  if (isFriday(today)) {
    return { start: startOfDay(today), end: endOfDay(today) };
  }
  // Find last Friday
  let d = new Date(today);
  while (d.getDay() !== 5) d = subDays(d, 1); // 5 = Friday
  return { start: startOfDay(d), end: endOfDay(today) };
};

const getLastWeekRange = () => {
  const today = new Date();
  // Find last Friday
  let lastFriday = new Date(today);
  while (lastFriday.getDay() !== 5) lastFriday = subDays(lastFriday, 1);
  // Find Friday 2 weeks ago
  let prevFriday = subDays(lastFriday, 7);
  // Last Thursday is day before lastFriday
  let lastThursday = subDays(lastFriday, 1);
  return { start: startOfDay(prevFriday), end: endOfDay(lastThursday) };
};

const CheckWeeklyHoursModal = ({ open, onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [tab, setTab] = useState('thisweek');
  const [selectedTimeRange, setSelectedTimeRange] = useState<'single' | 'weekly' | 'range' | 'preset'>('preset');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [weeks, setWeeks] = useState<{ start: Date; end: Date }[]>([]);
  const [expanded, setExpanded] = useState<{ [k: string]: boolean }>({});
  const [totalOpen, setTotalOpen] = useState(false);

  // Calculate weeks for the current year
  useEffect(() => {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);
    
    const weeksList = eachWeekOfInterval(
      { start: startOfYear, end: endOfYear },
      { weekStartsOn: 1 }
    ).map(weekStart => ({
      start: weekStart,
      end: endOfWeek(weekStart, { weekStartsOn: 1 })
    }));

    setWeeks(weeksList);
  }, []);

  // Calculate date range based on selection
  let startDate = '', endDate = '';
  
  if (selectedTimeRange === 'preset') {
    if (tab === 'today') {
      const today = new Date();
      startDate = format(today, 'yyyy-MM-dd');
      endDate = format(today, 'yyyy-MM-dd');
    } else if (tab === 'yesterday') {
      const yesterday = subDays(new Date(), 1);
      startDate = format(yesterday, 'yyyy-MM-dd');
      endDate = format(yesterday, 'yyyy-MM-dd');
    } else if (tab === 'thisweek') {
      const { start, end } = getThisWeekRange();
      startDate = format(start, 'yyyy-MM-dd');
      endDate = format(end, 'yyyy-MM-dd');
    } else if (tab === 'lastweek') {
      const { start, end } = getLastWeekRange();
      startDate = format(start, 'yyyy-MM-dd');
      endDate = format(end, 'yyyy-MM-dd');
    }
  } else if (selectedTimeRange === 'single') {
    startDate = selectedDate;
    endDate = selectedDate;
  } else if (selectedTimeRange === 'weekly' && selectedWeek) {
    const [start, end] = selectedWeek.split('|');
    startDate = start;
    endDate = end;
  } else if (selectedTimeRange === 'range') {
    startDate = dateRange.start;
    endDate = dateRange.end;
  }

  // Fetch all progress entries for this user
  const { data: taskEntries = [], isLoading: loading1 } = useQuery({
    queryKey: ['user_task_progress', user?.id, startDate, endDate],
    queryFn: async () => {
      if (!user?.id || !startDate || !endDate) return [];
      const { data, error } = await supabase
        .from('task_progress_entries')
        .select(`*, tasks_done (name, event_id)`)
        .eq('user_id', user.id)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!startDate && !!endDate
  });
  const { data: additionalEntries = [], isLoading: loading2 } = useQuery({
    queryKey: ['user_additional_task_progress', user?.id, startDate, endDate],
    queryFn: async () => {
      if (!user?.id || !startDate || !endDate) return [];
      const { data, error } = await supabase
        .from('additional_task_progress_entries')
        .select(`*, additional_tasks (description, event_id)`)
        .eq('user_id', user.id)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!startDate && !!endDate
  });

  // Group by project
  const grouped = useMemo(() => {
    const projects: { [eventId: string]: { name: string; entries: any[] } } = {};
    taskEntries.forEach(entry => {
      const eventId = entry.tasks_done?.event_id || 'unknown';
      if (!projects[eventId]) projects[eventId] = { name: '', entries: [] };
      projects[eventId].entries.push({ ...entry, type: 'regular' });
      if (entry.tasks_done?.name) projects[eventId].name = entry.tasks_done.name;
    });
    additionalEntries.forEach(entry => {
      const eventId = entry.additional_tasks?.event_id || 'unknown';
      if (!projects[eventId]) projects[eventId] = { name: '', entries: [] };
      projects[eventId].entries.push({ ...entry, type: 'additional' });
      if (entry.additional_tasks?.description) projects[eventId].name = entry.additional_tasks.description;
    });
    return projects;
  }, [taskEntries, additionalEntries]);

  // Total hours
  const totalHours = [...taskEntries, ...additionalEntries].reduce((sum, e) => sum + (e.hours_spent || 0), 0);

  // After grouping, collect all eventIds
  const eventIds = useMemo(() => Object.keys(grouped).filter(id => id !== 'unknown'), [grouped]);

  // Fetch project titles for all eventIds
  const { data: eventTitles = {} } = useQuery({
    queryKey: ['event_titles', eventIds],
    queryFn: async () => {
      if (eventIds.length === 0) return {};
      const { data, error } = await supabase
        .from('events')
        .select('id, title')
        .eq('company_id', companyId)
        .in('id', eventIds);
      if (error) throw error;
      const map = {};
      data.forEach(ev => { map[ev.id] = ev.title; });
      return map;
    },
    enabled: eventIds.length > 0
  });

  // After eventIds, collect all additional task IDs
  const additionalTaskIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(grouped).forEach(project => {
      project.entries.forEach(entry => {
        if (entry.type === 'additional' && entry.additional_tasks?.id) {
          ids.add(entry.additional_tasks.id);
        } else if (entry.type === 'additional' && entry.task_id) {
          ids.add(entry.task_id);
        }
      });
    });
    return Array.from(ids);
  }, [grouped]);

  // Fetch additional task descriptions for all additional task IDs
  const { data: additionalTaskDescriptions = {} } = useQuery({
    queryKey: ['additional_task_descriptions', additionalTaskIds],
    queryFn: async () => {
      if (additionalTaskIds.length === 0) return {};
      const { data, error } = await supabase
        .from('additional_tasks')
        .select('id, description')
        .in('id', additionalTaskIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      data.forEach(task => { map[task.id] = task.description; });
      return map;
    },
    enabled: additionalTaskIds.length > 0
  });

  // Group entries by date within each project
  const groupEntriesByDate = (entries: any[]) => {
    const groupedByDate: { [date: string]: any[] } = {};
    entries.forEach(entry => {
      const date = format(parseISO(entry.created_at), 'yyyy-MM-dd');
      if (!groupedByDate[date]) {
        groupedByDate[date] = [];
      }
      groupedByDate[date].push(entry);
    });
    return Object.entries(groupedByDate).sort(([a], [b]) => b.localeCompare(a)); // Sort dates in descending order
  };

  return (
    <Modal open={open} onClose={onClose} title={t('event:check_weekly_hours')}>
      {/* Time Range Type Selection */}
      <div className="mb-6">
        <div className="flex space-x-4 mb-4">
          <button
            onClick={() => {
              setSelectedTimeRange('preset');
              setSelectedDate('');
              setSelectedWeek('');
              setDateRange({ start: '', end: '' });
            }}
            className={`px-4 py-2 rounded-lg ${
              selectedTimeRange === 'preset' ? 'bg-gray-700 text-white' : 'bg-gray-100'
            }`}
          >
            {t('event:quick_select')}
          </button>
          <button
            onClick={() => {
              setSelectedTimeRange('single');
              setTab('');
              setSelectedWeek('');
              setDateRange({ start: '', end: '' });
            }}
            className={`px-4 py-2 rounded-lg ${
              selectedTimeRange === 'single' ? 'bg-gray-700 text-white' : 'bg-gray-100'
            }`}
          >
            {t('event:single_day')}
          </button>
          <button
            onClick={() => {
              setSelectedTimeRange('weekly');
              setTab('');
              setSelectedDate('');
              setDateRange({ start: '', end: '' });
            }}
            className={`px-4 py-2 rounded-lg ${
              selectedTimeRange === 'weekly' ? 'bg-gray-700 text-white' : 'bg-gray-100'
            }`}
          >
            {t('event:weekly_label')}
          </button>
          <button
            onClick={() => {
              setSelectedTimeRange('range');
              setTab('');
              setSelectedDate('');
              setSelectedWeek('');
            }}
            className={`px-4 py-2 rounded-lg ${
              selectedTimeRange === 'range' ? 'bg-gray-700 text-white' : 'bg-gray-100'
            }`}
          >
            {t('event:date_range')}
          </button>
        </div>

        {/* Quick Select Options */}
        {selectedTimeRange === 'preset' && (
          <div className="flex gap-2 mb-4">
            <button className={`px-4 py-2 rounded-lg ${tab === 'today' ? 'bg-gray-700 text-white' : 'bg-gray-100'}`} onClick={() => setTab('today')}>{t('event:today_label')}</button>
            <button className={`px-4 py-2 rounded-lg ${tab === 'yesterday' ? 'bg-gray-700 text-white' : 'bg-gray-100'}`} onClick={() => setTab('yesterday')}>{t('event:yesterday_label')}</button>
            <button className={`px-4 py-2 rounded-lg ${tab === 'thisweek' ? 'bg-gray-700 text-white' : 'bg-gray-100'}`} onClick={() => setTab('thisweek')}>{t('event:this_week')}</button>
            <button className={`px-4 py-2 rounded-lg ${tab === 'lastweek' ? 'bg-gray-700 text-white' : 'bg-gray-100'}`} onClick={() => setTab('lastweek')}>{t('event:last_week')}</button>
          </div>
        )}

        {/* Single Day Selection */}
        {selectedTimeRange === 'single' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('event:select_date')}</label>
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 pr-10"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-blue-500 pointer-events-none"></span>
            </div>
          </div>
        )}

        {/* Weekly Selection */}
        {selectedTimeRange === 'weekly' && (
          <div className="mb-4 max-h-48 overflow-y-auto">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('event:select_week')}</label>
            {weeks.map((week, index) => (
              <div
                key={index}
                onClick={() => setSelectedWeek(`${format(week.start, 'yyyy-MM-dd')}|${format(week.end, 'yyyy-MM-dd')}`)}
                className={`p-2 rounded-lg cursor-pointer hover:bg-gray-50 ${
                  selectedWeek === `${format(week.start, 'yyyy-MM-dd')}|${format(week.end, 'yyyy-MM-dd')}`
                    ? 'bg-gray-700 border border-gray-800 text-white'
                    : ''
                }`}
              >
                <div className="flex items-center">
                  <CalendarIcon className={`w-4 h-4 mr-2 ${
                    selectedWeek === `${format(week.start, 'yyyy-MM-dd')}|${format(week.end, 'yyyy-MM-dd')}`
                      ? 'text-gray-300'
                      : 'text-gray-500'
                  }`} />
                  <span>
                    {format(week.start, 'MMM d')} - {format(week.end, 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Date Range Selection */}
        {selectedTimeRange === 'range' && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('event:start_date')}</label>
              <div className="relative">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 pr-10"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-blue-500 pointer-events-none"></span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('event:end_date')}</label>
              <div className="relative">
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  min={dateRange.start}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 pr-10"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-blue-500 pointer-events-none"></span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-4">
        {/* Show total hours at the top, no breakdown */}
        <div className="bg-gray-700 text-white rounded-lg mb-4 px-6 py-4 flex flex-col items-start">
          <h3 className="font-medium">{t('event:total_hours')}</h3>
          <p className="text-3xl font-bold mt-1">{totalHours.toFixed(2)} {t('event:hours_label')}</p>
        </div>
        {Object.entries(grouped).map(([eventId, project]) => (
          <div key={eventId} className="bg-gray-700 text-white rounded-lg">
            <button className="w-full flex items-center justify-between px-6 py-4 focus:outline-none" onClick={() => setExpanded(e => ({ ...e, [eventId]: !e[eventId] }))}>
              <div>
                <h3 className="font-medium">{eventTitles[eventId] || t('event:project_label')}</h3>
                <p className="text-lg font-semibold mt-1">{project.entries.reduce((sum, e) => sum + (e.hours_spent || 0), 0).toFixed(2)} {t('event:hours_label')}</p>
              </div>
              <ChevronRight className={`w-5 h-5 ml-4 transform transition-transform ${expanded[eventId] ? 'rotate-90' : ''}`} />
            </button>
            {expanded[eventId] && (
              <div className="bg-gray-800 p-4 rounded-b-lg">
                {(tab === 'today' || tab === 'yesterday' ? 
                  // For today/yesterday, show entries directly
                  project.entries.map((entry, idx) => (
                    <div key={idx} className="flex justify-between text-sm py-1 border-b border-gray-700 last:border-b-0">
                      <span>{entry.type === 'regular' ? (entry.tasks_done?.name || 'Unknown Task') : (additionalTaskDescriptions[entry.task_id] || 'Unknown Additional Task')}</span>
                      <span>{entry.hours_spent?.toFixed(2)} {t('event:hours_label')}</span>
                    </div>
                  ))
                  : 
                  // For other tabs, group by date
                  groupEntriesByDate(project.entries).map(([date, entries]) => {
                    const dailyTotal = entries.reduce((sum, entry) => sum + (entry.hours_spent || 0), 0);
                    return (
                      <div key={date} className="mb-2">
                        <div className="flex justify-between items-center text-sm font-medium text-gray-400 mb-1">
                          <span>{format(parseISO(date), 'EEEE, MMMM d, yyyy')}</span>
                          <span className="text-gray-300 font-semibold">{dailyTotal.toFixed(2)} {t('event:hrs_short')}</span>
                        </div>
                        {entries.map((entry, idx) => (
                          <div key={idx} className="flex justify-between text-sm py-1 border-b border-gray-700 last:border-b-0">
                            <span>{entry.type === 'regular' ? (entry.tasks_done?.name || 'Unknown Task') : (additionalTaskDescriptions[entry.task_id] || 'Unknown Additional Task')}</span>
                            <span>{entry.hours_spent?.toFixed(2)} {t('event:hours_label')}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default CheckWeeklyHoursModal;
