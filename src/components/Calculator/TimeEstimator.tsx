import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { translateTaskName, translateUnit } from '../../lib/translationMap';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { Clock, Users } from 'lucide-react';
import { colors, fontSizes, fontWeights, spacing, radii } from '../../themes/designTokens';
import { Spinner, Button } from '../../themes/uiComponents';

interface TaskTemplate {
  id: string;
  name: string;
  unit: string;
  estimated_hours: number;
}

const TimeEstimator = () => {
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const [selectedTask, setSelectedTask] = useState<TaskTemplate | null>(null);
  const [quantity, setQuantity] = useState('');
  const [workers, setWorkers] = useState('');
  const [result, setResult] = useState<{ totalHours: number; perWorker: number; days: number } | null>(null);
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch task templates
  const { data: taskTemplates = [], isLoading } = useQuery({
    queryKey: ['task_templates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .order('name');
      
      if (error) throw error;
      return data as TaskTemplate[];
    },
    enabled: !!companyId
  });

  // Filter tasks by search
  const filteredTasks = search === ''
    ? taskTemplates
    : taskTemplates.filter(task =>
        task.name.toLowerCase().includes(search.toLowerCase())
      );

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const calculateTime = () => {
    if (!selectedTask || !quantity || !workers) return;

    const totalUnits = parseFloat(quantity);
    const numWorkers = parseInt(workers);
    
    if (isNaN(totalUnits) || isNaN(numWorkers) || numWorkers <= 0) return;

    // Calculate total hours needed for all units
    const totalHours = totalUnits * selectedTask.estimated_hours;
    
    // Calculate hours per worker
    const hoursPerWorker = totalHours / numWorkers;
    
    // Calculate working days (8-hour workday)
    const workingDays = Math.ceil(hoursPerWorker / 8);

    setResult({
      totalHours: Number(totalHours.toFixed(1)),
      perWorker: Number(hoursPerWorker.toFixed(1)),
      days: workingDays
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing["3xl"] }}>
      {/* Task Selection */}
      <div>
        <label style={{ display: "block", fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>{t('calculator:select_task_label')}</label>
        <div style={{ position: "relative" }} ref={dropdownRef}>
          <button
            type="button"
            style={{ width: "100%", borderRadius: radii.md, border: `1px solid ${colors.borderInput}`, background: colors.bgInput, padding: `${spacing.xs}px ${spacing.lg}px ${spacing.xs}px ${spacing.lg}px`, textAlign: "left", color: colors.textPrimary, outline: "none" }}
            onClick={() => setDropdownOpen((open) => !open)}
          >
            {selectedTask ? translateTaskName(selectedTask.name, t) : t('calculator:select_task_placeholder')}
          </button>
          {dropdownOpen && (
            <div style={{ position: "absolute", zIndex: 10, marginTop: spacing.xs, width: "100%", borderRadius: radii.md, background: colors.bgCard, boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)", border: `1px solid ${colors.borderDefault}` }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('calculator:search_tasks_label')}
                style={{ width: "100%", padding: `${spacing.xs}px ${spacing.lg}px`, borderBottom: `1px solid ${colors.borderDefault}`, background: "transparent", color: colors.textPrimary, outline: "none" }}
                autoFocus
              />
              <ul style={{ maxHeight: 240, overflow: "auto" }}>
                {filteredTasks.length === 0 ? (
                  <li style={{ padding: `${spacing.xs}px ${spacing.lg}px`, color: colors.textDim }}>{t('calculator:no_tasks')}</li>
                ) : (
                  filteredTasks.map(task => (
                    <li
                      key={task.id}
                      style={{
                        padding: `${spacing.xs}px ${spacing.lg}px`,
                        cursor: "pointer",
                        background: selectedTask?.id === task.id ? colors.accentBlue : "transparent",
                        color: selectedTask?.id === task.id ? colors.textOnAccent : colors.textPrimary,
                        fontWeight: selectedTask?.id === task.id ? fontWeights.semibold : fontWeights.normal
                      }}
                      onClick={() => {
                        setSelectedTask(task);
                        setDropdownOpen(false);
                        setResult(null);
                      }}
                    >
                      {translateTaskName(task.name, t)}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      {selectedTask && (
        <>
          <div>
            <label style={{ display: "block", fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>
              {t('calculator:quantity_label')} ({translateUnit(selectedTask.unit, t)})
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setResult(null);
              }}
              min="0.1"
              step="0.1"
              style={{ marginTop: spacing.xs, display: "block", width: "100%", borderRadius: radii.md, border: `1px solid ${colors.borderInput}`, padding: `${spacing.sm}px ${spacing.xl}px`, background: colors.bgInput, color: colors.textPrimary, outline: "none" }}
              placeholder={t('calculator:enter_amount_in_unit', { unit: translateUnit(selectedTask.unit, t) })}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted }}>
              {t('calculator:number_of_workers_label')}
            </label>
            <div style={{ marginTop: spacing.xs, position: "relative", borderRadius: radii.md }}>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, paddingLeft: spacing.lg, display: "flex", alignItems: "center", pointerEvents: "none" }}>
                <Users style={{ width: 20, height: 20, color: colors.textSubtle }} />
              </div>
              <input
                type="number"
                value={workers}
                onChange={(e) => {
                  setWorkers(e.target.value);
                  setResult(null);
                }}
                min="1"
                style={{ display: "block", width: "100%", paddingLeft: 40, borderRadius: radii.md, border: `1px solid ${colors.borderInput}`, padding: `${spacing.sm}px ${spacing.xl}px`, background: colors.bgInput, color: colors.textPrimary, outline: "none" }}
                placeholder={t('calculator:enter_number_of_workers')}
              />
            </div>
          </div>

          <Button variant="accent" color={colors.accentBlue} onClick={calculateTime} disabled={!quantity || !workers}>
            {t('calculator:calculate_button')}
          </Button>

          {result && (
            <div style={{ marginTop: spacing["3xl"], padding: spacing["3xl"], background: colors.bgCard, borderRadius: radii.md, display: "flex", flexDirection: "column", gap: spacing.lg }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: spacing["3xl"] }}>
                <div>
                  <div style={{ fontSize: fontSizes.sm, color: colors.textMuted }}>{t('calculator:total_hours_needed')}</div>
                  <div style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.bold, color: colors.textPrimary }}>
                    {result.totalHours}h
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: fontSizes.sm, color: colors.textMuted }}>{t('calculator:hours_per_worker')}</div>
                  <div style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.bold, color: colors.textPrimary }}>
                    {result.perWorker}h
                  </div>
                </div>
              </div>
              <div style={{ paddingTop: spacing.lg, borderTop: `1px solid ${colors.borderDefault}` }}>
                <div style={{ fontSize: fontSizes.sm, color: colors.textMuted }}>{t('calculator:estimated_work_time')}</div>
                <div style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.bold, color: colors.textPrimary }}>
                  {t('calculator:estimated_work_time_days_format', { days: result.days })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TimeEstimator;
