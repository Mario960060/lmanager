/*
  # Update Materials Check Constraint

  1. Changes
    - Modify the check constraint on materials_delivered.amount to allow zero
    - Add check constraint for total_amount to ensure it's greater than zero
*/

-- Drop the existing check constraint
ALTER TABLE materials_delivered
DROP CONSTRAINT IF EXISTS materials_delivered_amount_check;

-- Add new check constraints
ALTER TABLE materials_delivered
ADD CONSTRAINT materials_delivered_amount_check 
CHECK (amount >= 0),
ADD CONSTRAINT materials_delivered_total_amount_check 
CHECK (total_amount > 0);
