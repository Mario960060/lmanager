// ============================================================
// ui/components.tsx
// Complete component library for Landscape Manager.
// Every component uses designTokens — one change propagates everywhere.
// ============================================================

import React, { useState, useRef, useEffect } from "react";
import {
  colors, fonts, fontSizes, fontWeights,
  spacing, radii, shadows, transitions, gradients,
  layout, opacity, NAV_ITEMS, globalStyles, hexToRgba, accentAlpha, accentColorsHex,
} from "./designTokens";

// ─── GlobalStyles ───────────────────────────────────────────────
export function GlobalStyles() {
  return (
    <>
      <link href={fonts.googleFontsUrl} rel="stylesheet" />
      <style>{globalStyles}</style>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════
// LAYOUT
// ═════════════════════════════════════════════════════════════════

// ─── AppShell ───────────────────────────────────────────────────
interface AppShellProps {
  activeNav: string;
  onNavChange: (key: string) => void;
  children: React.ReactNode;
}

export function AppShell({ activeNav, onNavChange, children }: AppShellProps) {
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: fonts.body, background: colors.bgApp }}>
      <GlobalStyles />
      <Sidebar activeNav={activeNav} onNavChange={onNavChange} />
      <main style={{ flex: 1, overflow: "auto", background: colors.bgMain, position: "relative" }}>
        <div style={{
          position: "fixed", top: 0, left: layout.sidebarWidth, right: 0, bottom: 0,
          backgroundImage: layout.gridPattern, backgroundSize: layout.gridPatternSize,
          pointerEvents: "none", zIndex: 0,
        }} />
        <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
      </main>
    </div>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────
interface SidebarProps {
  activeNav: string;
  onNavChange: (key: string) => void;
}

export function Sidebar({ activeNav, onNavChange }: SidebarProps) {
  return (
    <aside style={{
      width: layout.sidebarWidth, background: colors.bgSidebar,
      borderRight: `1px solid ${colors.borderDefault}`,
      display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{ padding: `${spacing["5xl"]}px ${spacing["4xl"]}px`, borderBottom: `1px solid ${colors.borderDefault}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.lg }}>
          <div style={{
            width: 34, height: 34, borderRadius: radii.lg,
            background: gradients.blueLogo,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: fontWeights.extrabold, color: colors.textOnAccent,
            fontFamily: fonts.display, boxShadow: shadows.blue,
          }}>LM</div>
          <div>
            <div style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textPrimary, fontFamily: fonts.display, letterSpacing: "0.5px", lineHeight: 1.1 }}>
              Landscape
            </div>
            <div style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body, fontWeight: fontWeights.normal, letterSpacing: "1px", textTransform: "uppercase" }}>
              Manager
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: `${spacing.xl}px ${spacing.md}px`, overflowY: "auto" }}>
        {NAV_ITEMS.map((item, i) => {
          const active = activeNav === item.key;
          return (
            <button key={item.key} onClick={() => onNavChange(item.key)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: spacing.lg,
              padding: `${spacing.lg}px ${spacing.xl}px`, marginBottom: 2,
              background: active ? colors.accentBlueBg : "transparent",
              border: "none", borderRadius: radii.lg, cursor: "pointer",
              transition: transitions.fast,
              borderLeft: active ? `3px solid ${colors.accentBlue}` : "3px solid transparent",
              animation: `slideIn 0.3s ease ${i * 0.04}s both`,
            }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ fontSize: fontSizes.lg, width: 22, textAlign: "center", color: active ? colors.accentBlue : colors.textFaint, transition: transitions.fast }}>{item.icon}</span>
              <span style={{ fontSize: fontSizes.base, fontWeight: active ? fontWeights.semibold : fontWeights.normal, color: active ? colors.textSecondary : colors.textDim, fontFamily: fonts.body, transition: transitions.fast }}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: `${spacing.xl}px ${spacing["2xl"]}px`, borderTop: `1px solid ${colors.borderDefault}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md, padding: `${spacing.sm}px ${spacing.md}px`, borderRadius: radii.md, background: colors.bgOverlay }}>
          <span style={{ fontSize: 14 }}>{"\uD83C\uDF19"}</span>
          <span style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>Dark Professional</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.sm, padding: `${spacing.sm}px ${spacing.md}px`, borderRadius: radii.md, background: colors.bgOverlay, marginBottom: spacing.xl }}>
          <span style={{ fontSize: 14 }}>{"\uD83C\uDF10"}</span>
          <span style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>Polski</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.lg, padding: `${spacing.xs}px ${spacing.md}px` }}>
          <div style={{
            width: 32, height: 32, borderRadius: radii.full,
            background: gradients.blueAvatar,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: fontSizes.base, fontWeight: fontWeights.bold, color: colors.textOnAccent, fontFamily: fonts.display,
          }}>SM</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: fontSizes.base, fontWeight: fontWeights.semibold, color: colors.textSecondary, fontFamily: fonts.display }}>Super Mario</div>
            <div style={{ fontSize: fontSizes.xs, color: colors.textDim, fontFamily: fonts.body }}>Admin</div>
          </div>
          <span style={{ color: colors.textFaint, fontSize: 14, cursor: "pointer" }}>{"\u21E5"}</span>
        </div>
      </div>
    </aside>
  );
}

// ─── NavBtn (weekly nav arrows) ─────────────────────────────────
interface NavBtnProps {
  direction: "left" | "right";
  onClick?: () => void;
}

export function NavBtn({ direction, onClick }: NavBtnProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 26, height: 26, borderRadius: radii.md,
        background: hovered ? "rgba(255,255,255,0.08)" : "transparent",
        color: hovered ? colors.textSecondary : colors.textFaint,
        border: "none", cursor: "pointer", fontSize: 11,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: transitions.fast,
      }}
      aria-label={direction === "left" ? "Poprzedni" : "Następny"}
    >
      {direction === "left" ? "\u25C0" : "\u25B6"}
    </button>
  );
}

// ─── PageHeader ─────────────────────────────────────────────────
interface PageHeaderProps {
  title: string;
  infoButton?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ title, infoButton, children }: PageHeaderProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.lg,
      marginBottom: spacing["6xl"], animation: "slideDown 0.4s ease both",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
        <h1 style={{
          fontSize: fontSizes["3xl"], fontWeight: fontWeights.extrabold,
          color: colors.textPrimary, fontFamily: fonts.display, letterSpacing: "0.5px", margin: 0,
        }}>{title}</h1>
        {infoButton}
      </div>
      {children && <div style={{ display: "flex", alignItems: "center", gap: spacing.lg, flexWrap: "wrap" }}>{children}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// CONTAINERS
// ═════════════════════════════════════════════════════════════════

// ─── Card ───────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  padding?: string;
  style?: React.CSSProperties;
}

export function Card({ children, padding, style }: CardProps) {
  return (
    <div style={{
      background: colors.bgCard,
      border: `1px solid ${colors.borderDefault}`,
      borderRadius: radii["3xl"],
      padding: padding || `${spacing["6xl"]}px`,
      ...style,
    }}>{children}</div>
  );
}

