import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';
import { Truck, X, Search, Info, Trash2, Settings, Save } from 'lucide-react';

interface DiggingEquipment {
  id: string;
  name: string;
  description: string | null;
  status: 'free_to_use' | 'in_use' | 'broken';
  created_at?: string;
  updated_at?: string;
  type: 'excavator' | 'barrows_dumpers';
  quantity: number;
  in_use_quantity: number;
  "size (in tones)": number | null;
  speed_m_per_hour?: number | null;
}

interface SetupDiggingProps {
  onClose: () => void;
  wizardMode?: boolean;
}

// Define predefined sizes for excavators and dumpers/barrows
const excavatorSizes = [
  { value: 0.02, label: '0.02 (Shovel)' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3 (to 5)' },
  { value: 6, label: '6 (to 10)' },
  { value: 11, label: '11 (to 20)' },
  { value: 21, label: '21 (to 30)' },
  { value: 31, label: '31 (to 40)' },
  { value: 41, label: '41 (+)' },
];

const dumperBarrowSizes = [
  { value: 0.1, label: '0.1 (Barrow)' },
  { value: 0.125, label: '0.125 (Barrow)' },
  { value: 0.15, label: '0.15 (Barrow)' },
  { value: 0.3, label: '0.3 (Petrol barrow)' },
  { value: 0.5, label: '0.5 (Petrol barrow)' },
  { value: 1, label: '1 (to 3)' },
  { value: 3, label: '3 (to 5)' },
  { value: 5, label: '5 (to 9)' },
  { value: 10, label: '10 (+)' },
];

// Default speeds for carriers (barrows/dumpers) in meters per hour
const defaultSpeeds: { [key: number]: number } = {
  0.1: 3000,
  0.125: 2750,
  0.15: 2500,
  0.3: 1500,
  0.5: 1500,
  1: 4000,
  3: 6000,
  5: 7000,
  10: 8000
};

// Time estimates for excavators (hours per ton)
const soilDiggerTimeEstimates = [
  { size: 'Shovel (1 Person)', sizeInTons: 0.02, timePerTon: 0.5 },
  { size: 'Digger 1T', sizeInTons: 1, timePerTon: 0.14 },
  { size: 'Digger 2T', sizeInTons: 2, timePerTon: 0.06 },
  { size: 'Digger 3-5T', sizeInTons: 3, timePerTon: 0.02 },
  { size: 'Digger 6-10T', sizeInTons: 6, timePerTon: 0.01 },
  { size: 'Digger 11-20T', sizeInTons: 11, timePerTon: 0.003 },
  { size: 'Digger 21-30T', sizeInTons: 21, timePerTon: 0.0012 },
  { size: 'Digger 31-40T', sizeInTons: 31, timePerTon: 0.0007 },
  { size: 'Digger 41-50T', sizeInTons: 41, timePerTon: 0.0004 }
];

// Time estimates for tape1/type1 loading (hours per ton)
const tape1DiggerTimeEstimates = [
  { size: 'Shovel (1 Person)', sizeInTons: 0.02, timePerTon: 0.35 },
  { size: 'Digger 1T', sizeInTons: 1, timePerTon: 0.098 },
  { size: 'Digger 2T', sizeInTons: 2, timePerTon: 0.042 },
  { size: 'Digger 3-5T', sizeInTons: 3, timePerTon: 0.014 },
  { size: 'Digger 6-10T', sizeInTons: 6, timePerTon: 0.007 },
  { size: 'Digger 11-20T', sizeInTons: 11, timePerTon: 0.0021 },
  { size: 'Digger 21-30T', sizeInTons: 21, timePerTon: 0.00084 },
  { size: 'Digger 31-40T', sizeInTons: 31, timePerTon: 0.00049 },
  { size: 'Digger 41-50T', sizeInTons: 41, timePerTon: 0.00028 }
];

const SetupDigging: React.FC<SetupDiggingProps> = ({ onClose, wizardMode = false }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'project']);
  const queryClient = useQueryClient();
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [newEquipment, setNewEquipment] = useState({ 
    name: '', 
    description: '', 
    type: 'excavator' as 'excavator' | 'barrows_dumpers', 
    quantity: 1,
    "size (in tones)": excavatorSizes[0].value,
    speed_m_per_hour: undefined as number | undefined
  });
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [editEquipment, setEditEquipment] = useState<DiggingEquipment | null>(null);

  // Helper function to find excavation time estimate
  const findSoilDiggerTimeEstimate = (sizeInTons: number) => {
    for (let i = 0; i < soilDiggerTimeEstimates.length - 1; i++) {
      if (sizeInTons >= soilDiggerTimeEstimates[i].sizeInTons && 
          sizeInTons < soilDiggerTimeEstimates[i + 1].sizeInTons) {
        return soilDiggerTimeEstimates[i];
      }
    }
    return soilDiggerTimeEstimates[soilDiggerTimeEstimates.length - 1];
  };

  // Helper function to find tape1 loading time estimate
  const findTape1DiggerTimeEstimate = (sizeInTons: number) => {
    for (let i = 0; i < tape1DiggerTimeEstimates.length - 1; i++) {
      if (sizeInTons >= tape1DiggerTimeEstimates[i].sizeInTons && 
          sizeInTons < tape1DiggerTimeEstimates[i + 1].sizeInTons) {
        return tape1DiggerTimeEstimates[i];
      }
    }
    return tape1DiggerTimeEstimates[tape1DiggerTimeEstimates.length - 1];
  };

  // Fetch digging equipment
  const companyId = useAuthStore(state => state.getCompanyId());
  const { data: equipment = [] } = useQuery({
    queryKey: ['setup_digging', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setup_digging')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      
      if (error) throw error;
      return data as DiggingEquipment[];
    },
    enabled: !!companyId
  });

  // Add digging equipment mutation
  const addEquipmentMutation = useMutation({
    mutationFn: async (equipment: Omit<DiggingEquipment, 'id' | 'created_at' | 'updated_at' | 'status' | 'in_use_quantity'> & { "size (in tones)": number; speed_m_per_hour?: number }) => {
      const sizeInTones = equipment["size (in tones)"];
      
      console.log('Adding equipment to setup_digging:', {
        name: equipment.name,
        description: equipment.description,
        type: equipment.type,
        quantity: equipment.quantity,
        "size (in tones)": sizeInTones,
        speed_m_per_hour: equipment.speed_m_per_hour
      });
      
      // First, add to setup_digging table
      const { data, error } = await supabase
        .from('setup_digging')
        .insert([{
          name: equipment.name,
          description: equipment.description || null,
          type: equipment.type,
          quantity: equipment.quantity,
          status: 'free_to_use',
          in_use_quantity: 0,
          "size (in tones)": sizeInTones,
          speed_m_per_hour: equipment.speed_m_per_hour || null,
          company_id: companyId
        }])
        .select();
      
      if (error) {
        console.error('Error adding to setup_digging:', error);
        throw error;
      }
      
      console.log('Successfully added to setup_digging:', data);
      
      // Then, also add to equipment table
      const { error: equipmentError } = await supabase
        .from('equipment')
        .insert([{
          name: equipment.name,
          description: equipment.description || null,
          type: equipment.type === 'excavator' ? 'machine' : 'tool',
          quantity: equipment.quantity,
          status: 'free_to_use',
          in_use_quantity: 0,
          company_id: companyId
        }]);
      
      if (equipmentError) {
        console.error('Error adding to equipment:', equipmentError);
      } else {
        console.log('Successfully added to equipment');
      }
      
      // If it's an excavator, automatically create task templates
      if (equipment.type === 'excavator' && sizeInTones) {
        const soilTimeEstimate = findSoilDiggerTimeEstimate(sizeInTones);
        const tape1TimeEstimate = findTape1DiggerTimeEstimate(sizeInTones);
        
        // Create Excavation Soil task
        const excavationTaskName = `Excavation soil with ${equipment.name} (${sizeInTones}t)`;
        const { data: existingExcavationTasks } = await supabase
          .from('event_tasks')
          .select('id')
          .eq('name', excavationTaskName)
          .eq('company_id', companyId);
        
        if (!existingExcavationTasks || existingExcavationTasks.length === 0) {
          const { error: taskError } = await supabase
            .from('event_tasks')
            .insert({
              name: excavationTaskName,
              description: t('form:time_per_person'),
              unit: "tons",
              estimated_hours: soilTimeEstimate.timePerTon,
              company_id: companyId
            });
          
          if (taskError) {
            console.error('Error creating excavation task:', taskError);
          } else {
            console.log('✅ Auto-created excavation task:', excavationTaskName);
          }
        } else {
          console.log('ℹ️ Excavation task already exists:', excavationTaskName);
        }
        
        // Create Loading Tape1 task
        const tape1TaskName = `Loading tape1 with ${equipment.name} (${sizeInTones}t)`;
        const { data: existingTape1Tasks } = await supabase
          .from('event_tasks')
          .select('id')
          .eq('name', tape1TaskName)
          .eq('company_id', companyId);
        
        if (!existingTape1Tasks || existingTape1Tasks.length === 0) {
          const { error: tape1Error } = await supabase
            .from('event_tasks')
            .insert({
              name: tape1TaskName,
              description: t('form:time_per_person'),
              unit: "tons",
              estimated_hours: tape1TimeEstimate.timePerTon,
              company_id: companyId
            });
          
          if (tape1Error) {
            console.error('Error creating tape1 loading task:', tape1Error);
          } else {
            console.log('✅ Auto-created tape1 loading task:', tape1TaskName);
          }
        } else {
          console.log('ℹ️ Tape1 loading task already exists:', tape1TaskName);
        }
      }
      
      // If it's a carrier, log that transport will be dynamic
      if (equipment.type === 'barrows_dumpers') {
        console.log('ℹ️ Carrier added - transport tasks will be created dynamically in projects');
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup_digging'] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['event_tasks'] });
      setNewEquipment({ 
        name: '', 
        description: '', 
        type: 'excavator', 
        quantity: 1, 
        "size (in tones)": excavatorSizes[0].value,
        speed_m_per_hour: undefined
      });
    },
    onError: (error) => {
      console.error('Mutation error:', error);
      alert(`Error adding equipment: ${error.message}`);
    }
  });

  // Delete digging equipment mutation
  const deleteEquipmentMutation = useMutation({
    mutationFn: async (id: string) => {
      // Get the equipment details first
      const { data: equipmentData } = await supabase
        .from('setup_digging')
        .select('name')
        .eq('id', id)
        .single();
      
      // Delete from setup_digging table
      const { error } = await supabase
        .from('setup_digging')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Also delete from equipment table by name
      if (equipmentData) {
        await supabase
          .from('equipment')
          .delete()
          .eq('name', equipmentData.name);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup_digging'] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    }
  });

  // Edit digging equipment mutation
  const editEquipmentMutation = useMutation({
    mutationFn: async (equipment: DiggingEquipment) => {
      // Get the original name first
      const { data: originalData } = await supabase
        .from('setup_digging')
        .select('name')
        .eq('id', equipment.id)
        .single();
      
      // Update setup_digging table
      const { data, error } = await supabase
        .from('setup_digging')
        .update({
          name: equipment.name,
          description: equipment.description,
          type: equipment.type,
          quantity: equipment.quantity,
          "size (in tones)": equipment["size (in tones)"],
          speed_m_per_hour: equipment.speed_m_per_hour
        })
        .eq('id', equipment.id)
        .select();
      
      if (error) throw error;
      
      // Also update equipment table by original name
      if (originalData) {
        await supabase
          .from('equipment')
          .update({
            name: equipment.name,
            description: equipment.description,
            type: equipment.type === 'excavator' ? 'machine' : 'tool',
            quantity: equipment.quantity
          })
          .eq('name', originalData.name);
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup_digging'] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setEditingEquipmentId(null);
      setEditEquipment(null);
    }
  });

  // Filter equipment
  const filteredEquipment = equipment.filter(item => 
    item.name.toLowerCase().includes(equipmentSearch.toLowerCase())
  );

  // Handle adding equipment
  const handleAddEquipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEquipment.name) {
      addEquipmentMutation.mutate(newEquipment);
    }
  };

  // Handle editing equipment
  const handleEditEquipment = (equipment: DiggingEquipment) => {
    setEditEquipment(equipment);
    setEditingEquipmentId(equipment.id);
  };

  // Handle saving equipment edits
  const handleSaveEdit = () => {
    if (editEquipment) {
      editEquipmentMutation.mutate(editEquipment);
    }
  };

  // Get status color
  const getStatusColor = (status: DiggingEquipment['status']) => {
    switch (status) {
      case 'free_to_use':
        return 'bg-green-100 text-green-800';
      case 'in_use':
        return 'bg-blue-100 text-blue-800';
      case 'broken':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatEquipmentStatus = (status: DiggingEquipment['status']) => {
    if (!status) return t('common:unknown');
    
    const statusKey = `project:equipment_status_${status.replace(/_/g, '_')}`;
    const translated = t(statusKey);
    
    // Fallback if translation key doesn't exist
    if (translated === statusKey) {
      return status.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    }
    return translated;
  };

  // Get type display name
  const getTypeDisplayName = (type: DiggingEquipment['type']) => {
    switch (type) {
      case 'excavator':
        return t('form:excavator_type');
      case 'barrows_dumpers':
        return t('form:barrows_dumpers_type');
      default:
        return type;
    }
  };

  // Format size for display
  const formatSize = (size: number | null) => {
    if (size === null) return '-';
    return `${size} ${t('form:tonnes_unit')}`;
  };

  // Get size options based on equipment type
  const getSizeOptions = (type: 'excavator' | 'barrows_dumpers') => {
    return type === 'excavator' ? excavatorSizes : dumperBarrowSizes;
  };

  // Handle type change to update size options
  const handleTypeChange = (type: 'excavator' | 'barrows_dumpers') => {
    const defaultSize = type === 'excavator' ? excavatorSizes[0].value : dumperBarrowSizes[0].value;
    setNewEquipment({
      ...newEquipment,
      type,
      "size (in tones)": defaultSize,
      speed_m_per_hour: type === 'barrows_dumpers' ? (defaultSpeeds[defaultSize] || 4000) : undefined
    });
  };

  const contentMarkup = (
    <>
          <div className="bg-gray-100 p-3 rounded-lg mb-3 text-sm">
            <p className="text-red-600">
              {t('form:setup_digging_warning')}
            </p>
          </div>
          
          {/* Add Equipment Form */}
          <form onSubmit={handleAddEquipment} className="mb-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:equipment_name_label')}</label>
              <input
                type="text"
                placeholder={t('form:enter_equipment_name')}
                value={newEquipment.name}
                onChange={(e) => setNewEquipment({...newEquipment, name: e.target.value})}
                className="w-full p-2 border rounded text-sm"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:equipment_description_optional')}</label>
              <textarea
                placeholder={t('form:enter_equipment_description')}
                value={newEquipment.description}
                onChange={(e) => setNewEquipment({...newEquipment, description: e.target.value})}
                className="w-full p-2 border rounded text-sm"
                rows={2}
              />
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:equipment_type_label')}</label>
                <select
                  value={newEquipment.type}
                  onChange={(e) => handleTypeChange(e.target.value as 'excavator' | 'barrows_dumpers')}
                  className="w-full p-2 border rounded text-sm"
                >
                  <option value="excavator">{t('form:excavator_type')}</option>
                  <option value="barrows_dumpers">{t('form:barrows_dumpers_type')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:equipment_quantity_label')}</label>
                <input
                  type="number"
                  min="1"
                  placeholder={t('form:quantity_available_placeholder')}
                  value={newEquipment.quantity}
                  onChange={(e) => setNewEquipment({...newEquipment, quantity: parseInt(e.target.value) || 1})}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('form:equipment_size_label')}</label>
                <select
                  value={newEquipment["size (in tones)"]}
                  onChange={(e) => {
                    const newSize = parseFloat(e.target.value);
                    setNewEquipment({
                      ...newEquipment, 
                      "size (in tones)": newSize,
                      speed_m_per_hour: newEquipment.type === 'barrows_dumpers' ? (defaultSpeeds[newSize] || 4000) : undefined
                    });
                  }}
                  className="w-full p-2 border rounded text-sm"
                >
                  {getSizeOptions(newEquipment.type).map(size => (
                    <option key={size.value} value={size.value}>
                      {size.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Speed field - only for carriers */}
            {newEquipment.type === 'barrows_dumpers' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('form:speed_m_h_label')}
                  <span className="text-xs text-gray-500 ml-2">
                    {t('form:default_speed_info', { default: defaultSpeeds[newEquipment["size (in tones)"]] || 4000 })}
                  </span>
                </label>
                <input
                  type="number"
                  min="100"
                  placeholder={t('form:default_speed_info', { default: defaultSpeeds[newEquipment["size (in tones)"]] || 4000 })}
                  value={newEquipment.speed_m_per_hour || ''}
                  onChange={(e) => setNewEquipment({
                    ...newEquipment, 
                    speed_m_per_hour: parseInt(e.target.value) || undefined
                  })}
                  className="w-full p-2 border rounded text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('form:speed_use_info')}
                </p>
              </div>
            )}
            
            <button
              type="submit"
              className="w-full bg-gray-700 text-white p-2 rounded hover:bg-gray-800 text-sm"
            >
              {t('form:add_equipment_button_text')}
            </button>
          </form>
          
          {/* Search Equipment */}
          <div className="relative mb-3">
            <input
              type="text"
              placeholder={t('form:search_equipment_placeholder')}
              value={equipmentSearch}
              onChange={(e) => setEquipmentSearch(e.target.value)}
              className="w-full p-2 pl-8 border rounded text-sm"
            />
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          </div>
          
          {/* Equipment List */}
          <div className="border rounded overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('form:name_label')}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('form:description_label')}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('form:type_label')}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('form:quantity_label')}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('form:size_label')}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('form:speed_label')}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('form:status_label')}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('form:actions_label')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEquipment.map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                      {editingEquipmentId === item.id ? (
                        <input
                          type="text"
                          value={editEquipment?.name || ''}
                          onChange={(e) => setEditEquipment({...editEquipment!, name: e.target.value})}
                          className="w-full p-1 border rounded text-sm"
                        />
                      ) : (
                        item.name
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {editingEquipmentId === item.id ? (
                        <input
                          type="text"
                          value={editEquipment?.description || ''}
                          onChange={(e) => setEditEquipment({...editEquipment!, description: e.target.value})}
                          className="w-full p-1 border rounded text-sm"
                        />
                      ) : (
                        item.description || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {editingEquipmentId === item.id ? (
                        <select
                          value={editEquipment?.type || 'excavator'}
                          onChange={(e) => {
                            const newType = e.target.value as 'excavator' | 'barrows_dumpers';
                            const sizeOptions = newType === 'excavator' ? excavatorSizes : dumperBarrowSizes;
                            setEditEquipment({
                              ...editEquipment!, 
                              type: newType,
                              "size (in tones)": sizeOptions[0].value
                            });
                          }}
                          className="w-full p-1 border rounded text-sm"
                        >
                          <option value="excavator">{t('form:excavator_type')}</option>
                          <option value="barrows_dumpers">{t('form:barrows_dumpers_type')}</option>
                        </select>
                      ) : (
                        getTypeDisplayName(item.type)
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {editingEquipmentId === item.id ? (
                        <input
                          type="number"
                          min="1"
                          value={editEquipment?.quantity || 1}
                          onChange={(e) => setEditEquipment({...editEquipment!, quantity: parseInt(e.target.value) || 1})}
                          className="w-full p-1 border rounded text-sm"
                        />
                      ) : (
                        <div>
                          <span>{item.quantity} {t('form:equipment_qty_total', { count: item.quantity })}</span>
                          {item.in_use_quantity > 0 && (
                            <span className="text-xs text-gray-500 ml-2">{t('form:equipment_qty_in_use', { count: item.in_use_quantity })}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {editingEquipmentId === item.id ? (
                        <select
                          value={editEquipment?.["size (in tones)"] || ''}
                          onChange={(e) => setEditEquipment({
                            ...editEquipment!, 
                            "size (in tones)": parseFloat(e.target.value)
                          })}
                          className="w-full p-1 border rounded text-sm"
                        >
                          {getSizeOptions(editEquipment?.type || 'excavator').map(size => (
                            <option key={size.value} value={size.value}>
                              {size.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        formatSize(item["size (in tones)"])
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {editingEquipmentId === item.id ? (
                        item.type === 'barrows_dumpers' ? (
                          <input
                            type="number"
                            min="100"
                            placeholder={`${defaultSpeeds[editEquipment?.["size (in tones)"] || 0] || 4000}`}
                            value={editEquipment?.speed_m_per_hour || ''}
                            onChange={(e) => setEditEquipment({
                              ...editEquipment!, 
                              speed_m_per_hour: parseInt(e.target.value) || null
                            })}
                            className="w-full p-1 border rounded text-sm"
                          />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )
                      ) : (
                        item.type === 'barrows_dumpers' && item.speed_m_per_hour ? (
                          `${item.speed_m_per_hour}`
                        ) : (
                          <span className="text-gray-400">-</span>
                        )
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(item.status)}`}>
                        {formatEquipmentStatus(item.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                      {editingEquipmentId === item.id ? (
                        <button
                          onClick={handleSaveEdit}
                          className="text-green-500 hover:text-green-700 mr-2"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEditEquipment(item)}
                          className="text-green-500 hover:text-green-700 mr-2"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteEquipmentMutation.mutate(item.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredEquipment.length === 0 && (
              <p className="text-center text-gray-500 py-4 text-sm">{t('form:no_equipment_found')}</p>
            )}
          </div>
    </>
  );

  if (wizardMode) {
    return (
      <div className="p-4 space-y-4">
        {contentMarkup}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <div className="flex items-center">
            <Truck className="w-5 h-5 text-gray-700 mr-2" />
            <h2 className="text-lg font-semibold">{t('form:excavators_barrows_dumpers_title')}</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {contentMarkup}
        </div>
      </div>
    </div>
  );
};

export default SetupDigging;
