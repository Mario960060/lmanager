import { describe, it, expect } from "vitest";
import {
  autoLayoutGrassPieces,
  autoJoinAdjacentPieces,
  validateCoverage,
  hitTestGrassPiece,
  hitTestGrassPieceEdge,
  snapGrassPieceToPolygon,
  snapGrassPieceEdge,
  getJoinedGroup,
  drawGrassPieces,
  getPieceCorners,
  getEffectiveTotalArea,
  getEffectivePieceDimensionsForInput,
  type GrassPiece,
} from "../../../projectmanagement/canvacreator/visualization/grassRolls";
import { makeRectangle, toPixels } from "../../../projectmanagement/canvacreator/geometry";

describe("autoLayoutGrassPieces", () => {
  it("places single piece at bbox origin", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    const pieces: GrassPiece[] = [{ id: "1", widthM: 4, lengthM: 10, x: 0, y: 0, rotation: 0 }];
    const result = autoLayoutGrassPieces(shape, pieces);
    expect(result).toHaveLength(1);
    expect(result[0].x).toBeDefined();
    expect(result[0].y).toBeDefined();
  });

  it("places multiple pieces in rows", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    const pieces: GrassPiece[] = [
      { id: "1", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0 },
      { id: "2", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0 },
      { id: "3", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0 },
    ];
    const result = autoLayoutGrassPieces(shape, pieces);
    expect(result).toHaveLength(3);
    expect(result[0].y).toBeDefined();
    expect(result[1].y).toBeDefined();
  });
});

describe("autoJoinAdjacentPieces", () => {
  it("joins adjacent pieces and applies trim", () => {
    const pieces: GrassPiece[] = [
      { id: "a", widthM: 4, lengthM: 4, x: 0, y: 0, rotation: 0 },
      { id: "b", widthM: 4, lengthM: 4, x: toPixels(4), y: 0, rotation: 0 },
    ];
    const result = autoJoinAdjacentPieces(pieces);
    expect(result[0].joinedTo).toContain("b");
    expect(result[1].joinedTo).toContain("a");
    expect(result[0].trimEdges?.length).toBeGreaterThan(0);
    expect(result[1].trimEdges?.length).toBeGreaterThan(0);
  });

  it("leaves single piece unchanged", () => {
    const pieces: GrassPiece[] = [{ id: "1", widthM: 4, lengthM: 10, x: 0, y: 0, rotation: 0 }];
    const result = autoJoinAdjacentPieces(pieces);
    expect(result).toHaveLength(1);
    expect(result[0].joinedTo ?? []).toHaveLength(0);
  });
});

