/*
  # Fix Calendar Materials and Related Policies

  1. Changes
    - Drop existing policies that may cause recursion
    - Create new simplified policies for calendar_materials table
    - Ensure proper access control without circular references
*/

-- Drop existing policies for calendar_materials
DROP POLICY IF EXISTS "Users can create calendar materials" ON calendar_materials;
DROP POLICY IF EXISTS "Users can view calendar materials" ON calendar_materials;
DROP POLICY IF EXISTS "Users with roles can view additional materials" ON calendar_materials;
DROP POLICY IF EXISTS "Users with roles can insert additional materials" ON calendar_materials;

-- Create new simplified policies for calendar_materials
CREATE POLICY "Users can create calendar materials"
  ON calendar_materials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('user', 'Team_Leader', 'project_manager', 'Admin')
    )
  );

CREATE POLICY "Users can view calendar materials"
  ON calendar_materials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('user', 'Team_Leader', 'project_manager', 'Admin')
    )
  );

-- Drop existing policies for additional_materials if they exist
DROP POLICY IF EXISTS "Users can view additional materials for their events" ON additional_materials;
DROP POLICY IF EXISTS "Users can insert additional materials" ON additional_materials;
DROP POLICY IF EXISTS "Users with roles can view additional materials" ON additional_materials;
DROP POLICY IF EXISTS "Users with roles can insert additional materials" ON additional_materials;

-- Create new simplified policies for additional_materials
CREATE POLICY "Users can create additional materials"
  ON additional_materials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('user', 'Team_Leader', 'project_manager', 'Admin')
    )
  );

CREATE POLICY "Users can view additional materials"
  ON additional_materials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('user', 'Team_Leader', 'project_manager', 'Admin')
    )
  );

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON calendar_materials TO authenticated;
GRANT ALL ON additional_materials TO authenticated;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_calendar_materials_date_event_user
ON calendar_materials(date, event_id, user_id);

CREATE INDEX IF NOT EXISTS idx_additional_materials_event_user
ON additional_materials(event_id, user_id);
