import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { 
  Package, 
  Wrench, 
  Clock, 
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
  Truck
} from 'lucide-react';
import BackButton from '../../components/BackButton';
import Modal from '../../components/Modal';
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
  
  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-full relative min-h-screen pb-20">
      <BackButton />
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('form:setup_welcome_title')}</h1>
        <p className="text-xl text-gray-600">{t('form:setup_page_title')}</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Tasks Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Clock className="w-6 h-6 text-blue-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('form:setup_tasks_label')}</h2>
          </div>
          <p className="text-gray-600 mb-4">
            {t('form:setup_tasks_description')}
          </p>
          <button
            onClick={() => setShowTasksModal(true)}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('form:manage_tasks_button')}
          </button>
        </div>
        
        {/* Materials Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Package className="w-6 h-6 text-green-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('form:setup_materials_label')}</h2>
          </div>
          <p className="text-gray-600 mb-4">
            {t('form:setup_materials_description')}
          </p>
          <button
            onClick={() => setShowMaterialsModal(true)}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
          >
            {t('form:manage_materials_button')}
          </button>
        </div>
        
        {/* Equipment Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Wrench className="w-6 h-6 text-purple-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('form:setup_equipment_label')}</h2>
          </div>
          <p className="text-gray-600 mb-4">
            {t('form:setup_equipment_description')}
          </p>
          <button
            onClick={() => setShowEquipmentModal(true)}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
          >
            {t('form:manage_equipment_button')}
          </button>
        </div>
        
        {/* Excavators & Dumpers/Barrows Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Truck className="w-6 h-6 text-orange-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('form:setup_excavators_dumpers_label')}</h2>
          </div>
          <p className="text-gray-600 mb-4">
            {t('form:setup_excavators_description')}
          </p>
          <button
            onClick={() => setShowDiggingModal(true)}
            className="w-full bg-orange-600 text-white py-2 px-4 rounded-lg hover:bg-orange-700 transition-colors"
          >
            {t('form:manage_excavators_dumpers_button')}
          </button>
        </div>
        
        {/* Material Usage Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Package className="w-6 h-6 text-indigo-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('form:setup_material_usage_label')}</h2>
          </div>
          <p className="text-gray-600 mb-4">
            {t('form:setup_material_usage_description')}
          </p>
          <button
            onClick={() => setShowMaterialUsageModal(true)}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {t('form:manage_material_usage_button')}
          </button>
        </div>
      </div>
      
      {/* Help Section - Floating Version with Triangle Pattern Links */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="bg-white rounded-lg shadow-lg p-3">
          <div className="flex flex-col items-center">
            <h2 className="text-lg font-semibold mb-2">{t('form:setup_need_help_label')}</h2>
            <button 
              onClick={() => setShowContactInfo(!showContactInfo)}
              className="bg-blue-600 text-white px-4 py-1 rounded hover:bg-blue-700 text-sm"
            >
              {t('form:contact_us_button')}
            </button>
          </div>
          
          {showContactInfo && (
            <>
              {/* Top Link */}
              <div className="absolute bottom-full right-1/2 transform translate-x-1/2 mb-4 bg-white p-2 rounded-lg shadow-lg">
                <div className="flex items-center space-x-2">
                  <ExternalLink className="w-4 h-4 text-gray-600" />
                  <a href="https://www.123.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                    {t('form:contact_website_label')}
                  </a>
                </div>
              </div>
              
              {/* Left Link */}
              <div className="absolute right-full bottom-1/2 transform translate-y-1/2 mr-4 bg-white p-2 rounded-lg shadow-lg">
                <div className="flex items-center space-x-2">
                  <ExternalLink className="w-4 h-4 text-gray-600" />
                  <a href="https://www.instagram.com/aitomatic_future/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                    {t('form:contact_instagram_label')}
                  </a>
                </div>
              </div>
              
              {/* Top-Left Link */}
              <div className="absolute right-full bottom-full mr-4 mb-4 bg-white p-2 rounded-lg shadow-lg">
                <div className="flex items-center space-x-2">
                  <ExternalLink className="w-4 h-4 text-gray-600" />
                  <a href="mailto:asdasd@gmail.com" className="text-blue-600 hover:underline text-sm">
                    {t('form:contact_email_label')}
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
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
