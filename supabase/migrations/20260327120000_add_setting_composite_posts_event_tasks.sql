-- Composite fence calculator: task name must match CompositeFenceCalculator (ilike %setting composite posts%)
-- Template (no company_id) + per-company rows in event_tasks

INSERT INTO event_tasks_template (id, name, description, unit, estimated_hours, created_at, is_deletable)
SELECT gen_random_uuid(), 'setting composite posts', 'setting on concrete or driving in posts (composite fence)', 'posts', 0.25, now(), false
WHERE NOT EXISTS (SELECT 1 FROM event_tasks_template WHERE name = 'setting composite posts');

INSERT INTO event_tasks (name, description, unit, estimated_hours, company_id, is_deletable)
SELECT 'setting composite posts', 'setting on concrete or driving in posts (composite fence)', 'posts', 0.25, c.id, false
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM event_tasks et
  WHERE et.name = 'setting composite posts' AND et.company_id = c.id
);
