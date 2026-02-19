/*
  # Add status column to materials_delivered table

  1. Changes
    - Add status column to materials_delivered table
    - Add check constraint for valid status values
    - Set default status to 'pending'
*/

ALTER TABLE materials_delivered 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' 
CHECK (status IN ('pending', 'in_progress', 'delivered'));
