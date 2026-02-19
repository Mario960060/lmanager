/*
  # Fix Events Policies

  1. Changes
    - Drop existing policies that cause recursion
    - Create new simplified policies for events table
    - Ensure proper access control without circular references
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create events" ON events;
DROP POLICY IF EXISTS "Users can view events they created or are assigned to" ON events;
DROP POLICY IF EXISTS "Users can update their own events" ON events;

-- Create new simplified policies
CREATE POLICY "Users can create events"
  ON events
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

CREATE POLICY "Users can view events"
  ON events
  FOR SELECT
  TO authenticated
  USING (
    -- Allow access if user has a valid role
    EXISTS (
      SELECT 1 
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('user', 'Team_Leader', 'project_manager', 'Admin')
    )
  );

CREATE POLICY "Users can update events"
  ON events
  FOR UPDATE
  TO authenticated
  USING (
    -- Allow update if user has a valid role
    EXISTS (
      SELECT 1 
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('user', 'Team_Leader', 'project_manager', 'Admin')
    )
  )
  WITH CHECK (
    -- Allow update if user has a valid role
    EXISTS (
      SELECT 1 
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('user', 'Team_Leader', 'project_manager', 'Admin')
    )
  );

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON events TO authenticated;
