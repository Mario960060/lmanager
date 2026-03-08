// ============================================================
// themeDefinitions.ts
// 4 themes for Landscape Manager. Each defines CSS variables.
// ThemeContext applies them to :root — designTokens reads via var().
// ============================================================

export interface ThemeConfig {
  id: string;
  displayName: string;
  icon: string;
  isDark: boolean;
  vars: Record<string, string>;
}

// ─── Helper to build all CSS vars from a flat config ────────────
function theme(config: {
  // Backgrounds
  bgApp: string; bgMain: string; bgSidebar: string; bgCard: string;
  bgCardInner: string; bgInput: string; bgElevated: string;
  bgHover: string; bgSubtle: string; bgOverlay: string;
  bgModalBackdrop: string; bgTableRowAlt: string;
  bgDeep: string; bgDeepBorder: string; bgDeepBorderLight: string;
  bgInputDark: string; bgInputDarkAlpha: string; bgSegmentInput: string;
  // Borders
  borderDefault: string; borderLight: string; borderMedium: string;
  borderSubtle: string; borderInput: string; borderInputFocus: string;
  borderHover: string; borderInputDark: string; borderSegment: string;
  // Text
  textPrimary: string; textSecondary: string; textMuted: string;
  textSubtle: string; textDim: string; textFaint: string; textGhost: string;
  textWarm: string; textCool: string; textLabel: string;
  textPrimaryLight: string; textOnAccent: string; textDisabled: string;
  textSegment: string; textSegmentLabel: string;
  navIconInactive: string; navTextInactive: string;
  // Accent
  accent: string; accentDark: string; accentDeep: string;
  accentBg: string; accentBorder: string; accentGlow: string;
  // Accent RGB (for dynamic alpha via rgba())
  accentR: string; accentG: string; accentB: string;
  // Semantic
  orange: string; orangeLight: string;
  green: string; greenLight: string; greenBg: string; greenBorder: string;
  red: string; redLight: string;
  purple: string; purpleLight: string;
  amber: string; amberBg: string;
  teal: string; tealBg: string; tealBorder: string;
  // Status
  statusProgressBg: string; statusProgressBorder: string;
  statusProgressText: string; statusProgressDot: string;
  statusPlannedBg: string; statusPlannedBorder: string;
  statusPlannedText: string; statusPlannedDot: string;
  statusDoneBg: string; statusDoneBorder: string;
  statusDoneText: string; statusDoneDot: string;
  statusPausedBg: string; statusPausedBorder: string;
  statusPausedText: string; statusPausedDot: string;
  // Shadows
  shadowSm: string; shadowMd: string; shadowLg: string;
  shadowXl: string; shadowXxl: string;
  shadowAccent: string; shadowAccentHover: string;
  shadowCardHover: string; shadowModal: string;
  // Gradients
  gradPrimary: string; gradLogo: string; gradAvatar: string;
  gradSubtle: string; gradCard: string; gradSave: string; gradTeam: string;
  // Diagram
  diagramFill: string; diagramStroke: string;
  // Grid
  gridPattern: string;
  // Scrollbar
  scrollThumb: string; scrollThumbHover: string;
}): Record<string, string> {
  return {
    "--bg-app": config.bgApp,
    "--bg-main": config.bgMain,
    "--bg-sidebar": config.bgSidebar,
    "--bg-card": config.bgCard,
    "--bg-card-inner": config.bgCardInner,
    "--bg-input": config.bgInput,
    "--bg-elevated": config.bgElevated,
    "--bg-hover": config.bgHover,
    "--bg-subtle": config.bgSubtle,
    "--bg-overlay": config.bgOverlay,
    "--bg-modal-backdrop": config.bgModalBackdrop,
    "--bg-table-row-alt": config.bgTableRowAlt,
    "--bg-deep": config.bgDeep,
    "--bg-deep-border": config.bgDeepBorder,
    "--bg-deep-border-light": config.bgDeepBorderLight,
    "--bg-input-dark": config.bgInputDark,
    "--bg-input-dark-alpha": config.bgInputDarkAlpha,
    "--bg-segment-input": config.bgSegmentInput,
    "--border-default": config.borderDefault,
    "--border-light": config.borderLight,
    "--border-medium": config.borderMedium,
    "--border-subtle": config.borderSubtle,
    "--border-input": config.borderInput,
    "--border-input-focus": config.borderInputFocus,
    "--border-hover": config.borderHover,
    "--border-input-dark": config.borderInputDark,
    "--border-segment": config.borderSegment,
    "--text-primary": config.textPrimary,
    "--text-secondary": config.textSecondary,
    "--text-muted": config.textMuted,
    "--text-subtle": config.textSubtle,
    "--text-dim": config.textDim,
    "--text-faint": config.textFaint,
    "--text-ghost": config.textGhost,
    "--text-warm": config.textWarm,
    "--text-cool": config.textCool,
    "--text-label": config.textLabel,
    "--text-primary-light": config.textPrimaryLight,
    "--text-on-accent": config.textOnAccent,
    "--text-disabled": config.textDisabled,
    "--text-segment": config.textSegment,
    "--text-segment-label": config.textSegmentLabel,
    "--nav-icon-inactive": config.navIconInactive,
    "--nav-text-inactive": config.navTextInactive,
    "--accent": config.accent,
    "--accent-dark": config.accentDark,
    "--accent-deep": config.accentDeep,
    "--accent-bg": config.accentBg,
    "--accent-border": config.accentBorder,
    "--accent-glow": config.accentGlow,
    "--accent-r": config.accentR,
    "--accent-g": config.accentG,
    "--accent-b": config.accentB,
    "--orange": config.orange,
    "--orange-light": config.orangeLight,
    "--green": config.green,
    "--green-light": config.greenLight,
    "--green-bg": config.greenBg,
    "--green-border": config.greenBorder,
    "--red": config.red,
    "--red-light": config.redLight,
    "--purple": config.purple,
    "--purple-light": config.purpleLight,
    "--amber": config.amber,
    "--amber-bg": config.amberBg,
    "--teal": config.teal,
    "--teal-bg": config.tealBg,
    "--teal-border": config.tealBorder,
    "--status-progress-bg": config.statusProgressBg,
    "--status-progress-border": config.statusProgressBorder,
    "--status-progress-text": config.statusProgressText,
    "--status-progress-dot": config.statusProgressDot,
    "--status-planned-bg": config.statusPlannedBg,
    "--status-planned-border": config.statusPlannedBorder,
    "--status-planned-text": config.statusPlannedText,
    "--status-planned-dot": config.statusPlannedDot,
    "--status-done-bg": config.statusDoneBg,
    "--status-done-border": config.statusDoneBorder,
    "--status-done-text": config.statusDoneText,
    "--status-done-dot": config.statusDoneDot,
    "--status-paused-bg": config.statusPausedBg,
    "--status-paused-border": config.statusPausedBorder,
    "--status-paused-text": config.statusPausedText,
    "--status-paused-dot": config.statusPausedDot,
    "--shadow-sm": config.shadowSm,
    "--shadow-md": config.shadowMd,
    "--shadow-lg": config.shadowLg,
    "--shadow-xl": config.shadowXl,
    "--shadow-xxl": config.shadowXxl,
    "--shadow-accent": config.shadowAccent,
    "--shadow-accent-hover": config.shadowAccentHover,
    "--shadow-card-hover": config.shadowCardHover,
    "--shadow-modal": config.shadowModal,
    "--grad-primary": config.gradPrimary,
    "--grad-logo": config.gradLogo,
    "--grad-avatar": config.gradAvatar,
    "--grad-subtle": config.gradSubtle,
    "--grad-card": config.gradCard,
    "--grad-save": config.gradSave,
    "--grad-team": config.gradTeam,
    "--diagram-fill": config.diagramFill,
    "--diagram-stroke": config.diagramStroke,
    "--grid-pattern": config.gridPattern,
    "--scroll-thumb": config.scrollThumb,
    "--scroll-thumb-hover": config.scrollThumbHover,
  };
}

