import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { translateTaskName, translateMaterialName, translateUnit } from '../lib/translationMap';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Database } from '../lib/database.types';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, Clock, Package, AlertCircle, Wrench, Pencil, ChevronDown, ChevronUp, Folder, FolderPlus, MoreHorizontal, Edit2, Trash2, Move, ArrowUp, Edit, Plus, X, Loader2, ClipboardList, Users } from 'lucide-react';
import BackButton from '../components/BackButton';
import TaskProgressModal from '../components/TaskProgressModal';
import MaterialProgressModal from '../components/MaterialProgressModal';
import HoursWorkedModal from '../components/HoursWorkedModal';
import AdditionalFeatures from '../components/AdditionalFeatures';
import DatePicker from '../components/DatePicker';
import { Button } from '../themes/uiComponents';
import { colors, spacing, fonts, fontSizes, fontWeights, radii, transitions } from '../themes/designTokens';
import { getPlanIdForEvent, markCanvasElementRemovedOnPlan, removeCanvasElementsFromPlanHard } from '../lib/plansService';
import { folderOrElementHasActivity } from '../projectmanagement/canvacreator/projectSync';
import { EventMembersModal } from '../components/EventMembers/EventMembersModal';
import { canManageEventAssignmentsRole } from '../lib/eventMembers';

type Event = Database['public']['Tables']['events']['Row'];
type TaskDone = Database['public']['Tables']['tasks_done']['Row'];
type MaterialDelivered = Database['public']['Tables']['materials_delivered']['Row'] & {
  material_deliveries?: any[];
  total_amount: number;
  name: string;
  units?: Set<string>;
  description?: string | null;
};
type EquipmentUsage = {
  id: string;
  equipment_id: string;
  event_id: string;
  start_date: string;
  end_date: string;
  quantity: number;
  equipment: {
    id: string;
    name: string;
    description?: string | null;
    type: string;
    status: string;
    quantity: number;
    in_use_quantity: number;
  };
};

type TaskFolder = Database['public']['Tables']['task_folders']['Row'];

/** Wyświetla liczby z maksymalnie dwoma miejscami po przecinku (np. ilości materiałów). */
const formatQtyMax2 = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(n)
    : String(n);

/** YYYY-MM-DD z ISO lub krótkiej daty (DatePicker). */
function dateToYmd(isoOrYmd: string | null | undefined): string {
  if (!isoOrYmd) return '';
  const s = String(isoOrYmd).trim();
  return s.includes('T') ? s.split('T')[0]! : s.slice(0, 10);
}

function ymdToIsoUtc(ymd: string): string {
  if (!ymd) return ymd;
  return `${ymd}T00:00:00.000Z`;
}

