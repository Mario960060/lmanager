import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { colors, fonts, fontSizes, fontWeights, radii, transitions, accentAlpha } from '../themes/designTokens';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Search, Hammer, Plus, Check } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { translateUnit } from '../lib/translationMap';
import { toolDisplayName, toolMatchesSearch } from '../lib/toolDisplay';
import {
  CalendarRequirementModalShell,
  CalendarRequirementModalFooterActions,
} from './CalendarRequirementModalShell';

type ToolRow = {
  id: string;
  name_en: string;
  name_pl: string;
  unit: string;
};

interface CalendarToolsModalProps {
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

const CalendarToolsModal: React.FC<CalendarToolsModalProps> = ({ eventId, date, onClose }) => {
  const { t, i18n } = useTranslation(['common', 'form', 'utilities', 'event', 'calculator']);
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = useAuthStore((s) => s.getCompanyId());
  const [toolSearch, setToolSearch] = useState('');
  const [selectedTool, setSelectedTool] = useState<ToolRow | null>(null);
  const [quantity, setQuantity] = useState('1');
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: tools = [] } = useQuery({
    queryKey: ['company_tools', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tools')
        .select('id, name_en, name_pl, unit')
        .eq('company_id', companyId!)
        .order('name_en');
      if (error) throw error;
      return (data || []) as ToolRow[];
    },
    enabled: !!companyId,
  });

  const filteredTools = useMemo(() => tools.filter((row) => toolMatchesSearch(row, toolSearch)), [tools, toolSearch]);

  const addToolMutation = useMutation({
    mutationFn: async ({ tool_id, quantity: q }: { tool_id: string; quantity: number }) => {
      const formattedDate = format(date, 'yyyy-MM-dd');
      const { error } = await supabase.from('calendar_tools').insert({
        event_id: eventId || null,
        tool_id,
        user_id: user?.id,
        date: formattedDate,
        quantity: q,
        company_id: companyId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar_tools'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_calendar_tools'] });
      queryClient.invalidateQueries({ queryKey: ['calendar_tools_unified'] });
      queryClient.invalidateQueries({ queryKey: ['calendar_tools_week'] });
      setSelectedTool(null);
      setQuantity('1');
    },
    onError: (error) => {
      console.error('Failed to add calendar tool:', error);
      alert(t('event:failed_add_tool'));
    },
  });

  const handleSubmit = () => {
    if (!selectedTool) return;
    const n = parseInt(quantity, 10);
    if (Number.isNaN(n) || n < 1) return;
    addToolMutation.mutate({ tool_id: selectedTool.id, quantity: n });
  };

  useEffect(() => {
    if (!selectedTool && searchRef.current) searchRef.current.focus();
  }, [selectedTool]);

  const subtitle = `${t('event:modal_date_prefix')} ${format(date, 'd MMMM yyyy', { locale: dateLocale })}`;

  const canSubmit =
    !!selectedTool && parseInt(quantity, 10) >= 1 && !Number.isNaN(parseInt(quantity, 10)) && !addToolMutation.isPending;

  return (
    <CalendarRequirementModalShell
      title={t('event:require_tools')}
      subtitle={subtitle}
      icon={<Hammer size={18} strokeWidth={1.5} />}
      onClose={onClose}
      footer={
        <CalendarRequirementModalFooterActions
          onClose={onClose}
          closeLabel={t('common:close')}
          primaryLabel={addToolMutation.isPending ? t('event:adding_tool') : t('event:add_tool')}
          primaryIcon={<Plus size={16} strokeWidth={2.5} />}
          onPrimary={handleSubmit}
          primaryDisabled={!canSubmit}
        />
      }
    >
      {!selectedTool ? (
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
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              style={{
                ...inputBase,
                paddingLeft: 44,
              }}
              placeholder={t('event:search_tools_placeholder')}
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
            {filteredTools.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedTool(item)}
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
                    {toolDisplayName(item, i18n.language)}
                  </div>
                  <div style={{ fontSize: fontSizes.sm, color: colors.textSecondary }}>
                    {t('event:unit_label')}: {translateUnit(item.unit, t)}
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
                  {translateUnit(item.unit, t)}
                </span>
              </button>
            ))}
            {filteredTools.length === 0 && (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: colors.textMuted,
                  fontSize: fontSizes.md,
                }}
              >
                {t('event:no_tools_match')}
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
                {toolDisplayName(selectedTool, i18n.language)}
              </span>
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
                {translateUnit(selectedTool.unit, t)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedTool(null);
                setQuantity('1');
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
              step={1}
              style={inputBase}
              placeholder={t('event:enter_quantity')}
            />
          </div>
        </div>
      )}
    </CalendarRequirementModalShell>
  );
};

export default CalendarToolsModal;