// ═════════════════════════════════════════════════════════════════
// 🌙 DARK — exact match of current app
// ═════════════════════════════════════════════════════════════════
export const darkTheme: ThemeConfig = {
  id: "dark",
  displayName: "Dark Professional",
  icon: "🌙",
  isDark: true,
  vars: theme({
    bgApp: "#0c1220", bgMain: "#0f172a", bgSidebar: "#111827", bgCard: "#111827",
    bgCardInner: "#1a2332", bgInput: "#111827", bgElevated: "#1e293b",
    bgHover: "rgba(255,255,255,0.04)", bgSubtle: "rgba(255,255,255,0.02)",
    bgOverlay: "rgba(255,255,255,0.03)", bgModalBackdrop: "rgba(0,0,0,0.6)",
    bgTableRowAlt: "rgba(255,255,255,0.015)",
    bgDeep: "#1a2536", bgDeepBorder: "#1e2d44", bgDeepBorderLight: "#253350",
    bgInputDark: "#131b28", bgInputDarkAlpha: "rgba(19,27,40,0.5)", bgSegmentInput: "#1a1a2e",
    borderDefault: "rgba(255,255,255,0.06)", borderLight: "rgba(255,255,255,0.04)",
    borderMedium: "rgba(255,255,255,0.08)", borderSubtle: "rgba(255,255,255,0.05)",
    borderInput: "rgba(59,130,246,0.35)", borderInputFocus: "rgba(59,130,246,0.6)",
    borderHover: "rgba(255,255,255,0.10)", borderInputDark: "#253350", borderSegment: "#2a2a4a",
    textPrimary: "#f1f5f9", textSecondary: "#e2e8f0", textMuted: "#cbd5e1",
    textSubtle: "#94a3b8", textDim: "#64748b", textFaint: "#475569", textGhost: "#374151",
    textWarm: "#7a8ba5", textCool: "#8a9ab5", textLabel: "#556680",
    textPrimaryLight: "#e4e9f0", textOnAccent: "#ffffff", textDisabled: "#3a4a60",
    textSegment: "#e0e0e0", textSegmentLabel: "#888888",
    navIconInactive: "#4b5563", navTextInactive: "#9ca3af",
    accent: "#3b82f6", accentDark: "#2563eb", accentDeep: "#1d4ed8",
    accentBg: "rgba(59,130,246,0.15)", accentBorder: "rgba(59,130,246,0.15)",
    accentGlow: "rgba(59,130,246,0.3)",
    accentR: "59", accentG: "130", accentB: "246",
    orange: "#f97316", orangeLight: "#fb923c",
    green: "#22c55e", greenLight: "#4ade80",
    greenBg: "rgba(34,197,94,0.12)", greenBorder: "rgba(34,197,94,0.35)",
    red: "#ef4444", redLight: "#f87171",
    purple: "#8b5cf6", purpleLight: "#a78bfa",
    amber: "#f59e0b", amberBg: "rgba(245,158,11,0.1)",
    teal: "#2dd4bf", tealBg: "rgba(45,212,191,0.08)", tealBorder: "rgba(45,212,191,0.15)",
    statusProgressBg: "rgba(249,115,22,0.12)", statusProgressBorder: "rgba(249,115,22,0.25)",
    statusProgressText: "#fb923c", statusProgressDot: "#f97316",
    statusPlannedBg: "rgba(34,197,94,0.10)", statusPlannedBorder: "rgba(34,197,94,0.20)",
    statusPlannedText: "#4ade80", statusPlannedDot: "#22c55e",
    statusDoneBg: "rgba(59,130,246,0.10)", statusDoneBorder: "rgba(59,130,246,0.20)",
    statusDoneText: "#60a5fa", statusDoneDot: "#3b82f6",
    statusPausedBg: "rgba(239,68,68,0.10)", statusPausedBorder: "rgba(239,68,68,0.20)",
    statusPausedText: "#f87171", statusPausedDot: "#ef4444",
    shadowSm: "0 2px 8px rgba(0,0,0,0.15)", shadowMd: "0 4px 16px rgba(0,0,0,0.2)",
    shadowLg: "0 4px 20px rgba(0,0,0,0.3)", shadowXl: "0 8px 32px rgba(0,0,0,0.4)",
    shadowXxl: "0 8px 32px rgba(0,0,0,0.5)",
    shadowAccent: "0 4px 20px rgba(59,130,246,0.3)",
    shadowAccentHover: "0 6px 28px rgba(59,130,246,0.45)",
    shadowCardHover: "0 4px 20px rgba(0,0,0,0.2)",
    shadowModal: "0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
    gradPrimary: "linear-gradient(135deg, #3b82f6, #2563eb)",
    gradLogo: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
    gradAvatar: "linear-gradient(135deg, #3b82f6, #6366f1)",
    gradSubtle: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.03))",
    gradCard: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.02))",
    gradSave: "linear-gradient(135deg, #22c55e, #16a34a)",
    gradTeam: "linear-gradient(135deg, #1e3a5f, #111827)",
    diagramFill: "#94a3b8", diagramStroke: "#64748b",
    gridPattern: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.015) 1px, transparent 0)",
    scrollThumb: "rgba(255,255,255,0.08)", scrollThumbHover: "rgba(255,255,255,0.15)",
  }),
};

