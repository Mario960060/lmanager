import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { colors, fonts, fontSizes, fontWeights, radii, shadows } from '../themes/designTokens';

export type HourRange = { start: number | null; end: number | null };

type Props = {
  value: HourRange;
  onChange: (v: HourRange) => void;
  disabled?: boolean;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * Drag (mouse + touch) hour range 0–23. Uses pointer events for mobile.
 */
const CalendarDayHourSelect: React.FC<Props> = ({ value, onChange, disabled }) => {
  const { t } = useTranslation(['dashboard']);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getRange = useCallback((): { min: number; max: number } | null => {
    if (!dragging && value.start !== null && value.end !== null) {
      return { min: Math.min(value.start, value.end), max: Math.max(value.start, value.end) };
    }
    if (dragging && dragStart !== null && dragCurrent !== null) {
      return { min: Math.min(dragStart, dragCurrent), max: Math.max(dragStart, dragCurrent) };
    }
    return null;
  }, [dragging, value.start, value.end, dragStart, dragCurrent]);

  const range = getRange();

  const finishDrag = useCallback(() => {
    if (dragging && dragStart !== null && dragCurrent !== null) {
      onChange({
        start: Math.min(dragStart, dragCurrent),
        end: Math.max(dragStart, dragCurrent),
      });
    }
    setDragging(false);
    setDragStart(null);
    setDragCurrent(null);
  }, [dragging, dragStart, dragCurrent, onChange]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (dragStart === null) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest?.('[data-hour]');
      if (row) {
        const hr = parseInt(row.getAttribute('data-hour') || '', 10);
        if (!Number.isNaN(hr)) setDragCurrent(hr);
      }
    };
    const up = () => finishDrag();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, dragStart, finishDrag]);

  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;

  const rowMinHeight = 44;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>
          {t('dashboard:day_plan_hour_hint')}
        </span>
        {range && (
          <span
            style={{
              fontSize: fontSizes.md,
              fontWeight: fontWeights.bold,
              color: colors.accentBlue,
              fontFamily: fonts.display,
              background: accentAlpha(0.12),
              padding: '4px 10px',
              borderRadius: radii.md,
              border: `1px solid ${accentAlpha(0.2)}`,
            }}
          >
            {fmt(range.min)} — {fmt(range.max)}
          </span>
        )}
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={() => onChange({ start: null, end: null })}
          style={{
            marginBottom: 8,
            padding: '8px 12px',
            fontSize: fontSizes.sm,
            fontWeight: fontWeights.semibold,
            fontFamily: fonts.body,
            color: colors.textMuted,
            background: colors.bgSubtle,
            border: `1px solid ${colors.borderDefault}`,
            borderRadius: radii.md,
            cursor: 'pointer',
            minHeight: 44,
          }}
        >
          {t('dashboard:day_plan_clear_hours')}
        </button>
      )}
      <div
        ref={containerRef}
        onPointerLeave={() => {
          if (dragging) finishDrag();
        }}
        style={{
          maxHeight: 280,
          overflowY: 'auto',
          borderRadius: radii.md,
          border: `1px solid ${colors.borderDefault}`,
          background: colors.bgInput,
          touchAction: 'none',
          userSelect: 'none',
        }}
        className="calendar-day-hour-scroll"
      >
        {HOURS.map((h) => {
          const inRange = range !== null && h >= range.min && h <= range.max;
          return (
            <div
              key={h}
              data-hour={h}
              onPointerDown={(e) => {
                if (disabled) return;
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                setDragging(true);
                setDragStart(h);
                setDragCurrent(h);
              }}
              onPointerEnter={(e) => {
                if (disabled || !dragging) return;
                if (e.buttons === 0 && e.pointerType !== 'touch') return;
                setDragCurrent(h);
              }}
              style={{
                padding: '10px 14px',
                minHeight: rowMinHeight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: disabled ? 'default' : 'pointer',
                background: inRange ? accentAlpha(0.14) : 'transparent',
                borderLeft: inRange ? `3px solid ${colors.accentBlue}` : '3px solid transparent',
                borderBottom: h < 23 ? `1px solid ${colors.borderSubtle}` : 'none',
                transition: dragging ? 'none' : 'background 0.15s ease',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  fontSize: fontSizes.md,
                  fontWeight: inRange ? fontWeights.bold : fontWeights.medium,
                  color: inRange ? colors.accentBlue : colors.textDim,
                  fontFamily: fonts.display,
                }}
              >
                {fmt(h)}
              </span>
              {inRange && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: colors.accentBlue,
                    boxShadow: shadows.glow(colors.accentBlue),
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function accentAlpha(a: number): string {
  return `rgba(59, 130, 246, ${a})`;
}

export default CalendarDayHourSelect;
