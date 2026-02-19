/*
  # Add price column to materials table

  1. Changes
    - Add nullable price column to materials table
    - Add check constraint to ensure price is positive when provided

  2. Security
    - Maintain existing RLS policies
*/

-- Add price column to materials table
ALTER TABLE materials
ADD COLUMN IF NOT EXISTS price numeric
CHECK (price IS NULL OR price > 0);
