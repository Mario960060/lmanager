import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Remote DB may lag behind repo migrations. PostgREST returns 400 when the request
 * body includes keys that are not in the schema cache (e.g. unknown column).
 */
export function isMissingOptionalColumnError(error: { message?: string; details?: string; code?: string } | null, columnName: string): boolean {
  if (!error) return false;
  const msg = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  const col = columnName.toLowerCase();
  if (!msg.includes(col)) return false;
  return (
    msg.includes("could not find") ||
    msg.includes("schema cache") ||
    msg.includes("unknown column") ||
    (msg.includes("column") && msg.includes("materials_delivered")) ||
    (msg.includes("column") && msg.includes("task_folders"))
  );
}

/** True if migration `20260328120000_canvas_event_sync.sql` (or equivalent) is applied. */
export async function databaseHasCanvasElementColumns(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("task_folders").select("canvas_element_id").limit(1);
  if (!error) return true;
  if (isMissingOptionalColumnError(error, "canvas_element_id")) return false;
  throw error;
}
