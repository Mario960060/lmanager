/*
  # Update is_deletable default to false for template tasks

  1. Changes:
    - Keep DEFAULT for event_tasks as true (user-created tasks are deletable by default)
    - Change DEFAULT for event_tasks_template to false (system tasks are not deletable)
    - Update all event_tasks_template records to is_deletable = false
    - When new company is created, tasks copied from template will have is_deletable = false

  2. Purpose:
    - System tasks from template cannot be deleted (is_deletable = false)
    - New tasks added by users to companies will default to true (deletable)
    - When copying from template to new company, tasks will be system tasks (not deletable)
*/

-- Keep DEFAULT as true for event_tasks (user-created tasks)
-- This is already the default, so we don't need to change it

-- Change default to false for event_tasks_template (system tasks)
ALTER TABLE event_tasks_template
ALTER COLUMN is_deletable SET DEFAULT false;

-- Update all template tasks to is_deletable = false (system tasks)
UPDATE event_tasks_template SET is_deletable = false;
