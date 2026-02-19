/*
  # Add type column to equipment table

  1. Changes
    - Add type column to equipment table
    - Set default type based on existing equipment names
    - Add check constraint for valid types

  2. Security
    - No changes to RLS policies needed
*/

-- Add type column
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
