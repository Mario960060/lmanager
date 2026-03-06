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
  'laying monoblocks (frame)': 'calculator:task_laying_monoblocks_frame',
  'transport monoblocks': 'calculator:task_transport_monoblocks',
  'sand screeding': 'calculator:task_sand_screeding',
  'compacting monoblocks': 'calculator:task_compacting_monoblocks',
  'final leveling (sand)': 'calculator:task_final_leveling_sand',
  'final leveling (soil)': 'calculator:task_final_leveling_soil',
  'cutting blocks': 'calculator:task_cutting_blocks',

  // Artificial Grass Calculator tasks
  'Laying Artificial Grass': 'calculator:task_laying_artificial_grass',
  'Laying Natural Turf': 'calculator:task_laying_natural_turf',
  'Loading soil': 'calculator:task_loading_soil',
  'transport turf rolls': 'calculator:task_transport_turf_rolls',
  'transport tape1': 'calculator:task_transport_tape1',
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

  // Concrete Slabs Calculator tasks
  'transport concrete slabs': 'calculator:task_transport_concrete_slabs',

  // Grouting (TileInstallation, Slab, Coping)
  'Grouting': 'calculator:task_grouting',

  // Slab Calculator tasks
  'Frame cutting': 'calculator:task_frame_cutting',

  // Fence Calculator tasks
  'Vertical Fence Installation': 'calculator:task_vertical_fence_installation',
  'Horizontal Fence Installation': 'calculator:task_horizontal_fence_installation',

  // Concrete Slabs / Slab Calculator tasks (dynamic sizes)
  'laying slabs 40x40 (concrete)': 'calculator:task_laying_slabs_concrete_40x40',
  'laying slabs 60x60 (concrete)': 'calculator:task_laying_slabs_concrete_60x60',
  'laying slabs 90x60 (concrete)': 'calculator:task_laying_slabs_concrete_90x60',

  // Porcelain slab tasks (Slab Calculator)
  'laying slabs 40x40 (porcelain)': 'calculator:task_laying_slabs_porcelain_40x40',
  'laying slabs 60x60 (porcelain)': 'calculator:task_laying_slabs_porcelain_60x60',
  'laying slabs 90x60 (porcelain)': 'calculator:task_laying_slabs_porcelain_90x60',

  // Grouting variants (TileInstallation / Slab)
  'grouting porcelain mix sizes (slurry)': 'calculator:task_grouting_porcelain_slurry',
  'grouting porcelain 90 x 60 (slurry)': 'calculator:task_grouting_porcelain_90x60_slurry',
  'grouting porcelain mix sizes (cement)': 'calculator:task_grouting_porcelain_cement',
  'grouting granite mix sizes (slurry)': 'calculator:task_grouting_granite_slurry',
  'grouting sandstone mix sizes (slurry)': 'calculator:task_grouting_sandstone_slurry',

  // Compacting (CompactorSelector / compactingCalculations)
  'Compacting with small compactor': 'calculator:task_compacting_small_compactor',
  'Compacting with medium compactor': 'calculator:task_compacting_medium_compactor',
  'Compacting with large compactor': 'calculator:task_compacting_large_compactor',
  'Compacting with small roller': 'calculator:task_compacting_small_roller',
  'Compacting': 'calculator:task_compacting_generic',

  // New tasks from database (CSV export)
  'adhesiving fronts for stairs': 'calculator:task_adhesiving_fronts_stairs',
  'adhesiving steps/coppings': 'calculator:task_adhesiving_steps_coppings',
  'break': 'calculator:task_break',
  'Bricklaying ': 'calculator:task_bricklaying',
  'Bricklaying': 'calculator:task_bricklaying',
  'building a sleeper wall (1st layer)': 'calculator:task_building_sleeper_wall_1st_layer',
  'building a sleeper wall (on top of 1st layer)': 'calculator:task_building_sleeper_wall_on_top',
  'building penta sters 3 steps': 'calculator:task_building_penta_stairs_3_steps',
  'building penta stairs 3 steps': 'calculator:task_building_penta_stairs_3_steps',
  'building steps with 4-inch blocks': 'calculator:task_building_steps_4inch_blocks',
  'building steps with 7-inch blocks': 'calculator:task_building_steps_7inch_blocks',
  'building steps with bricks': 'calculator:task_building_steps_bricks',
  'compacting monoblocks m2/h': 'calculator:task_compacting_monoblocks_m2h',
  'cutting 120cm concrete slab': 'calculator:task_cutting_120cm_concrete_slab',
  'cutting 120cm granite slab': 'calculator:task_cutting_120cm_granite_slab',
  'cutting 120cm porcelain slab': 'calculator:task_cutting_120cm_porcelain_slab',
  'cutting 120cm sandstone slab': 'calculator:task_cutting_120cm_sandstone_slab',
  'cutting 30cm granite slab': 'calculator:task_cutting_30cm_granite_slab',
  'cutting 30cm porcelain slab': 'calculator:task_cutting_30cm_porcelain_slab',
  'cutting 30cm sandstone slab': 'calculator:task_cutting_30cm_sandstone_slab',
  'cutting 40cm concrete slab': 'calculator:task_cutting_40cm_concrete_slab',
  'cutting 60cm concrete slab': 'calculator:task_cutting_60cm_concrete_slab',
  'cutting 60cm granite slab': 'calculator:task_cutting_60cm_granite_slab',
  'cutting 60cm porcelain slab': 'calculator:task_cutting_60cm_porcelain_slab',
  'cutting 60cm sandstone slab': 'calculator:task_cutting_60cm_sandstone_slab',
  'cutting 90cm concrete slab': 'calculator:task_cutting_90cm_concrete_slab',
  'cutting 90cm granite slab': 'calculator:task_cutting_90cm_granite_slab',
  'cutting 90cm porcelain slab': 'calculator:task_cutting_90cm_porcelain_slab',
  'cutting 90cm sandstone slab': 'calculator:task_cutting_90cm_sandstone_slab',
  'cutting decking joists': 'calculator:task_cutting_decking_joists',
  'cutting mono blocks': 'calculator:task_cutting_mono_blocks',
  'cutting porcelain': 'calculator:task_cutting_porcelain',
  'cutting porcelain (frame)': 'calculator:task_cutting_porcelain_frame',
  'cutting sandstones': 'calculator:task_cutting_sandstones',
  'cutting sandstones (frame)': 'calculator:task_cutting_sandstones_frame',
  'decking boards cuts': 'calculator:task_decking_boards_cuts',
  'decking frame boards cuts': 'calculator:task_decking_frame_boards_cuts',
  'digging and putting drainage': 'calculator:task_digging_putting_drainage',
  'digging holes for posts': 'calculator:task_digging_holes_posts',
  'drainage pipe installation (machinery)': 'calculator:task_drainage_pipe_machinery',
  'drainage pipe installation (manual)': 'calculator:task_drainage_pipe_manual',
  'Excavating foundation with shovel': 'calculator:task_excavating_foundation_shovel',
  'Excavating foundation with with big excavator': 'calculator:task_excavating_foundation_big_excavator',
  'Excavating foundation with with medium excavator': 'calculator:task_excavating_foundation_medium_excavator',
  'Excavating foundation with with small excavator': 'calculator:task_excavating_foundation_small_excavator',
  'fixing decking boards': 'calculator:task_fixing_decking_boards',
  'fixing decking frame': 'calculator:task_fixing_decking_frame',
  'grouting sandstones 90 x 60 (mortar) ': 'calculator:task_grouting_sandstones_90x60_mortar',
  'grouting sandstones (brush-in)': 'calculator:task_grouting_sandstones_brushin',
  'grouting sandstones mix sizes (mortar) ': 'calculator:task_grouting_sandstones_mix_mortar',
  'laying 10x10 sets': 'calculator:task_laying_10x10_sets',
  'laying 4-inch blocks (flat)': 'calculator:task_laying_4inch_blocks_flat',
  'laying 4-inch blocks (standing)': 'calculator:task_laying_4inch_blocks_standing',
  'laying 7-inch blocks (flat)': 'calculator:task_laying_7inch_blocks_flat',
  'laying 7-inch blocks (standing)': 'calculator:task_laying_7inch_blocks_standing',
  'laying Flat edges': 'calculator:task_laying_flat_edges',
  'laying KL kerbs': 'calculator:task_laying_kl_kerbs',
  'laying Rumbled kerbs': 'calculator:task_laying_rumbled_kerbs',
  'laying slab frame above 0.3m2': 'calculator:task_laying_slab_frame_above_03',
  'laying slab frame belove 0.3m2': 'calculator:task_laying_slab_frame_below_03',
  'laying slabs 90x60 (sandstones)': 'calculator:task_laying_slabs_90x60_sandstones',
  'laying slabs mix size (porcelain)': 'calculator:task_laying_slabs_mix_porcelain',
  'laying slabs mix size (sandstones)': 'calculator:task_laying_slabs_mix_sandstones',
  'Loading Sand with Digger 1T': 'calculator:task_loading_sand_digger_1t',
  'Loading Sand with Digger 2T': 'calculator:task_loading_sand_digger_2t',
  'Loading Sand with Shovel (1 Person)': 'calculator:task_loading_sand_shovel',
  'lying slabs 90x60 (porcelain)': 'calculator:task_laying_slabs_90x60_porcelain',
  'Other': 'calculator:task_other',
  'PVC sewer pipe installation (machinery)': 'calculator:task_pvc_sewer_pipe_machinery',
  'PVC sewer pipe installation (manual)': 'calculator:task_pvc_sewer_pipe_manual',
  'setting up posts': 'calculator:task_setting_up_posts',
  'standard composite fence': 'calculator:task_standard_composite_fence',
  'standard fence horizontal': 'calculator:task_standard_fence_horizontal',
  'standard fence venetian': 'calculator:task_standard_fence_venetian',
  'standard fence vertical': 'calculator:task_standard_fence_vertical',
  'Tile Installation 120 x 30': 'calculator:task_tile_installation_120x30',
  'Tile Installation 30 x 30': 'calculator:task_tile_installation_30x30',
  'Tile Installation 60 x 30': 'calculator:task_tile_installation_60x30',
  'Tile Installation 60 x 60': 'calculator:task_tile_installation_60x60',
  'Tile Installation 80 x 40': 'calculator:task_tile_installation_80x40',
  'Tile Installation 80 x 80': 'calculator:task_tile_installation_80x80',
  'Tile Installation 90 x 30': 'calculator:task_tile_installation_90x30',
  'Tile Installation 90 x 60': 'calculator:task_tile_installation_90x60',
  'underground cable installation (machinery)': 'calculator:task_underground_cable_machinery',
  'underground cable installation (manual)': 'calculator:task_underground_cable_manual',
  'water pipe installation (machinery)': 'calculator:task_water_pipe_machinery',
  'water pipe installation (manual)': 'calculator:task_water_pipe_manual',
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