// ─── CollapsibleCard ────────────────────────────────────────────
interface CollapsibleCardProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge?: React.ReactNode;
  summary?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

export function CollapsibleCard({ title, open, onOpenChange, badge, summary, headerActions, children }: CollapsibleCardProps) {
  return (
    <div style={{
      background: colors.bgCard,
      border: `1px solid ${colors.borderDefault}`,
      borderRadius: radii["3xl"],
      overflow: "hidden",
    }}>
      <div
        onClick={() => onOpenChange(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${spacing["2xl"]}px ${spacing["3xl"]}px`,
          background: "transparent", border: "none", cursor: "pointer",
          transition: transitions.fast,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgSubtle; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: spacing.lg }}>
          <span style={{
            fontSize: fontSizes.xl, fontWeight: fontWeights.semibold,
            color: colors.textPrimary, fontFamily: fonts.display, letterSpacing: "0.3px",
          }}>{title}</span>
          {badge}
          {summary && (
            <span style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>
              {summary}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.lg }} onClick={(e) => e.stopPropagation()}>
          {headerActions}
          <span style={{
            color: colors.textDim, fontSize: fontSizes.lg,
            transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}>{"\u25BC"}</span>
        </div>
      </div>
      <div style={{
        maxHeight: open ? 3000 : 0, overflow: "hidden",
        transition: "max-height 0.25s ease",
      }}>
        <div style={{ padding: `0 ${spacing["3xl"]}px ${spacing["3xl"]}px`, borderTop: open ? `1px solid ${colors.borderLight}` : "none" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── SectionHeader ──────────────────────────────────────────────
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  style?: React.CSSProperties;
}

export function SectionHeader({ title, subtitle, style }: SectionHeaderProps) {
  return (
    <div style={{ marginBottom: spacing.xl, ...style }}>
      <h2 style={{
        margin: 0, fontSize: fontSizes.md, fontWeight: fontWeights.bold,
        color: colors.textSecondary, fontFamily: fonts.display,
        letterSpacing: "0.5px", textTransform: "uppercase",
      }}>{title}</h2>
      {subtitle && (
        <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.textFaint, fontFamily: fonts.body }}>{subtitle}</p>
      )}
    </div>
  );
}

// ─── Modal ──────────────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({ open, onClose, title, width = 560, children, footer }: ModalProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: colors.bgModalBackdrop,
        animation: "backdropIn 0.2s ease both",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width, maxWidth: "90vw", maxHeight: "85vh",
        background: colors.bgElevated,
        border: `1px solid ${colors.borderDefault}`,
        borderRadius: radii["3xl"],
        boxShadow: shadows.modal,
        display: "flex", flexDirection: "column",
        animation: "modalIn 0.25s ease both",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${spacing["5xl"]}px ${spacing["6xl"]}px`,
          borderBottom: `1px solid ${colors.borderDefault}`,
          flexShrink: 0,
        }}>
          <h2 style={{
            fontSize: fontSizes["2xl"], fontWeight: fontWeights.bold,
            color: colors.textPrimary, fontFamily: fonts.display, letterSpacing: "0.3px", margin: 0,
          }}>{title}</h2>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: radii.lg,
            background: colors.bgOverlay, border: `1px solid ${colors.borderMedium}`,
            color: colors.textDim, fontSize: 14, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: transitions.fast,
          }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; (e.currentTarget as HTMLElement).style.color = colors.textSecondary; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgOverlay; (e.currentTarget as HTMLElement).style.color = colors.textDim; }}
          >{"\u2715"}</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: `${spacing["6xl"]}px` }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            display: "flex", justifyContent: "flex-end", gap: spacing.xl,
            padding: `${spacing["3xl"]}px ${spacing["6xl"]}px`,
            borderTop: `1px solid ${colors.borderDefault}`,
            flexShrink: 0,
          }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

// ─── Accordion ──────────────────────────────────────────────────
interface AccordionProps {
  title: string;
  icon?: string;
  iconColor?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  /** Controlled: when provided, open state is controlled by parent */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Accordion({ title, icon, iconColor, badge, defaultOpen = false, open: controlledOpen, onOpenChange, children }: AccordionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setInternalOpen(v);
  };
  return (
    <div style={{
      background: colors.bgCardInner,
      borderRadius: radii["2xl"],
      border: `1px solid ${colors.borderDefault}`,
      overflow: "hidden",
    }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: spacing.lg,
        padding: `${spacing["2xl"]}px ${spacing["3xl"]}px`,
        background: "transparent", border: "none", cursor: "pointer",
        transition: transitions.fast,
      }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgSubtle; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        {icon && (
          <span style={{
            width: 32, height: 32, borderRadius: radii.lg,
            background: iconColor ? `${iconColor}18` : colors.bgOverlay,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, flexShrink: 0,
          }}>{icon}</span>
        )}
        <span style={{
          flex: 1, textAlign: "left", fontSize: fontSizes.md, fontWeight: fontWeights.semibold,
          color: colors.textSecondary, fontFamily: fonts.display, letterSpacing: "0.3px",
        }}>{title}</span>
        {badge && <div style={{ marginRight: spacing.md }}>{badge}</div>}
        <span style={{
          color: colors.textFaint, fontSize: 12,
          transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }}>{"\u25BC"}</span>
      </button>
      <div style={{
        maxHeight: open ? 500 : 0, overflow: "hidden",
        transition: "max-height 0.25s ease",
      }}>
        <div style={{ padding: `0 ${spacing["3xl"]}px ${spacing["3xl"]}px` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// FORM COMPONENTS
// ═════════════════════════════════════════════════════════════════

// ─── TextInput ──────────────────────────────────────────────────
interface TextInputProps {
  label?: string;
  value: string | number;
  onChange: (val: string) => void;
  placeholder?: string;
  unit?: string;
  helperText?: string;
  type?: string;
  style?: React.CSSProperties;
}

export function TextInput({ label, value, onChange, placeholder, unit, helperText, type = "number", style: wrapStyle }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: spacing["5xl"], ...wrapStyle }}>
      {label && <Label>{label}</Label>}
      <div style={{
        display: "flex", alignItems: "center",
        background: colors.bgInput,
        border: `1px solid ${focused ? colors.borderInputFocus : colors.borderInput}`,
        borderRadius: radii.xl, transition: transitions.normal, overflow: "hidden",
      }}>
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "0"}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            flex: 1, padding: `${spacing.xl}px ${spacing["2xl"]}px`,
            background: "transparent", border: "none",
            color: colors.textSecondary, fontSize: fontSizes.md,
            fontFamily: fonts.body, outline: "none",
          }}
        />
        {unit && (
          <span style={{
            padding: `${spacing.xl}px ${spacing["2xl"]}px`, color: colors.textFaint,
            fontSize: 12, fontFamily: fonts.body,
            borderLeft: `1px solid ${colors.borderLight}`,
            background: colors.bgSubtle, fontWeight: fontWeights.medium,
          }}>{unit}</span>
        )}
      </div>
      {helperText && <HelperText>{helperText}</HelperText>}
    </div>
  );
}