describe("validateCoverage", () => {
  it("returns coverage result for empty pieces", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    const result = validateCoverage(shape, []);
    expect(result.covered).toBe(false);
    expect(result.wastePercent).toBe(0);
  });

  it("returns coverage result for pieces covering shape", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    const pieces: GrassPiece[] = [
      { id: "1", widthM: 4, lengthM: 4, x: 0, y: 0, rotation: 0 },
    ];
    const laidOut = autoLayoutGrassPieces(shape, pieces);
    const result = validateCoverage(shape, laidOut);
    expect(result).toHaveProperty("covered");
    expect(result).toHaveProperty("wastePercent");
    expect(result).toHaveProperty("joinLengthM");
    expect(result).toHaveProperty("trimLengthM");
  });

  it("uses inner polygon when framePieceWidthCm is set", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    shape.calculatorInputs = { framePieceWidthCm: 10, framePieceLengthCm: 60 };
    const pieces: GrassPiece[] = [{ id: "1", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0 }];
    const laidOut = autoLayoutGrassPieces(shape, pieces);
    const result = validateCoverage(shape, laidOut);
    expect(result).toHaveProperty("covered");
    expect(result).toHaveProperty("wastePercent");
  });

  it("uses overlap model when trimEdges is set (dimensions stay nominal, origin shifts)", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    const piece: GrassPiece = {
      id: "1",
      widthM: 4,
      lengthM: 10,
      x: 0,
      y: 0,
      rotation: 0,
      trimEdges: [0, 1, 2, 3],
    };
    const corners = getPieceCorners(piece);
    const wPx = corners[2].y - corners[0].y;
    const lPx = corners[1].x - corners[0].x;
    // Overlap model: dimensions stay nominal (4m × 10m)
    expect(wPx).toBe(toPixels(4));
    expect(lPx).toBe(toPixels(10));
    // Origin shifts by 2×TRIM (6cm) on edges 0 and 3
    const OVERLAP_PX = toPixels(0.06);
    expect(corners[0].x).toBe(-OVERLAP_PX);
    expect(corners[0].y).toBe(-OVERLAP_PX);
  });

  it("does not trim joined edges - no gap between adjacent rolls", () => {
    const l4 = toPixels(4);
    const pieces: GrassPiece[] = [
      { id: "a", widthM: 4, lengthM: 4, x: 0, y: 0, rotation: 0, trimEdges: [0] },
      { id: "b", widthM: 4, lengthM: 4, x: l4, y: 0, rotation: 0, trimEdges: [0] },
    ];
    const ca = getPieceCorners(pieces[0], pieces, 0);
    const cb = getPieceCorners(pieces[1], pieces, 1);
    const rightEdgeA = ca[1].x;
    const leftEdgeB = cb[0].x;
    expect(rightEdgeA).toBe(leftEdgeB);
  });

  it("getEffectiveTotalArea returns sum of effective piece areas (overlap model: nominal dimensions)", () => {
    const piece: GrassPiece = {
      id: "1",
      widthM: 4,
      lengthM: 10,
      x: 0,
      y: 0,
      rotation: 0,
      trimEdges: [0, 1, 2, 3],
    };
    const area = getEffectiveTotalArea([piece]);
    expect(area).toBe(4 * 10);
  });

  it("getEffectivePieceDimensionsForInput returns effective width/length for inputs (overlap model: nominal)", () => {
    const piece: GrassPiece = {
      id: "1",
      widthM: 4,
      lengthM: 10,
      x: 0,
      y: 0,
      rotation: 0,
      trimEdges: [0, 1, 2, 3],
    };
    const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(piece);
    expect(effectiveWidthM).toBe(4);
    expect(effectiveLengthM).toBe(10);
  });
});

describe("hitTestGrassPiece", () => {
  it("returns null when no pieces", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    shape.calculatorInputs = {};
    const result = hitTestGrassPiece({ x: 0, y: 0 }, shape);
    expect(result).toBeNull();
  });

  it("returns piece index when point inside piece", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    shape.calculatorInputs = {
      vizPieces: [{ id: "1", widthM: 4, lengthM: 4, x: 0, y: 0, rotation: 0 }],
    };
    const result = hitTestGrassPiece({ x: 100, y: 100 }, shape);
    expect(result).toBe(0);
  });
});

// Piece at (0,0) widthM=4 lengthM=10 rotation=0: corners (0,0) (800,0) (800,320) (0,320)
// lengthEdges [1,3]: edge 1 = right (800,0)->(800,320), edge 3 = left (0,320)->(0,0)
describe("hitTestGrassPieceEdge", () => {
  it("returns null when no pieces", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    shape.calculatorInputs = {};
    const result = hitTestGrassPieceEdge({ x: 0, y: 0 }, shape, 20);
    expect(result).toBeNull();
  });

  it("returns length_end when point near right edge (free end)", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    shape.calculatorInputs = {
      vizPieces: [{ id: "1", widthM: 4, lengthM: 10, x: 0, y: 0, rotation: 0 }],
    };
    const result = hitTestGrassPieceEdge({ x: 810, y: 160 }, shape, 20);
    expect(result).toEqual({ pieceIdx: 0, edge: "length_end" });
  });

  it("returns length_start when point near left edge (anchor end)", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    shape.calculatorInputs = {
      vizPieces: [{ id: "1", widthM: 4, lengthM: 10, x: 0, y: 0, rotation: 0 }],
    };
    const result = hitTestGrassPieceEdge({ x: -5, y: 160 }, shape, 20);
    expect(result).toEqual({ pieceIdx: 0, edge: "length_start" });
  });

  it("returns null when point too far from length edges", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    shape.calculatorInputs = {
      vizPieces: [{ id: "1", widthM: 4, lengthM: 10, x: 0, y: 0, rotation: 0 }],
    };
    const result = hitTestGrassPieceEdge({ x: 400, y: -50 }, shape, 20);
    expect(result).toBeNull();
  });
});

