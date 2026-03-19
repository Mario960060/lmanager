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

/** Tasks related to digging and preparation go into a separate folder (like ProjectCreating). */
function isDiggingOrPreparationTask(taskName: string): boolean {
  const n = (taskName || "").toLowerCase();
  return (
    n.includes("excavation") ||
    n.includes("digging") ||
    n.includes("preparation with") ||
    n.includes("loading tape1") ||
    n.includes("transporting soil") ||
    n.includes("transporting tape1") ||
    n.includes("transport tape1") ||
    n.includes("transport soil") ||
    n.includes("foundation excavation") ||
    n.includes("soil excavation")
  );
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

  /** Get unique folder name — each element gets its own folder (patio, wall, etc.).
   * Uses shape.label (element name from layer 2) as primary; falls back to results.name, calculatorType.
   * When duplicate names exist, appends " (2)", " (3)" so tasks don't merge. */
  function getUniqueFolderName(
    shape: Shape,
    results: NonNullable<Shape["calculatorResults"]>,
    createdFolders: Map<string, string>
  ): string {
    const baseName = (shape.label || "").trim() || results.name || shape.calculatorType || "Element";
    let folderName = baseName;
    let counter = 1;
    while (createdFolders.has(folderName)) {
      counter++;
      folderName = `${baseName} (${counter})`;
    }
    return folderName;
  }

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

  const EXCAVATION_FOLDER_NAME = "Digging and Preparation";

  /** Get or create the Digging and Preparation folder (like ProjectCreating). */
  async function getExcavationFolderId(): Promise<string | null> {
    if (createdFolders.has(EXCAVATION_FOLDER_NAME)) {
      return createdFolders.get(EXCAVATION_FOLDER_NAME) ?? null;
    }
    const { data: folder, error } = await supabase
      .from("task_folders")
      .insert({
        name: EXCAVATION_FOLDER_NAME,
        event_id: event.id,
        color: "#8B5CF6",
        sort_order: -1,
        company_id: companyId,
      })
      .select()
      .single();
    if (error || !folder) return null;
    createdFolders.set(EXCAVATION_FOLDER_NAME, folder.id);
    return folder.id;
  }

  // Process each shape with calculator results — each element (patio, wall, etc.) gets its own folder
  for (const shape of layer2Shapes) {
    const results = shape.calculatorResults;
    if (!results) continue;

    const folderName = getUniqueFolderName(shape, results, createdFolders);
    let folderId: string | null = null;

    const hasTasks = (results.taskBreakdown && results.taskBreakdown.length > 0) ||
      (results.hours_worked > 0 || (results.totalTime ?? 0) > 0);
    if (hasTasks) {
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
    const formatTaskAmount = (am: string | number | undefined, u: string | undefined) =>
      typeof am === 'string' && am.trim().includes(' ') ? am.trim() : `${am ?? 0} ${u ?? ''}`.trim();

    // Create tasks from taskBreakdown — digging tasks go to "Digging and Preparation" folder
    if (results.taskBreakdown) {
      for (const item of results.taskBreakdown) {
        if (!item.hours || item.hours <= 0) continue;

        const template = findTaskTemplate(taskTemplates, item.task);
        const templateId = item.event_task_id ?? template?.id ?? null;
        const useExcavationFolder = isDiggingOrPreparationTask(item.task ?? "");
        const taskFolderId = useExcavationFolder
          ? await getExcavationFolderId()
          : folderId;

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
          folder_id: taskFolderId,
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
        folder_id: folderId,
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
