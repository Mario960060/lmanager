/*
  # RLS policies for task_folders

  Permissions:
  - Everyone (company member): SELECT (view folders)
  - Team_Leader, project_manager, Admin: INSERT, UPDATE (create/edit folders)
  - project_manager, Admin only: DELETE (delete folders)

  Note: Adding progress to a task goes to task_progress_entries/tasks_done, not task_folders.
  INSERT on task_folders is for creating new folders (EventDetails, ProjectCreating) - managers only.
*/

-- ============================================
-- task_folders
-- ============================================

ALTER TABLE task_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view task folders for their company" ON task_folders;
DROP POLICY IF EXISTS "Team_Leader project_manager Admin can insert task folders" ON task_folders;
DROP POLICY IF EXISTS "Team_Leader project_manager Admin can update task folders" ON task_folders;
DROP POLICY IF EXISTS "project_manager Admin can delete task folders" ON task_folders;

-- Everyone in company can view
CREATE POLICY "Users can view task folders for their company"
  ON task_folders FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Team_Leader, project_manager, Admin can insert (create folders)
CREATE POLICY "Team_Leader project_manager Admin can insert task folders"
  ON task_folders FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Team_Leader', 'project_manager', 'Admin')
    )
  );

-- Team_Leader, project_manager, Admin can update (edit folders, reorder)
CREATE POLICY "Team_Leader project_manager Admin can update task folders"
  ON task_folders FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Team_Leader', 'project_manager', 'Admin')
    )
  )
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Only project_manager, Admin can delete
CREATE POLICY "project_manager Admin can delete task folders"
  ON task_folders FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('project_manager', 'Admin')
    )
  );
