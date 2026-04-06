import React, { useEffect, useMemo, useState } from 'react';
import { useBackdropPointerDismiss } from '../hooks/useBackdropPointerDismiss';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, X, Save, Clock, Package, Wrench, Folder, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { translateTaskName, translateUnit } from '../lib/translationMap';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../themes/designTokens';
import { Button } from '../themes/uiComponents';

export type UnifiedDayTab = 'plan' | 'materials' | 'equipment';

type EventLite = { id: string; title: string; description?: string | null };

type TasksDoneRow = {
  id: string;
  name: string | null;
  task_name: string | null;
  unit: string | null;
  event_id: string | null;
  folder_id?: string | null;
  amount?: string | null;
  is_finished?: boolean | null;
  progress_completed?: number;
};

type TaskFolderRow = {
  id: string;
  name: string;
  sort_order: number | null;
  parent_folder_id: string | null;
  color: string | null;
};

type PlanTaskLocal = {
  key: string;
  tasksDoneId: string;
  quantity: string;
  priority: number;
  hourStart: number | null;
  hourEnd: number | null;
};

const PLAN_EDIT_ROLES = new Set(['Admin', 'boss', 'project_manager', 'Team_Leader']);

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseTaskAmountTotal(amountStr: string | null | undefined): number {
  if (!amountStr) return 0;
  const first = amountStr.trim().split(/\s+/)[0]?.replace(',', '.') ?? '';
  const n = parseFloat(first);
  return Number.isFinite(n) ? n : 0;
}

function isTaskWorkComplete(task: Pick<TasksDoneRow, 'amount' | 'is_finished' | 'progress_completed'>): boolean {
  if (task.is_finished) return true;
  const total = parseTaskAmountTotal(task.amount || '');
  if (total <= 0) return false;
  return (task.progress_completed ?? 0) >= total - 1e-6;
}

function isDiggingPrepFolder(f: Pick<TaskFolderRow, 'name' | 'sort_order'>): boolean {
  if ((f.sort_order ?? 0) < 0) return true;
  const n = (f.name || '').toLowerCase();
  if (n.includes('excavation') && n.includes('preparation')) return true;
  if (n.includes('digging') && n.includes('preparation')) return true;
  if (n.includes('kopan') && (n.includes('przygotow') || n.includes('preparation'))) return true;
  return false;
}

function isFolderTreeComplete(folderId: string, allTasks: TasksDoneRow[], folders: TaskFolderRow[]): boolean {
  const direct = allTasks.filter((t) => t.folder_id === folderId);
  const directOk = direct.length === 0 || direct.every((t) => isTaskWorkComplete(t));
  const children = folders.filter((f) => f.parent_folder_id === folderId);
  const childrenOk = children.every((c) => isFolderTreeComplete(c.id, allTasks, folders));
  return directOk && childrenOk;
}

function resolvePickerFolderKey(task: TasksDoneRow, folderById: Map<string, TaskFolderRow>): string | '__none__' {
  const fid = task.folder_id;
  if (!fid || !folderById.has(fid)) return '__none__';
  return fid;
}

function folderSubtreeHasPickableTasks(
  folderId: string,
  pickable: TasksDoneRow[],
  folders: TaskFolderRow[],
  folderById: Map<string, TaskFolderRow>
): boolean {
  if (pickable.some((t) => resolvePickerFolderKey(t, folderById) === folderId)) return true;
  return folders
    .filter((f) => f.parent_folder_id === folderId)
    .some((c) => folderSubtreeHasPickableTasks(c.id, pickable, folders, folderById));
}

function sortSiblingFoldersForPicker(
  siblings: TaskFolderRow[],
  allTasksForCompletion: TasksDoneRow[],
  allFolders: TaskFolderRow[]
): TaskFolderRow[] {
  return [...siblings].sort((a, b) => {
    const aComp = isFolderTreeComplete(a.id, allTasksForCompletion, allFolders);
    const bComp = isFolderTreeComplete(b.id, allTasksForCompletion, allFolders);
    if (aComp !== bComp) return aComp ? 1 : -1;
    if (!aComp) {
      const ae = isDiggingPrepFolder(a);
      const be = isDiggingPrepFolder(b);
      if (ae !== be) return ae ? -1 : 1;
    }
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    return a.name.localeCompare(b.name);
  });
}

function sortTasksForPickerRow(tasks: TasksDoneRow[], t: (k: string) => string): TasksDoneRow[] {
  return [...tasks].sort((a, b) => {
    const ac = isTaskWorkComplete(a);
    const bc = isTaskWorkComplete(b);
    if (ac !== bc) return ac ? 1 : -1;
    return taskDisplayName(a, t).localeCompare(taskDisplayName(b, t));
  });
}

function taskMatchesPickerSearch(task: TasksDoneRow, q: string, folderById: Map<string, TaskFolderRow>): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const name = (task.name || task.task_name || '').toLowerCase();
  if (name.includes(s)) return true;
  const fid = task.folder_id;
  if (fid && folderById.has(fid)) {
    const fn = (folderById.get(fid)!.name || '').toLowerCase();
    if (fn.includes(s)) return true;
  }
  return false;
}

function collectAncestorFolderIdsForPicker(folderId: string, folderById: Map<string, TaskFolderRow>): string[] {
  const ids: string[] = [];
  let cur: string | null = folderId;
  while (cur) {
    ids.push(cur);
    const f = folderById.get(cur);
    cur = f?.parent_folder_id ?? null;
  }
  return ids;
}

function taskDisplayName(row: TasksDoneRow, t: (k: string) => string) {
  const raw = row.name || row.task_name || '';
  return translateTaskName(raw, t) || raw || t('dashboard:day_plan_untitled_task');
}

type Props = {
  event: EventLite;
  date: Date;
  initialTab?: UnifiedDayTab;
  statusAccentColor: string;
  onClose: () => void;
};

