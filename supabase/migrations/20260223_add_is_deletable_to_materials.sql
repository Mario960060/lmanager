/*
  # Add is_deletable to materials (like event_tasks)

  1. Changes:
    - Add is_deletable column to materials table
    - Add is_deletable column to materials_template table
    - materials: DEFAULT true (user-created materials are deletable)
    - materials_template: DEFAULT false (system materials from template are not deletable)
    - Update all materials_template records to is_deletable = false

  2. Purpose:
    - System materials (from template) cannot be deleted or edited (name, description, unit)
    - System materials CAN have their price edited (company-specific pricing)
    - User-created materials can be fully edited and deleted
*/

-- Add is_deletable to materials (user-created materials are deletable by default)
ALTER TABLE materials
ADD COLUMN IF NOT EXISTS is_deletable boolean DEFAULT true;

-- Add is_deletable to materials_template (system materials)
ALTER TABLE materials_template
ADD COLUMN IF NOT EXISTS is_deletable boolean DEFAULT false;

-- Update all template materials to is_deletable = false (system materials)
UPDATE materials_template SET is_deletable = false;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_materials_is_deletable ON materials(is_deletable);
CREATE INDEX IF NOT EXISTS idx_materials_template_is_deletable ON materials_template(is_deletable);

COMMENT ON COLUMN materials.is_deletable IS 'If false, this is a system material from template and cannot be deleted. Name/description/unit cannot be changed, but price can be edited.';
COMMENT ON COLUMN materials_template.is_deletable IS 'If false, this is a system material and cannot be deleted when copied to company.';
