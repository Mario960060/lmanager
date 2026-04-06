import "@testing-library/jest-dom/vitest";
import { beforeAll, vi } from "vitest";
import i18n from "../i18n/config";

beforeAll(async () => {
  await i18n.init();
  await i18n.changeLanguage("en");
});

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) =>
        String(i18n.t(key, options as Record<string, unknown>)),
      i18n,
    }),
  };
});
