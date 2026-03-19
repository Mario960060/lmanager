import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { colors } from '../themes/designTokens';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface Equipment {
  id: string;
  name: string;
  type: string;
  status: string;
  quantity: number;
  in_use_quantity: number;
}

interface CalendarEquipmentModalProps {
  eventId: string | null;
  date: Date;
  onClose: () => void;
}

const CalendarEquipmentModal: React.FC<CalendarEquipmentModalProps> = ({ eventId, date, onClose }) => {
  const { t, i18n } = useTranslation(['common', 'form', 'utilities', 'event', 'calculator']);
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');

  // Fetch available equipment
  const companyId = useAuthStore(state => state.getCompanyId());
  const { data: equipment = [] } = useQuery({
    queryKey: ['available_equipment', equipmentSearch, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('company_id', companyId)
        .ilike('name', `%${equipmentSearch}%`)
        .eq('status', 'free_to_use')
        .order('name');
      
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch event details (only when eventId is provided)
  const { data: event } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title')
        .eq('id', eventId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId
  });

  const requireEquipmentMutation = useMutation({
    mutationFn: async ({ equipment_id, quantity, notes }: {
      equipment_id: string;
      quantity: number;
      notes?: string;
    }) => {
      const formattedDate = format(date, 'yyyy-MM-dd');

      // First update the equipment status and in_use_quantity
      const { error: equipmentError } = await supabase
        .from('equipment')
        .update({
          status: 'in_use',
          in_use_quantity: selectedEquipment!.in_use_quantity + parseInt(quantity)
        })
        .eq('id', equipment_id);

      if (equipmentError) throw equipmentError;

      // Then create the calendar_equipment record
      const { error } = await supabase
        .from('calendar_equipment')
        .insert({
          event_id: eventId || null,
          equipment_id,
          user_id: user?.id,
          date: formattedDate,
          quantity: parseInt(quantity),
          notes: notes || null,
          company_id: companyId
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar_equipment'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_calendar_equipment'] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['available_equipment'] });
      onClose();
    },
    onError: (error) => {
      console.error('Failed to add calendar equipment:', error);
      alert(t('project:failed_add_equipment'));
    }
  });

  const handleSubmit = () => {
    if (!selectedEquipment) return;
    
    const quantityNum = parseInt(quantity);
    if (isNaN(quantityNum) || quantityNum < 1) return;
    
    // Check if requested quantity is available
    const availableQuantity = selectedEquipment.quantity - selectedEquipment.in_use_quantity;
    if (quantityNum > availableQuantity) {
      alert(t('calculator:only_units_available', { count: availableQuantity }));
      return;
    }

    requireEquipmentMutation.mutate({
      equipment_id: selectedEquipment.id,
      quantity: quantityNum,
      notes
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[1100] flex items-center justify-center p-4">
      <div className="rounded-lg max-w-2xl w-full" style={{ backgroundColor: colors.bgCard }}>
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">{t('event:require_equipment')}</h2>
            <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
              {t('event:for_label')}: {format(date, 'MMMM d, yyyy', { locale: dateLocale })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:search_equipment')}</label>
            <div className="relative mt-1">
              <input
                type="text"
                value={equipmentSearch}
                onChange={(e) => setEquipmentSearch(e.target.value)}
                className="block w-full rounded-md pl-10"
                style={{ borderColor: colors.borderInput }}
                placeholder={t('event:search_equipment_placeholder')}
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5" style={{ color: colors.textSubtle }} />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto border rounded-lg">
            {equipment.map(item => (
              <div
                key={item.id}
                onClick={() => setSelectedEquipment(item)}
                className="p-4 cursor-pointer border-b last:border-b-0"
                style={{
                  backgroundColor: 'transparent',
                  ...(selectedEquipment?.id === item.id ? { borderWidth: 2, borderColor: colors.accentBlue } : {})
                }}
              >
                <h3 className="font-medium">{item.name}</h3>
                <div className="text-sm mt-1" style={{ color: colors.textMuted }}>
                  <p>{t('event:type_label')}: {item.type}</p>
                  <p>{t('event:available')}: {item.quantity - item.in_use_quantity} {t('event:of_label')} {item.quantity}</p>
                </div>
              </div>
            ))}
            {equipment.length === 0 && (
              <div className="p-4 text-center" style={{ color: colors.textSubtle }}>
                {t('event:no_available_equipment')}
              </div>
            )}
          </div>

          {selectedEquipment && (
            <>
              <div>
                <label className="block text-sm font-medium" style={{ color: colors.textSecondary }}>{t('event:quantity_label')}</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="1"
                  max={selectedEquipment.quantity - selectedEquipment.in_use_quantity}
                  className="mt-1 block w-full rounded-md shadow-sm"
                  style={{ borderColor: colors.borderDefault }}
                  placeholder={t('event:enter_quantity')}
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
                  placeholder={t('event:add_notes_equipment')}
                />
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t" style={{ backgroundColor: colors.bgSubtle }}>
          <button
            onClick={handleSubmit}
            disabled={!selectedEquipment || parseInt(quantity) < 1 || requireEquipmentMutation.isPending}
            className="w-full py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: colors.bgElevated, color: colors.textOnAccent }}
          >
            {requireEquipmentMutation.isPending ? t('event:requiring') : t('event:require_equipment')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalendarEquipmentModal;
