/*
  # Add price column to materials table

  1. Changes
    - Add price column to materials table
    - Add check constraint to ensure price is non-negative when provided
    - Add index for price column to improve query performance

  2. Notes
    - Price is optional (can be null)
    - When provided, price must be >= 0
    - Index is partial (only includes non-null prices)
*/

-- Add price column if it doesn't exist
ALTER TABLE materials
ADD COLUMN IF NOT EXISTS price numeric
CHECK (price IS NULL OR price >= 0);

-- Add index for price column
CREATE INDEX IF NOT EXISTS idx_materials_price ON materials(price)
WHERE price IS NOT NULL;

-- Update existing materials to have null price if not set
UPDATE materials 
SET price = NULL 
WHERE price IS NULL;
