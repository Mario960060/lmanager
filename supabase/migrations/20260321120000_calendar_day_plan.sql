/*
  # Calendar day plan — work blocks and tasks per event per day

  - Multiple time blocks per event per calendar date (hours optional).
  - Tasks link to tasks_done (project tasks). Optional planned quantity; priority 1–3.
  - company_id on both tables for RLS.
  - SELECT: company members (user, Team_Leader, project_manager, Admin, boss).
  - INSERT/UPDATE/DELETE: Admin, boss, project_manager, Team_Leader only.
*/

CREATE TABLE IF NOT EXISTS calendar_day_plan_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  start_hour SMALLINT,
  end_hour SMALLINT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT calendar_day_plan_blocks_hours_range CHECK (
    (start_hour IS NULL AND end_hour IS NULL)
    OR (
      start_hour IS NOT NULL AND end_hour IS NOT NULL
      AND start_hour >= 0 AND start_hour <= 23
      AND end_hour >= 0 AND end_hour <= 23
      AND start_hour <= end_hour
    )
  )
);

CREATE TABLE IF NOT EXISTS calendar_day_plan_block_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  block_id UUID NOT NULL REFERENCES calendar_day_plan_blocks(id) ON DELETE CASCADE,
  tasks_done_id UUID NOT NULL REFERENCES tasks_done(id) ON DELETE CASCADE,
  planned_quantity NUMERIC,
  priority SMALLINT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT calendar_day_plan_block_tasks_priority CHECK (priority >= 1 AND priority <= 3)
);

CREATE INDEX IF NOT EXISTS idx_calendar_day_plan_blocks_company_date
  ON calendar_day_plan_blocks(company_id, plan_date);

CREATE INDEX IF NOT EXISTS idx_calendar_day_plan_blocks_event_date
  ON calendar_day_plan_blocks(event_id, plan_date);

CREATE INDEX IF NOT EXISTS idx_calendar_day_plan_block_tasks_block
  ON calendar_day_plan_block_tasks(block_id);

CREATE INDEX IF NOT EXISTS idx_calendar_day_plan_block_tasks_company
  ON calendar_day_plan_block_tasks(company_id);

CREATE INDEX IF NOT EXISTS idx_calendar_day_plan_block_tasks_tasks_done
  ON calendar_day_plan_block_tasks(tasks_done_id);

ALTER TABLE calendar_day_plan_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_day_plan_block_tasks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION handle_calendar_day_plan_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_calendar_day_plan_blocks_updated_at ON calendar_day_plan_blocks;
CREATE TRIGGER update_calendar_day_plan_blocks_updated_at
  BEFORE UPDATE ON calendar_day_plan_blocks
  FOR EACH ROW
  EXECUTE FUNCTION handle_calendar_day_plan_blocks_updated_at();

-- SELECT: any company member with a recognized role
CREATE POLICY "Company members can select calendar_day_plan_blocks"
  ON calendar_day_plan_blocks FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('user', 'Team_Leader', 'project_manager', 'Admin', 'boss')
    )
  );

CREATE POLICY "Company members can select calendar_day_plan_block_tasks"
  ON calendar_day_plan_block_tasks FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('user', 'Team_Leader', 'project_manager', 'Admin', 'boss')
    )
  );

-- INSERT / UPDATE / DELETE: leaders and above (not regular user)
CREATE POLICY "Leaders can insert calendar_day_plan_blocks"
  ON calendar_day_plan_blocks FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Team_Leader', 'project_manager', 'Admin', 'boss')
    )
  );

CREATE POLICY "Leaders can update calendar_day_plan_blocks"
  ON calendar_day_plan_blocks FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Team_Leader', 'project_manager', 'Admin', 'boss')
    )
  )
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Leaders can delete calendar_day_plan_blocks"
  ON calendar_day_plan_blocks FOR DELETE TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Team_Leader', 'project_manager', 'Admin', 'boss')
    )
  );

CREATE POLICY "Leaders can insert calendar_day_plan_block_tasks"
  ON calendar_day_plan_block_tasks FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Team_Leader', 'project_manager', 'Admin', 'boss')
    )
  );

CREATE POLICY "Leaders can update calendar_day_plan_block_tasks"
  ON calendar_day_plan_block_tasks FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Team_Leader', 'project_manager', 'Admin', 'boss')
    )
  )
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Leaders can delete calendar_day_plan_block_tasks"
  ON calendar_day_plan_block_tasks FOR DELETE TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Team_Leader', 'project_manager', 'Admin', 'boss')
    )
  );

GRANT ALL ON calendar_day_plan_blocks TO authenticated;
GRANT ALL ON calendar_day_plan_block_tasks TO authenticated;
