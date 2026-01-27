import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';
import { Truck, X, Search, Info, Trash2, Settings, Save } from 'lucide-react';
import MachineryTaskCreator from './MachineryTaskCreator';

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

const SetupDigging: React.FC<SetupDiggingProps> = ({ onClose, wizardMode = false }) => {
  const queryClient = useQueryClient();
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [newEquipment, setNewEquipment] = useState({ 
    name: '', 
    description: '', 
    type: 'excavator' as 'excavator' | 'barrows_dumpers', 
    quantity: 1,
    "size (in tones)": excavatorSizes[0].value
  });
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [editEquipment, setEditEquipment] = useState<DiggingEquipment | null>(null);
  const [showTaskCreator, setShowTaskCreator] = useState<boolean>(false);

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
    mutationFn: async (equipment: Omit<DiggingEquipment, 'id' | 'created_at' | 'updated_at' | 'status' | 'in_use_quantity'> & { "size (in tones)": number }) => {
      // Convert size (in tones) to number or null
      const sizeInTones = equipment["size (in tones)"];
      
      console.log('Adding equipment to setup_digging:', {
        name: equipment.name,
        description: equipment.description,
        type: equipment.type,
        quantity: equipment.quantity,
        "size (in tones)": sizeInTones
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
        // Don't throw here, as we've already added to setup_digging
      } else {
        console.log('Successfully added to equipment');
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup_digging'] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setNewEquipment({ 
        name: '', 
        description: '', 
        type: 'excavator', 
        quantity: 1, 
        "size (in tones)": excavatorSizes[0].value 
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
          "size (in tones)": equipment["size (in tones)"]
          // Don't update status, in_use_quantity as they're managed elsewhere
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

  // Get type display name
  const getTypeDisplayName = (type: DiggingEquipment['type']) => {
    switch (type) {
      case 'excavator':
        return 'Excavator';
      case 'barrows_dumpers':
        return 'Barrows/Dumpers';
      default:
        return type;
    }
  };

  // Format size for display
  const formatSize = (size: number | null) => {
    if (size === null) return '-';
    return `${size} tonnes`;
  };

  // Get size options based on equipment type
  const getSizeOptions = (type: 'excavator' | 'barrows_dumpers') => {
    return type === 'excavator' ? excavatorSizes : dumperBarrowSizes;
  };

  // Handle type change to update size options
  const handleTypeChange = (type: 'excavator' | 'barrows_dumpers') => {
    setNewEquipment({
      ...newEquipment,
      type,
      "size (in tones)": type === 'excavator' ? excavatorSizes[0].value : dumperBarrowSizes[0].value
    });
  };

  const contentMarkup = (
    <>
          <div className="bg-gray-100 p-3 rounded-lg mb-3 text-sm">
            <p className="text-red-600">
              Equipment Name and Description will be shown in Equipment. Create here ONLY Excavators and Carriers (wheel barrow, petrol barrows and dumpers) and make sure u click create tasks button on the top after adding any equipment
            </p>
          </div>
          
          {/* Add Equipment Form */}
          <form onSubmit={handleAddEquipment} className="mb-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Name</label>
              <input
                type="text"
                placeholder="Enter equipment name"
                value={newEquipment.name}
                onChange={(e) => setNewEquipment({...newEquipment, name: e.target.value})}
                className="w-full p-2 border rounded text-sm"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
              <textarea
                placeholder="Enter equipment description"
                value={newEquipment.description}
                onChange={(e) => setNewEquipment({...newEquipment, description: e.target.value})}
                className="w-full p-2 border rounded text-sm"
                rows={2}
              />
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={newEquipment.type}
                  onChange={(e) => handleTypeChange(e.target.value as 'excavator' | 'barrows_dumpers')}
                  className="w-full p-2 border rounded text-sm"
                >
                  <option value="excavator">Excavator</option>
                  <option value="barrows_dumpers">Barrows/Dumpers</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Quantity available"
                  value={newEquipment.quantity}
                  onChange={(e) => setNewEquipment({...newEquipment, quantity: parseInt(e.target.value) || 1})}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Size (in tonnes)</label>
                <select
                  value={newEquipment["size (in tones)"]}
                  onChange={(e) => setNewEquipment({...newEquipment, "size (in tones)": parseFloat(e.target.value)})}
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
            
            <button
              type="submit"
              className="w-full bg-gray-700 text-white p-2 rounded hover:bg-gray-800 text-sm"
            >
              Add Equipment
            </button>
          </form>
          
          {/* Search Equipment */}
          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Search equipment..."
              value={equipmentSearch}
              onChange={(e) => setEquipmentSearch(e.target.value)}
              className="w-full p-2 pl-8 border rounded text-sm"
            />
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          </div>
          
          {/* Equipment List */}
          <div className="h-64 overflow-y-auto border rounded">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                          <option value="excavator">Excavator</option>
                          <option value="barrows_dumpers">Barrows/Dumpers</option>
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
                          <span>{item.quantity} total</span>
                          {item.in_use_quantity > 0 && (
                            <span className="text-xs text-gray-500 ml-2">({item.in_use_quantity} in use)</span>
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
                    <td className="px-3 py-2 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(item.status)}`}>
                        {item.status.replace(/_/g, ' ')}
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
              <p className="text-center text-gray-500 py-4 text-sm">No equipment found</p>
            )}
          </div>

        {showTaskCreator && (
          <MachineryTaskCreator onClose={() => setShowTaskCreator(false)} />
        )}
    </>
  );

  if (wizardMode) {
    return (
      <div className="p-6 overflow-y-auto h-full">
        <div className="bg-gray-100 p-3 rounded-lg mb-3 text-sm">
          <p className="text-red-600">
            Equipment Name and Description will be shown in Equipment. Create here ONLY Excavators and Carriers (wheel barrow, petrol barrows and dumpers) and make sure u click create tasks button on the top after adding any equipment
          </p>
        </div>
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
            <h2 className="text-lg font-semibold">Excavators & Barrows/Dumpers</h2>
          </div>
          <div className="flex items-center">
            <button 
              onClick={() => setShowTaskCreator(true)}
              className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 mr-4 text-sm font-medium"
            >
              Create Tasks
            </button>
            <button 
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-200 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
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
