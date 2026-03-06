import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// Preload ALL namespaces to avoid HTTP loading issues (keys showing as literals)
import enCommon from '../locales/en/common.json';
import enCalculator from '../locales/en/calculator.json';
import enNav from '../locales/en/nav.json';
import enProject from '../locales/en/project.json';
import enForm from '../locales/en/form.json';
import enDashboard from '../locales/en/dashboard.json';
import enUtilities from '../locales/en/utilities.json';
import enEvent from '../locales/en/event.json';
import enPlan from '../locales/en/plan.json';
import enMaterial from '../locales/en/material.json';
import enUnits from '../locales/en/units.json';
import plCommon from '../locales/pl/common.json';
import plCalculator from '../locales/pl/calculator.json';
import plNav from '../locales/pl/nav.json';
import plProject from '../locales/pl/project.json';
import plForm from '../locales/pl/form.json';
import plDashboard from '../locales/pl/dashboard.json';
import plUtilities from '../locales/pl/utilities.json';
import plEvent from '../locales/pl/event.json';
import plPlan from '../locales/pl/plan.json';
import plMaterial from '../locales/pl/material.json';
import plUnits from '../locales/pl/units.json';

/**
 * i18next Configuration
 * Handles internationalization (i18n) for English and Polish
 */

const baseUrl = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';

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

    react: {
      useSuspense: true, // Wait for namespace to load before rendering – fixes keys showing as literals
    },

    // Preloaded resources – all namespaces bundled to avoid HTTP loading (fixes "keys as literals" bug)
    resources: {
      en: {
        common: enCommon as Record<string, string>,
        calculator: enCalculator as Record<string, string>,
        nav: enNav as Record<string, string>,
        project: enProject as Record<string, string>,
        form: enForm as Record<string, string>,
        dashboard: enDashboard as Record<string, string>,
        utilities: enUtilities as Record<string, string>,
        event: enEvent as Record<string, string>,
        plan: enPlan as Record<string, string>,
        material: enMaterial as Record<string, string>,
        units: enUnits as Record<string, string>,
      },
      pl: {
        common: plCommon as Record<string, string>,
        calculator: plCalculator as Record<string, string>,
        nav: plNav as Record<string, string>,
        project: plProject as Record<string, string>,
        form: plForm as Record<string, string>,
        dashboard: plDashboard as Record<string, string>,
        utilities: plUtilities as Record<string, string>,
        event: plEvent as Record<string, string>,
        plan: plPlan as Record<string, string>,
        material: plMaterial as Record<string, string>,
        units: plUnits as Record<string, string>,
      },
    },

    backend: {
      loadPath: `${(baseUrl.replace(/\/$/, '') || '/')}/locales/{{lng}}/{{ns}}.json`,
    },

    ns: ['common', 'nav', 'calculator', 'project', 'form', 'dashboard', 'utilities', 'event', 'plan', 'material', 'units'],
    defaultNS: 'common',

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
