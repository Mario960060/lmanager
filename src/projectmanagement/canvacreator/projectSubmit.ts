// ══════════════════════════════════════════════════════════════
// projectSubmit — Aggregate shapes and save to Supabase
// ══════════════════════════════════════════════════════════════

import { SupabaseClient } from "@supabase/supabase-js";
import { Shape } from "./geometry";
import { ProjectSettings } from "./types";
import { ensureCanvasElementIds, isValidCanvasElementUuid } from "./canvasElementIds";
import { isMissingOptionalColumnError } from "../../lib/supabaseColumnFallback";

/** Supabase zwraca `{ message, code, details }` — nie zawsze `instanceof Error`; wtedy `throw x` psuje alert w UI. */
function supabaseErrMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && (e as { message?: unknown }).message != null) {
    return String((e as { message: unknown }).message);
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function throwSupabase(context: string, e: unknown): never {
  throw new Error(`${context}: ${supabaseErrMessage(e)}`);
}

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

/** Tasks related to digging and preparation go into the single shared event folder (Digging and Preparation). */
function isDiggingOrPreparationTask(taskName: string): boolean {
  const n = (taskName || "").toLowerCase();
  return (
    n.includes("excavation") ||
    n.includes("digging") ||
    n.includes("preparation with") ||
    n.includes("loading tape1") ||
    n.includes("loading soil") ||
    n.includes("loading sand") ||
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

  const shapesWithIds = ensureCanvasElementIds(shapes);
  const layer2Shapes = shapesWithIds.filter(
    (s) => s.layer === 2 && s.calculatorResults && !s.removedFromCanvas
  );
  if (layer2Shapes.length === 0) {
    throw new Error("No elements with calculator results to submit");
  }

  // Fetch task templates
  const { data: taskTemplates = [], error: taskErr } = await supabase
    .from("event_tasks_with_dynamic_estimates")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (taskErr) throwSupabase("event_tasks_with_dynamic_estimates", taskErr);

  const createdFolders = new Map<string, string>();

  const round2 = (v: number) => Math.round(v * 100) / 100;

  function taskLineHours(item: { hours?: number; normalizedHours?: number }): number {
    const raw = item?.hours ?? item?.normalizedHours;
    if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
    const n = parseFloat(String(raw ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  type DiggingAgg = {
    displayName: string;
    hours: number;
    event_task_id: string | null;
    amountSumTonnes: number;
    fallbackAmount: string | number | undefined;
    fallbackUnit: string | undefined;
  };

  const diggingAggregates = new Map<string, DiggingAgg>();

  function mergeDiggingLine(item: any) {
    const h = taskLineHours(item);
    if (h < 0) return;
    const key = (item.task || "").trim().toLowerCase();
    if (!key) return;
    const unit = (item.unit || "").toLowerCase();
    let tonnes = 0;
    if (unit.includes("tonne") || unit === "t" || unit.includes("ton")) {
      const a = item.amount;
      if (typeof a === "number" && !Number.isNaN(a)) tonnes = a;
      else if (typeof a === "string") {
        const m = a.replace(/,/g, ".").match(/([\d.]+)/);
        if (m) tonnes = parseFloat(m[1]);
      }
    }
    const prev = diggingAggregates.get(key);
    if (!prev) {
      diggingAggregates.set(key, {
        displayName: item.task || "",
        hours: round2(h),
        event_task_id: item.event_task_id ?? null,
        amountSumTonnes: round2(tonnes),
        fallbackAmount: item.amount,
        fallbackUnit: item.unit,
      });
    } else {
      prev.hours = round2(prev.hours + h);
      prev.amountSumTonnes = round2(prev.amountSumTonnes + tonnes);
      if (!prev.event_task_id && item.event_task_id) prev.event_task_id = item.event_task_id;
    }
  }

  const formatTaskAmount = (am: string | number | undefined, u: string | undefined) =>
    typeof am === "string" && am.trim().includes(" ") ? am.trim() : `${am ?? 0} ${u ?? ""}`.trim();

  /** Get unique folder name — each element gets its own folder (patio, wall, etc.).
   * Uses shape.label (element name from layer 2) as primary; falls back to results.name, calculatorType.
   * When duplicate names exist, appends " (2)", " (3)" so tasks don't merge. */
  function getUniqueFolderName(
    shape: Shape,
    results: NonNullable<Shape["calculatorResults"]>,
    folderNameMap: Map<string, string>
  ): string {
    let baseName = (shape.label || "").trim() || results.name || shape.calculatorType || "Element";
    if (baseName.trim().toLowerCase() === EXCAVATION_FOLDER_NAME.toLowerCase()) {
      baseName = `${baseName} (element)`;
    }
    let folderName = baseName;
    let counter = 1;
    while (folderNameMap.has(folderName)) {
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

  if (eventError) throwSupabase("events", eventError);

  const EXCAVATION_FOLDER_NAME = "Digging and Preparation";
  /** Osobny klucz w Map — żeby nie pomylić z elementem o nazwie „Digging and Preparation”. */
  const EXCAVATION_FOLDER_CACHE_KEY = "__sys_digging_and_preparation__";

  /** One shared folder per event for all digging/preparation tasks (canvas + event UI). */
  async function getExcavationFolderId(): Promise<string> {
    if (createdFolders.has(EXCAVATION_FOLDER_CACHE_KEY)) {
      const id = createdFolders.get(EXCAVATION_FOLDER_CACHE_KEY);
      if (!id) throw new Error("Digging folder cache missing");
      return id;
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
    if (error) {
      console.error("task_folders (Digging and Preparation):", error);
      throw new Error(
        error.message?.includes("permission") || error.code === "42501"
          ? "Brak uprawnień do utworzenia folderu zadań (task_folders). Zastosuj migrację RLS lub skontaktuj się z administratorem."
          : `Nie udało się utworzyć folderu „${EXCAVATION_FOLDER_NAME}”: ${error.message}`
      );
    }
    if (!folder?.id) throw new Error(`Nie udało się utworzyć folderu „${EXCAVATION_FOLDER_NAME}”.`);
    createdFolders.set(EXCAVATION_FOLDER_CACHE_KEY, folder.id);
    return folder.id;
  }

  // Process each shape with calculator results — each element (patio, wall, etc.) gets its own folder.
  // Digging/preparation lines are merged globally (one row per task name) under Digging and Preparation — not per element.
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

        if (folderError) {
          console.error("task_folders (element):", folderName, folderError);
          throw new Error(
            folderError.message?.includes("permission") || folderError.code === "42501"
              ? "Brak uprawnień do utworzenia folderów zadań. Zastosuj migrację bazy (task_folders INSERT) lub skontaktuj się z administratorem."
              : `Nie udało się utworzyć folderu „${folderName}”: ${folderError.message}`
          );
        }
        if (folder) {
          createdFolders.set(folderName, folder.id);
          folderId = folder.id;
        }
      } else {
        folderId = createdFolders.get(folderName) ?? null;
      }
    }

    // Create tasks from taskBreakdown — digging/preparation merged after the loop (not per-element task_name)
    if (results.taskBreakdown) {
      for (const item of results.taskBreakdown) {
        const lineHours = taskLineHours(item);
        /** DB: `tasks_done_hours_worked_check` requires hours_worked > 0; round2 can turn tiny positives into 0. */
        const hoursRounded = round2(lineHours);
        if (hoursRounded <= 0 && !isDiggingOrPreparationTask(item.task ?? "")) continue;

        if (isDiggingOrPreparationTask(item.task ?? "")) {
          mergeDiggingLine(item);
          continue;
        }

        if (hoursRounded <= 0) continue;

        const template = findTaskTemplate(taskTemplates, item.task);
        const templateId = item.event_task_id ?? template?.id ?? null;

        const { error: taskError } = await supabase.from("tasks_done").insert({
          event_id: event.id,
          user_id: userId,
          name: item.task,
          task_name: folderName,
          description: results.name || "",
          unit: item.unit || "",
          amount: formatTaskAmount(item.amount, item.unit),
          hours_worked: hoursRounded,
          is_finished: false,
          event_task_id: templateId,
          folder_id: folderId,
          company_id: companyId,
        });

        if (taskError) throwSupabase("tasks_done (element task)", taskError);
      }
    } else if (results.hours_worked > 0 || (results.totalTime ?? 0) > 0) {
      const taskHours = round2(results.hours_worked ?? results.totalTime ?? 0);
      if (taskHours > 0) {
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

        if (taskError) throwSupabase("tasks_done (rollup)", taskError);
      }
    }

    // Create materials
    if (results.materials) {
      for (const m of results.materials) {
        if (!m.quantity || m.quantity <= 0) continue;

        const totalAmt = round2(Number(m.quantity));
        if (!Number.isFinite(totalAmt) || totalAmt <= 0) continue;

        const unitStr = String(m.unit ?? "").trim() || "pieces";
        const canvasId = isValidCanvasElementUuid(shape.canvasElementId)
          ? shape.canvasElementId!
          : null;

        const baseMat = {
          event_id: event.id,
          amount: 0,
          total_amount: totalAmt,
          unit: unitStr,
          status: "pending" as const,
          name: m.name ?? "",
          company_id: companyId,
        };
        const withCanvas =
          canvasId != null ? { ...baseMat, canvas_element_id: canvasId } : baseMat;

        let { error: matError } = await supabase.from("materials_delivered").insert(withCanvas);
        if (
          matError &&
          canvasId != null &&
          isMissingOptionalColumnError(matError, "canvas_element_id")
        ) {
          ({ error: matError } = await supabase.from("materials_delivered").insert(baseMat));
        }
        if (matError) throwSupabase("materials_delivered", matError);
      }
    }
  }

  // Insert merged digging & preparation tasks once (shared folder, task_name = folder title — not element labels)
  if (diggingAggregates.size > 0) {
    const excavationFolderId = await getExcavationFolderId();
    for (const agg of diggingAggregates.values()) {
      const hoursForRow = round2(agg.hours);
      if (hoursForRow <= 0) continue;

      const template = findTaskTemplate(taskTemplates, agg.displayName);
      const templateId = agg.event_task_id ?? template?.id ?? null;
      const amountStr =
        agg.amountSumTonnes > 0.0001
          ? formatTaskAmount(agg.amountSumTonnes, "tonnes")
          : formatTaskAmount(agg.fallbackAmount, agg.fallbackUnit);

      const { error: taskError } = await supabase.from("tasks_done").insert({
        event_id: event.id,
        user_id: userId,
        name: agg.displayName,
        task_name: EXCAVATION_FOLDER_NAME,
        description: "",
        unit: agg.fallbackUnit || "",
        amount: amountStr,
        hours_worked: hoursForRow,
        is_finished: false,
        event_task_id: templateId,
        folder_id: excavationFolderId,
        company_id: companyId,
      });

      if (taskError) throwSupabase("tasks_done (digging merged)", taskError);
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

  if (invoiceError) throwSupabase("invoices", invoiceError);

  return event.id;
}
