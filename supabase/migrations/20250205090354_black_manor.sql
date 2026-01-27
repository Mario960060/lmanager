/*
  # Add total_amount to materials_delivered

  1. Changes
    - Add total_amount column to materials_delivered table
    - Make it nullable to avoid issues with existing records
*/

ALTER TABLE materials_delivered 
ADD COLUMN IF NOT EXISTS total_amount numeric,
ADD COLUMN IF NOT EXISTS name text;
