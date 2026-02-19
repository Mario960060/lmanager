import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Database } from '../lib/database.types';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, Clock, Package, AlertCircle, Wrench, Pencil, ChevronDown, ChevronUp, Folder, FolderPlus, MoreHorizontal, Edit2, Trash2, Move, ArrowUp, Edit, Plus, X, Loader2 } from 'lucide-react';
import BackButton from '../components/BackButton';
import TaskProgressModal from '../components/TaskProgressModal';
import MaterialProgressModal from '../components/MaterialProgressModal';
import HoursWorkedModal from '../components/HoursWorkedModal';
import AdditionalFeatures from '../components/AdditionalFeatures';

type Event = Database['public']['Tables']['events']['Row'];
type TaskDone = Database['public']['Tables']['tasks_done']['Row'];
type MaterialDelivered = Database['public']['Tables']['materials_delivered']['Row'] & {
  material_deliveries?: any[];
  total_amount: number;
  name: string;
  units?: Set<string>;
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
    type: string;
    status: string;
    quantity: number;
    in_use_quantity: number;
  };
};

type TaskFolder = {
  id: string;
  name: string;
  event_id: string;
  parent_folder_id: string | null;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const EventDetails = () => {
  const { t } = useTranslation(['common', 'dashboard', 'utilities', 'project', 'event']);
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
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
  const [equipmentStartDate, setEquipmentStartDate] = useState<string>('');
  const [equipmentEndDate, setEquipmentEndDate] = useState<string>('');
  const [releaseEquipmentConfirm, setReleaseEquipmentConfirm] = useState<{ id: string; name: string } | null>(null);

  // Fetch event details
  const { data: event, isLoading: isEventLoading } = useQuery({
    queryKey: ['event', id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('events').select('*').eq('id', id).eq('company_id', companyId).single();
      if (error) throw error;
      return data as Event;
    },
    enabled: !!companyId
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
      console.log('Fetched folders:', data);
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
      quantity
    }: {
      equipmentId: string;
      quantity: number;
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

      // Create equipment usage record with event dates
      const { error: usageError } = await supabase
        .from('equipment_usage')
        .insert({
          equipment_id: equipmentId,
          event_id: event.id,
          start_date: event.start_date,
          end_date: event.end_date,
          quantity: quantity,
          is_returned: false,
          company_id: companyId
        });

      if (usageError) throw usageError;
      
      // Calculate new in_use_quantity
      const newInUseQuantity = currentEquipment.in_use_quantity + quantity;
      
      // If all quantities will be in use, set status to 'in_use', otherwise keep it as 'free_to_use'
      const newStatus = newInUseQuantity >= currentEquipment.quantity ? 'in_use' : 'free_to_use';
      
      // Update in_use_quantity and status
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
    },
    onError: (error: Error) => {
      console.error('Failed to add equipment:', error);
      setEquipmentAddError(error.message);
    }
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      console.log('Starting to delete task:', taskId);
      
      try {
        // First delete all task progress entries
        const { data: progressData, error: progressError } = await supabase
          .from('task_progress_entries')
          .delete()
          .eq('task_id', taskId)
          .eq('company_id', companyId)
          .select();

        console.log('Progress entries deleted:', progressData);
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

        console.log('Task deleted:', taskData);
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
      console.log('Task deletion completed successfully');
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
      console.log('Starting to delete task group:', groupName);
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

          if (isInGroup) {
            console.log('Found task in group:', task.id, task.name);
          }
          return isInGroup;
        });

        console.log('Found tasks to delete:', groupTasks.length);

        // Delete all tasks in the group
        for (const task of groupTasks) {
          console.log('Deleting task:', task.id);
          // First delete all task progress entries
          const { data: progressData, error: progressError } = await supabase
            .from('task_progress_entries')
            .delete()
            .eq('task_id', task.id)
            .select();

          console.log('Progress entries deleted:', progressData);
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

          console.log('Task deleted:', taskData);
          if (taskError) {
            console.error('Error deleting task:', taskError);
            throw taskError;
          }
        }
        console.log('Successfully deleted all tasks in group');
      } catch (error) {
        console.error('Error in delete task group mutation:', error);
        throw error;
      }
    },
    onSuccess: async () => {
      console.log('Task group deletion completed successfully');
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
      // First move all tasks in this folder to no folder
      await supabase
        .from('tasks_done')
        .update({ folder_id: null })
        .eq('folder_id', folderId)
        .eq('company_id', companyId);

      // Then delete the folder
      const { error } = await supabase
        .from('task_folders')
        .delete()
        .eq('id', folderId)
        .eq('company_id', companyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_folders', id, companyId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id, companyId] });
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
      console.log('Moving folder up:', folderId);
      
      // Get all folders in current display order (ascending)
      const { data: allFolders } = await supabase
        .from('task_folders')
        .select('id, sort_order, name')
        .eq('event_id', id)
        .order('sort_order', { ascending: true });

      console.log('All folders before fix:', allFolders);

      if (!allFolders || allFolders.length < 2) {
        console.log('Not enough folders to move');
        return;
      }

      // Check if folders have proper sort_order values (not all zeros)
      const allZeros = allFolders.every(f => f.sort_order === 0);
      if (allZeros) {
        console.log('Fixing sort orders for all folders...');
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
        console.log('Fixed sort orders:', allFolders);
      }

      // Find current folder's position
      const currentIndex = allFolders.findIndex(f => f.id === folderId);
      console.log('Current folder index:', currentIndex);

      if (currentIndex <= 0) {
        console.log('Already at the top');
        return;
      }

      // Get the two folders we want to swap
      const currentFolder = allFolders[currentIndex];
      const targetFolder = allFolders[currentIndex - 1]; // The folder above it

      console.log('Swapping folders:', {
        current: { name: currentFolder.name, sort_order: currentFolder.sort_order },
        target: { name: targetFolder.name, sort_order: targetFolder.sort_order }
      });

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

      console.log('Successfully swapped folders');
    },
    onSuccess: () => {
      console.log('Move up successful, invalidating queries');
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
    console.log('handleDelete called with itemToDelete:', itemToDelete);
    if (!itemToDelete) return;

    if (itemToDelete.type === 'task') {
      console.log('Deleting single task:', itemToDelete.id);
      deleteTaskMutation.mutate(itemToDelete.id);
    } else if (itemToDelete.type === 'task_group' && itemToDelete.groupName) {
      console.log('Deleting task group:', itemToDelete.groupName);
      deleteTaskGroupMutation.mutate({ groupName: itemToDelete.groupName });
    } else if (itemToDelete.type === 'material') {
      console.log('Deleting material:', itemToDelete.id);
      deleteMaterialMutation.mutate(itemToDelete.id);
    } else if (itemToDelete.type === 'folder') {
      console.log('Deleting folder:', itemToDelete.id);
      deleteFolderMutation.mutate(itemToDelete.id);
    }
  };

  if (isEventLoading || !event) return <div>{t('event:loading')}</div>;

  // Helper function to recursively render folders
  const renderFolders = (parentFolderId: string | null = null, depth: number = 0): JSX.Element[] => {
    const foldersByParent = folders.filter(f => f.parent_folder_id === parentFolderId);

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
        <div key={folder.id} className={`border rounded-lg overflow-hidden ${depth > 0 ? 'ml-4 mt-4' : ''}`}>
          <div className="bg-gray-50 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={() => setExpandedFolders(prev => ({ ...prev, [folder.id]: !prev[folder.id] }))}
          >
            {/* Folder Header */}
            <div 
              className="flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <Folder className="w-5 h-5" style={{ color: folder.color }} />
                <h3 className="font-medium">{folder.name}</h3>
                {childFolders.length > 0 && (
                  <span className="text-xs text-gray-500">({childFolders.length} folders)</span>
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
                  className="p-1.5 text-gray-500 hover:text-gray-700 rounded-md"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                {expandedFolders[folder.id] ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </div>
            </div>

            {/* Folder Progress Section - Always Visible */}
            <div className="mt-3 space-y-2">
              {/* Work Progress Bar */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">{t('event:work_progress')}</span>
                  <span className="text-xs text-green-600">
                    {parseFloat(overallWorkProgress.toFixed(1))}%
                  </span>
                </div>
                <div className="w-full bg-gray-600 rounded-full h-2 border border-gray-500">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(overallWorkProgress, 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* Hours Progress Bar */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">{t('event:hours_progress')}</span>
                  <div className="text-xs">
                    <span className={`${getProgressTextColor(folderHoursPercent)}`}>
                      {parseFloat(folderHoursPercent.toFixed(1))}%
                    </span>
                    <span className="text-gray-500 ml-2">
                      ({parseFloat(folderTotalHoursSpent.toFixed(1))} / {parseFloat(folderTotalHoursWorked.toFixed(1))})
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-600 rounded-full h-2 border border-gray-500">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(folderHoursPercent)}`}
                    style={{ width: `${Math.min(folderHoursPercent, 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* Folder Stats */}
              <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                <span>{t('event:tasks_count')} {folderTasks.length}</span>
                <span>•</span>
                <span>{t('event:completed_count')} {completedTasks.length}</span>
                <span>•</span>
                <span>{t('event:in_progress_count')} {inProgressTasks}</span>
              </div>
            </div>
          </div>

          {/* Expanded Content */}
          <div className={`${!expandedFolders[folder.id] && 'hidden'}`}>
            <div className="border-t divide-y">
              {/* Child Folders */}
              {childFolders.length > 0 && (
                <div className="p-4 bg-gray-900 bg-opacity-20 border-b">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('event:sub_folders')}</h4>
                  <div className="space-y-4">
                    {renderFolders(folder.id, depth + 1)}
                  </div>
                </div>
              )}

              {/* Tasks in this folder */}
              {folderTasks.map(task => {
                const [amount, ...unitParts] = task.amount.split(' ');
                const totalAmount = parseFloat(amount);
                const unit = unitParts.join(' ');
                const percentComplete = (task.progress_completed / totalAmount) * 100;
                const taskHoursPercent = (task.hours_spent / task.hours_worked) * 100;

                return (
                  <div
                    key={task.id}
                    className="p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">{task.name}</h4>
                        <div className="flex flex-col sm:flex-row sm:items-center mt-1 space-y-2 sm:space-y-0 sm:space-x-4">
                  <p className="text-sm text-gray-600">
                            Progress: {parseFloat(task.progress_completed.toFixed(2))} {unit} / {task.amount}
                            <span className="ml-2 font-medium text-green-600">
                              ({parseFloat(percentComplete.toFixed(2))}%)
                    </span>
                  </p>
                          <div className="flex justify-between items-center w-full sm:w-auto">
                  <p className="text-sm text-gray-600">
                              Hours: {parseFloat(task.hours_spent.toFixed(2))} / {parseFloat(task.hours_worked.toFixed(2))}
                              <span className={`ml-2 font-medium ${getProgressTextColor(taskHoursPercent)}`}>
                                ({parseFloat(taskHoursPercent.toFixed(2))}%)
                    </span>
                  </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setContextMenu({
                                  type: 'task',
                                  id: task.id,
                                  x: e.clientX,
                                  y: e.clientY
                                });
                              }}
                              className="flex-none ml-2 p-1.5 text-gray-500 hover:text-gray-700 rounded-md sm:hidden"
                            >
                              <MoreHorizontal className="w-5 h-5" />
                            </button>
                        </div>
                      </div>
                        {/* Individual Task Progress Bars */}
                        <div className="mt-3 space-y-2">
                          {/* Work Progress Bar */}
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-xs font-medium text-gray-700">{t('event:work_progress')}</span>
                              <span className="text-xs text-green-600">{parseFloat(percentComplete.toFixed(1))}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-green-600 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(percentComplete, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                          {/* Hours Progress Bar */}
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-xs font-medium text-gray-700">{t('event:hours_progress')}</span>
                              <span className={`text-xs ${getProgressTextColor(taskHoursPercent)}`}>
                                {parseFloat(taskHoursPercent.toFixed(1))}%
                        </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all duration-300 ${getProgressColor(taskHoursPercent)}`}
                                style={{ width: `${Math.min(taskHoursPercent, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 mt-4 sm:mt-0">
                          <button
                        onClick={(e) => {
                          e.stopPropagation();
                            setSelectedTask(task);
                            setShowTaskProgressModal(true);
                          }}
                          className="flex-none w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3 rounded-md transition-colors text-sm whitespace-nowrap"
                        >
                          {t('event:update_progress')}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenu({
                              type: 'task',
                              id: task.id,
                              x: e.clientX,
                              y: e.clientY
                            });
                          }}
                          className="flex-none p-1.5 text-gray-500 hover:text-gray-700 rounded-md hidden sm:block"
                        >
                          <MoreHorizontal className="w-5 h-5" />
                      </button>
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

  // Determine progress color based on percentage
  const getProgressColor = (percent: number): string => {
    if (percent <= 90) return 'bg-blue-600';
    if (percent <= 110) return 'bg-green-600';
    return 'bg-red-600';
  };

  const getProgressTextColor = (percent: number): string => {
    if (percent <= 90) return 'text-blue-600';
    if (percent <= 110) return 'text-green-600';
    return 'text-red-600';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned':
        return 'bg-gray-100 text-gray-800';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'finished':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
      console.log('Move Up clicked for folder:', folderId);
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
      console.log('Delete clicked for folder:', folderId);
      deleteFolderMutation.mutate(folderId);
      setContextMenu(null);
    };

    return (
      <div
        className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-48 max-w-xs max-h-96 overflow-y-auto"
        style={{
          top: `${Math.max(0, y)}px`,
          left: `${Math.max(0, Math.min(x, window.innerWidth - 200))}px`,
          zIndex: 50,
        }}
      >
        {!isFirstFolder && (
          <button
            onClick={handleMoveUp}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
          >
            <ArrowUp className="w-4 h-4 mr-2" />
            {t('event:move_up')}
          </button>
        )}
        <div className="border-t my-1">
          <div className="px-4 py-1 text-xs font-semibold text-gray-500 uppercase">{t('event:move_to_folder')}</div>
          <button
            onClick={() => handleMoveToFolder(null)}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
          >
            <Folder className="w-4 h-4 mr-2 text-gray-400" />
            {t('event:root_no_parent')}
          </button>
          {availableFoldersForMove.map(f => (
            <button
              key={f.id}
              onClick={() => handleMoveToFolder(f.id)}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
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
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
          >
            <Edit className="w-4 h-4 mr-2" />
            {t('event:edit')}
          </button>
        </div>
        <button
          onClick={handleDelete}
          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 flex items-center"
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
        className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-48 max-w-xs"
        style={{
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
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
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
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 flex items-center"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t('event:delete_task')}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <BackButton />
      </div>
      {/* Header Section */}
      <div className="grid grid-cols-2 gap-6">
        {/* Project Info */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h1 className="text-2xl font-bold mb-2">{event.title}</h1>
          <p className="text-gray-600">
            {event.start_date && format(new Date(event.start_date), 'MMM dd, yyyy')} - {event.end_date && format(new Date(event.end_date), 'MMM dd, yyyy')}
          </p>
          <div className="mt-4">
            {event.status === 'finished' ? (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor('finished')}`}>
                {t('event:finished')}
              </span>
            ) : (
              <div className="space-y-2">
                <select
                  value={event.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(event.status)}`}
                >
                  <option value="planned">{t('event:planned')}</option>
                  <option value="scheduled">{t('event:scheduled')}</option>
                  <option value="in_progress">{t('event:in_progress')}</option>
                  <option value="finished">{t('event:finished')}</option>
                </select>
                {statusError && (
                  <p className="text-sm text-red-600">{statusError}</p>
                )}
              </div>
            )}
            {updateEventStatusMutation.isPending && (
              <span className="text-sm text-gray-500 ml-2">{t('event:updating_status')}</span>
            )}
          </div>
        </div>

        {/* Progress Summary */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-500 mr-2" />
            <h2 className="font-semibold text-lg">{t('event:progress_title')}</h2>
          </div>
          <div className="space-y-4">
            {/* Hours Progress */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{t('event:hours_progress')}</span>
                <div className="flex items-center">
                  <span className={`text-sm font-medium ${getProgressTextColor(hoursProgress)}`}>
                    {parseFloat(totalHours.toFixed(2))} / {parseFloat(totalEstimatedHours.toFixed(2))} {t('event:hours_label')}
                  </span>
                  <span className={`ml-2 text-sm font-medium ${getProgressTextColor(hoursProgress)}`}>
                    ({parseFloat(hoursProgress.toFixed(2))}%)
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all duration-300 ${getProgressColor(hoursProgress)}`}
                  style={{ width: `${Math.min(hoursProgress, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Task Completion Progress */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{t('event:task_completion')}</span>
                <span className="text-sm font-medium text-green-600">
                  {parseFloat(taskCompletionPercentage.toFixed(2))}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(taskCompletionPercentage, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tasks Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpandedSections(prev => ({ ...prev, tasks: !prev.tasks }))}
        >
          <h2 className="text-xl font-semibold">{t('event:tasks_title')}</h2>
          <div className="flex items-center space-x-2">
            {expandedSections.tasks && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCreateFolderModal(true);
                }}
                className="flex items-center space-x-1 text-blue-600 hover:text-blue-800"
              >
                <FolderPlus className="w-4 h-4" />
                <span className="text-sm">{t('event:new_folder')}</span>
              </button>
            )}
          {expandedSections.tasks ? (
            <ChevronUp className="w-6 h-6 text-gray-500" />
          ) : (
            <ChevronDown className="w-6 h-6 text-gray-500" />
          )}
          </div>
        </div>
        {expandedSections.tasks && (
          <div className="mt-6 space-y-6">
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
                    className="bg-gray-50 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <Folder className="w-5 h-5 text-gray-400" />
                        <h3 className="text-lg font-semibold text-gray-900">{t('event:other_tasks')}</h3>
                        <span className="text-sm text-gray-500">({unorganizedTasks.length} {t('event:tasks_count_label')})</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-sm font-medium text-gray-600">
                          {completedUnorganizedTasks.length}/{unorganizedTasks.length} {t('event:tasks_count_label')} ({taskCompletionPercentage}%)
                        </span>
                        <span className="text-sm text-gray-600">
                          {unorganizedTasks.reduce((sum, task) => sum + (task.hours_worked || 0), 0).toFixed(1)}{t('event:hours_total')}
                        </span>
                        <span className="text-sm font-medium text-gray-600">
                          {workProgressPercentage}{t('event:work_done')}
                        </span>
                      </div>
                    </div>
                    {/* Other Tasks Progress Bar */}
                    <div className="w-full bg-gray-600 rounded-full h-3 mb-3 border border-gray-500">
                      <div
                        className="h-full rounded-full transition-all duration-300 bg-gray-400"
                        style={{ 
                          width: `${Math.min(workProgressPercentage, 100)}%`
                        }}
                        ></div>
                      </div>
                    <div className="flex items-center justify-between">
                      <div></div>
                      {expandedFolders['unorganized'] ? (
                        <ChevronUp className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                  </div>

                  {expandedFolders['unorganized'] && (
                    <div className="border-t divide-y">
                      {unorganizedTasks.map(task => {
                        const [amount, ...unitParts] = task.amount.split(' ');
                        const totalAmount = parseFloat(amount);
                        const unit = unitParts.join(' ');
                        const percentComplete = (task.progress_completed / totalAmount) * 100;
                        const taskHoursPercent = (task.hours_spent / task.hours_worked) * 100;

                        return (
                          <div
                            key={task.id}
                            className="p-4 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-gray-900 truncate">{task.name}</h4>
                                <div className="flex flex-col sm:flex-row sm:items-center mt-1 space-y-2 sm:space-y-0 sm:space-x-4">
                                  <p className="text-sm text-gray-600">
                                    {t('event:progress_label')} {parseFloat(task.progress_completed.toFixed(2))} {unit} / {task.amount}
                                    <span className="ml-2 font-medium text-green-600">
                                      ({parseFloat(percentComplete.toFixed(2))}%)
                                    </span>
                                  </p>
                                  <div className="flex justify-between items-center w-full sm:w-auto">
                                  <p className="text-sm text-gray-600">
                                    {t('event:hours_details_label')} {parseFloat(task.hours_spent.toFixed(2))} / {parseFloat(task.hours_worked.toFixed(2))}
                                    <span className={`ml-2 font-medium ${getProgressTextColor(taskHoursPercent)}`}>
                                      ({parseFloat(taskHoursPercent.toFixed(2))}%)
                                    </span>
                                  </p>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setContextMenu({
                                          type: 'task',
                                          id: task.id,
                                          x: e.clientX,
                                          y: e.clientY
                                        });
                                      }}
                                      className="flex-none ml-2 p-1.5 text-gray-500 hover:text-gray-700 rounded-md sm:hidden"
                                    >
                                      <MoreHorizontal className="w-5 h-5" />
                                    </button>
                                </div>
                              </div>
                                {/* Individual Task Progress Bars */}
                                <div className="mt-3 space-y-2">
                                  {/* Work Progress Bar */}
                                  <div>
                                    <div className="flex justify-between mb-1">
                                      <span className="text-xs font-medium text-gray-700">{t('event:work_progress')}</span>
                                      <span className="text-xs text-green-600">{parseFloat(percentComplete.toFixed(1))}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                                      <div
                                        className="bg-green-600 h-1.5 rounded-full transition-all duration-300"
                                        style={{ width: `${Math.min(percentComplete, 100)}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                  {/* Hours Progress Bar */}
                                  <div>
                                    <div className="flex justify-between mb-1">
                                      <span className="text-xs font-medium text-gray-700">{t('event:hours_progress')}</span>
                                      <span className={`text-xs ${getProgressTextColor(taskHoursPercent)}`}>
                                        {parseFloat(taskHoursPercent.toFixed(1))}%
                                      </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                                      <div
                                        className={`h-1.5 rounded-full transition-all duration-300 ${getProgressColor(taskHoursPercent)}`}
                                        style={{ width: `${Math.min(taskHoursPercent, 100)}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 mt-4 sm:mt-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTask(task);
                                    setShowTaskProgressModal(true);
                                  }}
                                  className="flex-none w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3 rounded-md transition-colors text-sm whitespace-nowrap"
                                >
                                  {t('event:update_progress')}
                                </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    setContextMenu({
                                      type: 'task',
                                      id: task.id,
                                      x: e.clientX,
                                      y: e.clientY
                                    });
                                  }}
                                  className="flex-none p-1.5 text-gray-500 hover:text-gray-700 rounded-md hidden sm:block"
                                >
                                  <MoreHorizontal className="w-5 h-5" />
                                  </button>
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
        )}

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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-96">
              <h3 className="text-lg font-semibold mb-4">{t('event:create_new_folder')}</h3>
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
                  <label className="block text-sm font-medium mb-2">{t('event:folder_name')}</label>
                  <input
                    type="text"
                    name="name"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder={t('event:enter_folder_name')}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">{t('event:color')}</label>
                  <input
                    type="color"
                    name="color"
                    className="w-full h-10 border border-gray-300 rounded-md"
                    defaultValue="#3B82F6"
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateFolderModal(false)}
                    className="px-4 py-2 bg-gray-800 text-gray-300 rounded-md hover:bg-gray-700 transition-colors"
                  >
                    {t('event:cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-96">
              <h3 className="text-lg font-semibold mb-4">{t('event:edit_folder')}</h3>
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
                  <label className="block text-sm font-medium mb-2">{t('event:folder_name')}</label>
                  <input
                    type="text"
                    name="name"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    defaultValue={editingFolder.name}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">{t('event:color')}</label>
                  <input
                    type="color"
                    name="color"
                    className="w-full h-10 border border-gray-300 rounded-md"
                    defaultValue={editingFolder.color}
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setEditingFolder(null)}
                    className="px-4 py-2 bg-gray-800 text-gray-300 rounded-md hover:bg-gray-700 transition-colors"
                  >
                    {t('event:cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-96">
              <h3 className="text-lg font-semibold mb-4">{t('event:move_task_to_folder')}</h3>
              <p className="text-sm text-gray-600 mb-4">
                {t('event:moving_task')} <strong>{selectedTaskToMove.name}</strong>
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <button
                  onClick={() => {
                    moveTaskToFolderMutation.mutate({
                      taskId: selectedTaskToMove.id,
                      folderId: null
                    });
                  }}
                  className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 flex items-center space-x-3"
                >
                  <Folder className="w-4 h-4 text-gray-400" />
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
                    className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 flex items-center space-x-3"
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
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-md hover:bg-gray-700 transition-colors"
                >
                  {t('event:cancel')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Materials Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpandedSections(prev => ({ ...prev, materials: !prev.materials }))}
        >
          <h2 className="text-xl font-semibold">{t('event:materials_title')}</h2>
          {expandedSections.materials ? (
            <ChevronUp className="w-6 h-6 text-gray-500" />
          ) : (
            <ChevronDown className="w-6 h-6 text-gray-500" />
          )}
        </div>
        {expandedSections.materials && (
          <div className="mt-6 space-y-4">
            {materials.map(material => {
              const totalDelivered = material.material_deliveries 
                ? material.material_deliveries.reduce((sum, delivery) => sum + (delivery.amount || 0), 0)
                : material.amount;
              const percentDelivered = (totalDelivered / material.total_amount) * 100;
              const isCompleted = percentDelivered >= 100;

              return (
                <div
                  key={material.id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">{material.name}</h4>
                      <div className="flex flex-col sm:flex-row sm:items-center mt-1 space-y-2 sm:space-y-0 sm:space-x-4">
                        <p className="text-sm text-gray-600">
                          {t('event:amount_label')} {material.total_amount} {material.unit}
                        </p>
                        {material.material_deliveries && material.material_deliveries.length > 0 && (
                          <p className="text-sm text-gray-600">
                            {t('event:delivered_label')} {material.material_deliveries.reduce((acc, delivery) => acc + delivery.amount, 0)} {material.unit}
                        <span className="ml-2 font-medium text-green-600">
                              ({parseFloat(((material.material_deliveries.reduce((acc, delivery) => acc + delivery.amount, 0) / material.total_amount) * 100).toFixed(1))}%)
                        </span>
                      </p>
                      )}
                    </div>

                      {/* Material Progress Bar */}
                      <div className="mt-3">
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700">{t('event:delivery_progress')}</span>
                          <span className={`text-xs ${
                            ((material.material_deliveries?.reduce((acc, delivery) => acc + delivery.amount, 0) || 0) / material.total_amount * 100) >= 100 
                              ? 'text-green-600' 
                              : 'text-blue-600'
                          }`}>
                            {parseFloat(((material.material_deliveries?.reduce((acc, delivery) => acc + delivery.amount, 0) || 0) / material.total_amount * 100).toFixed(1))}%
                      </span>
                        </div>
                        <div className="w-full bg-gray-600 rounded-full h-2 border border-gray-500">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              ((material.material_deliveries?.reduce((acc, delivery) => acc + delivery.amount, 0) || 0) / material.total_amount * 100) >= 100 
                                ? 'bg-green-600' 
                                : 'bg-blue-600'
                            }`}
                            style={{ 
                              width: `${Math.min(
                                ((material.material_deliveries?.reduce((acc, delivery) => acc + delivery.amount, 0) || 0) / material.total_amount) * 100,
                                100
                              )}%` 
                            }}
                          ></div>
                        </div>
                      </div>

                      {/* Update Progress Button */}
                      <div className="mt-4 sm:mt-2">
                      <button
                        onClick={() => {
                          setSelectedMaterial(material);
                          setShowMaterialProgressModal(true);
                        }}
                          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3 rounded-md transition-colors text-sm whitespace-nowrap"
                      >
                        {t('event:update_progress')}
                      </button>
                    </div>
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Equipment Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpandedSections(prev => ({ ...prev, equipment: !prev.equipment }))}
        >
          <h2 className="text-xl font-semibold">{t('event:equipment_title')}</h2>
          {expandedSections.equipment ? (
            <ChevronUp className="w-6 h-6 text-gray-500" />
          ) : (
            <ChevronDown className="w-6 h-6 text-gray-500" />
          )}
        </div>
        {expandedSections.equipment && (
          <div className="mt-6 bg-gray-50 p-4 rounded-lg">
            {equipmentError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                {equipmentError}
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Wrench className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">{t('event:equipment_needed')}</h3>
              </div>
              <button
                onClick={() => setShowAddEquipmentModal(true)}
                className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                {t('event:add_equipment')}
              </button>
            </div>

            {/* Equipment List */}
            {isEquipmentLoading ? (
              <p className="text-center py-4">{t('event:loading_equipment')}</p>
            ) : equipmentUsage.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">{t('event:no_equipment_added')}</p>
            ) : (
              <div className="space-y-3">
                {equipmentUsage.map(usage => (
                  <div key={usage.id} className="flex items-center justify-between bg-white p-3 rounded border border-gray-200">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{usage.equipment.name}</p>
                      <p className="text-sm text-gray-600">{t('event:quantity_label')} {usage.quantity}</p>
                      {usage.start_date && usage.end_date && (
                        <p className="text-xs text-gray-500">
                          {format(new Date(usage.start_date), 'MMM dd, yyyy')} - {format(new Date(usage.end_date), 'MMM dd, yyyy')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingEquipmentId(usage.id);
                          setSelectedEquipmentToAdd(usage.equipment);
                          setEquipmentQuantity(usage.quantity);
                          setEquipmentStartDate(usage.start_date);
                          setEquipmentEndDate(usage.end_date);
                          setShowAddEquipmentModal(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setReleaseEquipmentConfirm({ id: usage.id, name: usage.equipment.name })}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Additional Features Section */}
      <AdditionalFeatures eventId={id!} />

      {/* Add Equipment to Event Modal */}
      {showAddEquipmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">{t('event:add_equipment_to_event')}</h3>
              <button
                onClick={() => {
                  setShowAddEquipmentModal(false);
                  setSelectedEquipmentToAdd(null);
                  setEquipmentAddError(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {equipmentAddError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-md flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                {equipmentAddError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('event:equipment_title')}</label>
              <select
                value={selectedEquipmentToAdd?.id || ''}
                onChange={(e) => {
                  const equip = allEquipment.find(eq => eq.id === e.target.value);
                  setSelectedEquipmentToAdd(equip || null);
                  setEquipmentQuantity(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">{t('event:select_equipment')}</option>
                {allEquipment.map((equip: any) => {
                  const availableQuantity = equip.quantity - equip.in_use_quantity;
                  return (
                    <option key={equip.id} value={equip.id} disabled={availableQuantity === 0}>
                      {equip.name}
                      {availableQuantity > 0 ? ` (${availableQuantity} ${t('event:available')})` : ` ${t('event:not_available')}`}
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedEquipmentToAdd && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('event:quantity')}</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedEquipmentToAdd.quantity - selectedEquipmentToAdd.in_use_quantity}
                    value={equipmentQuantity}
                    onChange={(e) => setEquipmentQuantity(Math.min(Math.max(1, parseInt(e.target.value) || 1), selectedEquipmentToAdd.quantity - selectedEquipmentToAdd.in_use_quantity))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-sm text-gray-600">
                    {t('event:available')}: {selectedEquipmentToAdd.quantity - selectedEquipmentToAdd.in_use_quantity} {t('event:of')} {selectedEquipmentToAdd.quantity}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('event:start_date')}</label>
                  <input
                    type="date"
                    value={event?.start_date ? event.start_date.split('T')[0] : ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                  />
                  <p className="mt-1 text-xs text-gray-500">{t('event:event_start_date')}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('event:end_date')}</label>
                  <input
                    type="date"
                    value={event?.end_date ? event.end_date.split('T')[0] : ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                  />
                  <p className="mt-1 text-xs text-gray-500">{t('event:event_end_date')}</p>
                </div>
              </>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={() => {
                  setShowAddEquipmentModal(false);
                  setSelectedEquipmentToAdd(null);
                  setEquipmentAddError(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                {t('event:cancel')}
              </button>
              <button
                onClick={() => {
                  if (selectedEquipmentToAdd) {
                    addEquipmentToEventMutation.mutate({
                      equipmentId: selectedEquipmentToAdd.id,
                      quantity: equipmentQuantity
                    });
                  }
                }}
                disabled={
                  !selectedEquipmentToAdd ||
                  addEquipmentToEventMutation.isPending ||
                  selectedEquipmentToAdd.quantity - selectedEquipmentToAdd.in_use_quantity === 0
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {addEquipmentToEventMutation.isPending ? t('event:adding') : t('event:add_equipment')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showTaskProgressModal && selectedTask && (
        <TaskProgressModal
          task={selectedTask}
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && itemToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">{t('event:confirm_delete')}</h3>
            <p className="text-gray-600 mb-6">
              {t('event:are_you_sure_delete')} {itemToDelete.type.replace('_', ' ')}? 
              <span className="block mt-2 text-red-600">
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
                className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
              >
                {t('event:cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteTaskMutation.isPending || deleteMaterialMutation.isPending || deleteTaskGroupMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('event:release_equipment')}</h3>
            <p className="text-gray-600 mb-6">
              {t('event:release_equipment_confirm')} <span className="font-medium">{releaseEquipmentConfirm.name}</span> {t('event:from_this_event')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setReleaseEquipmentConfirm(null)}
                className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
              >
                {t('event:cancel')}
              </button>
              <button
                onClick={() => {
                  handleReleaseEquipment(releaseEquipmentConfirm.id);
                  setReleaseEquipmentConfirm(null);
                }}
                disabled={releaseEquipmentMutation.isPending}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
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
