/*
  # Update Estimated Hours From View

  1. Changes:
    - Add function to update estimated_hours in event_tasks table from the view
    - Add trigger to automatically update estimated_hours when the view is updated

  2. Purpose:
    - Keep the estimated_hours column in event_tasks in sync with calculated values
    - Ensure accurate time estimates are available directly in the event_tasks table
*/

-- Create function to update estimated hours from view
CREATE OR REPLACE FUNCTION update_estimated_hours_from_view()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the estimated_hours in the event_tasks table
    UPDATE event_tasks
    SET estimated_hours = NEW.calculated_estimated_hours
    WHERE id = NEW.id;  -- Assuming the view has the id of the event task

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update estimated hours
CREATE TRIGGER update_estimated_hours_trigger
AFTER UPDATE ON event_tasks
FOR EACH ROW
EXECUTE FUNCTION update_estimated_hours_from_view();
