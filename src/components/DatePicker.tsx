import React, {
  useRef, useCallback, useState, useLayoutEffect, useMemo,
} from 'react';
import { useTranslation } from 'react-i18next';
import DatePickerLib, { registerLocale, type ReactDatePickerCustomHeaderProps } from 'react-datepicker';
import {
  parseISO,
  format,
  isValid,
  getYear,
  startOfMonth,
  isSameMonth,
  isBefore,
  addDays,
} from 'date-fns';
import { pl as plLocale } from 'date-fns/locale';

registerLocale('pl', plLocale);

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  required?: boolean;
  className?: string;
  id?: string;
  dateFormat?: string;
}

/** Szeroki zakres lat w select — nawigacja miesiącami jest bez ograniczeń (min/max z props). */
const YEAR_MIN = 1900;
const YEAR_MAX = 2100;
const YEARS = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);

/**
 * Symetryczny stos: w górę (wstecz) i w dół (naprzód). Mniejszy zakres = mniej DOM i mniej lagów
 * (~25 miesięcy × ~35 dni). Dalsze miesiące — strzałki ‹ ›.
 *
 * `monthSelectedIn` = indeks miesiąca `state.date` w stosie (środek).
 */
const MONTHS_EACH_SIDE = 12;
const STACKED_MONTHS = MONTHS_EACH_SIDE * 2 + 1;
const MONTH_SELECTED_IN = MONTHS_EACH_SIDE;

type NavRef = {
  decreaseMonth: () => void;
  increaseMonth: () => void;
  changeYear: (y: number) => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
};

/** Wyśrodkuj element w pionie wewnątrz kontenera scroll (bez animacji — nie walczy z CSS scroll-behavior). */
function centerElementInScrollContainer(container: HTMLElement, target: HTMLElement) {
  const cRect = container.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const relativeTop = tRect.top - cRect.top + container.scrollTop;
  const nextTop =
    relativeTop - container.clientHeight / 2 + tRect.height / 2;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = Math.max(0, Math.min(nextTop, maxScroll));
}

/** Tylko kontenery miesięcy (~25), nie tysiące komórek dni — inaczej scroll laguje (getBoundingClientRect × N). */
function computeEarliestVisibleMonth(scrollEl: HTMLElement): Date {
  const cr = scrollEl.getBoundingClientRect();
  let best: Date | null = null;
  scrollEl.querySelectorAll<HTMLElement>('.react-datepicker__month-container').forEach((container) => {
    const br = container.getBoundingClientRect();
    if (br.bottom <= cr.top || br.top >= cr.bottom) return;
    const firstDay = container.querySelector<HTMLElement>('[data-iso-date]');
    const iso = firstDay?.getAttribute('data-iso-date');
    if (!iso) return;
    const d = parseISO(iso);
    if (!best || isBefore(d, best)) best = d;
  });
  return best ? startOfMonth(best) : startOfMonth(new Date());
}

