-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_equipment_usage_quantity ON equipment_usage;
DROP FUNCTION IF EXISTS update_equipment_in_use_quantity();

-- Create function to update in_use_quantity
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
  UPDATE equipment
  SET 
    in_use_quantity = total_in_use,
    status = CASE
      WHEN total_in_use = 0 THEN 'free_to_use'
      WHEN total_in_use = quantity THEN 'in_use'
      ELSE 'in_use'
    END
  WHERE id = COALESCE(NEW.equipment_id, OLD.equipment_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update in_use_quantity after usage changes
CREATE TRIGGER update_equipment_usage_quantity
  AFTER INSERT OR UPDATE OR DELETE ON equipment_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_in_use_quantity();

-- Add constraint to ensure quantity is valid
ALTER TABLE equipment_usage
DROP CONSTRAINT IF EXISTS equipment_usage_quantity_check;

ALTER TABLE equipment_usage
ADD CONSTRAINT equipment_usage_quantity_check 
CHECK (quantity > 0);

-- Add constraint to ensure dates are valid
ALTER TABLE equipment_usage
DROP CONSTRAINT IF EXISTS equipment_usage_dates_check;

ALTER TABLE equipment_usage
ADD CONSTRAINT equipment_usage_dates_check 
CHECK (end_date >= start_date);

-- Update existing equipment to have default quantities if not set
UPDATE equipment
SET 
  quantity = COALESCE(quantity, 1),
  in_use_quantity = COALESCE(in_use_quantity, 0)
WHERE quantity IS NULL OR in_use_quantity IS NULL;
