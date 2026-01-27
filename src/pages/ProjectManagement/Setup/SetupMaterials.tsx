import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';
import { Package, X, Search, Info, Trash2, Settings, Save } from 'lucide-react';

interface Material {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  price: number | null;
  created_at?: string;
}

interface SetupMaterialsProps {
  onClose: () => void;
}

const SetupMaterials: React.FC<SetupMaterialsProps> = ({ onClose }) => {
  const queryClient = useQueryClient();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [materialSearch, setMaterialSearch] = useState('');
  const [showMaterialInfo, setShowMaterialInfo] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ 
    name: '', 
    description: '', 
    unit: '', 
    price: '' // Using string for input, will convert to number or null when submitting
  });
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editMaterial, setEditMaterial] = useState<Material | null>(null);

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

  // Add material mutation
  const addMaterialMutation = useMutation({
    mutationFn: async (material: Omit<Material, 'id' | 'created_at'>) => {
      // Convert price to number or null
      const price = material.price !== '' ? parseFloat(material.price as string) : null;
      
      const { data, error } = await supabase
        .from('materials')
        .insert([{
          name: material.name,
          description: material.description || null,
          unit: material.unit,
          price: price,
          company_id: companyId
        }])
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials', companyId] });
      setNewMaterial({ name: '', description: '', unit: '', price: '' });
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

  // Edit material mutation
  const editMaterialMutation = useMutation({
    mutationFn: async (material: Material) => {
      // Convert price to number or null
      const price = material.price !== '' ? parseFloat(material.price as unknown as string) : null;
      
      const { data, error } = await supabase
        .from('materials')
        .update({
          name: material.name,
          description: material.description,
          unit: material.unit,
          price: price
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

  // Filter materials
  const filteredMaterials = materials.filter(material => 
    material.name.toLowerCase().includes(materialSearch.toLowerCase())
  );

  // Handle adding materials
  const handleAddMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMaterial.name && newMaterial.unit) {
      addMaterialMutation.mutate(newMaterial);
    }
  };

  // Handle editing materials
  const handleEditMaterial = (material: Material) => {
    // Convert null price to empty string for the input
    const materialForEdit = {
      ...material,
      price: material.price !== null ? material.price : ''
    };
    setEditMaterial(materialForEdit);
    setEditingMaterialId(material.id);
  };

  // Handle saving material edits
  const handleSaveEdit = () => {
    if (editMaterial) {
      editMaterialMutation.mutate(editMaterial);
    }
  };

  // Format price for display
  const formatPrice = (price: number | null) => {
    if (price === null) return 'N/A';
    return `£${price.toFixed(2)}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <div className="flex items-center">
            <Package className="w-5 h-5 text-gray-700 mr-2" />
            <h2 className="text-lg font-semibold">Materials</h2>
          </div>
          <div className="flex items-center">
            <button 
              onClick={() => setShowMaterialInfo(!showMaterialInfo)}
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
          {showMaterialInfo && (
            <div className="bg-gray-100 p-3 rounded-lg mb-3 text-sm">
              <p className="text-gray-700">
                Here is the list of standard materials. As we know that you may use some different things than everyone else, so here you can edit them.
              </p>
            </div>
          )}
          
          {/* Add Material Form */}
          <form onSubmit={handleAddMaterial} className="mb-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Material Name</label>
              <input
                type="text"
                placeholder="Enter material name"
                value={newMaterial.name}
                onChange={(e) => setNewMaterial({...newMaterial, name: e.target.value})}
                className="w-full p-2 border rounded text-sm"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
              <textarea
                placeholder="Enter material description"
                value={newMaterial.description}
                onChange={(e) => setNewMaterial({...newMaterial, description: e.target.value})}
                className="w-full p-2 border rounded text-sm"
                rows={2}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <input
                  type="text"
                  placeholder="Unit (kg, m, etc.)"
                  value={newMaterial.unit}
                  onChange={(e) => setNewMaterial({...newMaterial, unit: e.target.value})}
                  className="w-full p-2 border rounded text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price (Optional)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Price per unit"
                  value={newMaterial.price}
                  onChange={(e) => setNewMaterial({...newMaterial, price: e.target.value})}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
            </div>
            
            <button
              type="submit"
              className="w-full bg-gray-700 text-white p-2 rounded hover:bg-gray-800 text-sm"
            >
              Add Material
            </button>
          </form>
          
          {/* Search Materials */}
          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Search materials..."
              value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)}
              className="w-full p-2 pl-8 border rounded text-sm"
            />
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          </div>
          
          {/* Materials List */}
          <div className="h-64 overflow-y-auto border rounded">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMaterials.map(material => (
                  <tr key={material.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                      {editingMaterialId === material.id ? (
                        <input
                          type="text"
                          value={editMaterial?.name || ''}
                          onChange={(e) => setEditMaterial({...editMaterial!, name: e.target.value})}
                          className="w-full p-1 border rounded text-sm"
                        />
                      ) : (
                        material.name
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {editingMaterialId === material.id ? (
                        <input
                          type="text"
                          value={editMaterial?.description || ''}
                          onChange={(e) => setEditMaterial({...editMaterial!, description: e.target.value})}
                          className="w-full p-1 border rounded text-sm"
                        />
                      ) : (
                        material.description || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {editingMaterialId === material.id ? (
                        <input
                          type="text"
                          value={editMaterial?.unit || ''}
                          onChange={(e) => setEditMaterial({...editMaterial!, unit: e.target.value})}
                          className="w-full p-1 border rounded text-sm"
                        />
                      ) : (
                        material.unit
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {editingMaterialId === material.id ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editMaterial?.price || ''}
                          onChange={(e) => setEditMaterial({...editMaterial!, price: e.target.value ? parseFloat(e.target.value) : ''})}
                          className="w-full p-1 border rounded text-sm"
                        />
                      ) : (
                        formatPrice(material.price)
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                      {editingMaterialId === material.id ? (
                        <button
                          onClick={handleSaveEdit}
                          className="text-green-500 hover:text-green-700 mr-2"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEditMaterial(material)}
                          className="text-green-500 hover:text-green-700 mr-2"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteMaterialMutation.mutate(material.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredMaterials.length === 0 && (
              <p className="text-center text-gray-500 py-4 text-sm">No materials found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupMaterials;
