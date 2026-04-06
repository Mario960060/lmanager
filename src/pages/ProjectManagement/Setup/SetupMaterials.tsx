import React, { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { colors } from '../../../themes/designTokens';
import { translateMaterialName, translateMaterialDescription, translateUnit } from '../../../lib/translationMap';
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
  is_deletable?: boolean;
  created_at: string;
}

interface SetupMaterialsProps {
  onClose: () => void;
  wizardMode?: boolean;
}

const SetupMaterials: React.FC<SetupMaterialsProps> = ({ onClose, wizardMode = false }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'material', 'units']);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  // Add material mutation (user-created materials are deletable)
  const addMaterialMutation = useMutation({
    mutationFn: async (material: typeof newMaterial) => {
      const { error } = await supabase
        .from('materials')
        .insert([{
          name: material.name,
          description: material.description || null,
          unit: material.unit,
          price: material.price ? parseFloat(material.price) : null,
          is_deletable: true,
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

  // Edit material mutation (system materials: only price can be updated)
  const editMaterialMutation = useMutation({
    mutationFn: async (material: Material) => {
      const isSystem = material.is_deletable === false;
      const updatePayload = isSystem
        ? { price: material.price }
        : {
            name: material.name,
            description: material.description,
            unit: material.unit,
            price: material.price
          };
      const { error } = await supabase
        .from('materials')
        .update(updatePayload)
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

  // Delete material mutation (system materials cannot be deleted)
  const deleteMaterialMutation = useMutation({
    mutationFn: async (material: Material) => {
      if (material.is_deletable === false) {
        throw new Error(t('form:system_material_cannot_delete'));
      }
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
      setDeleteError(null);
    },
    onError: (error: Error) => {
      setDeleteError(error.message);
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
        <div className="text-sm p-3 rounded-lg border" style={{ backgroundColor: colors.red, color: colors.textOnAccent, borderColor: colors.redLight }}>
          <p>{t('form:materials_management_description')}</p>
        </div>
        
        <button
          onClick={() => setShowAddModal(true)}
            className="w-full py-2 px-4 rounded-lg flex items-center justify-center gap-2"
            style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
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
            className="w-full pl-10 pr-4 py-2 rounded-lg border"
            style={{ borderColor: colors.borderDefault }}
          />
          <Search className="absolute left-3 top-2.5 h-5 w-5 pointer-events-none" style={{ color: colors.textSubtle }} />
        </div>

        {/* Materials List */}
        <div className="space-y-2">
          {materials.length === 0 ? (
            <p className="text-center text-sm py-4" style={{ color: colors.textSubtle }}>{t('form:no_materials_found')}</p>
          ) : (
            materials.map((material) => (
              <div key={material.id} className="p-3 rounded border" style={{ backgroundColor: colors.bgSubtle, borderColor: colors.borderLight }}>
                <div className="font-medium" style={{ color: colors.textPrimary }}>{material.name}</div>
                {material.description && <div className="text-sm" style={{ color: colors.textMuted }}>{material.description}</div>}
                <div className="text-xs mt-1" style={{ color: colors.textSubtle }}>{t('form:material_unit_price_format', { unit: material.unit, price: formatPrice(material.price) })}</div>
              </div>
            ))
          )}
        </div>

        {/* Add Material Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-0 md:p-4">
            <div className="rounded-lg max-w-md w-full px-3 py-3 md:p-6 space-y-4" style={{ backgroundColor: colors.bgCard }}>
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">{t('form:add_material_button')}</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-2 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:name_label')} *</label>
                <input
                  type="text"
                  value={newMaterial.name}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, name: e.target.value }))}
                  className="mt-1 block w-full rounded-md shadow-sm"
                  style={{ borderColor: colors.borderDefault }}
                  placeholder={t('form:enter_material_name')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:unit_label')} *</label>
                <input
                  type="text"
                  value={newMaterial.unit}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, unit: e.target.value }))}
                  className="mt-1 block w-full rounded-md shadow-sm"
                  style={{ borderColor: colors.borderDefault }}
                  placeholder={t('form:unit_examples')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:description_label')}</label>
                <textarea
                  value={newMaterial.description}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className="mt-1 block w-full rounded-md shadow-sm"
                  style={{ borderColor: colors.borderDefault }}
                  placeholder={t('form:enter_material_description')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:price_optional_label')}</label>
                <input
                  type="number"
                  value={newMaterial.price}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, price: e.target.value }))}
                  step="0.01"
                  className="mt-1 block w-full rounded-md shadow-sm"
                  style={{ borderColor: colors.borderDefault }}
                  placeholder={t('form:price_per_unit_placeholder')}
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={!newMaterial.name || !newMaterial.unit || addMaterialMutation.isPending}
                className="w-full py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-0 md:p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-3 py-3 md:p-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold" style={{ color: colors.textPrimary }}>{t('form:materials_heading')}</h1>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors"
            style={{ backgroundColor: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.bgHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-3 py-3 md:p-6 space-y-6">
        <button
          onClick={() => setShowAddModal(true)}
          className="md:inline-flex hidden items-center px-4 py-2 rounded-lg transition-colors"
          style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('form:add_material_button')}
        </button>

        {/* Add Material Button - Mobile */}
        <button
          onClick={() => setShowAddModal(true)}
          className="md:hidden w-full flex items-center justify-center px-4 py-2 rounded-lg transition-colors"
          style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
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
          className="w-full pl-10 pr-4 py-2 rounded-lg border"
          style={{ borderColor: colors.borderDefault }}
        />
        <Search className="absolute left-3 top-2.5 h-5 w-5 pointer-events-none" style={{ color: colors.textSubtle }} />
      </div>

      {/* Materials List - Desktop */}
      <div className="hidden md:block rounded-lg shadow overflow-hidden" style={{ backgroundColor: colors.bgCard }}>
        <table className="min-w-full divide-y" style={{ borderColor: colors.borderDefault }}>
          <thead style={{ backgroundColor: colors.bgSubtle }}>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: colors.textSubtle }}>{t('form:table_header_name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: colors.textSubtle }}>{t('form:table_header_unit')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: colors.textSubtle }}>{t('form:price_label')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: colors.textSubtle }}>{t('form:table_header_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: colors.borderDefault }}>
            {materials.map((material, index) => (
              <tr key={material.id} style={{ background: index % 2 === 1 ? colors.bgTableRowAlt : undefined }}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => {
                      setSelectedMaterial(material);
                      setShowDetailsModal(true);
                    }}
                    style={{ color: colors.accentBlue }}
                  >
                    {material.name}
                    {material.is_deletable === false && <span className="ml-1 text-xs" style={{ color: colors.amber }} title={t('form:system_material_price_only_hint')}>🔒</span>}
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{translateUnit(material.unit, t)}</td>
                <td className="px-6 py-4 whitespace-nowrap">{formatPrice(material.price)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <button
                    onClick={() => {
                      setSelectedMaterial(material);
                      setShowEditModal(true);
                    }}
                    className="p-2 transition-colors"
                    style={{ color: colors.green }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = colors.greenLight; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = colors.green; }}
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
          <div className="text-center py-8" style={{ color: colors.textSubtle }}>
            {t('form:no_materials_found')}
          </div>
        ) : (
          <div className="min-w-[280px] border rounded-lg overflow-hidden" style={{ borderColor: colors.borderDefault }}>
            <div className="grid grid-cols-[minmax(100px,1fr)_38px_48px_44px] gap-2 py-2 px-3 border-b text-xs font-medium uppercase tracking-wider" style={{ backgroundColor: colors.bgSubtle, borderColor: colors.borderLight, color: colors.textSubtle }}>
              <div className="truncate">{t('form:table_header_name')}</div>
              <div className="text-center text-xs">{t('form:table_header_unit')}</div>
              <div className="text-right text-xs">{t('form:price_label')}</div>
              <div className="w-11" />
            </div>
            {materials.map((material) => (
              <div
                key={material.id}
                className="grid grid-cols-[minmax(100px,1fr)_38px_48px_44px] gap-2 py-2.5 px-3 items-center border-b last:border-0 text-sm"
                style={{ borderColor: colors.borderLight }}
              >
                <div className="min-w-0 font-medium text-xs break-words" style={{ color: colors.textPrimary }} title={material.name}>
                  {material.name}
                  {material.is_deletable === false && <span className="ml-0.5 text-amber-600">🔒</span>}
                </div>
                <div className="text-xs text-center truncate" style={{ color: colors.textMuted }}>{material.unit}</div>
                <div className="text-xs text-right" style={{ color: colors.textPrimary }}>{formatPrice(material.price)}</div>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedMaterial(material);
                      setShowEditModal(true);
                    }}
                    className="p-2 transition-colors touch-manipulation"
                    style={{ color: colors.green }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = colors.greenLight; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = colors.green; }}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-0 md:p-4">
          <div className="rounded-lg max-w-sm w-full px-3 py-3 md:p-4 space-y-3" style={{ backgroundColor: colors.bgCard }}>
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
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:description_label')}</label>
                <textarea
                  value={newMaterial.description}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="mt-1"
                  placeholder={t('form:enter_material_description')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:unit_label')}</label>
                <input
                  type="text"
                  value={newMaterial.unit}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, unit: e.target.value }))}
                  className="mt-1"
                  placeholder={t('form:unit_examples')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:price_optional_label')}</label>
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

      {/* Edit Material Modal (system materials: only price editable) */}
      {showEditModal && selectedMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-0 md:p-4">
          <div className="rounded-lg max-w-sm w-full px-3 py-3 md:p-4 space-y-3" style={{ backgroundColor: colors.bgCard }}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                {selectedMaterial.is_deletable === false ? t('form:edit_material_price_heading') : t('form:edit_material_heading')}
              </h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedMaterial(null);
                  setDeleteError(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedMaterial.is_deletable === false && (
              <p className="text-sm text-white bg-red-600 p-2 rounded">{t('form:system_material_price_only_hint')}</p>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:name_label')}</label>
                <input
                  type="text"
                  value={selectedMaterial.name}
                  onChange={(e) => setSelectedMaterial(prev => ({ ...prev!, name: e.target.value }))}
                  className="mt-1"
                  placeholder={t('form:enter_material_name')}
                  disabled={selectedMaterial.is_deletable === false}
                  readOnly={selectedMaterial.is_deletable === false}
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:description_label')}</label>
                <textarea
                  value={selectedMaterial.description || ''}
                  onChange={(e) => setSelectedMaterial(prev => ({ ...prev!, description: e.target.value }))}
                  rows={3}
                  className="mt-1"
                  placeholder={t('form:enter_material_description')}
                  disabled={selectedMaterial.is_deletable === false}
                  readOnly={selectedMaterial.is_deletable === false}
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:unit_label')}</label>
                <input
                  type="text"
                  value={selectedMaterial.unit}
                  onChange={(e) => setSelectedMaterial(prev => ({ ...prev!, unit: e.target.value }))}
                  className="mt-1"
                  placeholder={t('form:unit_examples')}
                  disabled={selectedMaterial.is_deletable === false}
                  readOnly={selectedMaterial.is_deletable === false}
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:price_optional_label')}</label>
                <input
                  type="number"
                  value={selectedMaterial.price ?? ''}
                  onChange={(e) => setSelectedMaterial(prev => ({ ...prev!, price: e.target.value ? parseFloat(e.target.value) : null }))}
                  className="mt-1"
                  placeholder={t('form:price_per_unit_placeholder')}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleEdit}
                disabled={
                  (selectedMaterial.is_deletable !== false && (!selectedMaterial.name || !selectedMaterial.unit)) ||
                  editMaterialMutation.isPending
                }
                className="flex-1 py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
              >
                {editMaterialMutation.isPending ? t('form:saving_changes_text') : t('form:save_changes_button_text')}
              </button>
              {selectedMaterial.is_deletable !== false && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="bg-red-600 text-white py-2 px-3 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
                  title={t('form:delete_material_title')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Material Confirmation Modal */}
      {showDeleteConfirm && selectedMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-0 md:p-4">
          <div className="rounded-lg max-w-sm w-full px-3 py-3 md:p-4 shadow-xl" style={{ backgroundColor: colors.bgCard }}>
            {deleteError && (
              <p className="text-sm mb-3" style={{ color: colors.red }}>{deleteError}</p>
            )}
            <p className="font-medium mb-3" style={{ color: colors.textPrimary }}>
              {t('form:delete_confirmation_message')}
            </p>
            {selectedMaterial.name && (
              <p className="text-sm mb-4 truncate" style={{ color: colors.textMuted }} title={selectedMaterial.name}>
                „{selectedMaterial.name}"
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
                className="px-4 py-2 border rounded-lg"
                style={{ borderColor: colors.borderDefault, color: colors.textSecondary }}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-0 md:p-4">
          <div className="rounded-lg max-w-sm w-full px-3 py-3 md:p-4" style={{ backgroundColor: colors.bgCard }}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold" style={{ color: colors.textPrimary }}>{translateMaterialName(selectedMaterial.name, t)}</h3>
                <p className="text-sm mt-1" style={{ color: colors.textSubtle }}>{t('form:added_on_date', { date: new Date(selectedMaterial.created_at).toLocaleDateString() })}</p>
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
              {translateMaterialDescription(selectedMaterial.name, selectedMaterial.description, t) && (
                <div>
                  <h4 className="text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:description_label')}</h4>
                  <p className="mt-1" style={{ color: colors.textMuted }}>{translateMaterialDescription(selectedMaterial.name, selectedMaterial.description, t)}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:unit_label')}</h4>
                  <p className="mt-1" style={{ color: colors.textPrimary }}>{translateUnit(selectedMaterial.unit, t)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium" style={{ color: colors.textSecondary }}>{t('form:price_label')}</h4>
                  <p className="mt-1" style={{ color: colors.textPrimary }}>{formatPrice(selectedMaterial.price)}</p>
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
