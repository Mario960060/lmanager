/*
  # Update Additional Materials Policy

  1. Changes
    - Drop existing policies for additional_materials
    - Create new policy allowing access for all users with valid roles
    - Maintain insert policy with role check

  2. Security
    - Ensure users have valid roles
    - Allow access only to authenticated users with roles
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view additional materials for their events" ON additional_materials;
DROP POLICY IF EXISTS "Users can insert additional materials" ON additional_materials;

-- Create new select policy for users with valid roles
CREATE POLICY "Users with roles can view additional materials"
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

-- Create new insert policy for users with valid roles
CREATE POLICY "Users with roles can insert additional materials"
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
