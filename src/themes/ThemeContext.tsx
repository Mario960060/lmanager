import React, { createContext, useContext, useEffect, useState } from 'react';
import { Theme, getTheme, themes } from './themeDefinitions';

interface ThemeContextType {
  currentTheme: Theme;
  setTheme: (themeId: string) => void;
  availableThemes: Theme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Aplikuje CSS variables dla aktualnego tematu
 * Dzięki temu nie trzeba aktualizować każdy komponent - zmienia się globalnie
 */
const applyThemeVariables = (theme: Theme) => {
  const root = document.documentElement;
  
  // Kolory główne
  root.style.setProperty('--color-primary', theme.colors.primary);
  root.style.setProperty('--color-primary-hover', theme.colors.primaryHover);
  root.style.setProperty('--color-primary-light', theme.colors.primaryLight);
  root.style.setProperty('--color-primary-dark', theme.colors.primaryDark);
  
  // Secondary
  root.style.setProperty('--color-secondary', theme.colors.secondary);
  root.style.setProperty('--color-secondary-hover', theme.colors.secondaryHover);
  root.style.setProperty('--color-secondary-light', theme.colors.secondaryLight);
  
  // Backgrounds
  root.style.setProperty('--color-bg-primary', theme.colors.bgPrimary);
  root.style.setProperty('--color-bg-secondary', theme.colors.bgSecondary);
  root.style.setProperty('--color-bg-tertiary', theme.colors.bgTertiary);
  root.style.setProperty('--color-bg-hover', theme.colors.bgHover);
  
  // Text
  root.style.setProperty('--color-text-primary', theme.colors.textPrimary);
  root.style.setProperty('--color-text-secondary', theme.colors.textSecondary);
  root.style.setProperty('--color-text-muted', theme.colors.textMuted);
  root.style.setProperty('--color-text-inverted', theme.colors.textInverted);
  
  // Borders
  root.style.setProperty('--color-border', theme.colors.border);
  root.style.setProperty('--color-border-light', theme.colors.borderLight);
  root.style.setProperty('--color-border-focus', theme.colors.borderFocus);
  
  // Status
  root.style.setProperty('--color-success', theme.colors.success);
  root.style.setProperty('--color-success-light', theme.colors.successLight);
  root.style.setProperty('--color-warning', theme.colors.warning);
  root.style.setProperty('--color-warning-light', theme.colors.warningLight);
  root.style.setProperty('--color-error', theme.colors.error);
  root.style.setProperty('--color-error-light', theme.colors.errorLight);
  root.style.setProperty('--color-info', theme.colors.info);
  root.style.setProperty('--color-info-light', theme.colors.infoLight);
  
  // Buttons
  root.style.setProperty('--color-button-primary', theme.colors.buttonPrimary);
  root.style.setProperty('--color-button-primary-hover', theme.colors.buttonPrimaryHover);
  root.style.setProperty('--color-button-primary-text', theme.colors.buttonPrimaryText);
  root.style.setProperty('--color-button-secondary', theme.colors.buttonSecondary);
  root.style.setProperty('--color-button-secondary-hover', theme.colors.buttonSecondaryHover);
  root.style.setProperty('--color-button-secondary-text', theme.colors.buttonSecondaryText);
  
  // Inputs
  root.style.setProperty('--color-input-bg', theme.colors.inputBg);
  root.style.setProperty('--color-input-border', theme.colors.inputBorder);
  root.style.setProperty('--color-input-focus', theme.colors.inputFocus);
  root.style.setProperty('--color-input-text', theme.colors.inputText);
  
  // Modal/Card
  root.style.setProperty('--color-modal-bg', theme.colors.modalBg);
  root.style.setProperty('--color-modal-overlay', theme.colors.modalOverlay);
  root.style.setProperty('--color-card-bg', theme.colors.cardBg);
  root.style.setProperty('--color-card-border', theme.colors.cardBorder);
  
  // Table
  root.style.setProperty('--color-table-header', theme.colors.tableHeader);
  root.style.setProperty('--color-table-row-even', theme.colors.tableRowEven);
  root.style.setProperty('--color-table-row-odd', theme.colors.tableRowOdd);
  root.style.setProperty('--color-table-row-hover', theme.colors.tableRowHover);
  
  // Shadows
  root.style.setProperty('--color-shadow', theme.colors.shadow);
  root.style.setProperty('--color-shadow-hover', theme.colors.shadowHover);
  
  // Animacje
  root.style.setProperty('--duration-fast', theme.animations.duration.fast);
  root.style.setProperty('--duration-normal', theme.animations.duration.normal);
  root.style.setProperty('--duration-slow', theme.animations.duration.slow);
  root.style.setProperty('--easing-default', theme.animations.easing.default);
  root.style.setProperty('--easing-smooth', theme.animations.easing.smooth);
  root.style.setProperty('--easing-bounce', theme.animations.easing.bounce);
  
  // Efekty
  root.style.setProperty('--border-radius-small', theme.effects.borderRadius.small);
  root.style.setProperty('--border-radius-medium', theme.effects.borderRadius.medium);
  root.style.setProperty('--border-radius-large', theme.effects.borderRadius.large);
  root.style.setProperty('--border-radius-full', theme.effects.borderRadius.full);
  root.style.setProperty('--shadow-small', theme.effects.shadow.small);
  root.style.setProperty('--shadow-medium', theme.effects.shadow.medium);
  root.style.setProperty('--shadow-large', theme.effects.shadow.large);
  root.style.setProperty('--shadow-xl', theme.effects.shadow.xl);
  root.style.setProperty('--blur-small', theme.effects.blur.small);
  root.style.setProperty('--blur-medium', theme.effects.blur.medium);
  root.style.setProperty('--blur-large', theme.effects.blur.large);
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Pobierz zapisany temat z localStorage, domyślnie 'dark'
  const [currentTheme, setCurrentThemeState] = useState<Theme>(() => {
    const savedThemeId = localStorage.getItem('landscapeManager_theme') || 'dark';
    return getTheme(savedThemeId);
  });

  // Aktualizuj temat
  const setTheme = (themeId: string) => {
    const theme = getTheme(themeId);
    setCurrentThemeState(theme);
    localStorage.setItem('landscapeManager_theme', themeId);
    applyThemeVariables(theme);
  };

  // Aplikuj zmienne CSS na starcie
  useEffect(() => {
    applyThemeVariables(currentTheme);
  }, [currentTheme]);

  const value: ThemeContextType = {
    currentTheme,
    setTheme,
    availableThemes: Object.values(themes),
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook do użytku w komponentach
 * 
 * Przykład:
 * const { currentTheme, setTheme } = useTheme();
 * console.log(currentTheme.colors.primary);
 */
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

/**
 * Helper do zwracania klasy Tailwind na podstawie tematu
 * 
 * Zamiast:
 *   theme.name === 'dark' ? 'bg-blue-600' : 'bg-amber-600'
 * 
 * Używaj:
 *   getThemeClass('buttonPrimary')
 */
export const getThemeClass = (
  colorKey: keyof Theme['colors']
): string => {
  // Ta funkcja powinna być zamieniania na CSS variables
  // Zmieniamy na direct Tailwind dla teraz
  return '';
};