// ─── CalculatorInputGrid ────────────────────────────────────────
/** Responsywny grid dla inputów kalkulatora. Na mobile (<768px): 1 kolumna, szersze inputy. */
interface CalculatorInputGridProps {
  columns?: 2 | 3;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function CalculatorInputGrid({ columns = 3, children, style }: CalculatorInputGridProps) {
  const cls = `calculator-input-grid calculator-input-grid--cols-${columns}`;
  return <div className={cls} style={style}>{children}</div>;
}

// ─── SelectDropdown ─────────────────────────────────────────────
interface SelectDropdownProps {
  label?: string;
  value: string;
  options: string[];
  onChange: (val: string) => void;
  helperText?: string;
  width?: number | string;
  placeholder?: string;
}

export function SelectDropdown({ label, value, options, onChange, helperText, width, placeholder = "Wybierz..." }: SelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ marginBottom: label ? spacing["5xl"] : 0, width }}>
      {label && <Label>{label}</Label>}
      <div style={{ position: "relative" }}>
        <button onClick={() => setOpen(!open)} style={{
          width: "100%", padding: `${spacing.xl}px ${spacing["2xl"]}px`,
          background: colors.bgInput, border: `1px solid ${open ? colors.borderInputFocus : colors.borderInput}`,
          borderRadius: radii.xl, color: value ? colors.textSecondary : colors.textFaint,
          fontSize: fontSizes.base, fontFamily: fonts.body, cursor: "pointer",
          transition: transitions.normal, display: "flex", alignItems: "center",
          justifyContent: "space-between", textAlign: "left",
        }}>
          <span>{value || placeholder}</span>
          <span style={{ color: colors.textFaint, fontSize: fontSizes.xs, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}>{"\u25BC"}</span>
        </button>
        {open && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10,
            background: colors.bgElevated, border: `1px solid ${colors.borderHover}`,
            borderRadius: radii.xl, boxShadow: shadows.xl, overflow: "hidden",
            animation: "dropIn 0.15s ease", maxHeight: 240, overflowY: "auto",
          }}>
            {options.map((opt) => (
              <div key={opt} onClick={() => { onChange(opt); setOpen(false); }} style={{
                padding: `${spacing.lg}px ${spacing["2xl"]}px`, fontSize: fontSizes.base,
                color: opt === value ? colors.accentBlue : colors.textMuted,
                fontFamily: fonts.body, cursor: "pointer",
                background: opt === value ? "rgba(59,130,246,0.08)" : "transparent",
                transition: "background 0.1s",
              }}
                onMouseEnter={(e) => { if (opt !== value) (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
                onMouseLeave={(e) => { if (opt !== value) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >{opt}</div>
            ))}
          </div>
        )}
      </div>
      {helperText && <HelperText>{helperText}</HelperText>}
    </div>
  );
}

// ─── Checkbox ───────────────────────────────────────────────────
interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}

