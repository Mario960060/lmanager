/**
 * Plans (garden canvases) service - save, load, list
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "./database.types";
import { compressCanvasPayload, decompressCanvasPayload } from "./canvasCompression";

export type PlanRow = Database["public"]["Tables"]["plans"]["Row"];

export interface CanvasPayload {
  shapes: unknown[];
  projectSettings: unknown;
  pan: { x: number; y: number };
  zoom: number;
  activeLayer: number;
  linkedGroups?: unknown[][];
  savedAt?: string;
}

export async function listPlans(
  supabase: SupabaseClient<Database>,
  companyId: string
): Promise<PlanRow[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function loadPlan(
  supabase: SupabaseClient<Database>,
  planId: string
): Promise<CanvasPayload> {
  const { data, error } = await supabase
    .from("plans")
    .select("canvas_data_compressed")
    .eq("id", planId)
    .single();
  if (error) throw error;
  if (!data?.canvas_data_compressed) throw new Error("Plan not found");
  return decompressCanvasPayload(data.canvas_data_compressed) as CanvasPayload;
}

export async function savePlan(
  supabase: SupabaseClient<Database>,
  params: {
    planId: string | null;
    companyId: string;
    userId: string | undefined;
    title: string;
    payload: CanvasPayload;
  }
): Promise<string> {
  const compressed = compressCanvasPayload(params.payload);

  if (params.planId) {
    const { error } = await supabase
      .from("plans")
      .update({
        title: params.title,
        canvas_data_compressed: compressed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.planId)
      .eq("company_id", params.companyId);
    if (error) throw error;
    return params.planId;
  }

  const { data, error } = await supabase
    .from("plans")
    .insert({
      company_id: params.companyId,
      created_by: params.userId ?? null,
      title: params.title,
      canvas_data_compressed: compressed,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("Failed to create plan");
  return data.id;
}

export async function deletePlan(
  supabase: SupabaseClient<Database>,
  planId: string,
  companyId: string
): Promise<void> {
  const { error } = await supabase
    .from("plans")
    .delete()
    .eq("id", planId)
    .eq("company_id", companyId);
  if (error) throw error;
}

export async function linkPlanToEvent(
  supabase: SupabaseClient<Database>,
  planId: string,
  eventId: string,
  companyId: string
): Promise<void> {
  const { error } = await supabase
    .from("plans")
    .update({ event_id: eventId })
    .eq("id", planId)
    .eq("company_id", companyId);
  if (error) throw error;
}
