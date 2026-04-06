import { taskNameTranslationMap } from './translationMapTaskNames';

/** Dynamic task patterns for excavator/carrier tasks - translation only in UI, data stays unchanged */
const DYNAMIC_TASK_PATTERNS: Array<{
  regex: RegExp;
  key: string;
  extractParams: (m: RegExpMatchArray) => Record<string, string>;
}> = [
  {
    regex: /^Coping installation (\d+) × (\d+)$/i,
    key: 'calculator:task_coping_installation_dimensions',
    extractParams: (m) => ({ width: m[1], height: m[2] }),
  },
  {
    regex: /^Tile Installation (\d+) × (\d+)$/,
    key: 'calculator:task_tile_installation_dimensions',
    extractParams: (m) => ({ width: m[1], height: m[2] }),
  },
  {
    regex: /^Excavation soil with (.+?) \((\d+(?:\.\d+)?)t\)$/,
    key: 'calculator:task_excavation_soil_with_excavator',
    extractParams: (m) => ({ excavatorName: m[1], size: m[2] }),
  },
  {
    regex: /^Loading tape1 with (.+?) \((\d+(?:\.\d+)?)t\)$/,
    key: 'calculator:task_loading_tape1_with_excavator',
    extractParams: (m) => ({ excavatorName: m[1], size: m[2] }),
  },
  {
    regex: /^Transporting soil with (.+?) \((\d+(?:\.\d+)?)t\) - (\d+(?:\.\d+)?)m$/,
    key: 'calculator:task_transporting_soil_with_carrier',
    extractParams: (m) => ({ carrierName: m[1], size: m[2], distance: m[3] }),
  },
  {
    regex: /^Transporting Type 1 with (.+?) \((\d+(?:\.\d+)?)t\) - (\d+(?:\.\d+)?)m$/,
    key: 'calculator:task_transporting_tape1_with_carrier',
    extractParams: (m) => ({ carrierName: m[1], size: m[2], distance: m[3] }),
  },
  {
    regex: /^Transporting tape1 with (.+?) \((\d+(?:\.\d+)?)t\) - (\d+(?:\.\d+)?)m$/,
    key: 'calculator:task_transporting_tape1_with_carrier',
    extractParams: (m) => ({ carrierName: m[1], size: m[2], distance: m[3] }),
  },
  {
    regex: /^Transporting soil \((\d+(?:\.\d+)?)m\)$/,
    key: 'calculator:transporting_soil_task',
    extractParams: (m) => ({ distance: m[1] }),
  },
  {
    regex: /^Transporting tape1 \((\d+(?:\.\d+)?)m\)$/,
    key: 'calculator:transporting_tape1_task',
    extractParams: (m) => ({ distance: m[1] }),
  },
  {
    regex: /^Transporting decorative stones \((\d+(?:\.\d+)?)m\)$/,
    key: 'calculator:transporting_decorative_stones_task',
    extractParams: (m) => ({ distance: m[1] }),
  },
  {
    regex: /^Excavation soil with (.+?) and (.+?) (\d+(?:\.\d+)?)t$/,
    key: 'calculator:task_excavation_soil_with_excavator_and_carrier',
    extractParams: (m) => ({ excavatorName: m[1], carrierName: m[2], carrierSize: m[3] }),
  },
  {
    regex: /^Preparation with (.+?) and (.+?) (\d+(?:\.\d+)?)t$/,
    key: 'calculator:task_preparation_with_excavator_and_carrier',
    extractParams: (m) => ({ excavatorName: m[1], carrierName: m[2], carrierSize: m[3] }),
  },
  {
    regex: /^Load-in and compacting sand with (.+?) and (.+?) (\d+(?:\.\d+)?)t$/,
    key: 'calculator:task_load_in_compacting_sand_with_excavator_and_carrier',
    extractParams: (m) => ({ excavatorName: m[1], carrierName: m[2], carrierSize: m[3] }),
  },
  {
    regex: /^Loading Sand with (.+)$/,
    key: 'calculator:task_loading_sand_with_excavator',
    extractParams: (m) => ({ excavatorName: m[1] }),
  },
];

/**
 * Translates a task name using the translation map
 * Falls back to the original task name if no translation key is found
 * Translation is UI-only; stored task names in DB/functions remain unchanged
 * @param taskName - The hardcoded task name
 * @param t - The i18n translation function (supports t(key, options) for interpolation)
 * @returns The translated task name or the original if not found
 */
export const translateTaskName = (
  taskName: string | undefined,
  t: (key: string, options?: Record<string, string>) => string
): string => {
  if (!taskName) return '';

  // Handle "(N) taskname" format (e.g. "(5) cutting blocks")
  const countMatch = taskName.match(/^\((\d+)\) (.+)$/);
  if (countMatch) {
    const count = countMatch[1];
    const baseName = countMatch[2];
    const baseKey = taskNameTranslationMap[baseName];
    if (baseKey) {
      const translatedBase = t(baseKey);
      if (translatedBase !== baseKey) return `(${count}) ${translatedBase}`;
    }
    return taskName;
  }

  // Dynamic excavator/carrier patterns (UI translation only)
  for (const { regex, key, extractParams } of DYNAMIC_TASK_PATTERNS) {
    const match = taskName.match(regex);
    if (match) {
      const params = extractParams(match);
      const translated = t(key, params);
      if (translated !== key) return translated;
      break;
    }
  }

  // Cavity wall inner leaf: template name + localized suffix (EN "inner leaf" / PL "druga warstwa")
  const innerLeafMatch = taskName.match(/^(.+) \((inner leaf|druga warstwa)\)$/i);
  if (innerLeafMatch) {
    const baseName = innerLeafMatch[1];
    const translatedBase = translateTaskName(baseName, t);
    const suffix = t('calculator:inner_leaf_task_suffix');
    return `${translatedBase} (${suffix})`;
  }

  // Look up the translation key in the map (exact match first, then case-insensitive)
  let translationKey: string | undefined = taskNameTranslationMap[taskName];
  if (!translationKey && taskName) {
    const lowerTask = taskName.toLowerCase();
    const found = Object.entries(taskNameTranslationMap).find(([key]) => key.toLowerCase() === lowerTask);
    translationKey = found?.[1] ?? undefined;
  }

  if (!translationKey) {
    // If no mapping found, return the original task name
    console.warn(`No translation key found for task: "${taskName}"`);
    return taskName;
  }

  // Translate using the key
  const translated = t(translationKey);

  // If translation key wasn't found (returns the key itself), return original
  if (translated === translationKey) {
    console.warn(`Translation key not found in i18n: "${translationKey}"`);
    return taskName;
  }

  return translated;
};

/**
 * Normalizes a task name to be case-insensitive for matching
 * Used to handle variants like "Soil excavation" vs "soil excavation"
 */
export const normalizeTaskName = (taskName: string): string => {
  // First try exact match
  if (taskNameTranslationMap[taskName]) {
    return taskName;
  }

  // Try case-insensitive match
  const lowerTaskName = taskName.toLowerCase();
  for (const [key] of Object.entries(taskNameTranslationMap)) {
    if (key.toLowerCase() === lowerTaskName) {
      return key;
    }
  }

  // Return original if no match found
  return taskName;
};

/**
 * Translates task breakdown array
 * @param taskBreakdown - Array of task objects with 'task' property
 * @param t - The i18n translation function
 * @returns Array with translated task names
 */
export const translateTaskBreakdown = (
  taskBreakdown: any[],
  t: (key: string) => string
): any[] => {
  return taskBreakdown.map(item => ({
    ...item,
    displayTask: translateTaskName(item.task, t),
  }));
};