describe("snapGrassPieceToPolygon", () => {
  it("returns piece unchanged when shape not closed", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.closed = false;
    const piece: GrassPiece = { id: "1", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0 };
    const { snappedPiece, alignedPolyEdges } = snapGrassPieceToPolygon(piece, shape, 20);
    expect(snappedPiece.x).toBe(0);
    expect(snappedPiece.y).toBe(0);
    expect(alignedPolyEdges).toEqual([]);
  });

  it("returns valid result with alignedPolyEdges array", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    const piece: GrassPiece = {
      id: "1",
      widthM: 1,
      lengthM: 2,
      x: 0,
      y: 0,
      rotation: 0,
    };
    const { snappedPiece, alignedPolyEdges } = snapGrassPieceToPolygon(piece, shape, 50);
    expect(snappedPiece).toBeDefined();
    expect(Array.isArray(alignedPolyEdges)).toBe(true);
    expect(alignedPolyEdges.every((e) => typeof e === "number")).toBe(true);
  });

  it("returns piece unchanged when corners far from polygon", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    const piece: GrassPiece = {
      id: "1",
      widthM: 1,
      lengthM: 2,
      x: 1000,
      y: 1000,
      rotation: 0,
    };
    const { snappedPiece, alignedPolyEdges } = snapGrassPieceToPolygon(piece, shape, 20);
    expect(snappedPiece.x).toBe(1000);
    expect(snappedPiece.y).toBe(1000);
    expect(alignedPolyEdges).toEqual([]);
  });
});

describe("snapGrassPieceEdge", () => {
  it("returns piece unchanged when no nearby parallel edges", () => {
    const piece: GrassPiece = { id: "1", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0 };
    const others: GrassPiece[] = [
      { id: "2", widthM: 2, lengthM: 4, x: 500, y: 500, rotation: 0 },
    ];
    const { snappedPiece, nearEdge } = snapGrassPieceEdge(piece, others, 0, 50);
    expect(snappedPiece.x).toBe(0);
    expect(snappedPiece.y).toBe(0);
    expect(nearEdge).toBeNull();
  });

  it("snaps piece to nearby parallel edge of other piece", () => {
    const piece: GrassPiece = { id: "1", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0 };
    const other: GrassPiece = { id: "2", widthM: 2, lengthM: 4, x: toPixels(4) + 10, y: 0, rotation: 0 };
    const allPieces = [piece, other];
    const { snappedPiece, nearEdge } = snapGrassPieceEdge(piece, allPieces, 0, 50);
    expect(nearEdge).not.toBeNull();
    expect(nearEdge?.otherPieceIdx).toBe(1);
    expect(Math.abs(snappedPiece.x - piece.x) + Math.abs(snappedPiece.y - piece.y)).toBeGreaterThan(0);
  });
});

describe("getJoinedGroup", () => {
  it("returns single index when piece has no joinedTo", () => {
    const pieces: GrassPiece[] = [
      { id: "1", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0 },
    ];
    expect(getJoinedGroup(pieces, 0)).toEqual([0]);
  });

  it("returns both indices when pieces are joined", () => {
    const pieces: GrassPiece[] = [
      { id: "1", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0, joinedTo: ["2"] },
      { id: "2", widthM: 2, lengthM: 4, x: 320, y: 0, rotation: 0, joinedTo: ["1"] },
    ];
    expect(getJoinedGroup(pieces, 0)).toContain(0);
    expect(getJoinedGroup(pieces, 0)).toContain(1);
    expect(getJoinedGroup(pieces, 0).length).toBe(2);
  });

  it("returns chain of joined pieces", () => {
    const pieces: GrassPiece[] = [
      { id: "1", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0, joinedTo: ["2"] },
      { id: "2", widthM: 2, lengthM: 4, x: 320, y: 0, rotation: 0, joinedTo: ["1", "3"] },
      { id: "3", widthM: 2, lengthM: 4, x: 640, y: 0, rotation: 0, joinedTo: ["2"] },
    ];
    const group = getJoinedGroup(pieces, 0);
    expect(group).toContain(0);
    expect(group).toContain(1);
    expect(group).toContain(2);
    expect(group.length).toBe(3);
  });
});

