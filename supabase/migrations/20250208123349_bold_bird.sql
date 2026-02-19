-- Drop existing trigger and function
DROP TRIGGER IF EXISTS update_equipment_usage_quantity ON equipment_usage;
DROP FUNCTION IF EXISTS update_equipment_in_use_quantity();

-- Create updated function with new status logic
CREATE OR REPLACE FUNCTION update_equipment_in_use_quantity()
RETURNS TRIGGER AS $$
DECLARE
  total_in_use integer;
  max_quantity integer;
BEGIN
  -- Calculate total in use for this equipment
  SELECT COALESCE(SUM(quantity), 0)
  INTO total_in_use
  FROM equipment_usage
  WHERE equipment_id = COALESCE(NEW.equipment_id, OLD.equipment_id)
    AND (
      CASE
        WHEN TG_OP = 'DELETE' THEN TRUE
        ELSE end_date >= CURRENT_DATE
      END
    );

  -- Get max quantity for this equipment
  SELECT quantity
  INTO max_quantity
  FROM equipment
  WHERE id = COALESCE(NEW.equipment_id, OLD.equipment_id);

  -- Validate total in use doesn't exceed max quantity
  IF total_in_use > max_quantity THEN
    RAISE EXCEPTION 'Cannot exceed maximum quantity of equipment';
  END IF;

  -- Update the in_use_quantity in equipment table
  -- Keep status as free_to_use if there are still available units
  UPDATE equipment
  SET 
    in_use_quantity = total_in_use,
    status = CASE
      WHEN total_in_use = 0 THEN 'free_to_use'
      WHEN total_in_use < quantity THEN 'free_to_use'  -- Changed this line
      WHEN total_in_use = quantity THEN 'in_use'
      ELSE status  -- Keep current status in other cases
    END
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
UPDATE equipment
SET status = CASE
  WHEN in_use_quantity = 0 THEN 'free_to_use'
  WHEN in_use_quantity < quantity THEN 'free_to_use'
  WHEN in_use_quantity = quantity THEN 'in_use'
  ELSE status
END;
