/*
  # Add Equipment Management System

  1. New Tables
    - `equipment`
      - `id` (uuid, primary key)
      - `name` (text)
      - `description` (text)
      - `status` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `equipment_usage`
      - `id` (uuid, primary key)
      - `equipment_id` (uuid, references equipment)
      - `event_id` (uuid, references events)
      - `start_date` (date)
      - `end_date` (date)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users
*/

-- Create equipment table
CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'free_to_use' CHECK (status IN ('free_to_use', 'in_use', 'broken')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on equipment
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- Create policies for equipment
CREATE POLICY "Authenticated users can view equipment"
  ON equipment
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update equipment"
  ON equipment
  FOR UPDATE
  TO authenticated
  USING (true);

-- Create equipment usage table
CREATE TABLE IF NOT EXISTS equipment_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid REFERENCES equipment(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

-- Enable RLS on equipment_usage
ALTER TABLE equipment_usage ENABLE ROW LEVEL SECURITY;

-- Create policies for equipment_usage
CREATE POLICY "Authenticated users can create equipment usage"
  ON equipment_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view equipment usage"
  ON equipment_usage
  FOR SELECT
  TO authenticated
  USING (true);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_equipment_updated_at
  BEFORE UPDATE ON equipment
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_equipment_usage_updated_at
  BEFORE UPDATE ON equipment_usage
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- Insert some sample equipment
INSERT INTO equipment (name, description, status) VALUES
  ('Concrete Mixer', 'Heavy duty concrete mixer with 500L capacity', 'free_to_use'),
  ('Power Generator', '15kW diesel generator', 'free_to_use'),
  ('Scaffolding Set', 'Complete scaffolding set for up to 3 floors', 'free_to_use'),
  ('Jackhammer', 'Electric jackhammer with various bits', 'free_to_use'),
  ('Crane', 'Mobile crane with 20-ton capacity', 'free_to_use');
