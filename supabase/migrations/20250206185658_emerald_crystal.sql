/*
  # Add Calendar Materials Table

  1. New Tables
    - `calendar_materials`
      - For tracking additional materials needed for specific dates
      - Columns:
        - id (uuid, primary key)
        - event_id (uuid, references events)
        - user_id (uuid, references profiles)
        - material (text)
        - quantity (numeric)
        - unit (text)
        - date (date)
        - notes (text)
        - created_at (timestamptz)

  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create calendar materials table
CREATE TABLE IF NOT EXISTS calendar_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  material text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  date date NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE calendar_materials ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create calendar materials"
  ON calendar_materials
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view calendar materials"
  ON calendar_materials
  FOR SELECT
  TO authenticated
  USING (true);
