-- Create universal mortar_mix_ratios table
CREATE TABLE IF NOT EXISTS mortar_mix_ratios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('slab', 'brick', 'blocks')) DEFAULT 'slab',
  mortar_mix_ratio text NOT NULL CHECK (mortar_mix_ratio IN ('1:4', '1:5', '1:6', '1:7', '1:8')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(company_id, type) -- Each company can have one ratio per type (slab, brick, blocks)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_mortar_mix_ratios_company_id_type 
ON mortar_mix_ratios(company_id, type);

-- Enable RLS
ALTER TABLE mortar_mix_ratios ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view mortar mix ratios for their company"
  ON mortar_mix_ratios FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert mortar mix ratios for their company"
  ON mortar_mix_ratios FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update mortar mix ratios for their company"
  ON mortar_mix_ratios FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete mortar mix ratios for their company"
  ON mortar_mix_ratios FOR DELETE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_mortar_mix_ratios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_mortar_mix_ratios_updated_at_trigger
  BEFORE UPDATE ON mortar_mix_ratios
  FOR EACH ROW
  EXECUTE FUNCTION update_mortar_mix_ratios_updated_at();