const DatePicker: React.FC<DatePickerProps> = ({
  value, onChange, placeholder, disabled = false,
  minDate, maxDate, required = false, className = '', id, dateFormat = 'dd/MM/yyyy',
}) => {
  const { t, i18n } = useTranslation('common');
  const dateLocale = i18n.language === 'pl' ? plLocale : undefined;
  const placeholderText = placeholder ?? t('date_placeholder');
  const selectedDate = value && isValid(parseISO(value)) ? parseISO(value) : null;
  const minDateObj = minDate && isValid(parseISO(minDate)) ? parseISO(minDate) : undefined;
  const maxDateObj = maxDate && isValid(parseISO(maxDate)) ? parseISO(maxDate) : undefined;

  const [stickyMonth, setStickyMonth] = useState(() =>
    startOfMonth(selectedDate ?? new Date()));

  const stickyMonthRef = useRef(stickyMonth);
  stickyMonthRef.current = stickyMonth;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRaf = useRef<number | null>(null);
  const navRef = useRef<NavRef>({
    decreaseMonth: () => {},
    increaseMonth: () => {},
    changeYear: () => {},
    prevDisabled: false,
    nextDisabled: false,
  });

  const mondayForLabels = useRef(new Date(2024, 0, 1)).current;
  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, i) =>
      format(addDays(mondayForLabels, i), 'EEE', { locale: dateLocale })),
    [dateLocale, mondayForLabels],
  );

  const syncStickyFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = computeEarliestVisibleMonth(el);
    setStickyMonth((prev) => (isSameMonth(prev, next) ? prev : next));
  }, []);

  const onScrollRegionScroll = useCallback(() => {
    if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      syncStickyFromScroll();
    });
  }, [syncStickyFromScroll]);

  /**
   * Po otwarciu: wyśrodkuj w obszarze scrolla „dziś” (albo wybrany dzień), bez wymuszania dołu listy.
   */
  const scrollCalendarToCenterTarget = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = scrollRef.current;
        if (!root) return;
        const monthEls = root.querySelectorAll<HTMLElement>('.react-datepicker__month-container');
        const centerMonthEl = monthEls[MONTH_SELECTED_IN];
        const selectedDay = root.querySelector<HTMLElement>(
          '.react-datepicker__day--selected:not(.react-datepicker__day--outside-month)',
        );
        const todayInCenter =
          centerMonthEl?.querySelector<HTMLElement>('.react-datepicker__day--today') ?? null;
        const target = selectedDay ?? todayInCenter ?? centerMonthEl ?? null;
        if (target) {
          centerElementInScrollContainer(root, target);
        }
        syncStickyFromScroll();
      });
    });
  }, [syncStickyFromScroll]);

  const handleCalendarChange = useCallback(
    (date: Date | null) => {
      onChange(date ? format(date, 'yyyy-MM-dd') : '');
    },
    [onChange],
  );

  const handleMonthYearSync = useCallback(() => {
    requestAnimationFrame(syncStickyFromScroll);
  }, [syncStickyFromScroll]);

  const renderDayContents = useCallback((dayOfMonth: number, date: Date) => (
    <span data-iso-date={format(date, 'yyyy-MM-dd')}>{dayOfMonth}</span>
  ), []);

  const renderMonthHeader = useCallback(
    ({
      monthDate,
      decreaseMonth,
      increaseMonth,
      changeYear,
      prevMonthButtonDisabled,
      nextMonthButtonDisabled,
    }: ReactDatePickerCustomHeaderProps) => {
      navRef.current = {
        decreaseMonth,
        increaseMonth,
        changeYear,
        prevDisabled: prevMonthButtonDisabled,
        nextDisabled: nextMonthButtonDisabled,
      };
      return (
        <div
          className="datepicker-scroll-month-title"
          style={{
            color: 'var(--color-text-primary)',
            textAlign: 'center',
            fontWeight: 600,
            fontSize: '0.8rem',
            padding: '6px 4px 2px',
          }}
        >
          {format(monthDate, 'MMMM yyyy', { locale: dateLocale })}
        </div>
      );
    },
    [dateLocale],
  );

  // Zależność musi być stringiem `value` — `parseISO` co render daje nowy obiekt Date i wyzwalałby efekt w kółko.
  useLayoutEffect(() => {
    const base = value && isValid(parseISO(value)) ? parseISO(value) : new Date();
    const next = startOfMonth(base);
    setStickyMonth((prev) => (isSameMonth(prev, next) ? prev : next));
  }, [value]);

  const CalendarContainer = useCallback(
    ({ className: c, children }: { className?: string; children?: React.ReactNode }) => {
      const sm = stickyMonthRef.current;
      const nav = navRef.current;
      const yearShown = getYear(sm);
      const headerStyle: React.CSSProperties = { color: 'var(--color-text-primary)' };

      return (
        <div
          className="datepicker-popover-shell"
          role="dialog"
          aria-label="Choose Date"
          aria-modal="true"
        >
          <div
            className="datepicker-sticky-header"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 6px',
              ...headerStyle,
            }}
          >
            <button
              type="button"
              onClick={() => nav.decreaseMonth()}
              disabled={nav.prevDisabled}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px',
                color: 'inherit',
                padding: '0 6px',
                opacity: nav.prevDisabled ? 0.4 : 1,
              }}
              aria-label={t('previous_month', { defaultValue: 'Previous month' })}
            >
              ‹
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, fontSize: '0.9rem' }}>
              <span>{format(sm, 'MMMM', { locale: dateLocale })}</span>
              <select
                value={yearShown}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  nav.changeYear(y);
                  requestAnimationFrame(syncStickyFromScroll);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  outline: 'none',
                  padding: '0',
                  appearance: 'auto',
                }}
              >
                {!YEARS.includes(yearShown) && (
                  <option key={yearShown} value={yearShown}>{yearShown}</option>
                )}
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => nav.increaseMonth()}
              disabled={nav.nextDisabled}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px',
                color: 'inherit',
                padding: '0 6px',
                opacity: nav.nextDisabled ? 0.4 : 1,
              }}
              aria-label={t('next_month', { defaultValue: 'Next month' })}
            >
              ›
            </button>
          </div>

          <div className="datepicker-sticky-day-names">
            {weekdayLabels.map((label) => (
              <div key={label} className="react-datepicker__day-name">
                {label}
              </div>
            ))}
          </div>

          <div
            ref={scrollRef}
            className={`${c ?? ''} datepicker-scroll-region`.trim()}
            onScroll={onScrollRegionScroll}
          >
            {children}
          </div>
        </div>
      );
    },
    [dateLocale, onScrollRegionScroll, syncStickyFromScroll, t, weekdayLabels],
  );

  return (
    <DatePickerLib
      id={id}
      selected={selectedDate}
      onChange={handleCalendarChange}
      dateFormat={dateFormat}
      placeholderText={placeholderText}
      disabled={disabled}
      minDate={minDateObj}
      maxDate={maxDateObj}
      required={required}
      className={className}
      wrapperClassName="w-full"
      calendarStartDay={1}
      isClearable
      todayButton={t('today')}
      locale={i18n.language === 'pl' ? 'pl' : undefined}
      monthsShown={STACKED_MONTHS}
      showPreviousMonths
      /* Środek stosu = bieżący miesiąc → scroll w dół pokazuje przyszłe miesiące */
      {...{ monthSelectedIn: MONTH_SELECTED_IN }}
      calendarClassName="react-datepicker--theme datepicker-stacked-months"
      calendarContainer={CalendarContainer}
      onCalendarOpen={scrollCalendarToCenterTarget}
      onMonthChange={handleMonthYearSync}
      onYearChange={handleMonthYearSync}
      renderDayContents={renderDayContents}
      renderCustomHeader={renderMonthHeader}
    />
  );
};

export default DatePicker;
