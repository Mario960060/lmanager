# 🚀 Theme System - Quick Start

## Setup (15 minut)

### 1. Import CSS
W `src/main.tsx` lub `src/index.tsx`:
```typescript
import './themes/theme.css';
import { ThemeProvider } from './themes';
```

### 2. Wrap App z ThemeProvider
W `src/App.tsx`:
```typescript
import { ThemeProvider } from './themes';

function App() {
  return (
    <ThemeProvider>
      <YourApp />
    </ThemeProvider>
  );
}
```

### 3. Użyj w Komponencie
```typescript
import { useTheme } from './themes';

export const MyButton = () => {
  const { currentTheme } = useTheme();
  
  return (
    <button style={{ backgroundColor: currentTheme.colors.buttonPrimary }}>
      Click me
    </button>
  );
};
```

**To tyle!** ✨

---

## ➕ Dodaj Nowy Temat (5 minut)

1. Otwórz `src/themes/themeDefinitions.ts`
2. Skopiuj istniejący temat (np. `dark`)
3. Zmień `id`, `name`, `displayName`, `icon`
4. Dostosuj kolory
5. Gotowe! 🎉

```typescript
const themes = {
  dark: { /* ... */ },
  organic: { /* ... */ },
  
  // NOWY!
  myAwesomeTheme: {
    id: 'myAwesomeTheme',
    name: 'myAwesomeTheme',
    displayName: 'My Awesome Theme',
    icon: '✨',
    colors: {
      primary: '#YOUR_COLOR',
      // ... reszta
    },
    animations: { /* ... */ },
    effects: { /* ... */ },
  },
};
```

---

## 📚 Gdzie Co Jest

```
src/themes/
├── themeDefinitions.ts     ← DEFINICJE TEMATÓW (edytuj tutaj)
├── ThemeContext.tsx        ← Context hook (nie musisz edytować)
├── themeUtils.ts           ← Utility functions (nie musisz edytować)
├── theme.css               ← CSS variables (nie musisz edytować)
├── index.ts                ← Exports (nie musisz edytować)
├── THEME_SYSTEM_README.md  ← Full docs
└── QUICK_START.md          ← Ten plik
```

---

## 🎨 Struktura Tematu

Minimalny temat musi mieć:

```typescript
{
  id: 'unique-id',
  name: 'unique-id',
  displayName: 'Display Name',
  icon: 'emoji',
  colors: {
    // Podstawowe kolory
    primary: '#HEX',
    primaryHover: '#HEX',
    primaryLight: '#HEX',
    primaryDark: '#HEX',
    secondary: '#HEX',
    secondaryHover: '#HEX',
    secondaryLight: '#HEX',
    
    // Backgrounds
    bgPrimary: '#HEX',
    bgSecondary: '#HEX',
    bgTertiary: '#HEX',
    bgHover: '#HEX',
    
    // Text
    textPrimary: '#HEX',
    textSecondary: '#HEX',
    textMuted: '#HEX',
    textInverted: '#HEX',
    
    // Borders & Focus
    border: '#HEX',
    borderLight: '#HEX',
    borderFocus: '#HEX',
    
    // Status
    success: '#HEX',
    successLight: '#HEX',
    warning: '#HEX',
    warningLight: '#HEX',
    error: '#HEX',
    errorLight: '#HEX',
    info: '#HEX',
    infoLight: '#HEX',
    
    // Buttons
    buttonPrimary: '#HEX',
    buttonPrimaryHover: '#HEX',
    buttonPrimaryText: '#HEX',
    buttonSecondary: '#HEX',
    buttonSecondaryHover: '#HEX',
    buttonSecondaryText: '#HEX',
    
    // Inputs
    inputBg: '#HEX',
    inputBorder: '#HEX',
    inputFocus: '#HEX',
    inputText: '#HEX',
    
    // Modal/Card
    modalBg: '#HEX',
    modalOverlay: 'rgba(...)',
    cardBg: '#HEX',
    cardBorder: '#HEX',
    
    // Table
    tableHeader: '#HEX',
    tableRowEven: '#HEX',
    tableRowOdd: '#HEX',
    tableRowHover: '#HEX',
    
    // Shadows
    shadow: 'rgba(...)',
    shadowHover: 'rgba(...)',
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
      small: '0 1px 2px 0 ...',
      medium: '0 4px 6px -1px ...',
      large: '0 10px 15px -3px ...',
      xl: '0 20px 25px -5px ...',
    },
    blur: {
      small: '4px',
      medium: '8px',
      large: '12px',
    },
  },
}
```

