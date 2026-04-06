/** Predefined monoblock mix packs (length × width in cm). Row width is common across the mix. */

export type MonoblockLayoutMode = "single" | "mix";
export type MonoblockSingleSizeKey = "20x10" | "10x10";

export type MonoblockMixPieceKey = "20x10" | "10x10" | "5x10";

export interface MonoblockMixPiece {
  key: MonoblockMixPieceKey;
  /** Along laying direction (pattern `dir`) */
  lengthCm: number;
  /** Across row (pattern `perp`) */
  widthCm: number;
}

export interface MonoblockMixDefinition {
  id: string;
  /** i18n key under calculator: */
  labelKey: string;
  rowWidthCm: number;
  /** Offset along `dir` between even/odd rows so joints stagger (cm) — half of 20 cm module */
  staggerAlongCm: number;
  pieces: MonoblockMixPiece[];
}

export const MONOBLOCK_MIXES: MonoblockMixDefinition[] = [
  {
    id: "mix_10w_std",
    labelKey: "calculator:monoblock_mix_10w_std_label",
    rowWidthCm: 10,
    staggerAlongCm: 10,
    pieces: [
      { key: "20x10", lengthCm: 20, widthCm: 10 },
      { key: "10x10", lengthCm: 10, widthCm: 10 },
      { key: "5x10", lengthCm: 5, widthCm: 10 },
    ],
  },
];

export function getMonoblockMixById(id: string | undefined): MonoblockMixDefinition {
  const found = MONOBLOCK_MIXES.find((m) => m.id === id);
  return found ?? MONOBLOCK_MIXES[0];
}

export function defaultMonoblockMixEnabled(): Record<MonoblockMixPieceKey, boolean> {
  return { "20x10": true, "10x10": true, "5x10": true };
}

export function singleSizeToBlockCm(key: MonoblockSingleSizeKey): { blockLengthCm: number; blockWidthCm: number } {
  if (key === "10x10") return { blockLengthCm: 10, blockWidthCm: 10 };
  return { blockLengthCm: 20, blockWidthCm: 10 };
}
