/*
  # Update calendar materials policies

  1. Changes
    - Drop and recreate policies with simplified conditions
    - Add additional index for performance

  2. Security
    - Maintain security while simplifying policy conditions
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create calendar materials" ON calendar_materials;
DROP POLICY IF EXISTS "Users can view calendar materials" ON calendar_materials;

-- Create simplified policies
CREATE POLICY "Users can create calendar materials"
  ON calendar_materials
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view calendar materials"
  ON calendar_materials
  FOR SELECT
  TO authenticated
  USING (true);

-- Add composite index for better query performance
CREATE INDEX IF NOT EXISTS idx_calendar_materials_date_event
ON calendar_materials(date, event_id);
