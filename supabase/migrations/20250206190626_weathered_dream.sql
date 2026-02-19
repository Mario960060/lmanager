/*
  # Update calendar materials table

  1. Changes
    - Add date column to calendar_materials table
    - Update existing records with current date
    - Make date column required
    - Add index for date column

  2. Security
    - No changes to security policies
*/

-- Add date column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_materials' AND column_name = 'date'
  ) THEN
    ALTER TABLE calendar_materials ADD COLUMN date date;
  END IF;
END $$;

-- Update any existing records to use their created_at date
UPDATE calendar_materials
SET date = created_at::date
WHERE date IS NULL;

-- Make date column required
ALTER TABLE calendar_materials 
ALTER COLUMN date SET NOT NULL;

-- Add index for date column if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_calendar_materials_date 
ON calendar_materials(date);
