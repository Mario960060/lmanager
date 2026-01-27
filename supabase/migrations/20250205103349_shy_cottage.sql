/*
  # Add Hours Entries Table

  1. New Tables
    - `hours_entries`
      - For tracking detailed hours worked entries
      - Columns:
        - id (uuid, primary key)
        - event_id (uuid, references events)
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
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  hours numeric NOT NULL CHECK (hours > 0),
  date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE hours_entries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can insert their own hours entries"
  ON hours_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM events
      WHERE id = event_id
    )
  );

CREATE POLICY "Users can view hours entries for their events"
  ON hours_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE id = event_id AND (
        created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM tasks_done
          WHERE event_id = hours_entries.event_id
          AND user_id = auth.uid()
        )
      )
    )
  );

-- Create function to update total hours in events
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
  SET total_hours = ht.total_hours
  FROM hours_totals ht
  WHERE events.id = ht.event_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update total hours after entry
CREATE TRIGGER update_event_hours_after_entry
  AFTER INSERT OR UPDATE ON hours_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_event_total_hours();
