-- Horizontal fence slat materials for existing company (same IDs as template names).
-- Company ID: e0c755f1-dc7e-4804-aa20-77359aaeb479
-- Run after 20260329120000_horizontal_fence_slats_materials_template.sql

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Horizontal fence slat 180×10 cm', 'Horizontal fence slat: span along fence 180 cm, face width 10 cm', 'slats', false, 1
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Horizontal fence slat 180×10 cm');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Horizontal fence slat 180×15 cm', 'Horizontal fence slat: span along fence 180 cm, face width 15 cm', 'slats', false, 1
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Horizontal fence slat 180×15 cm');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Horizontal fence slat 180×20 cm', 'Horizontal fence slat: span along fence 180 cm, face width 20 cm', 'slats', false, 1
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Horizontal fence slat 180×20 cm');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Horizontal fence slat 360×10 cm', 'Horizontal fence slat: span along fence 360 cm, face width 10 cm', 'slats', false, 1
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Horizontal fence slat 360×10 cm');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Horizontal fence slat 360×15 cm', 'Horizontal fence slat: span along fence 360 cm, face width 15 cm', 'slats', false, 1
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Horizontal fence slat 360×15 cm');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Horizontal fence slat 360×20 cm', 'Horizontal fence slat: span along fence 360 cm, face width 20 cm', 'slats', false, 1
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Horizontal fence slat 360×20 cm');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Horizontal fence slat 420×10 cm', 'Horizontal fence slat: span along fence 420 cm, face width 10 cm', 'slats', false, 1
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Horizontal fence slat 420×10 cm');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Horizontal fence slat 420×15 cm', 'Horizontal fence slat: span along fence 420 cm, face width 15 cm', 'slats', false, 1
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Horizontal fence slat 420×15 cm');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Horizontal fence slat 420×20 cm', 'Horizontal fence slat: span along fence 420 cm, face width 20 cm', 'slats', false, 1
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Horizontal fence slat 420×20 cm');
