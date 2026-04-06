-- Horizontal fence slats (materials per length × width). Unit: slats.
-- Template for new companies (copied to materials on team creation).

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Horizontal fence slat 180×10 cm', 'Horizontal fence slat: span along fence 180 cm, face width 10 cm', 'slats', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Horizontal fence slat 180×10 cm');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Horizontal fence slat 180×15 cm', 'Horizontal fence slat: span along fence 180 cm, face width 15 cm', 'slats', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Horizontal fence slat 180×15 cm');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Horizontal fence slat 180×20 cm', 'Horizontal fence slat: span along fence 180 cm, face width 20 cm', 'slats', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Horizontal fence slat 180×20 cm');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Horizontal fence slat 360×10 cm', 'Horizontal fence slat: span along fence 360 cm, face width 10 cm', 'slats', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Horizontal fence slat 360×10 cm');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Horizontal fence slat 360×15 cm', 'Horizontal fence slat: span along fence 360 cm, face width 15 cm', 'slats', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Horizontal fence slat 360×15 cm');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Horizontal fence slat 360×20 cm', 'Horizontal fence slat: span along fence 360 cm, face width 20 cm', 'slats', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Horizontal fence slat 360×20 cm');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Horizontal fence slat 420×10 cm', 'Horizontal fence slat: span along fence 420 cm, face width 10 cm', 'slats', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Horizontal fence slat 420×10 cm');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Horizontal fence slat 420×15 cm', 'Horizontal fence slat: span along fence 420 cm, face width 15 cm', 'slats', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Horizontal fence slat 420×15 cm');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Horizontal fence slat 420×20 cm', 'Horizontal fence slat: span along fence 420 cm, face width 20 cm', 'slats', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Horizontal fence slat 420×20 cm');
