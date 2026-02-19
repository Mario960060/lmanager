/*
  # Update calendar materials policies

  1. Changes
    - Drop existing policies
    - Add new policies with improved visibility rules
    - Add indexes for better query performance

  2. Security
    - Allow all authenticated users to view calendar materials
    - Allow users to create calendar materials for events they have access to
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create calendar materials" ON calendar_materials;
DROP POLICY IF EXISTS "Users can view calendar materials" ON calendar_materials;

-- Create new policies
CREATE POLICY "Users can create calendar materials"
  ON calendar_materials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM events
      WHERE id = event_id AND (
        created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM tasks_done
          WHERE event_id = calendar_materials.event_id
          AND user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can view calendar materials"
  ON calendar_materials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE id = event_id AND (
        created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM tasks_done
          WHERE event_id = calendar_materials.event_id
          AND user_id = auth.uid()
        )
      )
    )
  );

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_calendar_materials_date ON calendar_materials(date);
CREATE INDEX IF NOT EXISTS idx_calendar_materials_event ON calendar_materials(event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_materials_user ON calendar_materials(user_id);
