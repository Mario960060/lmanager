-- Add laying tasks for Concrete Slabs calculator to event_tasks_template
-- Format: id, name, description, unit, estimated_hours, created_at, is_deletable
-- 40x40: 0.2 h/m², 60x60: 0.2 h/m², 90x60: 0.17 h/m²

INSERT INTO event_tasks_template (id, name, description, unit, estimated_hours, created_at, is_deletable)
SELECT gen_random_uuid(), 'laying slabs 40x40 (concrete)', 'for single person', 'square meters', 0.2, now(), false
WHERE NOT EXISTS (SELECT 1 FROM event_tasks_template WHERE name = 'laying slabs 40x40 (concrete)');

INSERT INTO event_tasks_template (id, name, description, unit, estimated_hours, created_at, is_deletable)
SELECT gen_random_uuid(), 'laying slabs 60x60 (concrete)', 'for single person', 'square meters', 0.2, now(), false
WHERE NOT EXISTS (SELECT 1 FROM event_tasks_template WHERE name = 'laying slabs 60x60 (concrete)');

INSERT INTO event_tasks_template (id, name, description, unit, estimated_hours, created_at, is_deletable)
SELECT gen_random_uuid(), 'laying slabs 90x60 (concrete)', 'for single person', 'square meters', 0.17, now(), false
WHERE NOT EXISTS (SELECT 1 FROM event_tasks_template WHERE name = 'laying slabs 90x60 (concrete)');
