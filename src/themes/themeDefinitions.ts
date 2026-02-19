/**
 * THEME SYSTEM - Centralized Theme Definitions
 * 
 * Adding a new theme? Just add a new entry here with the required properties.
 * All colors, animations, and styles will automatically apply across the entire app.
 */

export interface ThemeColors {
  // Primary colors - główne akcenty aplikacji
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryDark: string;
  
  // Secondary colors - drugorzędne elementy
  secondary: string;
  secondaryHover: string;
  secondaryLight: string;
  
  // Background colors - tła
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgHover: string;
  
  // Text colors - teksty
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverted: string;
  
  // Border colors - obramowania
  border: string;
  borderLight: string;
  borderFocus: string;
  
  // Status colors - statusy (success, warning, error)
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  error: string;
  errorLight: string;
  info: string;
  infoLight: string;
  
  // Button colors - przyciski
  buttonPrimary: string;
  buttonPrimaryHover: string;
  buttonPrimaryText: string;
  buttonSecondary: string;
  buttonSecondaryHover: string;
  buttonSecondaryText: string;
  
  // Input colors - pola formularzy
  inputBg: string;
  inputBorder: string;
  inputFocus: string;
  inputText: string;
  
  // Modal/Card colors - modale i karty
  modalBg: string;
  modalOverlay: string;
  cardBg: string;
  cardBorder: string;
  
  // Table colors - tabele
  tableHeader: string;
  tableRowEven: string;
  tableRowOdd: string;
  tableRowHover: string;
  
  // Shadow colors - cienie
  shadow: string;
  shadowHover: string;
}

export interface ThemeAnimations {
  // Czas trwania animacji
  duration: {
    fast: string;
    normal: string;
    slow: string;
  };
  
  // Easing functions
  easing: {
    default: string;
    smooth: string;
    bounce: string;
  };
}

export interface ThemeEffects {
  // Border radius - zaokrąglenia
  borderRadius: {
    small: string;
    medium: string;
    large: string;
    full: string;
  };
  
  // Shadows - cienie
  shadow: {
    small: string;
    medium: string;
    large: string;
    xl: string;
  };
  
  // Blur effects
  blur: {
    small: string;
    medium: string;
    large: string;
  };
}

export interface Theme {
  id: string;
  name: string;
  displayName: string;
  colors: ThemeColors;
  animations: ThemeAnimations;
  effects: ThemeEffects;
  icon: string; // Emoji lub ikona
}

// ============================================================================
// THEME DEFINITIONS - DODAJ TUTAJ NOWY TEMAT
// ============================================================================

