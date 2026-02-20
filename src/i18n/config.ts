import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

/**
 * i18next Configuration
 * Handles internationalization (i18n) for English and Polish
 */

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'pl'],
    load: 'languageOnly', // Use 'en' instead of 'en-US' etc. - we only have en/ and pl/ folders
    debug: false,
    showSupportNotice: false,

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },

    ns: ['common', 'nav', 'calculator', 'project', 'form', 'dashboard', 'utilities', 'event', 'plan', 'material'],
    defaultNS: 'common',

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
