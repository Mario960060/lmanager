/**
 * EXAMPLE THEME-AWARE COMPONENT
 * 
 * Ten komponent pokazuje jak używać systemu tematów
 * Możesz go usunąć po zapoznaniu się z systemem
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../themes/ThemeContext';
import { getCardWithShadowStyle, getButtonStyle, getTextStyle, getStatusStyle } from '../themes/themeUtils';

interface ExampleCardProps {
  title: string;
  description: string;
  status?: 'success' | 'warning' | 'error' | 'info';
}

export const ExampleThemeCard: React.FC<ExampleCardProps> = ({
  title,
  description,
  status = 'info',
}) => {
  const { t } = useTranslation(['common']);
  const { currentTheme } = useTheme();

  return (
    <div
      style={{
        ...getCardWithShadowStyle(currentTheme),
        padding: '2rem',
      }}
    >
      {/* Title */}
      <h2
        style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          ...getTextStyle(currentTheme, 'primary'),
        }}
      >
        {title}
      </h2>

      {/* Description */}
      <p
        style={{
          marginBottom: '1.5rem',
          ...getTextStyle(currentTheme, 'secondary'),
        }}
      >
        {description}
      </p>

      {/* Status Badge */}
      {status && (
        <div
          style={{
            display: 'inline-block',
            padding: '0.5rem 1rem',
            borderRadius: currentTheme.effects.borderRadius.medium,
            marginBottom: '1rem',
            ...getStatusStyle(currentTheme, status),
            fontSize: '0.875rem',
            fontWeight: '500',
          }}
        >
          Status: {status.toUpperCase()}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
        <button
          style={{
            ...getButtonStyle(currentTheme, 'primary'),
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = currentTheme.colors.buttonPrimaryHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = currentTheme.colors.buttonPrimary;
          }}
        >
          {t('common:primary_action')}
        </button>

        <button
          style={{
            ...getButtonStyle(currentTheme, 'secondary'),
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = currentTheme.colors.buttonSecondaryHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = currentTheme.colors.buttonSecondary;
          }}
        >
          {t('common:secondary_action')}
        </button>
      </div>

      {/* Info Box */}
      <div
        style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: currentTheme.colors.bgTertiary,
          borderRadius: currentTheme.effects.borderRadius.medium,
          borderLeft: `4px solid ${currentTheme.colors.primary}`,
          ...getTextStyle(currentTheme, 'muted'),
        }}
      >
        {t('common:theme_component_info')}
      </div>
    </div>
  );
};

/**
 * EXAMPLE: Jak to wygląda w różnych tematach
 * 
 * dark theme:
 *   - Background: ciemny szary
 *   - Text: jasny biały
 *   - Buttons: niebieski
 * 
 * organic theme:
 *   - Background: ciepły brąz
 *   - Text: jasny cream
 *   - Buttons: pomarańczowy
 * 
 * sunset theme:
 *   - Background: głębokie różowe
 *   - Text: jasny róż
 *   - Buttons: intensywny różowy
 * 
 * ocean theme:
 *   - Background: głębokie niebieskie
 *   - Text: jasny cyjan
 *   - Buttons: turkusowy
 */

export default ExampleThemeCard;
