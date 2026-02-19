-- Migration: Add CASCADE DELETE to invoices table
-- This ensures that when an event (project) is deleted, all related invoices are automatically deleted

-- First, drop the existing foreign key constraint for invoices
ALTER TABLE invoices 
DROP CONSTRAINT IF EXISTS invoices_project_id_fkey;

-- Add the foreign key constraint back with ON DELETE CASCADE
ALTER TABLE invoices 
ADD CONSTRAINT invoices_project_id_fkey 
FOREIGN KEY (project_id) 
REFERENCES events(id) 
ON DELETE CASCADE;

-- Do the same for other tables that reference events to ensure clean deletion

-- tasks_done
ALTER TABLE tasks_done 
DROP CONSTRAINT IF EXISTS tasks_done_event_id_fkey;

ALTER TABLE tasks_done 
ADD CONSTRAINT tasks_done_event_id_fkey 
FOREIGN KEY (event_id) 
REFERENCES events(id) 
ON DELETE CASCADE;

-- materials_delivered
ALTER TABLE materials_delivered 
DROP CONSTRAINT IF EXISTS materials_delivered_event_id_fkey;

ALTER TABLE materials_delivered 
ADD CONSTRAINT materials_delivered_event_id_fkey 
FOREIGN KEY (event_id) 
REFERENCES events(id) 
ON DELETE CASCADE;

-- calendar_equipment (if exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'calendar_equipment'
    ) THEN
        ALTER TABLE calendar_equipment 
        DROP CONSTRAINT IF EXISTS calendar_equipment_event_id_fkey;
        
        ALTER TABLE calendar_equipment 
        ADD CONSTRAINT calendar_equipment_event_id_fkey 
        FOREIGN KEY (event_id) 
        REFERENCES events(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- equipment_usage (if exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'equipment_usage'
    ) THEN
        ALTER TABLE equipment_usage 
        DROP CONSTRAINT IF EXISTS equipment_usage_event_id_fkey;
        
        ALTER TABLE equipment_usage 
        ADD CONSTRAINT equipment_usage_event_id_fkey 
        FOREIGN KEY (event_id) 
        REFERENCES events(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- additional_tasks (if exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'additional_tasks'
    ) THEN
        ALTER TABLE additional_tasks 
        DROP CONSTRAINT IF EXISTS additional_tasks_event_id_fkey;
        
        ALTER TABLE additional_tasks 
        ADD CONSTRAINT additional_tasks_event_id_fkey 
        FOREIGN KEY (event_id) 
        REFERENCES events(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- day_notes (if exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'day_notes'
    ) THEN
        ALTER TABLE day_notes 
        DROP CONSTRAINT IF EXISTS day_notes_event_id_fkey;
        
        ALTER TABLE day_notes 
        ADD CONSTRAINT day_notes_event_id_fkey 
        FOREIGN KEY (event_id) 
        REFERENCES events(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- deletion_requests (if exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'deletion_requests'
    ) THEN
        ALTER TABLE deletion_requests 
        DROP CONSTRAINT IF EXISTS deletion_requests_event_id_fkey;
        
        ALTER TABLE deletion_requests 
        ADD CONSTRAINT deletion_requests_event_id_fkey 
        FOREIGN KEY (event_id) 
        REFERENCES events(id) 
        ON DELETE CASCADE;
    END IF;
END $$;
