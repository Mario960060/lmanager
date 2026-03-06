-- Add laying tasks for Concrete Slabs calculator
-- 40x40: 0.2 h/m², 60x60: 0.2 h/m², 90x60: 0.17 h/m²
-- Inserts for each existing company

INSERT INTO event_tasks (name, description, unit, estimated_hours, company_id, is_deletable)
SELECT 'laying slabs 40x40 (concrete)', 'for single person', 'square meters', 0.2, c.id, false
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM event_tasks et 
  WHERE et.name = 'laying slabs 40x40 (concrete)' AND et.company_id = c.id
);

INSERT INTO event_tasks (name, description, unit, estimated_hours, company_id, is_deletable)
SELECT 'laying slabs 60x60 (concrete)', 'for single person', 'square meters', 0.2, c.id, false
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM event_tasks et 
  WHERE et.name = 'laying slabs 60x60 (concrete)' AND et.company_id = c.id
);

INSERT INTO event_tasks (name, description, unit, estimated_hours, company_id, is_deletable)
SELECT 'laying slabs 90x60 (concrete)', 'for single person', 'square meters', 0.17, c.id, false
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM event_tasks et 
  WHERE et.name = 'laying slabs 90x60 (concrete)' AND et.company_id = c.id
);
