-- Add Artificial Grass to materials_template (global template for new companies)
-- Companies can copy this material from template or add manually in Setup > Materials

INSERT INTO materials_template (id, name, description, unit, is_deletable)
SELECT gen_random_uuid(), 'Artificial Grass', 'Synthetic grass for lawn installation, sold by square meter', 'm²', false
WHERE NOT EXISTS (SELECT 1 FROM materials_template WHERE name = 'Artificial Grass');

-- ============================================
-- Optional: Add Artificial Grass to materials (per company)
-- Run for each company that needs it. Replace <company_uuid> with actual company id.
-- ============================================
-- INSERT INTO materials (company_id, name, description, unit, is_deletable)
-- SELECT '<company_uuid>', 'Artificial Grass', 'Synthetic grass for lawn installation', 'm²', false
-- WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = '<company_uuid>' AND name = 'Artificial Grass');
