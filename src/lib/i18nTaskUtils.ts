/**
 * Re-exports task/unit translation helpers.
 * Task-name helpers come from taskNameTranslate (small module) to avoid Vite dev/HMR issues
 * with the large translationMap bundle.
 */
export {
  translateTaskName,
  translateTaskBreakdown,
  normalizeTaskName,
} from './taskNameTranslate';
export {
  translateUnit,
  translateMaterialName,
  translateMaterialDescription,
  translateTaskDescription,
} from './translationMap';
