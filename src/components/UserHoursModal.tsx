import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import TaskProgressModal from './TaskProgressModal';
import { format } from 'date-fns';
import { useAuthStore } from '../lib/store';
import Modal from './Modal';
import { Plus, X, ChevronRight, Search, Trash2 } from 'lucide-react';
import UnspecifiedMaterialModal from './UnspecifiedMaterialModal';

interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  unit: string;
  estimated_hours: number;
}

interface AdditionalTaskMaterial {
  material: string;
  quantity: string | number;
  unit: string;
}

const UserHoursPage: React.FC = () => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProject, setSelectedProject] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressTask, setProgressTask] = useState<any>(null);
  const [showAdditionalTaskProgressModal, setShowAdditionalTaskProgressModal] = useState(false);
  const [selectedAdditionalTask, setSelectedAdditionalTask] = useState<any>(null);
  const [progressDetails, setProgressDetails] = useState({ progress: '', hoursWorked: '', notes: '' });
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedTaskTemplate, setSelectedTaskTemplate] = useState<string>('');
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
  const [materialTemplates, setMaterialTemplates] = useState<{ id: string; name: string; unit: string }[]>([]);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskDetails, setTaskDetails] = useState<{
    description: string;
    start_date: string;
    end_date: string;
    hours_needed: string;
    quantity: string;
    materials: AdditionalTaskMaterial[];
  }>({
    description: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    hours_needed: '',
    quantity: '',
    materials: []
  });
  const [showUnspecifiedMaterialModal, setShowUnspecifiedMaterialModal] = useState(false);
  const [selectedMaterialIndex, setSelectedMaterialIndex] = useState<number | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'task' | 'additional'; name: string; taskId?: string } | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  const formattedDate = useMemo(() => {
    try {
      return new Date(selectedDate + 'T12:00:00').toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // ---------- QUERIES ----------

  const { data: projects = [] } = useQuery({
    queryKey: ['events', companyId],
    queryFn: async () => {
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('company_id', companyId!)
        .order('start_date', { ascending: true });
      if (eventsError) throw eventsError;
      return events;
    },
    enabled: !!companyId
  });

  const { data: tasks = [], isLoading: isTasksLoading } = useQuery({
    queryKey: ['tasks', selectedProject, companyId],
    queryFn: async () => {
      if (!selectedProject) return [];
      const { data, error } = await supabase
        .from('tasks_done')
        .select('*')
        .eq('event_id', selectedProject)
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedProject && !!companyId
  });

  const { data: folders = [], isLoading: isFoldersLoading } = useQuery({
    queryKey: ['task_folders', selectedProject, companyId],
    queryFn: async () => {
      if (!selectedProject) return [];
      const { data, error } = await supabase
        .from('task_folders')
        .select('*')
        .eq('event_id', selectedProject)
        .eq('company_id', companyId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedProject && !!companyId
  });

  const { data: additionalTasks = [], isLoading: isAdditionalTasksLoading } = useQuery({
    queryKey: ['additional_tasks', selectedProject, companyId],
    queryFn: async () => {
      if (!selectedProject) return [];
      const { data, error } = await supabase
        .from('additional_tasks')
        .select(`*, additional_task_materials (material, quantity, unit)`)
        .eq('event_id', selectedProject)
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedProject && !!companyId
  });

  const { data: todayTaskEntries = [] } = useQuery({
    queryKey: ['today_task_entries', selectedDate, user?.id, companyId],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('task_progress_entries')
        .select(`
          id,
          amount_completed,
          hours_spent,
          created_at,
          tasks_done (name, amount)
        `)
        .eq('user_id', user.id)
        .eq('company_id', companyId!)
        .gte('created_at', `${selectedDate}T00:00:00`)
        .lte('created_at', `${selectedDate}T23:59:59`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && !!companyId
  });

  const { data: todayAdditionalEntries = [] } = useQuery({
    queryKey: ['today_additional_entries', selectedDate, user?.id, companyId],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('additional_task_progress_entries')
        .select(`
          id,
          hours_spent,
          progress_percentage,
          created_at,
          task_id,
          additional_tasks (description)
        `)
        .eq('user_id', user.id)
        .eq('company_id', companyId!)
        .gte('created_at', `${selectedDate}T00:00:00`)
        .lte('created_at', `${selectedDate}T23:59:59`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && !!companyId
  });

  // ---------- DERIVED DATA ----------

  const filteredTasks = useMemo(
    () => tasks.filter(task =>
      task.name?.toLowerCase().includes(taskSearch.toLowerCase())
    ),
    [tasks, taskSearch]
  );
  const filteredAdditionalTasks = additionalTasks.filter(task =>
    task.description?.toLowerCase().includes(taskSearch.toLowerCase())
  );

  const tasksByFolder: Record<string, any[]> = {};
  filteredTasks.forEach(task => {
    const folderId = task.folder_id || 'unorganized';
    if (!tasksByFolder[folderId]) tasksByFolder[folderId] = [];
    tasksByFolder[folderId].push(task);
  });

  const allTodayEntries = useMemo(() => {
    const taskEntries = todayTaskEntries.map((e: any) => {
      const taskData = e.tasks_done as any;
      const unitPart = taskData?.amount?.split(' ').slice(1).join(' ') || '';
      return {
        id: e.id,
        type: 'task' as const,
        taskName: taskData?.name || t('event:unknown_task'),
        meta: `${e.amount_completed} ${unitPart}`,
        hours: e.hours_spent,
        time: format(new Date(e.created_at), 'HH:mm'),
      };
    });
    const additionalEntries = todayAdditionalEntries.map((e: any) => {
      const taskData = e.additional_tasks as any;
      return {
        id: e.id,
        type: 'additional' as const,
        taskName: taskData?.description || t('event:unnamed_task'),
        taskId: e.task_id,
        meta: `${e.progress_percentage}%`,
        hours: e.hours_spent,
        time: format(new Date(e.created_at), 'HH:mm'),
      };
    });
    return [...taskEntries, ...additionalEntries];
  }, [todayTaskEntries, todayAdditionalEntries, t]);

  const totalTodayHours = useMemo(
    () => allTodayEntries.reduce((sum, e) => sum + (e.hours || 0), 0),
    [allTodayEntries]
  );

  // ---------- EFFECTS ----------

  useEffect(() => {
    if (taskSearch && filteredTasks.length > 0) {
      const byFolder: Record<string, any[]> = {};
      filteredTasks.forEach(task => {
        const folderId = task.folder_id || 'unorganized';
        if (!byFolder[folderId]) byFolder[folderId] = [];
        byFolder[folderId].push(task);
      });
      const foldersWithMatches = Object.keys(byFolder).filter(
        folderId => byFolder[folderId]?.length > 0
      );
      if (foldersWithMatches.length > 0) {
        setExpandedFolders(prev => {
          const newExpanded = [...new Set([...prev, ...foldersWithMatches])];
          return newExpanded;
        });
      }
    }
  }, [taskSearch, filteredTasks]);

  useEffect(() => {
    const fetchTaskTemplates = async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('company_id', companyId!)
        .order('name');
      if (error) {
        console.error('Error fetching task templates:', error);
        return;
      }
      setTaskTemplates((data || []) as any);
    };
    if (companyId) fetchTaskTemplates();
  }, [companyId]);

  useEffect(() => {
    const fetchMaterialTemplates = async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, unit')
        .eq('company_id', companyId!)
        .order('name');
      if (error) {
        console.error('Error fetching material templates:', error);
        return;
      }
      setMaterialTemplates((data || []) as { id: string; name: string; unit: string }[]);
    };
    if (companyId) fetchMaterialTemplates();
  }, [companyId]);

  // ---------- HELPERS ----------

  function getCreatedAt(selectedDate: string) {
    const now = new Date();
    const [year, month, day] = selectedDate.split('-');
    now.setFullYear(Number(year));
    now.setMonth(Number(month) - 1);
    now.setDate(Number(day));
    return now.toISOString().split('.')[0];
  }

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev =>
      prev.includes(folderId)
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  };

  // ---------- TASK TEMPLATE / ADD TASK HANDLERS ----------

  const handleTaskTemplateChange = (templateId: string) => {
    setSelectedTaskTemplate(templateId);
    if (templateId === 'other') {
      setTaskDetails(prev => ({ ...prev, description: '', quantity: '', hours_needed: '' }));
    } else {
      const template = taskTemplates.find(t => t.id === templateId);
      if (template) {
        setTaskDetails(prev => ({
          ...prev,
          description: template.name,
          quantity: '1',
          hours_needed: (template.estimated_hours ?? 0).toString()
        }));
      }
    }
  };

  const handleAddMaterial = () => {
    setTaskDetails(prev => ({
      ...prev,
      materials: [...prev.materials, { material: '', quantity: '', unit: '' }]
    }));
  };

  const handleRemoveMaterial = (index: number) => {
    setTaskDetails(prev => ({
      ...prev,
      materials: prev.materials.filter((_: any, i: number) => i !== index)
    }));
  };

  const handleMaterialChange = (index: number, field: 'material' | 'quantity' | 'unit', value: string) => {
    setTaskDetails(prev => ({
      ...prev,
      materials: prev.materials.map((m: any, i: number) => {
        if (i === index) {
          if (field === 'material') {
            const template = materialTemplates.find((t: any) => t.name === value);
            return { ...m, [field]: value, unit: template?.unit || m.unit };
          }
          return { ...m, [field]: value };
        }
        return m;
      })
    }));
  };

  const calculateHoursNeeded = (quantity: string | number, baseHours: number) => {
    const qty = parseFloat(quantity.toString()) || 0;
    return (qty * baseHours).toString();
  };

  const handleQuantityChange = (value: string) => {
    const template = taskTemplates.find((t: any) => t.id === selectedTaskTemplate);
    const baseHours = template ? (template.estimated_hours ?? 0) : 0;
    setTaskDetails(prev => ({
      ...prev,
      quantity: value,
      hours_needed: calculateHoursNeeded(value, baseHours)
    }));
  };

  // ---------- MUTATIONS ----------

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not logged in');
      if (!selectedProject?.trim()) throw new Error(t('event:select_project_first', { defaultValue: 'Wybierz projekt' }));
      if (!companyId?.trim()) throw new Error(t('common:no_company', { defaultValue: 'Brak wybranej firmy' }));
      const { data: task, error: taskError } = await supabase
        .from('additional_tasks')
        .insert({
          event_id: selectedProject,
          user_id: user.id,
          description: taskDetails.description,
          start_date: taskDetails.start_date,
          end_date: taskDetails.end_date,
          hours_needed: parseFloat(taskDetails.hours_needed.toString()),
          quantity: parseFloat(taskDetails.quantity.toString()),
          company_id: companyId,
          hours_spent: 0,
          progress: 0,
          is_finished: false
        })
        .select()
        .single();
      if (taskError) throw taskError;
      if (taskDetails.materials && taskDetails.materials.length > 0) {
        const validMaterials = taskDetails.materials.filter(m => m.material && m.quantity);
        if (validMaterials.length > 0) {
          const { error: materialsError } = await supabase
            .from('additional_materials')
            .insert(
              validMaterials.map(material => ({
                event_id: selectedProject,
                user_id: user.id,
                material: material.material,
                quantity: parseFloat(material.quantity.toString()),
                unit: material.unit,
                company_id: companyId
              }))
            );
          if (materialsError) throw materialsError;

          const { error: taskMaterialsError } = await supabase
            .from('additional_task_materials')
            .insert(
              validMaterials.map(material => ({
                task_id: task.id,
                material: material.material,
                quantity: parseFloat(material.quantity.toString()),
                unit: material.unit,
                company_id: companyId
              }))
            );
          if (taskMaterialsError) throw taskMaterialsError;
        }
      }
      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['additional_tasks'] });
      queryClient.invalidateQueries({ queryKey: ['additional_materials'] });
      setShowTaskModal(false);
      setTaskDetails({
        description: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        hours_needed: '',
        quantity: '',
        materials: []
      });
      setSelectedTaskTemplate('');
    },
    onError: (error) => {
      console.error('Error in addTaskMutation:', error);
      alert(t('common:failed_create_task'));
    }
  });

  const deleteTaskEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase
        .from('task_progress_entries')
        .delete()
        .eq('id', entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today_task_entries'] });
      queryClient.invalidateQueries({ queryKey: ['task_progress'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['events', companyId] });
      showToast(t('event:entry_deleted', { defaultValue: 'Wpis usunięty' }));
    }
  });

  const deleteAdditionalEntryMutation = useMutation({
    mutationFn: async ({ entryId, taskId }: { entryId: string; taskId: string }) => {
      const { error } = await supabase
        .from('additional_task_progress_entries')
        .delete()
        .eq('id', entryId);
      if (error) throw error;

      const { data: entries } = await supabase
        .from('additional_task_progress_entries')
        .select('progress_percentage, hours_spent')
        .eq('task_id', taskId);

      const totalProgress = Math.min(
        (entries || []).reduce((sum, entry) => sum + (entry.progress_percentage || 0), 0),
        100
      );
      const totalHours = (entries || []).reduce((sum, entry) => sum + (entry.hours_spent || 0), 0);

      const { error: taskError } = await supabase
        .from('additional_tasks')
        .update({
          progress: totalProgress,
          hours_spent: totalHours,
          is_finished: totalProgress >= 100
        })
        .eq('id', taskId);
      if (taskError) throw taskError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today_additional_entries'] });
      queryClient.invalidateQueries({ queryKey: ['additional_tasks'] });
      showToast(t('event:entry_deleted', { defaultValue: 'Wpis usunięty' }));
    }
  });

  const handleTaskSubmit = () => {
    if (!taskDetails.description || !taskDetails.start_date || !taskDetails.end_date || !taskDetails.hours_needed) return;
    addTaskMutation.mutate();
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'task') {
      deleteTaskEntryMutation.mutate(deleteTarget.id);
    } else {
      deleteAdditionalEntryMutation.mutate({ entryId: deleteTarget.id, taskId: deleteTarget.taskId! });
    }
    setDeleteTarget(null);
  };

  // ---------- RENDER HELPERS ----------

  const SectionTitle = ({ label }: { label: string }) => (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="text-[13px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-gray-700" />
    </div>
  );

  const renderFolderTasks = (folderTasks: any[]) => (
    <div className="space-y-1 mt-1">
      {folderTasks.map((task: any) => (
        <div
          key={task.id}
          className="flex items-center justify-between px-3.5 py-3 bg-gray-50 rounded-lg border border-transparent hover:border-gray-200 active:bg-gray-100 transition-colors gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium leading-tight">{task.name}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {task.amount} &middot; est. {task.hours_worked || 0}h
            </div>
          </div>
          <button
            className="bg-blue-600 text-white text-[13px] font-semibold px-3.5 py-2 rounded-md whitespace-nowrap hover:bg-blue-700 active:scale-[0.96] transition-all flex-shrink-0"
            onClick={() => { setProgressTask(task); setShowProgressModal(true); }}
          >
            {t('event:add_task', { defaultValue: 'Dodaj' })}
          </button>
        </div>
      ))}
    </div>
  );

  // ---------- RENDER ----------

  return (
    <div className="min-h-screen bg-gray-800">
      <div className="max-w-5xl mx-auto min-h-screen relative">
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 bg-gray-800/85 backdrop-blur-xl border-b border-gray-700 px-4 md:px-6 py-3">
          <h1 className="text-xl font-bold tracking-tight">{t('event:add_hours_progress')}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{formattedDate}</p>
        </header>

        {/* Content */}
        <div className="px-4 md:px-6 pt-4 pb-24">
          {/* Controls Grid - 3 cols on desktop */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{t('common:date')}</span>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="!rounded-lg !text-[15px] !py-2.5 !px-3"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{t('event:project_label')}</span>
              <select
                value={selectedProject}
                onChange={e => setSelectedProject(e.target.value)}
                className="!rounded-lg !text-[15px] !py-2.5 !px-3 !pr-9"
              >
                <option value="">{t('event:select_project')}</option>
                {projects.map((proj: any) => (
                  <option key={proj.id} value={proj.id}>{proj.title}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{t('event:search_tasks')}</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  value={taskSearch}
                  onChange={e => setTaskSearch(e.target.value)}
                  className="!pl-9 !rounded-lg !text-[15px] !py-2.5"
                  placeholder={t('event:search_tasks_placeholder', { defaultValue: 'np. piasek, krawężniki...' })}
                />
                {taskSearch && (
                  <button
                    onClick={() => setTaskSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-gray-100 w-6 h-6 rounded-full flex items-center justify-center text-gray-500 text-sm min-h-0 min-w-0"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Two-column layout on desktop: tasks left, entries right */}
          <div className="flex flex-col lg:flex-row lg:gap-6">
            {/* Left column: Tasks + Additional Tasks */}
            <div className="flex-1 min-w-0">
              {/* Tasks Section */}
              <SectionTitle label={t('event:tasks_label')} />

              {isTasksLoading || isFoldersLoading ? (
                <div className="text-center text-gray-500 py-4 text-sm">{t('event:loading_tasks')}</div>
              ) : (
                <div className="space-y-2">
                  {folders.map((folder: any) => (
                    (!taskSearch || tasksByFolder[folder.id]?.length > 0) ? (
                      <div key={folder.id} className="rounded-lg overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 cursor-pointer select-none transition-colors hover:bg-gray-50 active:bg-gray-50 min-h-0"
                          onClick={() => toggleFolder(folder.id)}
                        >
                          <div className="flex items-center gap-2.5 font-semibold text-sm">
                            <ChevronRight className={`w-[18px] h-[18px] text-gray-500 flex-shrink-0 transition-transform duration-300 ${expandedFolders.includes(folder.id) ? 'rotate-90' : ''}`} />
                            <span>{folder.name}</span>
                          </div>
                          <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                            {tasksByFolder[folder.id]?.length || 0}
                          </span>
                        </button>
                        {expandedFolders.includes(folder.id) && tasksByFolder[folder.id]?.length > 0 && (
                          renderFolderTasks(tasksByFolder[folder.id])
                        )}
                      </div>
                    ) : null
                  ))}

                  {/* Unorganized tasks */}
                  {(tasksByFolder['unorganized'] || []).length > 0 && (!taskSearch || tasksByFolder['unorganized']?.length > 0) && (
                    <div className="rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 cursor-pointer select-none transition-colors hover:bg-gray-50 active:bg-gray-50 min-h-0"
                        onClick={() => toggleFolder('unorganized')}
                      >
                        <div className="flex items-center gap-2.5 font-semibold text-sm">
                          <ChevronRight className={`w-[18px] h-[18px] text-gray-500 flex-shrink-0 transition-transform duration-300 ${expandedFolders.includes('unorganized') ? 'rotate-90' : ''}`} />
                          <span>{t('event:other_tasks')}</span>
                        </div>
                        <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                          {tasksByFolder['unorganized']?.length || 0}
                        </span>
                      </button>
                      {expandedFolders.includes('unorganized') && (
                        renderFolderTasks(tasksByFolder['unorganized'])
                      )}
                    </div>
                  )}

                  {taskSearch && Object.values(tasksByFolder).every(t => t.length === 0) && (
                    <div className="bg-gray-50 p-4 rounded-lg text-gray-500 text-center text-[13px] border border-dashed border-gray-200">
                      {t('event:no_tasks_found_matching', { defaultValue: `No tasks found matching "${taskSearch}"` }).replace('{query}', taskSearch)}
                    </div>
                  )}
                  {!taskSearch && folders.length === 0 && (tasksByFolder['unorganized'] || []).length === 0 && (
                    <div className="bg-gray-50 p-4 rounded-lg text-gray-500 text-center text-[13px] border border-dashed border-gray-200">
                      {t('event:no_tasks_for_project')}
                    </div>
                  )}
                </div>
              )}

              {/* Divider */}
              <div className="h-px bg-gray-700 my-5" />

              {/* Additional Tasks */}
              <div>
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 mb-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <Plus className="w-4 h-4" />
                    <span>{t('event:additional_tasks')}</span>
                  </div>
                  <button
                    onClick={() => setShowTaskModal(true)}
                    disabled={!selectedProject}
                    className="inline-flex items-center gap-1 bg-blue-600 text-white text-[13px] font-semibold px-3 py-1.5 rounded-md hover:bg-blue-700 active:scale-[0.96] transition-all min-h-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('event:add_task')}
                  </button>
                </div>
                {isAdditionalTasksLoading ? (
                  <div className="text-center text-gray-500 py-4 text-sm">{t('event:loading_additional_tasks')}</div>
                ) : (
                  <div className="space-y-1">
                    {filteredAdditionalTasks.map((task: any) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between px-3.5 py-3 bg-gray-50 rounded-lg border border-transparent hover:border-gray-200 active:bg-gray-100 transition-colors gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium leading-tight">{task.description}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {task.quantity || 0} &middot; {task.hours_spent || 0}h / {task.hours_needed || 0}h
                          </div>
                          {task.additional_task_materials?.length > 0 && (
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              {task.additional_task_materials.map((m: { material: string; quantity: number; unit: string }) => `${m.material} (${m.quantity} ${m.unit})`).join(', ')}
                            </div>
                          )}
                        </div>
                        <button
                          className="bg-blue-600 text-white text-[13px] font-semibold px-3.5 py-2 rounded-md whitespace-nowrap hover:bg-blue-700 active:scale-[0.96] transition-all flex-shrink-0"
                          onClick={() => {
                            setSelectedAdditionalTask(task);
                            setProgressDetails({ progress: '', hoursWorked: '', notes: '' });
                            setShowAdditionalTaskProgressModal(true);
                          }}
                        >
                          {t('event:add_task', { defaultValue: 'Dodaj' })}
                        </button>
                      </div>
                    ))}
                    {filteredAdditionalTasks.length === 0 && (
                      <div className="text-center py-6 text-[13px] text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        {t('event:no_additional_tasks_for_project', { defaultValue: t('event:no_additional_tasks') })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right column: Today's Entries (sidebar on desktop) */}
            <div className="lg:w-80 xl:w-96 flex-shrink-0 mt-5 lg:mt-0">
              {/* Divider - mobile only */}
              <div className="h-px bg-gray-700 mb-5 lg:hidden" />

              <div className="lg:sticky lg:top-16">
                <SectionTitle label={t('event:todays_entries', { defaultValue: 'Dzisiejsze wpisy' })} />

                {allTodayEntries.length === 0 ? (
                  <div className="text-center py-6 text-[13px] text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    {t('event:no_entries_today', { defaultValue: 'Brak wpisów na ten dzień' })}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {allTodayEntries.map((entry) => (
                      <div
                        key={`${entry.type}-${entry.id}`}
                        className="flex items-center gap-3 px-3.5 py-2.5 bg-gray-50 rounded-lg border border-gray-200 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate">{entry.taskName}</p>
                          <div className="flex gap-2.5 items-center text-[11px] text-gray-500 mt-0.5">
                            <span>{entry.meta}</span>
                            <span>&middot;</span>
                            <span>{entry.time}</span>
                          </div>
                        </div>
                        <span className="bg-gray-100 text-blue-600 text-xs font-bold px-2 py-0.5 rounded-md whitespace-nowrap">
                          {entry.hours}h
                        </span>
                        {isToday && (
                          <button
                            onClick={() => setDeleteTarget({
                              id: entry.id,
                              type: entry.type,
                              name: entry.taskName,
                              taskId: entry.type === 'additional' ? (entry as any).taskId : undefined
                            })}
                            className="bg-gray-100 text-red-500 w-8 h-8 flex items-center justify-center rounded-md hover:bg-red-50 active:scale-[0.92] transition-all flex-shrink-0 min-h-0 min-w-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {allTodayEntries.length > 0 && (
                  <div className="text-center py-3">
                    <span className="text-[13px] text-gray-500">
                      {t('event:total_today', { defaultValue: 'Łącznie dzisiaj:' })}
                    </span>
                    <span className="text-[15px] font-bold text-blue-600 ml-1.5">
                      {parseFloat(totalTodayHours.toFixed(1))}h
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Modal for normal tasks */}
      {showProgressModal && progressTask && progressTask.name && (
        <TaskProgressModal
          task={progressTask}
          onClose={() => {
            setShowProgressModal(false);
            setProgressTask(null);
            queryClient.invalidateQueries({ queryKey: ['today_task_entries'] });
          }}
          createdAt={getCreatedAt(selectedDate)}
        />
      )}

      {/* Progress Modal for additional tasks */}
      {showAdditionalTaskProgressModal && selectedAdditionalTask && (
        <Modal title={t('event:update_additional_task_progress')} onClose={() => { setShowAdditionalTaskProgressModal(false); setSelectedAdditionalTask(null); }}>
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">{t('event:current_progress')}</span>
                <span className="font-semibold">{selectedAdditionalTask.progress || 0}%</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">{t('event:hours_worked_label')}</span>
                <span className="font-semibold">{selectedAdditionalTask.hours_spent || 0} / {selectedAdditionalTask.hours_needed || 0}h</span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(selectedAdditionalTask.progress || 0, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:progress_percentage')}</label>
              <input
                type="number"
                value={progressDetails.progress}
                onChange={e => setProgressDetails(prev => ({ ...prev, progress: e.target.value }))}
                min="0"
                max="100"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('event:enter_progress_percentage')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:hours_worked_label')}</label>
              <input
                type="number"
                value={progressDetails.hoursWorked}
                onChange={e => setProgressDetails(prev => ({ ...prev, hoursWorked: e.target.value }))}
                min="0"
                step="0.5"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('event:enter_hours_worked')}
              />
              <div className="flex gap-1.5 mt-2">
                {[1, 2, 4, 8].map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setProgressDetails(prev => ({ ...prev, hoursWorked: h.toString() }))}
                    className={`flex-1 py-1.5 text-[13px] font-semibold rounded-md border transition-colors min-h-0 ${
                      progressDetails.hoursWorked === h.toString()
                        ? 'bg-blue-600 bg-opacity-10 border-blue-600 text-blue-600'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('event:notes_optional')} <span className="font-normal text-gray-500">({t('event:optional_label', { defaultValue: 'opcjonalne' })})</span>
              </label>
              <textarea
                value={progressDetails.notes}
                onChange={e => setProgressDetails(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('event:add_notes_progress', { defaultValue: 'Dodaj uwagi...' })}
              />
            </div>

            <button
              onClick={async () => {
                if (!user?.id || !selectedAdditionalTask?.id || !progressDetails.progress || !progressDetails.hoursWorked) return;
                setIsUpdating(true);
                try {
                  const { error: entryError } = await supabase
                    .from('additional_task_progress_entries')
                    .insert({
                      task_id: selectedAdditionalTask.id,
                      user_id: user.id,
                      event_id: selectedAdditionalTask.event_id,
                      progress_percentage: parseFloat(progressDetails.progress),
                      hours_spent: parseFloat(progressDetails.hoursWorked),
                      notes: progressDetails.notes || null,
                      created_at: getCreatedAt(selectedDate),
                      company_id: companyId
                    });
                  if (entryError) throw entryError;
                  const { data: entries } = await supabase
                    .from('additional_task_progress_entries')
                    .select('progress_percentage, hours_spent')
                    .eq('task_id', selectedAdditionalTask.id);
                  const totalProgress = Math.min((entries || []).reduce((sum, entry) => sum + (entry.progress_percentage || 0), 0), 100);
                  const totalHours = (entries || []).reduce((sum, entry) => sum + (entry.hours_spent || 0), 0);
                  const { error: taskError } = await supabase
                    .from('additional_tasks')
                    .update({
                      progress: totalProgress,
                      hours_spent: totalHours,
                      is_finished: totalProgress >= 100
                    })
                    .eq('id', selectedAdditionalTask.id);
                  if (taskError) throw taskError;
                  setShowAdditionalTaskProgressModal(false);
                  setSelectedAdditionalTask(null);
                  setProgressDetails({ progress: '', hoursWorked: '', notes: '' });
                  queryClient.invalidateQueries({ queryKey: ['today_additional_entries'] });
                  queryClient.invalidateQueries({ queryKey: ['additional_tasks'] });
                  showToast(t('event:success', { defaultValue: 'Postęp zapisany!' }));
                } catch (err) {
                  alert(t('common:failed_update_progress'));
                } finally {
                  setIsUpdating(false);
                }
              }}
              disabled={isUpdating || !progressDetails.progress || !progressDetails.hoursWorked}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-bold text-[15px] hover:bg-blue-700 transition-colors disabled:opacity-40 active:scale-[0.98]"
            >
              {isUpdating ? t('event:updating') : t('event:update_progress')}
            </button>
          </div>
        </Modal>
      )}

      {/* Add Additional Task Modal */}
      {showTaskModal && (
        <Modal title={t('event:add_additional_task')} onClose={() => setShowTaskModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:task_type')}</label>
              <select
                value={selectedTaskTemplate}
                onChange={(e) => handleTaskTemplateChange(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">{t('event:select_task_type')}</option>
                {taskTemplates.map((template: any) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
                <option value="other">{t('event:other_custom_task')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:task_description')}</label>
              <textarea
                value={taskDetails.description}
                onChange={(e) => setTaskDetails({ ...taskDetails, description: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                rows={3}
                placeholder={t('event:describe_task')}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('event:start_date')}</label>
                <input
                  type="date"
                  value={taskDetails.start_date}
                  onChange={(e) => setTaskDetails({ ...taskDetails, start_date: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('event:end_date')}</label>
                <input
                  type="date"
                  value={taskDetails.end_date}
                  onChange={(e) => setTaskDetails({ ...taskDetails, end_date: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  min={taskDetails.start_date}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('event:quantity_label')} {selectedTaskTemplate && taskTemplates.find((t: any) => t.id === selectedTaskTemplate)?.unit ?
                  `(${taskTemplates.find((t: any) => t.id === selectedTaskTemplate)?.unit})` : ''}
              </label>
              <input
                type="number"
                value={taskDetails.quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('event:enter_quantity')}
                min="0"
                step="0.5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('event:hours_needed_auto_calculated', { defaultValue: t('event:hours_needed') })}</label>
              <input
                type="number"
                value={taskDetails.hours_needed}
                readOnly
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50"
                placeholder={t('event:hours_calculated')}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">{t('event:materials_needed')}</label>
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="text-sm text-blue-600 hover:text-blue-700 min-h-0 min-w-0"
                >
                  {t('event:add_material_button')}
                </button>
              </div>
              <div className="space-y-3">
                {taskDetails.materials.map((material: any, index: number) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <select
                        value={material.material}
                        onChange={(e) => {
                          if (e.target.value === 'other') {
                            setSelectedMaterialIndex(index);
                            setShowUnspecifiedMaterialModal(true);
                            return;
                          }
                          handleMaterialChange(index, 'material', e.target.value);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      >
                        <option value="">{t('event:select_material')}</option>
                        <option value="other" className="font-medium text-blue-600">{t('event:other_custom_material')}</option>
                        {materialTemplates.map((template: any) => (
                          <option key={template.id} value={template.name}>
                            {template.name} ({template.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        value={material.quantity}
                        onChange={(e) => handleMaterialChange(index, 'quantity', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder={t('event:qty_label', { defaultValue: t('event:qty_placeholder') })}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="w-24">
                      <input
                        type="text"
                        value={material.unit}
                        onChange={(e) => handleMaterialChange(index, 'unit', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder={t('event:unit_label')}
                        readOnly={!!material.material && material.material !== 'other'}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveMaterial(index)}
                      className="mt-1 text-red-600 hover:text-red-700 min-h-0 min-w-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ))}
                {taskDetails.materials.length === 0 && (
                  <div className="text-center py-4 text-[12px] text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    {t('event:no_additional_materials_yet', { defaultValue: 'Brak dodanych materiałów' })}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleTaskSubmit}
              disabled={addTaskMutation.isPending || !selectedProject || !companyId}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-bold text-[15px] hover:bg-blue-700 transition-colors disabled:opacity-40 active:scale-[0.98] disabled:cursor-not-allowed"
            >
              {addTaskMutation.isPending ? t('event:adding') : t('event:add_task')}
            </button>
          </div>
        </Modal>
      )}

      {showUnspecifiedMaterialModal && (
        <UnspecifiedMaterialModal
          onClose={() => setShowUnspecifiedMaterialModal(false)}
          onSave={(materialData: any) => {
            if (selectedMaterialIndex === null) return;
            setTaskDetails(prev => ({
              ...prev,
              materials: prev.materials.map((m, idx) => {
                if (idx === selectedMaterialIndex) {
                  return {
                    material: materialData.name,
                    quantity: materialData.total_amount.toString(),
                    unit: materialData.unit
                  };
                }
                return m;
              })
            }));
            setShowUnspecifiedMaterialModal(false);
          }}
          projects={selectedProject ? [{ id: selectedProject, title: 'Current Project' }] : []}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 z-[150] flex items-center justify-center p-6" onClick={() => setDeleteTarget(null)}>
          <div
            className="bg-white border border-gray-200 rounded-xl p-6 max-w-[300px] w-full text-center animate-in"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-2">{t('event:confirm_deletion_title', { defaultValue: 'Usunąć wpis?' })}</h3>
            <p className="text-[13px] text-gray-600 mb-5 leading-relaxed">
              {t('event:delete_entry_confirm', { defaultValue: `Czy na pewno chcesz usunąć wpis "${deleteTarget.name}"?` })}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setDeleteTarget(null)}
                className="bg-gray-50 border border-gray-200 rounded-lg py-2.5 text-sm font-semibold transition-colors active:bg-gray-100"
              >
                {t('event:cancel')}
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="bg-red-500 text-white border-none rounded-lg py-2.5 text-sm font-semibold transition-colors active:bg-red-600 active:scale-[0.96]"
              >
                {t('event:delete_action', { defaultValue: 'Usuń' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div
        className={`fixed bottom-6 left-1/2 z-[200] bg-green-500 text-white px-6 py-3 rounded-xl text-sm font-semibold shadow-lg whitespace-nowrap transition-all duration-300 ${
          toastVisible
            ? '-translate-x-1/2 translate-y-0 opacity-100'
            : '-translate-x-1/2 translate-y-24 opacity-0 pointer-events-none'
        }`}
      >
        ✓ {toastMessage}
      </div>
    </div>
  );
};

export default UserHoursPage;
