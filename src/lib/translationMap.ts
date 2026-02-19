/**
 * Translation Map for Task Names
 * Maps hardcoded task names to translation keys
 * This ensures consistent translation across all calculators
 */

export const taskNameTranslationMap: Record<string, string> = {
  // Tile Installation tasks
  'transport tiles': 'calculator:task_transport_tiles',
  'transport adhesive': 'calculator:task_transport_adhesive',

  // Slab Calculator tasks
  'transport slabs': 'calculator:task_transport_slabs',
  'transport sand': 'calculator:task_transport_sand',
  'transport cement': 'calculator:task_transport_cement',
  'Primer coating (slab backs)': 'calculator:task_primer_coating_slab_backs',
  'Primer coating (frame backs)': 'calculator:task_primer_coating_frame_backs',
  'Soil excavation': 'calculator:task_soil_excavation',
  'Loading tape1': 'calculator:task_loading_tape1',
  'Loading sand': 'calculator:task_loading_sand',
  'transport frame slabs': 'calculator:task_transport_frame_slabs',
  'final leveling (type 1)': 'calculator:task_final_leveling_type_1',
  'mixing mortar': 'calculator:task_mixing_mortar',

  // Wall Calculator tasks
  'transport sleepers': 'calculator:task_transport_sleepers',
  'transport posts': 'calculator:task_transport_posts',
  'transport postmix': 'calculator:task_transport_postmix',
  'transport bricks': 'calculator:task_transport_bricks',
  'transport blocks': 'calculator:task_transport_blocks',
  'preparing for the wall (leveling)': 'calculator:task_preparing_for_wall',

  // Paving Calculator tasks
  'laying monoblocks': 'calculator:task_laying_monoblocks',
  'transport monoblocks': 'calculator:task_transport_monoblocks',
  'sand screeding': 'calculator:task_sand_screeding',
  'compacting monoblocks': 'calculator:task_compacting_monoblocks',
  'final leveling (sand)': 'calculator:task_final_leveling_sand',
  'cutting blocks': 'calculator:task_cutting_blocks',

  // Artificial Grass Calculator tasks
  'Laying Artificial Grass': 'calculator:task_laying_artificial_grass',
  'jointing artificial grass': 'calculator:task_jointing_artificial_grass',
  'trimming edges (artificial grass)': 'calculator:task_trimming_edges_artificial_grass',

  // Deck Calculator tasks
  'transport decking boards': 'calculator:task_transport_decking_boards',
  'transport joists': 'calculator:task_transport_joists',
  'transport bearers': 'calculator:task_transport_bearers',

  // Foundation Calculator tasks
  'Foundation Excavation': 'calculator:task_foundation_excavation',
  'transport soil': 'calculator:task_transport_soil',

  // Soil Excavation Calculator tasks
  'Excavation': 'calculator:task_excavation',
  'Transport': 'calculator:task_transport',

  // Coping Installation Calculator tasks
  'transport coping': 'calculator:task_transport_coping',

  // Composite Fence Calculator tasks
  'Composite Fence Installation': 'calculator:task_composite_fence_installation',
  'transport slats': 'calculator:task_transport_slats',

  // Venetian Fence Calculator tasks
  'Venetian Fence Installation': 'calculator:task_venetian_fence_installation',
};

/**
 * Translates a task name using the translation map
 * Falls back to the original task name if no translation key is found
 * @param taskName - The hardcoded task name
 * @param t - The i18n translation function
 * @returns The translated task name or the original if not found
 */
export const translateTaskName = (
  taskName: string | undefined,
  t: (key: string) => string
): string => {
  if (!taskName) return '';

  // Look up the translation key in the map
  const translationKey = taskNameTranslationMap[taskName];

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
  for (const [key, value] of Object.entries(taskNameTranslationMap)) {
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

/**
 * Translation Map for Material Names
 * Maps hardcoded material names to translation keys
 * This ensures consistent translation across all parts of the app
 */
export const materialNameTranslationMap: Record<string, string> = {
  // Common materials
  'Sleeper': 'material:sleeper',
  'Post': 'material:post',
  'Postmix': 'material:postmix',
  'Mortar': 'material:mortar',
  'Cement': 'material:cement',
  'Sand': 'material:sand',
  'Bricks': 'material:bricks',
  'Blocks': 'material:blocks',
  'Slabs': 'material:slabs',
  'Gravel': 'material:gravel',
  'Soil': 'material:soil',
  'Adhesive': 'material:adhesive',
  'Paint': 'material:paint',
  'Wood': 'material:wood',
  'Composite': 'material:composite',
  'Metal': 'material:metal',
  'Plastic': 'material:plastic',
  'Glass': 'material:glass',
  'Stone': 'material:stone',
  'Concrete': 'material:concrete',
  'Asphalt': 'material:asphalt',
  'Tiles': 'material:tiles',
  'Paving': 'material:paving',
  'Grass': 'material:grass',
};

/**
 * Translates a material name using the translation map
 * Falls back to the original material name if no translation key is found
 * @param materialName - The hardcoded material name
 * @param t - The i18n translation function
 * @returns The translated material name or the original if not found
 */
export const translateMaterialName = (
  materialName: string | undefined,
  t: (key: string) => string
): string => {
  if (!materialName) return '';

  // Look up the translation key in the map
  const translationKey = materialNameTranslationMap[materialName];

  if (!translationKey) {
    // If no mapping found, return the original material name
    console.warn(`No translation key found for material: "${materialName}"`);
    return materialName;
  }

  // Translate using the key
  const translated = t(translationKey);

  // If translation key wasn't found (returns the key itself), return original
  if (translated === translationKey) {
    console.warn(`Translation key not found in i18n: "${translationKey}"`);
    return materialName;
  }

  return translated;
};
