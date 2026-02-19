/*
  # Fix Equipment Trigger Permissions

  1. Changes
    - Grant necessary permissions for trigger function
    - Add security definer to ensure trigger has proper access
    - Refresh equipment status
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS update_equipment_usage_quantity ON equipment_usage;
DROP FUNCTION IF EXISTS update_equipment_in_use_quantity();

-- Create updated function with security definer
CREATE OR REPLACE FUNCTION update_equipment_in_use_quantity()
RETURNS TRIGGER
SECURITY DEFINER -- Add this to ensure function runs with owner privileges
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  total_in_use integer;
  max_quantity integer;
BEGIN
  -- Calculate total in use for this equipment
  -- Only count current and future usage
  SELECT COALESCE(SUM(quantity), 0)
  INTO total_in_use
  FROM equipment_usage
  WHERE equipment_id = COALESCE(NEW.equipment_id, OLD.equipment_id)
    AND end_date >= CURRENT_DATE;

  -- Get max quantity for this equipment
  SELECT quantity
  INTO max_quantity
  FROM equipment
  WHERE id = COALESCE(NEW.equipment_id, OLD.equipment_id);

  -- Validate total in use doesn't exceed max quantity
  IF total_in_use > max_quantity THEN
    RAISE EXCEPTION 'Cannot exceed maximum quantity of equipment (%) available: %', max_quantity, total_in_use;
  END IF;

  -- Update the in_use_quantity and status in equipment table
  UPDATE equipment
  SET 
    in_use_quantity = total_in_use,
    status = CASE
      WHEN status = 'broken' THEN 'broken'  -- Don't change if broken
      WHEN total_in_use = 0 THEN 'free_to_use'
      WHEN total_in_use > 0 THEN 'in_use'
      ELSE status
    END,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = COALESCE(NEW.equipment_id, OLD.equipment_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recreate trigger
CREATE TRIGGER update_equipment_usage_quantity
  AFTER INSERT OR UPDATE OR DELETE ON equipment_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_in_use_quantity();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON equipment TO authenticated;
GRANT ALL ON equipment_usage TO authenticated;

-- Refresh current equipment status
UPDATE equipment
SET updated_at = CURRENT_TIMESTAMP
WHERE true;
