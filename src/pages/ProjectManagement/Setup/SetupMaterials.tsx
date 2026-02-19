import React, { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../lib/store';
import { Package, Plus, Pencil, X, Search, Trash2 } from 'lucide-react';
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
  wizardMode?: boolean;
}

const SetupMaterials: React.FC<SetupMaterialsProps> = ({ onClose, wizardMode = false }) => {
  const { t } = useTranslation(['common', 'form', 'utilities']);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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

  // Delete material mutation
  const deleteMaterialMutation = useMutation({
    mutationFn: async (material: Material) => {
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', material.id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials', debouncedSearch, companyId] });
      setShowEditModal(false);
      setShowDeleteConfirm(false);
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

  if (wizardMode) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto">
        <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
          <p>{t('form:materials_management_description')}</p>
        </div>
        
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('form:add_material_button')}
        </button>

        {/* Search Bar */}
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchInput}
            onChange={handleSearchChange}
            placeholder={t('form:search_materials_placeholder')}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 pointer-events-none" />
        </div>

        {/* Materials List */}
        <div className="space-y-2">
          {materials.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-4">{t('form:no_materials_found')}</p>
          ) : (
            materials.map((material) => (
              <div key={material.id} className="p-3 bg-gray-50 rounded border border-gray-200">
                <div className="font-medium text-gray-900">{material.name}</div>
                {material.description && <div className="text-sm text-gray-600">{material.description}</div>}
                <div className="text-xs text-gray-500 mt-1">{t('form:material_unit_price_format', { unit: material.unit, price: formatPrice(material.price) })}</div>
              </div>
            ))
          )}
        </div>

        {/* Add Material Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">{t('form:add_material_button')}</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('form:name_label')} *</label>
                <input
                  type="text"
                  value={newMaterial.name}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, name: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder={t('form:enter_material_name')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('form:unit_label')} *</label>
                <input
                  type="text"
                  value={newMaterial.unit}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, unit: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder={t('form:unit_examples')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('form:description_label')}</label>
                <textarea
                  value={newMaterial.description}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder={t('form:enter_material_description')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('form:price_optional_label')}</label>
                <input
                  type="number"
                  value={newMaterial.price}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, price: e.target.value }))}
                  step="0.01"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder={t('form:price_per_unit_placeholder')}
                />
              </div>

              <button
                onClick={handleAddMaterial}
                disabled={!newMaterial.name || !newMaterial.unit || addMaterialMutation.isPending}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {addMaterialMutation.isPending ? t('form:adding_in_progress') : t('form:add_material_button')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">{t('form:materials_heading')}</h1>
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
          {t('form:add_material_button')}
        </button>

        {/* Add Material Button - Mobile */}
        <button
          onClick={() => setShowAddModal(true)}
          className="md:hidden w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('form:add_material_button')}
        </button>

        {/* Search Bar */}
      <div className="relative">
        <input
          ref={searchInputRef}
          type="text"
          value={searchInput}
          onChange={handleSearchChange}
          placeholder={t('form:search_materials_placeholder')}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-blue-500 focus:ring-opacity-50"
        />
        <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 pointer-events-none" />
      </div>

      {/* Materials List - Desktop */}
      <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('form:table_header_name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('form:table_header_unit')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('form:price_label')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('form:table_header_actions')}</th>
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
            {t('form:no_materials_found')}
          </div>
        ) : (
          <div className="min-w-[280px] border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[minmax(100px,1fr)_38px_48px_44px] gap-2 py-2 px-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="truncate">{t('form:table_header_name')}</div>
              <div className="text-center text-xs">{t('form:table_header_unit')}</div>
              <div className="text-right text-xs">{t('form:price_label')}</div>
              <div className="w-11" />
            </div>
            {materials.map((material) => (
              <div
                key={material.id}
                className="grid grid-cols-[minmax(100px,1fr)_38px_48px_44px] gap-2 py-2.5 px-3 items-center border-b border-gray-100 last:border-0 text-sm"
              >
                <div className="min-w-0 font-medium text-gray-900 text-xs break-words" title={material.name}>
                  {material.name}
                </div>
                <div className="text-gray-600 text-xs text-center truncate">{material.unit}</div>
                <div className="text-gray-900 text-xs text-right">{formatPrice(material.price)}</div>
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
              <h3 className="text-lg font-semibold">{t('form:add_material_button')}</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('form:name_label')}</label>
                <input
                  type="text"
                  value={newMaterial.name}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, name: e.target.value }))}
                  className="mt-1"
                  placeholder={t('form:enter_material_name')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('form:description_label')}</label>
                <textarea
                  value={newMaterial.description}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="mt-1"
                  placeholder={t('form:enter_material_description')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('form:unit_label')}</label>
                <input
                  type="text"
                  value={newMaterial.unit}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, unit: e.target.value }))}
                  className="mt-1"
                  placeholder={t('form:unit_examples')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('form:price_optional_label')}</label>
                <input
                  type="number"
                  value={newMaterial.price}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, price: e.target.value }))}
                  className="mt-1"
                  placeholder={t('form:price_per_unit_placeholder')}
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
              {addMaterialMutation.isPending ? t('form:adding_in_progress') : t('form:add_material_button')}
            </button>
          </div>
        </div>
      )}

      {/* Edit Material Modal */}
      {showEditModal && selectedMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">{t('form:edit_material_heading')}</h3>
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
                <label className="block text-sm font-medium text-gray-700">{t('form:name_label')}</label>
                <input
                  type="text"
                  value={selectedMaterial.name}
                  onChange={(e) => setSelectedMaterial(prev => ({ ...prev!, name: e.target.value }))}
                  className="mt-1"
                  placeholder={t('form:enter_material_name')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('form:description_label')}</label>
                <textarea
                  value={selectedMaterial.description || ''}
                  onChange={(e) => setSelectedMaterial(prev => ({ ...prev!, description: e.target.value }))}
                  rows={3}
                  className="mt-1"
                  placeholder={t('form:enter_material_description')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('form:unit_label')}</label>
                <input
                  type="text"
                  value={selectedMaterial.unit}
                  onChange={(e) => setSelectedMaterial(prev => ({ ...prev!, unit: e.target.value }))}
                  className="mt-1"
                  placeholder={t('form:unit_examples')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('form:price_optional_label')}</label>
                <input
                  type="number"
                  value={selectedMaterial.price || ''}
                  onChange={(e) => setSelectedMaterial(prev => ({ ...prev!, price: e.target.value ? parseFloat(e.target.value) : null }))}
                  className="mt-1"
                  placeholder={t('form:price_per_unit_placeholder')}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div className="grid grid-cols-[2fr_1fr] gap-2">
              <button
                onClick={handleEdit}
                disabled={!selectedMaterial.name || !selectedMaterial.unit || editMaterialMutation.isPending}
                className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {editMaterialMutation.isPending ? t('form:saving_changes_text') : t('form:save_changes_button_text')}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="bg-red-600 text-white py-2 px-3 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
                title={t('form:delete_material_title')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Material Confirmation Modal */}
      {showDeleteConfirm && selectedMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 shadow-xl">
            <p className="text-gray-900 font-medium mb-3">
              {t('form:delete_confirmation_message')}
            </p>
            {selectedMaterial.name && (
              <p className="text-sm text-gray-600 mb-4 truncate" title={selectedMaterial.name}>
                „{selectedMaterial.name}"
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                {t('form:no_button')}
              </button>
              <button
                onClick={() => {
                  if (selectedMaterial) {
                    deleteMaterialMutation.mutate(selectedMaterial);
                  }
                }}
                disabled={deleteMaterialMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMaterialMutation.isPending ? t('form:deleting_in_progress') : t('form:yes_button')}
              </button>
            </div>
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
                <p className="text-sm text-gray-500 mt-1">{t('form:added_on_date', { date: new Date(selectedMaterial.created_at).toLocaleDateString() })}</p>
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
                  <h4 className="text-sm font-medium text-gray-700">{t('form:description_label')}</h4>
                  <p className="mt-1 text-gray-600">{selectedMaterial.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700">{t('form:unit_label')}</h4>
                  <p className="mt-1 text-gray-900">{selectedMaterial.unit}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700">{t('form:price_label')}</h4>
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
