# 🎨 Theme System - Przewodnik

## Ogólny Koncept

System tematów pozwala na **łatwe dodawanie nowych tematów bez edycji komponenty**.

Zamiast napisać w 50 komponentach:
```typescript
theme.name === 'dark' ? 'bg-blue-600' : theme.name === 'organic' ? 'bg-amber-600' : ...
```

Teraz masz:
- **Jedną definicję tematu** (200 linii dla całego tematu)
- **CSS variables** - globalnie zmieniane
- **Utility functions** - gotowe funkcje do stylów
- **Context hook** - dostęp do tematu wszędzie

---

## ⚡ Setup - Integracja z App.tsx

```typescript
// src/App.tsx
import { ThemeProvider } from './themes/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      {/* Reszta aplikacji */}
      <YourComponents />
    </ThemeProvider>
  );
}
```

To wystarczy! Teraz wszystkie komponenty mają dostęp do tematu.

---

## 🎯 Użytkownik w Komponencie

### Opcja 1: Używając Hook'a (Rekomendowane)

```typescript
import { useTheme } from '../themes/ThemeContext';

export const MyComponent = () => {
  const { currentTheme } = useTheme();
  
  return (
    <div style={{ 
      backgroundColor: currentTheme.colors.bgPrimary,
      color: currentTheme.colors.textPrimary 
    }}>
      Hello World
    </div>
  );
};
```

### Opcja 2: Używając Utility Functions

```typescript
import { useTheme } from '../themes/ThemeContext';
import { getCardWithShadowStyle, getButtonStyle } from '../themes/themeUtils';

export const MyComponent = () => {
  const { currentTheme } = useTheme();
  
  return (
    <div style={getCardWithShadowStyle(currentTheme)}>
      <button style={getButtonStyle(currentTheme, 'primary')}>
        Click me
      </button>
    </div>
  );
};
```

### Opcja 3: CSS Variables (Dla CSS/SCSS)

```typescript
// W components/MyComponent.tsx
<div className={styles.container}>Content</div>

// W MyComponent.module.css
.container {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-medium);
  border-radius: var(--border-radius-large);
}
```

---

## ➕ DODAWANIE NOWEGO TEMATU

To jest **najłatwsza część**!

1. Otwórz `src/themes/themeDefinitions.ts`
2. Dodaj nowy entry w `themes` object:

```typescript
export const themes: Record<string, Theme> = {
  dark: { /* existing */ },
  organic: { /* existing */ },
  
  // NOWY TEMAT! 🆕
  cyberpunk: {
    id: 'cyberpunk',
    name: 'cyberpunk',
    displayName: 'Cyberpunk Neon',
    icon: '🔮',
    colors: {
      // Primary - neon różowy
      primary: '#FF00FF',
      primaryHover: '#DD00DD',
      primaryLight: '#FF33FF',
      primaryDark: '#CC00CC',
      
      // Secondary - neon zielony
      secondary: '#00FF00',
      secondaryHover: '#00DD00',
      secondaryLight: '#33FF33',
      
      // Backgrounds
      bgPrimary: '#0D0011',
      bgSecondary: '#1A0033',
      bgTertiary: '#270055',
      bgHover: '#330066',
      
      // Text
      textPrimary: '#FFFFFF',
      textSecondary: '#E0E0E0',
      textMuted: '#A0A0A0',
      textInverted: '#000000',
      
      // ... reszta kolorów
      border: '#FF00FF',
      borderLight: '#DD00DD',
      borderFocus: '#FF00FF',
      
      // Status
      success: '#00FF00',
      successLight: '#33FF33',
      warning: '#FFFF00',
      warningLight: '#FFFF33',
      error: '#FF0066',
      errorLight: '#FF3399',
      info: '#FF00FF',
      infoLight: '#FF33FF',
      
      // Buttons
      buttonPrimary: '#FF00FF',
      buttonPrimaryHover: '#DD00DD',
      buttonPrimaryText: '#000000',
      buttonSecondary: '#270055',
      buttonSecondaryHover: '#330066',
      buttonSecondaryText: '#FF00FF',
      
      // Inputs
      inputBg: '#1A0033',
      inputBorder: '#FF00FF',
      inputFocus: '#FF00FF',
      inputText: '#FFFFFF',
      
      // Modal/Card
      modalBg: '#1A0033',
      modalOverlay: 'rgba(13, 0, 17, 0.9)',
      cardBg: '#1A0033',
      cardBorder: '#FF00FF',
      
      // Table
      tableHeader: '#270055',
      tableRowEven: '#1A0033',
      tableRowOdd: '#0D0011',
      tableRowHover: '#270055',
      
      // Shadows
      shadow: 'rgba(255, 0, 255, 0.3)',
      shadowHover: 'rgba(255, 0, 255, 0.5)',
    },
    animations: {
      duration: {
        fast: '100ms',    // Szybsze dla cyberpunk
        normal: '200ms',
        slow: '350ms',
      },
      easing: {
        default: 'cubic-bezier(0.4, 0, 0.2, 1)',
        smooth: 'cubic-bezier(0.4, 0, 1, 1)',
        bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
    },
    effects: {
      borderRadius: {
        small: '0.25rem',
        medium: '0.375rem',
        large: '0.5rem',
        full: '9999px',
      },
      shadow: {
        small: '0 0 10px rgba(255, 0, 255, 0.3)',
        medium: '0 0 20px rgba(255, 0, 255, 0.5)',
        large: '0 0 30px rgba(255, 0, 255, 0.7)',
        xl: '0 0 40px rgba(255, 0, 255, 0.9)',
      },
      blur: {
        small: '4px',
        medium: '8px',
        large: '12px',
      },
    },
  },
};
```

