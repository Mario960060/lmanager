-- Composite decking **boards** only (same stock lengths as timber decking boards).
-- Same event_tasks as timber deck — no duplicate tasks.
-- Names must match deckMaterialNames.ts compositeDeckingBoardMaterialName().

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Composite decking board 2.4 m', 'Composite decking board, stock length 2.4 m', 'boards', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Composite decking board 2.4 m');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Composite decking board 3.6 m', 'Composite decking board, stock length 3.6 m', 'boards', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Composite decking board 3.6 m');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Composite decking board 4.2 m', 'Composite decking board, stock length 4.2 m', 'boards', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Composite decking board 4.2 m');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Composite decking board 5 m', 'Composite decking board, stock length 5 m', 'boards', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Composite decking board 5 m');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Composite decking board 2.4 m', 'Composite decking board, stock length 2.4 m', 'boards', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Composite decking board 2.4 m');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Composite decking board 3.6 m', 'Composite decking board, stock length 3.6 m', 'boards', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Composite decking board 3.6 m');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Composite decking board 4.2 m', 'Composite decking board, stock length 4.2 m', 'boards', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Composite decking board 4.2 m');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Composite decking board 5 m', 'Composite decking board, stock length 5 m', 'boards', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Composite decking board 5 m');
