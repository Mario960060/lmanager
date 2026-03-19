-- Add Artificial Grass + all slab materials to materials (per company)
-- Company ID: e0c755f1-dc7e-4804-aa20-77359aaeb479
-- Run this after 20260318_add_artificial_grass_material.sql and 20260318_add_slab_materials_template.sql

-- Artificial Grass
INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Artificial Grass', 'Synthetic grass for lawn installation, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Artificial Grass');

-- Porcelain slabs
INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Porcelain 40×40', 'Porcelain paving slabs 40×40 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Porcelain 40×40');

INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Porcelain 60×60', 'Porcelain paving slabs 60×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Porcelain 60×60');

INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Porcelain 90×60', 'Porcelain paving slabs 90×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Porcelain 90×60');

-- Sandstone slabs
INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Sandstone 40×40', 'Sandstone paving slabs 40×40 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Sandstone 40×40');

INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Sandstone 60×60', 'Sandstone paving slabs 60×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Sandstone 60×60');

INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Sandstone 90×60', 'Sandstone paving slabs 90×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Sandstone 90×60');

-- Granite slabs
INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Granite 40×40', 'Granite paving slabs 40×40 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Granite 40×40');

INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Granite 60×60', 'Granite paving slabs 60×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Granite 60×60');

INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Granite 90×60', 'Granite paving slabs 90×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Granite 90×60');

-- Concrete slabs
INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Concrete slabs 40×40', 'Concrete paving slabs 40×40 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Concrete slabs 40×40');

INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Concrete slabs 60×60', 'Concrete paving slabs 60×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Concrete slabs 60×60');

INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Concrete slabs 90×60', 'Concrete paving slabs 90×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Concrete slabs 90×60');

-- Generic slabs (fallback)
INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Slabs 40×40', 'Paving slabs 40×40 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Slabs 40×40');

INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Slabs 60×60', 'Paving slabs 60×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Slabs 60×60');

INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Slabs 90×60', 'Paving slabs 90×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Slabs 90×60');

-- Monoblocks (paving blocks)
INSERT INTO materials (company_id, name, description, unit, is_deletable)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Monoblocks 20×10', 'Paving blocks (monoblocks) 20×10 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Monoblocks 20×10');
