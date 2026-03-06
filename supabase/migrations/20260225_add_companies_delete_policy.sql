/*
  # Add DELETE policy for companies table

  Problem: Policy had bug - company_members.company_id = company_members.id compared
  wrong columns (company_id vs company_members.id), so condition was always false.

  Fix: Use company_members.company_id = companies.id (id = row being evaluated).
*/

-- Drop and recreate with correct condition
DROP POLICY IF EXISTS "Admins can delete their company" ON companies;

CREATE POLICY "Admins can delete their company"
  ON companies FOR DELETE
  TO authenticated
  USING (
    id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM company_members WHERE company_id = companies.id AND user_id = auth.uid()) = 'Admin'
  );
