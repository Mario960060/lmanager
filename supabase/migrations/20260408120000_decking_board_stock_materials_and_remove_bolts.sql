-- Decking boards by stock length (2.4 / 3.6 / 4.2 / 5 m). Names must match deckMaterialNames.ts.
-- Removes mistaken "Decking bolt" rows from template + materials (those lengths were for boards).

-- Template
INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Decking board 2.4 m', 'Decking board, stock length 2.4 m', 'boards', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Decking board 2.4 m');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Decking board 3.6 m', 'Decking board, stock length 3.6 m', 'boards', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Decking board 3.6 m');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Decking board 4.2 m', 'Decking board, stock length 4.2 m', 'boards', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Decking board 4.2 m');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Decking board 5 m', 'Decking board, stock length 5 m', 'boards', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Decking board 5 m');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Decking board 2.4 m', 'Decking board, stock length 2.4 m', 'boards', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Decking board 2.4 m');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Decking board 3.6 m', 'Decking board, stock length 3.6 m', 'boards', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Decking board 3.6 m');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Decking board 4.2 m', 'Decking board, stock length 4.2 m', 'boards', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Decking board 4.2 m');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Decking board 5 m', 'Decking board, stock length 5 m', 'boards', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Decking board 5 m');

DELETE FROM materials WHERE name IN (
  'Decking bolt 2.4 m',
  'Decking bolt 3.6 m',
  'Decking bolt 4.2 m',
  'Decking bolt 5 m'
);

DELETE FROM materials_template WHERE name IN (
  'Decking bolt 2.4 m',
  'Decking bolt 3.6 m',
  'Decking bolt 4.2 m',
  'Decking bolt 5 m'
);
