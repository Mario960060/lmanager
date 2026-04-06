-- Decking joists and bearers (stock lengths in metres). Names must match DeckCalculator / deckMaterialNames.ts.
-- Template for new companies (copied to materials on team creation).
-- Decking board stock lengths: see 20260408120000_decking_board_stock_materials_and_remove_bolts.sql

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Decking joist 3.6 m', 'Structural decking joist, stock length 3.6 m', 'joists', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Decking joist 3.6 m');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Decking joist 5 m', 'Structural decking joist, stock length 5 m', 'joists', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Decking joist 5 m');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Decking bearer 3.6 m', 'Structural decking bearer, stock length 3.6 m', 'bearers', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Decking bearer 3.6 m');

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Decking bearer 5 m', 'Structural decking bearer, stock length 5 m', 'bearers', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Decking bearer 5 m');
