-- Add missing columns to match task_progress_entries
ALTER TABLE additional_task_progress_entries
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id),
ADD COLUMN IF NOT EXISTS amount_completed numeric DEFAULT 1;

-- Rename hours_worked to match task_progress_entries
ALTER TABLE additional_task_progress_entries 
RENAME COLUMN hours_worked TO hours_spent;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_additional_task_progress_user_id ON additional_task_progress_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_additional_task_progress_event_id ON additional_task_progress_entries(event_id);

-- Update existing records to copy event_id from additional_tasks
UPDATE additional_task_progress_entries atpe
SET event_id = at.event_id,
    user_id = at.user_id
FROM additional_tasks at
WHERE atpe.task_id = at.id;

-- Add NOT NULL constraints after data migration
ALTER TABLE additional_task_progress_entries
ALTER COLUMN user_id SET NOT NULL,
ALTER COLUMN event_id SET NOT NULL,
ALTER COLUMN amount_completed SET DEFAULT 1,
ALTER COLUMN amount_completed SET NOT NULL;
