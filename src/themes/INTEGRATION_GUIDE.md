# 🔗 Theme System - Integration Guide

## Etap 1: Setup (5 minut)

### 1.1 Import CSS w main.tsx

Otwórz `src/main.tsx` i dodaj na TOP (przed wszystkim):

```typescript
import './themes/theme.css'  // ← Dodaj tę linijkę PIERWSZA
import './index.css'
import App from './App.tsx'
import React from 'react'
import ReactDOM from 'react-dom/client'
```

### 1.2 Import ThemeProvider

W tym samym pliku dodaj import:

```typescript
import { ThemeProvider } from './themes'  // ← Dodaj
```

Cały `main.tsx` powinien wyglądać mniej więcej tak:

```typescript
import './themes/theme.css'    // ← TEGO DODAJ
import './index.css'
import { ThemeProvider } from './themes'  // ← TEGO DODAJ
import App from './App.tsx'
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Reszta kodu */}
  </React.StrictMode>,
)
```

### 1.3 Wrap App w ThemeProvider

Otwórz `src/App.tsx` i zmień:

**PRZED:**
```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**PO:**
```typescript
import { ThemeProvider } from './themes'  // ← Dodaj

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>  {/* ← Dodaj */}
      <App />
    </ThemeProvider>  {/* ← Dodaj */}
  </React.StrictMode>,
)
```

✅ **To wystarczy! System działa!**

---

## Etap 2: Testowanie (2 minuty)

### Sprawdź czy theme.css załadował się

Otwórz DevTools (F12) → Console i wpisz:

```javascript
getComputedStyle(document.documentElement).getPropertyValue('--color-primary')
```

Powinieneś zobaczyć: `#2563EB` (lub inny kolor jeśli zmieniłeś tema)

### Sprawdź czy CSS variables zmieniają się

W DevTools → Elements/Inspector, kliknij na `<html>` i szukaj `style=` atrybutu. Powinieneś zobaczyć CSS variables.

✅ Wszystko działa!

---

## Etap 3: Dodaj Theme Selector (Optional, 2 minuty)

Jeśli chcesz żeby użytkownik mógł wybierać temat, dodaj komponent gdzieś w Settings/Profile/Navigation:

### 3.1 W komponencie Settings/Navigation:

```typescript
import { ThemeSelector } from './components/ThemeSelector'

export const Settings = () => {
  return (
    <div>
      <h2>Settings</h2>
      <ThemeSelector />  {/* ← Dodaj */}
      {/* Reszta settings */}
    </div>
  )
}
```

✅ Teraz użytkownik może zmienić temat!

---

## Etap 4: Migruj Komponenty (Stop-by-stop)

### Zamiast migrować wszystko naraz, rób to stopniowo:

#### 4.1 Nowe komponenty - od razu z theme

```typescript
import { useTheme } from './themes'

export const NewComponent = () => {
  const { currentTheme } = useTheme()
  
  return (
    <div style={{ backgroundColor: currentTheme.colors.bgPrimary }}>
      {/* ... */}
    </div>
  )
}
```

#### 4.2 Stare komponenty - migruj jak masz czas

PRZED:
```typescript
<button className="bg-blue-600 text-white hover:bg-blue-700">
  Click
</button>
```

PO:
```typescript
import { useTheme, getButtonStyle } from './themes'

export const OldComponent = () => {
  const { currentTheme } = useTheme()
  
  return (
    <button style={getButtonStyle(currentTheme, 'primary')}>
      Click
    </button>
  )
}
```

---

## Etap 5: CSS Modules (Optional)

### Jeśli używasz CSS modules, możesz używać CSS variables:

`MyComponent.module.css`:
```css
.container {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-medium);
  box-shadow: var(--shadow-medium);
  transition: all var(--duration-normal) var(--easing-default);
}

.container:hover {
  background-color: var(--color-bg-hover);
  box-shadow: var(--shadow-large);
}
```