// ═════════════════════════════════════════════════════════════════
// ☀️ LIGHT — clean, bright, professional
// ═════════════════════════════════════════════════════════════════
export const lightTheme: ThemeConfig = {
  id: "light",
  displayName: "Light Clean",
  icon: "☀️",
  isDark: false,
  vars: theme({
    bgApp: "#f8fafc", bgMain: "#f1f5f9", bgSidebar: "#ffffff", bgCard: "#ffffff",
    bgCardInner: "#f8fafc", bgInput: "#ffffff", bgElevated: "#ffffff",
    bgHover: "rgba(0,0,0,0.03)", bgSubtle: "rgba(0,0,0,0.02)",
    bgOverlay: "rgba(0,0,0,0.02)", bgModalBackdrop: "rgba(0,0,0,0.4)",
    bgTableRowAlt: "rgba(0,0,0,0.02)",
    bgDeep: "#f1f5f9", bgDeepBorder: "#e2e8f0", bgDeepBorderLight: "#cbd5e1",
    bgInputDark: "#f8fafc", bgInputDarkAlpha: "rgba(241,245,249,0.5)", bgSegmentInput: "#f1f5f9",
    borderDefault: "rgba(0,0,0,0.08)", borderLight: "rgba(0,0,0,0.05)",
    borderMedium: "rgba(0,0,0,0.10)", borderSubtle: "rgba(0,0,0,0.06)",
    borderInput: "rgba(59,130,246,0.4)", borderInputFocus: "rgba(59,130,246,0.7)",
    borderHover: "rgba(0,0,0,0.15)", borderInputDark: "#cbd5e1", borderSegment: "#e2e8f0",
    textPrimary: "#0f172a", textSecondary: "#1e293b", textMuted: "#334155",
    textSubtle: "#64748b", textDim: "#94a3b8", textFaint: "#cbd5e1", textGhost: "#e2e8f0",
    textWarm: "#64748b", textCool: "#475569", textLabel: "#94a3b8",
    textPrimaryLight: "#1e293b", textOnAccent: "#ffffff", textDisabled: "#cbd5e1",
    textSegment: "#1e293b", textSegmentLabel: "#64748b",
    navIconInactive: "#94a3b8", navTextInactive: "#64748b",
    accent: "#3b82f6", accentDark: "#2563eb", accentDeep: "#1d4ed8",
    accentBg: "rgba(59,130,246,0.08)", accentBorder: "rgba(59,130,246,0.15)",
    accentGlow: "rgba(59,130,246,0.2)",
    accentR: "59", accentG: "130", accentB: "246",
    orange: "#ea580c", orangeLight: "#f97316",
    green: "#16a34a", greenLight: "#22c55e",
    greenBg: "rgba(22,163,74,0.08)", greenBorder: "rgba(22,163,74,0.20)",
    red: "#dc2626", redLight: "#ef4444",
    purple: "#7c3aed", purpleLight: "#8b5cf6",
    amber: "#d97706", amberBg: "rgba(217,119,6,0.08)",
    teal: "#0d9488", tealBg: "rgba(13,148,136,0.06)", tealBorder: "rgba(13,148,136,0.15)",
    statusProgressBg: "rgba(234,88,12,0.08)", statusProgressBorder: "rgba(234,88,12,0.20)",
    statusProgressText: "#ea580c", statusProgressDot: "#ea580c",
    statusPlannedBg: "rgba(22,163,74,0.08)", statusPlannedBorder: "rgba(22,163,74,0.15)",
    statusPlannedText: "#16a34a", statusPlannedDot: "#16a34a",
    statusDoneBg: "rgba(59,130,246,0.08)", statusDoneBorder: "rgba(59,130,246,0.15)",
    statusDoneText: "#2563eb", statusDoneDot: "#2563eb",
    statusPausedBg: "rgba(220,38,38,0.08)", statusPausedBorder: "rgba(220,38,38,0.15)",
    statusPausedText: "#dc2626", statusPausedDot: "#dc2626",
    shadowSm: "0 1px 3px rgba(0,0,0,0.06)", shadowMd: "0 4px 12px rgba(0,0,0,0.06)",
    shadowLg: "0 8px 24px rgba(0,0,0,0.08)", shadowXl: "0 12px 40px rgba(0,0,0,0.10)",
    shadowXxl: "0 16px 48px rgba(0,0,0,0.12)",
    shadowAccent: "0 4px 16px rgba(59,130,246,0.15)",
    shadowAccentHover: "0 6px 24px rgba(59,130,246,0.25)",
    shadowCardHover: "0 4px 16px rgba(0,0,0,0.08)",
    shadowModal: "0 16px 48px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)",
    gradPrimary: "linear-gradient(135deg, #3b82f6, #2563eb)",
    gradLogo: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
    gradAvatar: "linear-gradient(135deg, #3b82f6, #6366f1)",
    gradSubtle: "linear-gradient(135deg, rgba(59,130,246,0.05), rgba(59,130,246,0.02))",
    gradCard: "linear-gradient(135deg, rgba(59,130,246,0.04), rgba(59,130,246,0.01))",
    gradSave: "linear-gradient(135deg, #16a34a, #15803d)",
    gradTeam: "linear-gradient(135deg, #eff6ff, #f8fafc)",
    diagramFill: "#64748b", diagramStroke: "#94a3b8",
    gridPattern: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.03) 1px, transparent 0)",
    scrollThumb: "rgba(0,0,0,0.12)", scrollThumbHover: "rgba(0,0,0,0.20)",
  }),
};

