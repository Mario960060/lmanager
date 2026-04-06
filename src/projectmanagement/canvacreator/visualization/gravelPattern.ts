// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/gravelPattern.ts
// Decorative gravel: cheap “scattered pebble” preview (layer 3)
// One small repeating bitmap + fill — not per-meter geometry.
// ══════════════════════════════════════════════════════════════

import { Point, Shape } from "../geometry";
import { getEffectivePolygon } from "../arcMath";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

export type VizGravelTone = "light" | "medium" | "dark" | "twoTone";

const TILE_PX = 56;

const patternCache = new Map<string, HTMLCanvasElement>();
const MAX_CACHE = 40;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function trimCache(): void {
  if (patternCache.size <= MAX_CACHE) return;
  const keys = [...patternCache.keys()];
  for (let i = 0; i < keys.length - MAX_CACHE / 2; i++) patternCache.delete(keys[i]!);
}

/** Single flat tone — bed + pebbles stay in one narrow band (no “salt & pepper”). */
const TONE_RGB: Record<Exclude<VizGravelTone, "twoTone">, { r: number; g: number; b: number }> = {
  light: { r: 232, g: 230, b: 226 },
  medium: { r: 132, g: 130, b: 127 },
  dark: { r: 48, g: 46, b: 44 },
};

function parseTone(raw: unknown): VizGravelTone {
  const s = String(raw ?? "medium");
  if (s === "light" || s === "medium" || s === "dark" || s === "twoTone") return s;
  return "medium";
}

/** Two-tone mix: light outline for readability. */
function drawPebbleWithStroke(
  tctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  fillR: number,
  fillG: number,
  fillB: number,
  dimA: number
): void {
  const strokeR = Math.max(0, fillR - 18);
  const strokeG = Math.max(0, fillG - 16);
  const strokeB = Math.max(0, fillB - 14);
  tctx.save();
  tctx.translate(x, y);
  tctx.rotate(rot);
  tctx.beginPath();
  tctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  tctx.fillStyle = `rgba(${fillR},${fillG},${fillB},${0.92 * dimA})`;
  tctx.fill();
  tctx.strokeStyle = `rgba(${strokeR},${strokeG},${strokeB},${0.32 * dimA})`;
  tctx.lineWidth = 0.55;
  tctx.stroke();
  tctx.restore();
}

/** One tone: fill only — no darker ring (avoids fake “second colour”). */
function drawPebbleMono(
  tctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  r: number,
  g: number,
  b: number,
  dimA: number
): void {
  tctx.save();
  tctx.translate(x, y);
  tctx.rotate(rot);
  tctx.beginPath();
  tctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  tctx.fillStyle = `rgba(${r},${g},${b},${0.94 * dimA})`;
  tctx.fill();
  tctx.restore();
}

