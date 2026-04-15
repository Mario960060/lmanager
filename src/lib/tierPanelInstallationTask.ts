/** Reference panel areas (m²) — Event Task names `Tier Panel Installation 0.1m2` etc. */

export const TIER_PANEL_AREA_BUCKETS_M2 = [0.1, 0.2, 0.3] as const;

/** Single panel area (m²) from dimensions in cm. */
export function tierPanelSingleAreaM2(widthCm: number, heightCm: number): number {
  return (widthCm * heightCm) / 10000;
}

/**
 * DB task name — bucket closest to actual single-panel area.
 * Labor in calculator: wallArea (m²) × estimated_hours from template when unit is square meters.
 */
export function getTierPanelInstallationTaskName(panelWidthCm: number, panelHeightCm: number): string {
  const panelAreaM2 = tierPanelSingleAreaM2(panelWidthCm, panelHeightCm);
  let closest = TIER_PANEL_AREA_BUCKETS_M2[0];
  let bestDist = Math.abs(panelAreaM2 - closest);
  for (const b of TIER_PANEL_AREA_BUCKETS_M2) {
    const d = Math.abs(panelAreaM2 - b);
    if (d < bestDist) {
      bestDist = d;
      closest = b;
    }
  }
  const label = closest === 0.1 ? '0.1m2' : closest === 0.2 ? '0.2m2' : '0.3m2';
  return `Tier Panel Installation ${label}`;
}
