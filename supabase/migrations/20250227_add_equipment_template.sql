/*
  # Add equipment_template table
  
  Purpose:
    - Create a template table for equipment (global seed data)
    - When a new company is created, copy equipment from this template to their company
    - Each company can then edit their own equipment independently
  
  Changes:
    - Create equipment_template table (no company_id)
    - Populate with standard equipment
    - Equipment table remains per-company with company_id
*/

-- Create equipment_template table
CREATE TABLE IF NOT EXISTS equipment_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'free_to_use' CHECK (status IN ('free_to_use', 'in_use', 'broken')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on equipment_template
ALTER TABLE equipment_template ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to read template
CREATE POLICY "Authenticated users can read equipment_template"
  ON equipment_template FOR SELECT
  TO authenticated
  USING (true);

-- Insert standard equipment into template
INSERT INTO equipment_template (name, description, status) VALUES
  ('Concrete Mixer', 'Heavy duty concrete mixer with 500L capacity', 'free_to_use'),
  ('Power Generator', '15kW diesel generator', 'free_to_use'),
  ('Scaffolding Set', 'Complete scaffolding set for up to 3 floors', 'free_to_use'),
  ('Jackhammer', 'Electric jackhammer with various bits', 'free_to_use'),
  ('Crane', 'Mobile crane with 20-ton capacity', 'free_to_use')
ON CONFLICT DO NOTHING;

-- Add company_id column to equipment table if it doesn't exist
ALTER TABLE equipment
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

-- Create index on company_id for better performance
CREATE INDEX IF NOT EXISTS idx_equipment_company_id
ON equipment(company_id);

-- Update RLS policies for equipment to include company_id filtering
DROP POLICY IF EXISTS "Authenticated users can view equipment" ON equipment;
DROP POLICY IF EXISTS "Authenticated users can update equipment" ON equipment;

-- New policies with company_id filtering
CREATE POLICY "Users can view equipment for their company"
  ON equipment FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update equipment for their company"
  ON equipment FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert equipment for their company"
  ON equipment FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can delete equipment for their company"
  ON equipment FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
