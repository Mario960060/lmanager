/*
  # Recreate Hours Entries Table

  1. New Tables
    - `hours_entries`
      - For tracking hours worked on events and tasks
      - Columns:
        - id (uuid, primary key)
        - event_id (uuid, references events)
        - task_id (uuid, references tasks_done)
        - user_id (uuid, references profiles)
        - hours (numeric)
        - date (date)
        - notes (text)
        - created_at (timestamptz)

  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create hours entries table
CREATE TABLE IF NOT EXISTS hours_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks_done(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  hours numeric NOT NULL CHECK (hours > 0),
  date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE hours_entries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can insert hours entries"
  ON hours_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('user', 'Team_Leader', 'project_manager', 'Admin')
    )
  );

CREATE POLICY "Users can view hours entries"
  ON hours_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('user', 'Team_Leader', 'project_manager', 'Admin')
    )
  );

-- Create function to update total hours
CREATE OR REPLACE FUNCTION update_event_total_hours()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the total hours in the events table
  WITH hours_totals AS (
    SELECT 
      event_id,
      SUM(hours) as total_hours
    FROM hours_entries
    WHERE event_id = NEW.event_id
    GROUP BY event_id
  )
  UPDATE events
  SET total_hours = COALESCE(ht.total_hours, 0)
  FROM hours_totals ht
  WHERE events.id = ht.event_id;
  
  -- Update the task hours if task_id is provided
  IF NEW.task_id IS NOT NULL THEN
    WITH task_hours AS (
      SELECT 
        task_id,
        SUM(hours) as total_hours
      FROM hours_entries
      WHERE task_id = NEW.task_id
      GROUP BY task_id
    )
    UPDATE tasks_done
    SET hours_worked = COALESCE(th.total_hours, 0)
    FROM task_hours th
    WHERE tasks_done.id = th.task_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- Create trigger for updating hours
CREATE TRIGGER update_hours_after_entry
  AFTER INSERT OR UPDATE ON hours_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_event_total_hours();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON hours_entries TO authenticated;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_hours_entries_event_user
ON hours_entries(event_id, user_id);

CREATE INDEX IF NOT EXISTS idx_hours_entries_task
ON hours_entries(task_id)
WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hours_entries_date
ON hours_entries(date);