describe("validateCoverage — joinLengthM and trimLengthM", () => {
  it("joinLengthM counts only joins whose midpoint is inside polygon", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    const pieces: GrassPiece[] = [
      { id: "1", widthM: 2, lengthM: 2, x: 0, y: 0, rotation: 0 },
      { id: "2", widthM: 2, lengthM: 2, x: toPixels(2), y: 0, rotation: 0 },
    ];
    const result = validateCoverage(shape, pieces);
    expect(result).toHaveProperty("joinLengthM");
    expect(typeof result.joinLengthM).toBe("number");
  });

  it("trimLengthM reflects edges outside polygon", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    const pieces: GrassPiece[] = [
      { id: "1", widthM: 4, lengthM: 4, x: -toPixels(1), y: -toPixels(1), rotation: 0 },
    ];
    const result = validateCoverage(shape, pieces);
    expect(result).toHaveProperty("trimLengthM");
    expect(typeof result.trimLengthM).toBe("number");
    expect(result.trimLengthM).toBeGreaterThan(0);
  });

  it("trimLengthM is smaller when piece is mostly inside polygon", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    const piecesInside: GrassPiece[] = [
      { id: "1", widthM: 1, lengthM: 1, x: toPixels(0.5), y: toPixels(0.5), rotation: 0 },
    ];
    const piecesOutside: GrassPiece[] = [
      { id: "1", widthM: 4, lengthM: 4, x: -toPixels(2), y: -toPixels(2), rotation: 0 },
    ];
    const resultInside = validateCoverage(shape, piecesInside);
    const resultOutside = validateCoverage(shape, piecesOutside);
    expect(resultInside.trimLengthM).toBeLessThan(resultOutside.trimLengthM);
  });
});

describe("drawGrassPieces", () => {
  function mockCtx(): CanvasRenderingContext2D {
    return {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      rect: () => {},
      clip: () => {},
      fill: () => {},
      stroke: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }),
      setLineDash: () => {},
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textAlign: "left",
      textBaseline: "alphabetic",
    } as unknown as CanvasRenderingContext2D;
  }

  const worldToScreen = (wx: number, wy: number) => ({ x: wx, y: wy });

  it("does nothing when no pieces", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    shape.calculatorInputs = {};
    const ctx = mockCtx();
    expect(() => drawGrassPieces(ctx, shape, worldToScreen, 1, false)).not.toThrow();
  });

  it("draws without throwing when pieces exist and isSelected", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    shape.calculatorInputs = {
      vizPieces: [{ id: "1", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0 }],
    };
    const ctx = mockCtx();
    expect(() => drawGrassPieces(ctx, shape, worldToScreen, 1, true)).not.toThrow();
  });

  it("draws without throwing when isSelected false (simplified fill)", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    shape.calculatorInputs = {
      vizPieces: [{ id: "1", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0 }],
    };
    const ctx = mockCtx();
    expect(() => drawGrassPieces(ctx, shape, worldToScreen, 1, false)).not.toThrow();
  });

  it("draws without throwing when framePieceWidthCm is set", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    shape.calculatorInputs = {
      vizPieces: [{ id: "1", widthM: 2, lengthM: 4, x: 0, y: 0, rotation: 0 }],
      framePieceWidthCm: 10,
      framePieceLengthCm: 60,
    };
    const ctx = mockCtx();
    expect(() => drawGrassPieces(ctx, shape, worldToScreen, 1, true)).not.toThrow();
  });
});
