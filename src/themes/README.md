# 🎨 Landscape Manager - Theme System

Profesjonalny, skalowalnty system tematów dla aplikacji!

---

## ⚡ TL;DR (5 minut)

### Setup:
1. Dodaj w `main.tsx`:
```typescript
import './themes/theme.css'
import { ThemeProvider } from './themes'
```

2. Opakowań app:
```typescript
<ThemeProvider>
  <App />
</ThemeProvider>
```

### Użytkownie:
```typescript
import { useTheme } from './themes'

const MyComponent = () => {
  const { currentTheme } = useTheme()
  return <div style={{ color: currentTheme.colors.textPrimary }}>Hello</div>
}
```

### Nowy temat?
Dodaj w `themeDefinitions.ts` i gotowe! 🎉

---

## 📚 Dokumenty

| Dokument | Opis |
|----------|------|
| **QUICK_START.md** | TL;DR - najważniejsze informacje (15 min) |
| **INTEGRATION_GUIDE.md** | Jak podpiąć do aplikacji (5 min) |
| **THEME_SYSTEM_README.md** | Pełna dokumentacja (30 min) |
| **SETUP.md** | Co było stworzone |

👉 **ZACZNIJ OD**: `INTEGRATION_GUIDE.md` - to jest najważniejsze!

---

## 🎨 Dostępne Tematy

1. 🌙 **dark** - Ciemny, profesjonalny (domyślny)
2. 🌿 **organic** - Ciepły, naturalny
3. 🌅 **sunset** - Energetyczny
4. 🌊 **ocean** - Spokojny, morski

➕ **Dodaj nowy temat w 5 minut!**

---

## 📁 Struktura

```
src/themes/
├── themeDefinitions.ts       ← 🎨 Definicje tematów (EDYTUJ TUTAJ!)
├── ThemeContext.tsx          ← 🎪 Context Provider
├── themeUtils.ts             ← 🛠️ Utility Functions  
├── theme.css                 ← 🎭 CSS Variables
├── index.ts                  ← 📦 Exports
├── QUICK_START.md            ← ⚡ TL;DR
├── INTEGRATION_GUIDE.md      ← 🔗 Setup
├── THEME_SYSTEM_README.md    ← 📖 Pełna docs
└── SETUP.md                  ← ✅ Co było zrobione
```

---

## 🚀 Szybki Start

### 1. Setup (do `main.tsx`)
```typescript
import './themes/theme.css'
import { ThemeProvider } from './themes'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
```

### 2. Użyj w komponencie
```typescript
import { useTheme } from './themes'

export const MyButton = () => {
  const { currentTheme } = useTheme()
  
  return (
    <button style={{ 
      backgroundColor: currentTheme.colors.buttonPrimary,
      color: currentTheme.colors.buttonPrimaryText,
    }}>
      Click me
    </button>
  )
}
```

### 3. Dodaj Theme Selector
```typescript
import { ThemeSelector } from './components/ThemeSelector'

// W Settings/Profile/Navigation:
<ThemeSelector />
```

### 4. Nowy temat?
```typescript
// W src/themes/themeDefinitions.ts

const themes = {
  dark: { /* ... */ },
  myNewTheme: {  // ← Nowy temat!
    id: 'myNewTheme',
    displayName: 'My Awesome Theme',
    colors: {
      primary: '#YOUR_COLOR',
      // ... reszta
    },
    animations: { /* ... */ },
    effects: { /* ... */ },
  },
}
```

---

## 💡 Jak to działa?

```
┌─────────────────────────────────┐
│      ThemeProvider              │
│  (context + CSS variables)      │
└────────────────┬────────────────┘
                 │
         ┌───────▼────────┐
         │  useTheme()    │
         │  (hook)        │
         └────────────────┘
                 │
         ┌───────▼────────────────────┐
         │  Komponent dostaje temat   │
         │  i może go użyć            │
         │  currentTheme.colors.xxx   │
         └────────────────────────────┘
```

