/*
  # Add Day Notes Table

  1. New Tables
    - `day_notes`
      - For tracking daily notes associated with events
      - Columns:
        - id (uuid, primary key)
        - event_id (uuid, references events)
        - user_id (uuid, references profiles)
        - content (text)
        - date (date)
        - created_at (timestamptz)

  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create day_notes table
CREATE TABLE IF NOT EXISTS day_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE day_notes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create notes"
  ON day_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view notes for their events"
  ON day_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
      AND (e.created_by = auth.uid() OR auth.uid() = user_id)
    )
  );
