export { taskNameTranslationMap } from './translationMapTaskNames';
export { translateTaskName, normalizeTaskName, translateTaskBreakdown } from './taskNameTranslate';

/** * Translation Map for Task Descriptions
 * Maps common task description text to translation keys
 */
export const taskDescriptionTranslationMap: Record<string, string> = {
  // Person / crew
  'for 1 person': 'calculator:task_desc_for_1_person',
  'dla 1 osoby': 'calculator:task_desc_for_1_person',
  'for 1 persone': 'calculator:task_desc_for_1_person',
  'for single person': 'calculator:task_desc_for_single_person',
  'dla jednej osoby': 'calculator:task_desc_for_single_person',
  'Time estimated for 1 person': 'calculator:task_desc_time_estimated_one_person',
  'Czas szacunkowy dla 1 osoby': 'calculator:task_desc_time_estimated_one_person',
  'Czas szacunkowy na 1 osobę': 'calculator:task_desc_time_estimated_one_person',
  '1 person 1 week of job total': 'calculator:task_desc_1_person_1_week',
  // Seed / generic
  'Build standard wall section': 'calculator:task_desc_build_standard_wall',
  'Install ceramic floor tiles': 'calculator:task_desc_install_ceramic_tiles',
  'Paint walls with two coats': 'calculator:task_desc_paint_walls',
  'Install basic plumbing fixtures': 'calculator:task_desc_install_plumbing',
  'Install electrical wiring and outlets': 'calculator:task_desc_install_electrical',
  // Stairs / adhesiving
  'adhesiving single front tile': 'calculator:task_desc_adhesiving_front_tile',
  'adhesiving single step or copping': 'calculator:task_desc_adhesiving_step_copping',
  'normal break': 'calculator:task_desc_break',
  // Sleeper wall
  '1st row only': 'calculator:task_desc_1st_row_only',
  '1st row not included here': 'calculator:task_desc_1st_row_not_included',
  // Compacting
  'Compacting monoblocks': 'calculator:task_desc_compacting_monoblocks',
  'Compacting sand or type1': 'calculator:task_desc_compacting_sand_type1',
  'Compacting sand or type1 with small roller': 'calculator:task_desc_compacting_sand_roller',
  // Cutting
  'cut with large grinder': 'calculator:task_desc_cut_large_grinder',
  'cut with small grinder': 'calculator:task_desc_cut_small_grinder',
  'cutting with measuring': 'calculator:task_desc_cutting_measuring',
  'cuttn 1 monoblock': 'calculator:task_desc_cut_monoblock',
  'for single person each slabs need to be cuted': 'calculator:task_desc_cut_porcelain',
  'width cut or mitre on slab frame piece': 'calculator:task_desc_cut_porcelain_frame',
  'for single person each sandstone that slab need to be cutted': 'calculator:task_desc_cut_sandstone',
  'width cut on frame cut': 'calculator:task_desc_cut_sandstone_frame',
  'cutting 1 board with measure': 'calculator:task_desc_cut_board',
  'cutting boards for frame': 'calculator:task_desc_cut_frame_boards',
  // Drainage / digging
  'fully setting drainage with digging and back filling': 'calculator:task_desc_drainage_setting',
  'diging a whole for average terrain': 'calculator:task_desc_digging_holes',
  // Foundation excavator
  '+7t': 'calculator:task_desc_excavator_7t',
  '3-7 tones': 'calculator:task_desc_excavator_3_7t',
  'up to 3 tones': 'calculator:task_desc_excavator_3t',
  // Leveling
  'Final leveling of sand layer. Approximately 3 minutes per square meter': 'calculator:task_desc_final_leveling_sand',
  'Final leveling of Type 1': 'calculator:task_desc_final_leveling_type1',
  // Deck
  'no cutting': 'calculator:task_desc_no_cutting',
  'fixing frame based on each joist/bearer': 'calculator:task_desc_fixing_frame',
  // Grouting
  'grouting and cleaning': 'calculator:task_desc_grouting_cleaning',
  // Grass / jointing
  'jointing 2 pieces per linear meter': 'calculator:task_desc_jointing_grass',
  'for single person just fixing grass': 'calculator:task_desc_laying_artificial_grass',
  'Trimming edges of artificial grass': 'calculator:task_desc_trimming_grass',
  // Laying
  'laying any 10x10 sets': 'calculator:task_desc_laying_10x10',
  'laying any 10x10 paving blocks': 'calculator:task_desc_laying_10x10',
  'laying Flat edges 15 x 5 x 100': 'calculator:task_desc_laying_flat_edges',
  '200 x 100 x 125': 'calculator:task_desc_kerbs_kl',
  'for single person, lying monoblocks': 'calculator:task_desc_laying_monoblocks',
  'laying rolls 2m x 0.5m': 'calculator:task_desc_laying_natural_turf',
  'Spreading decorative aggregate or pebbles to design depth over the prepared area':
    'calculator:task_desc_spreading_decorative_stones',
  'Laying decorative aggregate or gravel by finished area': 'calculator:task_desc_spreading_decorative_stones',
  '200 x 100 x 80': 'calculator:task_desc_kerbs_rumbled',
  'laying piece above 0.3m2': 'calculator:task_desc_laying_frame_above',
  'laying 1 piece belowe 0.3m2': 'calculator:task_desc_laying_frame_below',
  // Mortar / other
  'Mixing mortar using concrete mixers (125kg)': 'calculator:task_desc_mixing_mortar',
  'Describe task and amount of hours needed': 'calculator:task_desc_other',
  'Preparing and leveling for wall': 'calculator:task_desc_preparing_wall',
  'Ground preparation and leveling before kerbs or edges': 'calculator:task_desc_preparing_kerbs_edges',
  'Przygotowanie podłoża pod obrzeża i krawężniki': 'calculator:task_desc_preparing_kerbs_edges',
  'screeding on prepared area': 'calculator:task_desc_screeding',
  'setting on concrete or driving in posts': 'calculator:task_desc_setting_posts',
  // Fence
  'puting slats in composite fence': 'calculator:task_desc_composite_fence',
  'just slatting': 'calculator:task_desc_just_slatting',
  // Tile installation
  'fixing slabs 120 x 30 to wall on adhesive': 'calculator:task_desc_tile_120x30',
  'fixing slabs 30 x 30 to wall on adhesive': 'calculator:task_desc_tile_30x30',
  'fixing slabs 60 x 30 to wall on adhesive': 'calculator:task_desc_tile_60x30',
  'fixing slabs 60 x 60 to wall on adhesive': 'calculator:task_desc_tile_60x60',
  'fixing slabs 80 x 40 to wall on adhesive': 'calculator:task_desc_tile_80x40',
  'fixing slabs 80 x 80 to wall on adhesive': 'calculator:task_desc_tile_80x80',
  'fixing slabs 90 x 30 to wall on adhesive': 'calculator:task_desc_tile_90x30',
  'fixing slabs 90 x 60 to wall on adhesive': 'calculator:task_desc_tile_90x60',
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
  'Bricks (outer leaf)': 'calculator:material_bricks_outer_leaf',
  'Bricks (inner leaf)': 'calculator:material_bricks_inner_leaf',
  '4-inch blocks (inner leaf)': 'calculator:material_blocks_4_inner_leaf',
  '7-inch blocks (outer leaf)': 'calculator:material_blocks_7_outer_leaf',
  '6-inch blocks (outer leaf)': 'calculator:material_blocks_7_outer_leaf',
  '7-inch blocks (inner leaf)': 'calculator:material_blocks_7_inner_leaf',
  '6-inch blocks (inner leaf)': 'calculator:material_blocks_7_inner_leaf',
  'Blocks': 'material:blocks',
  'Slabs': 'material:slabs',
  'Gravel': 'material:gravel',
  'Soil': 'material:soil',
  'Lawn soil': 'material:lawn_soil',
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
  'Fence nails 45 mm': 'material:fence_nails_45_mm',
  'Fence nails 35 mm': 'material:fence_nails_35_mm',
  'Fence nails 75 mm': 'material:fence_nails_75_mm',
  'Flat edges': 'material:flat_edges',
  'Granite Sand': 'material:granite_sand',
  'KL kerbs': 'material:kl_kerbs',
  'PVC pipe': 'material:pvc_pipe',
  'Rumbled kerbs': 'material:rumbled_kerbs',
  'Sharp sand': 'material:sharp_sand',
  'Soil excavation': 'material:soil_excavation',
  'tape1': 'material:tape1',
  'Artificial Grass': 'material:artificial_grass',
  'Type 1 Aggregate': 'calculator:aggregate_material_type1',
  'Grid Sand': 'calculator:aggregate_material_grid_sand',
  'Crushed Stone': 'calculator:aggregate_material_crushed_stone',
  'underground cable': 'material:underground_cable',
  'water pipe': 'material:water_pipe',
  // Calculator-specific materials
  'Fill (Soil)': 'material:fill_soil',
  'Fill (Tape1)': 'material:fill_tape1',
  'Decking board': 'material:decking_board',
  'Decking boards': 'material:decking_boards',
  'Joist': 'material:joist',
  'Joists': 'material:joists',
  'Bearers': 'material:bearers',
  'Decking joist 3.6 m': 'material:decking_joist_3_6_m',
  'Decking joist 5 m': 'material:decking_joist_5_m',
  'Decking bearer 3.6 m': 'material:decking_bearer_3_6_m',
  'Decking bearer 5 m': 'material:decking_bearer_5_m',
  'Decking board 2.4 m': 'material:decking_board_2_4_m',
  'Decking board 3.6 m': 'material:decking_board_3_6_m',
  'Decking board 4.2 m': 'material:decking_board_4_2_m',
  'Decking board 5 m': 'material:decking_board_5_m',
  'Composite decking board 2.4 m': 'material:composite_decking_board_2_4_m',
  'Composite decking board 3.6 m': 'material:composite_decking_board_3_6_m',
  'Composite decking board 4.2 m': 'material:composite_decking_board_4_2_m',
  'Composite decking board 5 m': 'material:composite_decking_board_5_m',
  'Frame slabs': 'material:frame_slabs',
  // Stair calculators – masonry materials
  '4-inch Blocks': 'calculator:lshape_material_4inch',
  '7-inch Blocks': 'calculator:lshape_material_7inch',
  '6-inch Blocks': 'calculator:lshape_material_7inch',
  'Standard Bricks (9x6x21)': 'calculator:lshape_material_bricks',
  // Foundation / Wall calculator materials
  'Excavated Clay Soil (loose volume)': 'calculator:excavated_clay_soil_loose',
  'Excavated Sand Soil (loose volume)': 'calculator:excavated_sand_soil_loose',
  'Excavated Rock Soil (loose volume)': 'calculator:excavated_rock_soil_loose',
  'Aggregate (for concrete)': 'calculator:aggregate_for_concrete',
  // Fence calculators
  'Composite Posts': 'material:composite_posts',
  'Composite Slats': 'material:composite_slats',
  'Venetian Slats': 'material:venetian_slats',
  'Fence Slats': 'material:fence_slats',
  // Deck calculator
  'Sleepers': 'material:sleepers',
  'Posts': 'material:posts',
  'Frame Boards': 'material:frame_boards',
  // Other calculators
  'Tile Adhesive': 'material:tile_adhesive',
  'Natural turf rolls': 'material:natural_turf_rolls',
  // Decorative stones calculator (materials table / i18n company names)
  'Decorative stones': 'calculator:decorative_stones_material_name',
  'Kamień dekoracyjny': 'calculator:decorative_stones_material_name',
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
  'Fence nails 45 mm': 'material:desc_fence_nails_45_mm',
  'Fence nails 35 mm': 'material:desc_fence_nails_35_mm',
  'Fence nails 75 mm': 'material:desc_fence_nails_75_mm',
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
  'Decking joist 3.6 m': 'material:desc_decking_joist_3_6_m',
  'Decking joist 5 m': 'material:desc_decking_joist_5_m',
  'Decking bearer 3.6 m': 'material:desc_decking_bearer_3_6_m',
  'Decking bearer 5 m': 'material:desc_decking_bearer_5_m',
  'Decking board 2.4 m': 'material:desc_decking_board_2_4_m',
  'Decking board 3.6 m': 'material:desc_decking_board_3_6_m',
  'Decking board 4.2 m': 'material:desc_decking_board_4_2_m',
  'Decking board 5 m': 'material:desc_decking_board_5_m',
  'Composite decking board 2.4 m': 'material:desc_composite_decking_board_2_4_m',
  'Composite decking board 3.6 m': 'material:desc_composite_decking_board_3_6_m',
  'Composite decking board 4.2 m': 'material:desc_composite_decking_board_4_2_m',
  'Composite decking board 5 m': 'material:desc_composite_decking_board_5_m',
};

