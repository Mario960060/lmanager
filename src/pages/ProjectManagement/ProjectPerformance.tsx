import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { format, parseISO, eachWeekOfInterval, startOfWeek, endOfWeek } from 'date-fns';
import { Search, Calendar as CalendarIcon, ChevronDown, ChevronRight } from 'lucide-react';
import BackButton from '../../components/BackButton';

const ProjectPerformance = () => {
  const { t } = useTranslation(['common', 'dashboard', 'utilities', 'project', 'calculator']);
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'single' | 'weekly' | 'range'>('range');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [allowOutOfRangeSelection, setAllowOutOfRangeSelection] = useState<boolean>(false);
  const [weeks, setWeeks] = useState<{ start: Date; end: Date }[]>([]);
  const [hoursOverviewOpen, setHoursOverviewOpen] = useState(false);
  const [totalOpen, setTotalOpen] = useState(false);
  const [userOpen, setUserOpen] = useState<{ [userId: string]: boolean }>({});
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const dateRangeRef = useRef<HTMLDivElement>(null);

  // Fetch projects with custom ordering
  const { data: projects = [] } = useQuery({
    queryKey: ['projects', projectSearch],
    queryFn: async () => {
      const companyId = useAuthStore.getState().getCompanyId();
      
      if (!companyId) return [];
      
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_date, end_date, status')
        .eq('company_id', companyId)
        .ilike('title', `%${projectSearch}%`);

      if (error) throw error;

      // Client-side sorting to ensure correct order: in_progress, finished, scheduled, planned
      return (data || []).sort((a: any, b: any) => {
        const order: Record<string, number> = {
          'in_progress': 1,
          'finished': 2,
          'scheduled': 3,
          'planned': 4
        };
        return (order[a.status] || 5) - (order[b.status] || 5);
      });
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
        
        // Set initial date range to project dates
        setDateRange({
          start: project.start_date,
          end: project.end_date
        });
      }
    }
  }, [selectedProject, projects]);

  // Scroll to date range section when project is selected
  useEffect(() => {
    if (selectedProject && dateRangeRef.current) {
      dateRangeRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedProject]);

  // Fetch project data
  const { data: performanceData = null } = useQuery({
    queryKey: ['project_performance', selectedProject, selectedTimeRange, selectedDate, selectedWeek, dateRange],
    queryFn: async () => {
      if (!selectedProject) return null;

      let startDate, endDate;

      if (selectedTimeRange === 'single') {
        if (!selectedDate) return null;
        startDate = selectedDate;
        endDate = selectedDate;
      } else if (selectedTimeRange === 'weekly') {
        if (!selectedWeek) return null;
        const [start, end] = selectedWeek.split('|');
        startDate = start;
        endDate = end;
      } else {
        if (!dateRange.start || !dateRange.end) return null;
        startDate = dateRange.start;
        endDate = dateRange.end;
      }

      // Fetch hours data
      const { data: hoursData, error: hoursError } = await supabase
        .from('task_progress_entries')
        .select(`
          user_id,
          task_id,
          hours_spent,
          tasks_done (
            name,
            amount
          ),
          profiles (
            full_name
          )
        `)
        .eq('event_id', selectedProject)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (hoursError) throw hoursError;

      // Fetch additional task progress entries
      const { data: additionalProgressData, error: additionalProgressError } = await supabase
        .from('additional_task_progress_entries')
        .select(`
          task_id,
          user_id,
          hours_spent,
          additional_tasks (
            id,
            description
          ),
          profiles (
            full_name
          )
        `)
        .eq('event_id', selectedProject)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (additionalProgressError) throw additionalProgressError;

      // Process hours data including both regular and additional tasks
      const totalProjectHours = hoursData.reduce((sum, item) => sum + item.hours_spent, 0) +
        (additionalProgressData?.reduce((sum, item) => sum + (item.hours_spent || 0), 0) || 0);
      
      // Group hours by user
      const hoursByUser = hoursData.reduce((acc: any, item) => {
        const userId = item.user_id;
        if (!acc[userId]) {
          acc[userId] = {
            userName: item.profiles?.full_name,
            totalHours: 0,
            taskHours: {}
          };
        }
        acc[userId].totalHours += item.hours_spent;

        // Group by task
        const taskName = item.tasks_done?.name || t('calculator:unknown_task');
        if (!acc[userId].taskHours[taskName]) {
          acc[userId].taskHours[taskName] = 0;
        }
        acc[userId].taskHours[taskName] += item.hours_spent;

        return acc;
      }, {});

      // Add additional task progress to hoursByUser
      additionalProgressData?.forEach(item => {
        const userId = item.user_id;
        if (!hoursByUser[userId]) {
          hoursByUser[userId] = {
            userName: item.profiles?.full_name,
            totalHours: 0,
            taskHours: {}
          };
        }
        hoursByUser[userId].totalHours += item.hours_spent || 0;

        // Group by task description from additional_tasks
        const taskName = item.additional_tasks?.description || t('calculator:unknown_additional_task');
        if (!hoursByUser[userId].taskHours[taskName]) {
          hoursByUser[userId].taskHours[taskName] = 0;
        }
        hoursByUser[userId].taskHours[taskName] += item.hours_spent || 0;
      });

      // Fetch additional tasks
      const { data: additionalTasks, error: tasksError } = await supabase
        .from('additional_tasks')
        .select(`
          *,
          profiles (
            full_name
          )
        `)
        .eq('event_id', selectedProject)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (tasksError) throw tasksError;

      // Fetch additional materials
      const { data: additionalMaterials, error: materialsError } = await supabase
        .from('additional_materials')
        .select(`
          *,
          profiles (
            full_name
          )
        `)
        .eq('event_id', selectedProject)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (materialsError) throw materialsError;

      return {
        totalHours: totalProjectHours,
        byUser: hoursByUser,
        additionalTasks,
        additionalMaterials,
        additionalProgressData
      };
    },
    enabled: !!selectedProject
  });

  // Fetch delivered materials for the selected project and time range
  const { data: deliveredMaterials = [], isLoading: isMaterialsLoading } = useQuery({
    queryKey: ['delivered_materials', selectedProject, selectedTimeRange, selectedDate, selectedWeek, dateRange],
    queryFn: async () => {
      if (!selectedProject) return [];
      let startDate, endDate;
      if (selectedTimeRange === 'single') {
        if (!selectedDate) return [];
        startDate = selectedDate;
        endDate = selectedDate;
      } else if (selectedTimeRange === 'weekly') {
        if (!selectedWeek) return [];
        const [start, end] = selectedWeek.split('|');
        startDate = start;
        endDate = end;
      } else {
        if (!dateRange.start || !dateRange.end) return [];
        startDate = dateRange.start;
        endDate = dateRange.end;
      }
      // Fetch deliveries with material info
      const { data, error } = await supabase
        .from('material_deliveries')
        .select(`id, material_id, amount, delivery_date, materials:material_id(name, unit)`)
        .eq('event_id', selectedProject)
        .gte('delivery_date', startDate)
        .lte('delivery_date', endDate);
      if (error) throw error;
      // Combine by material_id
      const combined: Record<string, { name: string; unit: string; total: number }> = {};
      data.forEach((delivery: any) => {
        const matId = delivery.material_id;
        const name = delivery.materials?.name || t('calculator:unknown_material');
        const unit = delivery.materials?.unit || '';
        if (!combined[matId]) combined[matId] = { name, unit, total: 0 };
        combined[matId].total += Number(delivery.amount) || 0;
      });
      // Convert to array and sort by most delivered
      return Object.values(combined).sort((a, b) => b.total - a.total);
    },
    enabled: !!selectedProject && (
      (selectedTimeRange === 'single' && !!selectedDate) ||
      (selectedTimeRange === 'weekly' && !!selectedWeek) ||
      (selectedTimeRange === 'range' && !!dateRange.start && !!dateRange.end)
    )
  });

  const selectedProject_data = selectedProject ? projects.find(p => p.id === selectedProject) : null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'finished':
        return 'bg-green-100 text-green-800';
      case 'scheduled':
        return 'bg-gray-700 text-white';
      case 'planned':
        return 'bg-gray-100 text-gray-800';
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

  // Helper: combine all task hours from all users
  function getCombinedTaskHours(performanceData: any) {
    const combined: Record<string, number> = {};
    // Regular tasks
    Object.values(performanceData.byUser).forEach((user: any) => {
      Object.entries(user.taskHours).forEach(([task, hours]: [string, any]) => {
        if (!combined[task]) combined[task] = 0;
        combined[task] += hours;
      });
    });
    // Additional tasks (if any)
    if (performanceData.additionalTasks) {
      performanceData.additionalTasks.forEach((task: any) => {
        if (task.description && task.hours_needed) {
          if (!combined[task.description]) combined[task.description] = 0;
          combined[task.description] += task.hours_needed;
        }
      });
    }
    return combined;
  }

  // Helper to get hours worked for an additional task
  function getAdditionalTaskHoursWorked(taskId: string, additionalProgressData: any[]) {
    return additionalProgressData
      .filter(entry => entry.task_id === taskId)
      .reduce((sum, entry) => sum + (entry.hours_spent || 0), 0);
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackButton />
      <h1 className="text-3xl font-bold text-gray-900">{t('project:project_performance_title')}</h1>

      {/* Project Selection */}
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <label className="block text-sm font-medium text-gray-700">{t('project:search_project_label')}</label>
        <div className="mt-1 relative">
          <input
            type="text"
            value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500"
            placeholder={t('project:enter_project_name')}
          />
          <Search className="absolute right-3 top-2.5 h-5 w-5 text-blue-500" />
        </div>

        {projects.length > 0 && (
          <div className="mt-4 h-[400px] overflow-y-auto pr-2">
            <div className="space-y-2">
              {projects.map(project => (
                <div
                  key={project.id}
                  onClick={() => setSelectedProject(project.id)}
                  className={`p-4 hover:bg-gray-50 cursor-pointer rounded-lg border transition-all ${
                    selectedProject === project.id ? 'bg-gray-700 border-gray-800 text-white' : 'border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{project.title}</h3>
                      <p className={`text-sm ${selectedProject === project.id ? 'text-gray-300' : 'text-gray-600'}`}>
                        {format(parseISO(project.start_date), 'MMM d, yyyy')} - {format(parseISO(project.end_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-sm rounded-full ${getStatusColor(project.status)}`}>
                      {formatStatus(project.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedProject && (
        <>
          {/* Time Range Selection */}
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex space-x-4 mb-6">
              <button
                onClick={() => {
                  setSelectedTimeRange('single');
                  setSelectedWeek('');
                  setDateRange({ start: '', end: '' });
                }}
                className={`px-4 py-2 rounded-lg ${
                  selectedTimeRange === 'single' ? 'bg-gray-700 text-white' : 'bg-gray-100'
                }`}
              >
                {t('project:single_day')}
              </button>
              <button
                onClick={() => {
                  setSelectedTimeRange('weekly');
                  setSelectedDate('');
                  setDateRange({ start: '', end: '' });
                }}
                className={`px-4 py-2 rounded-lg ${
                  selectedTimeRange === 'weekly' ? 'bg-gray-700 text-white' : 'bg-gray-100'
                }`}
              >
                {t('project:weekly')}
              </button>
              <button
                onClick={() => {
                  setSelectedTimeRange('range');
                  setSelectedDate('');
                  setSelectedWeek('');
                }}
                className={`px-4 py-2 rounded-lg ${
                  selectedTimeRange === 'range' ? 'bg-gray-700 text-white' : 'bg-gray-100'
                }`}
              >
                {t('project:date_range')}
              </button>
            </div>

            {/* Date Selection based on time range */}
            {selectedTimeRange === 'single' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('project:select_date_label')}</label>
                <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={selectedProject_data?.start_date}
                  max={selectedProject_data?.end_date}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 pr-10"
                />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-blue-500 pointer-events-none"></span>
                </div>
              </div>
            )}

            {selectedTimeRange === 'weekly' && (
              <div className="max-h-48 overflow-y-auto">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('project:select_week_label')}</label>
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

            {selectedTimeRange === 'range' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('project:start_date_label')}</label>
                  <div className="relative">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    min={allowOutOfRangeSelection ? undefined : selectedProject_data?.start_date}
                    max={allowOutOfRangeSelection ? undefined : selectedProject_data?.end_date}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 pr-10"
                  />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-blue-500 pointer-events-none"></span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('project:end_date_label')}</label>
                  <div className="relative">
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    min={dateRange.start}
                    max={allowOutOfRangeSelection ? undefined : selectedProject_data?.end_date}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 pr-10"
                  />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-blue-500 pointer-events-none"></span>
                  </div>
                </div>
                <div className="col-span-2 mt-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="allowOutOfRangeSelection"
                      checked={allowOutOfRangeSelection}
                      onChange={(e) => setAllowOutOfRangeSelection(e.target.checked)}
                      className="h-4 w-4 text-gray-600 rounded border-gray-300 focus:ring-gray-500"
                    />
                    <label htmlFor="allowOutOfRangeSelection" className="ml-2 text-sm text-gray-600">
                      {t('project:allow_dates_outside_range')}
                    </label>
                  </div>
                  {allowOutOfRangeSelection && (
                    <div className="mt-1 p-2 bg-gray-100 rounded-md text-xs text-gray-600">
                      <p>Project date range: {selectedProject_data ? format(parseISO(selectedProject_data.start_date), 'MMM d, yyyy') : ''} - {selectedProject_data ? format(parseISO(selectedProject_data.end_date), 'MMM d, yyyy') : ''}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {performanceData && (
            <>
              {/* Hours Overview Section */}
              <div className="bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold mb-4">{t('project:hours_overview')}</h2>
                {/* Total Project Hours collapsible row */}
                <div className="bg-gray-700 text-white rounded-lg mb-4">
                  <button
                    className="w-full flex items-center justify-between px-6 py-4 focus:outline-none"
                    onClick={() => setTotalOpen(open => !open)}
                    aria-expanded={totalOpen}
                  >
                    <div>
                      <h3 className="font-medium">{t('project:total_project_hours')}</h3>
                      <p className="text-3xl font-bold mt-1">{performanceData.totalHours.toFixed(2)} {t('project:hours_unit')}</p>
                    </div>
                    <ChevronRight className={`w-6 h-6 ml-4 transform transition-transform ${totalOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {totalOpen && (
                    <div className="bg-gray-800 p-4 rounded-b-lg">
                      {Object.entries(getCombinedTaskHours(performanceData))
                        .sort(([, a], [, b]) => b - a)
                        .map(([task, hours]) => (
                          <div key={task} className="flex justify-between text-sm py-1 border-b border-gray-700 last:border-b-0">
                            <span>{task}</span>
                            <span>{hours.toFixed(2)} {t('project:hours_unit')}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                {/* Per-user collapsible rows */}
                <div className="space-y-4">
                  {Object.entries(performanceData.byUser)
                    .sort(([, a]: any, [, b]: any) => b.totalHours - a.totalHours)
                    .map(([userId, userData]: [string, any]) => (
                      <div key={userId} className="bg-gray-700 text-white rounded-lg">
                        <button
                          className="w-full flex items-center justify-between px-6 py-4 focus:outline-none"
                          onClick={() => setUserOpen(prev => ({ ...prev, [userId]: !prev[userId] }))}
                          aria-expanded={!!userOpen[userId]}
                        >
                        <div>
                          <h3 className="font-medium">{userData.userName}</h3>
                            <p className="text-lg font-semibold mt-1">{userData.totalHours.toFixed(2)} {t('project:hours_unit')}</p>
                        </div>
                          <ChevronRight className={`w-5 h-5 ml-4 transform transition-transform ${userOpen[userId] ? 'rotate-90' : ''}`} />
                        </button>
                        {userOpen[userId] && (
                          <div className="bg-gray-800 p-4 rounded-b-lg">
                            {Object.entries(userData.taskHours)
                              .sort(([, a], [, b]) => b - a)
                              .map(([taskName, hours]: [string, any]) => (
                                <div key={taskName} className="flex justify-between text-sm py-1 border-b border-gray-700 last:border-b-0">
                            <span>{taskName}</span>
                            <span>{hours.toFixed(2)} {t('project:hours_unit')}</span>
                          </div>
                        ))}
                      </div>
                        )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Materials Delivered Section */}
              <div className="bg-white p-6 rounded-lg shadow-lg mt-6">
                <button
                  className="w-full flex items-center justify-between focus:outline-none"
                  onClick={() => setMaterialsOpen(open => !open)}
                  aria-expanded={materialsOpen}
                >
                  <h2 className="text-xl font-semibold">{t('project:materials_delivered')}</h2>
                  <ChevronRight className={`w-6 h-6 ml-4 transform transition-transform ${materialsOpen ? 'rotate-90' : ''}`} />
                </button>
                {materialsOpen && (
                  <div className="mt-6">
                    {isMaterialsLoading ? (
                      <div className="text-center text-gray-500">{t('project:loading_data')}</div>
                    ) : deliveredMaterials.length === 0 ? (
                      <div className="text-center text-gray-500">{t('project:no_materials_delivered')}</div>
                    ) : (
                      <div className="space-y-3">
                        {deliveredMaterials.map((mat, idx) => (
                          <div key={mat.name + idx} className="flex justify-between items-center bg-gray-50 rounded p-3">
                            <span className="font-medium text-gray-900">{mat.name}</span>
                            <span className="text-gray-700">{mat.total.toFixed(2)} {mat.unit}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Additional Tasks and Materials Section */}
              <div className="grid grid-cols-2 gap-6">
                {/* Additional Tasks */}
                <div className="bg-white p-6 rounded-lg shadow-lg">
                  <h2 className="text-xl font-semibold mb-4">{t('project:additional_tasks_title')}</h2>
                  <div className="space-y-4">
                    {performanceData.additionalTasks.map((task: any) => (
                      <div key={task.id} className="bg-gray-50 p-4 rounded-lg">
                        <h3 className="font-medium">{task.description}</h3>
                        <div className="mt-2 text-sm">
                          <p className="text-gray-700">
                            Hours worked: {getAdditionalTaskHoursWorked(task.id, performanceData.additionalProgressData || []).toFixed(2)}
                          </p>
                          {task.materials_needed && (
                            <p className="mt-1 text-gray-600">
                              Materials: {task.materials_needed}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {performanceData.additionalTasks.length === 0 && (
                      <p className="text-center text-gray-600 py-4">
                        {t('project:no_additional_tasks_period')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Additional Materials */}
                <div className="bg-white p-6 rounded-lg shadow-lg">
                  <h2 className="text-xl font-semibold mb-4">{t('project:additional_materials_title')}</h2>
                  <div className="space-y-4">
                    {performanceData?.additionalMaterials?.map((material: any) => (
                      <div key={material.id} className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium">{material.material}</h3>
                            <div className="mt-2 text-sm">
                              <p className="text-gray-700">
                                Quantity: {material.quantity} {material.unit}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!performanceData?.additionalMaterials || performanceData.additionalMaterials.length === 0) && (
                      <p className="text-center text-gray-600 py-4">
                        {t('project:no_additional_materials_period')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
          <div ref={dateRangeRef} />
        </>
      )}
    </div>
  );
};

export default ProjectPerformance;
