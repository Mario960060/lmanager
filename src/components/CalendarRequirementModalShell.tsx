import React, { ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  gradients,
  radii,
  shadows,
  spacing,
  transitions,
  accentAlpha,
} from '../themes/designTokens';

const shellClass = 'crm-requirement-modal';

export interface CalendarRequirementModalShellProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * Shared layout for calendar “require material / equipment / tools” modals.
 * Styling uses design tokens (CSS variables) so it follows the active theme.
 */
export const CalendarRequirementModalShell: React.FC<CalendarRequirementModalShellProps> = ({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
}) => {
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[1100] flex items-center justify-center p-0 md:p-4"
      style={{
        background: colors.bgModalBackdrop,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        fontFamily: fonts.body,
      }}
      onClick={onClose}
    >
      <style>{`
        .${shellClass} input:focus,
        .${shellClass} textarea:focus {
          border-color: var(--border-input-focus) !important;
          box-shadow: 0 0 0 3px rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.12);
        }
        .${shellClass} input::placeholder,
        .${shellClass} textarea::placeholder {
          color: var(--text-muted);
        }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        className={shellClass}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 92vw)',
          maxHeight: '88vh',
          background: colors.bgElevated,
          borderRadius: 16,
          border: `1px solid ${colors.borderDefault}`,
          boxShadow: shadows.modal,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          style={{
            padding: `${spacing['6xl']}px ${spacing['7xl']}px ${spacing['5xl']}px`,
            borderBottom: `1px solid ${colors.borderDefault}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radii.lg,
                  background: accentAlpha(0.12),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: colors.accentBlue,
                }}
              >
                {icon}
              </div>
              <h2
                style={{
                  margin: 0,
                  fontSize: fontSizes.xl + 2,
                  fontWeight: fontWeights.bold,
                  color: colors.textPrimary,
                  letterSpacing: '-0.3px',
                  lineHeight: 1.25,
                }}
              >
                {title}
              </h2>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: fontSizes.md,
                color: colors.textMuted,
                paddingLeft: 46,
              }}
            >
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.textMuted,
              cursor: 'pointer',
              padding: 4,
              borderRadius: radii.md,
              display: 'flex',
              transition: transitions.normal,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = colors.textPrimary;
              e.currentTarget.style.background = colors.bgHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = colors.textMuted;
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: `${spacing['5xl']}px ${spacing['7xl']}px ${spacing['6xl']}px`,
          }}
        >
          {children}
        </div>

        <div
          style={{
            padding: `${spacing['3xl']}px ${spacing['7xl']}px ${spacing['5xl']}px`,
            borderTop: `1px solid ${colors.borderDefault}`,
            flexShrink: 0,
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
};

/** Ghost + primary actions aligned like the reference UI */
export const CalendarRequirementModalFooterActions: React.FC<{
  onClose: () => void;
  closeLabel: string;
  primaryLabel: string;
  primaryIcon?: ReactNode;
  onPrimary: () => void;
  primaryDisabled?: boolean;
}> = ({
  onClose,
  closeLabel,
  primaryLabel,
  primaryIcon,
  onPrimary,
  primaryDisabled,
}) => {
  const disabled = primaryDisabled;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '11px 22px',
          background: 'transparent',
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: radii.lg,
          color: colors.textSecondary,
          fontSize: fontSizes.md,
          fontWeight: fontWeights.medium,
          fontFamily: fonts.body,
          cursor: 'pointer',
          transition: transitions.normal,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = colors.textMuted;
          e.currentTarget.style.color = colors.textPrimary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = colors.borderDefault;
          e.currentTarget.style.color = colors.textSecondary;
        }}
      >
        {closeLabel}
      </button>
      <button
        type="button"
        onClick={onPrimary}
        disabled={disabled}
        style={{
          padding: '11px 28px',
          background: disabled ? colors.bgHover : gradients.bluePrimary,
          border: 'none',
          borderRadius: radii.lg,
          color: disabled ? colors.textMuted : colors.textOnAccent,
          fontSize: fontSizes.md,
          fontWeight: fontWeights.semibold,
          fontFamily: fonts.body,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: transitions.normal,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          letterSpacing: '0.2px',
          boxShadow: disabled ? 'none' : shadows.blue,
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.filter = 'brightness(1.08)';
            e.currentTarget.style.boxShadow = shadows.blueHover;
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.filter = 'none';
            e.currentTarget.style.boxShadow = shadows.blue;
          }
        }}
      >
        {primaryIcon}
        {primaryLabel}
      </button>
    </div>
  );
};
