import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';
import { X, Plus, Pencil, Info, Wrench, Truck, Search, AlertCircle } from 'lucide-react';
import { releaseEquipment } from '../../../lib/equipmentService';
import DatePicker from '../../../components/DatePicker';
import { Spinner, Button } from '../../../themes/uiComponents';
import { colors } from '../../../themes/designTokens';

interface Equipment {
  id: string;
  name: string;
  description: string | null;
  status: 'free_to_use' | 'in_use' | 'broken';
  created_at: string;
  type: 'machine' | 'tool';
  quantity: number;
  in_use_quantity: number;
  broken_quantity?: number;
}

interface Event {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
}

interface EquipmentUsage {
  event_id: string;
  start_date: string;
  end_date: string;
  quantity: number;
}

interface SetupEquipmentProps {
  onClose: () => void;
  wizardMode?: boolean;
}

const SetupEquipment: React.FC<SetupEquipmentProps> = ({ onClose, wizardMode = false }) => {
  const { t } = useTranslation(['common', 'form', 'utilities']);
  const queryClient = useQueryClient();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newStatus, setNewStatus] = useState<Equipment['status']>('free_to_use');
  const [machineSearch, setMachineSearch] = useState('');
  const [toolSearch, setToolSearch] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [equipmentUsage, setEquipmentUsage] = useState<EquipmentUsage>({
    event_id: '',
    start_date: '',
    end_date: '',
    quantity: 1
  });
  const [newEquipment, setNewEquipment] = useState({
    name: '',
    description: '',
    status: 'free_to_use' as Equipment['status'],
    type: 'tool' as 'machine' | 'tool',
    quantity: 1
  });
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [brokenQuantity, setBrokenQuantity] = useState(1);
  const [restoreQuantity, setRestoreQuantity] = useState(1);

  // Fetch equipment using React Query
  const { data: equipment = [], isLoading, error } = useQuery({
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

  // Fetch events for the dropdown
  const { data: events = [] } = useQuery({
    queryKey: ['events', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_date, end_date')
        .eq('company_id', companyId)
        .not('status', 'eq', 'finished')
        .order('start_date', { ascending: false });
      
      if (error) throw error;
      return data as Event[];
    },
    enabled: !!companyId
  });

  // Add equipment mutation
  const addEquipmentMutation = useMutation({
    mutationFn: async (equipment: typeof newEquipment) => {
      const { error } = await supabase
        .from('equipment')
        .insert([{ ...equipment, company_id: companyId }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', companyId] });
      setShowAddModal(false);
      setNewEquipment({
        name: '',
        description: '',
        status: 'free_to_use',
        type: 'tool',
        quantity: 1
      });
    }
  });

  // Edit equipment mutation
  const editEquipmentMutation = useMutation({
    mutationFn: async (equipment: Equipment) => {
      const { error } = await supabase
        .from('equipment')
        .update({
          name: equipment.name,
          description: equipment.description,
          type: equipment.type,
          quantity: equipment.quantity
        })
        .eq('id', equipment.id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', companyId] });
      setShowEditModal(false);
      setEditingEquipment(null);
    }
  });

  // Update equipment status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      usage,
      brokenQuantity: brokenQtyParam,
      restoreQuantity: restoreQtyParam
    }: {
      id: string;
      status: string;
      usage?: EquipmentUsage;
      brokenQuantity?: number;
      restoreQuantity?: number;
    }) => {
      if (status === 'in_use' && usage) {
        // First, check if there's enough available quantity
        const { data: currentEquipment } = await supabase
          .from('equipment')
          .select('quantity, in_use_quantity')
          .eq('id', id)
          .eq('company_id', companyId)
          .single();

        if (!currentEquipment) throw new Error(t('form:equipment_not_found'));

        const availableQuantity = currentEquipment.quantity - currentEquipment.in_use_quantity;
        if (usage.quantity > availableQuantity) {
          throw new Error(t('form:not_enough_available_units'));
        }

        // Create equipment usage record
        const { error: usageError } = await supabase
          .from('equipment_usage')
          .insert({
            equipment_id: id,
            event_id: usage.event_id,
            start_date: usage.start_date,
            end_date: usage.end_date,
            quantity: usage.quantity,
            is_returned: false,
            company_id: companyId
          });

        if (usageError) throw usageError;
        
        // Calculate new in_use_quantity
        const newInUseQuantity = currentEquipment.in_use_quantity + usage.quantity;
        
        // If all quantities will be in use, set status to 'in_use', otherwise keep it as 'free_to_use'
        const newStatus = newInUseQuantity >= currentEquipment.quantity ? 'in_use' : 'free_to_use';
        
        // Update in_use_quantity and status
        const { error: updateError } = await supabase
          .from('equipment')
          .update({ 
            in_use_quantity: newInUseQuantity,
            status: newStatus
          })
          .eq('id', id)
          .eq('company_id', companyId);
          
        if (updateError) throw updateError;
      } else if (status === 'broken') {
        // Fetch current broken_quantity
        const { data: currentEquipment, error: fetchError } = await supabase
          .from('equipment')
          .select('broken_quantity, quantity')
          .eq('id', id)
          .eq('company_id', companyId)
          .single();
        if (fetchError) throw fetchError;

        const prevBroken = currentEquipment?.broken_quantity || 0;
        const totalQty = currentEquipment?.quantity || 1;
        const toBreak = brokenQtyParam || 1;
        const newBroken = prevBroken + toBreak;

        // If all are broken, set status to 'broken', else keep as is
        const newStatus = newBroken >= totalQty ? 'broken' : 'free_to_use';

        const { error: updateError } = await supabase
          .from('equipment')
          .update({
            broken_quantity: newBroken,
            status: newStatus
          })
          .eq('id', id)
          .eq('company_id', companyId);

        if (updateError) throw updateError;
      } else if (status === 'free_to_use') {
        // Check if there are broken units and restoreQuantity is set
        const { data: currentEquipment } = await supabase
          .from('equipment')
          .select('broken_quantity, in_use_quantity')
          .eq('id', id)
          .eq('company_id', companyId)
          .single();

        const brokenQty = currentEquipment?.broken_quantity || 0;
        const toRestore = restoreQtyParam || 1;

        if (brokenQty > 0 && toRestore > 0) {
          const newBroken = Math.max(0, brokenQty - toRestore);

          // Only set status to free_to_use if all are restored and none in use
          const newStatus = newBroken === 0 && (currentEquipment?.in_use_quantity || 0) === 0 ? 'free_to_use'
            : newBroken > 0 ? 'broken'
            : 'in_use';

          const { error: updateError } = await supabase
            .from('equipment')
            .update({
              broken_quantity: newBroken,
              status: newStatus
            })
            .eq('id', id)
            .eq('company_id', companyId);

          if (updateError) throw updateError;
        } else {
          // Fallback to your old logic for free_to_use
          if (!currentEquipment) throw new Error(t('form:equipment_not_found'));
          if (currentEquipment.in_use_quantity === 0) {
            const { error: statusError } = await supabase
              .from('equipment')
              .update({ status })
              .eq('id', id)
              .eq('company_id', companyId);

            if (statusError) throw statusError;
          } else {
            throw new Error(t('form:cannot_set_free_while_in_use'));
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', companyId] });
      setShowStatusModal(false);
      setNewStatus('free_to_use');
      setEquipmentUsage({ event_id: '', start_date: '', end_date: '', quantity: 1 });
      setBrokenQuantity(1);
      setRestoreQuantity(1);
    },
    onError: (error) => {
      console.error('[MUTATION] Status update failed:', error);
    }
  });

  const getStatusColor = (status: Equipment['status'], item?: Equipment): React.CSSProperties => {
    // If item is provided and it has available quantities, show as free_to_use
    if (item && item.quantity > item.in_use_quantity) {
      return { backgroundColor: colors.green, color: colors.textOnAccent };
    }
    
    switch (status) {
      case 'free_to_use':
        return { backgroundColor: colors.green, color: colors.textOnAccent };
      case 'in_use':
        return { backgroundColor: colors.amber, color: colors.textOnAccent };
      case 'broken':
        return { backgroundColor: colors.red, color: colors.textOnAccent };
      default:
        return { backgroundColor: colors.textMuted, color: colors.textOnAccent };
    }
  };

  const handleAddEquipment = () => {
    if (!newEquipment.name) return;
    addEquipmentMutation.mutate(newEquipment);
  };

  const handleEditEquipment = () => {
    if (!editingEquipment) return;
    editEquipmentMutation.mutate(editingEquipment);
  };

  const handleEditClick = (equipment: Equipment) => {
    setEditingEquipment(equipment);
    setShowEditModal(true);
  };

  const handleStatusUpdate = () => {
    if (!selectedEquipment) return;
    
    if (newStatus === 'in_use') {
      if (!equipmentUsage.event_id || !equipmentUsage.start_date || !equipmentUsage.end_date) {
        setValidationError(t('form:fill_all_required_fields'));
        return;
      }
      updateStatusMutation.mutate({
        id: selectedEquipment.id,
        status: newStatus,
        usage: equipmentUsage
      });
    } else if (newStatus === 'broken') {
      updateStatusMutation.mutate({
        id: selectedEquipment.id,
        status: newStatus,
        brokenQuantity
      });
    } else if (newStatus === 'free_to_use' && (selectedEquipment.broken_quantity || 0) > 0) {
      updateStatusMutation.mutate({
        id: selectedEquipment.id,
        status: newStatus,
        restoreQuantity
      });
    } else {
      // For free_to_use with no broken units
      updateStatusMutation.mutate({
        id: selectedEquipment.id,
        status: newStatus
      });
    }
  };

  // Filter equipment by type and search terms
  const filteredMachines = equipment
    .filter(item => item.type === 'machine')
    .filter(item => 
      item.name.toLowerCase().includes(machineSearch.toLowerCase()) ||
      (item.description?.toLowerCase() || '').includes(machineSearch.toLowerCase())
    );

  const filteredTools = equipment
    .filter(item => item.type === 'tool')
    .filter(item => 
      item.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
      (item.description?.toLowerCase() || '').includes(toolSearch.toLowerCase())
    );

  // Get selected project's date range
  const selectedProject = events.find(e => e.id === equipmentUsage.event_id);

  const handleReleaseEquipment = async (equipmentId, eventId) => {
    try {
      // 1. First, check if the equipment_usage record exists
      const { data: usageCheck, error: checkError } = await supabase
        .from('equipment_usage')
        .select('*')
        .eq('equipment_id', equipmentId)
        .eq('event_id', eventId)
        .eq('is_returned', false)
        .single();
      
      if (checkError || !usageCheck) {
        console.error('Equipment usage record not found or already returned');
        alert(t('form:equipment_usage_not_found'));
        return;
      }
      
      // 2. Try to update the equipment_usage record
      const { data: usageData, error: usageError } = await supabase
        .from('equipment_usage')
        .update({ 
          is_returned: true,
          return_date: new Date().toISOString() 
        })
        .eq('id', usageCheck.id)
        .select();
      
      if (usageError) {
        console.error('Failed to update equipment_usage:', usageError);
        alert(t('form:failed_update_equipment_usage', { error: usageError.message }));
        return;
      }
      
      // 3. Check if the equipment record exists
      const { data: equipCheck, error: equipCheckError } = await supabase
        .from('equipment')
        .select('*')
        .eq('id', equipmentId)
        .single();
      
      if (equipCheckError || !equipCheck) {
        console.error('Equipment record not found');
        alert(t('form:equipment_record_not_found'));
        return;
      }
      
      // 4. Try to update the equipment status
      const { data: equipData, error: equipError } = await supabase
        .from('equipment')
        .update({ status: 'free_to_use' })
        .eq('id', equipmentId)
        .select();
      
      if (equipError) {
        console.error('Failed to update equipment status:', equipError);
        alert(t('form:equipment_usage_updated_but_status_failed', { error: equipError.message }));
        return;
      }
      
      alert(t('form:equipment_released_success'));
      
      // Refresh the equipment list
      queryClient.invalidateQueries({ queryKey: ['equipment', companyId] });
      
    } catch (e) {
      console.error('Exception during equipment release:', e);
      alert(t('form:unexpected_error', { error: (e as any).message }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="p-4 rounded-lg mt-6" style={{ color: colors.red, backgroundColor: colors.redLight }}>
          {t('form:failed_load_equipment')}
        </div>
      </div>
    );
  }

  // Wizard mode - simplified inline view
  if (wizardMode) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto">
        <div className="text-sm p-3 rounded-lg border" style={{ color: colors.textOnAccent, backgroundColor: colors.red, borderColor: colors.red }}>
          <p>{t('form:equipment_management_description')}</p>
        </div>
        
        <Button variant="primary" fullWidth onClick={() => setShowAddModal(true)} icon="+" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Plus className="w-4 h-4" />
            {t('form:add_equipment_button')}
          </Button>

        {/* Machines Section */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: colors.textPrimary }}>
            <Truck className="w-5 h-5" />
            {t('form:machines_count', { count: filteredMachines.length })}
          </h3>
          <div className="space-y-2">
            {filteredMachines.map(item => (
              <div key={item.id} className="p-3 rounded border" style={{ backgroundColor: colors.bgSubtle, borderColor: colors.borderDefault }}>
                <div className="font-medium" style={{ color: colors.textPrimary }}>{item.name}</div>
                {item.description && <div className="text-sm" style={{ color: colors.textMuted }}>{item.description}</div>}
                <div className="text-xs mt-1" style={{ color: colors.textSubtle }}>{t('form:quantity_label', { quantity: item.quantity })}</div>
              </div>
            ))}
            {filteredMachines.length === 0 && <p className="text-sm" style={{ color: colors.textSubtle }}>{t('form:no_machines_added')}</p>}
          </div>
        </div>

        {/* Tools Section */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: colors.textPrimary }}>
            <Wrench className="w-5 h-5" />
            {t('form:tools_count', { count: filteredTools.length })}
          </h3>
          <div className="space-y-2">
            {filteredTools.map(item => (
              <div key={item.id} className="p-3 rounded border" style={{ backgroundColor: colors.bgSubtle, borderColor: colors.borderDefault }}>
                <div className="font-medium" style={{ color: colors.textPrimary }}>{item.name}</div>
                {item.description && <div className="text-sm" style={{ color: colors.textMuted }}>{item.description}</div>}
                <div className="text-xs mt-1" style={{ color: colors.textSubtle }}>{t('form:quantity_label', { quantity: item.quantity })}</div>
              </div>
            ))}
            {filteredTools.length === 0 && <p className="text-sm" style={{ color: colors.textSubtle }}>{t('form:no_tools_added')}</p>}
          </div>
        </div>

        {/* Add Equipment Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: colors.bgModalBackdrop }}>
            <div className="rounded-lg max-w-md w-full p-6 space-y-4" style={{ backgroundColor: colors.bgCard }}>
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>{t('form:add_new_equipment')}</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-2 rounded-full transition-colors"
                  style={{ backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.bgHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:equipment_type_label')}</label>
                <select
                  value={newEquipment.type}
                  onChange={(e) => setNewEquipment(prev => ({ ...prev, type: e.target.value as 'machine' | 'tool' }))}
                  className="mt-1 block w-full rounded-md shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                  style={{ borderColor: colors.borderDefault }}
                >
                  <option value="machine">{t('form:machine_option')}</option>
                  <option value="tool">{t('form:tool_option')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:equipment_name_label')}</label>
                <input
                  type="text"
                  value={newEquipment.name}
                  onChange={(e) => setNewEquipment(prev => ({ ...prev, name: e.target.value }))}
                  className="mt-1 block w-full rounded-md shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                  style={{ borderColor: colors.borderDefault }}
                  placeholder={t('form:enter_equipment_name')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:equipment_description_label')}</label>
                <textarea
                  value={newEquipment.description}
                  onChange={(e) => setNewEquipment(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="mt-1 block w-full rounded-md shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                  style={{ borderColor: colors.borderDefault }}
                  placeholder={t('form:enter_equipment_description')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:equipment_quantity_label')}</label>
                <input
                  type="number"
                  value={newEquipment.quantity}
                  onChange={(e) => setNewEquipment(prev => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                  min="1"
                  className="mt-1 block w-full rounded-md shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                  style={{ borderColor: colors.borderDefault }}
                />
              </div>

              <Button variant="primary" fullWidth onClick={handleAddEquipment} disabled={!newEquipment.name || addEquipmentMutation.isPending}>
                {addEquipmentMutation.isPending ? t('form:adding_in_progress') : t('form:add_equipment_button')}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const EquipmentSection = ({ 
    title, 
    items, 
    icon: Icon,
    searchValue,
    onSearchChange
  }: { 
    title: string; 
    items: Equipment[]; 
    icon: React.ElementType;
    searchValue: string;
    onSearchChange: (value: string) => void;
  }) => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Icon className="w-6 h-6" style={{ color: colors.textMuted }} />
        <h2 className="text-xl font-semibold" style={{ color: colors.textPrimary }}>{title}</h2>
      </div>
      <div className="relative w-64">
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('form:search_equipment_placeholder', { title })}
          className="w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-[var(--accent)]"
          style={{ borderColor: colors.borderDefault }}
        />
        <Search className="absolute left-3 top-2.5 h-5 w-5" style={{ color: colors.textSubtle }} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow"
            style={{ backgroundColor: colors.bgCard }}
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base break-words" style={{ color: colors.textPrimary }}>{item.name}</h3>
                <div className="mt-1 space-y-1">
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={getStatusColor(item.status, item)}>
                    {item.broken_quantity >= item.quantity
                      ? t('form:status_broken')
                      : item.quantity - (item.in_use_quantity + (item.broken_quantity || 0)) > 0
                        ? t('form:status_free_to_use')
                        : item.in_use_quantity > 0
                          ? t('form:status_in_use')
                          : t('form:status_free_to_use')
                    }
                  </span>
                  <div className="text-xs" style={{ color: colors.textMuted }}>
                    {item.broken_quantity > 0 && (
                      <span style={{ color: colors.red }}>{t('form:broken_count', { count: item.broken_quantity })}</span>
                    )}
                    {item.in_use_quantity > 0 && (
                      <span className="ml-2" style={{ color: colors.amber }}>{t('form:in_use_count', { count: item.in_use_quantity })}</span>
                    )}
                    {item.quantity - (item.in_use_quantity + (item.broken_quantity || 0)) > 0 && (
                      <span className="ml-2" style={{ color: colors.green }}>
                        {t('form:free_count', { count: item.quantity - (item.in_use_quantity + (item.broken_quantity || 0)) })}
                      </span>
                    )}
                    <span className="ml-2" style={{ color: colors.textSubtle }}>{t('form:total_count', { count: item.quantity })}</span>
                  </div>
                </div>
              </div>
              <div className="flex space-x-1">
                <button
                  onClick={() => handleEditClick(item)}
                  className="p-2 transition-colors"
                  style={{ color: colors.green }}
                  title={t('form:edit_equipment_title')}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setSelectedEquipment(item);
                    setShowStatusModal(true);
                    setEquipmentUsage(prev => ({ ...prev, quantity: 1 }));
                  }}
                  className="p-2 transition-colors"
                  style={{ color: colors.accentBlue }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = colors.accentBlueDark; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = colors.accentBlue; }}
                  title={t('form:update_status_title')}
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="col-span-full text-center py-8" style={{ color: colors.textSubtle }}>
            {t('form:no_equipment_found', { title })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: colors.bgModalBackdrop }}>
      <div className="rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto flex flex-col" style={{ backgroundColor: colors.bgCard }}>
        <div className="sticky top-0 z-10 flex-shrink-0 border-b py-3 px-4 flex justify-between items-center rounded-t-lg" style={{ backgroundColor: colors.bgCard, borderColor: colors.borderDefault }}>
          <h1 className="text-base font-semibold" style={{ color: colors.textPrimary }}>{t('form:equipment_manager_heading')}</h1>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors"
            style={{ backgroundColor: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.bgHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
      <div className="w-full">
        <p className="italic mb-4" style={{ color: colors.red }}>
          {t('form:equipment_creation_warning')}
        </p>
      </div>
      <div className="flex justify-between items-center">
        <div className="space-x-4">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center px-4 py-2 rounded-lg transition-colors"
            style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.accentBlueDark; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.accentBlue; }}
          >
            <Plus className="w-5 h-5 mr-2" />
            {t('form:add_equipment_button')}
          </button>
        </div>
      </div>

      {equipment.length === 0 ? (
        <p className="p-4 rounded-lg" style={{ color: colors.textMuted, backgroundColor: colors.bgSubtle }}>{t('form:no_equipment_found', { title: 'equipment' })}</p>
      ) : (
        <div className="space-y-12">
          <EquipmentSection 
            title={t('form:machines_section_title')} 
            items={filteredMachines} 
            icon={Truck}
            searchValue={machineSearch}
            onSearchChange={setMachineSearch}
          />
          <EquipmentSection 
            title={t('form:tools_section_title')} 
            items={filteredTools} 
            icon={Wrench}
            searchValue={toolSearch}
            onSearchChange={setToolSearch}
          />
        </div>
      )}

      {/* Add Equipment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: colors.bgModalBackdrop }}>
          <div className="rounded-lg max-w-md w-full p-6 space-y-4" style={{ backgroundColor: colors.bgCard }}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>{t('form:add_new_equipment')}</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-full transition-colors"
                style={{ backgroundColor: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.bgHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:equipment_type_label')}</label>
              <select
                value={newEquipment.type}
                onChange={(e) => setNewEquipment(prev => ({ ...prev, type: e.target.value as 'machine' | 'tool' }))}
                className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
              >
                <option value="machine">{t('form:machine_option')}</option>
                <option value="tool">{t('form:tool_option')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:equipment_name_label')}</label>
              <input
                type="text"
                value={newEquipment.name}
                onChange={(e) => setNewEquipment(prev => ({ ...prev, name: e.target.value }))}
                className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
                placeholder={t('form:enter_equipment_name')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:equipment_description_label')}</label>
              <textarea
                value={newEquipment.description}
                onChange={(e) => setNewEquipment(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
                placeholder={t('form:enter_equipment_description')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:equipment_quantity_label')}</label>
              <input
                type="number"
                value={newEquipment.quantity}
                onChange={(e) => setNewEquipment(prev => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                min="1"
                className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
              />
            </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:equipment_initial_status_label')}</label>
                <select
                  value={newEquipment.status}
                  onChange={(e) => setNewEquipment(prev => ({ ...prev, status: e.target.value as Equipment['status'] }))}
                  className="mt-1 block w-full rounded-md shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                  style={{ borderColor: colors.borderDefault }}
                >
                  <option value="free_to_use">{t('form:status_free_to_use_option')}</option>
                  <option value="in_use">{t('form:status_in_use_option')}</option>
                  <option value="broken">{t('form:status_broken_option')}</option>
                </select>
              </div>

            <button
              onClick={handleAddEquipment}
              disabled={!newEquipment.name || addEquipmentMutation.isPending}
              className="w-full py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = colors.accentBlueDark; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.accentBlue; }}
            >
              {addEquipmentMutation.isPending ? t('form:adding_in_progress') : t('form:add_equipment_button')}
            </button>
          </div>
        </div>
      )}

      {/* Edit Equipment Modal */}
      {showEditModal && editingEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: colors.bgModalBackdrop }}>
          <div className="rounded-lg max-w-md w-full p-6 space-y-4" style={{ backgroundColor: colors.bgCard }}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>{t('form:edit_equipment_heading')}</h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingEquipment(null);
                }}
                className="p-2 rounded-full transition-colors"
                style={{ backgroundColor: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.bgHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:type_label')}</label>
              <select
                value={editingEquipment.type}
                onChange={(e) => setEditingEquipment(prev => ({ ...prev!, type: e.target.value as 'machine' | 'tool' }))}
                className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
              >
                <option value="machine">{t('form:machine_option')}</option>
                <option value="tool">{t('form:tool_option')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:name_label')}</label>
              <input
                type="text"
                value={editingEquipment.name}
                onChange={(e) => setEditingEquipment(prev => ({ ...prev!, name: e.target.value }))}
                className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
                placeholder={t('form:enter_equipment_name')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:equipment_description_label')}</label>
              <textarea
                value={editingEquipment.description || ''}
                onChange={(e) => setEditingEquipment(prev => ({ ...prev!, description: e.target.value }))}
                rows={3}
                className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
                placeholder={t('form:enter_equipment_description')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:total_quantity_label')}</label>
              <input
                type="number"
                value={editingEquipment.quantity}
                onChange={(e) => setEditingEquipment(prev => ({ ...prev!, quantity: Math.max(prev!.in_use_quantity, parseInt(e.target.value) || 1) }))}
                min={editingEquipment.in_use_quantity}
                className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
              />
              {editingEquipment.in_use_quantity > 0 && (
                <p className="mt-1 text-sm" style={{ color: colors.amber }}>
                  {t('form:minimum_quantity_in_use', { count: editingEquipment.in_use_quantity })}
                </p>
              )}
            </div>

            <button
              onClick={handleEditEquipment}
              disabled={!editingEquipment.name || editEquipmentMutation.isPending}
              className="w-full py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = colors.accentBlueDark; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.accentBlue; }}
            >
              {editEquipmentMutation.isPending ? t('form:saving_changes_text') : t('form:save_changes_button_text')}
            </button>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && selectedEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: colors.bgModalBackdrop }}>
          <div className="rounded-lg max-w-md w-full p-6 space-y-4" style={{ backgroundColor: colors.bgCard }}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>{t('form:update_equipment_status_heading')}</h3>
              <button
                onClick={() => {
                  setShowStatusModal(false);
                  setValidationError(null);
                }}
                className="p-2 rounded-full transition-colors"
                style={{ backgroundColor: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.bgHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {validationError && (
              <div className="p-3 rounded-md flex items-center" style={{ backgroundColor: colors.redLight, color: colors.red }}>
                <AlertCircle className="w-5 h-5 mr-2" />
                {validationError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:status_label')}</label>
              <select
                value={newStatus}
                onChange={(e) => {
                  setNewStatus(e.target.value as Equipment['status']);
                  setValidationError(null);
                  if (e.target.value !== 'in_use') {
                    setEquipmentUsage({ event_id: '', start_date: '', end_date: '', quantity: 1 });
                  }
                }}
                className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
              >
                <option value="free_to_use">{t('form:status_free_to_use_option')}</option>
                <option value="in_use">{t('form:status_in_use_option')}</option>
                <option value="broken">{t('form:status_broken_option')}</option>
              </select>
            </div>

            {newStatus === 'in_use' && (
              <>
                <div>
                  <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:project_label')}</label>
                  <select
                    value={equipmentUsage.event_id}
                    onChange={(e) => {
                      const project = events.find(ev => ev.id === e.target.value);
                      setEquipmentUsage({
                        event_id: e.target.value,
                        start_date: project?.start_date || '',
                        end_date: project?.end_date || '',
                        quantity: equipmentUsage.quantity
                      });
                    }}
                    className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
                  >
                    <option value="">{t('form:select_project')}</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:quantity_to_use_label')}</label>
                  <input
                    type="number"
                    value={equipmentUsage.quantity}
                    onChange={(e) => setEquipmentUsage(prev => ({ 
                      ...prev, 
                      quantity: Math.min(
                        Math.max(1, parseInt(e.target.value) || 1),
                        selectedEquipment.quantity - selectedEquipment.in_use_quantity
                      )
                    }))}
                    min="1"
                    max={selectedEquipment.quantity - selectedEquipment.in_use_quantity}
                    className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
                  />
                  <p className="mt-1 text-sm" style={{ color: colors.textMuted }}>
                    {t('form:available_of_total', { available: selectedEquipment.quantity - selectedEquipment.in_use_quantity, total: selectedEquipment.quantity })}
                  </p>
                </div>

                {selectedProject && (
                  <>
                    <div>
                      <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:start_date_label')}</label>
                      <DatePicker
                        value={equipmentUsage.start_date}
                        onChange={(v) => setEquipmentUsage(prev => ({ ...prev, start_date: v }))}
                        minDate={selectedProject.start_date}
                        maxDate={selectedProject.end_date}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:end_date_label')}</label>
                      <DatePicker
                        value={equipmentUsage.end_date}
                        onChange={(v) => setEquipmentUsage(prev => ({ ...prev, end_date: v }))}
                        minDate={equipmentUsage.start_date || selectedProject.start_date}
                        maxDate={selectedProject.end_date}
                        className="mt-1"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {newStatus === 'broken' && selectedEquipment && (
              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:quantity_to_mark_broken')}</label>
                <input
                  type="number"
                  min={1}
                  max={selectedEquipment.quantity - selectedEquipment.in_use_quantity - (selectedEquipment.broken_quantity || 0)}
                  value={brokenQuantity}
                  onChange={e =>
                    setBrokenQuantity(
                      Math.max(
                        1,
                        Math.min(
                          selectedEquipment.quantity - selectedEquipment.in_use_quantity - (selectedEquipment.broken_quantity || 0),
                          parseInt(e.target.value) || 1
                        )
                      )
                    )
                  }
                  className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
                />
                <p className="mt-1 text-sm" style={{ color: colors.textMuted }}>
                  {t('form:available_to_mark_broken', { count: selectedEquipment.quantity - selectedEquipment.in_use_quantity - (selectedEquipment.broken_quantity || 0) })}
                </p>
              </div>
            )}

            {newStatus === 'free_to_use' && selectedEquipment && (selectedEquipment.broken_quantity || 0) > 0 && (
              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('form:quantity_to_restore_broken')}</label>
                <input
                  type="number"
                  min={1}
                  max={selectedEquipment.broken_quantity || 1}
                  value={restoreQuantity}
                  onChange={e =>
                    setRestoreQuantity(
                      Math.max(
                        1,
                        Math.min(selectedEquipment.broken_quantity || 1, parseInt(e.target.value) || 1)
                      )
                    )
                  }
                  className="mt-1 block w-full rounded-md border shadow-sm focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: colors.borderDefault }}
                />
                <p className="mt-1 text-sm" style={{ color: colors.textMuted }}>
                  {t('form:broken_units_available_restore', { count: selectedEquipment.broken_quantity })}
                </p>
              </div>
            )}

            <button
              onClick={handleStatusUpdate}
              disabled={
                updateStatusMutation.isPending ||
                (newStatus === 'in_use' && (!equipmentUsage.event_id || !equipmentUsage.start_date || !equipmentUsage.end_date))
              }
              className="w-full py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = colors.accentBlueDark; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.accentBlue; }}
            >
              {updateStatusMutation.isPending ? t('form:updating_in_progress') : t('form:update_status_button')}
            </button>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default SetupEquipment;