export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    <label
      className="touch-friendly-checkbox"
      style={{
        display: "flex", alignItems: "center", gap: spacing.lg,
        padding: `${spacing.lg}px 0`, cursor: "pointer", userSelect: "none",
        minHeight: 44, width: "100%", WebkitTapHighlightColor: "transparent",
      }}
      onClick={() => onChange(!checked)}
    >
      <div style={{
        width: 20, height: 20, borderRadius: 5, flexShrink: 0,
        background: checked ? colors.accentBlue : "transparent",
        border: `2px solid ${checked ? colors.accentBlue : "rgba(255,255,255,0.15)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: transitions.fast, cursor: "pointer",
      }}>
        {checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body, fontWeight: fontWeights.normal }}>{label}</span>
    </label>
  );
}

// ─── ChipToggle ─────────────────────────────────────────────────
interface ChipToggleProps {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  color?: string;
}

export function ChipToggle({ options, value, onChange, color = colors.accentBlue }: ChipToggleProps) {
  return (
    <div style={{
      display: "inline-flex", gap: 2, padding: 3,
      background: colors.bgOverlay, borderRadius: radii.xl,
      border: `1px solid ${colors.borderDefault}`,
    }}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button key={opt} onClick={() => onChange(opt)} style={{
            padding: `${spacing.md}px ${spacing["3xl"]}px`,
            borderRadius: radii.lg, border: "none", cursor: "pointer",
            background: active ? color : "transparent",
            color: active ? "#fff" : colors.textDim,
            fontSize: fontSizes.base, fontWeight: active ? fontWeights.semibold : fontWeights.normal,
            fontFamily: fonts.body, transition: transitions.fast,
            letterSpacing: "0.2px",
          }}
            onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
            onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = colors.textDim; }}
          >{opt}</button>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// DISPLAY COMPONENTS
// ═════════════════════════════════════════════════════════════════

// ─── Label ──────────────────────────────────────────────────────
interface LabelProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Label({ children, style }: LabelProps) {
  return (
    <label style={{
      display: "block", fontSize: fontSizes.base, fontWeight: fontWeights.semibold,
      color: colors.textSecondary, fontFamily: fonts.display,
      letterSpacing: "0.3px", marginBottom: spacing.sm, ...style,
    }}>{children}</label>
  );
}

// ─── HelperText ─────────────────────────────────────────────────
export function HelperText({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body,
      marginTop: spacing.xs, lineHeight: 1.4,
    }}>{children}</p>
  );
}

// ─── Badge ──────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  style?: React.CSSProperties;
}

export function Badge({ children, color = colors.accentBlue, style }: BadgeProps) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: radii.sm,
      background: `${color}15`, color: color,
      fontSize: fontSizes.sm, fontWeight: fontWeights.semibold,
      fontFamily: fonts.body, letterSpacing: "0.2px", whiteSpace: "nowrap",
      ...style,
    }}>{children}</span>
  );
}

// ─── StatusBadge ────────────────────────────────────────────────
type StatusType = "W Trakcie" | "Zaplanowany" | "Ukończony" | "Wstrzymany";

const statusMap: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  "W Trakcie": colors.statusInProgress,
  Zaplanowany: colors.statusPlanned,
  Planowany: colors.statusPlanned,
  "Ukończony": colors.statusDone,
  Wstrzymany: colors.statusPaused,
};

export function StatusBadge({ status }: { status: StatusType | string }) {
  const s = statusMap[status] || colors.statusPlanned;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px 3px 8px", borderRadius: radii.md,
      background: s.bg, border: `1px solid ${s.border}`,
      fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: s.text,
      fontFamily: fonts.body, letterSpacing: "0.2px", lineHeight: 1, whiteSpace: "nowrap",
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: radii.full, background: s.dot,
        flexShrink: 0, boxShadow: shadows.glow(s.dot),
      }} />
      {status}
    </span>
  );
}

// ─── InfoBanner ─────────────────────────────────────────────────
interface InfoBannerProps {
  children: React.ReactNode;
  color?: string;
  icon?: string;
  style?: React.CSSProperties;
}

export function InfoBanner({ children, color = colors.accentBlue, icon, style }: InfoBannerProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: spacing.lg,
      padding: `${spacing.xl}px ${spacing["3xl"]}px`,
      background: `${color}08`, border: `1px solid ${color}20`,
      borderRadius: radii.xl, ...style,
    }}>
      {icon && <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>}
      <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body, lineHeight: 1.4 }}>
        {children}
      </span>
    </div>
  );
}

// ─── SummaryBar ─────────────────────────────────────────────────
interface SummaryItem {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}

export function SummaryBar({ items, style }: { items: SummaryItem[]; style?: React.CSSProperties }) {
  return (
    <div style={{
      display: "flex", gap: spacing["3xl"],
      ...style,
    }}>
      {items.map((item) => (
        <div key={item.label} style={{
          display: "flex", alignItems: "center", gap: spacing.md,
          padding: `${spacing.md}px ${spacing["2xl"]}px`,
          background: colors.bgSubtle,
          border: `1px solid ${colors.borderSubtle}`,
          borderRadius: radii.lg,
        }}>
          {item.color && <span style={{ width: 6, height: 6, borderRadius: radii.full, background: item.color, boxShadow: shadows.glow(item.color), flexShrink: 0 }} />}
          <span style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.extrabold, color: colors.textSecondary, fontFamily: fonts.display, lineHeight: 1 }}>
            {item.value}
          </span>
          {item.unit && <span style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>{item.unit}</span>}
          <span style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── DataTable ──────────────────────────────────────────────────
interface DataTableProps {
  columns: { key: string; label: string; align?: "left" | "center" | "right"; width?: string }[];
  rows: Record<string, React.ReactNode>[];
  footer?: React.ReactNode;
}

export function DataTable({ columns, rows, footer }: DataTableProps) {
  return (
    <div style={{
      background: colors.bgCard, border: `1px solid ${colors.borderDefault}`,
      borderRadius: radii["3xl"], overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: columns.map((c) => c.width || "1fr").join(" "),
        padding: `${spacing.lg}px ${spacing["6xl"]}px`,
        background: colors.bgOverlay,
        borderBottom: `1px solid ${colors.borderLight}`,
      }}>
        {columns.map((col) => (
          <span key={col.key} style={{
            fontSize: fontSizes.xs, fontWeight: fontWeights.bold, color: colors.textFaint,
            fontFamily: fonts.body, letterSpacing: "0.8px", textTransform: "uppercase",
            textAlign: col.align || "left",
          }}>{col.label}</span>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row, i) => (
        <div key={i} style={{
          display: "grid",
          gridTemplateColumns: columns.map((c) => c.width || "1fr").join(" "),
          padding: `${spacing["2xl"]}px ${spacing["6xl"]}px`,
          alignItems: "center",
          background: i % 2 === 0 ? "transparent" : colors.bgTableRowAlt,
          borderBottom: i < rows.length - 1 ? `1px solid ${colors.borderLight}` : "none",
        }}>
          {columns.map((col) => (
            <div key={col.key} style={{ textAlign: col.align || "left" }}>{row[col.key]}</div>
          ))}
        </div>
      ))}

      {/* Footer */}
      {footer && (
        <div style={{
          padding: `${spacing["3xl"]}px ${spacing["6xl"]}px`,
          background: "rgba(59,130,246,0.04)",
          borderTop: `1px solid ${colors.accentBlueBorder}`,
        }}>{footer}</div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// BUTTONS
// ═════════════════════════════════════════════════════════════════

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "secondary" | "ghost" | "accent" | "danger" | "success";
  color?: string;
  fullWidth?: boolean;
  icon?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function Button({ children, onClick, type = "button", variant = "primary", color, fullWidth, icon, disabled, style: custom }: ButtonProps) {
  const [hovered, setHovered] = useState(false);

  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: spacing.md,
    fontFamily: fonts.display, fontWeight: fontWeights.bold, letterSpacing: "0.5px",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: transitions.normal, border: "none",
    width: fullWidth ? "100%" : undefined,
    transform: hovered && !disabled ? "translateY(-1px)" : "none",
    opacity: disabled ? 0.5 : 1,
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: {
      padding: `${spacing["2xl"]}px ${spacing["6xl"]}px`, borderRadius: radii["2xl"],
      background: gradients.bluePrimary, color: colors.textOnAccent, fontSize: fontSizes.lg,
      boxShadow: hovered
        ? `0 0 24px ${accentAlpha(0.5)}, 0 0 12px ${accentAlpha(0.35)}, 0 6px 28px ${accentAlpha(0.4)}`
        : `0 0 18px ${accentAlpha(0.4)}, 0 4px 20px ${accentAlpha(0.3)}`,
    },
    secondary: {
      padding: `${spacing.lg}px ${spacing["6xl"]}px`, borderRadius: radii.lg,
      background: "transparent", border: `1px solid ${hovered ? colors.borderHover : colors.borderInput}`,
      color: hovered ? colors.textSecondary : colors.textSubtle, fontSize: fontSizes.md,
    },
    ghost: {
      padding: `${spacing.md}px ${spacing["2xl"]}px`, borderRadius: radii.lg,
      background: "transparent", color: colors.accentBlue, fontSize: fontSizes.base,
    },
    accent: (() => {
      const isAccentVar = !color || color === colors.accentBlue || (typeof color === "string" && color.startsWith("var(--accent"));
      const bg = color
        ? isAccentVar
          ? (hovered ? accentAlpha(0.28) : accentAlpha(0.18))
          : (hovered ? hexToRgba(color, 0.28) : hexToRgba(color, 0.18))
        : colors.bgOverlay;
      const border = color
        ? isAccentVar
          ? (hovered ? accentAlpha(0.55) : accentAlpha(0.35))
          : (hovered ? hexToRgba(color, 0.55) : hexToRgba(color, 0.35))
        : colors.borderDefault;
      const glowColor = color
        ? isAccentVar
          ? accentAlpha(0.45)
          : (typeof color === "string" && color.startsWith("#")
              ? hexToRgba(color, 0.45)
              : "rgba(255,255,255,0.25)")
        : "transparent";
      const shadow = color
        ? hovered
          ? `0 0 28px ${glowColor}, 0 0 14px ${glowColor}, 0 4px 16px ${glowColor}`
          : `0 0 20px ${glowColor}, 0 4px 14px ${glowColor}`
        : shadows.none;
      return {
        padding: `${spacing.lg}px ${spacing["4xl"]}px`, borderRadius: radii.xl,
        background: bg, border: `1px solid ${border}`,
        color: color || colors.textPrimary, fontSize: fontSizes.base, fontWeight: fontWeights.semibold,
        boxShadow: shadow,
      };
    })(),
    danger: {
      padding: `${spacing["2xl"]}px ${spacing["6xl"]}px`, borderRadius: radii["2xl"],
      background: `linear-gradient(135deg, ${colors.red}, ${colors.redLight})`,
      color: colors.textOnAccent, fontSize: fontSizes.lg,
      boxShadow: hovered ? `0 6px 20px ${hexToRgba("#ef4444", 0.4)}` : `0 4px 12px ${hexToRgba("#ef4444", 0.3)}`,
    },
    success: {
      padding: `${spacing["2xl"]}px ${spacing["6xl"]}px`, borderRadius: radii["2xl"],
      background: `linear-gradient(135deg, ${colors.green}, ${colors.greenLight})`,
      color: colors.textOnAccent, fontSize: fontSizes.lg,
      boxShadow: hovered ? `0 6px 20px ${hexToRgba("#22c55e", 0.4)}` : `0 4px 12px ${hexToRgba("#22c55e", 0.3)}`,
    },
  };

  return (
    <button type={type} onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ ...base, ...variants[variant], ...custom }}
    >
      {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
      {children}
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════
// DASHBOARD / PAGE COMPONENTS
// ═════════════════════════════════════════════════════════════════

// ─── EventCard ──────────────────────────────────────────────────
interface EventCardProps {
  name: string;
  location?: string;
  status?: string;
  tasksCount?: number;
  accentColor?: string;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function EventCard({ name, location, status, tasksCount, accentColor = colors.orange, onClick, children, style: custom }: EventCardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        padding: `${spacing["2xl"]}px ${spacing["3xl"]}px`,
        background: hovered ? colors.bgHover : colors.bgSubtle,
        border: `1px solid ${hovered ? colors.borderHover : colors.borderSubtle}`,
        borderRadius: radii.xl,
        cursor: onClick ? "pointer" : "default",
        transition: transitions.normal,
        transform: hovered ? "translateY(-1px)" : "none",
        boxShadow: hovered ? shadows.cardHover : shadows.none,
        overflow: "hidden",
        ...custom,
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
        background: accentColor, borderRadius: "3px 0 0 3px",
        opacity: hovered ? 1 : 0.5, transition: transitions.normal,
      }} />

      {/* Top row: name + status */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.sm }}>
        <span style={{
          fontSize: fontSizes.md, fontWeight: fontWeights.bold,
          color: colors.textSecondary, fontFamily: fonts.display,
          letterSpacing: "0.3px", lineHeight: 1.2,
        }}>
          {name}
        </span>
        {status && <StatusBadge status={status} />}
      </div>

      {/* Location */}
      {location && (
        <span style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, display: "block", marginBottom: spacing.sm }}>
          {location}
        </span>
      )}

      {/* Tasks count */}
      {tasksCount !== undefined && (
        <span style={{
          display: "flex", alignItems: "center", gap: spacing.xs,
          fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body, fontWeight: fontWeights.medium,
        }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.5 }}>
            <path d="M3 3h10v10H3V3zm2 2v2h2V5H5zm4 0v2h2V5H9zm-4 4v2h2V9H5z" fill={colors.textDim} />
          </svg>
          {tasksCount} zadania
        </span>
      )}

      {/* Optional extra content (expandable sections etc.) */}
      {children}
    </div>
  );
}

// ─── ProjectCard ────────────────────────────────────────────────
interface ProjectCardProps {
  name: string;
  description?: string;
  date: string;
  statusDisplay: string;
  tasksCount: number;
  hours: number;
  tasksLabel: string;
  hoursLabel: string;
  onClick?: () => void;
}

export function ProjectCard({ name, description, date, statusDisplay, tasksCount, hours, tasksLabel, hoursLabel, onClick }: ProjectCardProps) {
  const [hovered, setHovered] = useState(false);
  const s = statusMap[statusDisplay] || colors.statusPlanned;
  const accent = s.dot;
  const progress = tasksCount > 0 ? Math.min(100, Math.round((hours / (tasksCount * 4)) * 100)) : 0;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: hovered ? colors.bgHover : colors.bgSubtle,
        border: `1px solid ${hovered ? colors.borderHover : colors.borderSubtle}`,
        borderRadius: radii["2xl"],
        padding: `${spacing["4xl"]}px ${spacing["5xl"]}px`,
        cursor: onClick ? "pointer" : "default",
        transition: transitions.normal,
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered ? shadows.cardHover : shadows.none,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: spacing.lg,
      }}
    >
      {/* Top accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: layout.accentBarHeight,
        background: `linear-gradient(90deg, ${accent}, transparent)`,
        opacity: hovered ? 0.8 : 0.4,
        transition: transitions.normal,
      }} />

      {/* Name + Status row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md }}>
        <div style={{ flex: 1 }}>
          <h3 style={{
            fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary,
            fontFamily: fonts.display, letterSpacing: "0.3px",
            margin: 0, lineHeight: 1.2,
          }}>
            {name}
          </h3>
          {description && (
            <p style={{
              fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body,
              margin: `${spacing.xs}px 0 0`, lineHeight: 1.3,
            }}>
              {description}
            </p>
          )}
        </div>
        <StatusBadge status={statusDisplay} />
      </div>

      {/* Date */}
      <div style={{
        display: "flex", alignItems: "center", gap: spacing.sm,
        fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body,
      }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.5, flexShrink: 0 }}>
          <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M2 7h12M5 1v4M11 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {date}
      </div>

      {/* Progress bar */}
      <div style={{ display: "flex", alignItems: "center", gap: spacing.md }}>
        <div style={{
          flex: 1, height: 3, background: colors.borderSubtle,
          borderRadius: radii.sm, overflow: "hidden",
        }}>
          <div style={{
            width: `${progress}%`, height: "100%",
            background: accent, borderRadius: radii.sm,
            transition: "width 0.4s ease",
          }} />
        </div>
        <span style={{
          fontSize: fontSizes.xs, color: colors.textDim, fontFamily: fonts.body, fontWeight: fontWeights.semibold,
          minWidth: 28, textAlign: "right",
        }}>
          {progress}%
        </span>
      </div>

      {/* Stats row */}
      <div style={{
        display: "flex", alignItems: "center", gap: spacing["3xl"],
        paddingTop: spacing.sm, borderTop: `1px solid ${colors.borderSubtle}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.4 }}>
            <path d="M3 3h10v10H3V3zm2 2v2h2V5H5zm4 0v2h2V5H9zm-4 4v2h2V9H5z" fill="currentColor" />
          </svg>
          <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>
            {tasksCount} {tasksLabel}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.4 }}>
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>
            {hours.toFixed(2)}{hoursLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── ActionButton ────────────────────────────────────────────────
interface ActionButtonProps {
  label: string;
  color: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

export function ActionButton({ label, color, icon, onClick }: ActionButtonProps) {
  const [hovered, setHovered] = useState(false);
  const hex = color.startsWith("#") ? color : (accentColorsHex as Record<string, string>)[color] || accentColorsHex.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: spacing.sm,
        padding: `${spacing.lg}px ${spacing["4xl"]}px`,
        background: hovered ? hexToRgba(hex, 0.15) : hexToRgba(hex, 0.08),
        border: `1px solid ${hovered ? hexToRgba(hex, 0.5) : hexToRgba(hex, 0.3)}`,
        borderRadius: radii.lg, color: hex,
        fontSize: fontSizes.base, fontWeight: fontWeights.semibold,
        fontFamily: fonts.display, letterSpacing: "0.3px",
        cursor: "pointer", transition: transitions.normal,
        transform: hovered ? "translateY(-1px)" : "none",
        boxShadow: hovered ? `0 4px 16px ${hexToRgba(hex, 0.2)}` : "none",
      }}
    >
      <span style={{ fontSize: fontSizes.md }}>{icon}</span>
      {label}
    </button>
  );
}

