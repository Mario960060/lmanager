/*
  # RLS policies for invoices

  Permissions:
  - Only project_manager and Admin: SELECT, INSERT, UPDATE, DELETE
  - All operations restricted to user's company (company_id)
*/

-- ============================================
-- invoices
-- ============================================

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_manager Admin can view invoices" ON invoices;
DROP POLICY IF EXISTS "project_manager Admin can insert invoices" ON invoices;
DROP POLICY IF EXISTS "project_manager Admin can update invoices" ON invoices;
DROP POLICY IF EXISTS "project_manager Admin can delete invoices" ON invoices;

-- Only project_manager, Admin can select
CREATE POLICY "project_manager Admin can view invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('project_manager', 'Admin')
    )
  );

-- Only project_manager, Admin can insert
CREATE POLICY "project_manager Admin can insert invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('project_manager', 'Admin')
    )
  );

-- Only project_manager, Admin can update
CREATE POLICY "project_manager Admin can update invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('project_manager', 'Admin')
    )
  )
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Only project_manager, Admin can delete
CREATE POLICY "project_manager Admin can delete invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('project_manager', 'Admin')
    )
  );
