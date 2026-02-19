/*
  # Add task progress tracking

  1. New Tables
    - `task_progress_entries`
      - For tracking individual progress entries for tasks
      - Columns:
        - id (uuid, primary key)
        - task_id (uuid, references tasks_done)
        - amount_completed (numeric)
        - hours_spent (numeric)
        - created_at (timestamptz)
*/

CREATE TABLE IF NOT EXISTS task_progress_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks_done(id) ON DELETE CASCADE,
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
    EXISTS (
      SELECT 1 FROM tasks_done
      WHERE id = task_id
      AND user_id = auth.uid()
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
      AND user_id = auth.uid()
    )
  );
