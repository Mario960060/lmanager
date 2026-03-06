import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { translateTaskName, translateMaterialName } from '../lib/translationMap';
import { supabase } from '../lib/supabase';
import TaskProgressModal from './TaskProgressModal';
import { format } from 'date-fns';
import { useAuthStore } from '../lib/store';
import { Plus, X, ChevronRight, Search, Trash2 } from 'lucide-react';
import UnspecifiedMaterialModal from './UnspecifiedMaterialModal';
import DatePicker from './DatePicker';
import {
  Modal, Card, SectionHeader, EmptyState, Button, Label, TextInput, Textarea, SelectDropdown,
  ConfirmDialog, colors, spacing, radii, fontSizes, fontWeights, fonts, layout, transitions, shadows,
} from '../themes';

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
  const { t } = useTranslation(['common', 'form', 'utilities', 'event', 'calculator', 'material']);
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

  const renderFolderTasks = (folderTasks: any[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, marginTop: spacing.sm }}>
      {folderTasks.map((task: any) => (
        <div
          key={task.id}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', background: colors.bgCardInner, border: `1px solid ${colors.borderDefault}`,
            borderRadius: radii.xl, gap: spacing.lg, transition: transitions.fast,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: fontSizes.md, fontWeight: fontWeights.semibold, fontFamily: fonts.display, color: colors.textSecondary, lineHeight: 1.2 }}>
              {translateTaskName(task.name, t)}
            </div>
            <div style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, marginTop: 2 }}>
              {task.amount} &middot; {t('common:est_abbr')} {task.hours_worked || 0}h
            </div>
          </div>
          <Button variant="primary" onClick={() => { setProgressTask(task); setShowProgressModal(true); }} style={{ fontSize: fontSizes.base, padding: '8px 16px' }}>
            {t('event:add_task', { defaultValue: 'Dodaj Zadanie' })}
          </Button>
        </div>
      ))}
    </div>
  );

  // ---------- RENDER ----------

  return (
    <div style={{ minHeight: '100vh', background: colors.bgMain }}>
      <div style={{ maxWidth: layout.maxContentWidth, margin: '0 auto', minHeight: '100vh', position: 'relative', padding: layout.contentPadding }}>
        {/* Header */}
        <header style={{ marginBottom: spacing["6xl"] }}>
          <h1 style={{ fontSize: fontSizes["3xl"], fontWeight: fontWeights.extrabold, fontFamily: fonts.display, color: colors.textPrimary, letterSpacing: '0.5px', margin: 0 }}>
            {t('event:add_hours_progress')}
          </h1>
          <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, marginTop: 4 }}>
            {formattedDate}
          </p>
        </header>

        {/* Filter Bar */}
        <Card padding={`${spacing["4xl"]}px ${spacing["5xl"]}px`} style={{ marginBottom: spacing["6xl"] }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 20, alignItems: 'center' }}>
            <div>
              <Label style={{ marginBottom: 6 }}>{t('common:date')}</Label>
              <DatePicker value={selectedDate} onChange={setSelectedDate} />
            </div>
            <div>
              <Label style={{ marginBottom: 6 }}>{t('event:project_label')}</Label>
              <SelectDropdown
                value={selectedProject ? projects.find((p: any) => p.id === selectedProject)?.title || '' : ''}
                options={projects.map((p: any) => p.title)}
                onChange={(val) => {
                  const proj = projects.find((p: any) => p.title === val);
                  setSelectedProject(proj?.id || '');
                }}
                placeholder={t('event:select_project')}
              />
            </div>
            <div>
              <Label style={{ marginBottom: 6 }}>{t('event:search_tasks')}</Label>
              <div style={{
                display: 'flex', alignItems: 'center',
                background: colors.bgInput, border: `1px solid ${colors.borderInput}`,
                borderRadius: radii.xl, overflow: 'hidden',
              }}>
                <Search style={{ paddingLeft: 12, width: 16, height: 16, color: colors.textFaint, flexShrink: 0 }} />
                <input
                  type="text"
                  value={taskSearch}
                  onChange={e => setTaskSearch(e.target.value)}
                  placeholder={t('event:search_tasks_placeholder', { defaultValue: 'np. piasek, krawężniki...' })}
                  style={{
                    flex: 1, padding: '12px 14px', background: 'transparent', border: 'none',
                    color: colors.textSecondary, fontSize: fontSizes.md, fontFamily: fonts.body, outline: 'none',
                  }}
                />
                {taskSearch && (
                  <button
                    onClick={() => setTaskSearch('')}
                    style={{ padding: 8, background: 'transparent', color: colors.textFaint, border: 'none', cursor: 'pointer', fontSize: 14 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = colors.textFaint; }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Left column: Tasks + Additional Tasks */}
          <div style={{ minWidth: 0 }}>
            <SectionHeader title={t('event:tasks_label')} style={{ marginBottom: spacing.lg }} />

            {isTasksLoading || isFoldersLoading ? (
              <div style={{ textAlign: 'center', color: colors.textDim, padding: spacing["6xl"], fontSize: fontSizes.sm }}>{t('event:loading_tasks')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {folders.map((folder: any) => (
                  (!taskSearch || tasksByFolder[folder.id]?.length > 0) ? (
                    <div key={folder.id} style={{ borderRadius: radii["2xl"], overflow: 'hidden' }}>
                      <button
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: colors.bgCard, border: `1px solid ${colors.borderDefault}`,
                          borderRadius: radii["2xl"], padding: '12px 16px', cursor: 'pointer', borderLeft: '3px solid transparent',
                          transition: transitions.fast,
                        }}
                        onClick={() => toggleFolder(folder.id)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, fontSize: fontSizes.md, fontWeight: fontWeights.semibold, fontFamily: fonts.display, color: colors.textSecondary }}>
                          <ChevronRight style={{ width: 18, height: 18, color: colors.textFaint, flexShrink: 0, transform: expandedFolders.includes(folder.id) ? 'rotate(90deg)' : 'none', transition: 'transform 0.3s' }} />
                          <span>{folder.name}</span>
                        </div>
                        <span style={{ background: colors.accentBlue, color: '#fff', fontSize: fontSizes.sm, fontWeight: fontWeights.bold, padding: '2px 8px', borderRadius: radii.full, minWidth: 22, textAlign: 'center' }}>
                          {tasksByFolder[folder.id]?.length || 0}
                        </span>
                      </button>
                      {expandedFolders.includes(folder.id) && tasksByFolder[folder.id]?.length > 0 && (
                        <div style={{ padding: spacing.sm, background: colors.bgCard, border: `1px solid ${colors.borderDefault}`, borderTop: 'none', borderRadius: `0 0 ${radii["2xl"]}px ${radii["2xl"]}px` }}>
                          {renderFolderTasks(tasksByFolder[folder.id])}
                        </div>
                      )}
                    </div>
                  ) : null
                ))}

                {(tasksByFolder['unorganized'] || []).length > 0 && (!taskSearch || tasksByFolder['unorganized']?.length > 0) && (
                  <div style={{ borderRadius: radii["2xl"], overflow: 'hidden' }}>
                    <button
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: colors.bgCard, border: `1px solid ${colors.borderDefault}`,
                        borderRadius: radii["2xl"], padding: '12px 16px', cursor: 'pointer',
                        transition: transitions.fast,
                      }}
                      onClick={() => toggleFolder('unorganized')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, fontSize: fontSizes.md, fontWeight: fontWeights.semibold, fontFamily: fonts.display, color: colors.textSecondary }}>
                        <ChevronRight style={{ width: 18, height: 18, color: colors.textFaint, flexShrink: 0, transform: expandedFolders.includes('unorganized') ? 'rotate(90deg)' : 'none', transition: 'transform 0.3s' }} />
                        <span>{t('event:other_tasks')}</span>
                      </div>
                      <span style={{ background: colors.accentBlue, color: '#fff', fontSize: fontSizes.sm, fontWeight: fontWeights.bold, padding: '2px 8px', borderRadius: radii.full, minWidth: 22, textAlign: 'center' }}>
                        {tasksByFolder['unorganized']?.length || 0}
                      </span>
                    </button>
                    {expandedFolders.includes('unorganized') && (
                      <div style={{ padding: spacing.sm, background: colors.bgCard, border: `1px solid ${colors.borderDefault}`, borderTop: 'none', borderRadius: `0 0 ${radii["2xl"]}px ${radii["2xl"]}px` }}>
                        {renderFolderTasks(tasksByFolder['unorganized'])}
                      </div>
                    )}
                  </div>
                )}

                {taskSearch && Object.values(tasksByFolder).every(t => t.length === 0) && (
                  <EmptyState icon="🔍" title={t('event:no_tasks_found_matching', { defaultValue: `Nie znaleziono zadań dla "${taskSearch}"` }).replace('{query}', taskSearch)} style={{ background: colors.bgCard, border: `1px solid ${colors.borderDefault}` }} />
                )}
                {!taskSearch && folders.length === 0 && (tasksByFolder['unorganized'] || []).length === 0 && (
                  <EmptyState icon="📋" title={t('event:no_tasks_for_project')} style={{ background: colors.bgCard, border: `1px solid ${colors.borderDefault}` }} />
                )}
              </div>
            )}

            <div style={{ marginTop: spacing["6xl"] }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: colors.bgCard, border: `1px solid ${colors.borderDefault}`,
                borderRadius: radii["2xl"], padding: '12px 16px', marginBottom: spacing.sm,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, fontSize: fontSizes.md, fontWeight: fontWeights.semibold, fontFamily: fonts.display, color: colors.textSecondary }}>
                  <Plus style={{ width: 16, height: 16 }} />
                  <span>+ {t('event:additional_tasks')}</span>
                </div>
                <Button variant="accent" color={colors.accentBlue} icon="+" onClick={() => setShowTaskModal(true)} disabled={!selectedProject}>
                  {t('event:add_task')}
                </Button>
              </div>
              {isAdditionalTasksLoading ? (
                <div style={{ textAlign: 'center', color: colors.textDim, padding: spacing["6xl"], fontSize: fontSizes.sm }}>{t('event:loading_additional_tasks')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  {filteredAdditionalTasks.map((task: any) => (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px', background: colors.bgCardInner, border: `1px solid ${colors.borderDefault}`,
                        borderRadius: radii.xl, gap: spacing.lg, transition: transitions.fast,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: fontSizes.md, fontWeight: fontWeights.semibold, fontFamily: fonts.display, color: colors.textSecondary }}>{translateTaskName(task.description ?? '', t)}</div>
                        <div style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, marginTop: 2 }}>
                          {task.quantity || 0} &middot; {task.hours_spent || 0}h / {task.hours_needed || 0}h
                        </div>
                        {task.additional_task_materials?.length > 0 && (
                          <div style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body, marginTop: 2 }}>
                            {task.additional_task_materials.map((m: { material: string; quantity: number; unit: string }) => `${translateMaterialName(m.material, t)} (${m.quantity} ${m.unit})`).join(', ')}
                          </div>
                        )}
                      </div>
                      <Button variant="primary" onClick={() => { setSelectedAdditionalTask(task); setProgressDetails({ progress: '', hoursWorked: '', notes: '' }); setShowAdditionalTaskProgressModal(true); }} style={{ fontSize: fontSizes.base, padding: '8px 16px' }}>
                        {t('event:add_task', { defaultValue: 'Dodaj Zadanie' })}
                      </Button>
                    </div>
                  ))}
                  {filteredAdditionalTasks.length === 0 && (
                    <EmptyState icon="📝" title={t('event:no_additional_tasks_for_project', { defaultValue: t('event:no_additional_tasks') })} style={{ background: colors.bgCard, border: `1px solid ${colors.borderDefault}` }} />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Today's Entries */}
          <div style={{ minWidth: 0 }}>
            <SectionHeader title={t('event:todays_entries', { defaultValue: 'Dzisiejsze wpisy' })} style={{ marginBottom: spacing.lg }} />

            {allTodayEntries.length === 0 ? (
              <EmptyState icon="📭" title={t('event:no_entries_today', { defaultValue: 'Brak wpisów na ten dzień' })} style={{ background: colors.bgCard, border: `1px solid ${colors.borderDefault}` }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                {allTodayEntries.map((entry) => (
                  <div
                    key={`${entry.type}-${entry.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: spacing.lg,
                      padding: '12px 16px', background: colors.bgCard, border: `1px solid ${colors.borderDefault}`,
                      borderRadius: radii.xl,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: fontSizes.md, fontWeight: fontWeights.semibold, fontFamily: fonts.display, color: colors.textSecondary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{translateTaskName(entry.taskName, t)}</p>
                      <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, marginTop: 2 }}>
                        <span>{entry.meta}</span>
                        <span>&middot;</span>
                        <span>{entry.time}</span>
                      </div>
                    </div>
                    <span style={{ background: 'rgba(34,197,94,0.15)', color: colors.greenLight, fontSize: fontSizes.sm, fontWeight: fontWeights.bold, padding: '2px 8px', borderRadius: radii.md, whiteSpace: 'nowrap' }}>
                      {entry.hours}h
                    </span>
                    {isToday && (
                      <button
                        onClick={() => setDeleteTarget({ id: entry.id, type: entry.type, name: entry.taskName, taskId: entry.type === 'additional' ? (entry as any).taskId : undefined })}
                        style={{ width: 28, height: 28, borderRadius: radii.md, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: colors.textFaint, border: 'none', cursor: 'pointer', flexShrink: 0 }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = colors.red; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = colors.textFaint; }}
                      >
                        <Trash2 style={{ width: 16, height: 16 }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {allTodayEntries.length > 0 && (
              <div style={{ textAlign: 'center', padding: spacing.lg, marginTop: spacing.lg }}>
                <span style={{ fontSize: fontSizes.md, color: colors.textDim, fontFamily: fonts.body }}>
                  {t('event:total_today', { defaultValue: 'Łącznie dzisiaj:' })}{' '}
                </span>
                <span style={{ fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: colors.green }}>
                  {parseFloat(totalTodayHours.toFixed(1))}h
                </span>
              </div>
            )}
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
      <Modal
        open={!!(showAdditionalTaskProgressModal && selectedAdditionalTask)}
        onClose={() => { setShowAdditionalTaskProgressModal(false); setSelectedAdditionalTask(null); }}
        title={t('event:update_additional_task_progress')}
        width={520}
      >
        {selectedAdditionalTask && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
            <div style={{ background: colors.bgCardInner, padding: '16px 20px', borderRadius: radii["2xl"], border: `1px solid ${colors.borderDefault}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: fontSizes.base }}>
                <span style={{ color: colors.textDim, fontFamily: fonts.body }}>{t('event:current_progress')}</span>
                <span style={{ fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.body }}>{selectedAdditionalTask.progress || 0}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: fontSizes.base, marginTop: spacing.sm }}>
                <span style={{ color: colors.textDim, fontFamily: fonts.body }}>{t('event:hours_worked_label')}</span>
                <span style={{ fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.body }}>{selectedAdditionalTask.hours_spent || 0} / {selectedAdditionalTask.hours_needed || 0}h</span>
              </div>
              <div style={{ width: '100%', height: 3, background: colors.borderDefault, borderRadius: 2, marginTop: spacing.sm, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: colors.accentBlue, borderRadius: 2, width: `${Math.min(selectedAdditionalTask.progress || 0, 100)}%`, transition: 'width 0.5s' }} />
              </div>
            </div>

            <div>
              <Label>{t('event:progress_percentage')}</Label>
              <TextInput type="text" value={progressDetails.progress} onChange={v => setProgressDetails(prev => ({ ...prev, progress: v }))} placeholder={t('event:enter_progress_percentage')} />
            </div>

            <div>
              <Label>{t('event:hours_worked_label')}</Label>
              <TextInput type="text" value={progressDetails.hoursWorked} onChange={v => setProgressDetails(prev => ({ ...prev, hoursWorked: v }))} placeholder={t('event:enter_hours_worked')} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: spacing.sm }}>
                {[1, 2, 4, 8].map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setProgressDetails(prev => ({ ...prev, hoursWorked: h.toString() }))}
                    style={{
                      padding: 10, borderRadius: radii.lg, border: `1px solid ${progressDetails.hoursWorked === h.toString() ? colors.accentBlue : colors.borderDefault}`,
                      background: progressDetails.hoursWorked === h.toString() ? colors.accentBlueBg : colors.bgCardInner,
                      color: progressDetails.hoursWorked === h.toString() ? colors.accentBlue : colors.textMuted,
                      fontSize: fontSizes.md, fontWeight: fontWeights.semibold, fontFamily: fonts.body, cursor: 'pointer', transition: transitions.fast,
                    }}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>{t('event:notes_optional')} <span style={{ fontWeight: fontWeights.normal, color: colors.textFaint }}>({t('event:optional_label', { defaultValue: 'opcjonalne' })})</span></Label>
              <Textarea value={progressDetails.notes} onChange={v => setProgressDetails(prev => ({ ...prev, notes: v }))} placeholder={t('event:add_notes_progress', { defaultValue: 'Dodaj uwagi...' })} />
            </div>

            <Button
              variant="primary"
              fullWidth
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
            >
              {isUpdating ? t('event:updating') : t('event:update_progress')}
            </Button>
          </div>
        )}
      </Modal>

      {/* Add Additional Task Modal */}
      <Modal open={showTaskModal} onClose={() => setShowTaskModal(false)} title={t('event:add_additional_task')} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
            <div>
              <Label>{t('event:task_type')}</Label>
              <select
                value={selectedTaskTemplate}
                onChange={e => handleTaskTemplateChange(e.target.value)}
                style={{
                  width: '100%', padding: `${spacing.xl}px ${spacing["2xl"]}px`, background: colors.bgInput,
                  border: `1px solid ${colors.borderInput}`, borderRadius: radii.xl, color: colors.textSecondary,
                  fontSize: fontSizes.md, fontFamily: fonts.body, outline: 'none',
                }}
              >
                <option value="">{t('event:select_task_type')}</option>
                {taskTemplates.map((template: any) => (
                  <option key={template.id} value={template.id}>{translateTaskName(template.name, t)}</option>
                ))}
                <option value="other">{t('event:other_custom_task')}</option>
              </select>
            </div>
            <div>
              <Label>{t('event:task_description')}</Label>
              <Textarea value={taskDetails.description} onChange={v => setTaskDetails({ ...taskDetails, description: v })} rows={3} placeholder={t('event:describe_task')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing["6xl"] }}>
              <div>
                <Label>{t('event:start_date')}</Label>
                <DatePicker value={taskDetails.start_date} onChange={v => setTaskDetails({ ...taskDetails, start_date: v })} />
              </div>
              <div>
                <Label>{t('event:end_date')}</Label>
                <DatePicker value={taskDetails.end_date} onChange={v => setTaskDetails({ ...taskDetails, end_date: v })} minDate={taskDetails.start_date} />
              </div>
            </div>
            <div>
              <Label>{t('event:quantity_label')} {selectedTaskTemplate && taskTemplates.find((t: any) => t.id === selectedTaskTemplate)?.unit ? `(${taskTemplates.find((t: any) => t.id === selectedTaskTemplate)?.unit})` : ''}</Label>
              <TextInput type="text" value={taskDetails.quantity} onChange={v => handleQuantityChange(v)} placeholder={t('event:enter_quantity')} />
            </div>
            <div>
              <Label>{t('event:hours_needed_auto_calculated', { defaultValue: t('event:hours_needed') })}</Label>
              <div style={{
                padding: `${spacing.xl}px ${spacing["2xl"]}px`, background: colors.bgSubtle,
                border: `1px solid ${colors.borderDefault}`, borderRadius: radii.xl, color: colors.textSecondary,
                fontSize: fontSizes.md, fontFamily: fonts.body,
              }}>
                {taskDetails.hours_needed || t('event:hours_calculated')}
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <Label>{t('event:materials_needed')}</Label>
                <button type="button" onClick={handleAddMaterial} style={{ fontSize: fontSizes.sm, color: colors.accentBlue, background: 'none', border: 'none', cursor: 'pointer' }}>
                  {t('event:add_material_button')}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
                {taskDetails.materials.map((material: any, index: number) => (
                  <div key={index} style={{ display: 'flex', gap: spacing.sm, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <select
                        value={material.material}
                        onChange={(e) => {
                          if (e.target.value === 'other') { setSelectedMaterialIndex(index); setShowUnspecifiedMaterialModal(true); return; }
                          handleMaterialChange(index, 'material', e.target.value);
                        }}
                        style={{ width: '100%', padding: `${spacing.xl}px ${spacing["2xl"]}px`, background: colors.bgInput, border: `1px solid ${colors.borderInput}`, borderRadius: radii.xl, color: colors.textSecondary, fontSize: fontSizes.md, fontFamily: fonts.body }}
                      >
                        <option value="">{t('event:select_material')}</option>
                        <option value="other">{t('event:other_custom_material')}</option>
                        {materialTemplates.map((template: any) => (
                          <option key={template.id} value={template.name}>{translateMaterialName(template.name, t)} ({template.unit})</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ width: 96 }}>
                      <TextInput value={material.quantity} onChange={v => handleMaterialChange(index, 'quantity', v)} placeholder={t('event:qty_placeholder')} style={{ marginBottom: 0 }} />
                    </div>
                    <div style={{ width: 96 }}>
                      <TextInput value={material.unit} onChange={v => handleMaterialChange(index, 'unit', v)} placeholder={t('event:unit_label')} style={{ marginBottom: 0 }} />
                    </div>
                    <button type="button" onClick={() => handleRemoveMaterial(index)} style={{ padding: spacing.sm, color: colors.red, background: 'none', border: 'none', cursor: 'pointer', marginTop: spacing.xl }}>
                      <X style={{ width: 20, height: 20 }} />
                    </button>
                  </div>
                ))}
                {taskDetails.materials.length === 0 && (
                  <div style={{ textAlign: 'center', padding: spacing["6xl"], fontSize: fontSizes.sm, color: colors.textDim, background: colors.bgCard, borderRadius: radii.lg, border: `1px dashed ${colors.borderDefault}` }}>
                    {t('event:no_additional_materials_yet', { defaultValue: 'Brak dodanych materiałów' })}
                  </div>
                )}
              </div>
            </div>
            <Button variant="primary" fullWidth onClick={handleTaskSubmit} disabled={addTaskMutation.isPending || !selectedProject || !companyId}>
              {addTaskMutation.isPending ? t('event:adding') : t('event:add_task')}
            </Button>
          </div>
        </Modal>

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
          projects={selectedProject ? [{ id: selectedProject, title: t('event:current_project') }] : []}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        title={t('event:confirm_deletion_title', { defaultValue: 'Usunąć wpis?' })}
        message={deleteTarget ? t('event:delete_entry_confirm', { defaultValue: `Czy na pewno chcesz usunąć wpis "${deleteTarget.name}"?` }) : ''}
        confirmLabel={t('event:delete_action', { defaultValue: 'Usuń' })}
        cancelLabel={t('event:cancel')}
        variant="danger"
      />

      {/* Toast */}
      <div
        style={{
          position: 'fixed', bottom: 24, left: '50%', transform: toastVisible ? 'translate(-50%, 0)' : 'translate(-50%, 96px)',
          zIndex: 200, background: colors.green, color: '#fff', padding: `${spacing.lg}px ${spacing["6xl"]}px`,
          borderRadius: radii.xl, fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, boxShadow: shadows.lg,
          whiteSpace: 'nowrap', transition: 'all 0.3s', opacity: toastVisible ? 1 : 0, pointerEvents: toastVisible ? 'auto' : 'none',
        }}
      >
        ✓ {toastMessage}
      </div>
    </div>
  );
};

export default UserHoursPage;
