/**
 * Canvas payload compression using pako (gzip).
 * Compresses before save, decompresses on load.
 * Fallback to raw JSON if compression fails.
 */

import pako from "pako";

export function compressCanvasPayload(payload: object): string {
  try {
    const json = JSON.stringify(payload);
    const compressed = pako.gzip(json, { level: 6 });
    return btoa(String.fromCharCode(...compressed));
  } catch {
    return "raw:" + JSON.stringify(payload);
  }
}

export function decompressCanvasPayload(encoded: string): object {
  try {
    if (encoded.startsWith("raw:")) {
      return JSON.parse(encoded.slice(4)) as object;
    }
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decompressed = pako.ungzip(bytes, { to: "string" });
    return JSON.parse(decompressed) as object;
  } catch (e) {
    console.error("Canvas decompression failed:", e);
    throw new Error("Failed to load canvas data");
  }
}
