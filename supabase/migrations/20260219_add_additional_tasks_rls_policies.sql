/*
  # RLS policies for additional tasks system

  Permissions:
  - Everyone (company member): INSERT additional_tasks, additional_materials, additional_task_materials
  - Everyone: UPDATE additional_tasks (for progress updates), INSERT/SELECT additional_task_progress_entries
  - Everyone: SELECT on all additional_* tables
  - Admin, Team_Leader, project_manager only: UPDATE (full edit), DELETE on additional_tasks, additional_materials, additional_task_materials

  Role names from profiles: 'Admin', 'Team_Leader', 'project_manager'
*/

-- ============================================
-- additional_tasks
-- ============================================

-- Drop existing update policy (was owner-only)
DROP POLICY IF EXISTS "Users can update their additional tasks" ON additional_tasks;
DROP POLICY IF EXISTS "Users can update additional tasks for their company" ON additional_tasks;

-- Everyone in company can update (for progress: hours_spent, progress, is_finished)
CREATE POLICY "Users can update additional tasks for their company"
  ON additional_tasks FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Only Admin, Team_Leader, project_manager can delete
DROP POLICY IF EXISTS "Admin Team_Leader project_manager can delete additional tasks" ON additional_tasks;
CREATE POLICY "Admin Team_Leader project_manager can delete additional tasks"
  ON additional_tasks FOR DELETE
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
-- additional_materials
-- ============================================

DROP POLICY IF EXISTS "Admin Team_Leader project_manager can update additional materials" ON additional_materials;
DROP POLICY IF EXISTS "Admin Team_Leader project_manager can delete additional materials" ON additional_materials;

-- Only Admin, Team_Leader, project_manager can update
CREATE POLICY "Admin Team_Leader project_manager can update additional materials"
  ON additional_materials FOR UPDATE
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

-- Only Admin, Team_Leader, project_manager can delete
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

-- ============================================
-- additional_task_materials (enable RLS + policies)
-- ============================================

ALTER TABLE additional_task_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert additional task materials for their company" ON additional_task_materials;
DROP POLICY IF EXISTS "Users can view additional task materials for their company" ON additional_task_materials;
DROP POLICY IF EXISTS "Admin Team_Leader project_manager can update additional task materials" ON additional_task_materials;
DROP POLICY IF EXISTS "Admin Team_Leader project_manager can delete additional task materials" ON additional_task_materials;

-- Everyone in company can insert (when adding task with materials)
CREATE POLICY "Users can insert additional task materials for their company"
  ON additional_task_materials FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Everyone in company can select
CREATE POLICY "Users can view additional task materials for their company"
  ON additional_task_materials FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Only Admin, Team_Leader, project_manager can update
CREATE POLICY "Admin Team_Leader project_manager can update additional task materials"
  ON additional_task_materials FOR UPDATE
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

-- Only Admin, Team_Leader, project_manager can delete
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

-- ============================================
-- additional_task_progress_entries (ensure policies)
-- ============================================

ALTER TABLE additional_task_progress_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert additional task progress for their company" ON additional_task_progress_entries;
DROP POLICY IF EXISTS "Users can view additional task progress for their company" ON additional_task_progress_entries;

-- Everyone in company can insert (add progress)
CREATE POLICY "Users can insert additional task progress for their company"
  ON additional_task_progress_entries FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Everyone in company can select
CREATE POLICY "Users can view additional task progress for their company"
  ON additional_task_progress_entries FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