// ═════════════════════════════════════════════════════════════════
// 🌊 OCEAN — deep teal/cyan, calm and focused
// ═════════════════════════════════════════════════════════════════
export const oceanTheme: ThemeConfig = {
  id: "ocean",
  displayName: "Ocean Deep",
  icon: "🌊",
  isDark: true,
  vars: theme({
    bgApp: "#0a1628", bgMain: "#0d1f35", bgSidebar: "#0f2440", bgCard: "#0f2440",
    bgCardInner: "#143050", bgInput: "#0f2440", bgElevated: "#183a5e",
    bgHover: "rgba(255,255,255,0.04)", bgSubtle: "rgba(255,255,255,0.02)",
    bgOverlay: "rgba(255,255,255,0.03)", bgModalBackdrop: "rgba(0,0,0,0.6)",
    bgTableRowAlt: "rgba(255,255,255,0.015)",
    bgDeep: "#0d1f35", bgDeepBorder: "#1a3a5c", bgDeepBorderLight: "#204870",
    bgInputDark: "#0b1a2e", bgInputDarkAlpha: "rgba(11,26,46,0.5)", bgSegmentInput: "#0d1f35",
    borderDefault: "rgba(255,255,255,0.06)", borderLight: "rgba(255,255,255,0.04)",
    borderMedium: "rgba(255,255,255,0.08)", borderSubtle: "rgba(255,255,255,0.05)",
    borderInput: "rgba(255,255,255,0.08)", borderInputFocus: "rgba(6,182,212,0.5)",
    borderHover: "rgba(255,255,255,0.10)", borderInputDark: "#1a3a5c", borderSegment: "#1a3a5c",
    textPrimary: "#ecfeff", textSecondary: "#cffafe", textMuted: "#a5f3fc",
    textSubtle: "#67e8f9", textDim: "#22d3ee", textFaint: "#0e7490", textGhost: "#164e63",
    textWarm: "#7dd3fc", textCool: "#38bdf8", textLabel: "#0891b2",
    textPrimaryLight: "#cffafe", textOnAccent: "#ffffff", textDisabled: "#164e63",
    textSegment: "#cffafe", textSegmentLabel: "#0891b2",
    navIconInactive: "#0e7490", navTextInactive: "#22d3ee",
    accent: "#06b6d4", accentDark: "#0891b2", accentDeep: "#0e7490",
    accentBg: "rgba(6,182,212,0.15)", accentBorder: "rgba(6,182,212,0.15)",
    accentGlow: "rgba(6,182,212,0.3)",
    accentR: "6", accentG: "182", accentB: "212",
    orange: "#f97316", orangeLight: "#fb923c",
    green: "#22c55e", greenLight: "#4ade80",
    greenBg: "rgba(34,197,94,0.12)", greenBorder: "rgba(34,197,94,0.35)",
    red: "#ef4444", redLight: "#f87171",
    purple: "#8b5cf6", purpleLight: "#a78bfa",
    amber: "#f59e0b", amberBg: "rgba(245,158,11,0.1)",
    teal: "#2dd4bf", tealBg: "rgba(45,212,191,0.08)", tealBorder: "rgba(45,212,191,0.15)",
    statusProgressBg: "rgba(249,115,22,0.12)", statusProgressBorder: "rgba(249,115,22,0.25)",
    statusProgressText: "#fb923c", statusProgressDot: "#f97316",
    statusPlannedBg: "rgba(34,197,94,0.10)", statusPlannedBorder: "rgba(34,197,94,0.20)",
    statusPlannedText: "#4ade80", statusPlannedDot: "#22c55e",
    statusDoneBg: "rgba(6,182,212,0.10)", statusDoneBorder: "rgba(6,182,212,0.20)",
    statusDoneText: "#67e8f9", statusDoneDot: "#06b6d4",
    statusPausedBg: "rgba(239,68,68,0.10)", statusPausedBorder: "rgba(239,68,68,0.20)",
    statusPausedText: "#f87171", statusPausedDot: "#ef4444",
    shadowSm: "0 2px 8px rgba(0,0,0,0.2)", shadowMd: "0 4px 16px rgba(0,0,0,0.25)",
    shadowLg: "0 4px 20px rgba(0,0,0,0.35)", shadowXl: "0 8px 32px rgba(0,0,0,0.45)",
    shadowXxl: "0 8px 32px rgba(0,0,0,0.55)",
    shadowAccent: "0 4px 20px rgba(6,182,212,0.3)",
    shadowAccentHover: "0 6px 28px rgba(6,182,212,0.45)",
    shadowCardHover: "0 4px 20px rgba(0,0,0,0.25)",
    shadowModal: "0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
    gradPrimary: "linear-gradient(135deg, #06b6d4, #0891b2)",
    gradLogo: "linear-gradient(135deg, #06b6d4, #0e7490)",
    gradAvatar: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
    gradSubtle: "linear-gradient(135deg, rgba(6,182,212,0.08), rgba(6,182,212,0.03))",
    gradCard: "linear-gradient(135deg, rgba(6,182,212,0.08), rgba(6,182,212,0.02))",
    gradSave: "linear-gradient(135deg, #22c55e, #16a34a)",
    gradTeam: "linear-gradient(135deg, #143050, #0f2440)",
    diagramFill: "#67e8f9", diagramStroke: "#22d3ee",
    gridPattern: "radial-gradient(circle at 1px 1px, rgba(6,182,212,0.03) 1px, transparent 0)",
    scrollThumb: "rgba(255,255,255,0.08)", scrollThumbHover: "rgba(255,255,255,0.15)",
  }),
};

