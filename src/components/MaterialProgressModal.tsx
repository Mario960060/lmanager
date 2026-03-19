import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { colors } from '../themes/designTokens';
import { translateMaterialName, translateMaterialDescription, translateUnit } from '../lib/translationMap';
import Modal from './Modal';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';
import { useAuthStore } from '../lib/store';
import { X } from 'lucide-react';

type MaterialDelivered = Database['public']['Tables']['materials_delivered']['Row'];

interface MaterialProgressModalProps {
  material: MaterialDelivered | null;
  onClose: () => void;
}

const MaterialProgressModal: React.FC<MaterialProgressModalProps> = ({ material, onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event', 'material', 'units']);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [deliveredAmount, setDeliveredAmount] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch existing deliveries
  const { data: deliveries = [] } = useQuery({
    queryKey: ['material_deliveries', material?.id],
    queryFn: async () => {
      if (!material?.id) return [];
      const { data, error } = await supabase
        .from('material_deliveries')
        .select('amount, delivery_date, notes')
        .eq('material_id', material.id)
        .order('delivery_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!material?.id
  });

  // Calculate total delivered amount
  const totalDelivered = deliveries.reduce((sum, delivery) => sum + (delivery.amount || 0), 0);
  const remaining = material ? material.total_amount - totalDelivered : 0;

  const addDeliveryMutation = useMutation({
    mutationFn: async ({ materialId, amount, notes }: { materialId: string; amount: number; notes: string }) => {
      if (!user?.id || !material?.event_id) throw new Error('Missing required data');
      
      const { error } = await supabase
        .from('material_deliveries')
        .insert({
          material_id: materialId,
          event_id: material.event_id,
          user_id: user.id,
          amount,
          notes: notes.trim() || null,
          delivery_date: new Date().toISOString()
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material_deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setDeliveredAmount('');
      setNotes('');
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!material?.id || !deliveredAmount) return;
    
    const amount = parseFloat(deliveredAmount);
    if (isNaN(amount) || amount <= 0) return;

    addDeliveryMutation.mutate({
      materialId: material.id,
      amount,
      notes
    });
  };

  if (!material) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="rounded-lg max-w-2xl w-full" style={{ backgroundColor: colors.bgCard }}>
        <div className="flex justify-between items-center p-6 border-b" style={{ borderColor: colors.borderDefault }}>
          <h2 className="text-xl font-semibold" style={{ color: colors.textPrimary }}>{t('event:update_material_progress')}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors"
          >
            <X className="w-5 h-5" style={{ color: colors.textSubtle }} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-4 rounded-lg" style={{ backgroundColor: colors.bgElevated }}>
            <h3 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>{translateMaterialName(material.name, t) || t('event:unknown_material')}</h3>
            {translateMaterialDescription(material.name, (material as { description?: string | null }).description, t) && (
              <p className="text-sm mt-1" style={{ color: colors.textSubtle }}>{translateMaterialDescription(material.name, (material as { description?: string | null }).description, t)}</p>
            )}
            <p className="text-sm" style={{ color: colors.textSubtle }}>{t('event:unit_label')}: {material.unit}</p>
          </div>

          <div>
            <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('event:delivered_amount')}</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <input
                type="number"
                value={deliveredAmount}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setDeliveredAmount('');
                    return;
                  }
                  const parsed = parseFloat(value);
                  if (!isNaN(parsed) && parsed >= 0) {
                    setDeliveredAmount(value);
                  }
                }}
                min="0"
                step="0.01"
                className="block w-full rounded-md pr-12"
                style={{ backgroundColor: colors.bgElevated, borderColor: colors.borderDefault, color: colors.textPrimary }}
                placeholder={t('event:enter_amount_delivered')}
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="sm:text-sm" style={{ color: colors.textSubtle }}>{translateUnit(material.unit, t)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium" style={{ color: colors.textMuted }}>{t('event:notes_optional')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md shadow-sm"
              style={{ backgroundColor: colors.bgElevated, borderColor: colors.borderDefault, color: colors.textPrimary }}
              placeholder={t('event:add_notes_delivery')}
            />
          </div>

          <div className="p-4 rounded-lg space-y-2" style={{ backgroundColor: colors.bgElevated }}>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: colors.textMuted }}>{t('event:total_required')}:</span>
              <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>{parseFloat(material.total_amount.toFixed(2))} {material.unit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: colors.textMuted }}>{t('event:currently_delivered')}:</span>
              <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>{parseFloat(totalDelivered.toFixed(2))} {translateUnit(material.unit, t)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: colors.textMuted }}>{t('event:remaining')}:</span>
              <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>{parseFloat(remaining.toFixed(2))} {material.unit}</span>
            </div>
            <div className="mt-2">
              <div className="w-full rounded-full h-2" style={{ backgroundColor: colors.bgElevated }}>
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((totalDelivered / material.total_amount) * 100, 100).toFixed(2)}%` }}
                />
              </div>
            </div>
          </div>

          {deliveries.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2" style={{ color: colors.textPrimary }}>{t('event:previous_deliveries')}</h4>
              <div className="space-y-2">
                {deliveries.map((delivery, index) => (
                  <div key={index} className="text-sm p-2 rounded" style={{ color: colors.textMuted, backgroundColor: colors.bgElevated }}>
                    <div className="flex justify-between">
                      <span>{delivery.amount} {translateUnit(material.unit, t)}</span>
                      <span>{new Date(delivery.delivery_date).toLocaleDateString()}</span>
                    </div>
                    {delivery.notes && (
                      <p className="text-xs mt-1" style={{ color: colors.textSubtle }}>{delivery.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t flex justify-end space-x-4" style={{ borderColor: colors.borderDefault, backgroundColor: colors.bgCard }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg transition-colors"
            style={{ backgroundColor: colors.bgCard, borderColor: colors.borderDefault, color: colors.textMuted }}
          >
            {t('common:cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              addDeliveryMutation.isPending || 
              !deliveredAmount || 
              parseFloat(deliveredAmount) <= 0
            }
            className="px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
          >
            {addDeliveryMutation.isPending ? t('event:updating') : t('event:record_delivery')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaterialProgressModal;
