-- Fence nail materials (global template for new companies)
-- Names must match FenceCalculator.tsx, VenetianFenceCalculator.tsx and fenceNailMaterials.ts

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Fence nails 45 mm', 'Nails 45 mm for vertical and horizontal fence slats', 'pieces', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Fence nails 45 mm');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Fence nails 35 mm', 'Nails 35 mm for Venetian fence slats', 'pieces', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Fence nails 35 mm');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Fence nails 75 mm', 'Nails 75 mm for fence rails (to posts)', 'pieces', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Fence nails 75 mm');
