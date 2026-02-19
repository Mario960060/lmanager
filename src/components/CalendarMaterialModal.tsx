import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Search, X } from 'lucide-react';
import { format } from 'date-fns';
import UnspecifiedCalendarMaterialModal from './UnspecifiedCalendarMaterialModal';

interface Material {
  id: string;
  name: string;
  description?: string;
  unit: string;
}

interface CalendarMaterialModalProps {
  eventId: string;
  date: Date;
  onClose: () => void;
}

const CalendarMaterialModal: React.FC<CalendarMaterialModalProps> = ({ eventId, date, onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [notes, setNotes] = useState('');
  const [showUnspecifiedModal, setShowUnspecifiedModal] = useState(false);

  // Fetch material templates
  const { data: materials = [] } = useQuery({
    queryKey: ['materials', materialSearch, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('company_id', companyId)
        .ilike('name', `%${materialSearch}%`);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch event details for UnspecifiedMaterialModal
  const { data: event } = useQuery({
    queryKey: ['event', eventId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title')
        .eq('id', eventId)
        .eq('company_id', companyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!eventId
  });

  const addMaterialMutation = useMutation({
    mutationFn: async ({ material, quantity, unit, notes }: { 
      material: string; 
      quantity: number; 
      unit: string;
      notes?: string;
    }) => {
      const formattedDate = format(date, 'yyyy-MM-dd');

      const { error } = await supabase
        .from('calendar_materials')
        .insert({
          event_id: eventId,
          user_id: user?.id,
          material,
          quantity,
          unit,
          date: formattedDate,
          company_id: companyId,
          notes: notes || null
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar_materials', format(date, 'yyyy-MM-dd'), companyId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_calendar_materials', companyId] });
      onClose();
    }
  });

  const handleSubmit = () => {
    if (!selectedMaterial) return;
    
    // For custom materials, check if name is provided
    if (selectedMaterial.id === 'custom' && !selectedMaterial.name.trim()) {
      return;
    }

    if (!quantity || !unit) return;
    
    addMaterialMutation.mutate({
      material: selectedMaterial.name,
      quantity: parseFloat(quantity),
      unit,
      notes
    });
  };

  const handleUnspecifiedMaterialSave = (materialData: {
    name: string;
    total_amount: number;
    unit: string;
    notes: string;
    event_id: string;
  }) => {
    addMaterialMutation.mutate({
      material: materialData.name,
      quantity: materialData.total_amount,
      unit: materialData.unit,
      notes: materialData.notes
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full">
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">{t('event:add_material_needed')}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {t('event:for_label')}: {format(date, 'MMMM d, yyyy')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('event:search_materials')}</label>
            <div className="relative mt-1">
              <input
                type="text"
                value={materialSearch}
                onChange={(e) => setMaterialSearch(e.target.value)}
                className="block w-full rounded-md border-gray-300 pl-10 focus:border-gray-600 focus:ring-gray-600"
                placeholder={t('event:search_materials_placeholder')}
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto border rounded-lg">
            {/* Add Unspecified Material Option */}
            <div
              onClick={() => setShowUnspecifiedModal(true)}
              className="p-4 hover:bg-gray-50 cursor-pointer border-b"
            >
              <h3 className="font-medium text-blue-600">+ {t('event:other_custom_item')}</h3>
              <p className="text-sm text-gray-600 mt-1">{t('event:add_custom_item_details')}</p>
            </div>

            <div
              onClick={() => {
                setSelectedMaterial({ id: 'custom', name: '', unit: '', description: '' });
                setUnit('');
              }}
              className={`p-4 hover:bg-gray-50 cursor-pointer border-b ${
                selectedMaterial?.id === 'custom' ? 'border-2 border-blue-500' : ''
              }`}
            >
              <h3 className="font-medium">{t('event:other_custom_material')}</h3>
              <p className="text-sm text-gray-600 mt-1">{t('event:add_custom_material_not_list')}</p>
            </div>

            {materials.map(material => (
              <div
                key={material.id}
                onClick={() => {
                  setSelectedMaterial(material);
                  setUnit(material.unit);
                }}
                className={`p-4 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 ${
                  selectedMaterial?.id === material.id ? 'border-2 border-blue-500' : ''
                }`}
              >
                <h3 className="font-medium">{material.name}</h3>
                {material.description && (
                  <p className="text-sm text-gray-600 mt-1">{material.description}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">{t('event:unit_label')}: {material.unit}</p>
              </div>
            ))}
          </div>

          {selectedMaterial && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('event:material_name')}</label>
                  <input
                    type="text"
                    value={selectedMaterial.id === 'custom' ? selectedMaterial.name : selectedMaterial.name}
                    onChange={(e) => {
                      if (selectedMaterial.id === 'custom') {
                        setSelectedMaterial(prev => ({
                          ...prev!,
                          id: 'custom',
                          name: e.target.value,
                          unit: prev?.unit || ''
                        } as Material));
                      }
                    }}
                    readOnly={selectedMaterial.id !== 'custom'}
                    className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600 ${
                      selectedMaterial.id !== 'custom' ? 'bg-gray-50' : ''
                    }`}
                    placeholder={selectedMaterial.id === 'custom' ? t('event:enter_material_name') : ''}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('event:quantity_label')}</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min="0.01"
                    step="0.01"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
                    placeholder={t('event:enter_quantity')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('event:unit_label')}</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  readOnly={selectedMaterial.id !== 'custom'}
                  className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600 ${
                    selectedMaterial.id !== 'custom' ? 'bg-gray-50' : ''
                  }`}
                  placeholder={selectedMaterial.id === 'custom' ? t('event:enter_unit_eg') : ''}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('event:notes_optional')}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
                  placeholder={t('event:add_notes_material')}
                />
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <button
            onClick={handleSubmit}
            disabled={!selectedMaterial || !quantity || !unit || (selectedMaterial.id === 'custom' && !selectedMaterial.name.trim()) || addMaterialMutation.isPending}
            className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {addMaterialMutation.isPending ? t('event:adding') : t('event:add_material')}
          </button>
        </div>
      </div>

      {showUnspecifiedModal && event && (
        <UnspecifiedCalendarMaterialModal
          onClose={() => setShowUnspecifiedModal(false)}
          onSave={handleUnspecifiedMaterialSave}
          projects={[{ id: event.id, title: event.title }]}
        />
      )}
    </div>
  );
};

export default CalendarMaterialModal;
