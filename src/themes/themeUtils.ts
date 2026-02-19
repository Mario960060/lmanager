/**
 * THEME UTILITIES - Funkcje pomocnicze do stylów tematowych
 * 
 * Zamiast pisać wszędzie:
 *   theme.name === 'dark' ? 'bg-blue-600 text-white' : theme.name === 'organic' ? 'bg-amber-600 text-white' : ...
 * 
 * Teraz piszesz:
 *   getButtonClass()
 *   getInputClass()
 *   getCardClass()
 * 
 * I dodając nowy temat, automatycznie się pojawia!
 */

import { Theme } from './themeDefinitions';

// ============================================================================
// BUTTON STYLES
// ============================================================================

export const getButtonPrimaryClass = (theme: Theme): string => {
  return `px-4 py-2 rounded-md transition-colors font-medium`;
};

export const getButtonPrimaryBgStyle = (theme: Theme): React.CSSProperties => ({
  backgroundColor: theme.colors.buttonPrimary,
  color: theme.colors.buttonPrimaryText,
});

export const getButtonPrimaryHoverStyle = (theme: Theme): React.CSSProperties => ({
  backgroundColor: theme.colors.buttonPrimaryHover,
  color: theme.colors.buttonPrimaryText,
});

// ============================================================================
// CARD/MODAL STYLES
// ============================================================================

export const getCardStyle = (theme: Theme): React.CSSProperties => ({
  backgroundColor: theme.colors.cardBg,
  borderColor: theme.colors.cardBorder,
});

export const getModalOverlayStyle = (theme: Theme): React.CSSProperties => ({
  backgroundColor: theme.colors.modalOverlay,
});

export const getModalStyle = (theme: Theme): React.CSSProperties => ({
  backgroundColor: theme.colors.modalBg,
  boxShadow: `0 10px 15px -3px ${theme.colors.shadow}`,
});

// ============================================================================
// INPUT STYLES
// ============================================================================

export const getInputStyle = (theme: Theme): React.CSSProperties => ({
  backgroundColor: theme.colors.inputBg,
  borderColor: theme.colors.inputBorder,
  color: theme.colors.inputText,
});

export const getInputFocusStyle = (theme: Theme): React.CSSProperties => ({
  backgroundColor: theme.colors.inputBg,
  borderColor: theme.colors.inputFocus,
  color: theme.colors.inputText,
  boxShadow: `0 0 0 3px ${theme.colors.inputFocus}22`,
});

// ============================================================================
// TABLE STYLES
// ============================================================================

export const getTableHeaderStyle = (theme: Theme): React.CSSProperties => ({
  backgroundColor: theme.colors.tableHeader,
  color: theme.colors.textPrimary,
});

export const getTableRowStyle = (
  theme: Theme,
  isEven: boolean
): React.CSSProperties => ({
  backgroundColor: isEven ? theme.colors.tableRowEven : theme.colors.tableRowOdd,
  color: theme.colors.textPrimary,
});

// ============================================================================
// TEXT STYLES
// ============================================================================

export const getTextStyle = (theme: Theme, variant: 'primary' | 'secondary' | 'muted' = 'primary'): React.CSSProperties => {
  const colorMap = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    muted: theme.colors.textMuted,
  };
  return {
    color: colorMap[variant],
  };
};

// ============================================================================
// STATUS COLORS
// ============================================================================

export const getStatusColor = (
  theme: Theme,
  status: 'success' | 'warning' | 'error' | 'info'
): string => {
  const colors = {
    success: theme.colors.success,
    warning: theme.colors.warning,
    error: theme.colors.error,
    info: theme.colors.info,
  };
  return colors[status];
};

export const getStatusStyle = (
  theme: Theme,
  status: 'success' | 'warning' | 'error' | 'info'
): React.CSSProperties => {
  const colors = {
    success: { bg: theme.colors.successLight, text: theme.colors.success },
    warning: { bg: theme.colors.warningLight, text: theme.colors.warning },
    error: { bg: theme.colors.errorLight, text: theme.colors.error },
    info: { bg: theme.colors.infoLight, text: theme.colors.info },
  };
  const color = colors[status];
  return {
    backgroundColor: color.bg,
    color: color.text,
  };
};

// ============================================================================
// BORDER & SHADOW STYLES
// ============================================================================

export const getBorderStyle = (theme: Theme, variant: 'normal' | 'light' | 'focus' = 'normal'): React.CSSProperties => {
  const colors = {
    normal: theme.colors.border,
    light: theme.colors.borderLight,
    focus: theme.colors.borderFocus,
  };
  return {
    borderColor: colors[variant],
  };
};

export const getShadowStyle = (theme: Theme, size: 'small' | 'medium' | 'large' | 'xl' = 'medium'): React.CSSProperties => {
  const shadows = {
    small: theme.effects.shadow.small,
    medium: theme.effects.shadow.medium,
    large: theme.effects.shadow.large,
    xl: theme.effects.shadow.xl,
  };
  return {
    boxShadow: shadows[size],
  };
};

// ============================================================================
// ANIMATION STYLES
// ============================================================================

export const getTransitionStyle = (theme: Theme, duration: 'fast' | 'normal' | 'slow' = 'normal'): React.CSSProperties => {
  const durations = {
    fast: theme.animations.duration.fast,
    normal: theme.animations.duration.normal,
    slow: theme.animations.duration.slow,
  };
  return {
    transition: `all ${durations[duration]} ${theme.animations.easing.default}`,
  };
};

// ============================================================================
// COMBINED STYLES - Gotowe kombinacje dla częstych elementów
// ============================================================================

export const getCardWithShadowStyle = (theme: Theme): React.CSSProperties => ({
  backgroundColor: theme.colors.cardBg,
  borderColor: theme.colors.cardBorder,
  boxShadow: theme.effects.shadow.medium,
  borderRadius: theme.effects.borderRadius.large,
  border: `1px solid ${theme.colors.cardBorder}`,
  padding: '1.5rem',
});

export const getButtonStyle = (
  theme: Theme,
  variant: 'primary' | 'secondary' = 'primary'
): React.CSSProperties => {
  const isLight = variant === 'secondary';
  return {
    backgroundColor: isLight ? theme.colors.buttonSecondary : theme.colors.buttonPrimary,
    color: isLight ? theme.colors.buttonSecondaryText : theme.colors.buttonPrimaryText,
    border: 'none',
    borderRadius: theme.effects.borderRadius.medium,
    cursor: 'pointer',
    fontWeight: '500',
    padding: '0.5rem 1rem',
    transition: `all ${theme.animations.duration.fast} ${theme.animations.easing.default}`,
  };
};

// ============================================================================
// HOVER STATES
// ============================================================================

export const getHoverStyle = (theme: Theme): React.CSSProperties => ({
  backgroundColor: theme.colors.bgHover,
});

export const getButtonHoverStyle = (
  theme: Theme,
  variant: 'primary' | 'secondary' = 'primary'
): React.CSSProperties => {
  const isLight = variant === 'secondary';
  return {
    backgroundColor: isLight ? theme.colors.buttonSecondaryHover : theme.colors.buttonPrimaryHover,
  };
};
