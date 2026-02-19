/*
  # Update Project Schema

  1. New Tables
    - `events`
      - Main table for projects/events
      - Columns:
        - id (uuid, primary key)
        - title (text)
        - description (text)
        - start_date (date)
        - end_date (date)
        - status (enum)
        - has_equipment (boolean)
        - has_materials (boolean)
        - created_by (uuid)
        - created_at (timestamptz)
        - updated_at (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create events table if it doesn't exist
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

-- Enable RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create events"
  ON events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view events they created or are assigned to"
  ON events
  FOR SELECT
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
  ON events
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Create function to handle updated_at
CREATE OR REPLACE FUNCTION handle_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION handle_events_updated_at();

-- Insert sample events
INSERT INTO events (title, description, start_date, end_date, status, has_materials, created_by)
SELECT
  'Sample Construction Project',
  'A demonstration project with various construction tasks',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  'in_progress',
  true,
  id
FROM profiles
WHERE role = 'boss'
LIMIT 1;
