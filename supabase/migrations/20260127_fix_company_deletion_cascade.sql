/*
  # Fix company deletion cascade delete issue

  This migration fixes the cascade delete issue when admins delete a company.
  The ON DELETE CASCADE should automatically remove all company_members when a company is deleted.

  Issue: RLS policies on company_members might block cascade deletes.
  Solution: Ensure policies allow system-level deletes and add explicit delete capability.
*/

-- Drop the existing delete policy on company_members to prevent blocking cascade deletes
DROP POLICY IF EXISTS "Admins can remove members" ON company_members;

-- Create new policy that allows admins to remove members directly
CREATE POLICY "Admins can remove members"
  ON company_members FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Ensure company_members table properly cascades on company deletion
-- The foreign key should already be set to ON DELETE CASCADE, but verify it works correctly
-- by allowing the cascade delete to work at the database level regardless of RLS

-- Add a trigger to ensure company_members are properly cleaned up
CREATE OR REPLACE FUNCTION delete_company_cascade()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete all members of the company before the company is deleted
  DELETE FROM company_members WHERE company_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on companies delete
DROP TRIGGER IF EXISTS company_cascade_delete_trigger ON companies;
CREATE TRIGGER company_cascade_delete_trigger
  BEFORE DELETE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION delete_company_cascade();