const UnifiedEventDayModal: React.FC<Props> = ({ event, date, initialTab = 'plan', statusAccentColor, onClose }) => {
  const { t, i18n } = useTranslation(['dashboard', 'common', 'event', 'project', 'calculator']);
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const queryClient = useQueryClient();
  const { user, profile } = useAuthStore();
  const companyId = useAuthStore((s) => s.getCompanyId());
  const dateStr = format(date, 'yyyy-MM-dd');

  const canEditPlan = profile?.role != null && PLAN_EDIT_ROLES.has(profile.role);
  const canEditMaterialsEquipment = canEditPlan;

  const [activeTab, setActiveTab] = useState<UnifiedDayTab>(initialTab);
  const [dirtyPlan, setDirtyPlan] = useState(false);
  const [dirtyMaterials, setDirtyMaterials] = useState(false);
  const [dirtyEquipment, setDirtyEquipment] = useState(false);

  const [plannedTasks, setPlannedTasks] = useState<PlanTaskLocal[]>([]);
  const [planHydrated, setPlanHydrated] = useState(false);

  const [materialSearch, setMaterialSearch] = useState('');
  const [materialPick, setMaterialPick] = useState<Record<string, { selected: boolean; qty: string }>>({});
  const [orphanMaterials, setOrphanMaterials] = useState<Array<{ material: string; unit: string; selected: boolean; qty: string }>>([]);

  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [equipmentPick, setEquipmentPick] = useState<
    Record<string, { selected: boolean; qty: string; calendarRowIds: string[] }>
  >({});

  const { data: tasksDoneList = [] } = useQuery({
    queryKey: ['tasks_done_event_day_modal', event.id, companyId],
    queryFn: async () => {
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks_done')
        .select('id, name, task_name, unit, event_id, folder_id, amount, is_finished')
        .eq('event_id', event.id)
        .eq('company_id', companyId!)
        .order('created_at', { ascending: true });
      if (tasksError) throw tasksError;
      const list = tasksData || [];
      if (list.length === 0) return [] as TasksDoneRow[];

      const taskIds = list.map((t) => t.id);
      const { data: progRows, error: progError } = await supabase
        .from('task_progress_entries')
        .select('task_id, amount_completed')
        .in('task_id', taskIds)
        .eq('company_id', companyId!);
      if (progError) throw progError;

      const sumByTask = new Map<string, number>();
      for (const row of progRows || []) {
        if (!row.task_id) continue;
        sumByTask.set(row.task_id, (sumByTask.get(row.task_id) || 0) + (row.amount_completed || 0));
      }

      return list.map((task) => ({
        ...task,
        progress_completed: sumByTask.get(task.id) || 0,
      })) as TasksDoneRow[];
    },
    enabled: !!companyId && !!event.id,
  });

  const { data: taskFoldersList = [] } = useQuery({
    queryKey: ['task_folders_unified_day_modal', event.id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_folders')
        .select('id, name, sort_order, parent_folder_id, color')
        .eq('event_id', event.id)
        .eq('company_id', companyId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as TaskFolderRow[];
    },
    enabled: !!companyId && !!event.id,
  });

  const { data: planRows = [], isSuccess: planLoaded } = useQuery({
    queryKey: ['calendar_day_plan', event.id, dateStr, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_day_plan_blocks')
        .select(
          `
          id,
          start_hour,
          end_hour,
          sort_order,
          calendar_day_plan_block_tasks!block_id (
            id,
            tasks_done_id,
            planned_quantity,
            priority,
            sort_order
          )
        `
        )
        .eq('event_id', event.id)
        .eq('plan_date', dateStr)
        .eq('company_id', companyId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && !!event.id,
  });

  useEffect(() => {
    setPlanHydrated(false);
  }, [event.id, dateStr]);

  useEffect(() => {
    if (!planLoaded || planHydrated) return;
    const list = [...(planRows as Array<{
      id: string;
      start_hour: number | null;
      end_hour: number | null;
      sort_order: number;
      calendar_day_plan_block_tasks: Array<{
        tasks_done_id: string;
        planned_quantity: number | null;
        priority: number;
        sort_order: number;
      }> | null;
    }>)].sort((a, z) => a.sort_order - z.sort_order);
    const flat: PlanTaskLocal[] = [];
    for (const b of list) {
      const hs = b.start_hour !== null && b.end_hour !== null ? b.start_hour : null;
      const he = b.start_hour !== null && b.end_hour !== null ? b.end_hour : null;
      const taskRows = [...(b.calendar_day_plan_block_tasks || [])].sort((a, z) => z.priority - a.priority || a.sort_order - z.sort_order);
      for (const row of taskRows) {
        flat.push({
          key: newKey(),
          tasksDoneId: row.tasks_done_id,
          quantity:
            row.planned_quantity !== null && row.planned_quantity !== undefined ? String(row.planned_quantity) : '',
          priority: row.priority,
          hourStart: hs,
          hourEnd: he,
        });
      }
    }
    setPlannedTasks(flat);
    setPlanHydrated(true);
  }, [planLoaded, planRows, planHydrated]);

  const { data: materialsCatalog = [] } = useQuery({
    queryKey: ['materials_catalog_unified', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('materials').select('id, name, unit').eq('company_id', companyId!).order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: calendarMaterialsRows = [] } = useQuery({
    queryKey: ['calendar_materials_unified', event.id, dateStr, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_materials')
        .select('id, material, quantity, unit')
        .eq('event_id', event.id)
        .eq('date', dateStr)
        .eq('company_id', companyId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && !!event.id,
  });

  const { data: equipmentList = [] } = useQuery({
    queryKey: ['equipment_unified', companyId, equipmentSearch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('company_id', companyId!)
        .ilike('name', `%${equipmentSearch}%`)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: calendarEquipmentRows = [] } = useQuery({
    queryKey: ['calendar_equipment_unified', event.id, dateStr, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_equipment')
        .select('id, equipment_id, quantity')
        .eq('event_id', event.id)
        .eq('date', dateStr)
        .eq('company_id', companyId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && !!event.id,
  });

  useEffect(() => {
    if (activeTab !== 'materials') return;
    const next: Record<string, { selected: boolean; qty: string }> = {};
    for (const m of materialsCatalog) {
      const row = (calendarMaterialsRows as Array<{ material: string; quantity: number }>).find((r) => r.material === m.name);
      next[m.id] = {
        selected: !!row,
        qty: row ? String(row.quantity) : '',
      };
    }
    setMaterialPick(next);
    const catalogNames = new Set((materialsCatalog as Array<{ name: string }>).map((m) => m.name));
    const merged = new Map<string, { material: string; unit: string; selected: boolean; qty: string }>();
    for (const r of calendarMaterialsRows as Array<{ material: string; quantity: number; unit: string }>) {
      if (catalogNames.has(r.material)) continue;
      const prev = merged.get(r.material);
      const addQty = r.quantity || 0;
      if (prev) {
        merged.set(r.material, {
          ...prev,
          qty: String(parseFloat(prev.qty) + addQty),
        });
      } else {
        merged.set(r.material, {
          material: r.material,
          unit: r.unit,
          selected: true,
          qty: String(addQty),
        });
      }
    }
    setOrphanMaterials(Array.from(merged.values()));
    setDirtyMaterials(false);
  }, [activeTab, materialsCatalog, calendarMaterialsRows]);

  useEffect(() => {
    if (activeTab !== 'equipment') return;
    const byEq: Record<string, { selected: boolean; qty: string; calendarRowIds: string[] }> = {};
    for (const eq of equipmentList) {
      const rows = (calendarEquipmentRows as Array<{ id: string; equipment_id: string | null; quantity: number | null }>).filter(
        (r) => r.equipment_id === eq.id
      );
      const qtySum = rows.reduce((s, r) => s + (r.quantity || 0), 0);
      byEq[eq.id] = {
        selected: rows.length > 0,
        qty: rows.length ? String(qtySum || 1) : '1',
        calendarRowIds: rows.map((r) => r.id),
      };
    }
    setEquipmentPick(byEq);
    setDirtyEquipment(false);
  }, [activeTab, equipmentList, calendarEquipmentRows]);

  const savePlanMutation = useMutation({
    mutationFn: async (tasksArg: PlanTaskLocal[]) => {
      if (!companyId || !canEditPlan) return;
      const tasksOrdered = [...tasksArg]
        .map((task, index) => ({ task, index }))
        .sort((a, b) => {
          if (b.task.priority !== a.task.priority) return b.task.priority - a.task.priority;
          return a.index - b.index;
        })
        .map(({ task }) => task);
      const { error: delErr } = await supabase
        .from('calendar_day_plan_blocks')
        .delete()
        .eq('event_id', event.id)
        .eq('plan_date', dateStr)
        .eq('company_id', companyId);
      if (delErr) throw delErr;

      let sortB = 0;
      for (const task of tasksOrdered) {
        const startH = task.hourStart !== null && task.hourEnd !== null ? task.hourStart : null;
        const endH = task.hourStart !== null && task.hourEnd !== null ? task.hourEnd : null;
        const { data: inserted, error: insB } = await supabase
          .from('calendar_day_plan_blocks')
          .insert({
            company_id: companyId,
            event_id: event.id,
            plan_date: dateStr,
            start_hour: startH,
            end_hour: endH,
            sort_order: sortB++,
          })
          .select('id')
          .single();
        if (insB) throw insB;
        const blockId = inserted!.id as string;
        const q = task.quantity.trim() === '' ? null : parseFloat(task.quantity);
        const planned = q !== null && !Number.isNaN(q) && q !== 0 ? q : null;
        const { error: insT } = await supabase.from('calendar_day_plan_block_tasks').insert({
          company_id: companyId,
          block_id: blockId,
          tasks_done_id: task.tasksDoneId,
          planned_quantity: planned,
          priority: task.priority,
          sort_order: 0,
        });
        if (insT) throw insT;
      }
    },
    onSuccess: () => {
      setDirtyPlan(false);
      queryClient.invalidateQueries({ queryKey: ['calendar_day_plan'] });
      queryClient.invalidateQueries({ queryKey: ['calendar_week_planned_tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar_day_plan_day_details'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_calendar_planned_tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar_day_plan_user_hours'] });
    },
  });

  const saveMaterialsMutation = useMutation({
    mutationFn: async (args: {
      pick: Record<string, { selected: boolean; qty: string }>;
      orphans: Array<{ material: string; unit: string; selected: boolean; qty: string }>;
      catalog: Array<{ id: string; name: string; unit: string }>;
    }) => {
      if (!companyId || !canEditMaterialsEquipment) return;
      const { error: delErr } = await supabase
        .from('calendar_materials')
        .delete()
        .eq('event_id', event.id)
        .eq('date', dateStr)
        .eq('company_id', companyId);
      if (delErr) throw delErr;

      const inserts: Array<{
        event_id: string;
        user_id: string | undefined;
        material: string;
        quantity: number;
        unit: string;
        date: string;
        company_id: string;
        notes: null;
      }> = [];

      for (const m of args.catalog) {
        const st = args.pick[m.id];
        if (!st?.selected) continue;
        const qty = parseFloat(st.qty);
        if (Number.isNaN(qty) || qty <= 0) continue;
        inserts.push({
          event_id: event.id,
          user_id: user?.id,
          material: m.name,
          quantity: qty,
          unit: m.unit,
          date: dateStr,
          company_id: companyId,
          notes: null,
        });
      }
      for (const o of args.orphans) {
        if (!o.selected) continue;
        const qty = parseFloat(o.qty);
        if (Number.isNaN(qty) || qty <= 0) continue;
        inserts.push({
          event_id: event.id,
          user_id: user?.id,
          material: o.material,
          quantity: qty,
          unit: o.unit,
          date: dateStr,
          company_id: companyId,
          notes: null,
        });
      }
      if (inserts.length) {
        const { error } = await supabase.from('calendar_materials').insert(inserts);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setDirtyMaterials(false);
      queryClient.invalidateQueries({ queryKey: ['calendar_materials'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_calendar_materials'] });
      queryClient.invalidateQueries({ queryKey: ['calendar_materials_unified'] });
      queryClient.invalidateQueries({ queryKey: ['calendar_materials_week'] });
    },
  });

  const saveEquipmentMutation = useMutation({
    mutationFn: async (args: {
      pick: Record<string, { selected: boolean; qty: string; calendarRowIds: string[] }>;
      equipmentRecords: Array<{
        id: string;
        name: string;
        type: string;
        quantity: number;
        in_use_quantity: number;
        status: string;
      }>;
    }) => {
      if (!companyId || !canEditMaterialsEquipment) return;
      const { pick, equipmentRecords } = args;
      for (const eq of equipmentRecords) {
        const st = pick[eq.id];
        const wasSelected = (st?.calendarRowIds?.length ?? 0) > 0;
        const want = st?.selected && parseInt(st.qty || '1', 10) >= 1;
        if (wasSelected && !want) {
          for (const rowId of st!.calendarRowIds) {
            const { data: row, error: fErr } = await supabase
              .from('calendar_equipment')
              .select('equipment_id, quantity')
              .eq('id', rowId)
              .single();
            if (fErr) throw fErr;
            const { error: dErr } = await supabase.from('calendar_equipment').delete().eq('id', rowId);
            if (dErr) throw dErr;
            const { data: eqRow, error: eqErr } = await supabase
              .from('equipment')
              .select('in_use_quantity, quantity')
              .eq('id', row!.equipment_id!)
              .single();
            if (eqErr) throw eqErr;
            const dec = row?.quantity || 0;
            const newUse = Math.max(0, (eqRow?.in_use_quantity ?? 0) - dec);
            const { error: uErr } = await supabase
              .from('equipment')
              .update({
                in_use_quantity: newUse,
                status: newUse <= 0 ? 'free_to_use' : 'in_use',
              })
              .eq('id', row!.equipment_id!);
            if (uErr) throw uErr;
          }
        }
      }

      for (const eq of equipmentRecords) {
        const st = pick[eq.id];
        if (!st?.selected) continue;
        const qty = Math.max(1, parseInt(st.qty || '1', 10));
        if ((st.calendarRowIds?.length ?? 0) > 0) continue;

        const available = (eq.quantity ?? 0) - (eq.in_use_quantity ?? 0);
        if (qty > available) throw new Error(t('calculator:only_units_available', { count: available }));

        const { error: eqUp } = await supabase
          .from('equipment')
          .update({
            status: 'in_use',
            in_use_quantity: (eq.in_use_quantity ?? 0) + qty,
          })
          .eq('id', eq.id);
        if (eqUp) throw eqUp;

        const { error: insErr } = await supabase.from('calendar_equipment').insert({
          event_id: event.id,
          equipment_id: eq.id,
          user_id: user?.id,
          date: dateStr,
          quantity: qty,
          notes: null,
          company_id: companyId,
        });
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      setDirtyEquipment(false);
      queryClient.invalidateQueries({ queryKey: ['calendar_equipment'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_calendar_equipment'] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['calendar_equipment_unified'] });
      queryClient.invalidateQueries({ queryKey: ['calendar_equipment_week'] });
    },
  });

  const handleClose = async () => {
    try {
      if (dirtyPlan && canEditPlan) await savePlanMutation.mutateAsync(plannedTasks);
      if (dirtyMaterials && canEditMaterialsEquipment)
        await saveMaterialsMutation.mutateAsync({
          pick: materialPick,
          orphans: orphanMaterials,
          catalog: materialsCatalog,
        });
      if (dirtyEquipment && canEditMaterialsEquipment)
        await saveEquipmentMutation.mutateAsync({ pick: equipmentPick, equipmentRecords: equipmentList });
    } catch (e) {
      console.error(e);
    }
    onClose();
  };

  const handleSaveTab = async () => {
    try {
      if (activeTab === 'plan' && dirtyPlan && canEditPlan) await savePlanMutation.mutateAsync(plannedTasks);
      if (activeTab === 'materials' && dirtyMaterials && canEditMaterialsEquipment)
        await saveMaterialsMutation.mutateAsync({
          pick: materialPick,
          orphans: orphanMaterials,
          catalog: materialsCatalog,
        });
      if (activeTab === 'equipment' && dirtyEquipment && canEditMaterialsEquipment)
        await saveEquipmentMutation.mutateAsync({ pick: equipmentPick, equipmentRecords: equipmentList });
    } catch (e) {
      console.error(e);
    }
  };

  const addPlannedTask = (task: TasksDoneRow) => {
    setPlannedTasks((p) => [
      ...p,
      {
        key: newKey(),
        tasksDoneId: task.id,
        quantity: '',
        priority: 1,
        hourStart: null,
        hourEnd: null,
      },
    ]);
    setDirtyPlan(true);
  };

  const removePlannedTask = (taskKey: string) => {
    setPlannedTasks((p) => p.filter((x) => x.key !== taskKey));
    setDirtyPlan(true);
  };

  const updatePlannedTask = (taskKey: string, patch: Partial<PlanTaskLocal>) => {
    setPlannedTasks((p) => p.map((x) => (x.key === taskKey ? { ...x, ...patch } : x)));
    setDirtyPlan(true);
  };

  const plannedTaskIdSet = useMemo(() => new Set(plannedTasks.map((p) => p.tasksDoneId)), [plannedTasks]);

  const plannedTasksSorted = useMemo(
    () =>
      [...plannedTasks]
        .map((task, index) => ({ task, index }))
        .sort((a, b) => {
          if (b.task.priority !== a.task.priority) return b.task.priority - a.task.priority;
          return a.index - b.index;
        })
        .map(({ task }) => task),
    [plannedTasks]
  );

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.toLowerCase();
    return materialsCatalog.filter((m: { name: string }) => m.name.toLowerCase().includes(q));
  }, [materialsCatalog, materialSearch]);

  const filteredEquipment = useMemo(() => {
    return equipmentList;
  }, [equipmentList]);

  const tabs: { key: UnifiedDayTab; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'plan', label: t('dashboard:day_plan_tab_plan'), icon: <Clock size={16} />, color: colors.accentBlue },
    { key: 'materials', label: t('dashboard:day_plan_tab_materials'), icon: <Package size={16} />, color: colors.green },
    { key: 'equipment', label: t('dashboard:day_plan_tab_equipment'), icon: <Wrench size={16} />, color: colors.amber },
  ];

  const materialSelectedCount = Object.values(materialPick).filter((x) => x.selected).length;
  const equipmentSelectedCount = Object.values(equipmentPick).filter((x) => x.selected).length;

  const backdropDismiss = useBackdropPointerDismiss(() => {
    void handleClose();
  }, true);

  return (
    <div
      ref={backdropDismiss.backdropRef}
      className="canvas-modal-backdrop"
      role="dialog"
      aria-modal
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: colors.bgModalBackdrop,
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing['5xl'],
      }}
      onPointerDown={backdropDismiss.onBackdropPointerDown}
    >
      <div
        onPointerDownCapture={backdropDismiss.onPanelPointerDownCapture}
        onClick={(e) => e.stopPropagation()}
        className="canvas-modal-content"
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: '92vh',
          background: colors.bgCard,
          border: `1px solid ${colors.borderMedium}`,
          borderRadius: radii['2xl'],
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: `${spacing['5xl']}px ${spacing['6xl']}px 0`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <div style={{ width: 4, height: 22, borderRadius: 2, background: statusAccentColor }} />
                <span style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textPrimary, fontFamily: fonts.display }}>
                  {event.title}
                </span>
              </div>
              <span style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body, marginLeft: 16, display: 'block', marginTop: 4 }}>
                {format(date, 'PPPP', { locale: dateLocale })}
              </span>
              {event.description ? (
                <span style={{ fontSize: fontSizes.sm, color: colors.textMuted, fontFamily: fonts.body, marginLeft: 16, display: 'block', marginTop: 2 }}>
                  {event.description}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={t('common:close')}
              onClick={handleClose}
              style={{
                width: 36,
                height: 36,
                minWidth: 36,
                minHeight: 36,
                borderRadius: radii.md,
                background: colors.bgSubtle,
                border: `1px solid ${colors.borderDefault}`,
                color: colors.textDim,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', borderBottom: `1px solid ${colors.borderDefault}` }}>
            {tabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1,
                    padding: `${spacing.md}px ${spacing.sm}px ${spacing['5xl']}px`,
                    background: 'transparent',
                    border: 'none',
                    borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent',
                    color: active ? tab.color : colors.textFaint,
                    fontSize: fontSizes.base,
                    fontWeight: active ? fontWeights.bold : fontWeights.medium,
                    fontFamily: fonts.display,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    marginBottom: -1,
                  }}
                >
                  <span style={{ display: 'flex', opacity: active ? 1 : 0.7 }}>{tab.icon}</span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: `${spacing['5xl']}px ${spacing['6xl']}px` }}>
          {activeTab === 'plan' && (
            <div>
              {!canEditPlan && (
                <p style={{ color: colors.textMuted, fontSize: fontSizes.sm, marginBottom: spacing['5xl'] }}>{t('dashboard:day_plan_view_only')}</p>
              )}

              {canEditPlan && (
                <div style={{ marginBottom: spacing['6xl'] }}>
                  <span
                    style={{
                      fontSize: fontSizes.base,
                      fontWeight: fontWeights.bold,
                      color: colors.textSecondary,
                      fontFamily: fonts.display,
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.sm,
                      marginBottom: spacing.md,
                    }}
                  >
                    <span style={{ color: colors.textFaint }} aria-hidden>
                      +
                    </span>
                    {t('dashboard:day_plan_section_add_tasks')}
                  </span>
                  <TaskPickerGroupedByFolder
                    tasks={tasksDoneList}
                    folders={taskFoldersList}
                    excludeTaskIds={plannedTaskIdSet}
                    onPick={addPlannedTask}
                    disabled={false}
                    t={t}
                  />
                </div>
              )}

              {plannedTasks.length > 0 && (
                <div>
                  <div style={{ height: 1, background: colors.borderDefault, marginBottom: spacing['5xl'] }} />
                  <span
                    style={{
                      fontSize: fontSizes.base,
                      fontWeight: fontWeights.bold,
                      color: colors.textSecondary,
                      fontFamily: fonts.display,
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.sm,
                      marginBottom: spacing.md,
                    }}
                  >
                    <span style={{ color: colors.textFaint }} aria-hidden>
                      📋
                    </span>
                    {t('dashboard:day_plan_section_scheduled_tasks', { count: plannedTasks.length })}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                    {plannedTasks.map((task) => {
                      const meta = tasksDoneList.find((x) => x.id === task.tasksDoneId);
                      const hasHours = task.hourStart !== null && task.hourEnd !== null;
                      const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`;
                      return (
                        <div
                          key={task.key}
                          style={{
                            padding: `${spacing.md}px ${spacing['5xl']}px`,
                            background: accentAlpha(0.05),
                            border: `1px solid ${accentAlpha(0.12)}`,
                            borderRadius: radii.md,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                            <span
                              style={{
                                fontSize: fontSizes.base,
                                fontWeight: fontWeights.bold,
                                color: colors.textSecondary,
                                fontFamily: fonts.display,
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {meta ? taskDisplayName(meta, t) : '…'}
                            </span>
                            {canEditPlan && (
                              <button
                                type="button"
                                onClick={() => removePlannedTask(task.key)}
                                style={{
                                  width: 36,
                                  height: 36,
                                  minWidth: 36,
                                  minHeight: 36,
                                  borderRadius: radii.md,
                                  background: 'transparent',
                                  border: 'none',
                                  color: colors.textFaint,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                                aria-label={t('common:remove')}
                              >
                                <X size={16} />
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                disabled={!canEditPlan}
                                value={task.quantity}
                                onChange={(e) => updatePlannedTask(task.key, { quantity: e.target.value })}
                                placeholder="0"
                                style={{
                                  width: 56,
                                  minHeight: 40,
                                  padding: '6px 6px',
                                  textAlign: 'center',
                                  background: colors.bgInput,
                                  border: `1px solid ${colors.borderDefault}`,
                                  borderRadius: radii.sm,
                                  color: colors.textPrimary,
                                  fontSize: fontSizes.base,
                                  fontFamily: fonts.body,
                                }}
                              />
                              <span style={{ fontSize: fontSizes.sm, color: colors.textDim, fontFamily: fonts.body }}>
                                {meta?.unit ? translateUnit(meta.unit, t) : ''}
                              </span>
                            </div>
                            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)' }} aria-hidden />
                            <div style={{ display: 'flex', gap: 2 }}>
                              {[1, 2, 3].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  disabled={!canEditPlan}
                                  onClick={() => updatePlannedTask(task.key, { priority: star })}
                                  style={{
                                    width: 40,
                                    height: 40,
                                    padding: 0,
                                    border: 'none',
                                    background: 'transparent',
                                    color: task.priority >= star ? colors.amber : colors.textFaint,
                                    fontSize: 16,
                                    cursor: canEditPlan ? 'pointer' : 'default',
                                  }}
                                  aria-label={t('dashboard:day_plan_priority_star', { n: star })}
                                >
                                  ★
                                </button>
                              ))}
                            </div>
                            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)' }} aria-hidden />
                            <InlineTimePicker
                              start={task.hourStart}
                              end={task.hourEnd}
                              disabled={!canEditPlan}
                              t={t}
                              onChange={(h) => updatePlannedTask(task.key, { hourStart: h.start, hourEnd: h.end })}
                            />
                          </div>
                          {hasHours && (
                            <div style={{ marginTop: spacing.sm, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                style={{
                                  fontSize: fontSizes.xs,
                                  fontWeight: fontWeights.semibold,
                                  color: colors.accentBlue,
                                  fontFamily: fonts.body,
                                  background: accentAlpha(0.1),
                                  padding: '2px 8px',
                                  borderRadius: radii.sm,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <Clock size={12} />
                                {fmtHour(task.hourStart!)} — {fmtHour(task.hourEnd!)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'materials' && (
            <div>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: 14, color: colors.textFaint }} />
                <input
                  value={materialSearch}
                  onChange={(e) => setMaterialSearch(e.target.value)}
                  placeholder={t('dashboard:day_plan_search_materials_placeholder')}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    padding: '12px 12px 12px 40px',
                    borderRadius: radii.md,
                    border: `1px solid ${colors.borderDefault}`,
                    background: colors.bgInput,
                    color: colors.textPrimary,
                    fontSize: fontSizes.base,
                  }}
                />
              </div>
              <div style={{ marginTop: spacing['5xl'], display: 'flex', flexDirection: 'column', gap: spacing.sm, maxHeight: 360, overflowY: 'auto' }}>
                {filteredMaterials.map((m: { id: string; name: string; unit: string }) => {
                  const st = materialPick[m.id] || { selected: false, qty: '' };
                  return (
                    <div
                      key={m.id}
                      style={{
                        padding: spacing['5xl'],
                        borderRadius: radii.md,
                        border: `1px solid ${st.selected ? colors.greenBorder : colors.borderDefault}`,
                        background: st.selected ? colors.greenBg : colors.bgSubtle,
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: spacing.md, cursor: canEditMaterialsEquipment ? 'pointer' : 'default' }}>
                        <input
                          type="checkbox"
                          disabled={!canEditMaterialsEquipment}
                          checked={st.selected}
                          onChange={(e) => {
                            setMaterialPick((p) => ({
                              ...p,
                              [m.id]: { selected: e.target.checked, qty: p[m.id]?.qty || '' },
                            }));
                            setDirtyMaterials(true);
                          }}
                          style={{ width: 22, height: 22 }}
                        />
                        <span style={{ fontWeight: fontWeights.semibold, color: colors.textSecondary, fontFamily: fonts.display }}>{m.name}</span>
                        <span style={{ fontSize: fontSizes.sm, color: colors.textFaint }}>[{translateUnit(m.unit, t)}]</span>
                      </label>
                      {st.selected && (
                        <div style={{ marginTop: spacing.md, display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>{t('event:quantity_label')}</span>
                          <input
                            type="number"
                            min={0.01}
                            step={0.01}
                            disabled={!canEditMaterialsEquipment}
                            value={st.qty}
                            onChange={(e) => {
                              setMaterialPick((p) => ({ ...p, [m.id]: { ...st, qty: e.target.value } }));
                              setDirtyMaterials(true);
                            }}
                            style={{
                              width: 100,
                              minHeight: 44,
                              padding: spacing.sm,
                              borderRadius: radii.md,
                              border: `1px solid ${colors.borderDefault}`,
                              background: colors.bgInput,
                              color: colors.textPrimary,
                            }}
                          />
                          <span style={{ fontSize: fontSizes.sm, color: colors.green, fontWeight: fontWeights.semibold }}>{translateUnit(m.unit, t)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {orphanMaterials.length > 0 && (
                <div style={{ marginTop: spacing['5xl'] }}>
                  <div style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textMuted, marginBottom: spacing.sm }}>
                    {t('dashboard:day_plan_materials_extra_catalog')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                    {orphanMaterials.map((o) => (
                      <div
                        key={o.material}
                        style={{
                          padding: spacing['5xl'],
                          borderRadius: radii.md,
                          border: `1px solid ${o.selected ? colors.greenBorder : colors.borderDefault}`,
                          background: o.selected ? colors.greenBg : colors.bgSubtle,
                        }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: spacing.md, cursor: canEditMaterialsEquipment ? 'pointer' : 'default' }}>
                          <input
                            type="checkbox"
                            disabled={!canEditMaterialsEquipment}
                            checked={o.selected}
                            onChange={(e) => {
                              setOrphanMaterials((list) =>
                                list.map((x) => (x.material === o.material ? { ...x, selected: e.target.checked } : x))
                              );
                              setDirtyMaterials(true);
                            }}
                            style={{ width: 22, height: 22 }}
                          />
                          <span style={{ fontWeight: fontWeights.semibold, color: colors.textSecondary, fontFamily: fonts.display }}>{o.material}</span>
                          <span style={{ fontSize: fontSizes.sm, color: colors.textFaint }}>[{translateUnit(o.unit, t)}]</span>
                        </label>
                        {o.selected && (
                          <div style={{ marginTop: spacing.md, display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>{t('event:quantity_label')}</span>
                            <input
                              type="number"
                              min={0.01}
                              step={0.01}
                              disabled={!canEditMaterialsEquipment}
                              value={o.qty}
                              onChange={(e) => {
                                setOrphanMaterials((list) =>
                                  list.map((x) => (x.material === o.material ? { ...x, qty: e.target.value } : x))
                                );
                                setDirtyMaterials(true);
                              }}
                              style={{
                                width: 100,
                                minHeight: 44,
                                padding: spacing.sm,
                                borderRadius: radii.md,
                                border: `1px solid ${colors.borderDefault}`,
                                background: colors.bgInput,
                                color: colors.textPrimary,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p style={{ marginTop: spacing.md, fontSize: fontSizes.sm, color: colors.textDim }}>
                {materialSelectedCount > 0
                  ? t('dashboard:day_plan_materials_selected', { count: materialSelectedCount })
                  : t('dashboard:day_plan_materials_hint')}
              </p>
            </div>
          )}

          {activeTab === 'equipment' && (
            <div>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: 14, color: colors.textFaint }} />
                <input
                  value={equipmentSearch}
                  onChange={(e) => setEquipmentSearch(e.target.value)}
                  placeholder={t('dashboard:day_plan_search_equipment_placeholder')}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    padding: '12px 12px 12px 40px',
                    borderRadius: radii.md,
                    border: `1px solid ${colors.borderDefault}`,
                    background: colors.bgInput,
                    color: colors.textPrimary,
                    fontSize: fontSizes.base,
                  }}
                />
              </div>
              <div style={{ marginTop: spacing['5xl'], display: 'flex', flexDirection: 'column', gap: spacing.sm, maxHeight: 360, overflowY: 'auto' }}>
                {filteredEquipment.map(
                  (eq: { id: string; name: string; type: string; quantity: number; in_use_quantity: number; status: string }) => {
                    const st = equipmentPick[eq.id] || { selected: false, qty: '1', calendarRowIds: [] };
                    const available = eq.quantity - eq.in_use_quantity;
                    const free = eq.status === 'free_to_use' || available > 0;
                    return (
                      <button
                        key={eq.id}
                        type="button"
                        disabled={!canEditMaterialsEquipment}
                        onClick={() => {
                          if (!canEditMaterialsEquipment) return;
                          setEquipmentPick((p) => ({
                            ...p,
                            [eq.id]: { ...st, selected: !st.selected },
                          }));
                          setDirtyEquipment(true);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.md,
                          padding: spacing['5xl'],
                          borderRadius: radii.md,
                          border: `1px solid ${st.selected ? colors.accentBlueBorder : colors.borderDefault}`,
                          background: st.selected ? colors.accentBlueBg : colors.bgSubtle,
                          cursor: canEditMaterialsEquipment ? 'pointer' : 'default',
                          textAlign: 'left',
                          width: '100%',
                        }}
                      >
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 4,
                            border: `2px solid ${st.selected ? colors.accentBlue : colors.textFaint}`,
                            background: st.selected ? colors.accentBlue : 'transparent',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: fontWeights.semibold, color: colors.textSecondary, fontFamily: fonts.display }}>{eq.name}</div>
                          <EquipmentTypeBadge type={eq.type} t={t} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: free ? colors.green : colors.red }} />
                          <span style={{ fontSize: fontSizes.sm, color: free ? colors.greenLight : colors.redLight }}>
                            {free ? t('event:available') : t('dashboard:day_plan_equipment_unavailable')}
                          </span>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
              <p style={{ marginTop: spacing.md, fontSize: fontSizes.sm, color: colors.textDim }}>
                {equipmentSelectedCount > 0
                  ? t('dashboard:day_plan_equipment_selected', { count: equipmentSelectedCount })
                  : t('dashboard:day_plan_equipment_hint')}
              </p>
            </div>
          )}
        </div>

        <div
          style={{
            padding: `${spacing['5xl']}px ${spacing['6xl']}px`,
            borderTop: `1px solid ${colors.borderDefault}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: spacing.md,
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}
        >
          <Button variant="secondary" onClick={handleClose}>
            {t('common:cancel')}
          </Button>
          {(activeTab === 'plan' && dirtyPlan && canEditPlan) ||
          (activeTab === 'materials' && dirtyMaterials && canEditMaterialsEquipment) ||
          (activeTab === 'equipment' && dirtyEquipment && canEditMaterialsEquipment) ? (
            <Button
              onClick={() => void handleSaveTab()}
              disabled={savePlanMutation.isPending || saveMaterialsMutation.isPending || saveEquipmentMutation.isPending}
            >
              <Save size={16} style={{ marginRight: 6 }} />
              {t('dashboard:day_plan_save_tab')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

function InlineTimePicker({
  start,
  end,
  disabled,
  t,
  onChange,
}: {
  start: number | null;
  end: number | null;
  disabled: boolean;
  t: (k: string) => string;
  onChange: (next: { start: number | null; end: number | null }) => void;
}) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const selectStyle: React.CSSProperties = {
    padding: '4px 6px',
    minHeight: 36,
    background: colors.bgInput,
    border: `1px solid ${colors.borderDefault}`,
    borderRadius: radii.sm,
    color: colors.accentBlue,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    fontFamily: fonts.display,
    outline: 'none',
    cursor: disabled ? 'default' : 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    textAlign: 'center',
    width: 72,
    opacity: disabled ? 0.85 : 1,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <select
        aria-label={t('dashboard:day_plan_time_from_short')}
        disabled={disabled}
        value={start ?? ''}
        onChange={(e) => {
          const v = e.target.value === '' ? null : Number(e.target.value);
          onChange({ start: v, end: v !== null && end !== null && end <= v ? null : end });
        }}
        style={selectStyle}
      >
        <option value="">{t('dashboard:day_plan_time_from_short')}</option>
        {hours.map((h) => (
          <option key={h} value={h}>
            {fmt(h)}
          </option>
        ))}
      </select>
      <span style={{ fontSize: fontSizes.xs, color: colors.textFaint }}>—</span>
      <select
        aria-label={t('dashboard:day_plan_time_to_short')}
        disabled={disabled}
        value={end ?? ''}
        onChange={(e) => {
          const v = e.target.value === '' ? null : Number(e.target.value);
          onChange({ start, end: v });
        }}
        style={selectStyle}
      >
        <option value="">{t('dashboard:day_plan_time_to_short')}</option>
        {hours.filter((h) => start === null || h > start).map((h) => (
          <option key={h} value={h}>
            {fmt(h)}
          </option>
        ))}
      </select>
      {!disabled && start !== null && end !== null && (
        <button
          type="button"
          onClick={() => onChange({ start: null, end: null })}
          style={{
            width: 28,
            height: 28,
            minWidth: 28,
            minHeight: 28,
            borderRadius: radii.sm,
            background: 'transparent',
            border: 'none',
            color: colors.textFaint,
            fontSize: 11,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label={t('dashboard:day_plan_clear_hours')}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function accentAlpha(a: number): string {
  return `rgba(59, 130, 246, ${a})`;
}

function EquipmentTypeBadge({ type, t }: { type: string; t: (k: string) => string }) {
  const lower = (type || '').toLowerCase();
  let bg = 'rgba(34,197,94,0.1)';
  let text = colors.greenLight;
  let border = 'rgba(34,197,94,0.2)';
  if (lower.includes('heavy') || lower.includes('cięż')) {
    bg = 'rgba(239,68,68,0.1)';
    text = colors.redLight;
    border = 'rgba(239,68,68,0.2)';
  } else if (lower.includes('medium') || lower.includes('śred')) {
    bg = 'rgba(249,115,22,0.1)';
    text = colors.orangeLight;
    border = 'rgba(249,115,22,0.2)';
  }
  return (
    <span
      style={{
        display: 'inline-block',
        marginTop: 4,
        fontSize: fontSizes.xs,
        fontWeight: fontWeights.bold,
        color: text,
        background: bg,
        border: `1px solid ${border}`,
        padding: '2px 8px',
        borderRadius: 4,
        textTransform: 'uppercase',
      }}
    >
      {type || t('dashboard:day_plan_equipment_type_unknown')}
    </span>
  );
}

function TaskPickerGroupedByFolder({
  tasks,
  folders,
  excludeTaskIds,
  onPick,
  disabled,
  t,
}: {
  tasks: TasksDoneRow[];
  folders: TaskFolderRow[];
  excludeTaskIds: Set<string>;
  onPick: (task: TasksDoneRow) => void;
  disabled: boolean;
  t: (k: string) => string;
}) {
  const [q, setQ] = useState('');
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const basePickable = useMemo(() => tasks.filter((task) => !excludeTaskIds.has(task.id)), [tasks, excludeTaskIds]);

  const pickableFiltered = useMemo(() => {
    if (!q.trim()) return basePickable;
    return basePickable.filter((task) => taskMatchesPickerSearch(task, q, folderById));
  }, [basePickable, q, folderById]);

  const noneTasks = useMemo(
    () =>
      sortTasksForPickerRow(
        pickableFiltered.filter((task) => resolvePickerFolderKey(task, folderById) === '__none__'),
        t
      ),
    [pickableFiltered, folderById, t]
  );

  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
  const [expandedOther, setExpandedOther] = useState(false);

  const toggleFolder = (id: string) => {
    setExpandedFolderIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setExpandedFolderIds(new Set());
      setExpandedOther(false);
      return;
    }
    const next = new Set<string>();
    for (const task of pickableFiltered) {
      const k = resolvePickerFolderKey(task, folderById);
      if (k === '__none__') continue;
      for (const id of collectAncestorFolderIdsForPicker(k, folderById)) {
        next.add(id);
      }
    }
    setExpandedFolderIds(next);
    if (noneTasks.length > 0) setExpandedOther(true);
  }, [q, pickableFiltered, folderById, noneTasks.length]);

  const renderFolderNodes = (parentId: string | null, depth: number): React.ReactNode[] => {
    const siblings = folders.filter((f) => f.parent_folder_id === parentId);
    const sorted = sortSiblingFoldersForPicker(siblings, tasks, folders);
    return sorted
      .filter((folder) => folderSubtreeHasPickableTasks(folder.id, pickableFiltered, folders, folderById))
      .map((folder, idx) => {
        const expanded = expandedFolderIds.has(folder.id);
        const directTasks = sortTasksForPickerRow(
          pickableFiltered.filter((task) => resolvePickerFolderKey(task, folderById) === folder.id),
          t
        );
        const childBlocks = expanded ? renderFolderNodes(folder.id, depth + 1) : [];
        const indent = 12 + depth * 14;
        const blockTop = depth === 0 ? (idx === 0 ? 0 : spacing.md) : spacing.sm;
        const headerPadLeft = Math.max(8, indent - 8);

        return (
          <div key={folder.id} style={{ marginTop: blockTop }}>
            <button
              type="button"
              onClick={() => toggleFolder(folder.id)}
              disabled={disabled}
              aria-expanded={expanded}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                width: '100%',
                padding: `10px 12px 10px ${headerPadLeft}px`,
                background: colors.bgSubtle,
                border: 'none',
                borderBottom: `1px solid ${colors.borderSubtle}`,
                cursor: disabled ? 'default' : 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <ChevronDown
                size={16}
                style={{
                  flexShrink: 0,
                  color: colors.accentBlue,
                  transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.15s ease',
                }}
                aria-hidden
              />
              <Folder size={16} style={{ color: folder.color || colors.accentBlue, flexShrink: 0 }} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: fontSizes.md,
                  fontWeight: fontWeights.extrabold,
                  color: colors.accentBlue,
                  fontFamily: fonts.display,
                }}
              >
                {folder.name}
              </span>
            </button>
            {expanded ? (
              <>
                {childBlocks.length > 0 ? <div>{childBlocks}</div> : null}
                {directTasks.length > 0 ? (
                  <div role="list" style={{ paddingLeft: indent + 10 }}>
                    {directTasks.map((task) => {
                      const done = isTaskWorkComplete(task);
                      return (
                        <button
                          key={task.id}
                          type="button"
                          role="listitem"
                          disabled={disabled}
                          onClick={() => onPick(task)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto',
                            alignItems: 'center',
                            gap: spacing.md,
                            width: '100%',
                            minHeight: 44,
                            padding: '10px 12px 10px 8px',
                            border: 'none',
                            borderBottom: `1px solid ${colors.borderSubtle}`,
                            background: 'transparent',
                            cursor: disabled ? 'default' : 'pointer',
                            textAlign: 'left',
                            opacity: done ? 0.72 : 1,
                          }}
                        >
                          <span style={{ fontFamily: fonts.display, fontWeight: fontWeights.semibold, fontSize: fontSizes.sm, color: colors.textSecondary }}>
                            {taskDisplayName(task, t)}{' '}
                            <span style={{ fontSize: fontSizes.xs, color: colors.textFaint, fontWeight: fontWeights.normal }}>
                              [{task.unit ? translateUnit(task.unit, t) : '—'}]
                            </span>
                          </span>
                          <span style={{ color: colors.accentBlue, fontSize: 18, fontWeight: fontWeights.bold }}>+</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        );
      });
  };

  const folderNodes = renderFolderNodes(null, 0);
  const hasFolders = folderNodes.length > 0;
  const hasAnything = hasFolders || noneTasks.length > 0;

  return (
    <>
      <div style={{ position: 'relative', marginBottom: spacing.sm }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: 14, color: colors.textFaint }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={disabled}
          placeholder={t('dashboard:day_plan_search_tasks_placeholder')}
          style={{
            width: '100%',
            minHeight: 48,
            padding: '12px 12px 12px 40px',
            borderRadius: radii.md,
            border: `1px solid ${colors.borderDefault}`,
            background: colors.bgInput,
            color: colors.textPrimary,
            fontSize: fontSizes.base,
          }}
        />
      </div>
      <div
        style={{
          maxHeight: 320,
          overflowY: 'auto',
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: radii.md,
          background: colors.bgInput,
        }}
      >
        {!hasAnything ? (
          <div style={{ padding: spacing['6xl'], textAlign: 'center', color: colors.textFaint, fontSize: fontSizes.base }}>
            {t('dashboard:day_plan_no_tasks_match')}
          </div>
        ) : (
          <>
            {folderNodes}
            {noneTasks.length > 0 ? (
              <div style={{ marginTop: hasFolders ? spacing['5xl'] : 0 }}>
                <button
                  type="button"
                  onClick={() => setExpandedOther((o) => !o)}
                  disabled={disabled}
                  aria-expanded={expandedOther}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    width: '100%',
                    padding: '10px 12px 10px 8px',
                    background: colors.bgSubtle,
                    border: 'none',
                    borderTop: hasFolders ? `1px solid ${colors.borderSubtle}` : undefined,
                    borderBottom: `1px solid ${colors.borderSubtle}`,
                    cursor: disabled ? 'default' : 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <ChevronDown
                    size={16}
                    style={{
                      flexShrink: 0,
                      color: colors.accentBlue,
                      transform: expandedOther ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 0.15s ease',
                    }}
                    aria-hidden
                  />
                  <Folder size={16} style={{ color: colors.accentBlue, flexShrink: 0 }} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: fontSizes.md,
                      fontWeight: fontWeights.extrabold,
                      color: colors.accentBlue,
                      fontFamily: fonts.display,
                    }}
                  >
                    {t('dashboard:day_plan_tasks_no_folder')}
                  </span>
                </button>
                {expandedOther ? (
                  <div role="list" style={{ paddingLeft: 22 }}>
                    {noneTasks.map((task) => {
                      const done = isTaskWorkComplete(task);
                      return (
                        <button
                          key={task.id}
                          type="button"
                          role="listitem"
                          disabled={disabled}
                          onClick={() => onPick(task)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto',
                            alignItems: 'center',
                            gap: spacing.md,
                            width: '100%',
                            minHeight: 44,
                            padding: '10px 12px 10px 8px',
                            border: 'none',
                            borderBottom: `1px solid ${colors.borderSubtle}`,
                            background: 'transparent',
                            cursor: disabled ? 'default' : 'pointer',
                            textAlign: 'left',
                            opacity: done ? 0.72 : 1,
                          }}
                        >
                          <span style={{ fontFamily: fonts.display, fontWeight: fontWeights.semibold, fontSize: fontSizes.sm, color: colors.textSecondary }}>
                            {taskDisplayName(task, t)}{' '}
                            <span style={{ fontSize: fontSizes.xs, color: colors.textFaint, fontWeight: fontWeights.normal }}>
                              [{task.unit ? translateUnit(task.unit, t) : '—'}]
                            </span>
                          </span>
                          <span style={{ color: colors.accentBlue, fontSize: 18, fontWeight: fontWeights.bold }}>+</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

export default UnifiedEventDayModal;
