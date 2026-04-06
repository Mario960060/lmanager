import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { colors } from '../themes/designTokens';
import { translateTaskName, translateMaterialName, translateUnit } from '../lib/translationMap';
import { supabase } from '../lib/supabase';
import { Plus, X, CheckSquare, Clock, Package, ChevronDown } from 'lucide-react';
import Modal from './Modal';
import DatePicker from './DatePicker';
import { useAuthStore } from '../lib/store';
import UnspecifiedMaterialModal from './UnspecifiedMaterialModal';

interface AdditionalTaskMaterial {
  material: string;
  quantity: string | number;
  unit: string;
}

interface AdditionalTask {
  id?: string;
  event_id: string;
  user_id: string;
  description: string;
  start_date: string;
  end_date: string;
  hours_needed: string | number;
  quantity: string | number;
  hours_spent?: number;
  progress?: number;
  is_finished?: boolean;
  materials: AdditionalTaskMaterial[];
}

interface TaskProgressEntry {
  hours_spent: number;
  progress_percentage: number;
}

interface AdditionalMaterial {
  material: string;
  quantity: string;
  unit: string;
}

interface Props {
  eventId: string;
}

interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  unit: string;
  estimated_hours: number;
}

interface MaterialTemplate {
  id: string;
  name: string;
  unit: string;
}