export const themes: Record<string, Theme> = {
  // DARK THEME - Aktualny wygląd aplikacji
  dark: {
    id: 'dark',
    name: 'dark',
    displayName: 'Dark Professional',
    icon: '🌙',
    colors: {
      // Primary - niebieski (Tailwind blue-600 / blue-700)
      primary: '#2563EB',        // blue-600
      primaryHover: '#1D4ED8',   // blue-700
      primaryLight: '#3B82F6',   // blue-500
      primaryDark: '#1E40AF',    // blue-800
      
      // Secondary - szary
      secondary: '#6B7280',      // gray-500
      secondaryHover: '#4B5563', // gray-600
      secondaryLight: '#9CA3AF', // gray-400
      
      // Backgrounds - ciemne tła
      bgPrimary: '#111827',      // gray-900
      bgSecondary: '#1F2937',    // gray-800
      bgTertiary: '#374151',     // gray-700
      bgHover: '#4B5563',        // gray-600
      
      // Text - jasne teksty na ciemnym tle
      textPrimary: '#F9FAFB',    // gray-50
      textSecondary: '#E5E7EB',  // gray-200
      textMuted: '#9CA3AF',      // gray-400
      textInverted: '#111827',   // gray-900
      
      // Borders
      border: '#374151',         // gray-700
      borderLight: '#4B5563',    // gray-600
      borderFocus: '#2563EB',    // blue-600
      
      // Status
      success: '#10B981',        // emerald-600
      successLight: '#34D399',   // emerald-400
      warning: '#F59E0B',        // amber-500
      warningLight: '#FBBF24',   // amber-300
      error: '#EF4444',          // red-500
      errorLight: '#F87171',     // red-400
      info: '#2563EB',           // blue-600
      infoLight: '#60A5FA',      // blue-400
      
      // Buttons
      buttonPrimary: '#2563EB',       // blue-600
      buttonPrimaryHover: '#1D4ED8',  // blue-700
      buttonPrimaryText: '#FFFFFF',   // white
      buttonSecondary: '#374151',     // gray-700
      buttonSecondaryHover: '#4B5563',// gray-600
      buttonSecondaryText: '#F9FAFB', // gray-50
      
      // Inputs
      inputBg: '#1F2937',        // gray-800
      inputBorder: '#374151',    // gray-700
      inputFocus: '#2563EB',     // blue-600
      inputText: '#F9FAFB',      // gray-50
      
      // Modal/Card - CIEMNE! (nie białe)
      modalBg: '#1F2937',        // gray-800
      modalOverlay: 'rgba(0, 0, 0, 0.75)',
      cardBg: '#1F2937',         // gray-800 (ciemne!)
      cardBorder: '#374151',     // gray-700
      
      // Table
      tableHeader: '#1F2937',    // gray-800
      tableRowEven: '#111827',   // gray-900
      tableRowOdd: '#1F2937',    // gray-800
      tableRowHover: '#374151',  // gray-700
      
      // Shadows
      shadow: 'rgba(0, 0, 0, 0.1)',
      shadowHover: 'rgba(0, 0, 0, 0.15)',
    },
    animations: {
      duration: {
        fast: '150ms',
        normal: '250ms',
        slow: '400ms',
      },
      easing: {
        default: 'cubic-bezier(0.4, 0, 0.2, 1)',
        smooth: 'cubic-bezier(0.4, 0, 1, 1)',
        bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
    },
    effects: {
      borderRadius: {
        small: '0.375rem',
        medium: '0.5rem',
        large: '0.75rem',
        full: '9999px',
      },
      shadow: {
        small: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
        medium: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
        large: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
      },
      blur: {
        small: '4px',
        medium: '8px',
        large: '12px',
      },
    },
  },

  // ORGANIC THEME - Ciepły, naturalny motyw
  organic: {
    id: 'organic',
    name: 'organic',
    displayName: 'Organic Nature',
    icon: '🌿',
    colors: {
      // Primary - bursztynowy/pomarańczowy
      primary: '#F59E0B',
      primaryHover: '#D97706',
      primaryLight: '#FBBF24',
      primaryDark: '#B45309',
      
      // Secondary - zieleń
      secondary: '#10B981',
      secondaryHover: '#059669',
      secondaryLight: '#34D399',
      
      // Backgrounds - ciepłe, naturalne tła
      bgPrimary: '#78350F',
      bgSecondary: '#92400E',
      bgTertiary: '#B45309',
      bgHover: '#D97706',
      
      // Text
      textPrimary: '#FEF3C7',
      textSecondary: '#FDE68A',
      textMuted: '#FCD34D',
      textInverted: '#78350F',
      
      // Borders
      border: '#B45309',
      borderLight: '#D97706',
      borderFocus: '#F59E0B',
      
      // Status
      success: '#10B981',
      successLight: '#34D399',
      warning: '#F59E0B',
      warningLight: '#FBBF24',
      error: '#DC2626',
      errorLight: '#EF4444',
      info: '#3B82F6',
      infoLight: '#60A5FA',
      
      // Buttons
      buttonPrimary: '#F59E0B',
      buttonPrimaryHover: '#D97706',
      buttonPrimaryText: '#FFFFFF',
      buttonSecondary: '#B45309',
      buttonSecondaryHover: '#D97706',
      buttonSecondaryText: '#FEF3C7',
      
      // Inputs
      inputBg: '#92400E',
      inputBorder: '#B45309',
      inputFocus: '#F59E0B',
      inputText: '#FEF3C7',
      
      // Modal/Card
      modalBg: '#92400E',
      modalOverlay: 'rgba(120, 53, 15, 0.75)',
      cardBg: '#92400E',
      cardBorder: '#B45309',
      
      // Table
      tableHeader: '#B45309',
      tableRowEven: '#92400E',
      tableRowOdd: '#78350F',
      tableRowHover: '#B45309',
      
      // Shadows
      shadow: 'rgba(120, 53, 15, 0.3)',
      shadowHover: 'rgba(120, 53, 15, 0.5)',
    },
    animations: {
      duration: {
        fast: '150ms',
        normal: '250ms',
        slow: '400ms',
      },
      easing: {
        default: 'cubic-bezier(0.4, 0, 0.2, 1)',
        smooth: 'cubic-bezier(0.4, 0, 1, 1)',
        bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
    },
    effects: {
      borderRadius: {
        small: '0.5rem',
        medium: '0.75rem',
        large: '1rem',
        full: '9999px',
      },
      shadow: {
        small: '0 1px 2px 0 rgba(120, 53, 15, 0.3)',
        medium: '0 4px 6px -1px rgba(120, 53, 15, 0.3)',
        large: '0 10px 15px -3px rgba(120, 53, 15, 0.3)',
        xl: '0 20px 25px -5px rgba(120, 53, 15, 0.3)',
      },
      blur: {
        small: '4px',
        medium: '8px',
        large: '12px',
      },
    },
  },


  // LIGHT THEME - Jasny, czysty i nowoczesny
  light: {
    id: 'light',
    name: 'light',
    displayName: 'Light Clean',
    icon: '☀️',
    colors: {
      // Primary - elegancki niebieski
      primary: '#2563EB',
      primaryHover: '#1D4ED8',
      primaryLight: '#3B82F6',
      primaryDark: '#1E40AF',
      
      // Secondary - zielony akcent
      secondary: '#10B981',
      secondaryHover: '#059669',
      secondaryLight: '#34D399',
      
      // Backgrounds - jasne, czyste
      bgPrimary: '#FFFFFF',
      bgSecondary: '#F8FAFC',
      bgTertiary: '#F1F5F9',
      bgHover: '#E2E8F0',
      
      // Text - ciemny tekst na jasnym tle
      textPrimary: '#0F172A',
      textSecondary: '#334155',
      textMuted: '#64748B',
      textInverted: '#FFFFFF',
      
      // Borders - subtelne
      border: '#E2E8F0',
      borderLight: '#CBD5E1',
      borderFocus: '#2563EB',
      
      // Status
      success: '#10B981',
      successLight: '#D1FAE5',
      warning: '#F59E0B',
      warningLight: '#FEF3C7',
      error: '#EF4444',
      errorLight: '#FEE2E2',
      info: '#2563EB',
      infoLight: '#DBEAFE',
      
      // Buttons
      buttonPrimary: '#2563EB',
      buttonPrimaryHover: '#1D4ED8',
      buttonPrimaryText: '#FFFFFF',
      buttonSecondary: '#E2E8F0',
      buttonSecondaryHover: '#CBD5E1',
      buttonSecondaryText: '#0F172A',
      
      // Inputs - białe z subtelnym borderem
      inputBg: '#FFFFFF',
      inputBorder: '#CBD5E1',
      inputFocus: '#2563EB',
      inputText: '#0F172A',
      
      // Modal/Card
      modalBg: '#FFFFFF',
      modalOverlay: 'rgba(0, 0, 0, 0.5)',
      cardBg: '#FFFFFF',
      cardBorder: '#E2E8F0',
      
      // Table
      tableHeader: '#F1F5F9',
      tableRowEven: '#FFFFFF',
      tableRowOdd: '#F8FAFC',
      tableRowHover: '#F1F5F9',
      
      // Shadows - subtelne
      shadow: 'rgba(0, 0, 0, 0.08)',
      shadowHover: 'rgba(0, 0, 0, 0.12)',
    },
    animations: {
      duration: {
        fast: '150ms',
        normal: '250ms',
        slow: '400ms',
      },
      easing: {
        default: 'cubic-bezier(0.4, 0, 0.2, 1)',
        smooth: 'cubic-bezier(0.4, 0, 1, 1)',
        bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
    },
    effects: {
      borderRadius: {
        small: '0.375rem',
        medium: '0.5rem',
        large: '0.75rem',
        full: '9999px',
      },
      shadow: {
        small: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        medium: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        large: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
      },
      blur: {
        small: '4px',
        medium: '8px',
        large: '12px',
      },
    },
  },

  // OCEAN THEME - Spokojny, morski motyw
  ocean: {
    id: 'ocean',
    name: 'ocean',
    displayName: 'Ocean Deep',
    icon: '🌊',
    colors: {
      // Primary - cyjan/turkusowy
      primary: '#06B6D4',
      primaryHover: '#0891B2',
      primaryLight: '#22D3EE',
      primaryDark: '#0E7490',
      
      // Secondary - niebieski
      secondary: '#0284C7',
      secondaryHover: '#0369A1',
      secondaryLight: '#0EA5E9',
      
      // Backgrounds
      bgPrimary: '#164E63',
      bgSecondary: '#155E75',
      bgTertiary: '#0E7490',
      bgHover: '#0891B2',
      
      // Text
      textPrimary: '#ECFEFF',
      textSecondary: '#CFFAFE',
      textMuted: '#A5F3FC',
      textInverted: '#164E63',
      
      // Borders
      border: '#0E7490',
      borderLight: '#0891B2',
      borderFocus: '#06B6D4',
      
      // Status
      success: '#10B981',
      successLight: '#34D399',
      warning: '#F59E0B',
      warningLight: '#FBBF24',
      error: '#EF4444',
      errorLight: '#F87171',
      info: '#06B6D4',
      infoLight: '#22D3EE',
      
      // Buttons
      buttonPrimary: '#06B6D4',
      buttonPrimaryHover: '#0891B2',
      buttonPrimaryText: '#FFFFFF',
      buttonSecondary: '#0E7490',
      buttonSecondaryHover: '#0891B2',
      buttonSecondaryText: '#ECFEFF',
      
      // Inputs
      inputBg: '#155E75',
      inputBorder: '#0E7490',
      inputFocus: '#06B6D4',
      inputText: '#ECFEFF',
      
      // Modal/Card
      modalBg: '#155E75',
      modalOverlay: 'rgba(22, 78, 99, 0.75)',
      cardBg: '#155E75',
      cardBorder: '#0E7490',
      
      // Table
      tableHeader: '#0E7490',
      tableRowEven: '#155E75',
      tableRowOdd: '#164E63',
      tableRowHover: '#0E7490',
      
      // Shadows
      shadow: 'rgba(22, 78, 99, 0.3)',
      shadowHover: 'rgba(22, 78, 99, 0.5)',
    },
    animations: {
      duration: {
        fast: '150ms',
        normal: '250ms',
        slow: '400ms',
      },
      easing: {
        default: 'cubic-bezier(0.4, 0, 0.2, 1)',
        smooth: 'cubic-bezier(0.4, 0, 1, 1)',
        bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
    },
    effects: {
      borderRadius: {
        small: '0.375rem',
        medium: '0.5rem',
        large: '0.75rem',
        full: '9999px',
      },
      shadow: {
        small: '0 1px 2px 0 rgba(22, 78, 99, 0.3)',
        medium: '0 4px 6px -1px rgba(22, 78, 99, 0.3)',
        large: '0 10px 15px -3px rgba(22, 78, 99, 0.3)',
        xl: '0 20px 25px -5px rgba(22, 78, 99, 0.3)',
      },
      blur: {
        small: '4px',
        medium: '8px',
        large: '12px',
      },
    },
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export const getTheme = (themeId: string): Theme => {
  return themes[themeId] || themes.dark;
};

export const getAllThemes = (): Theme[] => {
  return Object.values(themes);
};

export const getThemeIds = (): string[] => {
  return Object.keys(themes);
};
