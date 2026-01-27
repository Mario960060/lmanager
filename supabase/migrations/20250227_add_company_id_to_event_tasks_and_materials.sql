/*
  # Add company_id to event_tasks and materials tables
  
  Changes:
    1. Create event_tasks_template table (copy of event_tasks structure, no company_id)
    2. Create materials_template table (copy of materials structure, no company_id)
    3. Add company_id column to event_tasks
    4. Add company_id column to materials
    5. Move seed data to template tables
    6. Add indexes for performance
  
  Security:
    - RLS will be managed per company via company_id
*/

-- ============================================
-- STEP 1: Create template tables (no company_id)
-- ============================================

CREATE TABLE IF NOT EXISTS event_tasks_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  unit text NOT NULL,
  estimated_hours numeric NOT NULL CHECK (estimated_hours > 0),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS materials_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  unit text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- STEP 2: Migrate existing seed data to templates
-- ============================================

-- Copy all current event_tasks to template
INSERT INTO event_tasks_template (id, name, description, unit, estimated_hours, created_at)
SELECT id, name, description, unit, estimated_hours, created_at
FROM event_tasks
ON CONFLICT DO NOTHING;

-- Copy all current materials to template
INSERT INTO materials_template (id, name, description, unit, created_at)
SELECT id, name, description, unit, created_at
FROM materials
ON CONFLICT DO NOTHING;

-- ============================================
-- STEP 3: Add company_id to existing tables
-- ============================================

ALTER TABLE event_tasks
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE materials
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

-- ============================================
-- STEP 4: Create indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_event_tasks_company_id
ON event_tasks(company_id);

CREATE INDEX IF NOT EXISTS idx_materials_company_id
ON materials(company_id);

-- ============================================
-- STEP 5: Enable RLS on template tables
-- ============================================

ALTER TABLE event_tasks_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials_template ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read templates (not company-specific, used for creation)
CREATE POLICY "Authenticated users can read event_tasks_template"
  ON event_tasks_template FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read materials_template"
  ON materials_template FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- STEP 6: Update RLS policies for event_tasks and materials
-- ============================================

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Authenticated users can read event tasks" ON event_tasks;

-- New policy: users can read event_tasks only for their company
CREATE POLICY "Users can read event_tasks for their company"
  ON event_tasks FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Users can insert event_tasks for their company if they are admin
CREATE POLICY "Users can insert event_tasks for their company"
  ON event_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Users can update event_tasks for their company if they are admin/project_manager
CREATE POLICY "Users can update event_tasks for their company"
  ON event_tasks FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Drop old policies for materials
DROP POLICY IF EXISTS "Authenticated users can read materials" ON materials;

-- New policy: users can read materials only for their company
CREATE POLICY "Users can read materials for their company"
  ON materials FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Users can insert materials for their company
CREATE POLICY "Users can insert materials for their company"
  ON materials FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Users can update materials for their company
CREATE POLICY "Users can update materials for their company"
  ON materials FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
