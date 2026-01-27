/*
  # Separate Progress Tracking Tables

  1. New Tables
    - `material_deliveries`
      - For tracking individual material delivery entries
      - Columns:
        - id (uuid, primary key)
        - material_id (uuid, references materials_delivered)
        - event_id (uuid, references events)
        - user_id (uuid, references profiles)
        - amount (numeric)
        - delivery_date (date)
        - notes (text)
        - created_at (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create material deliveries table
CREATE TABLE IF NOT EXISTS material_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES materials_delivered(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  delivery_date date DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE material_deliveries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can insert material deliveries"
  ON material_deliveries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM materials_delivered
      WHERE id = material_id
      AND event_id = material_deliveries.event_id
    )
  );

CREATE POLICY "Users can view material deliveries"
  ON material_deliveries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM materials_delivered
      WHERE id = material_id
      AND event_id = material_deliveries.event_id
    )
  );

-- Create function to update material status
CREATE OR REPLACE FUNCTION update_material_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the total delivered amount and status in materials_delivered
  WITH delivery_totals AS (
    SELECT 
      material_id,
      SUM(amount) as total_delivered
    FROM material_deliveries
    WHERE material_id = NEW.material_id
    GROUP BY material_id
  )
  UPDATE materials_delivered
  SET 
    amount = dt.total_delivered,
    status = CASE 
      WHEN dt.total_delivered >= total_amount THEN 'delivered'
      WHEN dt.total_delivered > 0 THEN 'in_progress'
      ELSE 'pending'
    END
  FROM delivery_totals dt
  WHERE materials_delivered.id = dt.material_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update material status after delivery
CREATE TRIGGER update_material_after_delivery
  AFTER INSERT OR UPDATE ON material_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_material_status();
