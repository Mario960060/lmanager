// ============================================================
// ThemeContext.tsx
// Manages theme switching. Applies CSS variables to :root.
// Components use designTokens (var() values) — auto-update on theme change.
// ============================================================

import React, { createContext, useContext, useEffect, useState } from "react";
import { ThemeConfig, getTheme, getAllThemes, applyTheme } from "./themeDefinitions";
import { useAuthStore } from "../lib/store";

interface ThemeContextType {
  current: ThemeConfig;
  currentTheme: ThemeConfig;  // alias for backward compat
  setTheme: (id: string) => void;
  themes: ThemeConfig[];
  availableThemes: ThemeConfig[];  // alias for backward compat
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "landscapeManager_theme";

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [current, setCurrent] = useState<ThemeConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || "dark";
    return getTheme(saved);
  });

  const setTheme = (id: string) => {
    const t = getTheme(id);
    setCurrent(t);
    localStorage.setItem(STORAGE_KEY, id);
    applyTheme(t);
    useAuthStore.getState().setTheme(t.isDark ? "dark" : "light");
  };

  // Apply on mount and when theme changes; sync html class for Tailwind dark:
  useEffect(() => {
    applyTheme(current);
    useAuthStore.getState().setTheme(current.isDark ? "dark" : "light");
  }, [current]);

  const themeList = getAllThemes();
  return (
    <ThemeContext.Provider value={{
      current,
      currentTheme: current,
      setTheme,
      themes: themeList,
      availableThemes: themeList,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};