const EventDetailsProgressBar = ({ value, color, height = 4 }: { value: number; color: string; height?: number }) => (
  <div style={{ width: "100%", height, borderRadius: height, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", borderRadius: height, background: color, transition: "width 0.4s ease" }} />
  </div>
);

const EventDetailsSectionCard = ({ title, icon, count, open, onOpenChange, headerActions, children }: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const accent = count != null ? "#8bb4ff" : undefined;
  return (
    <div style={{ background: colors.bgCard, borderRadius: 14, border: `1px solid ${colors.borderDefault}`, overflow: "hidden" }}>
      <div
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px", background: open ? "rgba(255,255,255,0.02)" : "transparent",
          transition: "background 0.15s ease",
        }}
      >
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          style={{
            flex: 1, display: "flex", alignItems: "center", gap: 10, border: "none", background: "transparent",
            cursor: "pointer", fontFamily: "inherit", padding: 0, textAlign: "left",
          }}
        >
          <span style={{ fontSize: 15, display: "flex" }}>{icon}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>{title}</span>
          {count != null && (
            <span style={{
              fontSize: 11.5, fontWeight: 700, color: accent || colors.accentBlue,
              background: `${accent || colors.accentBlue}15`, borderRadius: 10, padding: "2px 9px", minWidth: 20, textAlign: "center",
            }}>
              {count}
            </span>
          )}
          <ChevronDown style={{ width: 16, height: 16, color: colors.textDim, transition: "transform 0.2s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
        </button>
        {headerActions}
      </div>
      {open && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          {children}
        </div>
      )}
    </div>
  );
};

const EventDetails = () => {
  const { t } = useTranslation(['common', 'dashboard', 'utilities', 'project', 'event', 'calculator', 'material', 'units']);
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { user, profile } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const [showTaskProgressModal, setShowTaskProgressModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskDone | null>(null);
  const [showMaterialProgressModal, setShowMaterialProgressModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialDelivered | null>(null);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [releaseEquipmentId, setReleaseEquipmentId] = useState<string | null>(null);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'task' | 'material' | 'task_group' | 'folder', id: string, groupName?: string } | null>(null);
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({
    tasks: false,
    materials: false,
    equipment: false
  });

  // Folder management state
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showMoveFolderModal, setShowMoveFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<TaskFolder | null>(null);
  const [selectedTaskToMove, setSelectedTaskToMove] = useState<TaskDone | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    type: 'folder' | 'task';
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<{[key: string]: boolean}>({});
  const [showAddEquipmentModal, setShowAddEquipmentModal] = useState(false);
  const [selectedEquipmentToAdd, setSelectedEquipmentToAdd] = useState<any | null>(null);
  const [equipmentQuantity, setEquipmentQuantity] = useState(1);
  const [equipmentAddError, setEquipmentAddError] = useState<string | null>(null);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [editingUsageQuantity, setEditingUsageQuantity] = useState<number | null>(null);
  const [equipmentStartDate, setEquipmentStartDate] = useState<string>('');
  const [equipmentEndDate, setEquipmentEndDate] = useState<string>('');
  const [releaseEquipmentConfirm, setReleaseEquipmentConfirm] = useState<{ id: string; name: string } | null>(null);
  const [showEventMembersModal, setShowEventMembersModal] = useState(false);

  // Fetch event details
  const { data: event, isLoading: isEventLoading, isError: isEventError } = useQuery({
    queryKey: ['event', id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('events').select('*').eq('id', id).eq('company_id', companyId).single();
      if (error) throw error;
      return data as Event;
    },
    enabled: !!companyId && !!id,
    retry: false,
  });

  // Add mutation for updating event status
  const updateEventStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      // First update the event status
      const { error: eventError } = await supabase
        .from('events')
        .update({ status })
        .eq('id', id);

      if (eventError) throw eventError;

      // If the status is 'finished', update all associated equipment to 'free_to_use'
      if (status === 'finished') {
        const { data: equipmentUsage, error: equipmentError } = await supabase
          .from('equipment_usage')
          .select('equipment_id')
          .eq('event_id', id);

        if (equipmentError) throw equipmentError;

        if (equipmentUsage && equipmentUsage.length > 0) {
          const equipmentIds = equipmentUsage.map(usage => usage.equipment_id);
          
          const { error: updateError } = await supabase
            .from('equipment')
            .update({ status: 'free_to_use' })
            .in('id', equipmentIds)
            .eq('status', 'in_use');

          if (updateError) throw updateError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', id] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['equipment_usage'] });
      setStatusError(null);
    }
  });

  // Fetch tasks with progress
  const { data: tasks = [], isLoading: isTasksLoading } = useQuery({
    queryKey: ['tasks', id, companyId],
    queryFn: async () => {
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks_done')
        .select('*')
        .eq('event_id', id)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;

      // Fetch progress for each task
      const tasksWithProgress = await Promise.all(
        tasksData.map(async (task) => {
          const { data: progressData } = await supabase
            .from('task_progress_entries')
            .select('amount_completed, hours_spent')
            .eq('task_id', task.id)
            .eq('company_id', companyId);

          const totalCompleted = progressData?.reduce((sum, entry) => sum + entry.amount_completed, 0) || 0;
          const totalHoursSpent = progressData?.reduce((sum, entry) => sum + entry.hours_spent, 0) || 0;

          return {
            ...task,
            progress_completed: totalCompleted,
            hours_spent: totalHoursSpent
          };
        })
      );

      return tasksWithProgress;
    },
    enabled: !!companyId
  });

  // Fetch materials
  const { data: materials = [], isLoading: isMaterialsLoading } = useQuery({
    queryKey: ['materials', id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials_delivered')
        .select(`
          *,
          material_deliveries (
            amount,
            delivery_date,
            notes
          )
        `)
        .eq('event_id', id)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Create a map to consolidate materials by name only
      const materialsMap = new Map<string, MaterialDelivered>();

      // Helper function to normalize text for comparison
      const normalizeText = (text: string) => {
        return text?.toLowerCase().trim().replace(/\s+/g, ' ') || '';
      };

      // Consolidate materials with same name, regardless of unit
      data.forEach(material => {
        // Handle materials that might not have a name field
        const materialName = material.name || 'Unknown Material';
        
        // Create normalized key using only the name
        const normalizedName = normalizeText(materialName);
        
        if (materialsMap.has(normalizedName)) {
          const existing = materialsMap.get(normalizedName)!;
          // Add the amounts
          existing.total_amount += material.total_amount || material.amount;
          // Combine the deliveries
          existing.material_deliveries = [
            ...(existing.material_deliveries || []),
            ...(material.material_deliveries || [])
          ];
          // Keep track of all units for this material
          if (!existing.units) {
            existing.units = new Set();
          }
          existing.units.add(material.unit);
        } else {
          const newMaterial = {
            ...material,
            material_deliveries: material.material_deliveries || [],
            total_amount: material.total_amount || material.amount,
            name: materialName,
            units: new Set([material.unit])
          };
          materialsMap.set(normalizedName, newMaterial);
        }
      });

      // Convert map back to array and calculate delivered amounts
      const consolidatedMaterials = Array.from(materialsMap.values()).map(material => {
        // Convert units Set to array for display
        const unitsArray = Array.from(material.units || []);
        return {
        ...material,
        material_deliveries: material.material_deliveries || [],
        amount: material.material_deliveries 
            ? material.material_deliveries.reduce((sum: number, delivery: any) => sum + (delivery.amount || 0), 0)
            : 0,
          // Join all units for display
          unit: unitsArray.join(' / '),
          units: undefined // Remove the Set before returning
        };
      });

      return consolidatedMaterials as MaterialDelivered[];
    },
    enabled: !!companyId
  });

  // Fetch total hours (including additional tasks)
  const { data: totalHours = 0 } = useQuery({
    queryKey: ['total_hours', id],
    queryFn: async () => {
      // Fetch regular task hours
      const { data: regularHours, error: regularError } = await supabase
        .from('task_progress_entries')
        .select('hours_spent')
        .eq('event_id', id);

      if (regularError) throw regularError;

      // Fetch additional task hours from additional_task_progress_entries
      const { data: additionalHours, error: additionalError } = await supabase
        .from('additional_task_progress_entries')
        .select('hours_spent')
        .eq('event_id', id);

      if (additionalError) throw additionalError;

      const regularTotal = regularHours.reduce((sum, entry) => sum + entry.hours_spent, 0);
      const additionalTotal = additionalHours.reduce((sum, task) => sum + (task.hours_spent || 0), 0);
      
      return regularTotal + additionalTotal;
    },
  });

  // Fetch equipment usage for this event
  const { data: equipmentUsage = [], isLoading: isEquipmentLoading } = useQuery({
    queryKey: ['event_equipment', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_usage')
        .select(`
          id,
          equipment_id,
          event_id,
          start_date,
          end_date,
          quantity,
          equipment!inner (
            id,
            name,
            description,
            type,
            status,
            quantity,
            in_use_quantity
          )
        `)
        .eq('event_id', id)
        .eq('is_returned', false);

      if (error) throw error;
      return data as unknown as EquipmentUsage[];
    },
  });

  // Fetch all equipment for adding to event
  const { data: allEquipment = [], isLoading: isAllEquipmentLoading } = useQuery({
    queryKey: ['all_equipment', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('company_id', companyId)
        .order('name');

      if (error) throw error;
      return data;
    },
    enabled: !!companyId && showAddEquipmentModal
  });

  // Fetch task folders for this event
  const { data: folders = [], isLoading: isFoldersLoading } = useQuery({
    queryKey: ['task_folders', id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_folders')
        .select('*')
        .eq('event_id', id)
        .eq('company_id', companyId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data as TaskFolder[];
    },
    enabled: !!companyId && !!id
  });

  // Fetch additional tasks for progress calculation (separate key from AdditionalFeatures
  // which fetches full data with materials - same key caused cache to return data without materials)
  const { data: additionalTasks = [] } = useQuery({
    queryKey: ['additional_tasks', 'summary', id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('additional_tasks')
        .select('id, description, hours_needed, hours_spent, is_finished')
        .eq('event_id', id)
        .eq('company_id', companyId);

      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Mutation to release equipment (set to free_to_use)
  const releaseEquipmentMutation = useMutation({
    mutationFn: async (usageId: string) => {
      // First get the usage record to know the quantity and equipment_id
      const { data: usage, error: usageError } = await supabase
        .from('equipment_usage')
        .select('equipment_id, quantity')
        .eq('id', usageId)
        .single();

      if (usageError) {
        console.error('Error fetching usage:', usageError);
        throw usageError;
      }

      if (!usage) {
        throw new Error('Equipment usage not found');
      }

      // Get current equipment data
      const { data: equipment, error: equipmentError } = await supabase
        .from('equipment')
        .select('in_use_quantity, quantity')
        .eq('id', usage.equipment_id)
        .single();

      if (equipmentError) {
        console.error('Error fetching equipment:', equipmentError);
        throw equipmentError;
      }

      if (!equipment) {
        throw new Error('Equipment not found');
      }

      // Calculate new in_use_quantity
      const newInUseQuantity = Math.max(0, equipment.in_use_quantity - usage.quantity);
      
      // Start a transaction using multiple operations
      
      // 1. Update equipment_usage to mark as returned
      const { error: updateUsageError } = await supabase
        .from('equipment_usage')
        .update({ is_returned: true, return_date: new Date().toISOString() })
        .eq('id', usageId);

      if (updateUsageError) {
        console.error('Error updating usage:', updateUsageError);
        throw updateUsageError;
      }

      // 2. Update equipment status and in_use_quantity
      const { error: updateError } = await supabase
        .from('equipment')
        .update({ 
          status: newInUseQuantity > 0 ? 'in_use' : 'free_to_use',
          in_use_quantity: newInUseQuantity
        })
        .eq('id', usage.equipment_id);

      if (updateError) {
        console.error('Error updating equipment:', updateError);
        throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_equipment', id] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_equipment'] });
      setReleaseEquipmentId(null);
      setEquipmentError(null);
    },
    onError: (error: Error) => {
      console.error('Failed to release equipment:', error);
      setEquipmentError(error.message);
    }
  });

  // Mutation to add equipment to event (set to in_use)
  const addEquipmentToEventMutation = useMutation({
    mutationFn: async ({
      equipmentId,
      quantity,
      startDateYmd,
      endDateYmd,
    }: {
      equipmentId: string;
      quantity: number;
      startDateYmd: string;
      endDateYmd: string;
    }) => {
      if (!event) throw new Error('Event not found');

      // Check if there's enough available quantity
      const { data: currentEquipment } = await supabase
        .from('equipment')
        .select('quantity, in_use_quantity')
        .eq('id', equipmentId)
        .eq('company_id', companyId)
        .single();

      if (!currentEquipment) throw new Error('Equipment not found');

      const availableQuantity = currentEquipment.quantity - currentEquipment.in_use_quantity;
      if (quantity > availableQuantity) {
        throw new Error(`Not enough available units. Available: ${availableQuantity}`);
      }

      const { error: usageError } = await supabase
        .from('equipment_usage')
        .insert({
          equipment_id: equipmentId,
          event_id: event.id,
          start_date: ymdToIsoUtc(startDateYmd),
          end_date: ymdToIsoUtc(endDateYmd),
          quantity: quantity,
          is_returned: false,
          company_id: companyId
        });

      if (usageError) throw usageError;

      const newInUseQuantity = currentEquipment.in_use_quantity + quantity;
      const newStatus = newInUseQuantity >= currentEquipment.quantity ? 'in_use' : 'free_to_use';

      const { error: updateError } = await supabase
        .from('equipment')
        .update({
          in_use_quantity: newInUseQuantity,
          status: newStatus
        })
        .eq('id', equipmentId)
        .eq('company_id', companyId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_equipment', id] });
      queryClient.invalidateQueries({ queryKey: ['all_equipment', companyId] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setShowAddEquipmentModal(false);
      setSelectedEquipmentToAdd(null);
      setEquipmentQuantity(1);
      setEquipmentAddError(null);
      setEditingEquipmentId(null);
      setEditingUsageQuantity(null);
    },
    onError: (error: Error) => {
      console.error('Failed to add equipment:', error);
      setEquipmentAddError(error.message);
    }
  });

  const updateEquipmentUsageMutation = useMutation({
    mutationFn: async ({
      usageId,
      equipmentId,
      quantity,
      startDateYmd,
      endDateYmd,
      previousQuantity,
    }: {
      usageId: string;
      equipmentId: string;
      quantity: number;
      startDateYmd: string;
      endDateYmd: string;
      previousQuantity: number;
    }) => {
      const { data: currentEquipment, error: eqErr } = await supabase
        .from('equipment')
        .select('quantity, in_use_quantity')
        .eq('id', equipmentId)
        .eq('company_id', companyId)
        .single();

      if (eqErr || !currentEquipment) throw new Error('Equipment not found');

      const delta = quantity - previousQuantity;
      if (delta !== 0) {
        const newInUse = currentEquipment.in_use_quantity + delta;
        if (newInUse < 0 || newInUse > currentEquipment.quantity) {
          throw new Error(
            `Invalid quantity: available capacity is ${currentEquipment.quantity - currentEquipment.in_use_quantity + previousQuantity} for this assignment.`
          );
        }
      }

      const { error: usageError } = await supabase
        .from('equipment_usage')
        .update({
          start_date: ymdToIsoUtc(startDateYmd),
          end_date: ymdToIsoUtc(endDateYmd),
          quantity,
        })
        .eq('id', usageId);

      if (usageError) throw usageError;

      if (delta !== 0) {
        const newInUse = currentEquipment.in_use_quantity + delta;
        const newStatus = newInUse >= currentEquipment.quantity ? 'in_use' : 'free_to_use';
        const { error: upEq } = await supabase
          .from('equipment')
          .update({ in_use_quantity: newInUse, status: newStatus })
          .eq('id', equipmentId)
          .eq('company_id', companyId);
        if (upEq) throw upEq;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_equipment', id] });
      queryClient.invalidateQueries({ queryKey: ['all_equipment', companyId] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setShowAddEquipmentModal(false);
      setSelectedEquipmentToAdd(null);
      setEquipmentQuantity(1);
      setEquipmentAddError(null);
      setEditingEquipmentId(null);
      setEditingUsageQuantity(null);
    },
    onError: (error: Error) => {
      console.error('Failed to update equipment usage:', error);
      setEquipmentAddError(error.message);
    }
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      try {
        // First delete all task progress entries
        const { data: progressData, error: progressError } = await supabase
          .from('task_progress_entries')
          .delete()
          .eq('task_id', taskId)
          .eq('company_id', companyId)
          .select();

        if (progressError) {
          console.error('Error deleting task progress:', progressError);
          throw progressError;
        }

        // Then delete the task from tasks_done
        const { data: taskData, error: taskError } = await supabase
          .from('tasks_done')
          .delete()
          .eq('id', taskId)
          .eq('company_id', companyId)
          .select();

        if (taskError) {
          console.error('Error deleting task:', taskError);
          throw taskError;
        }
      } catch (error) {
        console.error('Error in delete task mutation:', error);
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks', id, companyId] });
      await queryClient.refetchQueries({ queryKey: ['tasks', id, companyId] });
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    },
    onError: (error) => {
      console.error('Failed to delete task:', error);
    }
  });

  // Delete material mutation
  const deleteMaterialMutation = useMutation({
    mutationFn: async (materialId: string) => {
      // First delete all material deliveries
      const { error: deliveriesError } = await supabase
        .from('material_deliveries')
        .delete()
        .eq('material_id', materialId)
        .eq('company_id', companyId);

      if (deliveriesError) throw deliveriesError;

      // Then delete the material
      const { error: materialError } = await supabase
        .from('materials_delivered')
        .delete()
        .eq('id', materialId)
        .eq('company_id', companyId);

      if (materialError) throw materialError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials', id, companyId] });
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    }
  });

  // Delete task group mutation
  const deleteTaskGroupMutation = useMutation({
    mutationFn: async ({ groupName }: { groupName: string }) => {
      try {
        // Get all tasks in the group
        const groupTasks = tasks.filter(task => {
          const taskNameLower = task.name.toLowerCase();
          const isExcavationTask = 
            taskNameLower.includes('type 1') || 
            taskNameLower.includes('tape 1') ||
            taskNameLower.includes('soil excavation') ||
            taskNameLower.includes('excavation soil') ||
            taskNameLower.includes('load-in') ||
            taskNameLower.includes('compacting sand') ||
            taskNameLower.includes('preparation with digger');
          
          const isInGroup = isExcavationTask 
            ? groupName === 'Excavation and Preparation'
            : task.task_name === groupName;

          return isInGroup;
        });

        // Delete all tasks in the group
        for (const task of groupTasks) {
          // First delete all task progress entries
          const { data: progressData, error: progressError } = await supabase
            .from('task_progress_entries')
            .delete()
            .eq('task_id', task.id)
            .select();

          if (progressError) {
            console.error('Error deleting progress:', progressError);
            throw progressError;
          }

          // Then delete the task from tasks_done
          const { data: taskData, error: taskError } = await supabase
            .from('tasks_done')
            .delete()
            .eq('id', task.id)
            .select();

          if (taskError) {
            console.error('Error deleting task:', taskError);
            throw taskError;
          }
        }
      } catch (error) {
        console.error('Error in delete task group mutation:', error);
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      await queryClient.refetchQueries({ queryKey: ['tasks', id] });
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    },
    onError: (error) => {
      console.error('Failed to delete task group:', error);
    }
  });

  // Folder mutations
  const createFolderMutation = useMutation({
    mutationFn: async (folderData: { name: string; parent_folder_id?: string; color?: string }) => {
      // First get the maximum sort_order
      const { data: maxOrderData } = await supabase
        .from('task_folders')
        .select('sort_order')
        .eq('event_id', id)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextSortOrder = maxOrderData && maxOrderData.length > 0 
        ? maxOrderData[0].sort_order + 1000 
        : 1000;

      const { data, error } = await supabase
        .from('task_folders')
        .insert({
          name: folderData.name,
          event_id: id,
          parent_folder_id: folderData.parent_folder_id || null,
          color: folderData.color || '#3B82F6',
          sort_order: nextSortOrder,
          company_id: companyId
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_folders', id] });
      setShowCreateFolderModal(false);
    }
  });

  const updateFolderMutation = useMutation({
    mutationFn: async ({ folderId, updates }: { folderId: string; updates: Partial<TaskFolder> }) => {
      const { error } = await supabase
        .from('task_folders')
        .update(updates)
        .eq('id', folderId)
        .eq('company_id', companyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_folders', id, companyId] });
      setEditingFolder(null);
    }
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (folderId: string) => {
      const { data: folderRow, error: folderFetchErr } = await supabase
        .from('task_folders')
        .select('*')
        .eq('id', folderId)
        .eq('company_id', companyId)
        .single();
      if (folderFetchErr) throw folderFetchErr;
      if (!folderRow) return;

      const hasAct = await folderOrElementHasActivity(
        supabase,
        id!,
        companyId,
        folderId,
        folderRow.canvas_element_id
      );

      const planId = await getPlanIdForEvent(supabase, id!, companyId);

      if (hasAct) {
        const { data: maxOrderData } = await supabase
          .from('task_folders')
          .select('sort_order')
          .eq('event_id', id)
          .eq('company_id', companyId)
          .order('sort_order', { ascending: false })
          .limit(1);
        const nextOrder =
          maxOrderData && maxOrderData.length > 0 ? (maxOrderData[0].sort_order ?? 0) + 1000 : 1000;

        const { error: softErr } = await supabase
          .from('task_folders')
          .update({
            removed_from_project_at: new Date().toISOString(),
            progress_locked: true,
            sort_order: nextOrder,
          })
          .eq('id', folderId)
          .eq('company_id', companyId);
        if (softErr) throw softErr;

        if (planId && folderRow.canvas_element_id) {
          await markCanvasElementRemovedOnPlan(supabase, {
            planId,
            companyId,
            userId: user?.id,
            canvasElementId: folderRow.canvas_element_id,
          });
        }
      } else {
        const { data: tasksInFolder } = await supabase
          .from('tasks_done')
          .select('id')
          .eq('folder_id', folderId)
          .eq('company_id', companyId);
        for (const t of tasksInFolder ?? []) {
          const { error: delP } = await supabase.from('task_progress_entries').delete().eq('task_id', t.id);
          if (delP) throw delP;
        }
        const { error: delTasks } = await supabase.from('tasks_done').delete().eq('folder_id', folderId);
        if (delTasks) throw delTasks;

        if (folderRow.canvas_element_id) {
          const { data: mats } = await supabase
            .from('materials_delivered')
            .select('id')
            .eq('event_id', id)
            .eq('company_id', companyId)
            .eq('canvas_element_id', folderRow.canvas_element_id);
          for (const m of mats ?? []) {
            const { error: delMd } = await supabase.from('material_deliveries').delete().eq('material_id', m.id);
            if (delMd) throw delMd;
            const { error: delM } = await supabase.from('materials_delivered').delete().eq('id', m.id);
            if (delM) throw delM;
          }
        }

        const { error: delF } = await supabase.from('task_folders').delete().eq('id', folderId);
        if (delF) throw delF;

        if (planId && folderRow.canvas_element_id) {
          await removeCanvasElementsFromPlanHard(supabase, {
            planId,
            companyId,
            userId: user?.id,
            canvasElementIds: [folderRow.canvas_element_id],
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_folders', id, companyId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id, companyId] });
      queryClient.invalidateQueries({ queryKey: ['materials', id, companyId] });
      setContextMenu(null);
    }
  });

  const moveTaskToFolderMutation = useMutation({
    mutationFn: async ({ taskId, folderId }: { taskId: string; folderId: string | null }) => {
      const { data, error } = await supabase
        .from('tasks_done')
        .update({ folder_id: folderId })
        .eq('id', taskId)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      setSelectedTaskToMove(null);
      setShowMoveFolderModal(false);
    }
  });

  // Add moveUpFolderMutation
  const moveUpFolderMutation = useMutation({
    mutationFn: async (folderId: string) => {
      // Get all folders in current display order (ascending)
      const { data: allFolders } = await supabase
        .from('task_folders')
        .select('id, sort_order, name')
        .eq('event_id', id)
        .order('sort_order', { ascending: true });

      if (!allFolders || allFolders.length < 2) {
        return;
      }

      // Check if folders have proper sort_order values (not all zeros)
      const allZeros = allFolders.every(f => f.sort_order === 0);
      if (allZeros) {
        // Fix sort orders: assign 1000, 2000, 3000, etc.
        for (let i = 0; i < allFolders.length; i++) {
          const { error } = await supabase
            .from('task_folders')
            .update({ sort_order: (i + 1) * 1000 })
            .eq('id', allFolders[i].id);
          
          if (error) {
            console.error('Error fixing sort order:', error);
            throw error;
          }
          allFolders[i].sort_order = (i + 1) * 1000;
        }
      }

      // Find current folder's position
      const currentIndex = allFolders.findIndex(f => f.id === folderId);

      if (currentIndex <= 0) {
        return;
      }

      // Get the two folders we want to swap
      const currentFolder = allFolders[currentIndex];
      const targetFolder = allFolders[currentIndex - 1]; // The folder above it

      // Swap their sort_order values
      const tempSortOrder = currentFolder.sort_order;
      
      // Update current folder to have the target's sort_order (lower number = higher position)
      const { error: error1 } = await supabase
        .from('task_folders')
        .update({ sort_order: targetFolder.sort_order })
        .eq('id', currentFolder.id);

      if (error1) {
        console.error('Error updating current folder:', error1);
        throw error1;
      }

      // Update target folder to have the current's sort_order
      const { error: error2 } = await supabase
        .from('task_folders')
        .update({ sort_order: tempSortOrder })
        .eq('id', targetFolder.id);

      if (error2) {
        console.error('Error updating target folder:', error2);
        throw error2;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_folders', id] });
      setContextMenu(null);
    },
    onError: (error) => {
      console.error('Move up error:', error);
    }
  });

  const handleReleaseEquipment = (usageId: string) => {
    releaseEquipmentMutation.mutate(usageId);
  };

  const handleDelete = () => {
    if (!itemToDelete) return;

    if (itemToDelete.type === 'task') {
      deleteTaskMutation.mutate(itemToDelete.id);
    } else if (itemToDelete.type === 'task_group' && itemToDelete.groupName) {
      deleteTaskGroupMutation.mutate({ groupName: itemToDelete.groupName });
    } else if (itemToDelete.type === 'material') {
      deleteMaterialMutation.mutate(itemToDelete.id);
    } else if (itemToDelete.type === 'folder') {
      deleteFolderMutation.mutate(itemToDelete.id);
    }
  };

  if (isEventLoading) return <div>{t('event:loading')}</div>;
  if (isEventError) {
    return (
      <div style={{ minHeight: '100vh', background: colors.bgApp, fontFamily: fonts.body, padding: 24 }}>
        <BackButton />
        <p style={{ color: colors.textPrimary, marginTop: 16 }}>{t('common:event_access_denied')}</p>
      </div>
    );
  }
  if (!event) return null;

  // Helper function to recursively render folders
  const renderFolders = (parentFolderId: string | null = null, depth: number = 0): JSX.Element[] => {
    const foldersByParent = folders
      .filter(f => f.parent_folder_id === parentFolderId)
      .sort((a, b) => {
        const ar = a.removed_from_project_at ? 1 : 0;
        const br = b.removed_from_project_at ? 1 : 0;
        if (ar !== br) return ar - br;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });

    return foldersByParent.map(folder => {
      const folderTasks = tasks.filter(task => task.folder_id === folder.id);
      const childFolders = folders.filter(f => f.parent_folder_id === folder.id);
      
      // Calculate folder progress
      const completedTasks = folderTasks.filter(task => task.is_finished);
      const inProgressTasks = folderTasks.length - completedTasks.length;
      
      // Calculate folder hours
      const folderTotalHoursSpent = folderTasks.reduce((sum, task) => sum + task.hours_spent, 0);
      const folderTotalHoursWorked = folderTasks.reduce((sum, task) => sum + task.hours_worked, 0);
      const folderHoursPercent = folderTotalHoursWorked > 0 
        ? (folderTotalHoursSpent / folderTotalHoursWorked) * 100 
        : 0;

      // Calculate overall work progress percentage for folder
      const overallWorkProgress = folderTasks.length > 0 ? 
        folderTasks.reduce((sum, task) => {
        const [amount] = task.amount.split(' ');
          const totalAmount = parseFloat(amount);
          const taskProgress = (task.progress_completed / totalAmount) * 100;
          return sum + (isNaN(taskProgress) ? 0 : taskProgress);
        }, 0) / folderTasks.length : 0;

      return (
        <div key={folder.id} className={`border rounded-lg overflow-hidden ${depth > 0 ? 'ml-4 mt-4' : ''}`} style={{ borderColor: colors.borderDefault }}>
          <div className="p-4 cursor-pointer transition-colors"
            style={{ background: colors.bgSubtle }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgSubtle; }}
            onClick={() => setExpandedFolders(prev => ({ ...prev, [folder.id]: !prev[folder.id] }))}
          >
            {/* Folder Header */}
            <div 
              className="flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <Folder className="w-5 h-5" style={{ color: folder.color }} />
                <h3 className="font-medium">
                  {folder.name}
                  {folder.removed_from_project_at && (
                    <span className="text-xs font-normal ml-2 opacity-80">({t('event:folder_removed_from_project')})</span>
                  )}
                </h3>
                {childFolders.length > 0 && (
                  <span className="text-xs" style={{ color: colors.textSubtle }}>({childFolders.length} folders)</span>
                )}
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextMenu({
                      type: 'folder',
                      id: folder.id,
                      x: e.clientX,
                      y: e.clientY
                    });
                  }}
                  className="p-1.5 rounded-md"
                style={{ color: colors.textSubtle }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = colors.textSubtle; }}
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                {expandedFolders[folder.id] ? (
                  <ChevronUp className="w-5 h-5" style={{ color: colors.textSubtle }} />
                ) : (
                  <ChevronDown className="w-5 h-5" style={{ color: colors.textSubtle }} />
                )}
              </div>
            </div>

            {/* Folder Progress Section - dynamic colors (≤90 blue, 90–110 green, >110 red) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12, padding: "10px 12px", background: "rgba(255,255,255,0.015)", borderRadius: 10, marginBottom: 10 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11.5, color: colors.textMuted, fontWeight: 500 }}>{t('event:work_progress')}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, ...getProgressTextStyle(overallWorkProgress, folderHoursPercent) }}>{parseFloat(overallWorkProgress.toFixed(1))}%</span>
                </div>
                <EventDetailsProgressBar value={overallWorkProgress} color={getProgressColor(overallWorkProgress, folderHoursPercent)} height={4} />
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11.5, color: colors.textMuted, fontWeight: 500 }}>{t('event:hours_progress')}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, ...getProgressTextStyle(overallWorkProgress, folderHoursPercent) }}>{parseFloat(folderHoursPercent.toFixed(1))}% ({parseFloat(folderTotalHoursSpent.toFixed(1))} / {parseFloat(folderTotalHoursWorked.toFixed(1))})</span>
                </div>
                <EventDetailsProgressBar value={folderHoursPercent} color={getProgressColor(overallWorkProgress, folderHoursPercent)} height={4} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: colors.textMuted, fontWeight: 500 }}>
              <span>{t('event:tasks_count')} <strong style={{ color: colors.textMuted }}>{folderTasks.length}</strong></span>
              <span>{t('event:completed_count')} <strong style={{ color: colors.green }}>{completedTasks.length}</strong></span>
              <span>{t('event:in_progress_count')} <strong style={{ color: colors.orange }}>{inProgressTasks}</strong></span>
            </div>
          </div>

          {/* Expanded Content */}
          <div className={`${!expandedFolders[folder.id] && 'hidden'}`}>
            <div style={{ borderTop: `1px solid ${colors.borderDefault}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
              {/* Child Folders */}
              {childFolders.length > 0 && (
                <div className="p-4 border-b" style={{ background: colors.bgElevated, borderColor: colors.borderDefault }}>
                  <h4 className="text-sm font-semibold mb-3" style={{ color: colors.textMuted }}>{t('event:sub_folders')}</h4>
                  <div className="space-y-4">
                    {renderFolders(folder.id, depth + 1)}
                  </div>
                </div>
              )}

              {/* Tasks in this folder - mock: card, one progress line, Praca/Godziny orange bars */}
              {folderTasks.map(task => {
                const [amount] = task.amount.split(' ');
                const totalAmount = parseFloat(amount);
                const percentComplete = (task.progress_completed / totalAmount) * 100;
                const taskHoursPercent = task.hours_worked > 0 ? (task.hours_spent / task.hours_worked) * 100 : 0;

                return (
                  <div
                    key={task.id}
                    style={{
                      padding: "12px 14px", borderRadius: 10,
                      background: "rgba(255,255,255,0.015)",
                      border: `1px solid rgba(255,255,255,0.03)`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.textPrimary }}>{translateTaskName(task.name ?? '', t)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSelectedTask(task); setShowTaskProgressModal(true); }}
                          style={{
                            padding: "5px 12px", borderRadius: 7,
                            background: "rgba(99,140,255,0.12)", border: "1px solid rgba(99,140,255,0.2)",
                            color: colors.accentBlue, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                          }}
                        >
                          {t('event:update_progress')}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setContextMenu({ type: 'task', id: task.id, x: e.clientX, y: e.clientY }); }}
                          style={{
                            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", color: colors.textSubtle,
                          }}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 10.5, color: colors.textMuted }}>{t('event:work_label_short')}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 600, ...getProgressTextStyle(percentComplete, taskHoursPercent) }}>{parseFloat(percentComplete.toFixed(1))}%</span>
                        </div>
                        <EventDetailsProgressBar value={percentComplete} color={getProgressColor(percentComplete, taskHoursPercent)} height={3} />
                      </div>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 10.5, color: colors.textMuted }}>{t('event:hours_bar_label')}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 600, ...getProgressTextStyle(percentComplete, taskHoursPercent) }}>{parseFloat(taskHoursPercent.toFixed(1))}%</span>
                        </div>
                        <EventDetailsProgressBar value={taskHoursPercent} color={getProgressColor(percentComplete, taskHoursPercent)} height={3} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    });
  };

  const totalTasks = tasks.length + additionalTasks.length;
  
  // Calculate total task completion percentage (including additional tasks)
  const regularTasksProgress = tasks.reduce((total, task) => {
    const [amount] = task.amount.split(' ');
    const taskTotal = parseFloat(amount);
    const taskProgress = (task.progress_completed / taskTotal) * 100;
    return total + taskProgress;
  }, 0);

  // Calculate additional tasks progress (based on completion status)
  const additionalTasksProgress = additionalTasks.reduce((total, task) => {
    return total + (task.is_finished ? 100 : 0);
  }, 0);

  // Average progress across all tasks (regular + additional)
  const taskCompletionPercentage = totalTasks > 0 
    ? (regularTasksProgress + additionalTasksProgress) / totalTasks 
    : 0;

  // Calculate total estimated hours from tasks (including additional tasks)
  const regularEstimatedHours = tasks.reduce((sum, task) => sum + task.hours_worked, 0);
  const additionalEstimatedHours = additionalTasks.reduce((sum, task) => sum + (task.hours_needed || 0), 0);
  const totalEstimatedHours = regularEstimatedHours + additionalEstimatedHours;
  const hoursProgress = totalEstimatedHours > 0 ? (totalHours / totalEstimatedHours) * 100 : 0;

  // Color based on work vs hours: work ahead → green, work behind → red, roughly equal (±5%) → blue
  const getProgressColorFromWorkVsHours = (workPercent: number, hoursPercent: number): string => {
    const diff = workPercent - hoursPercent;
    if (diff > 5) return colors.green;   // więcej pracy niż godzin – dobrze
    if (diff < -5) return colors.red;    // mniej pracy niż godzin – źle
    return colors.accentBlue;             // mniej więcej równo (±5%) – neutralnie
  };

  const getProgressColor = (workPercent: number, hoursPercent: number) =>
    getProgressColorFromWorkVsHours(workPercent, hoursPercent);

  const getProgressTextStyle = (workPercent: number, hoursPercent: number): React.CSSProperties => ({
    color: getProgressColorFromWorkVsHours(workPercent, hoursPercent),
  });

  const getStatusStyle = (status: string): React.CSSProperties => {
    switch (status) {
      case 'planned':
        return { background: colors.textDim, color: colors.textOnAccent };
      case 'scheduled':
        return { background: colors.accentBlue, color: colors.textOnAccent };
      case 'in_progress':
        return { background: colors.orange, color: colors.textOnAccent };
      case 'finished':
        return { background: colors.green, color: colors.textOnAccent };
      default:
        return { background: colors.textDim, color: colors.textOnAccent };
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus !== event.status) {
      // Check if trying to set status to finished
      if (newStatus === 'finished') {
        // Check if all regular tasks are completed
        const allRegularTasksCompleted = tasks.every(task => {
          const [amount] = task.amount.split(' ');
          return task.progress_completed >= parseFloat(amount);
        });

        // Check if all additional tasks are completed
        const allAdditionalTasksCompleted = additionalTasks.every(task => task.is_finished);

        if (!allRegularTasksCompleted || !allAdditionalTasksCompleted) {
          setStatusError(t('event:cannot_finish_project'));
          return;
        }
      }

      updateEventStatusMutation.mutate(newStatus);
    }
  };

  // Folder Context Menu Component
  const FolderContextMenu = ({ folderId, x, y }: { folderId: string; x: number; y: number }) => {
    const isFirstFolder = folders.findIndex(f => f.id === folderId) === 0;
    const folder = folders.find(f => f.id === folderId);
    const availableFoldersForMove = folders.filter(f => f.id !== folderId && f.parent_folder_id !== folderId);

    const handleMoveUp = (e: React.MouseEvent) => {
      e.stopPropagation();
      moveUpFolderMutation.mutate(folderId);
    };

    const handleMoveToFolder = (targetFolderId: string | null) => {
      updateFolderMutation.mutate({
        folderId: folderId,
        updates: { parent_folder_id: targetFolderId }
      });
      setContextMenu(null);
    };

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteFolderMutation.mutate(folderId);
      setContextMenu(null);
    };

    return (
      <div
        className="fixed rounded-lg shadow-lg py-1 w-48 max-w-xs max-h-96 overflow-y-auto"
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          top: `${Math.max(0, y)}px`,
          left: `${Math.max(0, Math.min(x, window.innerWidth - 200))}px`,
          zIndex: 50,
        }}
      >
        {!isFirstFolder && (
          <button
            onClick={handleMoveUp}
            className="w-full text-left px-4 py-2 text-sm flex items-center"
            style={{ color: colors.textMuted }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
          >
            <ArrowUp className="w-4 h-4 mr-2" />
            {t('event:move_up')}
          </button>
        )}
        <div className="border-t my-1">
          <div className="px-4 py-1 text-xs font-semibold uppercase" style={{ color: colors.textSubtle }}>{t('event:move_to_folder')}</div>
          <button
            onClick={() => handleMoveToFolder(null)}
            className="w-full text-left px-4 py-2 text-sm flex items-center"
            style={{ color: colors.textMuted }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
          >
            <Folder className="w-4 h-4 mr-2" style={{ color: colors.textSubtle }} />
            {t('event:root_no_parent')}
          </button>
          {availableFoldersForMove.map(f => (
            <button
              key={f.id}
              onClick={() => handleMoveToFolder(f.id)}
              className="w-full text-left px-4 py-2 text-sm flex items-center"
            style={{ color: colors.textMuted }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
            >
              <Folder className="w-4 h-4 mr-2" style={{ color: f.color }} />
              {f.name}
            </button>
          ))}
        </div>
        <div className="border-t">
          <button
            onClick={() => {
              if (folder) setEditingFolder(folder);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm flex items-center"
            style={{ color: colors.textMuted }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
          >
            <Edit className="w-4 h-4 mr-2" />
            {t('event:edit')}
          </button>
        </div>
        <button
          onClick={handleDelete}
          className="w-full text-left px-4 py-2 text-sm flex items-center"
          style={{ color: colors.red }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {t('event:delete')}
        </button>
      </div>
    );
  };

  // Task Context Menu Component
  const TaskContextMenu = ({ taskId, x, y }: { taskId: string; x: number; y: number }) => {
    const task = tasks.find(t => t.id === taskId);

    return (
      <div
        className="fixed rounded-lg shadow-lg py-1 w-48 max-w-xs"
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          top: `${Math.max(0, y)}px`,
          left: `${Math.max(0, Math.min(x, window.innerWidth - 200))}px`,
          zIndex: 50,
        }}
      >
        <button
          onClick={() => {
            setSelectedTaskToMove(task || null);
            setShowMoveFolderModal(true);
            setContextMenu(null);
          }}
          className="w-full text-left px-4 py-2 text-sm flex items-center"
            style={{ color: colors.textMuted }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
        >
          <Move className="w-4 h-4 mr-2" />
          {t('event:move_to_folder')}
        </button>
        {isEditing && (
          <button
            onClick={() => {
              setItemToDelete({ type: 'task', id: taskId });
              setShowDeleteConfirm(true);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm flex items-center"
          style={{ color: colors.red }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t('event:delete_task')}
          </button>
        )}
      </div>
    );
  };

  const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
    planned: { label: t('event:planned'), color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)" },
    scheduled: { label: t('event:scheduled'), color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)" },
    in_progress: { label: t('event:in_progress'), color: "#f97316", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.25)" },
    finished: { label: t('event:finished'), color: "#64748b", bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.25)" },
  };
  const st = statusConfig[event.status] || statusConfig.in_progress;

  return (
    <div style={{ minHeight: "100vh", background: colors.bgApp, fontFamily: fonts.body, padding: "20px 16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 16 }}>
          <BackButton />
        </div>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          {/* Event info */}
          <div style={{
            background: colors.bgCard, borderRadius: 14, border: `1px solid ${colors.borderDefault}`,
            padding: "20px 22px",
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: colors.textPrimary, flex: 1, minWidth: 0 }}>{event.title}</div>
              {canManageEventAssignmentsRole(profile?.role) && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowEventMembersModal(true)}
                  style={{ flexShrink: 0, padding: '8px 12px', gap: 8, display: 'inline-flex', alignItems: 'center' }}
                >
                  <Users size={18} />
                  {t('common:event_members_open')}
                </Button>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: colors.textDim, marginBottom: 14 }}>
              {event.start_date && format(new Date(event.start_date), 'MMM dd, yyyy')} - {event.end_date && format(new Date(event.end_date), 'MMM dd, yyyy')}
            </div>
            {event.status === 'finished' ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px 7px 10px", borderRadius: 10, background: st.bg, border: `1px solid ${st.border}`, fontSize: 13, fontWeight: 600, color: st.color }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.color }} />
                {st.label}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <select
                  value={event.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px 7px 10px", borderRadius: 10,
                    background: st.bg, border: `1px solid ${st.border}`, fontSize: 13, fontWeight: 600, color: st.color, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <option value="planned">{t('event:planned')}</option>
                  <option value="scheduled">{t('event:scheduled')}</option>
                  <option value="in_progress">{t('event:in_progress')}</option>
                  <option value="finished">{t('event:finished')}</option>
                </select>
                {statusError && <p style={{ fontSize: 12, color: colors.red }}>{statusError}</p>}
                {updateEventStatusMutation.isPending && <span style={{ fontSize: 12, color: colors.textDim }}>{t('event:updating_status')}</span>}
              </div>
            )}
          </div>

          {/* Progress */}
          <div style={{
            background: colors.bgCard, borderRadius: 14, border: `1px solid ${colors.borderDefault}`,
            padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 style={{ width: 13, height: 13, color: colors.green }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>{t('event:progress_title')}</span>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12.5, color: colors.textMuted, fontWeight: 500 }}>{t('event:hours_progress')}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, ...getProgressTextStyle(taskCompletionPercentage, hoursProgress) }}>
                  {parseFloat(totalHours.toFixed(2))} / {parseFloat(totalEstimatedHours.toFixed(2))} {t('event:hours_label')} ({hoursProgress.toFixed(0)}%)
                </span>
              </div>
              <EventDetailsProgressBar value={hoursProgress} color={getProgressColor(taskCompletionPercentage, hoursProgress)} />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12.5, color: colors.textMuted, fontWeight: 500 }}>{t('event:task_completion')}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, ...getProgressTextStyle(taskCompletionPercentage, hoursProgress) }}>{parseFloat(taskCompletionPercentage.toFixed(2))}%</span>
              </div>
              <EventDetailsProgressBar value={taskCompletionPercentage} color={getProgressColor(taskCompletionPercentage, hoursProgress)} />
            </div>
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Tasks Section */}
      <EventDetailsSectionCard
        title={t('event:tasks_title')}
        icon={<ClipboardList style={{ width: 18, height: 18, color: colors.accentBlue }} />}
        count={tasks.length}
        open={expandedSections.tasks}
        onOpenChange={(open) => setExpandedSections(prev => ({ ...prev, tasks: open }))}
        headerActions={expandedSections.tasks && (
          <Button variant="ghost" onClick={() => setShowCreateFolderModal(true)} style={{ padding: spacing.sm, fontSize: fontSizes.sm }}>
            <FolderPlus style={{ width: 16, height: 16, marginRight: spacing.xs }} />
            {t('event:new_folder')}
          </Button>
        )}
      >
        <div style={{ marginTop: spacing["3xl"], display: 'flex', flexDirection: 'column', gap: spacing["3xl"] }}>
            {/* Render Folders - using recursive function for nested folders */}
            {renderFolders()}

            {/* Tasks without folders */}
            {(() => {
              const unorganizedTasks = tasks.filter(task => !task.folder_id);
              if (unorganizedTasks.length === 0) return null;

              // Calculate overall work progress for Other Tasks
              const completedUnorganizedTasks = unorganizedTasks.filter(task => task.is_finished);
              const taskCompletionPercentage = unorganizedTasks.length > 0 ? Math.round((completedUnorganizedTasks.length / unorganizedTasks.length) * 100) : 0;
              
              const overallWorkProgress = unorganizedTasks.length > 0 ? 
                unorganizedTasks.reduce((sum, task) => {
                  const [amount, ...unitParts] = task.amount.split(' ');
                  const totalAmount = parseFloat(amount);
                  const taskProgress = (task.progress_completed / totalAmount) * 100;
                  return sum + (isNaN(taskProgress) ? 0 : taskProgress);
                }, 0) / unorganizedTasks.length : 0;
              const workProgressPercentage = Math.round(overallWorkProgress);

              return (
                <div className="border rounded-lg overflow-hidden">
                  <div
                    onClick={() => setExpandedFolders(prev => ({
                      ...prev,
                      'unorganized': !prev['unorganized']
                    }))}
                    className="p-4 cursor-pointer transition-colors"
                    style={{ background: colors.bgSubtle }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgSubtle; }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <Folder className="w-5 h-5" style={{ color: colors.textSubtle }} />
                        <h3 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>{t('event:other_tasks')}</h3>
                        <span className="text-sm" style={{ color: colors.textSubtle }}>({unorganizedTasks.length} {t('event:tasks_count_label')})</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-sm font-medium" style={{ color: colors.textMuted }}>
                          {completedUnorganizedTasks.length}/{unorganizedTasks.length} {t('event:tasks_count_label')} ({taskCompletionPercentage}%)
                        </span>
                        <span className="text-sm" style={{ color: colors.textMuted }}>
                          {unorganizedTasks.reduce((sum, task) => sum + (task.hours_worked || 0), 0).toFixed(1)}{t('event:hours_total')}
                        </span>
                        <span className="text-sm font-medium" style={{ color: colors.textMuted }}>
                          {workProgressPercentage}{t('event:work_done')}
                        </span>
                      </div>
                    </div>
                    {/* Other Tasks Progress Bar */}
                    <div className="w-full rounded-full h-3 mb-3" style={{ background: colors.bgElevated, border: `1px solid ${colors.borderDefault}` }}>
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ 
                          background: colors.textSubtle,
                          width: `${Math.min(workProgressPercentage, 100)}%`
                        }}
                        ></div>
                      </div>
                    <div className="flex items-center justify-between">
                      <div></div>
                        {expandedFolders['unorganized'] ? (
                        <ChevronUp className="w-5 h-5" style={{ color: colors.textSubtle }} />
                      ) : (
                        <ChevronDown className="w-5 h-5" style={{ color: colors.textSubtle }} />
                      )}
                    </div>
                  </div>

                  {expandedFolders['unorganized'] && (
                    <div style={{ borderTop: `1px solid ${colors.borderDefault}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {unorganizedTasks.map(task => {
                        const [amount] = task.amount.split(' ');
                        const totalAmount = parseFloat(amount);
                        const percentComplete = (task.progress_completed / totalAmount) * 100;
                        const taskHoursPercent = task.hours_worked > 0 ? (task.hours_spent / task.hours_worked) * 100 : 0;

                        return (
                          <div
                            key={task.id}
                            style={{
                              padding: "12px 14px", borderRadius: 10,
                              background: "rgba(255,255,255,0.015)",
                              border: `1px solid rgba(255,255,255,0.03)`,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.textPrimary }}>{translateTaskName(task.name ?? '', t)}</div>
                              </div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setSelectedTask(task); setShowTaskProgressModal(true); }}
                                  style={{
                                    padding: "5px 12px", borderRadius: 7,
                                    background: "rgba(99,140,255,0.12)", border: "1px solid rgba(99,140,255,0.2)",
                                    color: colors.accentBlue, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                                  }}
                                >
                                  {t('event:update_progress')}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setContextMenu({ type: 'task', id: task.id, x: e.clientX, y: e.clientY }); }}
                                  style={{
                                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                                    borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                                    cursor: "pointer", color: colors.textSubtle,
                                  }}
                                >
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                  <span style={{ fontSize: 10.5, color: colors.textMuted }}>{t('event:work_label_short')}</span>
                                  <span style={{ fontSize: 10.5, fontWeight: 600, ...getProgressTextStyle(percentComplete, taskHoursPercent) }}>{parseFloat(percentComplete.toFixed(1))}%</span>
                                </div>
                                <EventDetailsProgressBar value={percentComplete} color={getProgressColor(percentComplete, taskHoursPercent)} height={3} />
                              </div>
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                  <span style={{ fontSize: 10.5, color: colors.textMuted }}>{t('event:hours_bar_label')}</span>
                                  <span style={{ fontSize: 10.5, fontWeight: 600, ...getProgressTextStyle(percentComplete, taskHoursPercent) }}>{parseFloat(taskHoursPercent.toFixed(1))}%</span>
                                </div>
                                <EventDetailsProgressBar value={taskHoursPercent} color={getProgressColor(percentComplete, taskHoursPercent)} height={3} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <>
            <div
              className="fixed inset-0"
              onClick={() => setContextMenu(null)}
              style={{ zIndex: 40 }}
            />
            {contextMenu.type === 'folder' ? (
              <FolderContextMenu
                folderId={contextMenu.id}
                x={contextMenu.x}
                y={contextMenu.y}
              />
            ) : (
              <TaskContextMenu
                taskId={contextMenu.id}
                x={contextMenu.x}
                y={contextMenu.y}
              />
            )}
          </>
        )}

        {/* Create Folder Modal */}
        {showCreateFolderModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-0 md:p-4">
            <div className="p-6 rounded-lg w-96" style={{ background: colors.bgCard }}>
              <h3 className="text-lg font-semibold mb-4" style={{ color: colors.textPrimary }}>{t('event:create_new_folder')}</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const name = formData.get('name') as string;
                  const color = formData.get('color') as string;
                  if (name.trim()) {
                    createFolderMutation.mutate({ name: name.trim(), color });
                  }
                }}
              >
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textMuted }}>{t('event:folder_name')}</label>
                  <input
                    type="text"
                    name="name"
                    className="w-full rounded-md px-3 py-2"
                    style={{ border: `1px solid ${colors.borderInput}` }}
                    placeholder={t('event:enter_folder_name')}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textMuted }}>{t('event:color')}</label>
                  <input
                    type="color"
                    name="color"
                    className="w-full h-10 rounded-md"
                    style={{ border: `1px solid ${colors.borderInput}` }}
                    defaultValue="#3B82F6"
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateFolderModal(false)}
                    className="px-4 py-2 rounded-md transition-colors"
                    style={{ background: colors.bgCard, color: colors.textMuted }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgElevated; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgCard; }}
                  >
                    {t('event:cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-md"
                    style={{ background: colors.accentBlue, color: colors.textOnAccent }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.accentBlueDark; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.accentBlue; }}
                  >
                    {t('event:create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Folder Modal */}
        {editingFolder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-0 md:p-4">
            <div className="p-6 rounded-lg w-96" style={{ background: colors.bgCard }}>
              <h3 className="text-lg font-semibold mb-4" style={{ color: colors.textPrimary }}>{t('event:edit_folder')}</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const name = formData.get('name') as string;
                  const color = formData.get('color') as string;
                  if (name.trim()) {
                    updateFolderMutation.mutate({
                      folderId: editingFolder.id,
                      updates: { name: name.trim(), color }
                    });
                  }
                }}
              >
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textMuted }}>{t('event:folder_name')}</label>
                  <input
                    type="text"
                    name="name"
                    className="w-full rounded-md px-3 py-2"
                    style={{ border: `1px solid ${colors.borderInput}` }}
                    defaultValue={editingFolder.name}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textMuted }}>{t('event:color')}</label>
                  <input
                    type="color"
                    name="color"
                    className="w-full h-10 rounded-md"
                    style={{ border: `1px solid ${colors.borderInput}` }}
                    defaultValue={editingFolder.color}
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setEditingFolder(null)}
                    className="px-4 py-2 rounded-md transition-colors"
                    style={{ background: colors.bgCard, color: colors.textMuted }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgElevated; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgCard; }}
                  >
                    {t('event:cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-md"
                    style={{ background: colors.accentBlue, color: colors.textOnAccent }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.accentBlueDark; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.accentBlue; }}
                  >
                    {t('event:update')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Move Task Modal */}
        {showMoveFolderModal && selectedTaskToMove && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-0 md:p-4">
            <div className="p-6 rounded-lg w-96" style={{ background: colors.bgCard }}>
              <h3 className="text-lg font-semibold mb-4" style={{ color: colors.textPrimary }}>{t('event:move_task_to_folder')}</h3>
              <p className="text-sm mb-4" style={{ color: colors.textMuted }}>
                {t('event:moving_task')} <strong>{translateTaskName(selectedTaskToMove.name ?? '', t)}</strong>
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <button
                  onClick={() => {
                    moveTaskToFolderMutation.mutate({
                      taskId: selectedTaskToMove.id,
                      folderId: null
                    });
                  }}
                  className="w-full text-left p-3 rounded-md flex items-center space-x-3"
                  style={{ border: `1px solid ${colors.borderDefault}` }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <Folder className="w-4 h-4" style={{ color: colors.textSubtle }} />
                  <span>{t('event:no_folder_other_tasks')}</span>
                </button>
                {folders.map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => {
                      moveTaskToFolderMutation.mutate({
                        taskId: selectedTaskToMove.id,
                        folderId: folder.id
                      });
                    }}
                    className="w-full text-left p-3 rounded-md flex items-center space-x-3"
                    style={{ border: `1px solid ${colors.borderDefault}` }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <Folder className="w-4 h-4" style={{ color: folder.color }} />
                    <span>{folder.name}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end space-x-3 mt-4">
                <button
                  onClick={() => {
                    setShowMoveFolderModal(false);
                    setSelectedTaskToMove(null);
                  }}
                  className="px-4 py-2 rounded-md transition-colors"
                  style={{ background: colors.bgCard, color: colors.textMuted }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgElevated; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgCard; }}
                >
                  {t('event:cancel')}
                </button>
              </div>
            </div>
          </div>
        )}
      </EventDetailsSectionCard>

      {/* Materials Section */}
      <EventDetailsSectionCard
        title={t('event:materials_title')}
        icon={<Package style={{ width: 18, height: 18, color: colors.green }} />}
        count={materials.length}
        open={expandedSections.materials}
        onOpenChange={(open) => setExpandedSections(prev => ({ ...prev, materials: open }))}
      >
        <div style={{ padding: "6px 8px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 0.9fr) minmax(0, 1fr) 72px", padding: "8px 12px", gap: 8 }}>
              {[t('event:material_column'), t('event:quantity_column'), t('event:delivery_label_short'), ""].map((h, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>{h}</span>
              ))}
            </div>
            {materials.map((material, i) => {
              const totalDelivered = material.material_deliveries
                ? material.material_deliveries.reduce((sum: number, delivery: any) => sum + (delivery.amount || 0), 0)
                : material.amount;
              const percentDelivered = (totalDelivered / material.total_amount) * 100;
              const isCompleted = percentDelivered >= 100;
              const deliveryColor = isCompleted ? colors.green : percentDelivered > 0 ? colors.orange : colors.red;
              return (
                <div
                  key={material.id}
                  style={{
                    display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 0.9fr) minmax(0, 1fr) 72px",
                    padding: "10px 12px", gap: 8, alignItems: "center",
                    borderRadius: 8, background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: colors.textPrimary,
                        lineHeight: 1.35,
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                        overflow: "hidden",
                      }}
                    >
                      {translateMaterialName(material.name, t)}
                    </div>
                  </div>
                  <span style={{ fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>{formatQtyMax2(material.total_amount)} {translateUnit(material.unit, t)}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1 }}><EventDetailsProgressBar value={percentDelivered} color={deliveryColor} height={3} /></div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: deliveryColor, minWidth: 28, textAlign: "right" }}>{parseFloat(percentDelivered.toFixed(0))}%</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    {isCompleted ? (
                      <span style={{ fontSize: 11, color: colors.green, fontWeight: 600 }}>✓</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setSelectedMaterial(material); setShowMaterialProgressModal(true); }}
                        style={{
                          padding: "4px 10px", borderRadius: 6,
                          background: "rgba(99,140,255,0.1)", border: "1px solid rgba(99,140,255,0.18)",
                          color: colors.accentBlue, fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        {t('event:update_progress')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </EventDetailsSectionCard>

      {/* Equipment Section */}
      <EventDetailsSectionCard
        title={t('event:equipment_title')}
        icon={<Wrench style={{ width: 18, height: 18, color: colors.orange }} />}
        count={equipmentUsage.length}
        open={expandedSections.equipment}
        onOpenChange={(open) => setExpandedSections(prev => ({ ...prev, equipment: open }))}
      >
        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {equipmentError && (
              <div style={{ marginBottom: 12, padding: 12, background: colors.statusPaused.bg, border: `1px solid ${colors.statusPaused.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', color: colors.statusPaused.text, fontSize: 13 }}>
                <AlertCircle style={{ width: 18, height: 18, marginRight: 8, flexShrink: 0 }} />
                {equipmentError}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>{t('event:equipment_needed')}</span>
              <Button
                onClick={() => {
                  setEditingEquipmentId(null);
                  setEditingUsageQuantity(null);
                  setEquipmentStartDate(event?.start_date ? dateToYmd(event.start_date) : '');
                  setEquipmentEndDate(event?.end_date ? dateToYmd(event.end_date) : '');
                  setSelectedEquipmentToAdd(null);
                  setEquipmentQuantity(1);
                  setEquipmentAddError(null);
                  setShowAddEquipmentModal(true);
                }}
                variant="primary"
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                <Plus style={{ width: 14, height: 14, marginRight: 6 }} />
                {t('event:add_equipment')}
              </Button>
            </div>
            {isEquipmentLoading ? (
              <p style={{ textAlign: 'center', padding: 16, color: colors.textDim, fontSize: 13 }}>{t('event:loading_equipment')}</p>
            ) : equipmentUsage.length === 0 ? (
              <p style={{ fontSize: 13, color: colors.textDim, textAlign: 'center', padding: 16 }}>{t('event:no_equipment_added')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {equipmentUsage.map(usage => {
                  const sub =
                    [usage.equipment.description?.trim(), usage.equipment.type]
                      .filter(Boolean)
                      .join(" · ") || null;
                  return (
                  <div key={usage.id} style={{
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    gap: 10,
                    padding: "8px 10px", borderRadius: 8,
                    background: "rgba(255,255,255,0.015)",
                    border: `1px solid ${colors.borderDefault}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary, lineHeight: 1.3, wordBreak: "break-word" }}>{usage.equipment.name}</div>
                      {(sub || usage.quantity) ? (
                        <div style={{ fontSize: 11, color: colors.textDim, marginTop: 3, lineHeight: 1.35 }}>
                          {sub}
                          {sub && usage.quantity ? " · " : ""}
                          {usage.quantity ? `${usage.quantity} ${t('event:equipment_unit')}` : ""}
                        </div>
                      ) : null}
                      <div style={{ fontSize: 11, color: colors.textSubtle, marginTop: 4 }}>
                        {t('event:equipment_rental_period_short', {
                          from: dateToYmd(usage.start_date) || '—',
                          to: dateToYmd(usage.end_date) || '—',
                        })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <Button variant="ghost" onClick={() => {
                        setEditingEquipmentId(usage.id);
                        setEditingUsageQuantity(usage.quantity);
                        setSelectedEquipmentToAdd(usage.equipment);
                        setEquipmentQuantity(usage.quantity);
                        setEquipmentStartDate(dateToYmd(usage.start_date));
                        setEquipmentEndDate(dateToYmd(usage.end_date));
                        setEquipmentAddError(null);
                        setShowAddEquipmentModal(true);
                      }} style={{ padding: 6 }}>
                        <Pencil style={{ width: 14, height: 14 }} />
                      </Button>
                      <Button variant="ghost" color={colors.red} onClick={() => setReleaseEquipmentConfirm({ id: usage.id, name: usage.equipment.name })} style={{ padding: 6 }}>
                        <Trash2 style={{ width: 14, height: 14 }} />
                      </Button>
                    </div>
                  </div>
                );
                })}
              </div>
            )}
        </div>
      </EventDetailsSectionCard>

      {/* Additional Features Section */}
      <AdditionalFeatures eventId={id!} />
        </div>
      </div>

      {/* Add Equipment to Event Modal */}
      {showAddEquipmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-0 md:p-4">
          <div className="rounded-lg max-w-md w-full p-6 space-y-4" style={{ background: colors.bgCard }}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>
                {editingEquipmentId ? t('event:edit_equipment_assignment') : t('event:add_equipment_to_event')}
              </h3>
              <button
                onClick={() => {
                  setShowAddEquipmentModal(false);
                  setSelectedEquipmentToAdd(null);
                  setEquipmentAddError(null);
                  setEditingEquipmentId(null);
                  setEditingUsageQuantity(null);
                }}
                className="p-2 rounded-full transition-colors"
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {equipmentAddError && (
              <div className="p-3 rounded-md flex items-center" style={{ background: colors.redLight, color: colors.red }}>
                <AlertCircle className="w-5 h-5 mr-2" />
                {equipmentAddError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: colors.textMuted }}>{t('event:equipment_title')}</label>
              <select
                value={selectedEquipmentToAdd?.id || ''}
                disabled={!!editingEquipmentId}
                onChange={(e) => {
                  const equip = allEquipment.find(eq => eq.id === e.target.value);
                  setSelectedEquipmentToAdd(equip || null);
                  setEquipmentQuantity(1);
                }}
                className="w-full px-3 py-2 rounded-md"
                style={{ border: `1px solid ${colors.borderInput}`, opacity: editingEquipmentId ? 0.85 : 1 }}
              >
                <option value="">{t('event:select_equipment')}</option>
                {allEquipment.map((equip: any) => {
                  const availableQuantity = equip.quantity - equip.in_use_quantity;
                  const isEditingThis = !!editingEquipmentId && equip.id === selectedEquipmentToAdd?.id;
                  const canPick = availableQuantity > 0 || isEditingThis;
                  return (
                    <option key={equip.id} value={equip.id} disabled={!canPick}>
                      {equip.name}
                      {availableQuantity > 0 ? ` (${availableQuantity} ${t('event:available')})` : ` ${t('event:not_available')}`}
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedEquipmentToAdd && (() => {
              const spareUnits =
                editingEquipmentId != null && editingUsageQuantity != null
                  ? selectedEquipmentToAdd.quantity - selectedEquipmentToAdd.in_use_quantity + editingUsageQuantity
                  : selectedEquipmentToAdd.quantity - selectedEquipmentToAdd.in_use_quantity;
              return (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textMuted }}>{t('event:quantity')}</label>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, spareUnits)}
                    value={equipmentQuantity}
                    onChange={(e) => setEquipmentQuantity(Math.min(Math.max(1, parseInt(e.target.value, 10) || 1), Math.max(1, spareUnits)))}
                    className="w-full px-3 py-2 rounded-md"
                    style={{ border: `1px solid ${colors.borderInput}` }}
                  />
                  <p className="mt-1 text-sm" style={{ color: colors.textMuted }}>
                    {t('event:available')}: {spareUnits} {t('event:of')} {selectedEquipmentToAdd.quantity}
                  </p>
                </div>

                <p className="text-xs leading-snug" style={{ color: colors.textSubtle }}>
                  {t('event:equipment_period_default_hint')}
                </p>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textMuted }}>{t('event:equipment_needed_from')}</label>
                  <DatePicker
                    value={equipmentStartDate}
                    onChange={(v) => setEquipmentStartDate(v)}
                    maxDate={equipmentEndDate || undefined}
                    className="rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textMuted }}>{t('event:equipment_needed_until')}</label>
                  <DatePicker
                    value={equipmentEndDate}
                    onChange={(v) => setEquipmentEndDate(v)}
                    minDate={equipmentStartDate || undefined}
                    className="rounded-md"
                  />
                </div>
              </>
            );
            })()}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={() => {
                  setShowAddEquipmentModal(false);
                  setSelectedEquipmentToAdd(null);
                  setEquipmentAddError(null);
                  setEditingEquipmentId(null);
                  setEditingUsageQuantity(null);
                }}
                className="px-4 py-2"
                style={{ color: colors.textMuted }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = colors.textPrimary; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
              >
                {t('event:cancel')}
              </button>
              <button
                onClick={() => {
                  if (!selectedEquipmentToAdd) return;
                  setEquipmentAddError(null);
                  if (!equipmentStartDate || !equipmentEndDate) {
                    setEquipmentAddError(t('event:equipment_dates_required'));
                    return;
                  }
                  if (equipmentStartDate > equipmentEndDate) {
                    setEquipmentAddError(t('event:equipment_end_before_start'));
                    return;
                  }
                  const spareUnits =
                    editingEquipmentId != null && editingUsageQuantity != null
                      ? selectedEquipmentToAdd.quantity - selectedEquipmentToAdd.in_use_quantity + editingUsageQuantity
                      : selectedEquipmentToAdd.quantity - selectedEquipmentToAdd.in_use_quantity;
                  if (!editingEquipmentId && spareUnits <= 0) {
                    setEquipmentAddError(t('event:equipment_none_available'));
                    return;
                  }
                  if (editingEquipmentId && editingUsageQuantity != null) {
                    updateEquipmentUsageMutation.mutate({
                      usageId: editingEquipmentId,
                      equipmentId: selectedEquipmentToAdd.id,
                      quantity: equipmentQuantity,
                      startDateYmd: equipmentStartDate,
                      endDateYmd: equipmentEndDate,
                      previousQuantity: editingUsageQuantity,
                    });
                  } else {
                    addEquipmentToEventMutation.mutate({
                      equipmentId: selectedEquipmentToAdd.id,
                      quantity: equipmentQuantity,
                      startDateYmd: equipmentStartDate,
                      endDateYmd: equipmentEndDate,
                    });
                  }
                }}
                disabled={
                  !selectedEquipmentToAdd ||
                  addEquipmentToEventMutation.isPending ||
                  updateEquipmentUsageMutation.isPending ||
                  (!editingEquipmentId && selectedEquipmentToAdd.quantity - selectedEquipmentToAdd.in_use_quantity === 0)
                }
                className="px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{ background: colors.accentBlue, color: colors.textOnAccent }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) (e.currentTarget as HTMLElement).style.background = colors.accentBlueDark; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.accentBlue; }}
              >
                {addEquipmentToEventMutation.isPending || updateEquipmentUsageMutation.isPending
                  ? (editingEquipmentId ? t('event:updating') : t('event:adding'))
                  : (editingEquipmentId ? t('event:update') : t('event:add_equipment'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showTaskProgressModal && selectedTask && (
        <TaskProgressModal
          task={selectedTask}
          progressLocked={
            !!selectedTask.folder_id &&
            !!folders.find(f => f.id === selectedTask.folder_id)?.progress_locked
          }
          onClose={() => setShowTaskProgressModal(false)}
        />
      )}

      {showMaterialProgressModal && selectedMaterial && (
        <MaterialProgressModal
          material={selectedMaterial}
          onClose={() => setShowMaterialProgressModal(false)}
        />
      )}

      {showHoursModal && (
        <HoursWorkedModal
          eventId={id!}
          onClose={() => setShowHoursModal(false)}
        />
      )}

      {showEventMembersModal && event && (
        <EventMembersModal
          open={showEventMembersModal}
          onClose={() => setShowEventMembersModal(false)}
          eventId={event.id}
          title={event.title}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && itemToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-0 md:p-4">
          <div className="rounded-lg max-w-md w-full p-6" style={{ background: colors.bgCard }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: colors.textPrimary }}>{t('event:confirm_delete')}</h3>
            <p className="mb-6" style={{ color: colors.textMuted }}>
              {t('event:are_you_sure_delete')} {itemToDelete.type.replace('_', ' ')}? 
              <span className="block mt-2" style={{ color: colors.red }}>
                Warning: {itemToDelete.type === 'task_group' 
                  ? t('event:warning_delete_task_group')
                  : itemToDelete.type === 'task' 
                    ? t('event:warning_delete_task')
                    : t('event:warning_delete_general')
                }
              </span>
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setItemToDelete(null);
                }}
                className="px-4 py-2 rounded-lg transition-colors"
                style={{ background: colors.bgCard, color: colors.textMuted }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgElevated; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgCard; }}
              >
                {t('event:cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteTaskMutation.isPending || deleteMaterialMutation.isPending || deleteTaskGroupMutation.isPending}
                className="px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: colors.red, color: colors.textOnAccent }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) (e.currentTarget as HTMLElement).style.background = colors.redLight; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.red; }}
              >
                {deleteTaskMutation.isPending || deleteMaterialMutation.isPending || deleteTaskGroupMutation.isPending 
                  ? t('event:deleting') 
                  : t('event:delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release Equipment Confirmation Modal */}
      {releaseEquipmentConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-0 md:p-4">
          <div className="rounded-lg max-w-sm w-full p-6" style={{ background: colors.bgCard }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: colors.textPrimary }}>{t('event:release_equipment')}</h3>
            <p className="mb-6" style={{ color: colors.textMuted }}>
              {t('event:release_equipment_confirm')} <span className="font-medium">{releaseEquipmentConfirm.name}</span> {t('event:from_this_event')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setReleaseEquipmentConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg transition-colors"
                style={{ background: colors.bgCard, color: colors.textMuted }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgElevated; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgCard; }}
              >
                {t('event:cancel')}
              </button>
              <button
                onClick={() => {
                  handleReleaseEquipment(releaseEquipmentConfirm.id);
                  setReleaseEquipmentConfirm(null);
                }}
                disabled={releaseEquipmentMutation.isPending}
                className="flex-1 px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                style={{ background: colors.green, color: colors.textOnAccent }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) (e.currentTarget as HTMLElement).style.background = colors.greenLight; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.green; }}
              >
                {releaseEquipmentMutation.isPending ? t('event:releasing') : t('event:release')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventDetails;
