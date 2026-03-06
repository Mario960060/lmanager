import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { colors, spacing, radii, fontSizes, fontWeights, shadows } from '../themes/designTokens';

/**
 * Language Switcher Component
 * Allows users to switch between EN and PL
 */
export const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation(['common']);
  const [showDropdown, setShowDropdown] = React.useState(false);

  const languages = [
    { code: 'en', name: t('common:english') },
    { code: 'pl', name: t('common:polish') },
  ];

  const currentLang = languages.find((lang) => lang.code === i18n.language) || languages[0];

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          display: 'flex', alignItems: 'center', padding: `${spacing.sm}px ${spacing.md}px`,
          fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textPrimary,
          background: 'transparent', border: 'none', borderRadius: radii.lg, cursor: 'pointer',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <Globe style={{ width: 16, height: 16, marginRight: spacing.sm }} />
        <span>{currentLang.name}</span>
      </button>

      {showDropdown && (
        <div
          style={{
            position: 'absolute', bottom: '100%', right: 0, marginBottom: spacing.sm,
            width: 160, zIndex: 50,
            background: colors.bgElevated,
            border: `1px solid ${colors.borderDefault}`,
            borderRadius: radii.lg,
            boxShadow: shadows.xl,
            overflow: 'hidden',
          }}
        >
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                i18n.changeLanguage(lang.code);
                setShowDropdown(false);
              }}
              style={{
                width: '100%', textAlign: 'left', padding: `${spacing.md}px ${spacing.lg}px`,
                fontSize: fontSizes.sm, display: 'flex', alignItems: 'center', gap: spacing.sm,
                background: i18n.language === lang.code ? colors.accentBlueBg : 'transparent',
                color: i18n.language === lang.code ? colors.textPrimary : colors.textMuted,
                fontWeight: i18n.language === lang.code ? fontWeights.medium : fontWeights.normal,
                border: 'none', cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                if (i18n.language !== lang.code) {
                  (e.currentTarget as HTMLElement).style.background = colors.bgHover;
                  (e.currentTarget as HTMLElement).style.color = colors.textPrimary;
                }
              }}
              onMouseLeave={(e) => {
                if (i18n.language !== lang.code) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = colors.textMuted;
                }
              }}
            >
              <span>{lang.name}</span>
              {i18n.language === lang.code && <span style={{ marginLeft: 'auto', color: colors.accentBlue }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
