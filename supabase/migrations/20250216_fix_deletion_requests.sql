/*
  # Fix Deletion Requests Policies

  1. Changes
    - Add DELETE policy for admins on deletion_requests table
    - Ensure proper role check for Admin users
*/

-- Add DELETE policy for admins
CREATE POLICY "Admins can delete deletion requests"
  ON deletion_requests
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'Admin'
    )
  );
