import React, { useState } from 'react';
import { useSidebarSectionReset } from '../../hooks/useSidebarSectionReset';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { show403Modal } from '../../components/Error403Modal';
import { 
  Search, 
  Plus, 
  Trash2, 
  Edit, 
  Save, 
  X, 
  Info, 
  ExternalLink,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Settings,
} from 'lucide-react';
import BackButton from '../../components/BackButton';
import PageInfoModal from '../../components/PageInfoModal';
import Modal from '../../components/Modal';
import { Button, Card } from '../../themes';
import { colors, spacing, radii, fontSizes, fontWeights } from '../../themes/designTokens';
import SetupTasks from './Setup/SetupTasks';
import SetupEquipment from './Setup/SetupEquipment';
import SetupMaterials from './Setup/SetupMaterials';
import SetupDigging from './Setup/SetupDigging';
import SetupMaterialUsage from './Setup/SetupMaterialUsage';

interface Material {
  id: string;
  name: string;
  unit: string;
  quantity: number;
}

interface Equipment {
  id: string;
  name: string;
  quantity: number;
  job_id?: string;
}

interface Task {
  id: string;
  name: string;
  description: string;
  unit: string;
  estimated_hours: number;
}

const SetupPage = () => {
  const { t } = useTranslation(['common', 'form', 'utilities']);
  const queryClient = useQueryClient();
  const companyId = useAuthStore(state => state.getCompanyId());
  const profile = useAuthStore(state => state.profile);
  const hasSetupAccess = profile?.role === 'Admin' || profile?.role === 'boss';

  const handleSetupAction = (action: () => void) => {
    if (!hasSetupAccess) {
      show403Modal();
      return;
    }
    action();
  };
  
  // State for materials
  const [materialSearch, setMaterialSearch] = useState('');
  const [showMaterialInfo, setShowMaterialInfo] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ name: '', unit: '', quantity: 0 });
  
  // State for equipment
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [showEquipmentInfo, setShowEquipmentInfo] = useState(false);
  const [newEquipment, setNewEquipment] = useState({ name: '', quantity: 0 });
  
  // State for tasks
  const [taskSearch, setTaskSearch] = useState('');
  const [showTaskInfo, setShowTaskInfo] = useState(false);
  const [newTask, setNewTask] = useState({ 
    name: '', 
    description: '', 
    unit: '', 
    estimated_hours: 0 
  });
  
  // State for help section
  const [showContactInfo, setShowContactInfo] = useState(false);
  
  // Add these state variables to your component
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editMaterial, setEditMaterial] = useState<Material | null>(null);
  const [editEquipment, setEditEquipment] = useState<Equipment | null>(null);
  
  // Add state for showing the tasks modal
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [showMaterialsModal, setShowMaterialsModal] = useState(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [showDiggingModal, setShowDiggingModal] = useState(false);
  const [showMaterialUsageModal, setShowMaterialUsageModal] = useState(false);

  useSidebarSectionReset('/setup', () => {
    setShowTasksModal(false);
    setShowMaterialsModal(false);
    setShowEquipmentModal(false);
    setShowDiggingModal(false);
    setShowMaterialUsageModal(false);
    setShowMaterialInfo(false);
    setShowEquipmentInfo(false);
    setShowTaskInfo(false);
    setShowContactInfo(false);
  });
  
  // Fetch materials
  const { data: materials = [] } = useQuery({
    queryKey: ['materials', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      
      if (error) throw error;
      return data as Material[];
    },
    enabled: !!companyId
  });
  
  // Fetch equipment
  const { data: equipment = [] } = useQuery({
    queryKey: ['equipment', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      
      if (error) throw error;
      return data as Equipment[];
    },
    enabled: !!companyId
  });
  
  // Fetch tasks
  const { data: tasks = [] } = useQuery({
    queryKey: ['event_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      
      if (error) throw error;
      return data as Task[];
    },
    enabled: !!companyId
  });
  
  // Add material mutation
  const addMaterialMutation = useMutation({
    mutationFn: async (material: Omit<Material, 'id'>) => {
      const { data, error } = await supabase
        .from('materials')
        .insert([{ ...material, company_id: companyId }])
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials', companyId] });
      setNewMaterial({ name: '', unit: '', quantity: 0 });
    }
  });
  
  // Add equipment mutation
  const addEquipmentMutation = useMutation({
    mutationFn: async (equipment: Omit<Equipment, 'id'>) => {
      const { data, error } = await supabase
        .from('equipment')
        .insert([{ ...equipment, company_id: companyId }])
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', companyId] });
      setNewEquipment({ name: '', quantity: 0 });
    }
  });
  
  // Add task mutation
  const addTaskMutation = useMutation({
    mutationFn: async (task: Omit<Task, 'id'>) => {
      const { data, error } = await supabase
        .from('event_tasks')
        .insert([{ ...task, company_id: companyId }])
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_tasks', companyId] });
      setNewTask({ name: '', description: '', unit: '', estimated_hours: 0 });
    }
  });
  
  // Delete material mutation
  const deleteMaterialMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials', companyId] });
    }
  });
  
  // Delete equipment mutation
  const deleteEquipmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', companyId] });
    }
  });
  
  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('event_tasks')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_tasks', companyId] });
    }
  });
  
  // Edit task mutation
  const editTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const { data, error } = await supabase
        .from('event_tasks')
        .update({
          name: task.name,
          description: task.description,
          unit: task.unit,
          estimated_hours: task.estimated_hours
        })
        .eq('id', task.id)
        .eq('company_id', companyId)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_tasks', companyId] });
      setEditingTaskId(null);
      setEditTask(null);
    }
  });
  
  // Edit material mutation
  const editMaterialMutation = useMutation({
    mutationFn: async (material: Material) => {
      const { data, error } = await supabase
        .from('materials')
        .update({
          name: material.name,
          unit: material.unit,
          quantity: material.quantity
        })
        .eq('id', material.id)
        .eq('company_id', companyId)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials', companyId] });
      setEditingMaterialId(null);
      setEditMaterial(null);
    }
  });
  
  // Edit equipment mutation
  const editEquipmentMutation = useMutation({
    mutationFn: async (equipment: Equipment) => {
      const { data, error } = await supabase
        .from('equipment')
        .update({
          name: equipment.name,
          quantity: equipment.quantity
        })
        .eq('id', equipment.id)
        .eq('company_id', companyId)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', companyId] });
      setEditingEquipmentId(null);
      setEditEquipment(null);
    }
  });
  
  // Filter materials based on search
  const filteredMaterials = materials.filter(material => 
    material.name.toLowerCase().includes(materialSearch.toLowerCase())
  );
  
  // Filter equipment based on search
  const filteredEquipment = equipment.filter(item => 
    item.name.toLowerCase().includes(equipmentSearch.toLowerCase())
  );
  
  // Filter tasks based on search
  const filteredTasks = tasks.filter(task => 
    task.name.toLowerCase().includes(taskSearch.toLowerCase())
  );
  
  const handleAddMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMaterial.name && newMaterial.unit) {
      addMaterialMutation.mutate(newMaterial);
    }
  };
  
  const handleAddEquipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEquipment.name) {
      addEquipmentMutation.mutate(newEquipment);
    }
  };
  
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTask.name) {
      addTaskMutation.mutate(newTask);
    }
  };
  
  // Add these handler functions
  
  const handleEditTask = (task: Task) => {
    setEditTask(task);
    setEditingTaskId(task.id);
  };
  
  const handleSaveTaskEdit = () => {
    if (editTask) {
      editTaskMutation.mutate(editTask);
    }
  };
  
  const handleEditMaterial = (material: Material) => {
    setEditMaterial(material);
    setEditingMaterialId(material.id);
  };
  
  const handleSaveMaterialEdit = () => {
    if (editMaterial) {
      editMaterialMutation.mutate(editMaterial);
    }
  };
  
  const handleEditEquipment = (equipment: Equipment) => {
    setEditEquipment(equipment);
    setEditingEquipmentId(equipment.id);
  };
  
  const handleSaveEquipmentEdit = () => {
    if (editEquipment) {
      editEquipmentMutation.mutate(editEquipment);
    }
  };
  
  const cardStyle = { padding: `${spacing['6xl']}px` };
  const cardDescStyle: React.CSSProperties = { color: colors.textDim, fontSize: fontSizes.base, lineHeight: 1.5 };
  const h2Style: React.CSSProperties = { fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, margin: 0, marginBottom: spacing['3xl'] };

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: spacing['6xl'], paddingBottom: 80, minHeight: '100vh' }}>
      <BackButton />
      <div style={{ textAlign: 'center', marginBottom: spacing['8xl'] }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <h1 style={{ fontSize: fontSizes['3xl'], fontWeight: fontWeights.bold, color: colors.textPrimary, margin: 0 }}>
            {t('form:setup_welcome_title')}
          </h1>
          <PageInfoModal
            description={t('form:setup_page_info_description')}
            title={t('form:setup_page_info_title')}
            quickTips={[]}
          />
        </div>
        <p style={{ fontSize: fontSizes.xl, color: colors.textMuted }}>{t('form:setup_page_title')}</p>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: spacing['6xl'], alignItems: 'stretch' }}>
        <Card padding={cardStyle.padding} style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={h2Style}>{t('form:setup_tasks_label')}</h2>
            <p style={{ ...cardDescStyle, flex: 1, marginBottom: 0 }}>{t('form:setup_tasks_description')}</p>
          </div>
          <Button fullWidth onClick={() => handleSetupAction(() => setShowTasksModal(true))}>
            {t('form:manage_tasks_button')}
          </Button>
        </Card>

        <Card padding={cardStyle.padding} style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={h2Style}>{t('form:setup_materials_label')}</h2>
            <p style={{ ...cardDescStyle, flex: 1, marginBottom: 0 }}>{t('form:setup_materials_description')}</p>
          </div>
          <Button fullWidth onClick={() => handleSetupAction(() => setShowMaterialsModal(true))}>
            {t('form:manage_materials_button')}
          </Button>
        </Card>

        <Card padding={cardStyle.padding} style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={h2Style}>{t('form:setup_equipment_label')}</h2>
            <p style={{ ...cardDescStyle, flex: 1, marginBottom: 0 }}>{t('form:setup_equipment_description')}</p>
          </div>
          <Button fullWidth onClick={() => handleSetupAction(() => setShowEquipmentModal(true))}>
            {t('form:manage_equipment_button')}
          </Button>
        </Card>

        <Card padding={cardStyle.padding} style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={h2Style}>{t('form:setup_excavators_dumpers_label')}</h2>
            <p style={{ ...cardDescStyle, flex: 1, marginBottom: 0 }}>{t('form:setup_excavators_description')}</p>
          </div>
          <Button fullWidth onClick={() => handleSetupAction(() => setShowDiggingModal(true))}>
            {t('form:manage_excavators_dumpers_button')}
          </Button>
        </Card>

        <Card padding={cardStyle.padding} style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={h2Style}>{t('form:setup_material_usage_label')}</h2>
            <p style={{ ...cardDescStyle, flex: 1, marginBottom: 0 }}>{t('form:setup_material_usage_description')}</p>
          </div>
          <Button fullWidth onClick={() => handleSetupAction(() => setShowMaterialUsageModal(true))}>
            {t('form:manage_material_usage_button')}
          </Button>
        </Card>
      </div>
      
      <div style={{ position: 'fixed', bottom: spacing['6xl'], right: spacing['6xl'], zIndex: 50 }}>
        <Card padding={`${spacing.lg}px`}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.sm }}>
            <h2 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textSecondary, margin: 0 }}>
              {t('form:setup_need_help_label')}
            </h2>
            <Button onClick={() => setShowContactInfo(!showContactInfo)}>
              {t('form:contact_us_button')}
            </Button>
          </div>
          
          {showContactInfo && (
            <>
              <div style={{ position: 'absolute', bottom: '100%', right: '50%', transform: 'translateX(50%)', marginBottom: spacing.md, background: colors.bgCard, padding: spacing.sm, borderRadius: radii.lg, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', border: `1px solid ${colors.borderDefault}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                  <ExternalLink style={{ width: 16, height: 16, color: colors.textMuted }} />
                  <a href="https://www.123.com" target="_blank" rel="noopener noreferrer" style={{ color: colors.accentBlue, fontSize: fontSizes.sm, textDecoration: 'none' }}>{t('form:contact_website_label')}</a>
                </div>
              </div>
              <div style={{ position: 'absolute', right: '100%', bottom: '50%', transform: 'translateY(50%)', marginRight: spacing.md, background: colors.bgCard, padding: spacing.sm, borderRadius: radii.lg, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', border: `1px solid ${colors.borderDefault}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                  <ExternalLink style={{ width: 16, height: 16, color: colors.textMuted }} />
                  <a href="https://www.instagram.com/aitomatic_future/" target="_blank" rel="noopener noreferrer" style={{ color: colors.accentBlue, fontSize: fontSizes.sm, textDecoration: 'none' }}>{t('form:contact_instagram_label')}</a>
                </div>
              </div>
              <div style={{ position: 'absolute', right: '100%', bottom: '100%', marginRight: spacing.md, marginBottom: spacing.md, background: colors.bgCard, padding: spacing.sm, borderRadius: radii.lg, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', border: `1px solid ${colors.borderDefault}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                  <ExternalLink style={{ width: 16, height: 16, color: colors.textMuted }} />
                  <a href="mailto:asdasd@gmail.com" style={{ color: colors.accentBlue, fontSize: fontSizes.sm, textDecoration: 'none' }}>{t('form:contact_email_label')}</a>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Modals */}
      {showTasksModal && (
        <SetupTasks onClose={() => setShowTasksModal(false)} />
      )}
      
      {showMaterialsModal && (
        <SetupMaterials onClose={() => setShowMaterialsModal(false)} />
      )}
      
      {showEquipmentModal && (
        <SetupEquipment onClose={() => setShowEquipmentModal(false)} />
      )}
      
      {showDiggingModal && (
        <SetupDigging onClose={() => setShowDiggingModal(false)} />
      )}
      
      {showMaterialUsageModal && (
        <SetupMaterialUsage onClose={() => setShowMaterialUsageModal(false)} />
      )}
    </div>
  );
};

export default SetupPage;
