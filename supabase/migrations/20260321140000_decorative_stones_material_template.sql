-- Decorative stones material template + optional calculator material_usage note
-- Companies: link "Decorative stones" in Setup > Material usage for calculator_id decorative_stones

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Decorative stones', 'Decorative aggregate / gravel for beds and paths, typically sold by tonne', 'tonnes', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Decorative stones');