/**
 * Translation Map for Task Descriptions
 * Maps common task description text to translation keys
 */
export const taskDescriptionTranslationMap: Record<string, string> = {
  'for 1 person': 'calculator:task_desc_for_1_person',
};

/**
 * Translates a task description
 * Falls back to the original if no translation key is found
 */
export const translateTaskDescription = (
  description: string | undefined | null,
  t: (key: string) => string
): string => {
  if (!description || !description.trim()) return description || '';

  const trimmed = description.trim();
  let translationKey: string | undefined = taskDescriptionTranslationMap[trimmed];
  if (!translationKey) {
    const lowerDesc = trimmed.toLowerCase();
    const found = Object.entries(taskDescriptionTranslationMap).find(([key]) => key.toLowerCase() === lowerDesc);
    if (found) translationKey = found[1];
  }

  if (!translationKey) return description;

  const translated = t(translationKey);
  if (translated === translationKey) return description;

  return translated;
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
  // Materials from materials table
  '10x10 sets': 'material:10x10_sets',
  '1200 Fence Slats': 'material:1200_fence_slats',
  '1800 Fence Slats': 'material:1800_fence_slats',
  'adhesive': 'material:adhesive',
  'Building sand': 'material:building_sand',
  'drainage coil': 'material:drainage_coil',
  'drainage gravel': 'material:drainage_gravel',
  'drainage pipe': 'material:drainage_pipe',
  'Fence Rails': 'material:fence_rails',
  'Flat edges': 'material:flat_edges',
  'Granite Sand': 'material:granite_sand',
  'KL kerbs': 'material:kl_kerbs',
  'PVC pipe': 'material:pvc_pipe',
  'Rumbled kerbs': 'material:rumbled_kerbs',
  'Sharp sand': 'material:sharp_sand',
  'Soil excavation': 'material:soil_excavation',
  'tape1': 'material:tape1',
  'underground cable': 'material:underground_cable',
  'water pipe': 'material:water_pipe',
};

