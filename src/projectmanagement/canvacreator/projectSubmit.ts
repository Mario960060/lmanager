// ══════════════════════════════════════════════════════════════
// projectSubmit — Aggregate shapes and save to Supabase
// ══════════════════════════════════════════════════════════════

import { SupabaseClient } from "@supabase/supabase-js";
import { Shape } from "./geometry";
import { ProjectSettings } from "./types";

interface SubmitProjectParams {
  shapes: Shape[];
  projectSettings: ProjectSettings;
  supabase: SupabaseClient;
  companyId: string;
  userId: string | undefined;
}

function findTaskTemplate(taskTemplates: any[], taskName: string): any | null {
  const name = (taskName || "").trim().toLowerCase();
  return taskTemplates.find(
    (t) => t.name && (t.name || "").toLowerCase() === name
  ) ?? taskTemplates.find(
    (t) => t.name && (t.name || "").toLowerCase().includes(name)
  ) ?? null;
}

export async function submitProject({
  shapes,
  projectSettings,
  supabase,
  companyId,
  userId,
}: SubmitProjectParams): Promise<string> {
  if (!companyId) throw new Error("No company_id available");
  if (!projectSettings.title || !projectSettings.startDate || !projectSettings.endDate) {
    throw new Error("Please fill in title, start date, and end date");
  }

  const layer2Shapes = shapes.filter((s) => s.layer === 2 && s.calculatorResults);
  if (layer2Shapes.length === 0) {
    throw new Error("No elements with calculator results to submit");
  }

  // Fetch task templates
  const { data: taskTemplates = [], error: taskErr } = await supabase
    .from("event_tasks_with_dynamic_estimates")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (taskErr) throw taskErr;

  const createdFolders = new Map<string, string>();

  // Create event
  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      title: projectSettings.title,
      description: projectSettings.description,
      start_date: projectSettings.startDate,
      end_date: projectSettings.endDate,
      status: projectSettings.status,
      has_equipment: !!(
        projectSettings.selectedExcavator ||
        projectSettings.selectedCarrier ||
        projectSettings.selectedCompactor
      ),
      has_materials: layer2Shapes.some(
        (s) => s.calculatorResults?.materials?.length > 0
      ),
      created_by: userId,
      company_id: companyId,
    })
    .select()
    .single();

  if (eventError) throw eventError;

  // Process each shape with calculator results
  for (const shape of layer2Shapes) {
    const results = shape.calculatorResults;
    if (!results) continue;

    const folderName = shape.label || results.name || shape.calculatorType || "Element";
    let folderId: string | null = null;

    if (results.taskBreakdown && results.taskBreakdown.length > 0) {
      if (!createdFolders.has(folderName)) {
        const { data: folder, error: folderError } = await supabase
          .from("task_folders")
          .insert({
            name: folderName,
            event_id: event.id,
            color: "#3B82F6",
            sort_order: createdFolders.size,
            company_id: companyId,
          })
          .select()
          .single();

        if (!folderError && folder) {
          createdFolders.set(folderName, folder.id);
          folderId = folder.id;
        }
      } else {
        folderId = createdFolders.get(folderName) ?? null;
      }
    }

    const round2 = (v: number) => Math.round(v * 100) / 100;

    // Create tasks from taskBreakdown
    if (results.taskBreakdown) {
      for (const item of results.taskBreakdown) {
        if (!item.hours || item.hours <= 0) continue;

        const template = findTaskTemplate(taskTemplates, item.task);
        const templateId = item.event_task_id ?? template?.id ?? null;

        const formatTaskAmount = (am: string | number | undefined, u: string | undefined) =>
          typeof am === 'string' && am.trim().includes(' ') ? am.trim() : `${am ?? 0} ${u ?? ''}`.trim();
        const { error: taskError } = await supabase.from("tasks_done").insert({
          event_id: event.id,
          user_id: userId,
          name: item.task,
          task_name: folderName,
          description: results.name || "",
          unit: item.unit || "",
          amount: formatTaskAmount(item.amount, item.unit),
          hours_worked: round2(item.hours),
          is_finished: false,
          event_task_id: templateId,
          folder_id: folderId,
          company_id: companyId,
        });

        if (taskError) throw taskError;
      }
    } else if (results.hours_worked > 0 || (results.totalTime ?? 0) > 0) {
      const taskHours = round2(results.hours_worked ?? results.totalTime ?? 0);
      const template = findTaskTemplate(taskTemplates, folderName);

      const { error: taskError } = await supabase.from("tasks_done").insert({
        event_id: event.id,
        user_id: userId,
        name: folderName,
        task_name: folderName,
        description: results.name || "",
        unit: results.unit || "",
        amount: formatTaskAmount(results.amount, results.unit),
        hours_worked: taskHours,
        is_finished: false,
        event_task_id: template?.id ?? null,
        company_id: companyId,
      });

      if (taskError) throw taskError;
    }

    // Create materials
    if (results.materials) {
      for (const m of results.materials) {
        if (!m.quantity || m.quantity <= 0) continue;

        const { error: matError } = await supabase.from("materials_delivered").insert({
          event_id: event.id,
          amount: 0,
          total_amount: round2(m.quantity),
          unit: m.unit,
          status: "pending",
          name: m.name,
          company_id: companyId,
        });

        if (matError) throw matError;
      }
    }
  }

  // Create invoice
  const invoiceMainTasks = layer2Shapes.map((s, i) => ({
    id: `shape-${i}`,
    name: s.label || s.calculatorResults?.name || "Element",
    description: "",
    results: s.calculatorResults || { taskBreakdown: [], materials: [] },
  }));

  const { error: invoiceError } = await supabase.from("invoices").insert({
    project_id: event.id,
    company_id: companyId,
    main_tasks: invoiceMainTasks,
    main_breakdown: [],
    main_materials: [],
    minor_tasks: [],
    extra_materials: [],
    totals: { totalHours: 0 },
    additional_costs: [],
  } as any);

  if (invoiceError) throw invoiceError;

  return event.id;
}
