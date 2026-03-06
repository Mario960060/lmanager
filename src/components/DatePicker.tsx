import React from 'react';
import { useTranslation } from 'react-i18next';
import DatePickerLib from 'react-datepicker';
import { parseISO, format, isValid, getYear } from 'date-fns';
import { pl } from 'date-fns/locale';

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

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 21 }, (_, i) => THIS_YEAR - 10 + i);

const DatePicker: React.FC<DatePickerProps> = ({
  value, onChange, placeholder, disabled = false,
  minDate, maxDate, required = false, className = '', id, dateFormat = 'dd/MM/yyyy',
}) => {
  const { t, i18n } = useTranslation('common');
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const placeholderText = placeholder ?? t('date_placeholder');
  const selectedDate = value && isValid(parseISO(value)) ? parseISO(value) : null;
  const minDateObj = minDate && isValid(parseISO(minDate)) ? parseISO(minDate) : undefined;
  const maxDateObj = maxDate && isValid(parseISO(maxDate)) ? parseISO(maxDate) : undefined;

  return (
    <DatePickerLib
      id={id}
      selected={selectedDate}
      onChange={(date) => onChange(date ? format(date, 'yyyy-MM-dd') : '')}
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
      calendarClassName="react-datepicker--theme"
      renderCustomHeader={({ date, changeYear, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled }) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px' }}>
          <button type="button" onClick={decreaseMonth} disabled={prevMonthButtonDisabled} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'inherit', padding: '0 6px', opacity: prevMonthButtonDisabled ? 0.4 : 1 }}>
            ‹
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, fontSize: '0.9rem' }}>
            <span>{format(date, 'MMMM', { locale: dateLocale })}</span>
            <select
              value={getYear(date)}
              onChange={(e) => changeYear(Number(e.target.value))}
              style={{ background: 'transparent', border: 'none', color: 'inherit', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', outline: 'none', padding: '0', appearance: 'auto' }}
            >
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button type="button" onClick={increaseMonth} disabled={nextMonthButtonDisabled} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'inherit', padding: '0 6px', opacity: nextMonthButtonDisabled ? 0.4 : 1 }}>
            ›
          </button>
        </div>
      )}
    />
  );
};

export default DatePicker;
