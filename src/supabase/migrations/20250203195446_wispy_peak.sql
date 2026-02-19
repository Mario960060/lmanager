/*
  # Add Dashboard Tables

  1. New Tables
    - `hours_worked`
      - `id` (uuid, primary key)
      - `event_id` (uuid, foreign key to events)
      - `user_id` (uuid, foreign key to profiles)
      - `hours` (numeric)
      - `date` (date)
      - `created_at` (timestamptz)

    - `tasks_done`
      - `id` (uuid, primary key)
      - `event_id` (uuid, foreign key to events)
      - `user_id` (uuid, foreign key to profiles)
      - `amount` (text)
      - `hours_worked` (numeric)
      - `is_finished` (boolean)
      - `created_at` (timestamptz)

    - `materials_delivered`
      - `id` (uuid, primary key)
      - `event_id` (uuid, foreign key to events)
      - `amount` (numeric)
      - `unit` (text)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Hours Worked Table
CREATE TABLE IF NOT EXISTS hours_worked (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  hours numeric NOT NULL CHECK (hours > 0),
  date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hours_worked ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own hours"
  ON hours_worked
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view hours they logged"
  ON hours_worked
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Tasks Done Table
CREATE TABLE IF NOT EXISTS tasks_done (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  amount text NOT NULL,
  hours_worked numeric NOT NULL CHECK (hours_worked > 0),
  is_finished boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tasks_done ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own tasks"
  ON tasks_done
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view tasks they logged"
  ON tasks_done
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Materials Delivered Table
CREATE TABLE IF NOT EXISTS materials_delivered (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  unit text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE materials_delivered ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert materials"
  ON materials_delivered
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view materials"
  ON materials_delivered
  FOR SELECT
  TO authenticated
  USING (true);