**Gotowe!** 🎉

Nowy temat pojawi się automatycznie w:
- Theme Selector Component
- CSS Variables
- Wszystkich komponentach używających `useTheme()`

---

## 🎨 Struktura Tematu

Każdy temat musi mieć:

### Colors (WYMAGANE - wszystkie pola)
```typescript
colors: {
  // Primary - główne akcenty
  primary: '#HEX',
  primaryHover: '#HEX',
  primaryLight: '#HEX',
  primaryDark: '#HEX',
  
  // Secondary - drugorzędne
  secondary: '#HEX',
  secondaryHover: '#HEX',
  secondaryLight: '#HEX',
  
  // Backgrounds - tła
  bgPrimary: '#HEX',
  bgSecondary: '#HEX',
  bgTertiary: '#HEX',
  bgHover: '#HEX',
  
  // Text - teksty
  textPrimary: '#HEX',
  textSecondary: '#HEX',
  textMuted: '#HEX',
  textInverted: '#HEX',
  
  // Borders - obramowania
  border: '#HEX',
  borderLight: '#HEX',
  borderFocus: '#HEX',
  
  // Status - statusy (success/warning/error/info)
  success: '#HEX',
  successLight: '#HEX',
  warning: '#HEX',
  warningLight: '#HEX',
  error: '#HEX',
  errorLight: '#HEX',
  info: '#HEX',
  infoLight: '#HEX',
  
  // Buttons - przyciski
  buttonPrimary: '#HEX',
  buttonPrimaryHover: '#HEX',
  buttonPrimaryText: '#HEX',
  buttonSecondary: '#HEX',
  buttonSecondaryHover: '#HEX',
  buttonSecondaryText: '#HEX',
  
  // Inputs - formularze
  inputBg: '#HEX',
  inputBorder: '#HEX',
  inputFocus: '#HEX',
  inputText: '#HEX',
  
  // Modal/Card
  modalBg: '#HEX',
  modalOverlay: 'rgba(...)',
  cardBg: '#HEX',
  cardBorder: '#HEX',
  
  // Table - tabele
  tableHeader: '#HEX',
  tableRowEven: '#HEX',
  tableRowOdd: '#HEX',
  tableRowHover: '#HEX',
  
  // Shadows - cienie
  shadow: 'rgba(...)',
  shadowHover: 'rgba(...)',
}
```

### Animations (WYMAGANE)
```typescript
animations: {
  duration: {
    fast: '150ms',
    normal: '250ms',
    slow: '400ms',
  },
  easing: {
    default: 'cubic-bezier(...)',
    smooth: 'cubic-bezier(...)',
    bounce: 'cubic-bezier(...)',
  },
}
```

### Effects (WYMAGANE)
```typescript
effects: {
  borderRadius: { small, medium, large, full },
  shadow: { small, medium, large, xl },
  blur: { small, medium, large },
}
```

---

## 🔍 Dostępne Utility Functions

### Buttons
- `getButtonStyle(theme, 'primary' | 'secondary')`
- `getButtonHoverStyle(theme, 'primary' | 'secondary')`

### Cards & Modals
- `getCardStyle(theme)`
- `getCardWithShadowStyle(theme)`
- `getModalStyle(theme)`
- `getModalOverlayStyle(theme)`

### Inputs
- `getInputStyle(theme)`
- `getInputFocusStyle(theme)`

### Tables
- `getTableHeaderStyle(theme)`
- `getTableRowStyle(theme, isEven: boolean)`

