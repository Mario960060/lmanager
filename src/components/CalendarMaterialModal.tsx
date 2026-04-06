import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { colors } from '../themes/designTokens';
import { translateMaterialName, translateMaterialDescription, translateUnit } from '../lib/translationMap';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import UnspecifiedCalendarMaterialModal from './UnspecifiedCalendarMaterialModal';

interface Material {
  id: string;
  name: string;
  description?: string;
  unit: string;
}

interface CalendarMaterialModalProps {
  eventId: string | null;
  date: Date;
  onClose: () => void;
}

const CalendarMaterialModal: React.FC<CalendarMaterialModalProps> = ({ eventId, date, onClose }) => {
  const { t, i18n } = useTranslation(['common', 'form', 'utilities', 'event', 'project']);
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
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

  const hasEvent = !!eventId;

  const addMaterialMutation = useMutation({
    mutationFn: async ({ material, quantity, unit, notes, event_id: overrideEventId }: { 
      material: string; 
      quantity: number; 
      unit: string;
      notes?: string;
      event_id?: string | null;
    }) => {
      const formattedDate = format(date, 'yyyy-MM-dd');
      const finalEventId = overrideEventId !== undefined ? overrideEventId : eventId;

      const { error } = await supabase
        .from('calendar_materials')
        .insert({
          event_id: finalEventId || null,
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
      // Use broad keys - DayDetailsModal uses Date object in key, Dashboard uses different key structure
      queryClient.invalidateQueries({ queryKey: ['calendar_materials'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_calendar_materials'] });
      onClose();
    },
    onError: (error) => {
      console.error('Failed to add calendar material:', error);
      alert(t('project:failed_add_material'));
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
      notes: materialData.notes,
      event_id: materialData.event_id || null
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[1100] flex items-center justify-center p-0 md:p-4">
      <div className="rounded-lg max-w-2xl w-full" style={{ backgroundColor: colors.bgCard }}>
        <div className="flex justify-between items-center p-6 border-b" style={{ borderColor: colors.borderDefault }}>
          <div>
            <h2 className="text-xl font-semibold">{t('event:add_material_needed')}</h2>
            <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
              {t('event:for_label')}: {format(date, 'MMMM d, yyyy', { locale: dateLocale })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors hover:opacity-80"
          >
            <X className="w-5 h-5" style={{ color: colors.textSubtle }} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:search_materials')}</label>
            <div className="relative mt-1">
              <input
                type="text"
                value={materialSearch}
                onChange={(e) => setMaterialSearch(e.target.value)}
                className="block w-full rounded-md pl-10"
                style={{ borderColor: colors.borderDefault }}
                placeholder={t('event:search_materials_placeholder')}
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5" style={{ color: colors.textSubtle }} />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto rounded-lg" style={{ border: `1px solid ${colors.borderDefault}` }}>
            {/* Add Unspecified Material Option - only when event is selected */}
            {hasEvent && (
              <div
                onClick={() => setShowUnspecifiedModal(true)}
                className="p-4 cursor-pointer border-b"
                style={{ backgroundColor: 'transparent' }}
              >
                <h3 className="font-medium" style={{ color: colors.accentBlue }}>+ {t('event:other_custom_item')}</h3>
                <p className="text-sm mt-1" style={{ color: colors.textMuted }}>{t('event:add_custom_item_details')}</p>
              </div>
            )}

            <div
              onClick={() => {
                setSelectedMaterial({ id: 'custom', name: '', unit: '', description: '' });
                setUnit('');
              }}
              className="p-4 cursor-pointer border-b"
              style={{
                backgroundColor: 'transparent',
                ...(selectedMaterial?.id === 'custom' ? { borderWidth: 2, borderColor: colors.accentBlue } : {})
              }}
            >
              <h3 className="font-medium">{t('event:other_custom_material')}</h3>
              <p className="text-sm mt-1" style={{ color: colors.textMuted }}>{t('event:add_custom_material_not_list')}</p>
            </div>

            {materials.map(material => (
              <div
                key={material.id}
                onClick={() => {
                  setSelectedMaterial(material);
                  setUnit(material.unit);
                }}
                className="p-4 cursor-pointer border-b last:border-b-0"
                style={{
                  backgroundColor: 'transparent',
                  ...(selectedMaterial?.id === material.id ? { borderWidth: 2, borderColor: colors.accentBlue } : {})
                }}
              >
                <h3 className="font-medium">{translateMaterialName(material.name, t)}</h3>
                {translateMaterialDescription(material.name, material.description, t) && (
                  <p className="text-sm mt-1" style={{ color: colors.textMuted }}>{translateMaterialDescription(material.name, material.description, t)}</p>
                )}
                <p className="text-xs mt-1" style={{ color: colors.textSubtle }}>{t('event:unit_label')}: {translateUnit(material.unit, t)}</p>
              </div>
            ))}
          </div>

          {selectedMaterial && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:material_name')}</label>
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
                    className="mt-1 block w-full rounded-md shadow-sm"
                    style={{
                      borderColor: colors.borderDefault,
                      ...(selectedMaterial.id !== 'custom' ? { backgroundColor: colors.bgSubtle } : {})
                    }}
                    placeholder={selectedMaterial.id === 'custom' ? t('event:enter_material_name') : ''}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:quantity_label')}</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min="0.01"
                    step="0.01"
                    className="mt-1 block w-full rounded-md shadow-sm"
                    style={{ borderColor: colors.borderDefault }}
                    placeholder={t('event:enter_quantity')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:unit_label')}</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  readOnly={selectedMaterial.id !== 'custom'}
                  className="mt-1 block w-full rounded-md shadow-sm"
                  style={{
                    borderColor: colors.borderDefault,
                    ...(selectedMaterial.id !== 'custom' ? { backgroundColor: colors.bgSubtle } : {})
                  }}
                  placeholder={selectedMaterial.id === 'custom' ? t('event:enter_unit_eg') : ''}
                />
              </div>

              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:notes_optional')}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md shadow-sm"
                  style={{ borderColor: colors.borderDefault }}
                  placeholder={t('event:add_notes_material')}
                />
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t" style={{ backgroundColor: colors.bgSubtle }}>
          <button
            onClick={handleSubmit}
            disabled={!selectedMaterial || !quantity || !unit || (selectedMaterial.id === 'custom' && !selectedMaterial.name.trim()) || addMaterialMutation.isPending}
            className="w-full py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: colors.bgElevated, color: colors.textOnAccent }}
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
