/*
  # Fix Equipment Status and Quantity Tracking

  1. Changes
    - Update trigger function to properly handle equipment status
    - Fix in-use quantity calculation
    - Add better date handling for current usage

  2. Security
    - Maintain existing RLS policies
    - Ensure proper status transitions
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS update_equipment_usage_quantity ON equipment_usage;
DROP FUNCTION IF EXISTS update_equipment_in_use_quantity();

-- Create updated function with fixed status and quantity tracking
CREATE OR REPLACE FUNCTION update_equipment_in_use_quantity()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER update_equipment_usage_quantity
  AFTER INSERT OR UPDATE OR DELETE ON equipment_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_in_use_quantity();

-- Refresh current equipment status and quantities
DO $$
DECLARE
  eq RECORD;
BEGIN
  FOR eq IN SELECT id FROM equipment LOOP
    -- Trigger a refresh for each equipment
    PERFORM update_equipment_in_use_quantity()
    FROM equipment_usage
    WHERE equipment_id = eq.id
    LIMIT 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
