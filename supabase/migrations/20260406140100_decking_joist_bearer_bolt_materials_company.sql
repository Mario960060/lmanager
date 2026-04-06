-- Decking joists, bearers, bolts in materials for existing company (same pattern as horizontal fence slats).
-- Run after 20260406140000_decking_joist_bearer_bolt_materials_template.sql

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Decking joist 3.6 m', 'Structural decking joist, stock length 3.6 m', 'joists', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Decking joist 3.6 m');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Decking joist 5 m', 'Structural decking joist, stock length 5 m', 'joists', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Decking joist 5 m');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Decking bearer 3.6 m', 'Structural decking bearer, stock length 3.6 m', 'bearers', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Decking bearer 3.6 m');

INSERT INTO materials (company_id, name, description, unit, is_deletable, price)
SELECT 'e0c755f1-dc7e-4804-aa20-77359aaeb479', 'Decking bearer 5 m', 'Structural decking bearer, stock length 5 m', 'bearers', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479' AND name = 'Decking bearer 5 m');
