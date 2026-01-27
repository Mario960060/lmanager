/*
  # Update Hours Tracking System

  1. Changes
    - Add task_id column to hours_entries table
    - Add task hours summary view
    - Update RLS policies

  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Add task_id to hours_entries
ALTER TABLE hours_entries
ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks_done(id) ON DELETE CASCADE;

-- Create task hours summary view
CREATE OR REPLACE VIEW task_hours_summary AS
SELECT 
  task_id,
  event_id,
  SUM(hours) as total_hours,
  COUNT(*) as entries_count,
  MIN(date) as first_entry,
  MAX(date) as last_entry
FROM hours_entries
GROUP BY task_id, event_id;

-- Update RLS policies for hours_entries
DROP POLICY IF EXISTS "Users can insert their own hours entries" ON hours_entries;
DROP POLICY IF EXISTS "Users can view hours entries for their events" ON hours_entries;

CREATE POLICY "Users can insert their own hours entries"
  ON hours_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM tasks_done
      WHERE id = task_id
      AND event_id = hours_entries.event_id
    )
  );

CREATE POLICY "Users can view hours entries for their events"
  ON hours_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks_done
      WHERE id = task_id
      AND (
        user_id = auth.uid() OR
        event_id = hours_entries.event_id
      )
    )
  );

-- Update the event total hours function to consider task_id
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
  
  -- Update the task hours in tasks_done
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
