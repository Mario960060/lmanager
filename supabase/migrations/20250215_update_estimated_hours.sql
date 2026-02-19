/*
  # Update Estimated Hours Based on Task Progress

  1. Changes:
    - Add function to update estimated_hours in event_tasks table
    - Add trigger to automatically update estimated_hours when new task progress entries are added

  2. Purpose:
    - Dynamically adjust estimated hours based on actual task progress data
    - Improve accuracy of time estimates for future planning
*/

-- Create function to update estimated hours
CREATE OR REPLACE FUNCTION update_estimated_hours()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the estimated_hours in the event_tasks table
    UPDATE event_tasks
    SET estimated_hours = COALESCE(
        (
            SELECT SUM(tpe.hours_spent) / NULLIF(SUM(tpe.amount_completed), 0::numeric)
            FROM task_progress_entries tpe
            WHERE tpe.event_tasks_id = NEW.event_tasks_id AND tpe.amount_completed > 0::numeric
        ),
        estimated_hours  -- Keep the current value if no tasks are completed
    )
    WHERE id = NEW.event_tasks_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update estimated hours
CREATE TRIGGER task_progress_entries_insert
AFTER INSERT ON task_progress_entries
FOR EACH ROW
EXECUTE FUNCTION update_estimated_hours();

-- Drop the view if it exists (since we're now updating the column directly)
DROP VIEW IF EXISTS public.event_tasks_with_estimates;
