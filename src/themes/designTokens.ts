// ============================================================
// designTokens.ts
// Colors/shadows/gradients → CSS variables (set by ThemeContext).
// Typography/spacing/radii/animations → static (same across themes).
// ============================================================

// ─── Colors (CSS Variables) ─────────────────────────────────────
export const colors = {
  bgApp: "var(--bg-app)", bgMain: "var(--bg-main)", bgSidebar: "var(--bg-sidebar)",
  bgCard: "var(--bg-card)", bgCardInner: "var(--bg-card-inner)", bgInput: "var(--bg-input)",
  bgElevated: "var(--bg-elevated)", bgHover: "var(--bg-hover)", bgSubtle: "var(--bg-subtle)",
  bgOverlay: "var(--bg-overlay)", bgModalBackdrop: "var(--bg-modal-backdrop)",
  bgTableRowAlt: "var(--bg-table-row-alt)", bgDeep: "var(--bg-deep)",
  bgDeepBorder: "var(--bg-deep-border)", bgDeepBorderLight: "var(--bg-deep-border-light)",
  bgInputDark: "var(--bg-input-dark)", bgInputDarkAlpha: "var(--bg-input-dark-alpha)",
  bgSegmentInput: "var(--bg-segment-input)",
  borderDefault: "var(--border-default)", borderLight: "var(--border-light)",
  borderMedium: "var(--border-medium)", borderSubtle: "var(--border-subtle)",
  borderInput: "var(--border-input)", borderInputFocus: "var(--border-input-focus)",
  borderHover: "var(--border-hover)", borderInputDark: "var(--border-input-dark)",
  borderSegment: "var(--border-segment)",
  textPrimary: "var(--text-primary)", textSecondary: "var(--text-secondary)",
  textMuted: "var(--text-muted)", textSubtle: "var(--text-subtle)",
  textDim: "var(--text-dim)", textFaint: "var(--text-faint)", textGhost: "var(--text-ghost)",
  textWarm: "var(--text-warm)", textCool: "var(--text-cool)", textLabel: "var(--text-label)",
  textPrimaryLight: "var(--text-primary-light)", textOnAccent: "var(--text-on-accent)",
  textDisabled: "var(--text-disabled)", textSegment: "var(--text-segment)",
  textSegmentLabel: "var(--text-segment-label)",
  navIconInactive: "var(--nav-icon-inactive)", navTextInactive: "var(--nav-text-inactive)",
  accentBlue: "var(--accent)", accentBlueDark: "var(--accent-dark)",
  accentBlueDeep: "var(--accent-deep)", accentBlueBg: "var(--accent-bg)",
  accentBlueBorder: "var(--accent-border)", accentBlueGlow: "var(--accent-glow)",
  orange: "var(--orange)", orangeLight: "var(--orange-light)",
  green: "var(--green)", greenLight: "var(--green-light)",
  greenBg: "var(--green-bg)", greenBorder: "var(--green-border)",
  red: "var(--red)", redLight: "var(--red-light)",
  purple: "var(--purple)", purpleLight: "var(--purple-light)",
  amber: "var(--amber)", amberBg: "var(--amber-bg)",
  teal: "var(--teal)", tealBg: "var(--teal-bg)", tealBorder: "var(--teal-border)",
  statusInProgress: {
    bg: "var(--status-progress-bg)", border: "var(--status-progress-border)",
    text: "var(--status-progress-text)", dot: "var(--status-progress-dot)",
  },
  statusPlanned: {
    bg: "var(--status-planned-bg)", border: "var(--status-planned-border)",
    text: "var(--status-planned-text)", dot: "var(--status-planned-dot)",
  },
  statusDone: {
    bg: "var(--status-done-bg)", border: "var(--status-done-border)",
    text: "var(--status-done-text)", dot: "var(--status-done-dot)",
  },
  statusPaused: {
    bg: "var(--status-paused-bg)", border: "var(--status-paused-border)",
    text: "var(--status-paused-text)", dot: "var(--status-paused-dot)",
  },
  typePaving: "var(--amber)", typeSlab: "var(--purple)",
  typeGrass: "var(--green)", typeWall: "var(--red)",
  diagramFill: "var(--diagram-fill)", diagramStroke: "var(--diagram-stroke)",
} as const;

// ─── Dynamic alpha using accent RGB vars ────────────────────────
export function accentAlpha(alpha: number): string {
  return `rgba(var(--accent-r), var(--accent-g), var(--accent-b), ${alpha})`;
}

