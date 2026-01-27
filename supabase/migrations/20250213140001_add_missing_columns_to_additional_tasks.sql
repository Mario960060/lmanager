/*
  # Add missing columns to additional_tasks table

  1. Changes:
    - Add hours_spent column for tracking total hours spent
    - Add quantity column for tracking task quantity
    - Add unit column for specifying task units
    - Add is_finished column for tracking completion status
    - Add progress column for tracking progress percentage
*/

-- Add missing columns to additional_tasks
ALTER TABLE additional_tasks 
ADD COLUMN IF NOT EXISTS hours_spent numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS quantity numeric,
ADD COLUMN IF NOT EXISTS unit text,
ADD COLUMN IF NOT EXISTS is_finished boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_additional_tasks_event_id ON additional_tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_additional_tasks_user_id ON additional_tasks(user_id);

-- Update policy to allow updates
CREATE POLICY "Users can update their additional tasks"
  ON additional_tasks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
