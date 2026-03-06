# Audyt Design Systemu

> Sprawdzenie czy cały design działa "po nowemu" (designTokens + uiComponents).

---

## ✅ Architektura

| Element | Status |
|---------|--------|
| **designTokens.ts** | Kolory jako `var(--*)`, spacing, radii, shadows, gradients |
| **themeDefinitions.ts** | 4 motywy (dark, light, ocean, forest), applyTheme(), legacy vars |
| **ThemeContext.tsx** | ThemeProvider, useTheme, sync z useAuthStore |
| **uiComponents.tsx** | Card, Button, Modal, TextInput, Label, Spinner, itd. |
| **themeUtils** | ❌ Usunięty – używaj designTokens + uiComponents |

---

## ✅ Komponenty zmigrowane do design systemu

- **Layout** – sidebar, nawigacja, dropdown motywów (design tokens)
- **BackButton** – Button variant="secondary"
- **LanguageSwitcher** – design tokens (dropdown)
- **CompanyPanel, SetupPage, Calendar** – Card, Button
- **Dashboard, Projects, Tasks, Login** – design tokens
- **Modale** – AdditionalMaterials, AdditionalTasks, TaskPerformance, Admin* – Button
- **RemovingRecords** – Button (primary, danger, success, secondary)
- **Kalkulatory** – SlabCalculator, FenceCalculator, WallCalculator, itd. – design tokens

---

## ✅ index.css – nadpisania dla Tailwind

| Klasa | Zmienna |
|-------|---------|
| .bg-blue-600, .bg-blue-500 | var(--color-button-primary) |
| .bg-red-600, .bg-red-500 | var(--red) |
| .bg-green-600, .bg-green-500 | var(--green) |
| .bg-white | var(--color-card-bg) |
| .bg-gray-50, .bg-gray-100 | var(--color-bg-hover), var(--color-bg-tertiary) |
| .text-gray-* | var(--color-text-*) |
| .border-gray-* | var(--color-border) |

Przyciski z klasami Tailwind (bg-blue-600 itd.) działają z motywami dzięki nadpisaniom.

---

## ⚠️ Komponenty używające Tailwind (działają przez index.css)

Te pliki używają `className="bg-* text-*"` – działają dzięki nadpisaniom w index.css:
- SetupEquipment, SetupMaterials, SetupDigging
- UserProfile, Projects, CreateTeamPage
- ProjectCreating, EventDetails, WorkPricingModal
- Kalkulatory (ConcreteSlabs, CopingInstallation, CompositeFence, itd.)
- CompanySetupWizard, MachineryTaskCreator

**Rekomendacja:** Stopniowa migracja do `<Button variant="primary">` dla spójności.

---

## ⚠️ ThemeSelector.tsx

- Nie jest używany w aplikacji
- Odnosi się do `theme.colors` – nasz ThemeConfig ma `vars`, nie `colors`
- Do naprawy przy ewentualnym użyciu

---

## ✅ Przepływ motywów

1. **main.tsx** – ThemeProvider opakowuje App
2. **ThemeContext** – ładuje z localStorage, applyTheme() na :root
3. **App.tsx** – useAuthStore.theme → klasa html (light/dark) dla Tailwind dark:
4. **applyTheme()** – ustawia --text-primary, --bg-app, --color-* (legacy)
5. **designTokens** – odczytuje var(--*)