/**
 * Patterns for dynamic material names that include dimensions or other variable parts.
 * Each entry has a regex, a translation key for the prefix, and a group index for the suffix to preserve.
 */
const dynamicMaterialPatterns: { regex: RegExp; translationKey: string; format?: (translated: string, match: RegExpMatchArray) => string }[] = [
  { regex: /^Concrete slabs (.+)$/i, translationKey: 'calculator:material_concrete_slabs' },
  { regex: /^Copings \((.+)\)$/i, translationKey: 'calculator:material_copings', format: (tr, m) => `${tr} (${m[1]})` },
  { regex: /^porcelain slabs (.+)$/i, translationKey: 'calculator:material_porcelain_slabs' },
  { regex: /^tier panels (.+)$/i, translationKey: 'calculator:material_tier_panels' },
  { regex: /^granite slabs (.+)$/i, translationKey: 'calculator:material_granite_slabs' },
  { regex: /^sandstone slabs (.+)$/i, translationKey: 'calculator:material_sandstone_slabs' },
  { regex: /^Porcelana (.+)$/i, translationKey: 'calculator:material_porcelana' },
  { regex: /^Piaskowce (.+)$/i, translationKey: 'calculator:material_piaskowce' },
  { regex: /^Granit (.+)$/i, translationKey: 'calculator:material_granit' },
  { regex: /^Płyty (.+)$/i, translationKey: 'calculator:material_slabs_generic' },
  { regex: /^Porcelain (.+)$/i, translationKey: 'calculator:material_porcelana' },
  { regex: /^Sandstone (.+)$/i, translationKey: 'calculator:material_piaskowce' },
  { regex: /^Granite (.+)$/i, translationKey: 'calculator:material_granit' },
  { regex: /^Slabs (.+)$/i, translationKey: 'calculator:material_slabs_generic' },
  { regex: /^Monoblocks (.+)$/i, translationKey: 'calculator:material_monoblocks' },
  { regex: /^Frame pieces (.+)$/i, translationKey: 'calculator:material_frame_pieces' },
  { regex: /^Frame slabs (.+)$/i, translationKey: 'calculator:material_frame_slabs' },
  { regex: /^Płyty ramkowe (.+)$/i, translationKey: 'calculator:material_frame_slabs' },
  {
    regex: /^Horizontal fence slat (\d+×\d+ cm)$/i,
    translationKey: 'calculator:material_horizontal_fence_slat',
    format: (tr, m) => `${tr} ${m[1]}`,
  },
];

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
    // Try dynamic patterns (material names with dimensions like "Concrete slabs 40×40")
    for (const { regex, translationKey: patternKey, format } of dynamicMaterialPatterns) {
      const match = materialName.match(regex);
      if (match) {
        const translated = t(patternKey);
        if (translated !== patternKey) {
          return format ? format(translated, match) : `${translated} ${match[1]}`;
        }
      }
    }
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
  /** Legacy stored value; display as pieces/sztuki like other count units */
  sleepers: 'units:pieces',
  posts: 'units:posts',
  holes: 'units:holes',
  rolls: 'units:rolls',
  batons: 'units:batons',
  /** Venetian fence laying task unit (singular in DB/template) */
  baton: 'units:batons',
  boards: 'units:boards',
  'square meters': 'units:square_meters',
  'square metres': 'units:square_meters',
  meters: 'units:meters',
  /** British spelling from KerbsEdgesAndSetsCalculator task lines */
  metres: 'units:meters',
  'points': 'units:points',
  /** Legacy DB/calculator value; display same as pieces */
  units: 'units:pieces',
  joist: 'units:joist',
  joists: 'units:joists',
  bearers: 'units:bearers',
  board: 'units:board',
  'running meter': 'units:running_meter',
  'running meters': 'units:running_meters',
  percent: 'units:percent',
  batch: 'units:batch',
  brick: 'units:brick',
  bricks: 'units:bricks',
  godzin: 'units:hours',
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
