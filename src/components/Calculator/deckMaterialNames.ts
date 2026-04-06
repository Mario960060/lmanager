/**
 * Material names must match materials / materials_template (Supabase) for price lookup.
 */

export type DeckJoistLengthKey = '3.6' | '5';
/** Stock length of decking boards (240 / 360 / 420 / 500 cm → m). */
export type DeckBoardLengthKey = '2.4' | '3.6' | '4.2' | '5';

export function deckingJoistMaterialName(joistLengthKey: DeckJoistLengthKey): string {
  return joistLengthKey === '5' ? 'Decking joist 5 m' : 'Decking joist 3.6 m';
}

export function deckingBearerMaterialName(joistLengthKey: DeckJoistLengthKey): string {
  return joistLengthKey === '5' ? 'Decking bearer 5 m' : 'Decking bearer 3.6 m';
}

export function deckingBoardMaterialName(boardLengthKey: DeckBoardLengthKey): string {
  switch (boardLengthKey) {
    case '2.4':
      return 'Decking board 2.4 m';
    case '4.2':
      return 'Decking board 4.2 m';
    case '5':
      return 'Decking board 5 m';
    default:
      return 'Decking board 3.6 m';
  }
}

/** Joist / bearer stock length in metres for computeDeckCalculation */
export function joistLengthMeters(joistLengthKey: DeckJoistLengthKey): number {
  return joistLengthKey === '5' ? 5 : 3.6;
}

/** Board stock length in metres for computeDeckCalculation */
export function boardLengthMeters(boardLengthKey: DeckBoardLengthKey): number {
  switch (boardLengthKey) {
    case '2.4':
      return 2.4;
    case '4.2':
      return 4.2;
    case '5':
      return 5;
    default:
      return 3.6;
  }
}

/** Composite decking boards only — same lengths as timber; all other materials stay timber names. */
export function compositeDeckingBoardMaterialName(boardLengthKey: DeckBoardLengthKey): string {
  switch (boardLengthKey) {
    case '2.4':
      return 'Composite decking board 2.4 m';
    case '4.2':
      return 'Composite decking board 4.2 m';
    case '5':
      return 'Composite decking board 5 m';
    default:
      return 'Composite decking board 3.6 m';
  }
}
