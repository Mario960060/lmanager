/*
  # Add missing tables and update existing ones

  1. New Tables:
    - `task_hours` - Track hours worked per task
      - id (uuid)
      - task_id (uuid)
      - event_id (uuid)
      - user_id (uuid)
      - hours (numeric)
      - date (date)
      - created_at (timestamptz)

    - `task_progress` - Track task completion progress
      - id (uuid)
      - task_id (uuid)
      - user_id (uuid)
      - hours_worked (numeric)
      - is_finished (boolean)
      - created_at (timestamptz)

    - `material_progress` - Track material delivery progress
      - id (uuid)
      - material_id (uuid)
      - amount (numeric)
      - created_at (timestamptz)

  2. Security:
    - Enable RLS on all new tables
    - Add appropriate policies for data access
*/

-- Create task_hours table
CREATE TABLE IF NOT EXISTS task_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks_done(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  hours numeric NOT NULL CHECK (hours > 0),
  date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- Create task_progress table
CREATE TABLE IF NOT EXISTS task_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks_done(id) ON DELETE CASCADE,
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

-- Enable Row Level Security
ALTER TABLE task_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_progress ENABLE ROW LEVEL SECURITY;

-- Policies for task_hours
CREATE POLICY "Users can insert their own hours"
  ON task_hours
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view hours they logged"
  ON task_hours
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for task_progress
CREATE POLICY "Users can update their own task progress"
  ON task_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view task progress"
  ON task_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for material_progress
CREATE POLICY "Users can update material progress"
  ON material_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view material progress"
  ON material_progress
  FOR SELECT
  TO authenticated
  USING (true);
