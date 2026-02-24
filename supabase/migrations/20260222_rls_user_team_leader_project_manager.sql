/*
  # RLS: User, Team_Leader, Project_manager permission adjustments

  User – REVOKE:
    - UPDATE on setup_digging
    - DELETE on tasks_done, setup_digging, events

  User – ADD:
    - UPDATE on additional_materials, additional_task_materials
    - DELETE on additional_materials – own, same day only
    - DELETE on additional_task_materials – own (via task), same day only

  Project_manager – REVOKE:
    - DELETE on invoices

  Project_manager – ADD:
    - Full access to deletion_requests (SELECT, UPDATE, DELETE)
*/

-- ============================================
-- setup_digging: restrict UPDATE and DELETE to Team_Leader, project_manager, Admin
-- ============================================

DROP POLICY IF EXISTS "Users can update setup_digging for their company" ON setup_digging;

CREATE POLICY "Team_Leader project_manager Admin can update setup_digging"
  ON setup_digging FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'Team_Leader', 'project_manager')
    )
  )
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- setup_digging DELETE: only Team_Leader, project_manager, Admin (drop any broad policy, add restricted)
DROP POLICY IF EXISTS "Admin users can manage setup_digging" ON setup_digging;

CREATE POLICY "Team_Leader project_manager Admin can delete setup_digging"
  ON setup_digging FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'Team_Leader', 'project_manager')
    )
  );

-- ============================================
-- tasks_done: restrict DELETE to Team_Leader, project_manager, Admin
-- ============================================

DROP POLICY IF EXISTS "Users can delete tasks for their company" ON tasks_done;

CREATE POLICY "Team_Leader project_manager Admin can delete tasks_done"
  ON tasks_done FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'Team_Leader', 'project_manager')
    )
  );

-- ============================================
-- events: restrict DELETE to Team_Leader, project_manager, Admin
-- ============================================

DROP POLICY IF EXISTS "Users can delete events for their company" ON events;

CREATE POLICY "Team_Leader project_manager Admin can delete events"
  ON events FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'Team_Leader', 'project_manager')
    )
  );

-- ============================================
-- additional_materials: User UPDATE, User DELETE (own, same day)
-- ============================================

DROP POLICY IF EXISTS "Admin Team_Leader project_manager can update additional materials" ON additional_materials;

-- Everyone in company can update
CREATE POLICY "Users can update additional materials for their company"
  ON additional_materials FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Keep Admin/Team_Leader/project_manager full delete, add User delete own same day
DROP POLICY IF EXISTS "Admin Team_Leader project_manager can delete additional materials" ON additional_materials;

CREATE POLICY "Admin Team_Leader project_manager can delete additional materials"
  ON additional_materials FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'Team_Leader', 'project_manager')
    )
  );

CREATE POLICY "Users can delete own additional materials same day"
  ON additional_materials FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (created_at::date = (now() AT TIME ZONE 'Europe/Warsaw')::date)
    AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================
-- additional_task_materials: User UPDATE, User DELETE (own via task, same day)
-- ============================================

DROP POLICY IF EXISTS "Admin Team_Leader project_manager can update additional task materials" ON additional_task_materials;

-- Everyone in company can update
CREATE POLICY "Users can update additional task materials for their company"
  ON additional_task_materials FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Keep Admin/Team_Leader/project_manager full delete, add User delete own same day
DROP POLICY IF EXISTS "Admin Team_Leader project_manager can delete additional task materials" ON additional_task_materials;

CREATE POLICY "Admin Team_Leader project_manager can delete additional task materials"
  ON additional_task_materials FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'Team_Leader', 'project_manager')
    )
  );

CREATE POLICY "Users can delete own additional task materials same day"
  ON additional_task_materials FOR DELETE
  TO authenticated
  USING (
    (created_at::date = (now() AT TIME ZONE 'Europe/Warsaw')::date)
    AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM additional_tasks at
      WHERE at.id = additional_task_materials.task_id
      AND at.user_id = auth.uid()
    )
  );

-- ============================================
-- invoices: remove project_manager from DELETE (Admin only)
-- ============================================

DROP POLICY IF EXISTS "project_manager Admin can delete invoices" ON invoices;

CREATE POLICY "Admin can delete invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'Admin'
    )
  );

-- ============================================
-- deletion_requests: full access for project_manager (SELECT, UPDATE, DELETE)
-- ============================================

DROP POLICY IF EXISTS "Admins can delete deletion requests" ON deletion_requests;
DROP POLICY IF EXISTS "Admins can update deletion requests" ON deletion_requests;

-- project_manager and Admin can update (status changes, etc.)
CREATE POLICY "Admin project_manager can update deletion requests"
  ON deletion_requests FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'project_manager')
    )
  )
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- project_manager and Admin can delete
CREATE POLICY "Admin project_manager can delete deletion requests"
  ON deletion_requests FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'project_manager')
    )
  );
