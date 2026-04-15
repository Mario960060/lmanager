// ══════════════════════════════════════════════════════════════
// Paleta kolorów geodezji (etykiety / kropki przy konfliktach nakładania).
// [0] biały — brak konfliktu; [1..] — rozróżnienie sąsiadów w grafie nakładania.
// ══════════════════════════════════════════════════════════════

export const GEODESY_GROUP_PALETTE = [
  "#FFFFFF",
  "#00E5FF",
  "#FF9100",
  "#FF4081",
  "#FFEA00",
  "#B388FF",
  /** Zapas przy bardzo gęstym K₇+ (nakładające się etykiety). */
  "#FF6B6B",
] as const;
