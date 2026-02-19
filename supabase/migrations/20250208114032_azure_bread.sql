-- Add quantity column to equipment table
ALTER TABLE equipment
ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1
CHECK (quantity > 0);

-- Add in_use_quantity column to equipment table
ALTER TABLE equipment
ADD COLUMN IF NOT EXISTS in_use_quantity integer NOT NULL DEFAULT 0
CHECK (in_use_quantity >= 0 AND in_use_quantity <= quantity);

-- Update equipment_usage table to track quantity
ALTER TABLE equipment_usage
ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1
CHECK (quantity > 0);

-- Create function to update in_use_quantity
CREATE OR REPLACE FUNCTION update_equipment_in_use_quantity()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the in_use_quantity in equipment table
  WITH usage_totals AS (
    SELECT 
      equipment_id,
      COALESCE(SUM(quantity), 0) as total_in_use
    FROM equipment_usage
    WHERE equipment_id = NEW.equipment_id
    GROUP BY equipment_id
  )
  UPDATE equipment
  SET in_use_quantity = LEAST(ut.total_in_use, quantity)
  FROM usage_totals ut
  WHERE equipment.id = ut.equipment_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update in_use_quantity after usage changes
DROP TRIGGER IF EXISTS update_equipment_usage_quantity ON equipment_usage;
CREATE TRIGGER update_equipment_usage_quantity
  AFTER INSERT OR UPDATE OR DELETE ON equipment_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_in_use_quantity();
