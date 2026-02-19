/*
  # Add Equipment Type Column

  1. Changes
    - Add type column to equipment table
    - Update existing equipment types
    - Add index for better performance

  2. Details
    - Type options: 'machine' or 'tool'
    - Default value: 'tool'
    - Updates existing equipment based on name
*/

-- Add type column if it doesn't exist
ALTER TABLE equipment
ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'tool'
CHECK (type IN ('machine', 'tool'));

-- Update existing equipment types
UPDATE equipment
SET type = CASE 
  WHEN name ILIKE '%Concrete Mixer%' THEN 'machine'
  WHEN name ILIKE '%Power Generator%' THEN 'machine'
  WHEN name ILIKE '%Mini Excavator%' THEN 'machine'
  WHEN name ILIKE '%Large Excavator%' THEN 'machine'
  ELSE 'tool'
END;

-- Add index for type column
CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment(type);
