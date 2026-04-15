/** Bilingual tool row from `tools` / `tools_template`. */
export function toolDisplayName(row: { name_en: string; name_pl: string }, lang: string): string {
  return lang === 'pl' ? row.name_pl : row.name_en;
}

export function toolMatchesSearch(row: { name_en: string; name_pl: string }, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return row.name_en.toLowerCase().includes(s) || row.name_pl.toLowerCase().includes(s);
}