**Na zmianę tematu:**
1. User klika ThemeSelector
2. `setTheme('organic')` zmienia temat
3. CSS variables są aktualizowane
4. Komponenty się re-render'ują
5. Wszystko wygląda inaczej! ✨

---

## 🎯 Główne Korzyści

✅ **Jeden plik = nowy temat** - dodaj temat w 5 minut  
✅ **Globalny design system** - zmień wygląd bez edycji każdego komponentu  
✅ **Migracja stopniowa** - rób nowe komponenty z theme, stare migruj jak masz czas  
✅ **localStorage persistence** - temat się zapamiętuje  
✅ **CSS variables** - działa w CSS/SCSS  
✅ **TypeScript support** - pełna integracja  
✅ **Łatwe do utrzymania** - logiczna struktura  
✅ **Gotowe utility functions** - nie musisz pisać kodu  

---

## 📊 Struktura Tematu

```typescript
{
  id: 'unique-id',              // Unique identifier
  name: 'unique-id',            // Unique name
  displayName: 'Display Name',  // Dla UI
  icon: '🎨',                   // Emoji dla Theme Selector
  
  colors: {
    // Primary colors
    primary: '#HEX',
    primaryHover: '#HEX',
    primaryLight: '#HEX',
    primaryDark: '#HEX',
    
    // Secondary
    secondary: '#HEX',
    // ... 26 więcej kolorów
  },
  
  animations: {
    duration: { fast, normal, slow },
    easing: { default, smooth, bounce },
  },
  
  effects: {
    borderRadius: { small, medium, large, full },
    shadow: { small, medium, large, xl },
    blur: { small, medium, large },
  },
}
```

---

## 🛠️ Dostępne Utility Functions

```typescript
// Buttons
getButtonStyle(theme, 'primary' | 'secondary')
getButtonHoverStyle(theme, 'primary' | 'secondary')

// Cards & Modals
getCardStyle(theme)
getCardWithShadowStyle(theme)
getModalStyle(theme)

// Inputs
getInputStyle(theme)
getInputFocusStyle(theme)

// Tables
getTableHeaderStyle(theme)
getTableRowStyle(theme, isEven)

// Text & Status
getTextStyle(theme, variant)
getStatusStyle(theme, status)

// Effects
getShadowStyle(theme, size)
getBorderStyle(theme, variant)
getTransitionStyle(theme, duration)

// ... i więcej!
```

---

## 🎭 CSS Variables

Dostępne w CSS:

```css
/* Colors */
var(--color-primary)
var(--color-bg-primary)
var(--color-text-primary)
var(--color-border)
var(--color-success)
/* ... i 30+ więcej */

/* Animations */
var(--duration-fast)
var(--easing-default)

/* Effects */
var(--border-radius-medium)
var(--shadow-large)
var(--blur-small)
```

Użyj w CSS:
```css
.my-element {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-medium);
  border-radius: var(--border-radius-large);
  transition: all var(--duration-normal) var(--easing-default);
}
```

---

## 🔄 Migracja Komponentu

**PRZED** (hardcoded):
```typescript
<button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
  Click
</button>
```

**PO** (theme-aware):
```typescript
import { useTheme, getButtonStyle } from './themes'

export const MyButton = () => {
  const { currentTheme } = useTheme()
  return (
    <button style={getButtonStyle(currentTheme, 'primary')}>
      Click
    </button>
  )
}
```

**Teraz wystarczy zmienić temat i button będzie inny!** ✨

---

## 🌈 Przykład: Dodaj Nowy Temat

