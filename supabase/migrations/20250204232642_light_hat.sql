/*
  # Create all tables for the construction management system

  1. Tables Created:
    - profiles
    - events
    - hours_worked
    - tasks_done
    - materials_delivered
    - event_tasks
    - materials
    - additional_tasks
    - additional_materials

  2. Security:
    - RLS enabled on all tables
    - Appropriate policies for each table
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'project_manager', 'boss')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'scheduled', 'in_progress', 'finished')),
  has_equipment boolean DEFAULT false,
  has_materials boolean DEFAULT false,
  created_by uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

-- Create hours_worked table
CREATE TABLE IF NOT EXISTS hours_worked (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  hours numeric NOT NULL CHECK (hours > 0),
  date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- Create tasks_done table
CREATE TABLE IF NOT EXISTS tasks_done (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  amount text NOT NULL,
  hours_worked numeric NOT NULL CHECK (hours_worked > 0),
  is_finished boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create materials_delivered table
CREATE TABLE IF NOT EXISTS materials_delivered (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  unit text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create event_tasks table (Templates)
CREATE TABLE IF NOT EXISTS event_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  unit text NOT NULL,
  estimated_hours numeric NOT NULL CHECK (estimated_hours > 0),
  created_at timestamptz DEFAULT now()
);

-- Create materials table (Templates)
CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  unit text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create additional_tasks table
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

-- Create additional_materials table
CREATE TABLE IF NOT EXISTS additional_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  material text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE hours_worked ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks_done ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials_delivered ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE additional_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE additional_materials ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable insert for authenticated users only"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create policies for events
CREATE POLICY "Users can create events"
  ON events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view events they created or are assigned to"
  ON events FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM tasks_done td
      WHERE td.event_id = id AND td.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM additional_tasks at
      WHERE at.event_id = id AND at.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own events"
  ON events FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Create policies for hours_worked
CREATE POLICY "Users can insert their own hours"
  ON hours_worked FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view hours they logged"
  ON hours_worked FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create policies for tasks_done
CREATE POLICY "Users can insert their own tasks"
  ON tasks_done FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view tasks they logged"
  ON tasks_done FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create policies for materials_delivered
CREATE POLICY "Authenticated users can insert materials"
  ON materials_delivered FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view materials"
  ON materials_delivered FOR SELECT
  TO authenticated
  USING (true);

-- Create policies for event_tasks
CREATE POLICY "Authenticated users can read event tasks"
  ON event_tasks FOR SELECT
  TO authenticated
  USING (true);

-- Create policies for materials
CREATE POLICY "Authenticated users can read materials"
  ON materials FOR SELECT
  TO authenticated
  USING (true);

-- Create policies for additional_tasks
CREATE POLICY "Users can insert additional tasks"
  ON additional_tasks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view additional tasks for their events"
  ON additional_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
      AND (e.created_by = auth.uid() OR auth.uid() = user_id)
    )
  );

-- Create policies for additional_materials
CREATE POLICY "Users can insert additional materials"
  ON additional_materials FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view additional materials for their events"
  ON additional_materials FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
      AND (e.created_by = auth.uid() OR auth.uid() = user_id)
    )
  );

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- Insert sample data
INSERT INTO event_tasks (name, description, unit, estimated_hours) VALUES
  ('Wall Construction', 'Build standard wall section', 'meters', 4),
  ('Floor Tiling', 'Install ceramic floor tiles', 'square meters', 2),
  ('Painting', 'Paint walls with two coats', 'square meters', 0.5),
  ('Plumbing Installation', 'Install basic plumbing fixtures', 'units', 3),
  ('Electrical Wiring', 'Install electrical wiring and outlets', 'points', 1.5);

INSERT INTO materials (name, description, unit) VALUES
  ('Cement', 'Standard Portland cement', 'bags'),
  ('Sand', 'Construction grade sand', 'cubic meters'),
  ('Bricks', 'Standard clay bricks', 'pieces'),
  ('Steel Rebar', '12mm steel reinforcement bars', 'pieces'),
  ('Paint', 'Interior wall paint', 'liters'),
  ('Tiles', 'Ceramic floor tiles 30x30cm', 'boxes'),
  ('Plumbing Pipes', 'PVC pipes 1 inch', 'meters'),
  ('Electrical Wire', '2.5mm electrical wire', 'meters');
