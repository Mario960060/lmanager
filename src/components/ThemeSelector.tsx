import React from 'react';
import { useTheme } from '../themes/ThemeContext';
import { useTranslation } from 'react-i18next';

/**
 * Theme Selector Component
 * 
 * Umieszcz gdzieś w Settings/Profile/Navigation
 * Pozwala użytkownikowi wybrać temat
 */
export const ThemeSelector: React.FC = () => {
  const { t } = useTranslation(['common']);
  const { currentTheme, setTheme, availableThemes } = useTheme();

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">{t('common:theme')}</label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {availableThemes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => setTheme(theme.id)}
            className={`p-3 rounded-lg border-2 transition-all ${
              currentTheme.id === theme.id
                ? 'border-green-500 ring-2 ring-green-500 ring-offset-2'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            style={{
              backgroundColor: theme.colors.bgPrimary,
            }}
            title={theme.displayName}
          >
            <div className="text-center">
              <div className="text-2xl mb-1">{theme.icon}</div>
              <div className="text-xs font-medium text-gray-600 truncate">
                {theme.displayName}
              </div>
              {/* Color preview circles */}
              <div className="flex gap-1 justify-center mt-2">
                <div
                  className="w-3 h-3 rounded-full border border-gray-400"
                  style={{ backgroundColor: theme.colors.primary }}
                />
                <div
                  className="w-3 h-3 rounded-full border border-gray-400"
                  style={{ backgroundColor: theme.colors.secondary }}
                />
                <div
                  className="w-3 h-3 rounded-full border border-gray-400"
                  style={{ backgroundColor: theme.colors.success }}
                />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ThemeSelector;
