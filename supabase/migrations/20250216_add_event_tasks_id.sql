/*
  # Add event_tasks_id to task_progress_entries

  1. Changes:
    - Add event_tasks_id column to task_progress_entries table
    - Add foreign key constraint to reference event_tasks table
    - Update existing records if possible

  2. Purpose:
    - Enable direct linking between task progress entries and event tasks
    - Support the update_estimated_hours trigger function
*/

-- Add event_tasks_id column to task_progress_entries
ALTER TABLE task_progress_entries 
ADD COLUMN IF NOT EXISTS event_tasks_id uuid REFERENCES event_tasks(id);

-- Create an index for better performance
CREATE INDEX IF NOT EXISTS idx_task_progress_entries_event_tasks_id
ON task_progress_entries(event_tasks_id);

-- Note: You may need to update existing records to set the event_tasks_id value
-- This would require knowledge of how tasks_done relates to event_tasks
-- Example (modify as needed based on your data model):
/*
UPDATE task_progress_entries tpe
SET event_tasks_id = et.id
FROM tasks_done td
JOIN event_tasks et ON td.name = et.name
WHERE tpe.task_id = td.id
AND tpe.event_tasks_id IS NULL;
*/
