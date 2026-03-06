import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock react-i18next so components using useTranslation render with English text in tests
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "project:creating": "Creating...",
        "project:create_project": "Create Project",
        "project:no_elements_layer2": "No elements on Layer 2. Add shapes and assign calculators.",
        "project:project_summary_title": "Project Summary",
        "project:summary_count": options?.count != null ? `Summary (${options.count})` : "Summary",
        "project:total_hours": "Total hours",
        "project:total_materials": "Total materials",
        "project:elements_without_calculator": options?.count != null ? `${options.count} element(s) without calculator` : "element(s) without calculator",
        "project:area_hours_materials": options ? `${options.area} · ${options.hours}h · ${options.matCount} materials` : "area · hours · materials",
        "project:object_card_title": options?.label != null ? `Object Card — ${options.label}` : "Object Card",
      };
      let out = translations[key] ?? key;
      if (options && typeof out === "string") {
        out = Object.entries(options).reduce((s, [k, v]) => s.replace(new RegExp(`{{${k}}}`, "g"), String(v)), out);
      }
      return out;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));