/**
 * Translation Map for Material Descriptions
 * Maps material names to description translation keys
 */
export const materialDescriptionTranslationMap: Record<string, string> = {
  '10x10 sets': 'material:desc_10x10_sets',
  '1200 Fence Slats': 'material:desc_1200_fence_slats',
  '1800 Fence Slats': 'material:desc_1800_fence_slats',
  'Bricks': 'material:desc_bricks',
  'Building sand': 'material:desc_building_sand',
  'Cement': 'material:desc_cement',
  'drainage coil': 'material:desc_drainage_coil',
  'drainage gravel': 'material:desc_drainage_gravel',
  'drainage pipe': 'material:desc_drainage_pipe',
  'Fence Rails': 'material:desc_fence_rails',
  'Flat edges': 'material:desc_flat_edges',
  'Granite Sand': 'material:desc_granite_sand',
  'KL kerbs': 'material:desc_kl_kerbs',
  'Post': 'material:desc_post',
  'PVC pipe': 'material:desc_pvc_pipe',
  'Rumbled kerbs': 'material:desc_rumbled_kerbs',
  'Sand': 'material:desc_sand',
  'Sharp sand': 'material:desc_sharp_sand',
  'Sleeper': 'material:desc_sleeper',
  'Soil': 'material:desc_soil',
  'Soil excavation': 'material:desc_soil_excavation',
  'tape1': 'material:desc_tape1',
  'underground cable': 'material:desc_underground_cable',
  'water pipe': 'material:desc_water_pipe',
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

  // Look up the translation key in the map (exact match first, then case-insensitive)
  let translationKey: string | undefined = materialNameTranslationMap[materialName];
  if (!translationKey && materialName) {
    const lowerMaterial = materialName.toLowerCase();
    const found = Object.entries(materialNameTranslationMap).find(([key]) => key.toLowerCase() === lowerMaterial);
    translationKey = found ? found[1] : undefined;
  }

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

/**
 * Translates a material description using the material name
 * Falls back to the original description if no translation key is found
 */
export const translateMaterialDescription = (
  materialName: string | undefined,
  originalDescription: string | undefined | null,
  t: (key: string) => string
): string => {
  if (!materialName) return originalDescription || '';

  let translationKey: string | undefined = materialDescriptionTranslationMap[materialName];
  if (!translationKey) {
    const lowerMaterial = materialName.toLowerCase();
    const found = Object.entries(materialDescriptionTranslationMap).find(([key]) => key.toLowerCase() === lowerMaterial);
    translationKey = found?.[1] ?? undefined;
  }

  if (!translationKey) return originalDescription || '';

  const translated = t(translationKey);
  if (translated === translationKey) return originalDescription || '';

  return translated;
};

/**
 * Maps unit values (from DB/calculators) to translation keys in units namespace.
 * Symbols like m, m², cm, mm, kg are kept as-is (no translation).
 */
export const unitTranslationMap: Record<string, string> = {
  sets: 'units:sets',
  slats: 'units:slats',
  bags: 'units:bags',
  'bags (20kg)': 'units:bags_20kg',
  pieces: 'units:pieces',
  piece: 'units:piece',
  tones: 'units:tones',
  tonnes: 'units:tonnes',
  tons: 'units:tons',
  'linear meters': 'units:linear_meters',
  rails: 'units:rails',
  edges: 'units:edges',
  kerbs: 'units:kerbs',
  blocks: 'units:blocks',
  slabs: 'units:slabs',
  hours: 'units:hours',
  sleepers: 'units:sleepers',
  posts: 'units:posts',
  holes: 'units:holes',
  rolls: 'units:rolls',
  batons: 'units:batons',
  boards: 'units:boards',
};

/**
 * Translates a unit string. Symbols (m, m², m2, cm, mm, kg, t) are returned as-is.
 * Word units (blocks, tonnes, pieces, bags, etc.) are translated.
 */
export const translateUnit = (
  unit: string | undefined,
  t: (key: string) => string
): string => {
  if (!unit || !unit.trim()) return unit || '';

  const trimmed = unit.trim();

  // Keep symbols unchanged (m, m², m2, cm, mm, kg, t, etc.)
  const symbolPattern = /^(m²|m2|m\b|cm|mm|kg|g|t\b|mb|l|ml)$/i;
  if (symbolPattern.test(trimmed)) return trimmed;

  let translationKey: string | undefined = unitTranslationMap[trimmed];
  if (!translationKey) {
    const lower = trimmed.toLowerCase();
    const found = Object.entries(unitTranslationMap).find(([key]) => key.toLowerCase() === lower);
    translationKey = found?.[1] ?? undefined;
  }

  if (!translationKey) return trimmed;

  const translated = t(translationKey);
  if (translated === translationKey) return trimmed;

  return translated;
};