`MyComponent.tsx`:
```typescript
import styles from './MyComponent.module.css'

export const MyComponent = () => {
  return <div className={styles.container}>Hello</div>
}
```

✅ CSS się automatycznie zmieni na zmianę tematu!

---

## 🔍 Troubleshooting

### Problem: CSS variables nie działają

**Rozwiązanie:**
1. Upewnij się że `theme.css` jest importowany w `main.tsx` (na TOP!)
2. Sprawdź DevTools → Elements, czy `<html>` ma atrybuty `style=` z CSS variables
3. Restart dev server

### Problem: Komponenty nie widzą theme'u

**Rozwiązanie:**
1. Upewnij się że `<ThemeProvider>` opakowuje aplikację w `main.tsx`
2. Upewnij się że importujesz `useTheme` z `./themes`
3. Sprawdź czy jesteś wewnątrz `ThemeProvider` (jeśli sidebar nie widzi, to jest poza ThemeProvider)

### Problem: localStorage nie działuje

**Rozwiązanie:**
1. Sprawdź czy używasz `useTheme()` w komponencie wewnątrz `ThemeProvider`
2. Clearing localStorage: Developer Tools → Application → Storage → Clear All
3. Restart aplikacji

---

## 📝 Checklist Integracji

- [ ] Dodaj `import './themes/theme.css'` w `main.tsx`
- [ ] Dodaj `import { ThemeProvider }` w `main.tsx`
- [ ] Wrap `<App />` w `<ThemeProvider>` w `main.tsx`
- [ ] Restart dev server (`npm run dev`)
- [ ] Sprawdź w DevTools czy CSS variables ładują się
- [ ] Testuj zmianę tematu w Theme Selector (jeśli dodałeś)
- [ ] Zainspirej się `ExampleThemeCard.tsx`
- [ ] Zacznij migrować komponenty!

---

## 📚 Następne Kroki

### 1. Zapoznaj się z dokumentacją
- Przeczytaj `QUICK_START.md` (15 minut)
- Przeczytaj `THEME_SYSTEM_README.md` (30 minut)

### 2. Testuj
- Zmień temat w Theme Selector
- Sprawdź czy wszystkie komponenty się zmieają
- Odśwież stronę - czy temat się zapamiętał?

### 3. Migruj komponenty
- Zainspirej się `ExampleThemeCard.tsx`
- Zamieniaj komponenty jeden po drugim
- Nie musisz robić wszystkich na raz!

### 4. Dodaj nowy temat
- Otwórz `themeDefinitions.ts`
- Skopiuj istniejący temat
- Zmień kolory
- Testuj!

---

## 🎯 Przykład: Całkowita Integracja

Jeśli wszystko zrobiłeś poprawnie, Twoja aplikacja powinna:

1. ✅ Załadować `theme.css` na starcie
2. ✅ Aplikować CSS variables do `<html>`
3. ✅ Pozwolić wybrać temat w Theme Selector
4. ✅ Zapamiętać wybór w localStorage
5. ✅ Na zmianę tematu - zmienić wygląd całej aplikacji

---

## 💡 Pro Tips

### Tip 1: DevTools CSS Variables Inspector

W Chrome DevTools:
1. F12 → Elements
2. Kliknij na `<html>`
3. W Styles sekcji, powinniśmy zobaczyć CSS variables

### Tip 2: Szybki Test Tematu

W DevTools Console:
```javascript
// Zmienia temat na 'organic'
localStorage.setItem('landscapeManager_theme', 'organic')
// Reload strony
window.location.reload()
```

### Tip 3: Debugowanie Colors

W komponencie:
```typescript
const { currentTheme } = useTheme()
console.log('Current theme colors:', currentTheme.colors)
```

---

## ✨ Gotowe!

System jest zaintegrrowany i gotowy do pracy!

**Co teraz?**
1. Uruchom aplikację
2. Testuj zmianę tematu
3. Zacznij migrować komponenty
4. Dodaj nowe tematy gdy będziesz chciał

🚀 **Powodzenia!**
