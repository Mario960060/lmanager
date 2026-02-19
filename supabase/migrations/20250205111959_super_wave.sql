/*
  # Add unit column to additional materials

  1. Changes
    - Add unit column to additional_materials table
    - Make unit column required
    - Add check constraint to ensure unit is not empty
*/

ALTER TABLE additional_materials
ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'units'
CHECK (unit <> '');

-- Update existing rows to have a default unit if needed
UPDATE additional_materials
SET unit = 'units'
WHERE unit IS NULL;
