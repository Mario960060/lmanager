import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { format, parseISO, eachWeekOfInterval, startOfWeek, endOfWeek } from 'date-fns';
import { X, Search, Calendar as CalendarIcon } from 'lucide-react';

interface ProjectPerformanceModalProps {
  onClose: () => void;
}

const ProjectPerformanceModal: React.FC<ProjectPerformanceModalProps> = ({ onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'single' | 'weekly' | 'range'>('single');
  const [selectedDataType, setSelectedDataType] = useState<'tasks' | 'hours' | 'additionalTasks'>('tasks');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [weeks, setWeeks] = useState<{ start: Date; end: Date }[]>([]);

  // Fetch projects
  const { data: projects = [] } = useQuery({
    queryKey: ['projects', projectSearch],
    queryFn: async () => {
      const companyId = useAuthStore.getState().getCompanyId();
      
      if (!companyId) return [];
      
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_date, end_date')
        .eq('company_id', companyId)
        .ilike('title', `%${projectSearch}%`)
        .order('start_date', { ascending: false });

      if (error) throw error;
      return data;
    }
  });

  // Calculate weeks when project is selected
  useEffect(() => {
    if (selectedProject) {
      const project = projects.find(p => p.id === selectedProject);
      if (project) {
        const startDate = parseISO(project.start_date);
        const endDate = parseISO(project.end_date);
        
        const weeksList = eachWeekOfInterval(
          { start: startDate, end: endDate },
          { weekStartsOn: 1 }
        ).map(weekStart => ({
          start: weekStart,
          end: endOfWeek(weekStart, { weekStartsOn: 1 })
        }));

        setWeeks(weeksList);
        
        // Reset selections
        setSelectedDate('');
        setSelectedWeek('');
        setDateRange({ start: '', end: '' });
      }
    }
  }, [selectedProject, projects]);

  // Fetch project data based on selection
  const { data: performanceData = [] } = useQuery({
    queryKey: ['project_performance', selectedProject, selectedTimeRange, selectedDataType, selectedDate, selectedWeek, dateRange],
    queryFn: async () => {
      if (!selectedProject) return [];
      if (
        (selectedTimeRange === 'single' && !selectedDate) ||
        (selectedTimeRange === 'weekly' && !selectedWeek) ||
        (selectedTimeRange === 'range' && (!dateRange.start || !dateRange.end))
      ) {
        return [];
      }

      let startDate, endDate;

      if (selectedTimeRange === 'single') {
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

      // Different queries based on data type
      if (selectedDataType === 'tasks') {
        const { data, error } = await supabase
          .from('task_progress_entries')
          .select(`
            *,
            tasks_done (
              name,
              amount
            ),
            events (
              title
            ),
            profiles (
              full_name
            )
          `)
          .eq('event_id', selectedProject)
          .gte('created_at', `${startDate}T00:00:00`)
          .lte('created_at', `${endDate}T23:59:59`)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Group tasks by user and task name
        const groupedTasks = data.reduce((acc: any, item) => {
          const userId = item.user_id;
          const taskName = item.tasks_done?.name || 'Unknown Task';
          const key = `${userId}-${taskName}`;

          if (!acc[key]) {
            acc[key] = {
              userId,
              userName: item.profiles?.full_name,
              taskName,
              totalAmount: 0,
              totalHours: 0,
              unit: item.tasks_done?.amount?.split(' ')[1] || 'units'
            };
          }

          acc[key].totalAmount += item.amount_completed;
          acc[key].totalHours += item.hours_spent;

          return acc;
        }, {});

        return Object.values(groupedTasks);
      } 
      else if (selectedDataType === 'hours') {
        const { data, error } = await supabase
          .from('task_progress_entries')
          .select(`
            user_id,
            hours_spent,
            profiles (
              full_name
            )
          `)
          .eq('event_id', selectedProject)
          .gte('created_at', `${startDate}T00:00:00`)
          .lte('created_at', `${endDate}T23:59:59`);

        if (error) throw error;

        // Group hours by user
        const groupedHours = data.reduce((acc: any, item) => {
          const userId = item.user_id;
          if (!acc[userId]) {
            acc[userId] = {
              userId,
              userName: item.profiles?.full_name,
              totalHours: 0
            };
          }
          acc[userId].totalHours += item.hours_spent;
          return acc;
        }, {});

        const totalHours = data.reduce((sum, item) => sum + item.hours_spent, 0);

        return {
          total: totalHours,
          byUser: Object.values(groupedHours)
        };
      }
      else { // additionalTasks
        const { data, error } = await supabase
          .from('additional_tasks')
          .select(`
            *,
            events (
              title
            ),
            profiles (
              full_name
            )
          `)
          .eq('event_id', selectedProject)
          .gte('created_at', `${startDate}T00:00:00`)
          .lte('created_at', `${endDate}T23:59:59`)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
      }
    },
    enabled: !!selectedProject && (
      (selectedTimeRange === 'single' && !!selectedDate) ||
      (selectedTimeRange === 'weekly' && !!selectedWeek) ||
      (selectedTimeRange === 'range' && !!dateRange.start && !!dateRange.end)
    )
  });

  const selectedProject_data = selectedProject ? projects.find(p => p.id === selectedProject) : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b flex-none">
          <h2 className="text-xl font-semibold">{t('event:project_performance_title')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col h-full">
          {/* Project Search */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700">{t('event:search_project')}</label>
            <div className="mt-1 relative">
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('event:enter_project_name')}
              />
              <Search className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
          </div>

          {/* Project List */}
          {projects.length > 0 && (
            <div className="mb-6 max-h-40 overflow-y-auto">
              {projects.map(project => (
                <div
                  key={project.id}
                  onClick={() => setSelectedProject(project.id)}
                  className={`p-3 hover:bg-gray-50 cursor-pointer rounded-lg ${
                    selectedProject === project.id ? 'bg-blue-50 border border-blue-200' : ''
                  }`}
                >
                  <h3 className="font-medium">{project.title}</h3>
                  <p className="text-sm text-gray-600">
                    {format(parseISO(project.start_date), 'MMM d, yyyy')} - {format(parseISO(project.end_date), 'MMM d, yyyy')}
                  </p>
                </div>
              ))}
            </div>
          )}

          {selectedProject && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Controls - Fixed position */}
              <div className="bg-white border-b pb-4 mb-4">
                {/* Time Range Selection */}
                <div className="flex space-x-4 mb-4">
                  <button
                    onClick={() => {
                      setSelectedTimeRange('single');
                      setSelectedWeek('');
                      setDateRange({ start: '', end: '' });
                    }}
                    className={`px-4 py-2 rounded-lg ${
                      selectedTimeRange === 'single' ? 'bg-blue-600 text-white' : 'bg-gray-100'
                    }`}
                  >
                    {t('event:single_day')}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTimeRange('weekly');
                      setSelectedDate('');
                      setDateRange({ start: '', end: '' });
                    }}
                    className={`px-4 py-2 rounded-lg ${
                      selectedTimeRange === 'weekly' ? 'bg-blue-600 text-white' : 'bg-gray-100'
                    }`}
                  >
                    {t('event:weekly_button')}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTimeRange('range');
                      setSelectedDate('');
                      setSelectedWeek('');
                    }}
                    className={`px-4 py-2 rounded-lg ${
                      selectedTimeRange === 'range' ? 'bg-blue-600 text-white' : 'bg-gray-100'
                    }`}
                  >
                    {t('event:date_range_button')}
                  </button>
                </div>

                {/* Date Selection */}
                {selectedTimeRange === 'single' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t('event:select_date')}</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      min={selectedProject_data?.start_date}
                      max={selectedProject_data?.end_date}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                )}

                {selectedTimeRange === 'weekly' && (
                  <div className="max-h-48 overflow-y-auto">
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('event:select_week')}</label>
                    {weeks.map((week, index) => (
                      <div
                        key={index}
                        onClick={() => setSelectedWeek(`${format(week.start, 'yyyy-MM-dd')}|${format(week.end, 'yyyy-MM-dd')}`)}
                        className={`p-2 rounded-lg cursor-pointer hover:bg-gray-50 ${
                          selectedWeek === `${format(week.start, 'yyyy-MM-dd')}|${format(week.end, 'yyyy-MM-dd')}`
                            ? 'bg-blue-50 border border-blue-200'
                            : ''
                        }`}
                      >
                        <div className="flex items-center">
                          <CalendarIcon className="w-4 h-4 mr-2 text-gray-500" />
                          <span>
                            {format(week.start, 'MMM d')} - {format(week.end, 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedTimeRange === 'range' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">{t('event:start_date_label')}</label>
                      <input
                        type="date"
                        value={dateRange.start}
                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                        min={selectedProject_data?.start_date}
                        max={selectedProject_data?.end_date}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">{t('event:end_date_label')}</label>
                      <input
                        type="date"
                        value={dateRange.end}
                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                        min={dateRange.start || selectedProject_data?.start_date}
                        max={selectedProject_data?.end_date}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                {/* Data Type Selection */}
                <div className="flex space-x-4 mt-4">
                  <button
                    onClick={() => setSelectedDataType('tasks')}
                    className={`px-4 py-2 rounded-lg ${
                      selectedDataType === 'tasks' ? 'bg-green-600 text-white' : 'bg-gray-100'
                    }`}
                  >
                    {t('event:tasks_button')}
                  </button>
                  <button
                    onClick={() => setSelectedDataType('hours')}
                    className={`px-4 py-2 rounded-lg ${
                      selectedDataType === 'hours' ? 'bg-green-600 text-white' : 'bg-gray-100'
                    }`}
                  >
                    {t('event:hours_button')}
                  </button>
                  <button
                    onClick={() => setSelectedDataType('additionalTasks')}
                    className={`px-4 py-2 rounded-lg ${
                      selectedDataType === 'additionalTasks' ? 'bg-green-600 text-white' : 'bg-gray-100'
                    }`}
                  >
                    {t('event:additional_tasks_button')}
                  </button>
                </div>
              </div>

              {/* Results - Scrollable */}
              <div className="overflow-y-auto flex-1">
                <div className="space-y-4">
                  {performanceData && performanceData.length > 0 ? (
                    <>
                      {selectedDataType === 'tasks' && (
                        performanceData.map((item: any) => (
                          <div 
                            key={`task-${item.userId}-${item.taskName}-${item.totalAmount}`} 
                            className="bg-gray-50 p-4 rounded-lg"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="font-medium">{item.taskName}</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                  {t('event:by_prefix')} {item.userName}
                                </p>
                                <p className="text-sm text-gray-600">
                                  {t('event:progress_label')} {item.totalAmount} {item.unit}
                                </p>
                              </div>
                              <p className="text-sm font-medium text-blue-600">
                                {item.totalHours} {t('event:hours_spent')}
                              </p>
                            </div>
                          </div>
                        ))
                      )}

                      {selectedDataType === 'hours' && (
                        <div className="space-y-4">
                          <div className="bg-blue-50 p-4 rounded-lg">
                            <h3 className="font-medium text-blue-900">{t('event:total_project_hours')}</h3>
                            <p className="text-2xl font-bold text-blue-600 mt-1">
                              {performanceData.total} {t('event:hours_suffix')}
                            </p>
                          </div>
                          {performanceData.byUser.map((user: any) => (
                            <div 
                              key={`hours-${user.userId}-${user.totalHours}`} 
                              className="bg-gray-50 p-4 rounded-lg"
                            >
                              <div className="flex justify-between items-center">
                                <h3 className="font-medium">{user.userName}</h3>
                                <p className="text-sm font-medium text-blue-600">
                                  {user.totalHours} {t('event:hours_suffix')}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {selectedDataType === 'additionalTasks' && (
                        performanceData.map((item: any) => (
                          <div 
                            key={`additional-${item.id}-${item.created_at}`} 
                            className="bg-gray-50 p-4 rounded-lg"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="font-medium">{item.description}</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                  {t('event:added_by')} {item.profiles?.full_name}
                                </p>
                              </div>
                              <p className="text-sm font-medium text-blue-600">
                                {item.hours_needed} {t('event:hours_needed')}
                              </p>
                            </div>
                            <div className="mt-2 text-sm text-gray-600">
                              <p>{t('event:period_label')} {format(parseISO(item.start_date), 'MMM d')} - {format(parseISO(item.end_date), 'MMM d, yyyy')}</p>
                              {item.materials_needed && (
                                <p className="mt-1">{t('event:materials_label')} {item.materials_needed}</p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  ) : (
                    <p className="text-center text-gray-600 py-4">
                      {t('event:no_data_available')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectPerformanceModal;
