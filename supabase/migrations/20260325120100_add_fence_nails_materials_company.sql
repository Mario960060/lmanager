-- Add fence nail materials to materials (per company)
-- Company ID: e0c755f1-dc7e-4804-aa20-77359aaeb479
-- Run after 20260325120000_add_fence_nails_materials_template.sql

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Fence nails 45 mm', 'Nails 45 mm for vertical and horizontal fence slats', 'pieces', false, 1
WHERE NOT EXISTS (
  SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Fence nails 45 mm'
);

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Fence nails 35 mm', 'Nails 35 mm for Venetian fence slats', 'pieces', false, 1
WHERE NOT EXISTS (
  SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Fence nails 35 mm'
);

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Fence nails 75 mm', 'Nails 75 mm for fence rails (to posts)', 'pieces', false, 1
WHERE NOT EXISTS (
  SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Fence nails 75 mm'
);
