-- Add progress and completion fields to additional_tasks
ALTER TABLE additional_tasks
ADD COLUMN is_finished boolean DEFAULT false,
ADD COLUMN progress integer DEFAULT 0;

-- Create table for additional task materials
CREATE TABLE additional_task_materials (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  task_id uuid REFERENCES additional_tasks(id) ON DELETE CASCADE,
  material varchar NOT NULL,
  quantity decimal NOT NULL,
  unit varchar NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create table for additional task progress entries
CREATE TABLE additional_task_progress_entries (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  task_id uuid REFERENCES additional_tasks(id) ON DELETE CASCADE,
  progress_percentage integer NOT NULL,
  hours_worked decimal NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for better query performance
CREATE INDEX idx_additional_task_materials_task_id ON additional_task_materials(task_id);
CREATE INDEX idx_additional_task_progress_entries_task_id ON additional_task_progress_entries(task_id);
