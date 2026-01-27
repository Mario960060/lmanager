/*
  # Fix task progress entries schema and add missing columns

  1. Changes
    - Drop and recreate task_progress_entries table with proper UUID handling
    - Add user_id column for better tracking
    - Add event_id column for direct event association
    - Improve constraints and checks

  2. Security
    - Update RLS policies to use event_id for better access control
*/

-- Drop existing table if it exists
DROP TABLE IF EXISTS task_progress_entries;

-- Create the table with proper UUID handling
CREATE TABLE task_progress_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks_done(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  amount_completed numeric NOT NULL CHECK (amount_completed > 0),
  hours_spent numeric NOT NULL CHECK (hours_spent > 0),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE task_progress_entries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can insert task progress entries"
  ON task_progress_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM tasks_done
      WHERE id = task_id
      AND event_id = task_progress_entries.event_id
    )
  );

CREATE POLICY "Users can view task progress entries"
  ON task_progress_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks_done
      WHERE id = task_id
      AND (user_id = auth.uid() OR event_id = task_progress_entries.event_id)
    )
  );
