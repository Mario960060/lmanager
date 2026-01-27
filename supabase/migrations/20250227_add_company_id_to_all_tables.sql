/*
  # Add company_id to all data tables for multi-tenant support
  
  This migration adds company_id column and RLS policies to all tables that need
  per-company data isolation. Each company has completely independent data.
  
  Tables affected:
  - task_progress_entries
  - tasks_done
  - task_requirements
  - task_folders
  - setup_digging
  - materials_delivered
  - material_deliveries
  - events
  - hours_entries
  - equipment_usage
  - deletion_requests
  - day_notes
  - calendar_materials
  - calendar_equipment
  - additional_tasks
  - additional_task_progress_entries
  - additional_task_materials
  - additional_materials
*/

-- ============================================
-- Add company_id to task_progress_entries
-- ============================================
ALTER TABLE task_progress_entries
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_task_progress_entries_company_id 
ON task_progress_entries(company_id);

DROP POLICY IF EXISTS "Users can insert task progress entries" ON task_progress_entries;
DROP POLICY IF EXISTS "Users can view task progress entries" ON task_progress_entries;

CREATE POLICY "Users can insert task progress entries for their company"
  ON task_progress_entries FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view task progress entries for their company"
  ON task_progress_entries FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ============================================
-- Add company_id to tasks_done
-- ============================================
ALTER TABLE tasks_done
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_done_company_id 
ON tasks_done(company_id);

DROP POLICY IF EXISTS "Users can insert their own tasks" ON tasks_done;
DROP POLICY IF EXISTS "Users can view tasks they logged" ON tasks_done;

CREATE POLICY "Users can insert tasks for their company"
  ON tasks_done FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view tasks for their company"
  ON tasks_done FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update tasks for their company"
  ON tasks_done FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete tasks for their company"
  ON tasks_done FOR DELETE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ============================================
-- Add company_id to task_requirements
-- ============================================
ALTER TABLE task_requirements
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_task_requirements_company_id 
ON task_requirements(company_id);

DROP POLICY IF EXISTS "Authenticated users can view task requirements" ON task_requirements;

CREATE POLICY "Users can view task requirements for their company"
  ON task_requirements FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage task requirements for their company"
  ON task_requirements FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ============================================
-- Add company_id to task_folders
-- ============================================
ALTER TABLE task_folders
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_task_folders_company_id 
ON task_folders(company_id);

-- ============================================
-- Add company_id to setup_digging
-- ============================================
ALTER TABLE setup_digging
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_setup_digging_company_id 
ON setup_digging(company_id);

DROP POLICY IF EXISTS "Authenticated users can view setup_digging" ON setup_digging;

CREATE POLICY "Users can view setup_digging for their company"
  ON setup_digging FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage setup_digging for their company"
  ON setup_digging FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update setup_digging for their company"
  ON setup_digging FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ============================================
-- Add company_id to materials_delivered
-- ============================================
ALTER TABLE materials_delivered
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_materials_delivered_company_id 
ON materials_delivered(company_id);

DROP POLICY IF EXISTS "Authenticated users can insert materials" ON materials_delivered;
DROP POLICY IF EXISTS "Authenticated users can view materials" ON materials_delivered;

CREATE POLICY "Users can insert materials for their company"
  ON materials_delivered FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view materials for their company"
  ON materials_delivered FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ============================================
-- Add company_id to material_deliveries
-- ============================================
ALTER TABLE material_deliveries
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_material_deliveries_company_id 
ON material_deliveries(company_id);

-- ============================================
-- Add company_id to events
-- ============================================
ALTER TABLE events
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_events_company_id 
ON events(company_id);

DROP POLICY IF EXISTS "Users can create events" ON events;
DROP POLICY IF EXISTS "Users can view events they created or are assigned to" ON events;
DROP POLICY IF EXISTS "Users can update their own events" ON events;

CREATE POLICY "Users can create events for their company"
  ON events FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view events for their company"
  ON events FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update events for their company"
  ON events FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete events for their company"
  ON events FOR DELETE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ============================================
-- Add company_id to hours_entries
-- ============================================
ALTER TABLE hours_entries
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_hours_entries_company_id 
ON hours_entries(company_id);

DROP POLICY IF EXISTS "Users can insert their own hours entries" ON hours_entries;
DROP POLICY IF EXISTS "Users can view hours entries for their events" ON hours_entries;

CREATE POLICY "Users can insert hours for their company"
  ON hours_entries FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view hours for their company"
  ON hours_entries FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ============================================
-- Add company_id to equipment_usage
-- ============================================
ALTER TABLE equipment_usage
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_equipment_usage_company_id 
ON equipment_usage(company_id);

DROP POLICY IF EXISTS "Authenticated users can create equipment usage" ON equipment_usage;
DROP POLICY IF EXISTS "Authenticated users can view equipment usage" ON equipment_usage;

CREATE POLICY "Users can create equipment usage for their company"
  ON equipment_usage FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view equipment usage for their company"
  ON equipment_usage FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ============================================
-- Add company_id to deletion_requests
-- ============================================
ALTER TABLE deletion_requests
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_deletion_requests_company_id 
ON deletion_requests(company_id);

DROP POLICY IF EXISTS "Users can view their own deletion requests" ON deletion_requests;
DROP POLICY IF EXISTS "Admins can view all deletion requests" ON deletion_requests;

CREATE POLICY "Users can view their deletion requests for their company"
  ON deletion_requests FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================
-- Add company_id to day_notes
-- ============================================
ALTER TABLE day_notes
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_day_notes_company_id 
ON day_notes(company_id);

-- ============================================
-- Add company_id to calendar_materials
-- ============================================
ALTER TABLE calendar_materials
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_calendar_materials_company_id 
ON calendar_materials(company_id);

DROP POLICY IF EXISTS "Users can view calendar materials" ON calendar_materials;

CREATE POLICY "Users can view calendar materials for their company"
  ON calendar_materials FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage calendar materials for their company"
  ON calendar_materials FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ============================================
-- Add company_id to calendar_equipment
-- ============================================
ALTER TABLE calendar_equipment
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_calendar_equipment_company_id 
ON calendar_equipment(company_id);

-- ============================================
-- Add company_id to additional_tasks
-- ============================================
ALTER TABLE additional_tasks
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_additional_tasks_company_id 
ON additional_tasks(company_id);

DROP POLICY IF EXISTS "Users can insert additional tasks" ON additional_tasks;
DROP POLICY IF EXISTS "Users can view additional tasks for their events" ON additional_tasks;

CREATE POLICY "Users can insert additional tasks for their company"
  ON additional_tasks FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view additional tasks for their company"
  ON additional_tasks FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ============================================
-- Add company_id to additional_task_progress_entries
-- ============================================
ALTER TABLE additional_task_progress_entries
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_additional_task_progress_entries_company_id 
ON additional_task_progress_entries(company_id);

-- ============================================
-- Add company_id to additional_task_materials
-- ============================================
ALTER TABLE additional_task_materials
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_additional_task_materials_company_id 
ON additional_task_materials(company_id);

-- ============================================
-- Add company_id to additional_materials
-- ============================================
ALTER TABLE additional_materials
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_additional_materials_company_id 
ON additional_materials(company_id);

DROP POLICY IF EXISTS "Users can insert additional materials" ON additional_materials;
DROP POLICY IF EXISTS "Users can view additional materials for their events" ON additional_materials;
DROP POLICY IF EXISTS "Users can view additional materials" ON additional_materials;

CREATE POLICY "Users can insert additional materials for their company"
  ON additional_materials FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view additional materials for their company"
  ON additional_materials FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
