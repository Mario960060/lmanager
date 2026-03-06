/**
 * EXAMPLE DESIGN SYSTEM COMPONENT
 *
 * Pokazuje jak używać design systemu (designTokens + uiComponents).
 * Możesz go usunąć po zapoznaniu się z systemem.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { colors, fontSizes, fontWeights, spacing, radii } from '../themes/designTokens';
import { Card, Button, Badge } from '../themes/uiComponents';

interface ExampleCardProps {
  title: string;
  description: string;
  status?: 'success' | 'warning' | 'error' | 'info';
}

const statusColors: Record<string, { bg: string; border: string; text: string }> = {
  success: { bg: colors.statusDone.bg, border: colors.statusDone.border, text: colors.statusDone.text },
  warning: { bg: colors.statusInProgress.bg, border: colors.statusInProgress.border, text: colors.statusInProgress.text },
  error: { bg: colors.statusPaused.bg, border: colors.statusPaused.border, text: colors.statusPaused.text },
  info: { bg: colors.statusPlanned.bg, border: colors.statusPlanned.border, text: colors.statusPlanned.text },
};

export const ExampleThemeCard: React.FC<ExampleCardProps> = ({
  title,
  description,
  status = 'info',
}) => {
  const { t } = useTranslation(['common']);
  const s = statusColors[status];

  return (
    <Card padding={`${spacing.xl}px`}>
      <h2
        style={{
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.bold,
          marginBottom: spacing.lg,
          color: colors.textPrimary,
        }}
      >
        {title}
      </h2>

      <p
        style={{
          marginBottom: spacing.xl,
          color: colors.textSecondary,
          fontSize: fontSizes.md,
        }}
      >
        {description}
      </p>

      {status && (
        <Badge
          label={`Status: ${status.toUpperCase()}`}
          style={{
            marginBottom: spacing.lg,
            background: s.bg,
            border: `1px solid ${s.border}`,
            color: s.text,
          }}
        >
          Status: {status.toUpperCase()}
        </Badge>
      )}

      <div style={{ display: 'flex', gap: spacing.lg, marginTop: spacing.xl }}>
        <Button variant="primary">{t('common:primary_action')}</Button>
        <Button variant="secondary">{t('common:secondary_action')}</Button>
      </div>

      <div
        style={{
          marginTop: spacing.xl,
          padding: spacing.lg,
          backgroundColor: colors.bgCardInner,
          borderRadius: radii.lg,
          borderLeft: `4px solid ${colors.accentBlue}`,
          color: colors.textMuted,
          fontSize: fontSizes.sm,
        }}
      >
        {t('common:theme_component_info')}
      </div>
    </Card>
  );
};

export default ExampleThemeCard;