---

## 💡 Użytkownie w Komponencie

### Opcja 1: Hook + Direct Colors (Najprostsze)
```typescript
import { useTheme } from './themes';

const MyComponent = () => {
  const { currentTheme } = useTheme();
  
  return (
    <div style={{
      backgroundColor: currentTheme.colors.bgPrimary,
      color: currentTheme.colors.textPrimary,
    }}>
      {/* ... */}
    </div>
  );
};
```

### Opcja 2: Utils Functions (Rekomendowane)
```typescript
import { useTheme, getCardWithShadowStyle } from './themes';

const MyComponent = () => {
  const { currentTheme } = useTheme();
  
  return (
    <div style={getCardWithShadowStyle(currentTheme)}>
      {/* ... */}
    </div>
  );
};
```

### Opcja 3: CSS Variables (Best dla CSS Modules)
```typescript
// MyComponent.tsx
<div className={styles.card}>Content</div>

// MyComponent.module.css
.card {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-medium);
  border-radius: var(--border-radius-large);
}
```

---

## 🌈 Dostępne Tematy (Domyślnie)

1. **dark** 🌙 - Ciemny, profesjonalny
2. **organic** 🌿 - Ciepły, naturalny
3. **sunset** 🌅 - Energetyczny
4. **ocean** 🌊 - Spokojny, morski

Dodaj więcej w `themeDefinitions.ts`!

---

## 🎯 Common Tasks

### Zmień wygląd przycisku dla nowego tematu
```typescript
// W themeDefinitions.ts, w colors nowego tematu
buttonPrimary: '#NEW_COLOR',
buttonPrimaryHover: '#NEW_COLOR_DARKER',
buttonPrimaryText: '#TEXT_COLOR',
```

### Dodaj nowy status color
```typescript
// W themeDefinitions.ts
myCustomStatus: '#COLOR',
myCustomStatusLight: '#LIGHTER_COLOR',

// W komponencie
currentTheme.colors.myCustomStatus
```

### Zmień animacje dla tematu
```typescript
// W themeDefinitions.ts, w animations
duration: {
  fast: '100ms',    // Szybciej
  normal: '200ms',
  slow: '300ms',
}
```

### Użyj CSS variables w CSS
```css
.my-button {
  background: var(--color-button-primary);
  color: var(--color-button-primary-text);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-medium);
  transition: background var(--duration-fast) var(--easing-default);
}

.my-button:hover {
  background: var(--color-button-primary-hover);
}
```

---

## ❓ FAQ

**Q: Czy muszę zamieniać wszystkie komponenty?**
A: Nie! Możesz robić to stopniowo. Nowe komponenty - od razu z theme. Stare - migruj jak będziesz miał czas.

**Q: Czy mogę mieć dynamiczne kolory (np. gradient)?**
A: Tak! W `colors` możesz używać nie tylko `#HEX`, ale też `linear-gradient(...)` albo CSS variables.

**Q: Czy mogę zmienić temat z poziomu komponentu?**
A: Tak! `const { setTheme } = useTheme(); setTheme('organic');`

**Q: Gdzie zapisuje się wybór tematu użytkownika?**
A: W `localStorage` - automatycznie. Przy reloadu strony wczyta się poprzedni temat.

**Q: Co jeśli moja animacja powinna być szybka tylko dla cyberpunk tematu?**
A: Zmień `animations.duration` dla tego tematu na krótsze wartości.

---

## 📖 Full Documentation

Przeczytaj `THEME_SYSTEM_README.md` dla pełnej dokumentacji!

---

Gotowe! Teraz możesz:
1. ✅ Dodawać nowe tematy w 5 minut
2. ✅ Zmieniać design globalnie
3. ✅ Migrować komponenty stopniowo
4. ✅ Tworzyć spójny design system

🎉 **Happy theming!**
