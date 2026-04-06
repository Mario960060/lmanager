// ══════════════════════════════════════════════════════════════
// Sync canvas (layer-2 shapes) → existing event: folders, tasks, materials
// ══════════════════════════════════════════════════════════════

import { SupabaseClient } from "@supabase/supabase-js";
import type { Shape } from "./geometry";
import { ensureCanvasElementIds } from "./canvasElementIds";
import {
  databaseHasCanvasElementColumns,
  isMissingOptionalColumnError,
} from "../../lib/supabaseColumnFallback";

export const EXCAVATION_FOLDER_NAME = "Digging and Preparation";

function findTaskTemplate(taskTemplates: any[], taskName: string): any | null {
  const name = (taskName || "").trim().toLowerCase();
  return (
    taskTemplates.find((t) => t.name && (t.name || "").toLowerCase() === name) ??
    taskTemplates.find((t) => t.name && (t.name || "").toLowerCase().includes(name)) ??
    null
  );
}

export function isDiggingOrPreparationTask(taskName: string): boolean {
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

const round2 = (v: number) => Math.round(v * 100) / 100;

function taskLineHours(item: { hours?: number; normalizedHours?: number }): number {
  const raw = item?.hours ?? item?.normalizedHours;
  if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
  const n = parseFloat(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const formatTaskAmount = (am: string | number | undefined, u: string | undefined) =>
  typeof am === "string" && am.trim().includes(" ") ? am.trim() : `${am ?? 0} ${u ?? ""}`.trim();

type DiggingAgg = {
  displayName: string;
  hours: number;
  event_task_id: string | null;
  amountSumTonnes: number;
  fallbackAmount: string | number | undefined;
  fallbackUnit: string | undefined;
};

function mergeDiggingLine(aggregates: Map<string, DiggingAgg>, item: any) {
  const h = taskLineHours(item);
  if (h <= 0) return;
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
  const prev = aggregates.get(key);
  if (!prev) {
    aggregates.set(key, {
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

function getUniqueFolderName(
  shape: Shape,
  results: NonNullable<Shape["calculatorResults"]>,
  usedNames: Set<string>
): string {
  const baseName = (shape.label || "").trim() || results.name || shape.calculatorType || "Element";
  let folderName = baseName;
  let counter = 1;
  while (usedNames.has(folderName)) {
    counter++;
    folderName = `${baseName} (${counter})`;
  }
  usedNames.add(folderName);
  return folderName;
}

function normKey(s: string) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function taskHasProgress(
  supabase: SupabaseClient,
  taskId: string,
  companyId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from("task_progress_entries")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId)
    .eq("company_id", companyId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function materialHasDeliveries(supabase: SupabaseClient, materialId: string): Promise<boolean> {
  const { data, error } = await supabase.from("material_deliveries").select("amount").eq("material_id", materialId);
  if (error) throw error;
  const sum = (data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return sum > 0;
}

export async function folderOrElementHasActivity(
  supabase: SupabaseClient,
  eventId: string,
  companyId: string,
  folderId: string,
  canvasElementId: string | null
): Promise<boolean> {
  const { data: tasksInFolder, error: te } = await supabase
    .from("tasks_done")
    .select("id")
    .eq("folder_id", folderId)
    .eq("company_id", companyId);
  if (te) throw te;
  for (const t of tasksInFolder ?? []) {
    if (await taskHasProgress(supabase, t.id, companyId)) return true;
  }

  if (canvasElementId) {
    const { data: mats, error: me } = await supabase
      .from("materials_delivered")
      .select("id")
      .eq("event_id", eventId)
      .eq("company_id", companyId)
      .eq("canvas_element_id", canvasElementId);
    if (me) throw me;
    for (const m of mats ?? []) {
      if (await materialHasDeliveries(supabase, m.id)) return true;
    }
  }

  return false;
}

async function getNextBottomSortOrder(
  supabase: SupabaseClient,
  eventId: string,
  companyId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("task_folders")
    .select("sort_order")
    .eq("event_id", eventId)
    .eq("company_id", companyId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = data?.[0]?.sort_order ?? 0;
  return typeof max === "number" ? max + 1000 : 1000;
}

export interface SyncCanvasToEventParams {
  supabase: SupabaseClient;
  eventId: string;
  companyId: string;
  userId: string | undefined;
  shapes: Shape[];
}

/**
 * Updates tasks_done, task_folders, materials_delivered for an existing event from current canvas.
 * Call only after user confirms (plan save linked to event).
 */
export async function syncCanvasToEvent({
  supabase,
  eventId,
  companyId,
  userId,
  shapes,
}: SyncCanvasToEventParams): Promise<void> {
  const hasCanvasCols = await databaseHasCanvasElementColumns(supabase);
  if (!hasCanvasCols) {
    throw new Error(
      "Schemat bazy nie zawiera kolumn synchronizacji kanwy (np. canvas_element_id). " +
        "Uruchom migrację: supabase/migrations/20260328120000_canvas_event_sync.sql w Supabase (SQL Editor lub `supabase db push`)."
    );
  }

  const withIds = ensureCanvasElementIds(shapes);
  const layer2Shapes = withIds.filter(
    (s) => s.layer === 2 && s.calculatorResults && !s.removedFromCanvas
  );

  const { data: taskTemplates = [], error: taskErr } = await supabase
    .from("event_tasks_with_dynamic_estimates")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (taskErr) throw taskErr;

  const { data: foldersInitial = [], error: foldersErr } = await supabase
    .from("task_folders")
    .select("*")
    .eq("event_id", eventId)
    .eq("company_id", companyId);
  if (foldersErr) throw foldersErr;

  const { data: tasksInitial = [], error: tasksErr } = await supabase
    .from("tasks_done")
    .select("*")
    .eq("event_id", eventId)
    .eq("company_id", companyId);
  if (tasksErr) throw tasksErr;

  let allFolders = foldersInitial;
  const allTasksRef = tasksInitial;

  const activeCanvasIds = new Set(
    layer2Shapes.map((s) => s.canvasElementId).filter(Boolean) as string[]
  );

  for (const folder of foldersInitial) {
    if (!folder.canvas_element_id) continue;
    if (folder.removed_from_project_at) continue;
    if (activeCanvasIds.has(folder.canvas_element_id)) continue;

    const hasAct = await folderOrElementHasActivity(
      supabase,
      eventId,
      companyId,
      folder.id,
      folder.canvas_element_id
    );
    if (hasAct) {
      const sortOrder = await getNextBottomSortOrder(supabase, eventId, companyId);
      const { error } = await supabase
        .from("task_folders")
        .update({
          removed_from_project_at: new Date().toISOString(),
          progress_locked: true,
          sort_order: sortOrder,
        })
        .eq("id", folder.id)
        .eq("company_id", companyId);
      if (error) throw error;
    } else {
      const taskIds = allTasksRef.filter((t) => t.folder_id === folder.id).map((t) => t.id);
      for (const tid of taskIds) {
        const { error: delP } = await supabase.from("task_progress_entries").delete().eq("task_id", tid);
        if (delP) throw delP;
      }
      const { error: delT } = await supabase.from("tasks_done").delete().eq("folder_id", folder.id);
      if (delT) throw delT;

      const { data: mats } = await supabase
        .from("materials_delivered")
        .select("id")
        .eq("event_id", eventId)
        .eq("company_id", companyId)
        .eq("canvas_element_id", folder.canvas_element_id);
      for (const m of mats ?? []) {
        const { error: delMd } = await supabase.from("material_deliveries").delete().eq("material_id", m.id);
        if (delMd) throw delMd;
        const { error: delM } = await supabase.from("materials_delivered").delete().eq("id", m.id);
        if (delM) throw delM;
      }

      const { error: delF } = await supabase.from("task_folders").delete().eq("id", folder.id);
      if (delF) throw delF;
    }
  }

  const { data: foldersAfterOrphans = [], error: refetchFoldersErr } = await supabase
    .from("task_folders")
    .select("*")
    .eq("event_id", eventId)
    .eq("company_id", companyId);
  if (refetchFoldersErr) throw refetchFoldersErr;

  const { data: tasksAfterOrphans = [], error: refetchTasksErr } = await supabase
    .from("tasks_done")
    .select("*")
    .eq("event_id", eventId)
    .eq("company_id", companyId);
  if (refetchTasksErr) throw refetchTasksErr;

  allFolders = foldersAfterOrphans;

  const diggingAggregates = new Map<string, DiggingAgg>();
  const usedFolderNames = new Set<string>();

  for (let i = 0; i < layer2Shapes.length; i++) {
    const shape = layer2Shapes[i];
    const results = shape.calculatorResults;
    if (!results || !shape.canvasElementId) continue;

    const folderName = getUniqueFolderName(shape, results, usedFolderNames);

    if (results.taskBreakdown) {
      for (const item of results.taskBreakdown) {
        if (taskLineHours(item) <= 0) continue;
        if (isDiggingOrPreparationTask(item.task ?? "")) mergeDiggingLine(diggingAggregates, item);
      }
    }

    const hasTasks =
      (results.taskBreakdown && results.taskBreakdown.length > 0) ||
      results.hours_worked > 0 ||
      (results.totalTime ?? 0) > 0;

    let folderId: string | null = null;

    if (hasTasks) {
      const existing = allFolders.find(
        (f) => f.canvas_element_id === shape.canvasElementId && f.event_id === eventId
      );

      if (existing) {
        folderId = existing.id;
        const { error: upF } = await supabase
          .from("task_folders")
          .update({
            name: folderName,
            sort_order: i * 1000,
            removed_from_project_at: null,
            progress_locked: false,
            color: existing.color || "#3B82F6",
          })
          .eq("id", existing.id);
        if (upF) throw upF;
      } else {
        const folderBase = {
          name: folderName,
          event_id: eventId,
          color: "#3B82F6",
          sort_order: i * 1000,
          company_id: companyId,
        };
        const folderWithCanvas = { ...folderBase, canvas_element_id: shape.canvasElementId };
        let { data: created, error: insF } = await supabase
          .from("task_folders")
          .insert(folderWithCanvas)
          .select()
          .single();
        if (insF && isMissingOptionalColumnError(insF, "canvas_element_id")) {
          ({ data: created, error: insF } = await supabase
            .from("task_folders")
            .insert(folderBase)
            .select()
            .single());
        }
        if (insF) throw insF;
        folderId = created?.id ?? null;
        if (created) allFolders = [...allFolders, created as any];
      }
    }

    const { data: tasksInFolderRows = [] } = folderId
      ? await supabase
          .from("tasks_done")
          .select("*")
          .eq("folder_id", folderId)
          .eq("company_id", companyId)
      : { data: [] };
    const tasksInFolder = tasksInFolderRows;
    const desiredNonDiggingNames = new Set<string>();

    if (results.taskBreakdown && folderId) {
      for (const item of results.taskBreakdown) {
        const lineHours = taskLineHours(item);
        if (lineHours <= 0) continue;
        if (isDiggingOrPreparationTask(item.task ?? "")) continue;

        const tName = normKey(item.task ?? "");
        desiredNonDiggingNames.add(tName);

        const template = findTaskTemplate(taskTemplates, item.task);
        const templateId = item.event_task_id ?? template?.id ?? null;
        const amountStr = formatTaskAmount(item.amount, item.unit);

        const existingTask = tasksInFolder.find((t) => normKey(t.name ?? "") === tName);
        if (existingTask) {
          const { error: upT } = await supabase
            .from("tasks_done")
            .update({
              amount: amountStr,
              hours_worked: round2(lineHours),
              unit: item.unit || "",
              description: results.name || "",
              task_name: folderName,
              event_task_id: templateId,
            })
            .eq("id", existingTask.id);
          if (upT) throw upT;
        } else {
          const { error: insT } = await supabase.from("tasks_done").insert({
            event_id: eventId,
            user_id: userId,
            name: item.task,
            task_name: folderName,
            description: results.name || "",
            unit: item.unit || "",
            amount: amountStr,
            hours_worked: round2(lineHours),
            is_finished: false,
            event_task_id: templateId,
            folder_id: folderId,
            company_id: companyId,
          });
          if (insT) throw insT;
        }
      }
    } else if ((results.hours_worked > 0 || (results.totalTime ?? 0) > 0) && folderId) {
      const taskHours = round2(results.hours_worked ?? results.totalTime ?? 0);
      const template = findTaskTemplate(taskTemplates, folderName);
      desiredNonDiggingNames.add(normKey(folderName));

      const existingTask = tasksInFolder.find((t) => normKey(t.name ?? "") === normKey(folderName));
      if (existingTask) {
        const { error: upT } = await supabase
          .from("tasks_done")
          .update({
            amount: formatTaskAmount(results.amount, results.unit),
            hours_worked: taskHours,
            unit: results.unit || "",
            description: results.name || "",
            task_name: folderName,
            event_task_id: template?.id ?? null,
          })
          .eq("id", existingTask.id);
        if (upT) throw upT;
      } else {
        const { error: insT } = await supabase.from("tasks_done").insert({
          event_id: eventId,
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
        if (insT) throw insT;
      }
    }

    if (folderId) {
      const refreshedTasks = await supabase
        .from("tasks_done")
        .select("id, name")
        .eq("folder_id", folderId)
        .eq("company_id", companyId);
      const rows = refreshedTasks.data ?? [];
      for (const t of rows) {
        const nk = normKey(t.name ?? "");
        if (!desiredNonDiggingNames.has(nk)) {
          if (await taskHasProgress(supabase, t.id, companyId)) continue;
          const { error: delP } = await supabase.from("task_progress_entries").delete().eq("task_id", t.id);
          if (delP) throw delP;
          const { error: delT } = await supabase.from("tasks_done").delete().eq("id", t.id);
          if (delT) throw delT;
        }
      }
    }

    if (results.materials && shape.canvasElementId) {
      for (const m of results.materials) {
        if (!m.quantity || m.quantity <= 0) continue;

        const { data: existingMats } = await supabase
          .from("materials_delivered")
          .select("id")
          .eq("event_id", eventId)
          .eq("company_id", companyId)
          .eq("canvas_element_id", shape.canvasElementId)
          .eq("name", m.name)
          .eq("unit", m.unit)
          .limit(1);

        const em = existingMats?.[0];
        if (em) {
          const { error: mu } = await supabase
            .from("materials_delivered")
            .update({ total_amount: round2(m.quantity) })
            .eq("id", em.id);
          if (mu) throw mu;
        } else {
          const matBase = {
            event_id: eventId,
            amount: 0,
            total_amount: round2(m.quantity),
            unit: m.unit,
            status: "pending" as const,
            name: m.name,
            company_id: companyId,
          };
          const matWithCanvas = { ...matBase, canvas_element_id: shape.canvasElementId };
          let { error: mi } = await supabase.from("materials_delivered").insert(matWithCanvas);
          if (mi && isMissingOptionalColumnError(mi, "canvas_element_id")) {
            ({ error: mi } = await supabase.from("materials_delivered").insert(matBase));
          }
          if (mi) throw mi;
        }
      }
    }
  }

  let excavationFolderRow = allFolders.find((f) => f.name === EXCAVATION_FOLDER_NAME);
  let excavationFolderId: string | null = excavationFolderRow?.id ?? null;
  if (excavationFolderRow?.removed_from_project_at) {
    const { error: exUp } = await supabase
      .from("task_folders")
      .update({ removed_from_project_at: null, progress_locked: false })
      .eq("id", excavationFolderRow.id)
      .eq("company_id", companyId);
    if (exUp) throw exUp;
  }

  if (diggingAggregates.size > 0) {
    if (!excavationFolderId) {
      const { data: nf, error: nfe } = await supabase
        .from("task_folders")
        .insert({
          name: EXCAVATION_FOLDER_NAME,
          event_id: eventId,
          color: "#8B5CF6",
          sort_order: -1,
          company_id: companyId,
        })
        .select()
        .single();
      if (nfe) throw nfe;
      excavationFolderId = nf?.id ?? null;
    }

    const digTaskNames = new Set<string>();
    for (const agg of diggingAggregates.values()) {
      digTaskNames.add(normKey(agg.displayName));
      const template = findTaskTemplate(taskTemplates, agg.displayName);
      const templateId = agg.event_task_id ?? template?.id ?? null;
      const amountStr =
        agg.amountSumTonnes > 0.0001
          ? formatTaskAmount(agg.amountSumTonnes, "tonnes")
          : formatTaskAmount(agg.fallbackAmount, agg.fallbackUnit);

      const { data: existingDig } = await supabase
        .from("tasks_done")
        .select("id")
        .eq("event_id", eventId)
        .eq("folder_id", excavationFolderId)
        .eq("company_id", companyId)
        .eq("name", agg.displayName)
        .limit(1);

      const ex = existingDig?.[0];
      if (ex) {
        const { error: du } = await supabase
          .from("tasks_done")
          .update({
            amount: amountStr,
            hours_worked: agg.hours,
            unit: agg.fallbackUnit || "",
            event_task_id: templateId,
            task_name: EXCAVATION_FOLDER_NAME,
          })
          .eq("id", ex.id);
        if (du) throw du;
      } else {
        const { error: di } = await supabase.from("tasks_done").insert({
          event_id: eventId,
          user_id: userId,
          name: agg.displayName,
          task_name: EXCAVATION_FOLDER_NAME,
          description: "",
          unit: agg.fallbackUnit || "",
          amount: amountStr,
          hours_worked: agg.hours,
          is_finished: false,
          event_task_id: templateId,
          folder_id: excavationFolderId,
          company_id: companyId,
        });
        if (di) throw di;
      }
    }

    const { data: allDigTasks } = await supabase
      .from("tasks_done")
      .select("id, name")
      .eq("folder_id", excavationFolderId)
      .eq("company_id", companyId);
    for (const dt of allDigTasks ?? []) {
      if (digTaskNames.has(normKey(dt.name ?? ""))) continue;
      if (await taskHasProgress(supabase, dt.id, companyId)) continue;
      const { error: dlp } = await supabase.from("task_progress_entries").delete().eq("task_id", dt.id);
      if (dlp) throw dlp;
      const { error: dlt } = await supabase.from("tasks_done").delete().eq("id", dt.id);
      if (dlt) throw dlt;
    }
  } else if (excavationFolderId) {
    const { data: digTasks } = await supabase
      .from("tasks_done")
      .select("id")
      .eq("folder_id", excavationFolderId)
      .eq("company_id", companyId);
    for (const dt of digTasks ?? []) {
      if (await taskHasProgress(supabase, dt.id, companyId)) continue;
      const { error: dlp } = await supabase.from("task_progress_entries").delete().eq("task_id", dt.id);
      if (dlp) throw dlp;
      const { error: dlt } = await supabase.from("tasks_done").delete().eq("id", dt.id);
      if (dlt) throw dlt;
    }
  }
}
