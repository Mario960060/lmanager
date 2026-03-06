/**
 * Pure deck calculator logic - extracted for testing.
 * All lengths in meters; boardWidth in cm (converted to m internally).
 */

export interface DeckCalculationInputs {
  totalLength: number;      // m
  totalWidth: number;       // m
  joistLength: number;     // m
  distanceBetweenJoists: number;  // m
  boardLength: number;     // m
  boardWidth: number;      // cm
  jointGaps: number;       // mm
  pattern: 'Length' | 'Width' | '45 degree angle';
  halfShift: boolean;
  includeFrame: boolean;
}

export interface DeckCalculationResult {
  totalBoards: number;
  frameBoards: number;
  totalBoardCuts: number;
  boardsPerRow: number;
  rowsNeeded: number;
  bearersInRow: number;
  bearerRows: number;
  joistsInRow: number;
  joistRows: number;
  postsPerRow: number;
  postRows: number;
  totalBearers: number;
  totalJoists: number;
  totalPosts: number;
}

/**
 * Compute deck material counts and cuts (docinki) for given inputs.
 */
export function computeDeckCalculation(inputs: DeckCalculationInputs): DeckCalculationResult {
  const {
    totalLength: tl,
    totalWidth: tw,
    joistLength: jl,
    distanceBetweenJoists: dbj,
    boardLength: bl,
    boardWidth: bw,
    jointGaps: jg,
    pattern,
    halfShift,
    includeFrame,
  } = inputs;

  const boardWidth_m = bw / 100;  // cm -> m
  const jointGaps_m = jg / 1000; // mm -> m
  const sqrt2 = Math.sqrt(2);

  let boardsPerRow: number;
  let rowsNeeded: number;
  let bearersInRow: number;
  let bearerRows: number;
  let joistsInRow: number;
  let joistRows: number;
  let postsPerRow: number;
  let postRows: number;
  let totalBoardCuts: number;
  let totalBoards: number;

  if (pattern === '45 degree angle') {
    const d = Math.sqrt(tl * tl + tw * tw);
    const t = boardWidth_m + jointGaps_m;
    const delta = 1.414 * t;
    const effectiveLengthForJoists = (tl + tw) / sqrt2;

    let totalBoardsCalculated = 0;
    let actualRowsNeeded = 0;

    for (let i = 0; ; i++) {
      let Li: number;
      if (halfShift) {
        Li = d - (i + 0.5) * delta;
      } else {
        Li = d - i * delta;
      }
      if (Li <= 0) break;

      actualRowsNeeded++;
      const boardsInThisRow = halfShift
        ? Math.ceil((Li + bl / 2) / bl)
        : Math.ceil(Li / bl);
      totalBoardsCalculated += boardsInThisRow;
    }

    rowsNeeded = actualRowsNeeded;
    totalBoardCuts = rowsNeeded * 2;
    totalBoards = totalBoardsCalculated;

    bearersInRow = Math.ceil(effectiveLengthForJoists / jl);
    bearerRows = Math.ceil(d / 1.8) + 1;
    joistsInRow = Math.ceil(effectiveLengthForJoists / jl);
    joistRows = Math.ceil(d / dbj) + 1;
    postsPerRow = Math.ceil(effectiveLengthForJoists / 1.8) + 1;
    postRows = Math.ceil(d / 1.8) + 1;
    boardsPerRow = 0; // Not used for 45°
  } else if (pattern === 'Width') {
    boardsPerRow = Math.ceil(tw / bl);
    rowsNeeded = Math.ceil(tl / (boardWidth_m + jointGaps_m));
    totalBoards = Math.ceil(boardsPerRow * rowsNeeded);
    totalBoardCuts = Math.ceil(rowsNeeded * 1.5);

    bearersInRow = Math.ceil(tw / jl);
    bearerRows = Math.ceil(tl / 1.8) + 1;
    joistsInRow = Math.ceil(tl / jl);
    joistRows = Math.ceil(tw / dbj) + 1;
    postsPerRow = Math.ceil(tw / 1.8) + 1;
    postRows = Math.ceil(tl / 1.8) + 1;
  } else {
    // Length
    boardsPerRow = Math.ceil(tl / bl);
    rowsNeeded = Math.ceil(tw / (boardWidth_m + jointGaps_m));
    totalBoards = Math.ceil(boardsPerRow * rowsNeeded);
    totalBoardCuts = Math.ceil(rowsNeeded * 1.5);

    bearersInRow = Math.ceil(tl / jl);
    bearerRows = Math.ceil(tw / 1.8) + 1;
    joistsInRow = Math.ceil(tw / jl);
    joistRows = Math.ceil(tl / dbj) + 1;
    postsPerRow = Math.ceil(tl / 1.8) + 1;
    postRows = Math.ceil(tw / 1.8) + 1;
  }

  let frameBoards = 0;
  if (includeFrame) {
    const adjustedLength = (tl - boardWidth_m) / bl;
    const adjustedWidth = (tw - boardWidth_m) / bl;
    frameBoards = Math.ceil(adjustedLength + adjustedLength + adjustedWidth + adjustedWidth);
    totalBoards += frameBoards;
  }

  const totalBearers = Math.ceil(bearersInRow * bearerRows);
  const totalJoists = Math.ceil(joistsInRow * joistRows);
  const totalPosts = Math.ceil(postsPerRow * postRows);

  return {
    totalBoards,
    frameBoards,
    totalBoardCuts,
    boardsPerRow,
    rowsNeeded,
    bearersInRow,
    bearerRows,
    joistsInRow,
    joistRows,
    postsPerRow,
    postRows,
    totalBearers,
    totalJoists,
    totalPosts,
  };
}
