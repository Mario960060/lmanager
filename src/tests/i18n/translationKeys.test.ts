/**
 * Test that translation keys are synchronized between en and pl locales.
 * Ensures no keys are missing when switching languages (prevents keys showing as literals).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const LOCALES_DIR = join(process.cwd(), "public", "locales");
const NAMESPACES = [
  "common",
  "nav",
  "calculator",
  "project",
  "form",
  "dashboard",
  "utilities",
  "event",
  "plan",
  "material",
];

function loadNamespace(lng: "en" | "pl", ns: string): Record<string, string> {
  const path = join(LOCALES_DIR, lng, `${ns}.json`);
  if (!existsSync(path)) return {};
  const content = readFileSync(path, "utf-8");
  return JSON.parse(content) as Record<string, string>;
}

describe("Translation keys en/pl synchronization", () => {
  for (const ns of NAMESPACES) {
    it(`${ns}: en and pl have the same keys`, () => {
      const en = loadNamespace("en", ns);
      const pl = loadNamespace("pl", ns);

      if (Object.keys(en).length === 0 && Object.keys(pl).length === 0) {
        return; // skip if both empty (namespace might not exist)
      }

      const enKeys = new Set(Object.keys(en));
      const plKeys = new Set(Object.keys(pl));

      const missingInEn = [...plKeys].filter((k) => !enKeys.has(k));
      const missingInPl = [...enKeys].filter((k) => !plKeys.has(k));

      expect(
        missingInEn,
        `Namespace "${ns}": keys in pl but missing in en: ${missingInEn.join(", ")}`
      ).toEqual([]);

      expect(
        missingInPl,
        `Namespace "${ns}": keys in en but missing in pl: ${missingInPl.join(", ")}`
      ).toEqual([]);
    });
  }
});
