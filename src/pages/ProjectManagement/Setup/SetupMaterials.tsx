import React, { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';
import { Package, Plus, Pencil, X, Search } from 'lucide-react';
import { useDebounce } from '../../../hooks/useDebounce';

interface Material {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  price: number | null;
  created_at: string;
}

interface SetupMaterialsProps {
  onClose: () => void;
}

const SetupMaterials: React.FC<SetupMaterialsProps> = ({ onClose }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [newMaterial, setNewMaterial] = useState({
    name: '',
    description: '',
    unit: '',
    price: ''
  });

  // Fetch materials with debounced search
  const { data: materials = [] } = useQuery({
    queryKey: ['materials', debouncedSearch, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('company_id', companyId)
        .ilike('name', `%${debouncedSearch}%`)
        .order('name');
      
      if (error) throw error;
      return data as Material[];
    },
    keepPreviousData: true, // Keep previous data while loading new data
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
    cacheTime: 1000 * 60 * 30, // Keep data in cache for 30 minutes
    enabled: !!companyId
  });

  // Add material mutation
  const addMaterialMutation = useMutation({
    mutationFn: async (material: typeof newMaterial) => {
      const { error } = await supabase
        .from('materials')
        .insert([{
          name: material.name,
          description: material.description || null,
          unit: material.unit,
          price: material.price ? parseFloat(material.price) : null,
          company_id: companyId
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials', debouncedSearch, companyId] });
      setShowAddModal(false);
      setNewMaterial({ name: '', description: '', unit: '', price: '' });
    }
  });

  // Edit material mutation
  const editMaterialMutation = useMutation({
    mutationFn: async (material: Material) => {
      const { error } = await supabase
        .from('materials')
        .update({
          name: material.name,
          description: material.description,
          unit: material.unit,
          price: material.price
        })
        .eq('id', material.id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials', debouncedSearch, companyId] });
      setShowEditModal(false);
      setSelectedMaterial(null);
    }
  });

  // Memoize the search handler to prevent unnecessary re-renders
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  }, []);

  const handleSubmit = () => {
    if (!newMaterial.name || !newMaterial.unit) return;
    addMaterialMutation.mutate(newMaterial);
  };

  const handleEdit = () => {
    if (!selectedMaterial?.name || !selectedMaterial?.unit) return;
    editMaterialMutation.mutate(selectedMaterial);
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return '-';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(price);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Materials</h1>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
        <button
          onClick={() => setShowAddModal(true)}
          className="md:inline-flex hidden items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Material
        </button>

        {/* Add Material Button - Mobile */}
        <button
          onClick={() => setShowAddModal(true)}
          className="md:hidden w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Material
        </button>

        {/* Search Bar */}
      <div className="relative">
        <input
          ref={searchInputRef}
          type="text"
          value={searchInput}
          onChange={handleSearchChange}
          placeholder="Search materials..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-blue-500 focus:ring-opacity-50"
        />
        <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 pointer-events-none" />
      </div>

      {/* Materials List - Desktop */}
      <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {materials.map((material) => (
              <tr key={material.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => {
                      setSelectedMaterial(material);
                      setShowDetailsModal(true);
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {material.name}
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{material.unit}</td>
                <td className="px-6 py-4 whitespace-nowrap">{formatPrice(material.price)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <button
                    onClick={() => {
                      setSelectedMaterial(material);
                      setShowEditModal(true);
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Pencil className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Materials List - Mobile: tabelka name / unit / price / edit */}
      <div className="md:hidden overflow-x-auto -mx-2 px-2">
        {materials.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No materials found.
          </div>
        ) : (
          <div className="min-w-[280px] border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_60px_56px_44px] gap-2 py-2 px-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="truncate">Name</div>
              <div>Unit</div>
              <div className="text-right">Price</div>
              <div className="w-11" />
            </div>
            {materials.map((material) => (
              <div
                key={material.id}
                className="grid grid-cols-[minmax(0,1fr)_60px_56px_44px] gap-2 py-2.5 px-3 items-center border-b border-gray-100 last:border-0 text-sm"
              >
                <div className="min-w-0 truncate font-medium text-gray-900" title={material.name}>
                  {material.name}
                </div>
                <div className="text-gray-600 truncate">{material.unit}</div>
                <div className="text-gray-900 text-right">{formatPrice(material.price)}</div>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedMaterial(material);
                      setShowEditModal(true);
                    }}
                    className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors touch-manipulation"
                    aria-label="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Material Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Add New Material</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={newMaterial.name}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, name: e.target.value }))}
                  className="mt-1"
                  placeholder="Enter material name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={newMaterial.description}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="mt-1"
                  placeholder="Enter material description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Unit</label>
                <input
                  type="text"
                  value={newMaterial.unit}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, unit: e.target.value }))}
                  className="mt-1"
                  placeholder="e.g., pieces, meters, kg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Price (Optional)</label>
                <input
                  type="number"
                  value={newMaterial.price}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, price: e.target.value }))}
                  className="mt-1"
                  placeholder="Enter price per unit"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!newMaterial.name || !newMaterial.unit || addMaterialMutation.isPending}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {addMaterialMutation.isPending ? 'Adding...' : 'Add Material'}
            </button>
          </div>
        </div>
      )}

      {/* Edit Material Modal */}
      {showEditModal && selectedMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Edit Material</h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedMaterial(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={selectedMaterial.name}
                  onChange={(e) => setSelectedMaterial(prev => ({ ...prev!, name: e.target.value }))}
                  className="mt-1"
                  placeholder="Enter material name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={selectedMaterial.description || ''}
                  onChange={(e) => setSelectedMaterial(prev => ({ ...prev!, description: e.target.value }))}
                  rows={3}
                  className="mt-1"
                  placeholder="Enter material description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Unit</label>
                <input
                  type="text"
                  value={selectedMaterial.unit}
                  onChange={(e) => setSelectedMaterial(prev => ({ ...prev!, unit: e.target.value }))}
                  className="mt-1"
                  placeholder="e.g., pieces, meters, kg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Price (Optional)</label>
                <input
                  type="number"
                  value={selectedMaterial.price || ''}
                  onChange={(e) => setSelectedMaterial(prev => ({ ...prev!, price: e.target.value ? parseFloat(e.target.value) : null }))}
                  className="mt-1"
                  placeholder="Enter price per unit"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <button
              onClick={handleEdit}
              disabled={!selectedMaterial.name || !selectedMaterial.unit || editMaterialMutation.isPending}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {editMaterialMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Material Details Modal */}
      {showDetailsModal && selectedMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{selectedMaterial.name}</h3>
                <p className="text-sm text-gray-500 mt-1">Added on {new Date(selectedMaterial.created_at).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedMaterial(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {selectedMaterial.description && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Description</h4>
                  <p className="mt-1 text-gray-600">{selectedMaterial.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Unit</h4>
                  <p className="mt-1 text-gray-900">{selectedMaterial.unit}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Price</h4>
                  <p className="mt-1 text-gray-900">{formatPrice(selectedMaterial.price)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default SetupMaterials;
