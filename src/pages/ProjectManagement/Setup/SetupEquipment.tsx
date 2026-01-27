import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';
import { Loader2, X, Plus, Pencil, Info, Wrench, Truck, Search, AlertCircle } from 'lucide-react';
import { releaseEquipment } from '../../../lib/equipmentService';

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
}

const SetupEquipment: React.FC<SetupEquipmentProps> = ({ onClose }) => {
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
      console.log('[MUTATION] Called with:', { id, status, usage, brokenQuantity: brokenQtyParam, restoreQuantity: restoreQtyParam });
      if (status === 'in_use' && usage) {
        // First, check if there's enough available quantity
        const { data: currentEquipment } = await supabase
          .from('equipment')
          .select('quantity, in_use_quantity')
          .eq('id', id)
          .eq('company_id', companyId)
          .single();

        if (!currentEquipment) throw new Error('Equipment not found');

        const availableQuantity = currentEquipment.quantity - currentEquipment.in_use_quantity;
        if (usage.quantity > availableQuantity) {
          throw new Error('Not enough available units');
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
        console.log('[MUTATION] Set', toBreak, 'as broken. New broken_quantity:', newBroken, 'Status:', newStatus);
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
          console.log('[MUTATION] Restored', toRestore, 'from broken. New broken_quantity:', newBroken, 'Status:', newStatus);
        } else {
          // Fallback to your old logic for free_to_use
          if (!currentEquipment) throw new Error('Equipment not found');
          if (currentEquipment.in_use_quantity === 0) {
            const { error: statusError } = await supabase
              .from('equipment')
              .update({ status })
              .eq('id', id)
              .eq('company_id', companyId);

            if (statusError) throw statusError;
          } else {
            throw new Error('Cannot set to free_to_use while some quantities are in use');
          }
        }
      }
    },
    onSuccess: () => {
      console.log('[MUTATION] Status update successful, invalidating equipment query');
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

  const getStatusColor = (status: Equipment['status'], item?: Equipment) => {
    // If item is provided and it has available quantities, show as free_to_use
    if (item && item.quantity > item.in_use_quantity) {
      return 'bg-green-100 text-green-800';
    }
    
    switch (status) {
      case 'free_to_use':
        return 'bg-green-100 text-green-800';
      case 'in_use':
        return 'bg-amber-200 text-amber-800';
      case 'broken':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
        setValidationError('Please fill all required fields');
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
      console.log('Starting equipment release process');
      console.log('Parameters:', { equipmentId, eventId });
      
      // 1. First, check if the equipment_usage record exists
      const { data: usageCheck, error: checkError } = await supabase
        .from('equipment_usage')
        .select('*')
        .eq('equipment_id', equipmentId)
        .eq('event_id', eventId)
        .eq('is_returned', false)
        .single();
      
      console.log('Usage check result:', { usageCheck, checkError });
      
      if (checkError || !usageCheck) {
        console.error('Equipment usage record not found or already returned');
        alert('Equipment usage record not found or already returned');
        return;
      }
      
      // 2. Try to update the equipment_usage record
      console.log('Attempting to update equipment_usage');
      const { data: usageData, error: usageError } = await supabase
        .from('equipment_usage')
        .update({ 
          is_returned: true,
          return_date: new Date().toISOString() 
        })
        .eq('id', usageCheck.id)
        .select();
      
      console.log('Usage update result:', { usageData, usageError });
      
      if (usageError) {
        console.error('Failed to update equipment_usage:', usageError);
        alert('Failed to update equipment usage: ' + usageError.message);
        return;
      }
      
      // 3. Check if the equipment record exists
      console.log('Checking equipment record');
      const { data: equipCheck, error: equipCheckError } = await supabase
        .from('equipment')
        .select('*')
        .eq('id', equipmentId)
        .single();
      
      console.log('Equipment check result:', { equipCheck, equipCheckError });
      
      if (equipCheckError || !equipCheck) {
        console.error('Equipment record not found');
        alert('Equipment record not found');
        return;
      }
      
      // 4. Try to update the equipment status
      console.log('Attempting to update equipment status');
      const { data: equipData, error: equipError } = await supabase
        .from('equipment')
        .update({ status: 'free_to_use' })
        .eq('id', equipmentId)
        .select();
      
      console.log('Equipment update result:', { equipData, equipError });
      
      if (equipError) {
        console.error('Failed to update equipment status:', equipError);
        alert('Equipment usage updated but failed to update equipment status: ' + equipError.message);
        return;
      }
      
      console.log('Equipment release completed successfully');
      alert('Equipment released successfully!');
      
      // Refresh the equipment list
      queryClient.invalidateQueries({ queryKey: ['equipment', companyId] });
      
    } catch (e) {
      console.error('Exception during equipment release:', e);
      alert('An unexpected error occurred: ' + e.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <BackButton />
        <div className="text-red-600 bg-red-50 p-4 rounded-lg mt-6">
          Failed to load equipment. Please try again later.
        </div>
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
        <Icon className="w-6 h-6 text-gray-600" />
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="relative w-64">
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={`Search ${title.toLowerCase()}...`}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-blue-500"
        />
        <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-bold text-xl text-gray-900">{item.name}</h3>
                <div className="mt-2 space-y-2">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(item.status, item)}`}>
                    {item.broken_quantity >= item.quantity
                      ? 'broken'
                      : item.quantity - (item.in_use_quantity + (item.broken_quantity || 0)) > 0
                        ? 'free to use'
                        : item.in_use_quantity > 0
                          ? 'in use'
                          : 'free to use'
                    }
                  </span>
                  <div className="text-sm text-gray-600">
                    {item.broken_quantity > 0 && (
                      <span className="text-red-600">{item.broken_quantity} broken</span>
                    )}
                    {item.in_use_quantity > 0 && (
                      <span className="ml-2 text-amber-600">{item.in_use_quantity} in use</span>
                    )}
                    {item.quantity - (item.in_use_quantity + (item.broken_quantity || 0)) > 0 && (
                      <span className="ml-2 text-green-600">
                        {item.quantity - (item.in_use_quantity + (item.broken_quantity || 0))} free
                      </span>
                    )}
                    <span className="ml-2 text-gray-400">/ {item.quantity} total</span>
                  </div>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEditClick(item)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  title="Edit equipment"
                >
                  <Pencil className="w-5 h-5 text-blue-600" />
                </button>
                <button
                  onClick={() => {
                    setSelectedEquipment(item);
                    setShowStatusModal(true);
                    setEquipmentUsage(prev => ({ ...prev, quantity: 1 }));
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  title="Update status"
                >
                  <Info className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-500">
            No {title.toLowerCase()} found matching your search.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-white border-b p-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Equipment Manager</h1>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4">
      <div className="w-full">
        <p className="text-red-500 italic mb-4">
          Don't create here Excavators and Carriers (wheel barrow, petrol barrows and dumpers) do it in setup page in project management
        </p>
      </div>
      <div className="flex justify-between items-center">
        <div className="space-x-4">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Equipment
          </button>
        </div>
      </div>

      {equipment.length === 0 ? (
        <p className="text-gray-600 bg-gray-50 p-4 rounded-lg">No equipment found.</p>
      ) : (
        <div className="space-y-12">
          <EquipmentSection 
            title="Machines" 
            items={filteredMachines} 
            icon={Truck}
            searchValue={machineSearch}
            onSearchChange={setMachineSearch}
          />
          <EquipmentSection 
            title="Tools" 
            items={filteredTools} 
            icon={Wrench}
            searchValue={toolSearch}
            onSearchChange={setToolSearch}
          />
        </div>
      )}

      {/* Add Equipment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Add New Equipment</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <select
                value={newEquipment.type}
                onChange={(e) => setNewEquipment(prev => ({ ...prev, type: e.target.value as 'machine' | 'tool' }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="machine">Machine</option>
                <option value="tool">Tool</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={newEquipment.name}
                onChange={(e) => setNewEquipment(prev => ({ ...prev, name: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Enter equipment name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={newEquipment.description}
                onChange={(e) => setNewEquipment(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Enter equipment description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Quantity</label>
              <input
                type="number"
                value={newEquipment.quantity}
                onChange={(e) => setNewEquipment(prev => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                min="1"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Initial Status</label>
              <select
                value={newEquipment.status}
                onChange={(e) => setNewEquipment(prev => ({ ...prev, status: e.target.value as Equipment['status'] }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="free_to_use">Free to use</option>
                <option value="in_use">In use</option>
                <option value="broken">Broken</option>
              </select>
            </div>

            <button
              onClick={handleAddEquipment}
              disabled={!newEquipment.name || addEquipmentMutation.isPending}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {addEquipmentMutation.isPending ? 'Adding...' : 'Add Equipment'}
            </button>
          </div>
        </div>
      )}

      {/* Edit Equipment Modal */}
      {showEditModal && editingEquipment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Edit Equipment</h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingEquipment(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <select
                value={editingEquipment.type}
                onChange={(e) => setEditingEquipment(prev => ({ ...prev!, type: e.target.value as 'machine' | 'tool' }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="machine">Machine</option>
                <option value="tool">Tool</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={editingEquipment.name}
                onChange={(e) => setEditingEquipment(prev => ({ ...prev!, name: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Enter equipment name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={editingEquipment.description || ''}
                onChange={(e) => setEditingEquipment(prev => ({ ...prev!, description: e.target.value }))}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Enter equipment description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Total Quantity</label>
              <input
                type="number"
                value={editingEquipment.quantity}
                onChange={(e) => setEditingEquipment(prev => ({ ...prev!, quantity: Math.max(prev!.in_use_quantity, parseInt(e.target.value) || 1) }))}
                min={editingEquipment.in_use_quantity}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              {editingEquipment.in_use_quantity > 0 && (
                <p className="mt-1 text-sm text-amber-600">
                  Minimum quantity is {editingEquipment.in_use_quantity} (currently in use)
                </p>
              )}
            </div>

            <button
              onClick={handleEditEquipment}
              disabled={!editingEquipment.name || editEquipmentMutation.isPending}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {editEquipmentMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && selectedEquipment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Update Equipment Status</h3>
              <button
                onClick={() => {
                  setShowStatusModal(false);
                  setValidationError(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {validationError && (
              <div className="bg-red-50 text-red-700 p-3 rounded-md flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                {validationError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select
                value={newStatus}
                onChange={(e) => {
                  setNewStatus(e.target.value as Equipment['status']);
                  setValidationError(null);
                  if (e.target.value !== 'in_use') {
                    setEquipmentUsage({ event_id: '', start_date: '', end_date: '', quantity: 1 });
                  }
                }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="free_to_use">Free to use</option>
                <option value="in_use">In use</option>
                <option value="broken">Broken</option>
              </select>
            </div>

            {newStatus === 'in_use' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Project</label>
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
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Select Project</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Quantity to Use</label>
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
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-sm text-gray-600">
                    Available: {selectedEquipment.quantity - selectedEquipment.in_use_quantity} of {selectedEquipment.quantity}
                  </p>
                </div>

                {selectedProject && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Start Date</label>
                      <input
                        type="date"
                        value={equipmentUsage.start_date}
                        onChange={(e) => setEquipmentUsage(prev => ({ ...prev, start_date: e.target.value }))}
                        min={selectedProject.start_date}
                        max={selectedProject.end_date}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">End Date</label>
                      <input
                        type="date"
                        value={equipmentUsage.end_date}
                        onChange={(e) => setEquipmentUsage(prev => ({ ...prev, end_date: e.target.value }))}
                        min={equipmentUsage.start_date || selectedProject.start_date}
                        max={selectedProject.end_date}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {newStatus === 'broken' && selectedEquipment && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Quantity to mark as broken</label>
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <p className="mt-1 text-sm text-gray-600">
                  Available to mark as broken: {selectedEquipment.quantity - selectedEquipment.in_use_quantity - (selectedEquipment.broken_quantity || 0)}
                </p>
              </div>
            )}

            {newStatus === 'free_to_use' && selectedEquipment && (selectedEquipment.broken_quantity || 0) > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Quantity to restore from broken</label>
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <p className="mt-1 text-sm text-gray-600">
                  Broken units available to restore: {selectedEquipment.broken_quantity}
                </p>
              </div>
            )}

            <button
              onClick={handleStatusUpdate}
              disabled={
                updateStatusMutation.isPending ||
                (newStatus === 'in_use' && (!equipmentUsage.event_id || !equipmentUsage.start_date || !equipmentUsage.end_date))
              }
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {updateStatusMutation.isPending ? 'Updating...' : 'Update Status'}
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
