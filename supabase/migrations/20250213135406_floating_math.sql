/*
  # Fix Hours Progress Trigger

  1. Updates
    - Modify trigger to handle DELETE operations
    - Add better error handling
    - Fix total hours calculation
    - Add debugging information
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS update_hours_after_entry ON hours_entries;
DROP FUNCTION IF EXISTS update_event_total_hours();

-- Create improved function
CREATE OR REPLACE FUNCTION update_event_total_hours()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id uuid;
  v_task_id uuid;
BEGIN
  -- Determine which event_id and task_id to use based on operation
  IF TG_OP = 'DELETE' THEN
    v_event_id := OLD.event_id;
    v_task_id := OLD.task_id;
  ELSE
    v_event_id := NEW.event_id;
    v_task_id := NEW.task_id;
  END IF;

  -- Update the total hours in the events table
  UPDATE events e
  SET total_hours = COALESCE(
    (
      SELECT SUM(h.hours)
      FROM hours_entries h
      WHERE h.event_id = v_event_id
    ),
    0
  )
  WHERE e.id = v_event_id;

  -- Update the task hours if task_id is provided
  IF v_task_id IS NOT NULL THEN
    UPDATE tasks_done t
    SET hours_worked = COALESCE(
      (
        SELECT SUM(h.hours)
        FROM hours_entries h
        WHERE h.task_id = v_task_id
      ),
      0
    )
    WHERE t.id = v_task_id;
  END IF;

  -- Return appropriate record based on operation
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error in update_event_total_hours: %', SQLERRM;
    RETURN NULL;
END;
$$;

-- Recreate trigger for all operations
CREATE TRIGGER update_hours_after_entry
  AFTER INSERT OR UPDATE OR DELETE ON hours_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_event_total_hours();

-- Refresh all totals
DO $$
BEGIN
  -- Update event totals
  UPDATE events e
  SET total_hours = COALESCE(
    (
      SELECT SUM(h.hours)
      FROM hours_entries h
      WHERE h.event_id = e.id
    ),
    0
  );

  -- Update task totals
  UPDATE tasks_done t
  SET hours_worked = COALESCE(
    (
      SELECT SUM(h.hours)
      FROM hours_entries h
      WHERE h.task_id = t.id
    ),
    0
  );
END;
$$ LANGUAGE plpgsql;
