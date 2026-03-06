import { describe, it, expect } from "vitest";
import { computeDeckCalculation } from "../../components/Calculator/deckCalculatorLogic";

describe("deckCalculatorLogic", () => {
  const baseInputs = {
    totalLength: 4,
    totalWidth: 3,
    joistLength: 3.6,
    distanceBetweenJoists: 0.4,
    boardLength: 3.6,
    boardWidth: 14,   // cm
    jointGaps: 5,     // mm
    pattern: "Length" as const,
    halfShift: false,
    includeFrame: false,
  };

  describe("Length pattern", () => {
    it("calculates correct board count for exact fit", () => {
      // 4m length, 3.6m boards => 2 boards per row (with 0.4m remainder needing cut)
      // 3m width, 14cm+5mm = 0.145m per row => ceil(3/0.145) ≈ 21 rows
      const r = computeDeckCalculation({ ...baseInputs });
      expect(r.boardsPerRow).toBe(2);  // ceil(4/3.6) = 2
      expect(r.rowsNeeded).toBe(21);   // ceil(3 / 0.145) = 21
      expect(r.totalBoards).toBe(42); // 2 * 21
      expect(r.totalBoardCuts).toBe(32); // ceil(21 * 1.5) = 32
    });

    it("calculates docinki (cuts) as ~1.5 per row for staggered pattern", () => {
      const r = computeDeckCalculation({
        ...baseInputs,
        totalLength: 10,
        totalWidth: 5,
        boardLength: 4,
        boardWidth: 10,
        jointGaps: 3,
      });
      // 10/4 = 2.5 => 3 boards per row, 5/(0.1+0.003) = ~48.5 => 49 rows
      expect(r.boardsPerRow).toBe(3);
      expect(r.rowsNeeded).toBe(49);
      expect(r.totalBoardCuts).toBe(Math.ceil(49 * 1.5)); // 74
    });

    it("calculates joists and bearers correctly for Length", () => {
      const r = computeDeckCalculation({
        ...baseInputs,
        totalLength: 5,
        totalWidth: 4,
        joistLength: 3,
        distanceBetweenJoists: 0.5,
      });
      // Bearers: along length (5m), 5/3 = 2 per row; rows = ceil(4/1.8)+1 = 4
      expect(r.bearersInRow).toBe(2);
      expect(r.bearerRows).toBe(4);
      // Joists: along width (4m), 4/3 ≈ 2 per line; lines = ceil(5/0.5)+1 = 11
      expect(r.joistsInRow).toBe(2);
      expect(r.joistRows).toBe(11);
    });
  });

  describe("Width pattern", () => {
    it("Width uses tw for boardsPerRow and tl for rowsNeeded (swapped vs Length)", () => {
      const lengthResult = computeDeckCalculation({ ...baseInputs, pattern: "Length" });
      const widthResult = computeDeckCalculation({ ...baseInputs, pattern: "Width" });

      // Length: boardsPerRow = ceil(tl/bl)=2, rowsNeeded = ceil(tw/(bw+jg))=21
      // Width:  boardsPerRow = ceil(tw/bl)=1, rowsNeeded = ceil(tl/(bw+jg))=28
      expect(lengthResult.boardsPerRow).toBe(2);
      expect(widthResult.boardsPerRow).toBe(1);  // ceil(3/3.6)
      expect(widthResult.rowsNeeded).toBe(28);  // ceil(4/0.145)
      expect(lengthResult.rowsNeeded).toBe(21);
    });

    it("calculates same total boards for square deck (Length vs Width)", () => {
      const sq = { ...baseInputs, totalLength: 4, totalWidth: 4 };
      const lengthResult = computeDeckCalculation({ ...sq, pattern: "Length" });
      const widthResult = computeDeckCalculation({ ...sq, pattern: "Width" });
      expect(lengthResult.totalBoards).toBe(widthResult.totalBoards);
    });

    it("docinki formula same as Length (1.5 per row)", () => {
      const r = computeDeckCalculation({
        ...baseInputs,
        pattern: "Width",
        totalLength: 6,
        totalWidth: 4,
      });
      expect(r.totalBoardCuts).toBe(Math.ceil(r.rowsNeeded * 1.5));
    });
  });

  describe("45 degree angle pattern", () => {
    it("computes diagonal length and row count", () => {
      const r = computeDeckCalculation({
        ...baseInputs,
        pattern: "45 degree angle",
        totalLength: 4,
        totalWidth: 3,
      });
      const d = Math.sqrt(4 * 4 + 3 * 3); // 5
      expect(r.rowsNeeded).toBeGreaterThan(0);
      expect(r.totalBoards).toBeGreaterThan(0);
      // Each row has 2 cuts (both ends)
      expect(r.totalBoardCuts).toBe(r.rowsNeeded * 2);
    });

    it("halfShift produces valid board count (different row lengths)", () => {
      const noShift = computeDeckCalculation({
        ...baseInputs,
        pattern: "45 degree angle",
        halfShift: false,
      });
      const withShift = computeDeckCalculation({
        ...baseInputs,
        pattern: "45 degree angle",
        halfShift: true,
      });
      // Both produce positive board counts; may differ due to staggering
      expect(noShift.totalBoards).toBeGreaterThan(0);
      expect(withShift.totalBoards).toBeGreaterThan(0);
    });
  });

  describe("Frame boards", () => {
    it("adds frame boards when includeFrame is true", () => {
      const noFrame = computeDeckCalculation({ ...baseInputs, includeFrame: false });
      const withFrame = computeDeckCalculation({ ...baseInputs, includeFrame: true });
      expect(withFrame.frameBoards).toBeGreaterThan(0);
      expect(withFrame.totalBoards).toBe(noFrame.totalBoards + withFrame.frameBoards);
    });

    it("frame formula: 2*(length-0.14)/bl + 2*(width-0.14)/bl", () => {
      const r = computeDeckCalculation({
        ...baseInputs,
        includeFrame: true,
        totalLength: 5,
        totalWidth: 4,
        boardLength: 3,
        boardWidth: 14,
      });
      const bl = 3;
      const bw = 0.14;
      const expected = Math.ceil((5 - bw) / bl + (5 - bw) / bl + (4 - bw) / bl + (4 - bw) / bl);
      expect(r.frameBoards).toBe(expected);
    });
  });

  describe("Edge cases", () => {
    it("handles very small deck", () => {
      const r = computeDeckCalculation({
        ...baseInputs,
        totalLength: 1,
        totalWidth: 1,
        boardLength: 1,
        boardWidth: 10,
        jointGaps: 5,
      });
      expect(r.totalBoards).toBeGreaterThanOrEqual(1);
      expect(r.totalBoardCuts).toBeGreaterThanOrEqual(0);
    });

    it("handles board longer than deck length", () => {
      const r = computeDeckCalculation({
        ...baseInputs,
        totalLength: 2,
        totalWidth: 2,
        boardLength: 4,
      });
      // 2/4 = 0.5 => 1 board per row
      expect(r.boardsPerRow).toBe(1);
    });
  });
});
