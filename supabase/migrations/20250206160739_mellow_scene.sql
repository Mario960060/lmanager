/*
  # Add task requirements table

  1. New Tables
    - `task_requirements`
      - `id` (uuid, primary key)
      - `task_id` (uuid, references event_tasks)
      - `material_id` (uuid, references materials)
      - `quantity` (numeric)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create task requirements table
CREATE TABLE IF NOT EXISTS task_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES event_tasks(id) ON DELETE CASCADE,
  material_id uuid REFERENCES materials(id) ON DELETE CASCADE,
  quantity numeric NOT NULL CHECK (quantity > 0),
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
WITH requirements AS (
  SELECT 
    et.id as task_id,
    m.id as material_id,
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
INSERT INTO task_requirements (task_id, material_id, quantity)
SELECT task_id, material_id, calculated_quantity
FROM requirements
WHERE calculated_quantity IS NOT NULL;
