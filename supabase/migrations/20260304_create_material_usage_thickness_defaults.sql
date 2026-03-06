-- Create material_usage_thickness_defaults table for Default Thicknesses (Material Usage Setup)
-- Stores thickness values per calculator per company (type1_thickness, sand_thickness, mortar_thickness, etc.)

CREATE TABLE IF NOT EXISTS material_usage_thickness_defaults (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  calculator_id text NOT NULL,
  thickness_key text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(company_id, calculator_id, thickness_key)
);

CREATE INDEX IF NOT EXISTS idx_material_usage_thickness_defaults_company_calculator
  ON material_usage_thickness_defaults(company_id, calculator_id);

ALTER TABLE material_usage_thickness_defaults ENABLE ROW LEVEL SECURITY;

-- SELECT: user, Team_Leader, project_manager, Admin – wszyscy w firmie mogą widzieć
CREATE POLICY "Users Team_Leader project_manager Admin can view thickness defaults"
  ON material_usage_thickness_defaults FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- INSERT/UPDATE/DELETE: tylko Admin i project_manager
CREATE POLICY "Admin project_manager can insert thickness defaults"
  ON material_usage_thickness_defaults FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'project_manager')
    )
  );

CREATE POLICY "Admin project_manager can update thickness defaults"
  ON material_usage_thickness_defaults FOR UPDATE
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

CREATE POLICY "Admin project_manager can delete thickness defaults"
  ON material_usage_thickness_defaults FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'project_manager')
    )
  );

CREATE OR REPLACE FUNCTION update_material_usage_thickness_defaults_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_material_usage_thickness_defaults_updated_at_trigger
  BEFORE UPDATE ON material_usage_thickness_defaults
  FOR EACH ROW
  EXECUTE FUNCTION update_material_usage_thickness_defaults_updated_at();
