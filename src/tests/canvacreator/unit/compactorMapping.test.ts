import { describe, it, expect } from "vitest";
import {
  mapProjectCompactorToOption,
  COMPACTORS,
  type CompactorOption,
} from "../../../components/Calculator/CompactorSelector";

// ══════════════════════════════════════════════════════════════
// mapProjectCompactorToOption — DB compactor names
// ══════════════════════════════════════════════════════════════
describe("mapProjectCompactorToOption — DB compactor names", () => {
  it("maps DB compactor with 'small' in name to small_compactor", () => {
    const result = mapProjectCompactorToOption({ id: "db-1", name: "Small wacker" });
    expect(result?.id).toBe("small_compactor");
    expect(result?.name).toBe("Small compactor");
  });

  it("maps DB compactor with 'mały' in name to small_compactor", () => {
    const result = mapProjectCompactorToOption({ id: "db-2", name: "Ubijak mały" });
    expect(result?.id).toBe("small_compactor");
  });

  it("maps DB compactor with 'medium' in name to medium_compactor", () => {
    const result = mapProjectCompactorToOption({ id: "db-3", name: "Medium compactor" });
    expect(result?.id).toBe("medium_compactor");
    expect(result?.name).toBe("Medium compactor");
  });

  it("maps DB compactor with 'średni' in name to medium_compactor", () => {
    const result = mapProjectCompactorToOption({ id: "db-4", name: "Ubijak średni" });
    expect(result?.id).toBe("medium_compactor");
  });

  it("maps DB compactor with 'large' in name to large_compactor", () => {
    const result = mapProjectCompactorToOption({ id: "db-5", name: "Large wacker" });
    expect(result?.id).toBe("large_compactor");
  });

  it("maps DB compactor with 'walec' in name to maly_walec", () => {
    const result = mapProjectCompactorToOption({ id: "db-6", name: "Walec mały" });
    expect(result?.id).toBe("maly_walec");
    expect(result?.name).toBe("Small roller");
  });

  it("maps DB compactor with 'roller' in name to maly_walec", () => {
    const result = mapProjectCompactorToOption({ id: "db-7", name: "Small roller" });
    expect(result?.id).toBe("maly_walec");
  });
});

// ══════════════════════════════════════════════════════════════
// mapProjectCompactorToOption — static CompactorOption
// ══════════════════════════════════════════════════════════════
describe("mapProjectCompactorToOption — static CompactorOption", () => {
  it("returns same CompactorOption when given static one with matching id", () => {
    const staticOption: CompactorOption = {
      id: "small_compactor",
      name: "Small compactor",
      weightRange: "60–90 kg",
      width: 0.4,
      maxLayer: 5,
      tempoAvg: 55,
      normalizedTempo: 27.5,
      materialCoefficient: { sand: 1.0, type1: 1.2 },
    };
    const result = mapProjectCompactorToOption(staticOption);
    expect(result?.id).toBe("small_compactor");
    expect(result?.width).toBe(0.4);
  });

  it("returns medium_compactor when given static option with medium_compactor id", () => {
    const staticOption = COMPACTORS.find(c => c.id === "medium_compactor")!;
    const result = mapProjectCompactorToOption(staticOption);
    expect(result?.id).toBe("medium_compactor");
  });
});

// ══════════════════════════════════════════════════════════════
// mapProjectCompactorToOption — edge cases
// ══════════════════════════════════════════════════════════════
describe("mapProjectCompactorToOption — edge cases", () => {
  it("returns null for null input", () => {
    expect(mapProjectCompactorToOption(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(mapProjectCompactorToOption(undefined as any)).toBeNull();
  });

  it("returns null for object with no name", () => {
    expect(mapProjectCompactorToOption({ id: "x" })).toBeNull();
  });

  it("returns null for unknown name", () => {
    expect(mapProjectCompactorToOption({ id: "db-x", name: "Unknown wacker XYZ" })).toBeNull();
  });

  it("returns null for static option with unknown id not in COMPACTORS", () => {
    const fakeOption = { id: "fake_id", name: "Fake" } as CompactorOption;
    const result = mapProjectCompactorToOption(fakeOption);
    expect(result).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// COMPACTORS array integrity
// ══════════════════════════════════════════════════════════════
describe("COMPACTORS", () => {
  it("has 4 compactor options", () => {
    expect(COMPACTORS).toHaveLength(4);
  });

  it("contains small_compactor, medium_compactor, large_compactor, maly_walec", () => {
    const ids = COMPACTORS.map(c => c.id);
    expect(ids).toContain("small_compactor");
    expect(ids).toContain("medium_compactor");
    expect(ids).toContain("large_compactor");
    expect(ids).toContain("maly_walec");
  });

  it("each compactor has required fields", () => {
    for (const c of COMPACTORS) {
      expect(c.id).toBeDefined();
      expect(c.name).toBeDefined();
      expect(c.weightRange).toBeDefined();
      expect(c.width).toBeGreaterThan(0);
      expect(c.maxLayer).toBeGreaterThan(0);
      expect(c.tempoAvg).toBeGreaterThan(0);
      expect(c.materialCoefficient.sand).toBeDefined();
      expect(c.materialCoefficient.type1).toBeDefined();
    }
  });
});
