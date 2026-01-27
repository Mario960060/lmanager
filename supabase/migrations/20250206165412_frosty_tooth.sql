/*
  # Update task requirements table

  1. Changes
    - Drop existing task_requirements table
    - Create new task_requirements table with JSONB arrays for both tools and materials
    - Add sample data with tools and materials lists

  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Drop existing task_requirements table
DROP TABLE IF EXISTS task_requirements;

-- Create new task_requirements table
CREATE TABLE IF NOT EXISTS task_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  tools jsonb DEFAULT '[]',
  materials jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE task_requirements ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view task requirements"
  ON task_requirements
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert task requirements"
  ON task_requirements
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Insert sample task requirements
INSERT INTO task_requirements (name, description, tools, materials) VALUES
  (
    'Basic Wall Construction',
    'Requirements for constructing a standard wall section',
    '["Trowel", "Level", "String Line", "Wheelbarrow", "Mixing Container"]'::jsonb,
    '["Cement (2 bags)", "Bricks (100 pieces)", "Sand (0.5 cubic meters)", "Water"]'::jsonb
  ),
  (
    'Standard Floor Tiling',
    'Requirements for tiling a standard floor area',
    '["Tile Cutter", "Trowel", "Level", "Spacers", "Grout Float"]'::jsonb,
    '["Tiles (25 boxes)", "Cement (1 bag)", "Grout", "Tile Adhesive"]'::jsonb
  ),
  (
    'Interior Wall Painting',
    'Requirements for painting interior walls',
    '["Paint Roller", "Paint Brush", "Paint Tray", "Masking Tape", "Drop Cloth"]'::jsonb,
    '["Paint (5 liters)", "Primer", "Sandpaper", "Filler"]'::jsonb
  ),
  (
    'Basic Concrete Work',
    'Standard requirements for basic concrete work',
    '["Concrete Mixer", "Shovel", "Wheelbarrow", "Float", "Edger"]'::jsonb,
    '["Cement (3 bags)", "Sand (1 cubic meter)", "Gravel", "Water"]'::jsonb
  ),
  (
    'Basic Masonry Work',
    'Standard requirements for basic masonry work',
    '["Trowel", "Level", "Mason Line", "Brick Hammer", "Jointing Tool"]'::jsonb,
    '["Bricks (150 pieces)", "Cement (2 bags)", "Sand (0.5 cubic meters)", "Water"]'::jsonb
  );
