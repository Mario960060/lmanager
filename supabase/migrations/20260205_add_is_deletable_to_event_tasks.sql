/*
  # Add is_deletable column to event_tasks

  1. Changes:
    - Add is_deletable column to event_tasks table
    - Add is_deletable column to event_tasks_template table
    - Set existing tasks to is_deletable = true (user-created tasks)
    - Set template tasks to is_deletable = true initially

  2. Purpose:
    - Enable distinction between system tasks (assigned to calculators) and user-created tasks
    - System tasks (is_deletable = false) cannot be deleted by users
    - User-created tasks (is_deletable = true) can be deleted
*/

-- Add is_deletable column to event_tasks table
ALTER TABLE event_tasks
ADD COLUMN IF NOT EXISTS is_deletable boolean DEFAULT true;

-- Add is_deletable column to event_tasks_template tables
ALTER TABLE event_tasks_template
ADD COLUMN IF NOT EXISTS is_deletable boolean DEFAULT true;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_event_tasks_is_deletable
ON event_tasks(is_deletable);

CREATE INDEX IF NOT EXISTS idx_event_tasks_template_is_deletable
ON event_tasks_template(is_deletable);

-- Comment for documentation
COMMENT ON COLUMN event_tasks.is_deletable IS 'If false, this is a system task assigned to a calculator and cannot be deleted by users. If true, user can delete this task.';
COMMENT ON COLUMN event_tasks_template.is_deletable IS 'If false, this is a system task assigned to a calculator and cannot be deleted by users. If true, user can delete this task.';