// ─── DayColumn ──────────────────────────────────────────────────
interface DayColumnProps {
  dayName: string;
  date: string;
  eventsCount: number;
  eventsLabel: string;
  isToday?: boolean;
  todayLabel?: string;
  onClick?: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function DayColumn({ dayName, date, eventsCount: _eventsCount, eventsLabel, isToday = false, todayLabel = "Dziś", onClick, children, style: custom }: DayColumnProps) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 280, maxWidth: 420,
      display: "flex", flexDirection: "column",
      ...custom,
    }}>
      {/* Header */}
      <div
        onClick={onClick}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${spacing["2xl"]}px ${spacing["3xl"]}px`,
          background: isToday ? gradients.blueSubtle : colors.bgSubtle,
          border: `1px solid ${isToday ? colors.accentBlueBorder : colors.borderSubtle}`,
          borderRadius: `${radii["2xl"]}px ${radii["2xl"]}px 0 0`,
          borderBottom: "none",
          cursor: onClick ? "pointer" : "default",
          transition: transitions.fast,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: spacing.lg }}>
          <div style={{
            width: spacing["8xl"], height: spacing["8xl"], borderRadius: radii.lg,
            background: isToday ? colors.accentBlueBg : colors.bgOverlay,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: fontSizes.md, flexShrink: 0,
          }}>
            {"\uD83D\uDCC5"}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: spacing.md }}>
              <span style={{
                fontSize: fontSizes.xl, fontWeight: fontWeights.extrabold,
                color: isToday ? colors.textSecondary : colors.textMuted,
                fontFamily: fonts.display, letterSpacing: "0.3px", textTransform: "capitalize",
              }}>
                {dayName}
              </span>
              {isToday && (
                <span style={{
                  fontSize: fontSizes.xxs, fontWeight: fontWeights.bold, color: colors.accentBlue,
                  background: colors.accentBlueBg, padding: `${spacing.xs}px ${spacing.sm}px`, borderRadius: radii.sm,
                  fontFamily: fonts.body, letterSpacing: "0.5px", textTransform: "uppercase",
                }}>
                  {todayLabel}
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: colors.textFaint, fontFamily: fonts.body }}>
              {date}
            </span>
          </div>
        </div>
        <span style={{
          fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body, fontWeight: fontWeights.medium,
          background: colors.bgOverlay, padding: `${spacing.xs}px ${spacing.lg}px`, borderRadius: radii.md,
        }}>
          {eventsLabel}
        </span>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        background: colors.bgCard,
        border: `1px solid ${isToday ? colors.accentBlueBorder : colors.borderSubtle}`,
        borderTop: "none",
        borderRadius: `0 0 ${radii["2xl"]}px ${radii["2xl"]}px`,
        padding: 10, display: "flex", flexDirection: "column", gap: 8,
        minHeight: 120,
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── EmptyState ─────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

export function EmptyState({ icon, title, description, action, style: custom }: EmptyStateProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: spacing.md, padding: `${spacing["8xl"]}px ${spacing["6xl"]}px`,
      textAlign: "center", ...custom,
    }}>
      {icon && <span style={{ fontSize: fontSizes["3xl"], opacity: opacity.subtle, marginBottom: spacing.xs }}>{icon}</span>}
      <span style={{
        fontSize: fontSizes.md, color: colors.textFaint, fontFamily: fonts.body, fontWeight: fontWeights.medium,
      }}>
        {title}
      </span>
      {description && (
        <span style={{ fontSize: fontSizes.base, color: colors.textGhost, fontFamily: fonts.body, maxWidth: 280, lineHeight: 1.4 }}>
          {description}
        </span>
      )}
      {action && <div style={{ marginTop: spacing.lg }}>{action}</div>}
    </div>
  );
}

// ─── ExpandableSection ──────────────────────────────────────────
interface ExpandableSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function ExpandableSection({ title, count, defaultOpen = false, children, style: custom }: ExpandableSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: `1px solid ${colors.borderLight}`, ...custom }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${spacing.lg}px 0`, background: "transparent", border: "none",
        cursor: "pointer", transition: transitions.fast,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.md }}>
          <span style={{
            fontSize: fontSizes.base, fontWeight: fontWeights.semibold,
            color: colors.textMuted, fontFamily: fonts.body,
          }}>
            {title}
          </span>
          {count !== undefined && (
            <Badge color={colors.textFaint}>{count}</Badge>
          )}
        </div>
        <span style={{
          fontSize: fontSizes.xs, color: colors.textFaint,
          transition: transitions.normal, transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }}>
          {"\u25BC"}
        </span>
      </button>
      <div style={{
        maxHeight: open ? 1000 : 0, overflow: "hidden",
        transition: "max-height 0.3s ease",
      }}>
        <div style={{ paddingBottom: spacing.xl }}>{children}</div>
      </div>
    </div>
  );
}

