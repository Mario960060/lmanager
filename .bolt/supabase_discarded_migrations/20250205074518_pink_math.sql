/*
  # Add missing tables and columns for event details

  1. Changes:
    - Add tasks table for tracking individual tasks
    - Add task_hours table for tracking hours per task
    - Add task_progress table for tracking task progress
    - Add material_progress table for tracking material progress

  2. Security:
    - Enable RLS on all new tables
    - Add appropriate policies
*/

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  hours_worked numeric DEFAULT 0,
  is_finished boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create task_hours table
CREATE TABLE IF NOT EXISTS task_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  hours numeric NOT NULL CHECK (hours > 0),
  date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- Create task_progress table
CREATE TABLE IF NOT EXISTS task_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  hours_worked numeric NOT NULL CHECK (hours_worked > 0),
  is_finished boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create material_progress table
CREATE TABLE IF NOT EXISTS material_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES materials_delivered(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_progress ENABLE ROW LEVEL SECURITY;

-- Create policies for tasks
CREATE POLICY "Users can view tasks"
  ON tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert tasks"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policies for task_hours
CREATE POLICY "Users can insert their own hours"
  ON task_hours FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view task hours"
  ON task_hours FOR SELECT
  TO authenticated
  USING (true);

-- Create policies for task_progress
CREATE POLICY "Users can update task progress"
  ON task_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view task progress"
  ON task_progress FOR SELECT
  TO authenticated
  USING (true);

-- Create policies for material_progress
CREATE POLICY "Users can update material progress"
  ON material_progress FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view material progress"
  ON material_progress FOR SELECT
  TO authenticated
  USING (true);
