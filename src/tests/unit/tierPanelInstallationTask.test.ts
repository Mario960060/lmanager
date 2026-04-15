import { describe, it, expect } from "vitest";
import {
  getTierPanelInstallationTaskName,
  tierPanelSingleAreaM2,
} from "../../lib/tierPanelInstallationTask";

describe("tierPanelInstallationTask", () => {
  it("52×17 cm → area ~0.0884 m² → closest bucket 0.1m2", () => {
    expect(tierPanelSingleAreaM2(52, 17)).toBeCloseTo(0.0884, 4);
    expect(getTierPanelInstallationTaskName(52, 17)).toBe("Tier Panel Installation 0.1m2");
  });

  it("44×22 cm → area ~0.0968 m² → closest bucket 0.1m2", () => {
    expect(tierPanelSingleAreaM2(44, 22)).toBeCloseTo(0.0968, 4);
    expect(getTierPanelInstallationTaskName(44, 22)).toBe("Tier Panel Installation 0.1m2");
  });

  it("hypothetical 45×45 cm → 0.2025 m² → closest 0.2m2", () => {
    expect(getTierPanelInstallationTaskName(45, 45)).toBe("Tier Panel Installation 0.2m2");
  });

  it("hypothetical 60×55 cm → 0.33 m² → closest 0.3m2", () => {
    expect(getTierPanelInstallationTaskName(60, 55)).toBe("Tier Panel Installation 0.3m2");
  });
});
