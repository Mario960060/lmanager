/**
 * Podwójny mur (`double_wall`) — osobny podtyp; grubość z `outerWallType` / `innerWallType`.
 */
import { describe, it, expect } from "vitest";
import {
  getPolygonThicknessM,
  getDoubleWallSegmentThicknessM,
  shouldUseDoubleWallPerEdgeThickness,
} from "../../../projectmanagement/canvacreator/linearElements";
import { WALL_CALCULATOR_GROUPS } from "../../../projectmanagement/canvacreator/objectCard/calculatorGroups";
import type { Shape } from "../../../projectmanagement/canvacreator/geometry";
import enProject from "../../../locales/en/project.json";
import plProject from "../../../locales/pl/project.json";
import enNav from "../../../locales/en/nav.json";
import plNav from "../../../locales/pl/nav.json";

function wallShape(overrides: Partial<Shape>): Shape {
  return {
    points: [],
    closed: false,
    label: "W",
    layer: 2,
    lockedEdges: [],
    lockedAngles: [],
    heights: [],
    elementType: "wall",
    thickness: 0.1,
    ...overrides,
  };
}

describe("double_wall subtype", () => {
  it("is the second wall option in object card groups", () => {
    const wall = WALL_CALCULATOR_GROUPS[0];
    expect(wall.subTypes[1].type).toBe("double_wall");
  });

  it("getPolygonThicknessM: single brick stretcher = 0.10 m", () => {
    const inputs = { layingMethod: "standing", brickBond: "stretcher" as const };
    const brick = wallShape({
      calculatorSubType: "brick",
      calculatorInputs: inputs,
    });
    expect(getPolygonThicknessM(brick)).toBeCloseTo(0.1, 6);
  });

  it("getPolygonThicknessM: double_wall two brick stretcher leaves", () => {
    const inputs = {
      outerWallType: "brick" as const,
      innerWallType: "brick" as const,
      outerBrickBond: "stretcher" as const,
      innerBrickBond: "stretcher" as const,
      outerLayingMethod: "standing" as const,
      innerLayingMethod: "standing" as const,
      brickBond: "stretcher" as const,
    };
    const dw = wallShape({
      calculatorSubType: "double_wall",
      calculatorInputs: inputs,
    });
    expect(getPolygonThicknessM(dw)).toBeCloseTo(0.1 + 0.01 + 0.1, 6);
  });

  it("getPolygonThicknessM: double_wall brick stretcher + inner block4 standing", () => {
    const inputs = {
      outerWallType: "brick" as const,
      innerWallType: "block4" as const,
      outerBrickBond: "stretcher" as const,
      innerBrickBond: "stretcher" as const,
      outerLayingMethod: "standing" as const,
      innerLayingMethod: "standing" as const,
    };
    const dw = wallShape({
      calculatorSubType: "double_wall",
      calculatorInputs: inputs,
    });
    expect(getPolygonThicknessM(dw)).toBeCloseTo(0.1 + 0.01 + 0.1, 6);
  });

  it("getDoubleWallSegmentThicknessM: inner leaf only when outer heights 0 on segment", () => {
    const inputs = {
      height: "1",
      outerWallType: "brick" as const,
      innerWallType: "brick" as const,
      outerBrickBond: "stretcher" as const,
      innerBrickBond: "stretcher" as const,
      outerLayingMethod: "standing" as const,
      innerLayingMethod: "standing" as const,
      segmentHeights: [
        { startH: 1, endH: 1, outerStartH: 0, outerEndH: 0, innerStartH: 1, innerEndH: 1 },
      ],
    };
    const dw = wallShape({
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
      closed: false,
      calculatorSubType: "double_wall",
      calculatorInputs: inputs,
    });
    expect(shouldUseDoubleWallPerEdgeThickness(dw)).toBe(true);
    expect(getDoubleWallSegmentThicknessM(dw, 0)).toBeCloseTo(0.1, 6);
  });

  it("getDoubleWallSegmentThicknessM: 0 when both leaves off on segment", () => {
    const inputs = {
      height: "1",
      outerWallType: "brick" as const,
      innerWallType: "brick" as const,
      outerBrickBond: "stretcher" as const,
      innerBrickBond: "stretcher" as const,
      outerLayingMethod: "standing" as const,
      innerLayingMethod: "standing" as const,
      segmentHeights: [{ startH: 1, endH: 1, outerStartH: 0, outerEndH: 0, innerStartH: 0, innerEndH: 0 }],
    };
    const dw = wallShape({
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      closed: false,
      calculatorSubType: "double_wall",
      calculatorInputs: inputs,
    });
    expect(getDoubleWallSegmentThicknessM(dw, 0)).toBeCloseTo(0, 6);
  });

  it("legacy brick + cavityWall + inner block4 still resolves thickness", () => {
    const inputs = {
      layingMethod: "standing" as const,
      brickBond: "stretcher" as const,
      cavityWall: true,
      innerWallType: "block4" as const,
      innerLayingMethod: "standing" as const,
    };
    const brick = wallShape({ calculatorSubType: "brick", calculatorInputs: inputs });
    expect(getPolygonThicknessM(brick)).toBeCloseTo(0.1 + 0.01 + 0.1, 6);
  });

  it("UI i18n keys exist in bundled en/pl (object card, results, project list, nav)", () => {
    expect(enProject.calc_subtype_double_wall).toBeTruthy();
    expect(plProject.calc_subtype_double_wall).toBeTruthy();
    expect(enProject.results_subtype_double_wall).toBeTruthy();
    expect(plProject.results_subtype_double_wall).toBeTruthy();
    expect(enProject.double_wall).toBeTruthy();
    expect(plProject.double_wall).toBeTruthy();
    expect(enNav.double_wall_calculator).toBeTruthy();
    expect(plNav.double_wall_calculator).toBeTruthy();
  });
});
