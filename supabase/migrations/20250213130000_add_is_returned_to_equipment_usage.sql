/*
  # Add is_returned column to equipment_usage table

  1. Changes
    - Add is_returned column with default value of false
    - Add return_date column for tracking when equipment was returned
    - Update existing records to have is_returned = false
*/

-- Add is_returned column if it doesn't exist
ALTER TABLE equipment_usage
ADD COLUMN IF NOT EXISTS is_returned boolean NOT NULL DEFAULT false;

-- Add return_date column if it doesn't exist
ALTER TABLE equipment_usage
ADD COLUMN IF NOT EXISTS return_date timestamptz;

-- Update existing records to have is_returned = false
UPDATE equipment_usage
SET is_returned = false
WHERE is_returned IS NULL;

-- Add index for is_returned column for better query performance
CREATE INDEX IF NOT EXISTS idx_equipment_usage_is_returned ON equipment_usage(is_returned);

-- Fix equipment status trigger function to respect manual status changes
DROP TRIGGER IF EXISTS update_equipment_usage_quantity ON equipment_usage;
DROP FUNCTION IF EXISTS update_equipment_in_use_quantity();

-- Create updated function that respects manual status changes
CREATE OR REPLACE FUNCTION update_equipment_in_use_quantity()
RETURNS TRIGGER AS $$
DECLARE
  total_in_use integer;
  max_quantity integer;
  current_status text;
BEGIN
  -- Get current equipment status
  SELECT status
  INTO current_status
  FROM equipment
  WHERE id = COALESCE(NEW.equipment_id, OLD.equipment_id);

  -- Calculate total in use for this equipment
  SELECT COALESCE(SUM(quantity), 0)
  INTO total_in_use
  FROM equipment_usage
  WHERE equipment_id = COALESCE(NEW.equipment_id, OLD.equipment_id)
    AND is_returned = false
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

  -- Update the in_use_quantity in equipment table
  -- Only update status if it's currently free_to_use or in_use
  -- This preserves manual status changes like 'broken'
  UPDATE equipment
  SET 
    in_use_quantity = total_in_use,
    status = CASE
      WHEN current_status = 'broken' THEN 'broken'  -- Keep broken status
      WHEN total_in_use = 0 THEN 'free_to_use'
      WHEN total_in_use > 0 AND total_in_use < quantity THEN 'free_to_use'
      WHEN total_in_use = quantity THEN 'in_use'
      ELSE current_status  -- Keep current status in other cases
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

-- Update existing equipment statuses based on new logic
UPDATE equipment e
SET status = CASE
  WHEN e.status = 'broken' THEN 'broken'  -- Keep broken status
  WHEN e.in_use_quantity = 0 THEN 'free_to_use'
  WHEN e.in_use_quantity > 0 AND e.in_use_quantity < e.quantity THEN 'free_to_use'
  WHEN e.in_use_quantity = e.quantity THEN 'in_use'
  ELSE e.status
END;
