-- Add slab materials and monoblocks to materials_template (global template for new companies)
-- Porcelain, Sandstone, Granite (40×40, 60×60, 90×60) + Concrete slabs (40×40, 60×60, 90×60)
-- Names must match exactly what SlabCalculator and ConcreteSlabsCalculator use for fetchMaterialPrices

-- Porcelain slabs
INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Porcelain 40×40', 'Porcelain paving slabs 40×40 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Porcelain 40×40');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Porcelain 60×60', 'Porcelain paving slabs 60×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Porcelain 60×60');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Porcelain 90×60', 'Porcelain paving slabs 90×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Porcelain 90×60');

-- Sandstone slabs
INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Sandstone 40×40', 'Sandstone paving slabs 40×40 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Sandstone 40×40');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Sandstone 60×60', 'Sandstone paving slabs 60×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Sandstone 60×60');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Sandstone 90×60', 'Sandstone paving slabs 90×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Sandstone 90×60');

-- Granite slabs
INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Granite 40×40', 'Granite paving slabs 40×40 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Granite 40×40');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Granite 60×60', 'Granite paving slabs 60×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Granite 60×60');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Granite 90×60', 'Granite paving slabs 90×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Granite 90×60');

-- Concrete slabs
INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Concrete slabs 40×40', 'Concrete paving slabs 40×40 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Concrete slabs 40×40');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Concrete slabs 60×60', 'Concrete paving slabs 60×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Concrete slabs 60×60');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Concrete slabs 90×60', 'Concrete paving slabs 90×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Concrete slabs 90×60');

-- Generic slabs (fallback when type unknown)
INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Slabs 40×40', 'Paving slabs 40×40 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Slabs 40×40');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Slabs 60×60', 'Paving slabs 60×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Slabs 60×60');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Slabs 90×60', 'Paving slabs 90×60 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Slabs 90×60');

-- Monoblocks (paving blocks, default 20×10 cm)
INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Monoblocks 20×10', 'Paving blocks (monoblocks) 20×10 cm, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Monoblocks 20×10');
