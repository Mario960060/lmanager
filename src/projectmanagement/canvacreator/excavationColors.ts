// ══════════════════════════════════════════════════════════════
// HSL heatmap colors — excavation (blue) vs preparation (amber)
// ══════════════════════════════════════════════════════════════

/** HSL (hue deg, s/l 0–100) + alpha 0–1 → RGBA bytes for ImageData (unpremultiplied). */
function hslaToRgbaBytes(h: number, sPct: number, lPct: number, alpha: number): [number, number, number, number] {
  const s = Math.max(0, Math.min(100, sPct)) / 100;
  const l = Math.max(0, Math.min(100, lPct)) / 100;
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) {
    r = c;
    g = x;
  } else if (hh < 120) {
    r = x;
    g = c;
  } else if (hh < 180) {
    g = c;
    b = x;
  } else if (hh < 240) {
    g = x;
    b = c;
  } else if (hh < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    g = x;
  }
  const a = Math.max(0, Math.min(1, alpha));
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
    Math.round(255 * a),
  ];
}

/** value, min, max in cm; min is typically more negative (deeper / lower). */
export function excavationDepthToColor(value: number, minVal: number, maxVal: number): string {
  const range = maxVal - minVal;
  if (range === 0 || !Number.isFinite(range)) return "hsla(207, 65%, 70%, 0.35)";

  const t = (maxVal - value) / range;
  const lightness = 70 - t * 45;
  const saturation = 65 + t * 10;
  const alpha = 0.25 + t * 0.4;
  return `hsla(207, ${saturation}%, ${lightness}%, ${alpha})`;
}

export function preparationToColor(value: number, minVal: number, maxVal: number): string {
  const range = maxVal - minVal;
  if (range === 0 || !Number.isFinite(range)) return "hsla(38, 80%, 72%, 0.35)";

  const t = (maxVal - value) / range;
  const hue = 38 - t * 8;
  const saturation = 80 + t * 5;
  const lightness = 72 - t * 42;
  const alpha = 0.2 + t * 0.35;
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
}

/** Same mapping as excavationDepthToColor — for ImageData / smooth heatmap raster. */
export function excavationDepthToRgbaBytes(value: number, minVal: number, maxVal: number): [number, number, number, number] {
  const range = maxVal - minVal;
  if (range === 0 || !Number.isFinite(range)) return hslaToRgbaBytes(207, 65, 70, 0.35);

  const t = (maxVal - value) / range;
  const lightness = 70 - t * 45;
  const saturation = 65 + t * 10;
  const alpha = 0.25 + t * 0.4;
  return hslaToRgbaBytes(207, saturation, lightness, alpha);
}

/** Same mapping as preparationToColor — for ImageData / smooth heatmap raster. */
export function preparationToRgbaBytes(value: number, minVal: number, maxVal: number): [number, number, number, number] {
  const range = maxVal - minVal;
  if (range === 0 || !Number.isFinite(range)) return hslaToRgbaBytes(38, 80, 72, 0.35);

  const t = (maxVal - value) / range;
  const hue = 38 - t * 8;
  const saturation = 80 + t * 5;
  const lightness = 72 - t * 42;
  const alpha = 0.2 + t * 0.35;
  return hslaToRgbaBytes(hue, saturation, lightness, alpha);
}
