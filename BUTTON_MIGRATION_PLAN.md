# Plan migracji przycisków do design systemu

> Przyciski z Tailwind (bg-blue-600, bg-red-600 itd.) → `Button` z `themes/uiComponents` + design tokens.
> **index.css** nadpisuje .bg-blue-600, .bg-red-600, .bg-green-600 → var(--color-button-primary), var(--red), var(--green) — wszystkie motywy działają.

---

## Wykonane

- [x] **CompanyPanel** — Card, Button (primary + style override dla purple/red)
- [x] **SetupPage** — Card, Button (primary + style dla green/purple/orange)
- [x] **Calendar** — Card, Button, day cells
- [x] **Layout** — dropdown tematów (design tokens)
- [x] **Legacy CSS vars** — applyTheme() ustawia --color-text-primary itd.
- [x] **Button** — dodane warianty `danger` i `success`
- [x] **index.css** — nadpisania bg-red-600, bg-green-600, bg-blue-500 + biały tekst na kolorowych przyciskach

---

## Do migracji

### Modale (priorytet wysoki) — ZROBIONE
| Plik | Status |
|------|--------|
| AdditionalMaterialsModal | ✓ Button |
| AdditionalTasksModal | ✓ Button |
| TaskPerformanceModal | ✓ Button |
| AdminDayNotesModal | ✓ Button |
| AdminMaterialAddedModal | ✓ Button |
| AdminTaskPerformanceModal | ✓ Button |
| AdminAdditionalMaterialsModal | ✓ Button |
| AdminAdditionalTasksModal | ✓ Button |

### Strony ProjectManagement — ZROBIONE
| Plik | Status |
|------|--------|
| RemovingRecords | ✓ Button |
| SetupEquipment | do zrobienia |
| UserAuthorizationModal | do zrobienia |

### Strony główne
| Plik | Przyciski |
|------|-----------|
| UserProfile | bg-blue, bg-red, bg-green, bg-purple |
| Projects | bg-blue-600, bg-green-600, bg-red-600 |
| CreateTeamPage | bg-blue-600 |
| ProjectCreating | bg-blue-600, bg-green-600 |
| MachineryTaskCreator | bg-blue, bg-green, bg-red |
| MainTaskModal | bg-blue-600 |
| WorkPricingModal | bg-green-600 |

### Kalkulatory
| Plik | Przyciski |
|------|-----------|
| FenceCalculator | bg-blue-600 |
| ArtificialGrassCalculator | bg-blue-600 |
| NaturalTurfCalculator | bg-blue-600 |
| WallCalculator | bg-blue-600 |
| TimeEstimator | bg-blue-600 |
| TileInstallationCalculator | bg-blue-600 |

---

## Mapowanie

| Tailwind | Button |
|----------|--------|
| bg-blue-600 hover:bg-blue-700 | `variant="primary"` |
| bg-red-600 hover:bg-red-700 | `variant="danger"` |
| bg-green-600 hover:bg-green-700 | `variant="success"` |
| bg-purple-600 | `variant="primary" style={{ background: gradient purple }}` |
| Cancel / secondary | `variant="secondary"` |