```typescript
// src/themes/themeDefinitions.ts

export const themes = {
  dark: { /* existing */ },
  organic: { /* existing */ },
  
  // NOWY TEMAT!
  cyberpunk: {
    id: 'cyberpunk',
    name: 'cyberpunk',
    displayName: 'Cyberpunk Neon',
    icon: '🔮',
    colors: {
      primary: '#FF00FF',           // Neon różowy
      primaryHover: '#DD00DD',
      primaryLight: '#FF33FF',
      primaryDark: '#CC00CC',
      
      secondary: '#00FF00',         // Neon zielony
      secondaryHover: '#00DD00',
      secondaryLight: '#33FF33',
      
      bgPrimary: '#0D0011',         // Ciemne tło
      bgSecondary: '#1A0033',
      bgTertiary: '#270055',
      bgHover: '#330066',
      
      textPrimary: '#FFFFFF',       // Biały tekst
      textSecondary: '#E0E0E0',
      textMuted: '#A0A0A0',
      textInverted: '#000000',
      
      // ... reszta kolorów (30+ pól)
      border: '#FF00FF',
      borderLight: '#DD00DD',
      borderFocus: '#FF00FF',
      
      success: '#00FF00',
      successLight: '#33FF33',
      warning: '#FFFF00',
      warningLight: '#FFFF33',
      error: '#FF0066',
      errorLight: '#FF3399',
      info: '#FF00FF',
      infoLight: '#FF33FF',
      
      buttonPrimary: '#FF00FF',
      buttonPrimaryHover: '#DD00DD',
      buttonPrimaryText: '#000000',
      buttonSecondary: '#270055',
      buttonSecondaryHover: '#330066',
      buttonSecondaryText: '#FF00FF',
      
      inputBg: '#1A0033',
      inputBorder: '#FF00FF',
      inputFocus: '#FF00FF',
      inputText: '#FFFFFF',
      
      modalBg: '#1A0033',
      modalOverlay: 'rgba(13, 0, 17, 0.9)',
      cardBg: '#1A0033',
      cardBorder: '#FF00FF',
      
      tableHeader: '#270055',
      tableRowEven: '#1A0033',
      tableRowOdd: '#0D0011',
      tableRowHover: '#270055',
      
      shadow: 'rgba(255, 0, 255, 0.3)',
      shadowHover: 'rgba(255, 0, 255, 0.5)',
    },
    animations: {
      duration: {
        fast: '100ms',
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
}
```

**Gotowe!** 🎉 Temat pojawi się automatycznie w ThemeSelector!

---

## 📝 Checklist

- [ ] Przeczytaj `INTEGRATION_GUIDE.md` (5 minut)
- [ ] Dodaj setup do `main.tsx` (2 minuty)
- [ ] Testuj - zmień temat w Theme Selector
- [ ] Przeczytaj `QUICK_START.md` (10 minut)
- [ ] Zainspirej się `ExampleThemeCard.tsx`
- [ ] Zacznij migrować komponenty!
- [ ] Dodaj nowy temat (5 minut)

---

## ❓ FAQ

**Q: Czy muszę zamieniać wszystkie komponenty?**
A: Nie! Rób to stopniowo. Nowe = od razu z theme, stare = migruj jak masz czas.

**Q: Gdzie się zapisuje wybór tematu?**
A: W `localStorage` - automatycznie.

**Q: Czy mogę zmienić temat z poziomu komponentu?**
A: Tak! `const { setTheme } = useTheme(); setTheme('organic');`

**Q: Czym się różni dark theme?**
A: Jest pixel-perfect z Twoim aktualnym kodem! Żadnych zmian.

**Q: Jakie kolory w dark theme?**
A: Niebieskie (`#2563EB`), szare, białe. Dokładnie jak masz teraz.

---

## 🎯 Next Steps

1. Przeczytaj `INTEGRATION_GUIDE.md`
2. Setup aplikacji (5 minut)
3. Testuj Theme Selector
4. Zainspirej się `ExampleThemeCard.tsx`
5. Zacznij migrować komponenty!
6. Dodawaj nowe tematy!

---

## 📞 Support

- 🚀 `QUICK_START.md` - szybkie odpowiedzi
- 🔗 `INTEGRATION_GUIDE.md` - setup instrukcje
- 📖 `THEME_SYSTEM_README.md` - pełna dokumentacja
- 💡 `ExampleThemeCard.tsx` - jak to działa

---

## ✨ Gotowe!

Masz teraz profesjonalny system tematów! 🎉

**Powodzenia!** 🚀
