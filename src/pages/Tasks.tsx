import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { translateTaskName, translateTaskDescription } from '../lib/translationMap';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { X, Wrench, Package, Pencil, Info } from 'lucide-react';
import PageInfoModal from '../components/PageInfoModal';
import BackButton from '../components/BackButton';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../themes/designTokens';
import { Button, Card, Modal, TextInput, Label, Spinner } from '../themes/uiComponents';

interface Task {
  id: string;
  name: string;
  description: string;
  tools: string[];
  materials: string[];
}

const TaskRequirements = () => {
  const { t } = useTranslation(['common', 'form', 'utilities']);
  const queryClient = useQueryClient();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [newTask, setNewTask] = useState({
    name: '',
    description: '',
    tools: [''],
    materials: ['']
  });
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Fetch tasks from task_requirements
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['task_requirements', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_requirements')
        .select('id, name, description, tools, materials')
        .eq('company_id', companyId)
        .order('name');
      
      if (error) throw error;
      
      return data.map(task => ({
        ...task,
        tools: task.tools as string[],
        materials: task.materials as string[]
      })) as Task[];
    },
    enabled: !!companyId
  });

  // Add task mutation
  const addTaskMutation = useMutation({
    mutationFn: async (task: Omit<Task, 'id'>) => {
      const { error } = await supabase
        .from('task_requirements')
        .insert({
          name: task.name,
          description: task.description,
          tools: task.tools.filter(t => t.trim()),
          materials: task.materials.filter(m => m.trim()),
          company_id: companyId
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_requirements', companyId] });
      setShowAddModal(false);
      setNewTask({ name: '', description: '', tools: [''], materials: [''] });
    }
  });

  // Edit task mutation
  const editTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const { error } = await supabase
        .from('task_requirements')
        .update({
          name: task.name,
          description: task.description,
          tools: task.tools.filter(t => t.trim()),
          materials: task.materials.filter(m => m.trim())
        })
        .eq('id', task.id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_requirements', companyId] });
      setShowEditModal(false);
      setEditingTask(null);
    }
  });

  const handleAddTool = (isEditing: boolean = false) => {
    if (isEditing && editingTask) {
      setEditingTask(prev => ({
        ...prev!,
        tools: ['', ...prev!.tools]
      }));
    } else {
      setNewTask(prev => ({
        ...prev,
        tools: ['', ...prev.tools]
      }));
    }
  };

  const handleAddMaterial = (isEditing: boolean = false) => {
    if (isEditing && editingTask) {
      setEditingTask(prev => ({
        ...prev!,
        materials: ['', ...prev!.materials]
      }));
    } else {
      setNewTask(prev => ({
        ...prev,
        materials: ['', ...prev.materials]
      }));
    }
  };

  const handleToolChange = (index: number, value: string, isEditing: boolean = false) => {
    if (isEditing && editingTask) {
      setEditingTask(prev => ({
        ...prev!,
        tools: prev!.tools.map((t, i) => i === index ? value : t)
      }));
    } else {
      setNewTask(prev => ({
        ...prev,
        tools: prev.tools.map((t, i) => i === index ? value : t)
      }));
    }
  };

  const handleMaterialChange = (index: number, value: string, isEditing: boolean = false) => {
    if (isEditing && editingTask) {
      setEditingTask(prev => ({
        ...prev!,
        materials: prev!.materials.map((m, i) => i === index ? value : m)
      }));
    } else {
      setNewTask(prev => ({
        ...prev,
        materials: prev.materials.map((m, i) => i === index ? value : m)
      }));
    }
  };

  const handleRemoveTool = (index: number, isEditing: boolean = false) => {
    if (isEditing && editingTask) {
      setEditingTask(prev => ({
        ...prev!,
        tools: prev!.tools.filter((_, i) => i !== index)
      }));
    } else {
      setNewTask(prev => ({
        ...prev,
        tools: prev.tools.filter((_, i) => i !== index)
      }));
    }
  };

  const handleRemoveMaterial = (index: number, isEditing: boolean = false) => {
    if (isEditing && editingTask) {
      setEditingTask(prev => ({
        ...prev!,
        materials: prev!.materials.filter((_, i) => i !== index)
      }));
    } else {
      setNewTask(prev => ({
        ...prev,
        materials: prev.materials.filter((_, i) => i !== index)
      }));
    }
  };

  const handleSubmit = () => {
    if (!newTask.name || !newTask.description) return;
    
    addTaskMutation.mutate({
      name: newTask.name,
      description: newTask.description,
      tools: newTask.tools.filter(t => t.trim()),
      materials: newTask.materials.filter(m => m.trim())
    });
  };

  const handleEdit = () => {
    if (!editingTask?.name || !editingTask?.description) return;
    editTaskMutation.mutate(editingTask);
  };

  const handleEditClick = (task: Task) => {
    setEditingTask(task);
    setShowEditModal(true);
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setShowDetailsModal(true);
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: fonts.body }}>
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["6xl"], fontFamily: fonts.body }}>
      <BackButton />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'column' }} className="md:flex-row">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1 style={{ fontSize: fontSizes["3xl"], fontWeight: fontWeights.bold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>{t('utilities:task_requirements_title')}</h1>
          <PageInfoModal
            description={t('form:task_requirements_info_description')}
            title={t('form:task_requirements_info_title')}
            quickTips={[]}
          />
        </div>
        <Button variant="accent" color={colors.accentBlue} icon="📋" onClick={() => setShowAddModal(true)} className="md:flex hidden">
          {t('utilities:add_task_requirements')}
        </Button>
      </div>

      {/* Mobile Button - compact, not full width */}
      <Button variant="accent" color={colors.accentBlue} icon="📋" onClick={() => setShowAddModal(true)} style={{ alignSelf: 'flex-start' }} className="md:hidden">
        {t('utilities:add_task_requirements')}
      </Button>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: spacing["6xl"] }}>
        {tasks.map((task) => (
          <Card key={task.id} style={{ transition: 'box-shadow 0.2s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <button
                  onClick={() => handleTaskClick(task)}
                  style={{ display: 'flex', alignItems: 'center', fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {translateTaskName(task.name, t)}
                  <Info style={{ width: 16, height: 16, marginLeft: spacing.sm }} />
                </button>
                <p style={{ color: colors.textDim, fontFamily: fonts.body, marginTop: spacing.sm, margin: `${spacing.sm} 0 0 0`, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{task.description}</p>
              </div>
              <button
                onClick={() => handleEditClick(task)}
                style={{ padding: spacing.sm, background: 'transparent', border: 'none', borderRadius: '50%', cursor: 'pointer', marginLeft: spacing.sm }}
                title={t('utilities:edit_task')}
              >
                <Pencil style={{ width: 20, height: 20, color: colors.accentBlue }} />
              </button>
            </div>
            <div style={{ marginTop: spacing["5xl"], display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: fontSizes.base, color: colors.accentBlue }}>
                <Wrench style={{ width: 16, height: 16, marginRight: spacing.sm }} />
                <span>{t('utilities:tools')}: {task.tools.length}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: fontSizes.base, color: colors.green }}>
                <Package style={{ width: 16, height: 16, marginRight: spacing.sm }} />
                <span>{t('utilities:required_materials')}: {task.materials.length}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Details Modal */}
      <Modal
        open={!!(showDetailsModal && selectedTask)}
        onClose={() => { setShowDetailsModal(false); setSelectedTask(null); }}
        title={selectedTask?.name ?? ''}
        width={512}
      >
        {selectedTask && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
            <div>
              <h3 style={{ fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textSecondary, marginBottom: spacing.sm, fontFamily: fonts.body }}>{t('utilities:description')}</h3>
              <p style={{ color: colors.textDim, fontFamily: fonts.body }}>{translateTaskDescription(selectedTask.description, t)}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing["6xl"] }}>
              <div style={{ background: `${colors.accentBlue}15`, padding: spacing["5xl"], borderRadius: radii.lg }}>
                <h3 style={{ fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.accentBlue, marginBottom: spacing.sm, fontFamily: fonts.body }}>{t('utilities:required_tools')}</h3>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, margin: 0, padding: 0, listStyle: 'none' }}>
                  {selectedTask.tools.map((tool, index) => (
                    <li key={index} style={{ display: 'flex', alignItems: 'center', fontFamily: fonts.body }}>
                      <Wrench style={{ width: 16, height: 16, marginRight: spacing.sm, flexShrink: 0 }} />
                      <span style={{ fontSize: fontSizes.base }}>{tool}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ background: `${colors.green}15`, padding: spacing["5xl"], borderRadius: radii.lg }}>
                <h3 style={{ fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.green, marginBottom: spacing.sm, fontFamily: fonts.body }}>{t('utilities:required_materials')}</h3>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, margin: 0, padding: 0, listStyle: 'none' }}>
                  {selectedTask.materials.map((material, index) => (
                    <li key={index} style={{ display: 'flex', alignItems: 'center', fontFamily: fonts.body }}>
                      <Package style={{ width: 16, height: 16, marginRight: spacing.sm, flexShrink: 0 }} />
                      <span style={{ fontSize: fontSizes.base }}>{material}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Task Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={t('utilities:add_new_task_requirements')}
        width={672}
        footer={
          <Button
            onClick={handleSubmit}
            disabled={addTaskMutation.isPending || !newTask.name || !newTask.description}
            style={{ width: '100%' }}
          >
            {addTaskMutation.isPending ? t('utilities:adding') : t('utilities:add_task_requirements')}
          </Button>
        }
      >
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["5xl"], overflowY: 'auto' }}>
                <TextInput label={t('utilities:task_name')} value={newTask.name} onChange={(v) => setNewTask(prev => ({ ...prev, name: v }))} placeholder={t('utilities:enter_task_name')} />
                <div>
                  <Label>{t('utilities:description')}</Label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    placeholder={t('utilities:enter_task_description')}
                    style={{ width: '100%', padding: spacing.xl, borderRadius: radii.xl, border: `1px solid ${colors.borderInput}`, background: colors.bgInput, fontFamily: fonts.body, fontSize: fontSizes.base, marginTop: spacing.xs }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                    <Label>{t('utilities:required_tools')}</Label>
                    <button type="button" onClick={() => handleAddTool()} style={{ fontSize: fontSizes.base, color: colors.accentBlue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: fonts.body }}>{t('utilities:add_tool')}</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, maxHeight: 192, overflowY: 'auto' }}>
                    {newTask.tools.map((tool, index) => (
                      <div key={index} style={{ display: 'flex', gap: spacing.sm }}>
                        <input type="text" value={tool} onChange={(e) => handleToolChange(index, e.target.value)} placeholder={t('utilities:enter_tool_name')} style={{ flex: 1, padding: spacing.xl, borderRadius: radii.xl, border: `1px solid ${colors.borderInput}`, background: colors.bgInput, fontFamily: fonts.body, fontSize: fontSizes.base }} />
                        <button type="button" onClick={() => handleRemoveTool(index)} style={{ padding: spacing.sm, color: colors.red, background: 'none', border: 'none', cursor: 'pointer' }}><X style={{ width: 20, height: 20 }} /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                    <Label>{t('utilities:required_materials')}</Label>
                    <button type="button" onClick={() => handleAddMaterial()} style={{ fontSize: fontSizes.base, color: colors.accentBlue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: fonts.body }}>{t('utilities:add_material')}</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, maxHeight: 192, overflowY: 'auto' }}>
                    {newTask.materials.map((material, index) => (
                      <div key={index} style={{ display: 'flex', gap: spacing.sm }}>
                        <input type="text" value={material} onChange={(e) => handleMaterialChange(index, e.target.value)} placeholder={t('utilities:enter_material_name')} style={{ flex: 1, padding: spacing.xl, borderRadius: radii.xl, border: `1px solid ${colors.borderInput}`, background: colors.bgInput, fontFamily: fonts.body, fontSize: fontSizes.base }} />
                        <button type="button" onClick={() => handleRemoveMaterial(index)} style={{ padding: spacing.sm, color: colors.red, background: 'none', border: 'none', cursor: 'pointer' }}><X style={{ width: 20, height: 20 }} /></button>
                      </div>
                    ))}
                  </div>
                </div>
            </div>
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        open={!!(showEditModal && editingTask)}
        onClose={() => { setShowEditModal(false); setEditingTask(null); }}
        title={t('utilities:edit_task_requirements')}
        width={672}
        footer={
          <Button onClick={handleEdit} disabled={editTaskMutation.isPending || !editingTask?.name || !editingTask?.description} style={{ width: '100%' }}>
            {editTaskMutation.isPending ? t('utilities:saving') : t('utilities:save_changes')}
          </Button>
        }
      >
        {editingTask && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["5xl"], overflowY: 'auto' }}>
            <TextInput label={t('utilities:task_name')} value={editingTask.name} onChange={(v) => setEditingTask(prev => prev ? { ...prev, name: v } : null)} placeholder={t('utilities:enter_task_name')} />
            <div>
              <Label>{t('utilities:description')}</Label>
              <textarea value={editingTask.description} onChange={(e) => setEditingTask(prev => prev ? { ...prev, description: e.target.value } : null)} rows={3} placeholder={t('utilities:enter_task_description')} style={{ width: '100%', padding: spacing.xl, borderRadius: radii.xl, border: `1px solid ${colors.borderInput}`, background: colors.bgInput, fontFamily: fonts.body, fontSize: fontSizes.base, marginTop: spacing.xs }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <Label>{t('utilities:required_tools')}</Label>
                <button type="button" onClick={() => handleAddTool(true)} style={{ fontSize: fontSizes.base, color: colors.accentBlue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: fonts.body }}>{t('utilities:add_tool')}</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, maxHeight: 192, overflowY: 'auto' }}>
                {editingTask.tools.map((tool, index) => (
                  <div key={index} style={{ display: 'flex', gap: spacing.sm }}>
                    <input type="text" value={tool} onChange={(e) => handleToolChange(index, e.target.value, true)} placeholder={t('utilities:enter_tool_name')} style={{ flex: 1, padding: spacing.xl, borderRadius: radii.xl, border: `1px solid ${colors.borderInput}`, background: colors.bgInput, fontFamily: fonts.body, fontSize: fontSizes.base }} />
                    <button type="button" onClick={() => handleRemoveTool(index, true)} style={{ padding: spacing.sm, color: colors.red, background: 'none', border: 'none', cursor: 'pointer' }}><X style={{ width: 20, height: 20 }} /></button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <Label>{t('utilities:required_materials')}</Label>
                <button type="button" onClick={() => handleAddMaterial(true)} style={{ fontSize: fontSizes.base, color: colors.accentBlue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: fonts.body }}>{t('utilities:add_material')}</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, maxHeight: 192, overflowY: 'auto' }}>
                {editingTask.materials.map((material, index) => (
                  <div key={index} style={{ display: 'flex', gap: spacing.sm }}>
                    <input type="text" value={material} onChange={(e) => handleMaterialChange(index, e.target.value, true)} placeholder={t('utilities:enter_material_name')} style={{ flex: 1, padding: spacing.xl, borderRadius: radii.xl, border: `1px solid ${colors.borderInput}`, background: colors.bgInput, fontFamily: fonts.body, fontSize: fontSizes.base }} />
                    <button type="button" onClick={() => handleRemoveMaterial(index, true)} style={{ padding: spacing.sm, color: colors.red, background: 'none', border: 'none', cursor: 'pointer' }}><X style={{ width: 20, height: 20 }} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TaskRequirements;
