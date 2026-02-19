import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Search, X } from 'lucide-react';
import { format } from 'date-fns';

interface Equipment {
  id: string;
  name: string;
  type: string;
  status: string;
  quantity: number;
  in_use_quantity: number;
}

interface CalendarEquipmentModalProps {
  eventId: string;
  date: Date;
  onClose: () => void;
}

const CalendarEquipmentModal: React.FC<CalendarEquipmentModalProps> = ({ eventId, date, onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
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

  // Fetch event details
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
    }
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
          event_id: eventId,
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
      queryClient.invalidateQueries({ queryKey: ['calendar_equipment', format(date, 'yyyy-MM-dd')] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['available_equipment'] });
      onClose();
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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full">
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">{t('event:require_equipment')}</h2>
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
            <label className="block text-sm font-medium text-gray-700">{t('event:search_equipment')}</label>
            <div className="relative mt-1">
              <input
                type="text"
                value={equipmentSearch}
                onChange={(e) => setEquipmentSearch(e.target.value)}
                className="block w-full rounded-md border-gray-300 pl-10 focus:border-gray-600 focus:ring-gray-600"
                placeholder={t('event:search_equipment_placeholder')}
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto border rounded-lg">
            {equipment.map(item => (
              <div
                key={item.id}
                onClick={() => setSelectedEquipment(item)}
                className={`p-4 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 ${
                  selectedEquipment?.id === item.id ? 'border-2 border-blue-500' : ''
                }`}
              >
                <h3 className="font-medium">{item.name}</h3>
                <div className="text-sm text-gray-600 mt-1">
                  <p>{t('event:type_label')}: {item.type}</p>
                  <p>{t('event:available')}: {item.quantity - item.in_use_quantity} {t('event:of_label')} {item.quantity}</p>
                </div>
              </div>
            ))}
            {equipment.length === 0 && (
              <div className="p-4 text-center text-gray-500">
                {t('event:no_available_equipment')}
              </div>
            )}
          </div>

          {selectedEquipment && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('event:quantity_label')}</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="1"
                  max={selectedEquipment.quantity - selectedEquipment.in_use_quantity}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
                  placeholder={t('event:enter_quantity')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('event:notes_optional')}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
                  placeholder={t('event:add_notes_equipment')}
                />
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <button
            onClick={handleSubmit}
            disabled={!selectedEquipment || parseInt(quantity) < 1 || requireEquipmentMutation.isPending}
            className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {requireEquipmentMutation.isPending ? t('event:requiring') : t('event:require_equipment')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalendarEquipmentModal;
