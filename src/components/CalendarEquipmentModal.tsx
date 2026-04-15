import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { colors, fonts, fontSizes, fontWeights, radii, transitions, accentAlpha } from '../themes/designTokens';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Search, Truck, Plus, Check } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  CalendarRequirementModalShell,
  CalendarRequirementModalFooterActions,
} from './CalendarRequirementModalShell';

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

const inputBase: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: colors.bgInput,
  border: `1px solid ${colors.borderDefault}`,
  borderRadius: radii.lg,
  color: colors.textPrimary,
  fontSize: fontSizes.md,
  fontFamily: fonts.body,
  outline: 'none',
  transition: transitions.normal,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: fontSizes.sm,
  fontWeight: fontWeights.semibold,
  color: colors.textSecondary,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const CalendarEquipmentModal: React.FC<CalendarEquipmentModalProps> = ({ eventId, date, onClose }) => {
  const { t, i18n } = useTranslation(['common', 'form', 'utilities', 'event', 'calculator']);
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const companyId = useAuthStore((state) => state.getCompanyId());
  const { data: equipment = [] } = useQuery({
    queryKey: ['available_equipment', equipmentSearch, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('company_id', companyId!)
        .ilike('name', `%${equipmentSearch}%`)
        .eq('status', 'free_to_use')
        .order('name');

      if (error) throw error;
      return data as Equipment[];
    },
    enabled: !!companyId,
  });

  const requireEquipmentMutation = useMutation({
    mutationFn: async ({
      equipment_id,
      quantity: q,
      notes: n,
    }: {
      equipment_id: string;
      quantity: number;
      notes?: string;
    }) => {
      const formattedDate = format(date, 'yyyy-MM-dd');

      const { error: equipmentError } = await supabase
        .from('equipment')
        .update({
          status: 'in_use',
          in_use_quantity: selectedEquipment!.in_use_quantity + parseInt(String(q), 10),
        })
        .eq('id', equipment_id);

      if (equipmentError) throw equipmentError;

      const { error } = await supabase.from('calendar_equipment').insert({
        event_id: eventId || null,
        equipment_id,
        user_id: user?.id,
        date: formattedDate,
        quantity: parseInt(String(q), 10),
        notes: n || null,
        company_id: companyId,
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
    },
  });

  const handleSubmit = () => {
    if (!selectedEquipment) return;

    const quantityNum = parseInt(quantity, 10);
    if (Number.isNaN(quantityNum) || quantityNum < 1) return;

    const availableQuantity = selectedEquipment.quantity - selectedEquipment.in_use_quantity;
    if (quantityNum > availableQuantity) {
      alert(t('calculator:only_units_available', { count: availableQuantity }));
      return;
    }

    requireEquipmentMutation.mutate({
      equipment_id: selectedEquipment.id,
      quantity: quantityNum,
      notes,
    });
  };

  useEffect(() => {
    if (!selectedEquipment && searchRef.current) searchRef.current.focus();
  }, [selectedEquipment]);

  const subtitle = `${t('event:modal_date_prefix')} ${format(date, 'd MMMM yyyy', { locale: dateLocale })}`;

  const canSubmit =
    !!selectedEquipment &&
    parseInt(quantity, 10) >= 1 &&
    !Number.isNaN(parseInt(quantity, 10)) &&
    !requireEquipmentMutation.isPending;

  return (
    <CalendarRequirementModalShell
      title={t('event:require_equipment')}
      subtitle={subtitle}
      icon={<Truck size={18} strokeWidth={1.5} />}
      onClose={onClose}
      footer={
        <CalendarRequirementModalFooterActions
          onClose={onClose}
          closeLabel={t('common:close')}
          primaryLabel={requireEquipmentMutation.isPending ? t('event:requiring') : t('event:require_equipment')}
          primaryIcon={<Plus size={16} strokeWidth={2.5} />}
          onPrimary={handleSubmit}
          primaryDisabled={!canSubmit}
        />
      }
    >
      {!selectedEquipment ? (
        <>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <div
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: colors.textMuted,
              }}
            >
              <Search size={18} strokeWidth={2} />
            </div>
            <input
              ref={searchRef}
              type="text"
              value={equipmentSearch}
              onChange={(e) => setEquipmentSearch(e.target.value)}
              style={{
                ...inputBase,
                paddingLeft: 44,
              }}
              placeholder={t('event:search_equipment_placeholder')}
            />
          </div>

          <div
            style={{
              maxHeight: 240,
              overflowY: 'auto',
              borderRadius: radii.lg,
              border: `1px solid ${colors.borderDefault}`,
              background: colors.bgDeep,
            }}
          >
            {equipment.map((item) => {
              const available = item.quantity - item.in_use_quantity;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedEquipment(item)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: `1px solid ${colors.borderDefault}33`,
                    cursor: 'pointer',
                    fontFamily: fonts.body,
                    textAlign: 'left',
                    transition: transitions.normal,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = colors.bgHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: fontSizes.md,
                        fontWeight: fontWeights.semibold,
                        color: colors.textPrimary,
                        marginBottom: 2,
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: fontSizes.sm,
                        color: colors.textSecondary,
                        lineHeight: 1.35,
                      }}
                    >
                      {t('event:type_label')}: {item.type}
                    </div>
                    <div style={{ fontSize: fontSizes.sm, color: colors.textMuted, marginTop: 2 }}>
                      {t('event:available')}: {available} {t('event:of_label')} {item.quantity}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: fontSizes.sm,
                      color: colors.textMuted,
                      background: colors.bgCardInner,
                      padding: '3px 10px',
                      borderRadius: 20,
                      border: `1px solid ${colors.borderDefault}`,
                      flexShrink: 0,
                      marginLeft: 12,
                      fontWeight: fontWeights.semibold,
                      letterSpacing: '0.3px',
                    }}
                  >
                    {available}
                  </span>
                </button>
              );
            })}
            {equipment.length === 0 && (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: colors.textMuted,
                  fontSize: fontSizes.md,
                }}
              >
                {t('event:no_available_equipment')}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: accentAlpha(0.12),
              borderRadius: radii.lg,
              border: `1px solid ${accentAlpha(0.22)}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <Check size={16} strokeWidth={2.5} style={{ color: colors.green }} />
              <span
                style={{
                  color: colors.textPrimary,
                  fontWeight: fontWeights.semibold,
                  fontSize: fontSizes.md,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedEquipment.name}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedEquipment(null);
                setQuantity('1');
                setNotes('');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: colors.textMuted,
                cursor: 'pointer',
                fontSize: fontSizes.sm,
                fontFamily: fonts.body,
                padding: '4px 8px',
                borderRadius: radii.md,
                flexShrink: 0,
                transition: transitions.normal,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = colors.textPrimary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = colors.textMuted;
              }}
            >
              {t('event:change_selection')}
            </button>
          </div>

          <div>
            <label style={labelStyle}>{t('event:quantity_label')}</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min={1}
              max={selectedEquipment.quantity - selectedEquipment.in_use_quantity}
              style={inputBase}
              placeholder={t('event:enter_quantity')}
            />
          </div>

          <div>
            <label style={labelStyle}>{t('event:notes_optional')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{
                ...inputBase,
                minHeight: 56,
                resize: 'vertical',
              }}
              placeholder={t('event:add_notes_equipment')}
            />
          </div>
        </div>
      )}
    </CalendarRequirementModalShell>
  );
};

export default CalendarEquipmentModal;
