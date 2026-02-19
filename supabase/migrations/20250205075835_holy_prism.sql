/*
  # Fix schema issues and add missing columns

  1. Updates:
    - Add unit column to tasks_done table
    - Add name column to tasks_done table
    - Add description column to tasks_done table

  2. Changes:
    - Add missing columns to support task tracking
    - Ensure proper UUID handling
*/

-- Add missing columns to tasks_done
ALTER TABLE tasks_done 
ADD COLUMN IF NOT EXISTS unit text,
ADD COLUMN IF NOT EXISTS name text,
ADD COLUMN IF NOT EXISTS description text;
