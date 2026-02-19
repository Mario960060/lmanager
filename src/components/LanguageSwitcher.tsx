import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

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
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
      >
        <Globe className="w-4 h-4 mr-2" />
        <span>{currentLang.name}</span>
      </button>

      {showDropdown && (
        <div className="absolute bottom-full right-0 mb-2 w-40 bg-white dark:bg-gray-700 rounded-lg shadow-lg z-50 border border-gray-200 dark:border-gray-600">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                i18n.changeLanguage(lang.code);
                setShowDropdown(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                i18n.language === lang.code
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              <span>{lang.name}</span>
              {i18n.language === lang.code && <span className="ml-auto">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
