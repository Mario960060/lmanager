-- Create calendar materials table if it doesn't exist
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

-- Enable RLS if not already enabled
ALTER TABLE calendar_materials ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can create calendar materials" ON calendar_materials;
DROP POLICY IF EXISTS "Users can view calendar materials" ON calendar_materials;

-- Create new policies
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

-- Drop existing index if it exists
DROP INDEX IF EXISTS idx_calendar_materials_date_event;

-- Create new index
CREATE INDEX idx_calendar_materials_date_event
ON calendar_materials(date, event_id);
