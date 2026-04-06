import { describe, it, expect } from "vitest";
import {
  MONOBLOCK_MIXES,
  getMonoblockMixById,
  defaultMonoblockMixEnabled,
  singleSizeToBlockCm,
} from "../../../projectmanagement/canvacreator/visualization/monoblockMix";

describe("monoblockMix", () => {
  it("singleSizeToBlockCm maps 20x10 and 10x10 to length/width along pattern", () => {
    expect(singleSizeToBlockCm("20x10")).toEqual({ blockLengthCm: 20, blockWidthCm: 10 });
    expect(singleSizeToBlockCm("10x10")).toEqual({ blockLengthCm: 10, blockWidthCm: 10 });
  });

  it("getMonoblockMixById falls back to first mix for unknown id", () => {
    const m = getMonoblockMixById("unknown-id");
    expect(m.id).toBe(MONOBLOCK_MIXES[0].id);
  });

  it("defaultMonoblockMixEnabled has all piece keys true", () => {
    const d = defaultMonoblockMixEnabled();
    expect(d["20x10"] && d["10x10"] && d["5x10"]).toBe(true);
  });

  it("first mix lists 20, 10, 5 cm pieces with 10 cm row width", () => {
    const mix = MONOBLOCK_MIXES[0];
    expect(mix.rowWidthCm).toBe(10);
    expect(mix.staggerAlongCm).toBe(10);
    expect(mix.pieces.map((p) => p.lengthCm).sort((a, b) => b - a)).toEqual([20, 10, 5]);
  });
});