// ─── StatCard ───────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  accentGradient?: string;
  style?: React.CSSProperties;
}

export function StatCard({ label, value, unit, accentGradient, style: custom }: StatCardProps) {
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      padding: `${spacing["5xl"]}px ${spacing["4xl"]}px`,
      background: colors.bgCard,
      border: `1px solid ${colors.borderDefault}`,
      borderRadius: radii["3xl"],
      ...custom,
    }}>
      {/* Accent line top */}
      {accentGradient && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: accentGradient, opacity: 0.6,
        }} />
      )}
      <div style={{
        fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body,
        fontWeight: fontWeights.medium, marginBottom: spacing.md,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: spacing.sm }}>
        <span style={{
          fontSize: fontSizes["4xl"], fontWeight: fontWeights.extrabold,
          color: colors.textPrimary, fontFamily: fonts.display,
          letterSpacing: "-0.5px", lineHeight: 1,
        }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Spinner ────────────────────────────────────────────────────
interface SpinnerProps {
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

export function Spinner({ size = 20, color = colors.accentBlue, style: custom }: SpinnerProps) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid ${colors.borderDefault}`,
      borderTopColor: color,
      borderRadius: radii.full,
      animation: "spin 0.6s linear infinite",
      ...custom,
    }} />
  );
}

// ─── BackButton ─────────────────────────────────────────────────
interface BackButtonProps {
  onClick: () => void;
  label?: string;
  style?: React.CSSProperties;
}

export function BackButton({ onClick, label = "Wroc", style: custom }: BackButtonProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: spacing.md,
        padding: `${spacing.md}px ${spacing["2xl"]}px`,
        background: "transparent", border: "none",
        color: hovered ? colors.textSecondary : colors.textDim,
        fontSize: fontSizes.base, fontFamily: fonts.body, fontWeight: fontWeights.medium,
        cursor: "pointer", transition: transitions.fast,
        ...custom,
      }}
    >
      <span style={{ fontSize: 14 }}>{"\u2190"}</span>
      {label}
    </button>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────
interface TabItem {
  key: string;
  label: string;
  icon?: string;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  style?: React.CSSProperties;
}

export function Tabs({ tabs, active, onChange, style: custom }: TabsProps) {
  return (
    <div style={{
      display: "flex", gap: 2, padding: 3,
      background: colors.bgOverlay, borderRadius: radii.xl,
      border: `1px solid ${colors.borderDefault}`,
      ...custom,
    }}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button key={tab.key} onClick={() => onChange(tab.key)} style={{
            display: "flex", alignItems: "center", gap: spacing.sm,
            padding: `${spacing.md}px ${spacing["3xl"]}px`,
            borderRadius: radii.lg, border: "none", cursor: "pointer",
            background: isActive ? colors.accentBlue : "transparent",
            color: isActive ? "#fff" : colors.textDim,
            fontSize: fontSizes.base,
            fontWeight: isActive ? fontWeights.semibold : fontWeights.normal,
            fontFamily: fonts.body, transition: transitions.fast,
          }}
            onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = colors.textDim; }}
          >
            {tab.icon && <span style={{ fontSize: 14 }}>{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && (
              <span style={{
                fontSize: fontSizes.xs, fontWeight: fontWeights.bold,
                background: isActive ? "rgba(255,255,255,0.2)" : colors.bgOverlay,
                color: isActive ? "#fff" : colors.textFaint,
                padding: "1px 6px", borderRadius: radii.sm, lineHeight: 1.3,
              }}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Stepper ────────────────────────────────────────────────────
interface StepperProps {
  steps: string[];
  current: number;
  style?: React.CSSProperties;
}

export function Stepper({ steps, current, style: custom }: StepperProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, ...custom }}>
      {steps.map((step, i) => {
        const isDone = i < current;
        const isActive = i === current;
        const isLast = i === steps.length - 1;
        return (
          <React.Fragment key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: spacing.md }}>
              <div style={{
                width: 28, height: 28, borderRadius: radii.full,
                background: isDone ? colors.accentBlue : isActive ? colors.accentBlueBg : colors.bgOverlay,
                border: `2px solid ${isDone || isActive ? colors.accentBlue : colors.borderMedium}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: fontSizes.sm, fontWeight: fontWeights.bold,
                color: isDone ? "#fff" : isActive ? colors.accentBlue : colors.textFaint,
                fontFamily: fonts.display, transition: transitions.normal,
              }}>
                {isDone ? "\u2713" : i + 1}
              </div>
              <span style={{
                fontSize: fontSizes.base, fontFamily: fonts.body,
                fontWeight: isActive ? fontWeights.semibold : fontWeights.normal,
                color: isActive ? colors.textSecondary : isDone ? colors.textMuted : colors.textFaint,
              }}>
                {step}
              </span>
            </div>
            {!isLast && (
              <div style={{
                flex: 1, height: 2, margin: `0 ${spacing.xl}px`,
                background: isDone ? colors.accentBlue : colors.borderDefault,
                borderRadius: 1, minWidth: 24, transition: transitions.normal,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Tooltip ────────────────────────────────────────────────────
interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({ text, children, position = "top" }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  const posStyles: Record<string, React.CSSProperties> = {
    top: { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    bottom: { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    left: { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
    right: { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
  };

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div style={{
          position: "absolute", ...posStyles[position],
          padding: `${spacing.sm}px ${spacing.lg}px`,
          background: colors.bgElevated,
          border: `1px solid ${colors.borderHover}`,
          borderRadius: radii.lg, boxShadow: shadows.lg,
          fontSize: fontSizes.sm, color: colors.textMuted,
          fontFamily: fonts.body, whiteSpace: "nowrap",
          zIndex: 50, animation: "dropIn 0.1s ease",
          pointerEvents: "none",
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

// ─── NumberInput ─────────────────────────────────────────────────
interface NumberInputProps {
  label?: string;
  value: number | string;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  helperText?: string;
  placeholder?: string;
  style?: React.CSSProperties;
}

export function NumberInput({ label, value, onChange, min, max, step = 1, unit, helperText, placeholder, style: wrapStyle }: NumberInputProps) {
  const [focused, setFocused] = useState(false);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = parseFloat(e.target.value);
    if (!isNaN(num)) {
      if (min !== undefined && num < min) return;
      if (max !== undefined && num > max) return;
      onChange(num);
    } else if (e.target.value === "" || e.target.value === "-") {
      onChange(0);
    }
  };

  return (
    <div style={{ marginBottom: spacing["5xl"], ...wrapStyle }}>
      {label && <Label>{label}</Label>}
      <div style={{
        display: "flex", alignItems: "center",
        background: colors.bgInput,
        border: `1px solid ${focused ? colors.borderInputFocus : colors.borderInput}`,
        borderRadius: radii.xl, transition: transitions.normal, overflow: "hidden",
      }}>
        <input
          type="number" value={value} onChange={handleChange}
          min={min} max={max} step={step}
          placeholder={placeholder || "0"}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            flex: 1, padding: `${spacing.xl}px ${spacing["2xl"]}px`,
            background: "transparent", border: "none",
            color: colors.textSecondary, fontSize: fontSizes.md,
            fontFamily: fonts.body, outline: "none",
            MozAppearance: "textfield",
          }}
        />
        {unit && (
          <span style={{
            padding: `${spacing.xl}px ${spacing["2xl"]}px`, color: colors.textFaint,
            fontSize: 12, fontFamily: fonts.body,
            borderLeft: `1px solid ${colors.borderLight}`,
            background: colors.bgSubtle, fontWeight: fontWeights.medium,
          }}>{unit}</span>
        )}
      </div>
      {helperText && <HelperText>{helperText}</HelperText>}
    </div>
  );
}

// ─── Textarea ───────────────────────────────────────────────────
interface TextareaProps {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  helperText?: string;
  style?: React.CSSProperties;
}

export function Textarea({ label, value, onChange, placeholder, rows = 4, helperText, style: wrapStyle }: TextareaProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: spacing["5xl"], ...wrapStyle }}>
      {label && <Label>{label}</Label>}
      <textarea
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} rows={rows}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: `${spacing.xl}px ${spacing["2xl"]}px`,
          background: colors.bgInput,
          border: `1px solid ${focused ? colors.borderInputFocus : colors.borderInput}`,
          borderRadius: radii.xl, color: colors.textSecondary,
          fontSize: fontSizes.md, fontFamily: fonts.body,
          outline: "none", resize: "vertical", minHeight: 80,
          transition: transitions.normal,
        }}
      />
      {helperText && <HelperText>{helperText}</HelperText>}
    </div>
  );
}

// ─── RadioGroup ─────────────────────────────────────────────────
interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  label?: string;
  options: RadioOption[];
  value: string;
  onChange: (val: string) => void;
  direction?: "row" | "column";
  style?: React.CSSProperties;
}

export function RadioGroup({ label: groupLabel, options, value, onChange, direction = "column", style: wrapStyle }: RadioGroupProps) {
  return (
    <div style={{ marginBottom: spacing["5xl"], ...wrapStyle }}>
      {groupLabel && <Label>{groupLabel}</Label>}
      <div style={{ display: "flex", flexDirection: direction, gap: spacing.md }}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <label key={opt.value} onClick={() => onChange(opt.value)} style={{
              display: "flex", alignItems: "flex-start", gap: spacing.lg,
              padding: `${spacing.lg}px ${spacing.xl}px`,
              minHeight: 44,
              background: selected ? colors.accentBlueBg : "transparent",
              border: `1px solid ${selected ? colors.accentBlue : colors.borderDefault}`,
              borderRadius: radii.lg, cursor: "pointer", transition: transitions.fast,
              WebkitTapHighlightColor: "transparent",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: radii.full, flexShrink: 0, marginTop: 1,
                border: `2px solid ${selected ? colors.accentBlue : colors.borderMedium}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: transitions.fast,
              }}>
                {selected && <div style={{ width: 8, height: 8, borderRadius: radii.full, background: colors.accentBlue }} />}
              </div>
              <div>
                <span style={{
                  fontSize: fontSizes.base, color: selected ? colors.textSecondary : colors.textMuted,
                  fontFamily: fonts.body, fontWeight: selected ? fontWeights.semibold : fontWeights.normal,
                }}>{opt.label}</span>
                {opt.description && (
                  <span style={{ display: "block", fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body, marginTop: 2 }}>
                    {opt.description}
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ─── AlertBanner ────────────────────────────────────────────────
interface AlertBannerProps {
  type?: "error" | "warning" | "info" | "success";
  title?: string;
  children: React.ReactNode;
  icon?: string;
  onClose?: () => void;
  style?: React.CSSProperties;
}

const alertStyles: Record<string, { bg: string; border: string; text: string; iconColor: string }> = {
  error: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", text: colors.redLight, iconColor: colors.red },
  warning: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", text: colors.orangeLight, iconColor: colors.amber },
  info: { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.20)", text: "#60a5fa", iconColor: colors.accentBlue },
  success: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.20)", text: colors.greenLight, iconColor: colors.green },
};

const defaultAlertIcons: Record<string, string> = {
  error: "\u26A0",
  warning: "\u26A0",
  info: "\u2139",
  success: "\u2713",
};

export function AlertBanner({ type = "error", title, children, icon, onClose, style: custom }: AlertBannerProps) {
  const s = alertStyles[type];
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: spacing.xl,
      padding: `${spacing.xl}px ${spacing["3xl"]}px`,
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: radii.xl, ...custom,
    }}>
      <span style={{ fontSize: 16, color: s.iconColor, flexShrink: 0, marginTop: 1 }}>
        {icon || defaultAlertIcons[type]}
      </span>
      <div style={{ flex: 1 }}>
        {title && (
          <div style={{
            fontSize: fontSizes.md, fontWeight: fontWeights.semibold,
            color: s.text, fontFamily: fonts.display, marginBottom: spacing.xs,
          }}>{title}</div>
        )}
        <div style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body, lineHeight: 1.4 }}>
          {children}
        </div>
      </div>
      {onClose && (
        <button onClick={onClose} style={{
          background: "transparent", border: "none", color: colors.textFaint,
          cursor: "pointer", fontSize: 14, padding: spacing.xs, transition: transitions.fast,
        }}>{"\u2715"}</button>
      )}
    </div>
  );
}

// ─── ConfirmDialog ──────────────────────────────────────────────
interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  loading?: boolean;
}

export function ConfirmDialog({ open, onConfirm, onCancel, title, message, confirmLabel = "Potwierdz", cancelLabel = "Anuluj", variant = "default", loading = false }: ConfirmDialogProps) {
  const isDanger = variant === "danger";
  return (
    <Modal open={open} onClose={onCancel} title={title} width={420}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button
            variant={isDanger ? "accent" : "primary"}
            color={isDanger ? colors.red : undefined}
            onClick={onConfirm}
            disabled={loading}
            icon={loading ? undefined : undefined}
          >
            {loading ? <Spinner size={16} color={colors.textOnAccent} /> : confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: fontSizes.md, color: colors.textMuted, fontFamily: fonts.body, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
        {message}
      </p>
    </Modal>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────
interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
  style?: React.CSSProperties;
}

export function Skeleton({ width = "100%", height = 16, borderRadius = radii.lg, style: custom }: SkeletonProps) {
  return (
    <div style={{
      width, height, borderRadius,
      background: `linear-gradient(90deg, ${colors.bgOverlay} 25%, ${colors.bgHover} 50%, ${colors.bgOverlay} 75%)`,
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
      ...custom,
    }} />
  );
}

// ─── Dropdown / Popover ─────────────────────────────────────────
interface DropdownItem {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
  divider?: boolean;
}

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  onSelect: (key: string) => void;
  align?: "left" | "right";
  style?: React.CSSProperties;
}

export function Dropdown({ trigger, items, onSelect, align = "left", style: custom }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", ...custom }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>{trigger}</div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)",
          [align === "right" ? "right" : "left"]: 0,
          minWidth: 180, zIndex: 50,
          background: colors.bgElevated, border: `1px solid ${colors.borderHover}`,
          borderRadius: radii.xl, boxShadow: shadows.xl,
          overflow: "hidden", animation: "dropIn 0.15s ease",
        }}>
          {items.map((item) => {
            if (item.divider) {
              return <div key={item.key} style={{ height: 1, background: colors.borderDefault, margin: `${spacing.xs}px 0` }} />;
            }
            return (
              <button key={item.key}
                onClick={() => { onSelect(item.key); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: spacing.md,
                  padding: `${spacing.lg}px ${spacing["2xl"]}px`,
                  background: "transparent", border: "none", cursor: "pointer",
                  fontSize: fontSizes.base, fontFamily: fonts.body,
                  color: item.danger ? colors.red : colors.textMuted,
                  transition: "background 0.1s", textAlign: "left",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = item.danger ? "rgba(239,68,68,0.08)" : colors.bgHover; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {item.icon && <span style={{ fontSize: 14 }}>{item.icon}</span>}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── PageInfoModal ──────────────────────────────────────────────
interface PageInfoModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  features?: { icon: string; title: string; description: string }[];
}

export function PageInfoModal({ open, onClose, title, description, features }: PageInfoModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={500}>
      <p style={{ fontSize: fontSizes.md, color: colors.textMuted, fontFamily: fonts.body, lineHeight: 1.6, marginBottom: spacing["6xl"] }}>
        {description}
      </p>
      {features && features.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.xl }}>
          {features.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: spacing.xl, alignItems: "flex-start" }}>
              <span style={{
                width: 32, height: 32, borderRadius: radii.lg,
                background: colors.accentBlueBg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0,
              }}>{f.icon}</span>
              <div>
                <div style={{
                  fontSize: fontSizes.md, fontWeight: fontWeights.semibold,
                  color: colors.textSecondary, fontFamily: fonts.display, marginBottom: spacing.xs,
                }}>{f.title}</div>
                <div style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, lineHeight: 1.4 }}>
                  {f.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}