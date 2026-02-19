/*
  # Add Project Tasks and Materials Tables

  1. New Tables
    - `event_tasks`
      - Template table for predefined tasks
      - Columns:
        - id (uuid, primary key)
        - name (text)
        - description (text)
        - unit (text)
        - estimated_hours (numeric)
        - created_at (timestamptz)

    - `materials`
      - Template table for available materials
      - Columns:
        - id (uuid, primary key)
        - name (text)
        - description (text)
        - unit (text)
        - created_at (timestamptz)

    - `additional_tasks`
      - For tracking additional tasks added to events
      - Columns:
        - id (uuid, primary key)
        - event_id (uuid, references events)
        - user_id (uuid, references profiles)
        - description (text)
        - start_date (date)
        - end_date (date)
        - hours_needed (numeric)
        - materials_needed (text)
        - created_at (timestamptz)

    - `additional_materials`
      - For tracking additional materials needed for events
      - Columns:
        - id (uuid, primary key)
        - event_id (uuid, references events)
        - user_id (uuid, references profiles)
        - material (text)
        - quantity (numeric)
        - created_at (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Event Tasks (Templates)
CREATE TABLE IF NOT EXISTS event_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  unit text NOT NULL,
  estimated_hours numeric NOT NULL CHECK (estimated_hours > 0),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE event_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read event tasks"
  ON event_tasks
  FOR SELECT
  TO authenticated
  USING (true);

-- Materials (Templates)
CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  unit text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read materials"
  ON materials
  FOR SELECT
  TO authenticated
  USING (true);

-- Additional Tasks
CREATE TABLE IF NOT EXISTS additional_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  description text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  hours_needed numeric NOT NULL CHECK (hours_needed > 0),
  materials_needed text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

ALTER TABLE additional_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert additional tasks"
  ON additional_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view additional tasks for their events"
  ON additional_tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
      AND (e.created_by = auth.uid() OR auth.uid() = user_id)
    )
  );

-- Additional Materials
CREATE TABLE IF NOT EXISTS additional_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  material text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE additional_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert additional materials"
  ON additional_materials
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view additional materials for their events"
  ON additional_materials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
      AND (e.created_by = auth.uid() OR auth.uid() = user_id)
    )
  );

-- Insert some sample task templates
INSERT INTO event_tasks (name, description, unit, estimated_hours) VALUES
  ('Wall Construction', 'Build standard wall section', 'meters', 4),
  ('Floor Tiling', 'Install ceramic floor tiles', 'square meters', 2),
  ('Painting', 'Paint walls with two coats', 'square meters', 0.5),
  ('Plumbing Installation', 'Install basic plumbing fixtures', 'units', 3),
  ('Electrical Wiring', 'Install electrical wiring and outlets', 'points', 1.5);

-- Insert some sample materials
INSERT INTO materials (name, description, unit) VALUES
  ('Cement', 'Standard Portland cement', 'bags'),
  ('Sand', 'Construction grade sand', 'cubic meters'),
  ('Bricks', 'Standard clay bricks', 'pieces'),
  ('Steel Rebar', '12mm steel reinforcement bars', 'pieces'),
  ('Paint', 'Interior wall paint', 'liters'),
  ('Tiles', 'Ceramic floor tiles 30x30cm', 'boxes'),
  ('Plumbing Pipes', 'PVC pipes 1 inch', 'meters'),
  ('Electrical Wire', '2.5mm electrical wire', 'meters');