### Text
- `getTextStyle(theme, 'primary' | 'secondary' | 'muted')`

### Status
- `getStatusColor(theme, status)`
- `getStatusStyle(theme, status)`

### Borders & Shadows
- `getBorderStyle(theme, 'normal' | 'light' | 'focus')`
- `getShadowStyle(theme, 'small' | 'medium' | 'large' | 'xl')`

### Animations
- `getTransitionStyle(theme, 'fast' | 'normal' | 'slow')`

---

## 📊 CSS Variables - Pełna Lista

```css
/* Colors */
--color-primary
--color-primary-hover
--color-primary-light
--color-primary-dark
--color-secondary
--color-secondary-hover
--color-secondary-light
--color-bg-primary
--color-bg-secondary
--color-bg-tertiary
--color-bg-hover
--color-text-primary
--color-text-secondary
--color-text-muted
--color-text-inverted
--color-border
--color-border-light
--color-border-focus
--color-success
--color-success-light
--color-warning
--color-warning-light
--color-error
--color-error-light
--color-info
--color-info-light
--color-button-primary
--color-button-primary-hover
--color-button-primary-text
--color-button-secondary
--color-button-secondary-hover
--color-button-secondary-text
--color-input-bg
--color-input-border
--color-input-focus
--color-input-text
--color-modal-bg
--color-modal-overlay
--color-card-bg
--color-card-border
--color-table-header
--color-table-row-even
--color-table-row-odd
--color-table-row-hover
--color-shadow
--color-shadow-hover

/* Animations */
--duration-fast
--duration-normal
--duration-slow
--easing-default
--easing-smooth
--easing-bounce

/* Effects */
--border-radius-small
--border-radius-medium
--border-radius-large
--border-radius-full
--shadow-small
--shadow-medium
--shadow-large
--shadow-xl
--blur-small
--blur-medium
--blur-large
```

---

## 🚀 Best Practices

1. **Zawsze używaj `useTheme()` w komponentach** - nie hardcoduj kolorów
2. **Dla Tailwind, użyj CSS modules + CSS variables** - cleaner
3. **Konsekwentnie nazwij kolory** - jeśli masz `primary`, miej `primaryHover`, `primaryLight` etc.
4. **Testuj kontrast** - upewnij się że tekst jest czytelnly (WCAG AA standard)
5. **Animacje mają sens dla tematu** - cyberpunk = szybsze, organic = wolniejsze

---

## 🎭 Przykład Migracji Komponentu

### PRZED (hardcoded)

```typescript
export const Card = ({ title, content }) => {
  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700">
      <h2 className="text-white text-lg font-bold">{title}</h2>
      <p className="text-gray-300 mt-2">{content}</p>
    </div>
  );
};
```

### PO (theme-aware)

```typescript
import { useTheme } from '../themes/ThemeContext';
import { getCardWithShadowStyle, getTextStyle } from '../themes/themeUtils';

export const Card = ({ title, content }) => {
  const { currentTheme } = useTheme();
  
  return (
    <div style={{
      ...getCardWithShadowStyle(currentTheme),
    }}>
      <h2 style={{
        fontSize: '1.125rem',
        fontWeight: 'bold',
        ...getTextStyle(currentTheme, 'primary'),
      }}>
        {title}
      </h2>
      <p style={{
        marginTop: '0.5rem',
        ...getTextStyle(currentTheme, 'secondary'),
      }}>
        {content}
      </p>
    </div>
  );
};
```

**Teraz wystarczy zmienić temat i Card wyglądać będzie inaczej!** ✨

---

## 🐛 Troubleshooting

**Q: Zmieniam temat ale nic się nie zmienia**
A: Upewnij się że `ThemeProvider` opakowuje całą aplikację w `App.tsx`

**Q: CSS variables nie działają w CSS modules**
A: Upewnij się że importujesz `src/index.css` w `main.tsx` - tam są CSS variables

**Q: Chcę całkowicie inny design dla nowego tematu**
A: Stwórz nowy temat w `themeDefinitions.ts` - możesz zmienić **wszystko**: kolory, animacje, shadows, border radius

---

## 📝 Checklist dla Nowego Tematu

- [ ] Dodane w `themeDefinitions.ts`
- [ ] Wszystkie pola `colors` wypełnione
- [ ] `animations` skonfigurowane
- [ ] `effects` skonfigurowane
- [ ] Testowane w Theme Selector
- [ ] Kontrast tekstu OK (WCAG AA)
- [ ] Animacje mają sens dla tematu
- [ ] Kolory się spodobały 🎨
