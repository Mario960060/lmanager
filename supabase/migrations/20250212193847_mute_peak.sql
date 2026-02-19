/*
  # Add total_hours column to events table

  1. Changes
    - Add total_hours column to events table with default value of 0
    - Add check constraint to ensure total_hours is not negative
*/

-- Add total_hours column if it doesn't exist
ALTER TABLE events
ADD COLUMN IF NOT EXISTS total_hours numeric NOT NULL DEFAULT 0
CHECK (total_hours >= 0);

-- Create index for total_hours column
CREATE INDEX IF NOT EXISTS idx_events_total_hours 
ON events(total_hours);

-- Update existing events to have 0 total_hours if not set
UPDATE events 
SET total_hours = 0 
WHERE total_hours IS NULL;