// ═════════════════════════════════════════════════════════════════
// 🌿 FOREST — warm earth tones, natural greens
// ═════════════════════════════════════════════════════════════════
export const forestTheme: ThemeConfig = {
  id: "forest",
  displayName: "Forest Earth",
  icon: "🌿",
  isDark: true,
  vars: theme({
    bgApp: "#0f1510", bgMain: "#141e16", bgSidebar: "#1a2a1c", bgCard: "#1a2a1c",
    bgCardInner: "#223526", bgInput: "#1a2a1c", bgElevated: "#2a3e2e",
    bgHover: "rgba(255,255,255,0.04)", bgSubtle: "rgba(255,255,255,0.02)",
    bgOverlay: "rgba(255,255,255,0.03)", bgModalBackdrop: "rgba(0,0,0,0.6)",
    bgTableRowAlt: "rgba(255,255,255,0.015)",
    bgDeep: "#1a2a1c", bgDeepBorder: "#2a3e2e", bgDeepBorderLight: "#345038",
    bgInputDark: "#121c14", bgInputDarkAlpha: "rgba(18,28,20,0.5)", bgSegmentInput: "#141e16",
    borderDefault: "rgba(255,255,255,0.06)", borderLight: "rgba(255,255,255,0.04)",
    borderMedium: "rgba(255,255,255,0.08)", borderSubtle: "rgba(255,255,255,0.05)",
    borderInput: "rgba(255,255,255,0.08)", borderInputFocus: "rgba(34,197,94,0.5)",
    borderHover: "rgba(255,255,255,0.10)", borderInputDark: "#2a3e2e", borderSegment: "#2a3e2e",
    textPrimary: "#f0fdf4", textSecondary: "#dcfce7", textMuted: "#bbf7d0",
    textSubtle: "#86efac", textDim: "#4ade80", textFaint: "#166534", textGhost: "#14532d",
    textWarm: "#a3e635", textCool: "#86efac", textLabel: "#22c55e",
    textPrimaryLight: "#dcfce7", textOnAccent: "#ffffff", textDisabled: "#14532d",
    textSegment: "#dcfce7", textSegmentLabel: "#22c55e",
    navIconInactive: "#166534", navTextInactive: "#4ade80",
    accent: "#22c55e", accentDark: "#16a34a", accentDeep: "#15803d",
    accentBg: "rgba(34,197,94,0.15)", accentBorder: "rgba(34,197,94,0.15)",
    accentGlow: "rgba(34,197,94,0.3)",
    accentR: "34", accentG: "197", accentB: "94",
    orange: "#f97316", orangeLight: "#fb923c",
    green: "#22c55e", greenLight: "#4ade80",
    greenBg: "rgba(34,197,94,0.12)", greenBorder: "rgba(34,197,94,0.35)",
    red: "#ef4444", redLight: "#f87171",
    purple: "#8b5cf6", purpleLight: "#a78bfa",
    amber: "#f59e0b", amberBg: "rgba(245,158,11,0.1)",
    teal: "#2dd4bf", tealBg: "rgba(45,212,191,0.08)", tealBorder: "rgba(45,212,191,0.15)",
    statusProgressBg: "rgba(249,115,22,0.12)", statusProgressBorder: "rgba(249,115,22,0.25)",
    statusProgressText: "#fb923c", statusProgressDot: "#f97316",
    statusPlannedBg: "rgba(34,197,94,0.10)", statusPlannedBorder: "rgba(34,197,94,0.20)",
    statusPlannedText: "#4ade80", statusPlannedDot: "#22c55e",
    statusDoneBg: "rgba(34,197,94,0.10)", statusDoneBorder: "rgba(34,197,94,0.20)",
    statusDoneText: "#86efac", statusDoneDot: "#22c55e",
    statusPausedBg: "rgba(239,68,68,0.10)", statusPausedBorder: "rgba(239,68,68,0.20)",
    statusPausedText: "#f87171", statusPausedDot: "#ef4444",
    shadowSm: "0 2px 8px rgba(0,0,0,0.2)", shadowMd: "0 4px 16px rgba(0,0,0,0.25)",
    shadowLg: "0 4px 20px rgba(0,0,0,0.35)", shadowXl: "0 8px 32px rgba(0,0,0,0.45)",
    shadowXxl: "0 8px 32px rgba(0,0,0,0.55)",
    shadowAccent: "0 4px 20px rgba(34,197,94,0.3)",
    shadowAccentHover: "0 6px 28px rgba(34,197,94,0.45)",
    shadowCardHover: "0 4px 20px rgba(0,0,0,0.25)",
    shadowModal: "0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
    gradPrimary: "linear-gradient(135deg, #22c55e, #16a34a)",
    gradLogo: "linear-gradient(135deg, #22c55e, #15803d)",
    gradAvatar: "linear-gradient(135deg, #22c55e, #a3e635)",
    gradSubtle: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.03))",
    gradCard: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))",
    gradSave: "linear-gradient(135deg, #22c55e, #16a34a)",
    gradTeam: "linear-gradient(135deg, #223526, #1a2a1c)",
    diagramFill: "#86efac", diagramStroke: "#4ade80",
    gridPattern: "radial-gradient(circle at 1px 1px, rgba(34,197,94,0.03) 1px, transparent 0)",
    scrollThumb: "rgba(255,255,255,0.08)", scrollThumbHover: "rgba(255,255,255,0.15)",
  }),
};