const AdditionalFeatures: React.FC<Props> = ({ eventId }) => {
  const { t } = useTranslation(['common', 'utilities', 'form', 'project', 'event', 'calculator', 'material', 'units']);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [selectedTaskTemplate, setSelectedTaskTemplate] = useState<string>('');
  const [selectedMaterialTemplate, setSelectedMaterialTemplate] = useState<string>('');
  const [taskDetails, setTaskDetails] = useState<Omit<AdditionalTask, 'event_id' | 'user_id'>>({
    description: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    hours_needed: '',
    quantity: '',
    materials: []
  });
  const [materialDetails, setMaterialDetails] = useState<AdditionalMaterial>({
    material: '',
    quantity: '',
    unit: '',
  });
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AdditionalTask | null>(null);
  const [progressDetails, setProgressDetails] = useState({
    progress: '',
    hoursWorked: '',
    notes: ''
  });
  const [showUnspecifiedMaterialModal, setShowUnspecifiedMaterialModal] = useState(false);
  const [selectedMaterialIndex, setSelectedMaterialIndex] = useState<number | null>(null);
  const [taskTemplateSearch, setTaskTemplateSearch] = useState('');
  const [taskComboOpen, setTaskComboOpen] = useState(false);
  const taskComboRef = useRef<HTMLDivElement>(null);
  const taskComboInputRef = useRef<HTMLInputElement>(null);

  // Fetch additional tasks
  const { data: additionalTasks = [] } = useQuery({
    queryKey: ['additional_tasks', eventId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('additional_tasks')
        .select(`
          *,
          profiles (
            full_name
          ),
          additional_task_progress_entries (
            hours_spent,
            created_at,
            progress_percentage
          ),
          additional_task_materials (
            id,
            material,
            quantity,
            unit
          )
        `)
        .eq('event_id', eventId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform the data to include total progress and hours
      return (data || []).map(task => {
        const progressEntries = task.additional_task_progress_entries || [];
        const totalProgress = progressEntries.reduce((sum: number, entry: TaskProgressEntry) => sum + (entry.progress_percentage || 0), 0);
        const totalHours = progressEntries.reduce((sum: number, entry: TaskProgressEntry) => sum + (entry.hours_spent || 0), 0);

        // Transform materials data to match the expected format
        const materials = (task.additional_task_materials || []).map((m: { material: string; quantity: number; unit: string }): AdditionalTaskMaterial => ({
          material: m.material,
          quantity: m.quantity,
          unit: m.unit
        }));

        return {
          ...task,
          progress: Math.min(totalProgress, 100),
          hours_spent: totalHours,
          materials: materials
        };
      });
    },
    enabled: !!companyId && !!eventId
  });

  // Fetch additional materials
  const { data: additionalMaterials = [] } = useQuery({
    queryKey: ['additional_materials', eventId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('additional_materials')
        .select(`
          *,
          profiles (
            full_name
          )
        `)
        .eq('event_id', eventId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!eventId
  });

  // Fetch task templates
  const { data: taskTemplates = [] } = useQuery<TaskTemplate[]>({
    queryKey: ['task_templates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId
  });

  const filteredTaskTemplates = useMemo(() => {
    const q = taskTemplateSearch.trim().toLowerCase();
    if (!q) return taskTemplates;
    return taskTemplates.filter((template: TaskTemplate) => {
      const label = translateTaskName(template.name, t).toLowerCase();
      const raw = (template.name || '').toLowerCase();
      return label.includes(q) || raw.includes(q);
    });
  }, [taskTemplates, taskTemplateSearch, t]);

  useEffect(() => {
    if (!showTaskModal) return;
    const onDoc = (e: MouseEvent) => {
      if (taskComboRef.current && !taskComboRef.current.contains(e.target as Node)) {
        setTaskComboOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showTaskModal]);

  // Fetch material templates
  const { data: materialTemplates = [] } = useQuery<MaterialTemplate[]>({
    queryKey: ['materials', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId
  });

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not logged in');

      // Insert the task
      const { data: task, error: taskError } = await supabase
        .from('additional_tasks')
        .insert({
          event_id: eventId,
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

      // Insert materials to both additional_materials (event-level) and additional_task_materials (task-level)
      if (taskDetails.materials && taskDetails.materials.length > 0) {
        const validMaterials = taskDetails.materials.filter(m => m.material && m.quantity);
        
        if (validMaterials.length > 0) {
          const { error: materialsError } = await supabase
            .from('additional_materials')
            .insert(
              validMaterials.map(material => ({
                event_id: eventId,
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
      queryClient.invalidateQueries({ queryKey: ['additional_tasks', eventId, companyId] });
      queryClient.invalidateQueries({ queryKey: ['additional_materials', eventId, companyId] });
      setShowTaskModal(false);
      setTaskTemplateSearch('');
      setTaskComboOpen(false);
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

  const addMaterialMutation = useMutation({
    mutationFn: async (material: AdditionalMaterial) => {
      const { error } = await supabase
        .from('additional_materials')
        .insert({
          event_id: eventId,
          user_id: user?.id,
          material: material.material,
          quantity: parseFloat(material.quantity),
          unit: material.unit,
          company_id: companyId
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['additional_materials', eventId, companyId] });
      setShowMaterialModal(false);
      setMaterialDetails({
        material: '',
        quantity: '',
        unit: '',
      });
      setSelectedMaterialTemplate('');
    },
  });

  const handleTaskSubmit = () => {
    if (!taskDetails.description || !taskDetails.start_date || !taskDetails.end_date || !taskDetails.hours_needed) return;
    addTaskMutation.mutate();
  };

  const handleMaterialSubmit = () => {
    if (!materialDetails.material || !materialDetails.quantity || !materialDetails.unit) return;
    addMaterialMutation.mutate(materialDetails);
  };

  const handleTaskTemplateChange = (templateId: string) => {
    setSelectedTaskTemplate(templateId);
    if (templateId === 'other') {
      setTaskDetails(prev => ({
        ...prev,
        description: '',
        quantity: '',
        hours_needed: ''
      }));
    } else {
      const template = taskTemplates.find(t => t.id === templateId);
      if (template) {
        setTaskDetails(prev => ({
          ...prev,
          description: template.name,
          quantity: '1',
          hours_needed: (template.estimated_hours).toString()
        }));
      }
    }
  };

  const selectTaskTemplateFromCombo = (templateId: string) => {
    handleTaskTemplateChange(templateId);
    if (templateId === 'other') {
      setTaskTemplateSearch(t('event:other_custom_task'));
    } else {
      const template = taskTemplates.find((x) => x.id === templateId);
      setTaskTemplateSearch(template ? translateTaskName(template.name, t) : '');
    }
    setTaskComboOpen(false);
  };

  // Add function to calculate hours based on quantity
  const calculateHoursNeeded = (quantity: string | number, baseHours: number) => {
    const qty = parseFloat(quantity.toString()) || 0;
    return (qty * baseHours).toString();
  };

  // Update quantity change handler
  const handleQuantityChange = (value: string) => {
    const template = taskTemplates.find(t => t.id === selectedTaskTemplate);
    const baseHours = template ? template.estimated_hours : 0;
    
    setTaskDetails(prev => ({
      ...prev,
      quantity: value,
      hours_needed: calculateHoursNeeded(value, baseHours)
    }));
  };

  const handleMaterialTemplateChange = (templateId: string) => {
    setSelectedMaterialTemplate(templateId);
    if (templateId === 'other') {
      setMaterialDetails({
        material: '',
        quantity: '',
        unit: '',
      });
    } else {
      const template = materialTemplates.find((m: { id: string; name: string; unit: string }) => m.id === templateId);
      if (template) {
        setMaterialDetails(prev => ({
          ...prev,
          material: template.name,
          unit: template.unit,
        }));
      }
    }
  };

  // Add new function to handle material list
  const handleAddMaterial = () => {
    setTaskDetails(prev => ({
      ...prev,
      materials: [...prev.materials, { material: '', quantity: '', unit: '' }]
    }));
  };

  const handleRemoveMaterial = (index: number) => {
    setTaskDetails(prev => ({
      ...prev,
      materials: prev.materials.filter((_, i) => i !== index)
    }));
  };

  const handleMaterialChange = (index: number, field: 'material' | 'quantity' | 'unit', value: string) => {
    setTaskDetails(prev => ({
      ...prev,
      materials: prev.materials.map((m: AdditionalTaskMaterial, i): AdditionalTaskMaterial => {
        if (i === index) {
          if (field === 'material') {
            // Find the selected material template to get its unit
            const template = materialTemplates.find(t => t.name === value);
            return {
              ...m,
              [field]: value,
              unit: template?.unit || m.unit
            };
          }
          return { ...m, [field]: value };
        }
        return m;
      })
    }));
  };

  // Update the addProgressMutation
  const addProgressMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !selectedTask?.id) throw new Error('Missing required data');

      // Add progress entry
      const { error: entryError } = await supabase
        .from('additional_task_progress_entries')
        .insert({
          task_id: selectedTask.id,
          user_id: user?.id,
          event_id: selectedTask.event_id,
          company_id: companyId,
          progress_percentage: parseFloat(progressDetails.progress),
          hours_spent: parseFloat(progressDetails.hoursWorked),
          notes: progressDetails.notes || null,
          created_at: new Date().toISOString()
        });

      if (entryError) throw entryError;

      // Get all progress entries for this task
      const { data: entries } = await supabase
        .from('additional_task_progress_entries')
        .select('progress_percentage, hours_spent')
        .eq('task_id', selectedTask.id)
        .eq('company_id', companyId);

      // Calculate total progress and hours
      const totalProgress = Math.min(
        (entries || []).reduce((sum, entry) => sum + (entry.progress_percentage || 0), 0),
        100
      );
      const totalHours = (entries || []).reduce((sum, entry) => sum + (entry.hours_spent || 0), 0);

      // Update task with total progress and hours
      const { error: taskError } = await supabase
        .from('additional_tasks')
        .update({
          progress: totalProgress,
          hours_spent: totalHours,
          is_finished: totalProgress >= 100
        })
        .eq('id', selectedTask.id)
        .eq('company_id', companyId);

      if (taskError) throw taskError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['additional_tasks'] });
      setShowProgressModal(false);
      setSelectedTask(null);
      setProgressDetails({ progress: '', hoursWorked: '', notes: '' });
    },
    onError: (error) => {
      console.error('Error in addProgressMutation:', error);
      alert(t('common:failed_update_progress'));
    }
  });

  const handleProgressSubmit = () => {
    if (!selectedTask?.id) return;
    
    addProgressMutation.mutate();
  };

  // Add handler for unspecified material
  const handleAddUnspecifiedMaterial = (materialData: {
    name: string;
    total_amount: number;
    unit: string;
    notes: string;
    event_id: string;
  }) => {
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
  };

  const AddButtonStyle = ({ label, color, onClick }: { label: string; color: string; onClick: () => void }) => {
    const [hover, setHover] = useState(false);
    return (
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          width: "100%", padding: "10px 0", borderRadius: 10,
          border: `1px dashed ${color}40`,
          background: hover ? `${color}12` : "transparent",
          color, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          transition: "all 0.15s ease",
        }}
      >
        <Plus style={{ width: 14, height: 14 }} />
        {label}
      </button>
    );
  };

  const ProgressBarStyle = ({ value, color, height = 3 }: { value: number; color: string; height?: number }) => (
    <div style={{ width: "100%", height, borderRadius: height, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", borderRadius: height, background: color, transition: "width 0.4s ease" }} />
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {/* Additional Tasks Section */}
      <div style={{
        background: colors.bgCard,
        borderRadius: 14,
        border: `1px solid ${colors.borderDefault}`,
        padding: 18,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, marginBottom: 14 }}>
          {t('event:additional_tasks_title')}
        </div>
        <AddButtonStyle label={t('event:add_task_button')} color={colors.accentBlue} onClick={() => setShowTaskModal(true)} />
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {additionalTasks.map(task => {
            const hoursNeeded = parseFloat(task.hours_needed?.toString() || "0");
            const hoursPercent = hoursNeeded > 0 ? (task.hours_spent / hoursNeeded) * 100 : 0;
            return (
            <div key={task.id} style={{
              padding: "12px 14px", borderRadius: 10,
              background: "rgba(255,255,255,0.015)",
              border: `1px solid ${colors.borderDefault}`,
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.textPrimary, marginBottom: 3 }}>{task.description}</div>
              <div style={{ fontSize: 11.5, color: colors.textDim, marginBottom: 8 }}>
                {t('event:added_by')} {task.profiles?.full_name}
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
                <span><Clock style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", marginRight: 4 }} />{task.hours_spent} / {task.hours_needed} {t('event:hours_label')}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: colors.textMuted }}>{t('event:progress_label')}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.orange }}>{task.progress || 0}%</span>
                  </div>
                  <ProgressBarStyle value={task.progress || 0} color={colors.orange} />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: colors.textMuted }}>{t('event:hours_label')}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.orange }}>{hoursPercent.toFixed(0)}%</span>
                  </div>
                  <ProgressBarStyle value={hoursPercent} color={colors.orange} />
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedTask(task);
                  setProgressDetails({ progress: '', hoursWorked: '', notes: '' });
                  setShowProgressModal(true);
                }}
                style={{
                  marginTop: 10, padding: "6px 14px", borderRadius: 7,
                  background: "rgba(99,140,255,0.12)", border: "1px solid rgba(99,140,255,0.2)",
                  color: colors.accentBlue, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {t('event:update_progress')}
              </button>
            </div>
          );
          })}
          {additionalTasks.length === 0 && (
            <div style={{ textAlign: "center", padding: 16, fontSize: 12.5, color: colors.textDim }}>
              {t('event:no_additional_tasks_yet')}
            </div>
          )}
        </div>
      </div>

      {/* Additional Materials Section */}
      <div style={{
        background: colors.bgCard,
        borderRadius: 14,
        border: `1px solid ${colors.borderDefault}`,
        padding: 18,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, marginBottom: 14 }}>
          {t('event:additional_materials_title')}
        </div>
        <AddButtonStyle label={t('event:add_material_button')} color={colors.green} onClick={() => setShowMaterialModal(true)} />
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {additionalMaterials.map(material => (
            <div key={material.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 14px", borderRadius: 10,
              background: "rgba(255,255,255,0.015)",
              border: `1px solid ${colors.borderDefault}`,
            }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.textPrimary }}>{material.material}</div>
                <div style={{ fontSize: 11.5, color: colors.textDim, marginTop: 2 }}>
                  {t('event:quantity_label')}: {material.quantity} {material.unit} · {t('event:added_by')} {material.profiles?.full_name}
                </div>
              </div>
            </div>
          ))}
          {additionalMaterials.length === 0 && (
            <div style={{ textAlign: "center", padding: 16, fontSize: 12.5, color: colors.textDim }}>
              {t('event:no_additional_materials_yet')}
            </div>
          )}
        </div>
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <Modal title={t('event:add_additional_task_modal_title')} onClose={() => { setShowTaskModal(false); setTaskTemplateSearch(''); setTaskComboOpen(false); }}>
          <div className="space-y-4">
            <div ref={taskComboRef}>
              <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:task_type_label')}</label>
              <div
                role="combobox"
                aria-expanded={taskComboOpen}
                onClick={() => {
                  taskComboInputRef.current?.focus();
                  setTaskComboOpen(true);
                }}
                style={{
                  marginTop: 4,
                  border: `1px solid ${colors.borderDefault}`,
                  borderRadius: 6,
                  background: colors.bgCard,
                  overflow: 'hidden',
                  cursor: 'text',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    ref={taskComboInputRef}
                    type="text"
                    aria-autocomplete="list"
                    value={taskTemplateSearch}
                    onChange={(e) => {
                      setTaskTemplateSearch(e.target.value);
                      setSelectedTaskTemplate('');
                      setTaskComboOpen(true);
                    }}
                    onFocus={() => setTaskComboOpen(true)}
                    placeholder={t('event:select_task_type')}
                    autoComplete="off"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '8px 12px',
                      border: 'none',
                      outline: 'none',
                      fontSize: 14,
                      background: 'transparent',
                      color: colors.textPrimary,
                      fontFamily: 'inherit',
                    }}
                  />
                  <ChevronDown
                    size={18}
                    style={{
                      flexShrink: 0,
                      marginRight: 10,
                      color: colors.textDim,
                      transform: taskComboOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.15s ease',
                    }}
                  />
                </div>
                {taskComboOpen && (
                  <ul
                    role="listbox"
                    style={{
                      maxHeight: 280,
                      overflowY: 'auto',
                      borderTop: `1px solid ${colors.borderDefault}`,
                      margin: 0,
                      padding: '4px 0',
                      listStyle: 'none',
                    }}
                  >
                    {filteredTaskTemplates.map((template) => (
                      <li key={template.id}>
                        <button
                          type="button"
                          role="option"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectTaskTemplateFromCombo(template.id);
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 12px',
                            fontSize: 13,
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: colors.textPrimary,
                            fontFamily: 'inherit',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = colors.bgHover;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          {translateTaskName(template.name, t)}
                        </button>
                      </li>
                    ))}
                    <li>
                      <button
                        type="button"
                        role="option"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectTaskTemplateFromCombo('other');
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          fontSize: 13,
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          color: colors.textSecondary,
                          fontFamily: 'inherit',
                          fontStyle: 'italic',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = colors.bgHover;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        {t('event:other_custom_task')}
                      </button>
                    </li>
                  </ul>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:task_description_label')}</label>
              <textarea
                value={taskDetails.description}
                onChange={(e) => setTaskDetails({ ...taskDetails, description: e.target.value })}
                className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
                rows={3}
                placeholder={t('event:describe_task_placeholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:start_date_label')}</label>
                <DatePicker
                  value={taskDetails.start_date}
                  onChange={(v) => setTaskDetails({ ...taskDetails, start_date: v })}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:end_date_label')}</label>
                <DatePicker
                  value={taskDetails.end_date}
                  onChange={(v) => setTaskDetails({ ...taskDetails, end_date: v })}
                  minDate={taskDetails.start_date}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>
                {t('event:quantity_label_parentheses')} {selectedTaskTemplate && taskTemplates.find(t => t.id === selectedTaskTemplate)?.unit ? 
                  `(${translateUnit(taskTemplates.find(t => t.id === selectedTaskTemplate)?.unit || '', t)})` : ''}
              </label>
              <input
                type="number"
                value={taskDetails.quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
                placeholder={t('event:enter_quantity_placeholder')}
                min="0"
                step="0.5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:hours_needed_auto_calculated')}</label>
              <input
                type="number"
                value={taskDetails.hours_needed}
                readOnly
                className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgSubtle }}
                placeholder={t('event:hours_calculated_based_on_quantity')}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:materials_needed_label')}</label>
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="text-sm"
                  style={{ color: colors.accentBlue }}
                >
                  {t('event:add_material_link')}
                </button>
              </div>
              <div className="space-y-3">
                {taskDetails.materials.map((material, index) => (
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
                        className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
                      >
                        <option value="">{t('calculator:select_material_placeholder')}</option>
                        <option value="other" className="font-medium" style={{ color: colors.accentBlue }}>{t('common:other_custom_material')}</option>
                        {materialTemplates.map(template => (
                          <option key={template.id} value={template.name}>
                            {translateMaterialName(template.name, t)} ({template.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        value={material.quantity}
                        onChange={(e) => handleMaterialChange(index, 'quantity', e.target.value)}
                        className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
                        placeholder={t('calculator:qty_placeholder')}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="w-24">
                      <input
                        type="text"
                        value={material.unit}
                        onChange={(e) => handleMaterialChange(index, 'unit', e.target.value)}
                        className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
                        placeholder={t('calculator:unit_placeholder')}
                        readOnly={!!material.material && material.material !== 'other'}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveMaterial(index)}
                      className="mt-1"
                      style={{ color: colors.red }}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleTaskSubmit}
              disabled={addTaskMutation.isPending}
              className="w-full py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
            >
              {addTaskMutation.isPending ? `${t('event:saving_action')}...` : t('event:add_task_button')}
            </button>
          </div>
        </Modal>
      )}

      {/* Material Modal */}
      {showMaterialModal && (
        <Modal title={t('event:add_additional_material_modal_title')} onClose={() => setShowMaterialModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:material_type_label')}</label>
              <select
                value={selectedMaterialTemplate}
                onChange={(e) => handleMaterialTemplateChange(e.target.value)}
                className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
              >
                <option value="">{t('event:select_material_placeholder')}</option>
                {materialTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {translateMaterialName(template.name, t)} ({template.unit})
                  </option>
                ))}
                <option value="other">{t('event:other_custom_material')}</option>
              </select>
            </div>

            {selectedMaterialTemplate === 'other' && (
              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:material_name_label')}</label>
                <input
                  type="text"
                  value={materialDetails.material}
                  onChange={(e) => setMaterialDetails({ ...materialDetails, material: e.target.value })}
                  className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
                  placeholder={t('event:enter_material_name_placeholder')}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:material_quantity_label')}</label>
              <input
                type="number"
                value={materialDetails.quantity}
                onChange={(e) => setMaterialDetails({ ...materialDetails, quantity: e.target.value })}
                className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
                placeholder={t('event:enter_quantity_placeholder')}
                min="0"
                step="0.01"
              />
            </div>

            {selectedMaterialTemplate === 'other' && (
              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:material_unit_label')}</label>
                <input
                  type="text"
                  value={materialDetails.unit}
                  onChange={(e) => setMaterialDetails({ ...materialDetails, unit: e.target.value })}
                  className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
                  placeholder={t('event:unit_placeholder_example')}
                />
              </div>
            )}

            <button
              onClick={handleMaterialSubmit}
              disabled={addMaterialMutation.isPending}
              className="w-full py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: colors.green, color: colors.textOnAccent }}
            >
              {addMaterialMutation.isPending ? `${t('event:saving_action')}...` : t('event:add_material_button')}
            </button>
          </div>
        </Modal>
      )}

      {/* Progress Modal */}
      {showProgressModal && selectedTask && (
        <Modal title={t('event:update_task_progress_modal_title')} onClose={() => {
          setShowProgressModal(false);
          setSelectedTask(null);
          setProgressDetails({ progress: '', hoursWorked: '', notes: '' });
        }}>
          <div className="space-y-4">
            {/* Current Progress Information */}
            <div className="p-4 rounded-lg space-y-2" style={{ backgroundColor: colors.bgSubtle }}>
              <div className="text-sm" style={{ color: colors.textMuted }}>
                <span className="font-medium">{t('event:current_progress_label')}</span> {selectedTask.progress}%
              </div>
              <div className="text-sm" style={{ color: colors.textMuted }}>
                <span className="font-medium">{t('event:hours_worked_label')}</span> {selectedTask.hours_spent} / {selectedTask.hours_needed} {t('event:hours_label')}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:progress_percentage_label')}</label>
              <input
                type="number"
                value={progressDetails.progress}
                onChange={(e) => setProgressDetails(prev => ({
                  ...prev,
                  progress: e.target.value
                }))}
                min="0"
                max="100"
                className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
                placeholder={t('event:enter_progress_percentage')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:hours_worked_input_label')}</label>
              <input
                type="number"
                value={progressDetails.hoursWorked}
                onChange={(e) => setProgressDetails(prev => ({
                  ...prev,
                  hoursWorked: e.target.value
                }))}
                min="0"
                step="0.5"
                className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
                placeholder={t('event:enter_hours_worked')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:notes_optional_label')}</label>
              <textarea
                value={progressDetails.notes}
                onChange={(e) => setProgressDetails(prev => ({
                  ...prev,
                  notes: e.target.value
                }))}
                rows={3}
                className="mt-1 block w-full rounded-md shadow-sm"
                style={{ borderColor: colors.borderDefault }}
                placeholder={t('event:add_notes_about_progress')}
              />
            </div>

            <button
              onClick={handleProgressSubmit}
              disabled={addProgressMutation.isPending || !progressDetails.progress || !progressDetails.hoursWorked}
              className="w-full py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
            >
              {addProgressMutation.isPending ? `${t('event:updating_action')}...` : t('event:update_progress_button')}
            </button>
          </div>
        </Modal>
      )}

      {/* Add UnspecifiedMaterialModal */}
      {showUnspecifiedMaterialModal && (
        <UnspecifiedMaterialModal
          onClose={() => setShowUnspecifiedMaterialModal(false)}
          onSave={handleAddUnspecifiedMaterial}
          projects={[{
            id: eventId,
            title: 'Current Project'
          }]}
        />
      )}
    </div>
  );
};

export default AdditionalFeatures;
