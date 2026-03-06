/*
  # Plans table - garden canvases storage

  Stores canvas data (shapes, projectSettings, pan, zoom, etc.) compressed as base64.
  - Admin, boss, project_manager: full access (SELECT, INSERT, UPDATE, DELETE)
  - Team_Leader: SELECT only (view)
  - user: no access
*/

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  canvas_data_compressed TEXT NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_company_id ON plans(company_id);
CREATE INDEX IF NOT EXISTS idx_plans_event_id ON plans(event_id);
CREATE INDEX IF NOT EXISTS idx_plans_updated_at ON plans(updated_at DESC);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION handle_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION handle_plans_updated_at();

-- SELECT: Admin, boss, project_manager, Team_Leader (Team_Leader view only)
CREATE POLICY "Admin boss project_manager Team_Leader can select plans"
  ON plans FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'boss', 'project_manager', 'Team_Leader')
    )
  );

-- INSERT: Admin, boss, project_manager only
CREATE POLICY "Admin boss project_manager can insert plans"
  ON plans FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'boss', 'project_manager')
    )
  );

-- UPDATE: Admin, boss, project_manager only
CREATE POLICY "Admin boss project_manager can update plans"
  ON plans FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'boss', 'project_manager')
    )
  )
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- DELETE: Admin, boss, project_manager only
CREATE POLICY "Admin boss project_manager can delete plans"
  ON plans FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'boss', 'project_manager')
    )
  );
