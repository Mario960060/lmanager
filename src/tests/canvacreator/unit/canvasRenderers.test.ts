import { describe, it, expect } from "vitest";
import {
  getTypeBadgeText,
  getTypeBadgeColor,
} from "../../../projectmanagement/canvacreator/canvasRenderers";
import { C } from "../../../projectmanagement/canvacreator/geometry";

// ══════════════════════════════════════════════════════════════
// getTypeBadgeText
// ══════════════════════════════════════════════════════════════
describe("getTypeBadgeText", () => {
  it("returns '?' for undefined", () => {
    expect(getTypeBadgeText(undefined)).toBe("?");
  });

  it("returns correct abbreviations for all known types", () => {
    expect(getTypeBadgeText("slab")).toBe("SL");
    expect(getTypeBadgeText("concreteSlabs")).toBe("CS");
    expect(getTypeBadgeText("paving")).toBe("PV");
    expect(getTypeBadgeText("grass")).toBe("AG");
    expect(getTypeBadgeText("deck")).toBe("DK");
    expect(getTypeBadgeText("turf")).toBe("TF");
    expect(getTypeBadgeText("steps")).toBe("ST");
    expect(getTypeBadgeText("fence")).toBe("FC");
    expect(getTypeBadgeText("wall")).toBe("WL");
    expect(getTypeBadgeText("kerbs")).toBe("KB");
    expect(getTypeBadgeText("foundation")).toBe("FD");
  });

  it("returns first 2 chars uppercased for unknown types", () => {
    expect(getTypeBadgeText("something")).toBe("SO");
    expect(getTypeBadgeText("xyz")).toBe("XY");
  });
});

// ══════════════════════════════════════════════════════════════
// getTypeBadgeColor
// ══════════════════════════════════════════════════════════════
describe("getTypeBadgeColor", () => {
  it("returns textDim for undefined", () => {
    expect(getTypeBadgeColor(undefined)).toBe(C.textDim);
  });

  it("returns specific color for each known type", () => {
    expect(getTypeBadgeColor("slab")).toBe("#3498db");
    expect(getTypeBadgeColor("concreteSlabs")).toBe("#6b7280");
    expect(getTypeBadgeColor("paving")).toBe("#9b59b6");
    expect(getTypeBadgeColor("grass")).toBe("#27ae60");
    expect(getTypeBadgeColor("deck")).toBe("#8b4513");
    expect(getTypeBadgeColor("turf")).toBe("#2ecc71");
    expect(getTypeBadgeColor("steps")).toBe("#e74c3c");
  });

  it("returns C colors for linear element types", () => {
    expect(getTypeBadgeColor("fence")).toBe(C.fence);
    expect(getTypeBadgeColor("wall")).toBe(C.wall);
    expect(getTypeBadgeColor("kerbs")).toBe(C.kerb);
    expect(getTypeBadgeColor("foundation")).toBe(C.foundation);
  });

  it("returns accent for unknown type", () => {
    expect(getTypeBadgeColor("unknown_type")).toBe(C.accent);
  });
});
