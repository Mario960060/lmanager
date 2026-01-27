/*
  # Update task requirements schema

  1. Changes
    - Add tools column to task_requirements table
    - Make task_id nullable to allow generic requirements
    - Add name column for grouping requirements
    - Add description column for additional details

  2. Security
    - Maintain existing RLS policies
*/

-- Drop existing task_requirements table
DROP TABLE IF EXISTS task_requirements;

-- Create new task_requirements table
CREATE TABLE IF NOT EXISTS task_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  task_id uuid REFERENCES event_tasks(id) ON DELETE SET NULL,
  material_id uuid REFERENCES materials(id) ON DELETE CASCADE,
  quantity numeric NOT NULL CHECK (quantity > 0),
  tools jsonb DEFAULT '[]',
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

-- Insert sample task requirements
WITH task_materials AS (
  SELECT 
    et.id as task_id,
    m.id as material_id,
    et.name as task_name,
    m.name as material_name,
    CASE 
      WHEN et.name = 'Wall Construction' AND m.name = 'Cement' THEN 2
      WHEN et.name = 'Wall Construction' AND m.name = 'Bricks' THEN 100
      WHEN et.name = 'Wall Construction' AND m.name = 'Sand' THEN 0.5
      WHEN et.name = 'Floor Tiling' AND m.name = 'Tiles' THEN 25
      WHEN et.name = 'Floor Tiling' AND m.name = 'Cement' THEN 1
      WHEN et.name = 'Painting' AND m.name = 'Paint' THEN 5
    END as calculated_quantity
  FROM event_tasks et
  CROSS JOIN materials m
  WHERE 
    (et.name = 'Wall Construction' AND m.name IN ('Cement', 'Bricks', 'Sand'))
    OR (et.name = 'Floor Tiling' AND m.name IN ('Tiles', 'Cement'))
    OR (et.name = 'Painting' AND m.name IN ('Paint'))
)
INSERT INTO task_requirements (
  name,
  description,
  task_id,
  material_id,
  quantity,
  tools
)
SELECT 
  CASE 
    WHEN task_name = 'Wall Construction' THEN 'Basic Wall Construction'
    WHEN task_name = 'Floor Tiling' THEN 'Standard Floor Tiling'
    WHEN task_name = 'Painting' THEN 'Interior Wall Painting'
  END,
  CASE 
    WHEN task_name = 'Wall Construction' THEN 'Requirements for constructing a standard wall section'
    WHEN task_name = 'Floor Tiling' THEN 'Requirements for tiling a standard floor area'
    WHEN task_name = 'Painting' THEN 'Requirements for painting interior walls'
  END,
  task_id,
  material_id,
  calculated_quantity,
  CASE 
    WHEN task_name = 'Wall Construction' THEN '["Trowel", "Level", "String Line", "Wheelbarrow", "Mixing Container"]'::jsonb
    WHEN task_name = 'Floor Tiling' THEN '["Tile Cutter", "Trowel", "Level", "Spacers", "Grout Float"]'::jsonb
    WHEN task_name = 'Painting' THEN '["Paint Roller", "Paint Brush", "Paint Tray", "Masking Tape", "Drop Cloth"]'::jsonb
  END
FROM task_materials
WHERE calculated_quantity IS NOT NULL;

-- Insert generic requirements (not tied to specific tasks)
INSERT INTO task_requirements (name, description, material_id, quantity, tools) VALUES
  (
    'Basic Concrete Work',
    'Standard requirements for basic concrete work',
    (SELECT id FROM materials WHERE name = 'Cement'),
    3,
    '["Concrete Mixer", "Shovel", "Wheelbarrow", "Float", "Edger"]'::jsonb
  ),
  (
    'Basic Masonry Work',
    'Standard requirements for basic masonry work',
    (SELECT id FROM materials WHERE name = 'Bricks'),
    150,
    '["Trowel", "Level", "Mason Line", "Brick Hammer", "Jointing Tool"]'::jsonb
  );
