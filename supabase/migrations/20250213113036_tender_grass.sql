/*
  # Fix Additional Materials Policy

  1. Changes
    - Drop existing policy for viewing additional materials
    - Create new policy with proper subquery handling
    - Ensure single row is returned in subquery

  2. Security
    - Maintain same security level while fixing the query
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view additional materials for their events" ON additional_materials;

-- Create new policy with fixed subquery
CREATE POLICY "Users can view additional materials for their events"
  ON additional_materials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM events e
      WHERE e.id = event_id 
      AND (
        e.created_by = auth.uid() 
        OR EXISTS (
          SELECT 1 
          FROM tasks_done td 
          WHERE td.event_id = additional_materials.event_id 
          AND td.user_id = auth.uid()
          LIMIT 1
        )
      )
    )
  );
