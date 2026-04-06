/**
 * Matches event_tasks rows suitable for the Decorative stones calculator main work rate.
 * DB names stay English; UI translates via translationMap + i18n.
 */
export function taskMatchesDecorativeStonesWork(name: string): boolean {
  const n = (name || "").toLowerCase();
  if (!n.trim()) return false;

  // Exclude obvious non-matches
  if (n.includes("monoblock") || n.includes("porcelain") || n.includes("sandstone")) return false;
  if (n.includes("slab") && !n.includes("decorative")) return false;

  if (n.includes("spreading decorative")) return true;
  if (n.includes("decorative stone")) return true;
  if (n.includes("decorative aggregate")) return true;
  if (n.includes("ornamental gravel") || n.includes("ornamental stone")) return true;
  if (n.includes("spreading") && (n.includes("gravel") || n.includes("pebble") || n.includes("chip"))) return true;

  return false;
}

/** Broader fallback when no primary matches (still decorative / spreading themed). */
export function taskMatchesDecorativeStonesFallback(name: string): boolean {
  const n = (name || "").toLowerCase();
  if (n.includes("decorative")) return true;
  if (n.includes("spreading") && (n.includes("stone") || n.includes("gravel") || n.includes("aggregate"))) return true;
  return false;
}
