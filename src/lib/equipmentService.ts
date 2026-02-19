import { supabase } from './supabase';

/**
 * Releases equipment from a project by marking it as returned
 * @param equipmentId The ID of the equipment to release
 * @param eventId The ID of the event/project the equipment was assigned to
 * @returns Promise<boolean> True if the equipment was successfully released
 */
export const releaseEquipment = async (equipmentId: string, eventId: string): Promise<boolean> => {
  console.log('Attempting to release equipment:', { equipmentId, eventId });
  
  try {
    const { data, error } = await supabase.rpc('release_equipment_by_ids', {
      equipment_id: equipmentId,
      event_id: eventId
    });
    
    console.log('Release equipment response:', { data, error });
    
    if (error) {
      console.error('Error releasing equipment:', error);
      return false;
    }
    
    return !!data; // Convert to boolean
  } catch (e) {
    console.error('Exception when releasing equipment:', e);
    return false;
  }
};

export const releaseEquipmentDirect = async (equipmentId: string, eventId: string): Promise<boolean> => {
  console.log('Attempting direct equipment release:', { equipmentId, eventId });
  
  try {
    // Update the equipment_usage table
    const { data: usageData, error: usageError } = await supabase
      .from('equipment_usage')
      .update({ 
        is_returned: true,
        return_date: new Date().toISOString()
      })
      .match({ 
        equipment_id: equipmentId, 
        event_id: eventId,
        is_returned: false
      });
    
    console.log('Update response:', { usageData, usageError });
    
    if (usageError) {
      console.error('Error updating equipment usage:', usageError);
      return false;
    }
    
    // Update the equipment status
    const { error: equipmentError } = await supabase
      .from('equipment')
      .update({ status: 'free_to_use' })
      .eq('id', equipmentId);
    
    if (equipmentError) {
      console.error('Error updating equipment status:', equipmentError);
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('Exception when releasing equipment directly:', e);
    return false;
  }
};
