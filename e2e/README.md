# E2E Layout Tests (Playwright)

Testy E2E sprawdzające układ UI, pozycje przycisków i responsywność na mobile/desktop.

## Uruchomienie

```bash
# Wszystkie testy (bez auth - testy wymagające logowania będą pominięte)
npm run test:e2e

# Tylko Chromium (szybsze)
npx playwright test --project=chromium

# Z interfejsem UI
npm run test:e2e:ui
```

## Testy wymagające logowania

Aby uruchomić testy CreateProjectChoice, ProjectCardModal i Projects:

1. Utwórz plik `.env.local` w głównym katalogu projektu
2. Dodaj zmienne:
   ```
   E2E_TEST_EMAIL=twoj@email.com
   E2E_TEST_PASSWORD=twoje_haslo
   ```
3. Uruchom `npm run test:e2e`

## Struktura testów

- `layout/login.spec.ts` – strona logowania (działa bez auth)
- `layout/create-project-choice.spec.ts` – modal wyboru tworzenia projektu
- `layout/project-card-modal.spec.ts` – modal konfiguracji projektu (status buttons)
- `layout/projects-cards.spec.ts` – karty projektów na stronie Projects

## Zmiany w layoutcie

- **ProjectCardModal**: przyciski statusu (planned/scheduled/in_progress) w jednej linii na mobile (`flex-wrap: nowrap`, `overflow-x: auto`)
- **ProjectCard**: `minHeight: 200`, `flex: 1` na treści – stats zawsze na dole karty
- **CreateProjectChoiceModal**: karty z `minHeight: 140` dla spójnej wysokości