// ═════════════════════════════════════════════════════════════════
// All themes registry
// ═════════════════════════════════════════════════════════════════
export const themes: Record<string, ThemeConfig> = {
  dark: darkTheme,
  light: lightTheme,
  ocean: oceanTheme,
  forest: forestTheme,
};

export const getTheme = (id: string): ThemeConfig => themes[id] || darkTheme;
export const getAllThemes = (): ThemeConfig[] => Object.values(themes);
export const getThemeIds = (): string[] => Object.keys(themes);

// ─── Apply theme to :root ───────────────────────────────────────
// Also sets legacy --color-* vars used by index.css (p, span, div, button, a, inputs, etc.)
export function applyTheme(themeConfig: ThemeConfig): void {
  const root = document.documentElement;
  const v = themeConfig.vars;
  Object.entries(v).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  // Legacy vars for index.css (ensures light theme has dark text)
  root.style.setProperty("--color-text-primary", v["--text-primary"] ?? "#f1f5f9");
  root.style.setProperty("--color-bg-primary", v["--bg-app"] ?? "#0c1220");
  root.style.setProperty("--color-bg-secondary", v["--bg-main"] ?? "#0f172a");
  root.style.setProperty("--color-bg-tertiary", v["--bg-sidebar"] ?? "#111827");
  root.style.setProperty("--color-bg-hover", v["--bg-hover"] ?? "rgba(255,255,255,0.04)");
  root.style.setProperty("--color-card-bg", v["--bg-card"] ?? "#111827");
  root.style.setProperty("--color-border", v["--border-default"] ?? "rgba(255,255,255,0.06)");
  root.style.setProperty("--color-border-light", v["--border-light"] ?? "rgba(255,255,255,0.04)");
  root.style.setProperty("--color-text-secondary", v["--text-secondary"] ?? "#e2e8f0");
  root.style.setProperty("--color-text-muted", v["--text-muted"] ?? "#cbd5e1");
  root.style.setProperty("--color-input-bg", v["--bg-input"] ?? "#111827");
  root.style.setProperty("--color-input-border", v["--border-input"] ?? "rgba(255,255,255,0.08)");
  root.style.setProperty("--color-input-focus", v["--accent"] ?? "#3b82f6");
  root.style.setProperty("--color-input-text", v["--text-primary"] ?? "#f1f5f9");
  root.style.setProperty("--color-button-primary", v["--accent"] ?? "#3b82f6");
  root.style.setProperty("--color-button-primary-hover", v["--accent-dark"] ?? "#2563eb");
  root.style.setProperty("--color-button-primary-text", v["--text-on-accent"] ?? "#ffffff");
  root.style.setProperty("--color-primary", v["--accent"] ?? "#3b82f6");
  root.style.setProperty("--color-primary-hover", v["--accent-dark"] ?? "#2563eb");
  root.style.setProperty("--color-primary-light", v["--accent"] ?? "#3b82f6");
  root.style.setProperty("--color-info-light", v["--accent"] ?? "#3b82f6");
  root.style.setProperty("--color-shadow", v["--shadow-sm"] ?? "0 2px 8px rgba(0,0,0,0.15)");
}