// ─── Shadows (CSS Variables) ────────────────────────────────────
export const shadows = {
  none: "none",
  sm: "var(--shadow-sm)", md: "var(--shadow-md)", lg: "var(--shadow-lg)",
  xl: "var(--shadow-xl)", xxl: "var(--shadow-xxl)",
  blue: "var(--shadow-accent)", blueHover: "var(--shadow-accent-hover)",
  cardHover: "var(--shadow-card-hover)", modal: "var(--shadow-modal)",
  dangerBtnIdle: "var(--shadow-danger-btn-idle)", dangerBtnHover: "var(--shadow-danger-btn-hover)",
  successBtnIdle: "var(--shadow-success-btn-idle)", successBtnHover: "var(--shadow-success-btn-hover)",
  glow: (color: string, opacity = "50") => `0 0 6px ${color}${opacity}`,
} as const;

// ─── Gradients (CSS Variables) ──────────────────────────────────
export const gradients = {
  bluePrimary: "var(--grad-primary)", blueLogo: "var(--grad-logo)",
  blueAvatar: "var(--grad-avatar)", blueSubtle: "var(--grad-subtle)",
  blueCard: "var(--grad-card)", greenSave: "var(--grad-save)", teamCard: "var(--grad-team)",
  danger: "var(--grad-danger)", success: "var(--grad-success)",
  accentTeal: "linear-gradient(90deg, var(--teal), transparent)",
  accentBlueBar: "linear-gradient(90deg, var(--accent), transparent)",
  accentAmberBar: "linear-gradient(90deg, var(--amber), transparent)",
  accentGreenBar: "linear-gradient(90deg, var(--green), transparent)",
  accentRedBar: "linear-gradient(90deg, var(--red), transparent)",
  accentPurpleBar: "linear-gradient(90deg, var(--purple), transparent)",
} as const;

// ─── Static tokens (same across all themes) ─────────────────────
export const fonts = {
  display: "'Rajdhani', sans-serif",
  body: "'Exo 2', sans-serif",
  mono: "'JetBrains Mono', monospace",
  googleFontsUrl: "https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700&family=Rajdhani:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap",
} as const;

export const fontSizes = {
  xxs: 9, xs: 10, sm: 11, base: 13, md: 14,
  lg: 15, xl: 18, "2xl": 22, "3xl": 24, "4xl": 28,
} as const;

export const fontWeights = {
  light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800,
} as const;

export const spacing = {
  xs: 4, sm: 6, md: 8, lg: 10, xl: 12, "2xl": 14, "3xl": 16,
  "4xl": 18, "5xl": 20, "6xl": 24, "7xl": 28, "8xl": 32, "9xl": 40,
} as const;

export const radii = {
  sm: 4, md: 6, lg: 8, xl: 10, "2xl": 12, "3xl": 14, pill: 9999, full: "50%",
} as const;

export const transitions = { fast: "all 0.15s ease", normal: "all 0.2s ease", slow: "all 0.25s ease" } as const;
export const opacity = { subtle: 0.3, ghost: 0.5 } as const;

export const animationKeyframes = `
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes slideIn { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
  @keyframes dropIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:0.4; } 50% { opacity:1; } }
  @keyframes modalIn { from { opacity:0; transform:scale(0.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
  @keyframes backdropIn { from { opacity:0; } to { opacity:1; } }
  @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
  @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
`;

export const layout = {
  sidebarWidth: 240, maxContentWidth: 720, dashboardMaxWidth: 1280,
  dayColumnMinWidth: 280, dayColumnMaxWidth: 420,
  contentPadding: "28px 32px 40px",
  gridPattern: "var(--grid-pattern)", gridPatternSize: "32px 32px",
  accentBarHeight: 2,
} as const;

export const globalStyles = `
  ${animationKeyframes}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { height: 6px; width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--scroll-thumb); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--scroll-thumb-hover); }
  body { background-color: var(--bg-app); color: var(--text-primary); transition: background-color 0.3s ease, color 0.3s ease; }
`;

export const NAV_ITEMS = [
  { icon: "⊞", label: "Panel", key: "panel" },
  { icon: "◈", label: "Projekty", key: "projekty" },
  { icon: "⊡", label: "Kalkulator", key: "kalkulator" },
  { icon: "▦", label: "Kalendarz", key: "kalendarz" },
  { icon: "☑", label: "Wymagania Zadań", key: "wymagania" },
  { icon: "⚙", label: "Zarządzanie Projektami", key: "zarzadzanie" },
  { icon: "✎", label: "Konfiguracja", key: "konfiguracja" },
  { icon: "⊞", label: "Panel Firmy", key: "firma" },
  { icon: "$", label: "Finanse", key: "finanse" },
] as const;

/** Hex values for components that need alpha (e.g. ActionButton) */
export const accentColorsHex = {
  blue: "#3b82f6",
  green: "#22c55e",
  red: "#ef4444",
  orange: "#f97316",
} as const;

/** @deprecated Use accentAlpha() for theme-safe dynamic alpha */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}