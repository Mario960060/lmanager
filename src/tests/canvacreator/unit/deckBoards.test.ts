import { describe, it, expect } from "vitest";
import { makeRectangle } from "../../../projectmanagement/canvacreator/geometry";
import { drawDeckPattern } from "../../../projectmanagement/canvacreator/visualization/deckBoards";

describe("deckBoards", () => {
  it("drawDeckPattern is a function", () => {
    expect(typeof drawDeckPattern).toBe("function");
  });

  it("drawDeckPattern does not throw with valid shape and inputs", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.layer = 2;
    shape.calculatorType = "deck";
    shape.calculatorInputs = {
      boardLength: "2",
      boardWidth: "15",
      jointGaps: "5",
      pattern: "Length",
      includeFrame: false,
    };
    const ctx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      clip: () => {},
      fillRect: () => {},
      fill: () => {},
      stroke: () => {},
      strokeRect: () => {},
      setLineDash: () => {},
    };
    const worldToScreen = (wx: number, wy: number) => ({ x: wx, y: wy });
    expect(() => drawDeckPattern(ctx as any, shape, worldToScreen, 1)).not.toThrow();
  });

  it("drawDeckPattern does not throw with Width pattern", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.calculatorType = "deck";
    shape.calculatorInputs = {
      boardLength: "2",
      boardWidth: "15",
      jointGaps: "5",
      pattern: "Width",
      includeFrame: false,
    };
    const ctx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      clip: () => {},
      fillRect: () => {},
      fill: () => {},
      stroke: () => {},
      strokeRect: () => {},
      setLineDash: () => {},
    };
    const worldToScreen = (wx: number, wy: number) => ({ x: wx, y: wy });
    expect(() => drawDeckPattern(ctx as any, shape, worldToScreen, 1)).not.toThrow();
  });

  it("drawDeckPattern does not throw with 45 degree angle pattern", () => {
    const shape = makeRectangle(0, 0, 2);
    shape.calculatorType = "deck";
    shape.calculatorInputs = {
      boardLength: "2",
      boardWidth: "15",
      jointGaps: "5",
      pattern: "45 degree angle",
      includeFrame: false,
    };
    const ctx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      clip: () => {},
      fillRect: () => {},
      fill: () => {},
      stroke: () => {},
      strokeRect: () => {},
      setLineDash: () => {},
    };
    const worldToScreen = (wx: number, wy: number) => ({ x: wx, y: wy });
    expect(() => drawDeckPattern(ctx as any, shape, worldToScreen, 1)).not.toThrow();
  });
});
