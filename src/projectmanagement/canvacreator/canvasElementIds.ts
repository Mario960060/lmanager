import type { Shape } from "./geometry";

/** PostgreSQL `uuid` columns reject non-RFC4122 strings (400 from PostgREST). */
export function isValidCanvasElementUuid(id: string | undefined | null): boolean {
  if (!id || typeof id !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id.trim());
}

function randomUuidV4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function newCanvasElementId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return randomUuidV4();
}

/** Ensures every layer-2 shape has a stable UUID for DB sync (`canvas_element_id` on folders/materials). */
export function ensureCanvasElementIds(shapes: Shape[]): Shape[] {
  return shapes.map((s) => {
    if (s.layer !== 2) return s;
    if (isValidCanvasElementUuid(s.canvasElementId)) return s;
    return { ...s, canvasElementId: newCanvasElementId() };
  });
}
