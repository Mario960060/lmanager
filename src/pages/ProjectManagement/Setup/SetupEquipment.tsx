import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';
import { Wrench, X, Search, Info, Trash2, Settings, Save } from 'lucide-react';

interface Equipment {
  id: string;
  name: string;
  description: string | null;
  status: 'free_to_use' | 'in_use' | 'broken';
  created_at?: string;
  updated_at?: string;
  type: 'machine' | 'tool';
  quantity: number;
  in_use_quantity: number;
}

interface SetupEquipmentProps {
  onClose: () => void;
}

const SetupEquipment: React.FC<SetupEquipmentProps> = ({ onClose }) => {
  const queryClient = useQueryClient();
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [showEquipmentInfo, setShowEquipmentInfo] = useState(false);
  const [newEquipment, setNewEquipment] = useState({ 
    name: '', 
    description: '', 
    type: 'tool' as 'machine' | 'tool', 
    quantity: 1 
  });
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [editEquipment, setEditEquipment] = useState<Equipment | null>(null);

  // Fetch equipment
  const companyId = useAuthStore(state => state.getCompanyId());
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

  // Add equipment mutation
  const addEquipmentMutation = useMutation({
    mutationFn: async (equipment: Omit<Equipment, 'id' | 'created_at' | 'updated_at' | 'status' | 'in_use_quantity'>) => {
      const { data, error } = await supabase
        .from('equipment')
        .insert([{
          name: equipment.name,
          description: equipment.description || null,
          type: equipment.type,
          quantity: equipment.quantity,
          status: 'free_to_use',
          in_use_quantity: 0,
          company_id: companyId
        }])
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setNewEquipment({ name: '', description: '', type: 'tool', quantity: 1 });
    }
  });

  // Delete equipment mutation
  const deleteEquipmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    }
  });

  // Edit equipment mutation
  const editEquipmentMutation = useMutation({
    mutationFn: async (equipment: Equipment) => {
      const { data, error } = await supabase
        .from('equipment')
        .update({
          name: equipment.name,
          description: equipment.description,
          type: equipment.type,
          quantity: equipment.quantity
          // Don't update status, in_use_quantity as they're managed elsewhere
        })
        .eq('id', equipment.id)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
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
  const handleEditEquipment = (equipment: Equipment) => {
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
  const getStatusColor = (status: Equipment['status']) => {
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <div className="flex items-center">
            <Wrench className="w-5 h-5 text-gray-700 mr-2" />
            <h2 className="text-lg font-semibold">Equipment</h2>
          </div>
          <div className="flex items-center">
            <button 
              onClick={() => setShowEquipmentInfo(!showEquipmentInfo)}
              className="text-gray-500 hover:text-gray-700 mr-4"
            >
              <Info className="w-4 h-4" />
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
          {showEquipmentInfo && (
            <div className="bg-gray-100 p-3 rounded-lg mb-3 text-sm">
              <p className="text-gray-700">
                Here is the list of standard tools and machines. Everyone got their loved ones! Edit them here or add the quantity so you always know if they are available or on which job you got them!
              </p>
            </div>
          )}
          
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
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={newEquipment.type}
                  onChange={(e) => setNewEquipment({...newEquipment, type: e.target.value as 'machine' | 'tool'})}
                  className="w-full p-2 border rounded text-sm"
                >
                  <option value="tool">Tool</option>
                  <option value="machine">Machine</option>
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
                          value={editEquipment?.type || 'tool'}
                          onChange={(e) => setEditEquipment({...editEquipment!, type: e.target.value as 'machine' | 'tool'})}
                          className="w-full p-1 border rounded text-sm"
                        >
                          <option value="tool">Tool</option>
                          <option value="machine">Machine</option>
                        </select>
                      ) : (
                        <span className="capitalize">{item.type}</span>
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
        </div>
      </div>
    </div>
  );
};

export default SetupEquipment;
