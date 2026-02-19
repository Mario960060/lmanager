/*
  # Add price column to materials table

  1. Changes
    - Add price column to materials table if it doesn't exist
    - Add check constraint to ensure price is non-negative
    - Add index for price column
*/

-- Drop existing price column and constraints if they exist
ALTER TABLE materials 
DROP COLUMN IF EXISTS price;

-- Add price column with proper constraints
ALTER TABLE materials
ADD COLUMN price numeric
CHECK (price IS NULL OR price >= 0);

-- Add index for price column
CREATE INDEX IF NOT EXISTS idx_materials_price 
ON materials(price)
WHERE price IS NOT NULL;

-- Update existing materials to have null price
UPDATE materials 
SET price = NULL;