function getSpeckleTile(gravelSize: string, tone: VizGravelTone, dimmed: boolean): HTMLCanvasElement {
  const key = `${gravelSize}|${tone}|${dimmed ? 1 : 0}|v3`;
  let cv = patternCache.get(key);
  if (cv) return cv;

  cv = document.createElement("canvas");
  cv.width = TILE_PX;
  cv.height = TILE_PX;
  const tctx = cv.getContext("2d");
  if (!tctx) return cv;

  const dimA = dimmed ? 0.72 : 1;
  const rand = mulberry32(hashString(key));

  const counts: Record<string, number> = { fine: 78, medium: 52, coarse: 34 };
  const count = counts[gravelSize] ?? counts.medium!;
  const rMin: Record<string, number> = { fine: 0.9, medium: 1.2, coarse: 1.6 };
  const rMax: Record<string, number> = { fine: 2.2, medium: 3.0, coarse: 4.2 };
  const rLo = rMin[gravelSize] ?? rMin.medium!;
  const rHi = rMax[gravelSize] ?? rMax.medium!;

  if (tone === "twoTone") {
    tctx.fillStyle = `rgba(168, 165, 160, ${0.4 * dimA})`;
    tctx.fillRect(0, 0, TILE_PX, TILE_PX);
    for (let i = 0; i < count; i++) {
      const x = rand() * TILE_PX;
      const y = rand() * TILE_PX;
      const rx = rLo + rand() * (rHi - rLo);
      const ry = rLo + rand() * (rHi - rLo) * (0.75 + rand() * 0.35);
      const rot = rand() * Math.PI;
      const useWhite = rand() < 0.5;
      if (useWhite) {
        drawPebbleWithStroke(tctx, x, y, rx, ry, rot, 248, 247, 245, dimA);
      } else {
        drawPebbleWithStroke(tctx, x, y, rx, ry, rot, 24, 24, 26, dimA);
      }
    }
  } else {
    const base = TONE_RGB[tone];
    const bedR = Math.max(0, base.r - 7);
    const bedG = Math.max(0, base.g - 7);
    const bedB = Math.max(0, base.b - 7);
    tctx.fillStyle = `rgba(${bedR},${bedG},${bedB},${0.55 * dimA})`;
    tctx.fillRect(0, 0, TILE_PX, TILE_PX);
    for (let i = 0; i < count; i++) {
      const x = rand() * TILE_PX;
      const y = rand() * TILE_PX;
      const rx = rLo + rand() * (rHi - rLo);
      const ry = rLo + rand() * (rHi - rLo) * (0.75 + rand() * 0.35);
      const rot = rand() * Math.PI;
      const d = Math.round((rand() - 0.5) * 2);
      drawPebbleMono(tctx, x, y, rx, ry, rot, base.r + d, base.g + d, base.b + d, dimA);
    }
  }

  patternCache.set(key, cv);
  trimCache();
  return cv;
}

/**
 * Layer 3 preview: repeating speckle fill clipped to polygon.
 * `calculatorInputs.gravelSize` + `vizGravelTone` (light|medium|dark|twoTone).
 */
export function drawGravelPattern(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  _zoom: number,
  dimmed: boolean
): void {
  if (shape.calculatorType !== "decorativeStones") return;

  const pts = getEffectivePolygon(shape) as Point[];
  if (pts.length < 3 || !shape.closed) return;

  const inputs = shape.calculatorInputs ?? {};
  const gravelSize = String(inputs.gravelSize ?? "medium");
  const gsz = gravelSize === "fine" || gravelSize === "coarse" ? gravelSize : "medium";

  let tone: VizGravelTone = parseTone(inputs.vizGravelTone);
  if (inputs.vizGravelTone == null && inputs.vizGravelLightness != null) {
    const L = Number(inputs.vizGravelLightness);
    if (Number.isFinite(L)) {
      if (L < 34) tone = "dark";
      else if (L < 67) tone = "medium";
      else tone = "light";
    }
  }

  let minSX = Infinity;
  let maxSX = -Infinity;
  let minSY = Infinity;
  let maxSY = -Infinity;
  for (const p of pts) {
    const s = worldToScreen(p.x, p.y);
    minSX = Math.min(minSX, s.x);
    maxSX = Math.max(maxSX, s.x);
    minSY = Math.min(minSY, s.y);
    maxSY = Math.max(maxSY, s.y);
  }

  const tile = getSpeckleTile(gsz, tone, dimmed);
  const pat = ctx.createPattern(tile, "repeat");
  if (!pat) return;

  ctx.save();
  ctx.beginPath();
  const s0 = worldToScreen(pts[0]!.x, pts[0]!.y);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < pts.length; i++) {
    const s = worldToScreen(pts[i]!.x, pts[i]!.y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.clip();

  const pad = TILE_PX;
  ctx.fillStyle = pat;
  ctx.fillRect(minSX - pad, minSY - pad, maxSX - minSX + pad * 2, maxSY - minSY + pad * 2);

  ctx.restore();
}
