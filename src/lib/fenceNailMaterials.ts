/**
 * Fence nail material names and quantities (must match materials_template / materials rows).
 */

export const FENCE_NAILS_45_MM = 'Fence nails 45 mm';
export const FENCE_NAILS_35_MM = 'Fence nails 35 mm';
export const FENCE_NAILS_75_MM = 'Fence nails 75 mm';

/** Vertical fence: 6 nails per slat at 45 mm. */
export const FENCE_VERTICAL_NAILS_PER_SLAT = 6;

/** Fence rails to posts: 6 nails per post at 75 mm (vertical fence). */
export const FENCE_RAIL_NAILS_PER_POST = 6;

/**
 * Horizontal / Venetian slats: 2 nails at start, then 2 every 180 cm along slat length (cm).
 * Example: 360 cm → positions at 0, 180, 360 → 3 × 2 = 6 nails per slat.
 */
export function fenceSlatNailsPerSlatAlongLength(slatLengthCm: number): number {
  if (!(slatLengthCm > 0) || !Number.isFinite(slatLengthCm)) return 0;
  const positions = Math.floor(slatLengthCm / 180) + 1;
  return 2 * positions;
}
