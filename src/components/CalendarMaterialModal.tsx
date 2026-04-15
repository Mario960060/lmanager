import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { colors, fonts, fontSizes, fontWeights, radii, spacing, transitions, accentAlpha } from '../themes/designTokens';
import { translateMaterialName, translateMaterialDescription, translateUnit } from '../lib/translationMap';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Search, Package, Plus, Check } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import UnspecifiedCalendarMaterialModal from './UnspecifiedCalendarMaterialModal';
import {
  CalendarRequirementModalShell,
  CalendarRequirementModalFooterActions,
} from './CalendarRequirementModalShell';

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

const CalendarMaterialModal: React.FC<CalendarMaterialModalProps> = ({ eventId, date, onClose }) => {
  const { t, i18n } = useTranslation(['common', 'form', 'utilities', 'event', 'project']);
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = useAuthStore((state) => state.getCompanyId());
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [notes, setNotes] = useState('');
  const [showUnspecifiedModal, setShowUnspecifiedModal] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: materials = [] } = useQuery({
    queryKey: ['materials', materialSearch, companyId],
    queryFn: async () => {
      let q = supabase.from('materials').select('*').eq('company_id', companyId!);
      if (materialSearch.trim()) {
        const s = materialSearch.trim();
        q = q.or(`name.ilike.%${s}%,description.ilike.%${s}%`);
      }
      const { data, error } = await q.order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: event } = useQuery({
    queryKey: ['event', eventId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title')
        .eq('id', eventId!)
        .eq('company_id', companyId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!eventId,
  });

  const hasEvent = !!eventId;

  const addMaterialMutation = useMutation({
    mutationFn: async ({
      material,
      quantity: q,
      unit: u,
      notes: n,
      event_id: overrideEventId,
    }: {
      material: string;
      quantity: number;
      unit: string;
      notes?: string;
      event_id?: string | null;
    }) => {
      const formattedDate = format(date, 'yyyy-MM-dd');
      const finalEventId = overrideEventId !== undefined ? overrideEventId : eventId;

      const { error } = await supabase.from('calendar_materials').insert({
        event_id: finalEventId || null,
        user_id: user?.id,
        material,
        quantity: q,
        unit: u,
        date: formattedDate,
        company_id: companyId,
        notes: n || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar_materials'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_calendar_materials'] });
      onClose();
    },
    onError: (error) => {
      console.error('Failed to add calendar material:', error);
      alert(t('project:failed_add_material'));
    },
  });

  const handleSubmit = () => {
    if (!selectedMaterial) return;
    if (selectedMaterial.id === 'custom' && !selectedMaterial.name.trim()) return;
    if (!quantity || !unit) return;

    addMaterialMutation.mutate({
      material: selectedMaterial.name,
      quantity: parseFloat(quantity),
      unit,
      notes,
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
      event_id: materialData.event_id || null,
    });
  };

  useEffect(() => {
    if (!selectedMaterial && searchRef.current) searchRef.current.focus();
  }, [selectedMaterial]);

  const subtitle = `${t('event:modal_date_prefix')} ${format(date, 'd MMMM yyyy', { locale: dateLocale })}`;

  const canSubmit =
    !!selectedMaterial &&
    !!quantity &&
    !!unit &&
    !(selectedMaterial.id === 'custom' && !selectedMaterial.name.trim()) &&
    !addMaterialMutation.isPending;

  return (
    <>
      <CalendarRequirementModalShell
        title={t('event:add_material_needed')}
        subtitle={subtitle}
        icon={<Package size={18} strokeWidth={1.5} />}
        onClose={onClose}
        footer={
          <CalendarRequirementModalFooterActions
            onClose={onClose}
            closeLabel={t('common:close')}
            primaryLabel={
              addMaterialMutation.isPending ? t('event:requiring_material') : t('event:add_material')
            }
            primaryIcon={<Plus size={16} strokeWidth={2.5} />}
            onPrimary={handleSubmit}
            primaryDisabled={!canSubmit}
          />
        }
      >
        {!selectedMaterial ? (
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
                value={materialSearch}
                onChange={(e) => setMaterialSearch(e.target.value)}
                placeholder={t('event:search_materials_placeholder')}
                style={{
                  ...inputBase,
                  paddingLeft: 44,
                }}
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
              {hasEvent && (
                <button
                  type="button"
                  onClick={() => setShowUnspecifiedModal(true)}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: 'transparent',
                    border: 'none',
                    borderBottom: `1px solid ${colors.borderDefault}`,
                    color: colors.accentBlue,
                    cursor: 'pointer',
                    fontFamily: fonts.body,
                    fontSize: fontSizes.md,
                    fontWeight: fontWeights.semibold,
                    textAlign: 'left',
                    transition: transitions.normal,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = accentAlpha(0.12);
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: radii.md,
                      background: accentAlpha(0.12),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Plus size={16} strokeWidth={2.5} color={colors.accentBlue} />
                  </div>
                  <div>
                    <div>+ {t('event:other_custom_item')}</div>
                    <div
                      style={{
                        fontSize: fontSizes.sm,
                        color: colors.textMuted,
                        fontWeight: fontWeights.normal,
                        marginTop: 2,
                      }}
                    >
                      {t('event:add_custom_item_details')}
                    </div>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelectedMaterial({ id: 'custom', name: '', unit: '', description: '' });
                  setUnit('');
                }}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${colors.borderDefault}`,
                  color: colors.accentBlue,
                  cursor: 'pointer',
                  fontFamily: fonts.body,
                  fontSize: fontSizes.md,
                  fontWeight: fontWeights.semibold,
                  textAlign: 'left',
                  transition: transitions.normal,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = accentAlpha(0.12);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: radii.md,
                    background: accentAlpha(0.12),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Plus size={16} strokeWidth={2.5} color={colors.accentBlue} />
                </div>
                <div>
                  <div>{t('event:other_custom_material')}</div>
                  <div
                    style={{
                      fontSize: fontSizes.sm,
                      color: colors.textMuted,
                      fontWeight: fontWeights.normal,
                      marginTop: 2,
                    }}
                  >
                    {t('event:add_custom_material_not_list')}
                  </div>
                </div>
              </button>

              {materials.map((material) => (
                <button
                  key={material.id}
                  type="button"
                  onClick={() => {
                    setSelectedMaterial(material);
                    setUnit(material.unit);
                  }}
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
                      {translateMaterialName(material.name, t)}
                    </div>
                    {translateMaterialDescription(material.name, material.description, t) && (
                      <div
                        style={{
                          fontSize: fontSizes.sm,
                          color: colors.textSecondary,
                          lineHeight: 1.35,
                        }}
                      >
                        {translateMaterialDescription(material.name, material.description, t)}
                      </div>
                    )}
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
                    {translateUnit(material.unit, t)}
                  </span>
                </button>
              ))}

              {materials.length === 0 && materialSearch.trim() && (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    color: colors.textMuted,
                    fontSize: fontSizes.md,
                  }}
                >
                  {t('event:no_materials_match')}
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
                  {selectedMaterial.id === 'custom' && !selectedMaterial.name
                    ? t('event:other_custom_material')
                    : translateMaterialName(selectedMaterial.name, t)}
                </span>
                {!!unit && (
                  <span
                    style={{
                      fontSize: fontSizes.sm,
                      color: colors.accentBlue,
                      background: colors.bgCardInner,
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontWeight: fontWeights.semibold,
                      flexShrink: 0,
                    }}
                  >
                    {translateUnit(unit, t)}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedMaterial(null);
                  setQuantity('');
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>{t('event:material_name')}</label>
                <input
                  type="text"
                  value={selectedMaterial.id === 'custom' ? selectedMaterial.name : selectedMaterial.name}
                  onChange={(e) => {
                    if (selectedMaterial.id === 'custom') {
                      setSelectedMaterial((prev) =>
                        prev ? { ...prev, id: 'custom', name: e.target.value, unit: prev.unit || '' } : prev
                      );
                    }
                  }}
                  readOnly={selectedMaterial.id !== 'custom'}
                  style={{
                    ...inputBase,
                    ...(selectedMaterial.id !== 'custom' ? { background: colors.bgSubtle } : {}),
                  }}
                  placeholder={selectedMaterial.id === 'custom' ? t('event:enter_material_name') : ''}
                />
              </div>
              <div>
                <label style={labelStyle}>{t('event:quantity_label')}</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="0.01"
                  step="0.01"
                  style={inputBase}
                  placeholder={t('event:enter_quantity')}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>{t('event:unit_label')}</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                readOnly={selectedMaterial.id !== 'custom'}
                style={{
                  ...inputBase,
                  ...(selectedMaterial.id !== 'custom' ? { background: colors.bgSubtle } : {}),
                }}
                placeholder={selectedMaterial.id === 'custom' ? t('event:enter_unit_eg') : ''}
              />
            </div>

            <div>
              <label style={labelStyle}>
                {t('event:notes_optional')}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                style={{
                  ...inputBase,
                  minHeight: 56,
                  resize: 'vertical',
                }}
                placeholder={t('event:add_notes_material')}
              />
            </div>
          </div>
        )}
      </CalendarRequirementModalShell>

      {showUnspecifiedModal && event && (
        <UnspecifiedCalendarMaterialModal
          onClose={() => setShowUnspecifiedModal(false)}
          onSave={handleUnspecifiedMaterialSave}
          projects={[{ id: event.id, title: event.title }]}
        />
      )}
    </>
  );
};

export default CalendarMaterialModal;
