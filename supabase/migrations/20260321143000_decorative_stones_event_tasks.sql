-- Decorative stones: main work task (spreading, not "laying" like slabs)
-- event_tasks_with_dynamic_estimates is a view over event_tasks — no separate insert

INSERT INTO event_tasks_template (id, name, description, unit, estimated_hours, created_at, is_deletable)
SELECT gen_random_uuid(), 'spreading decorative stones', 'Spreading decorative aggregate or pebbles to design depth over the prepared area', 'square meters', 0.2, now(), false
WHERE NOT EXISTS (SELECT 1 FROM event_tasks_template WHERE name = 'spreading decorative stones');

INSERT INTO event_tasks (name, description, unit, estimated_hours, company_id, is_deletable)
SELECT 'spreading decorative stones', 'Spreading decorative aggregate or pebbles to design depth over the prepared area', 'square meters', 0.2, 'e0c755f1-dc7e-4804-aa20-77359aaeb479'::uuid, false
WHERE NOT EXISTS (
  SELECT 1 FROM event_tasks et
  WHERE et.name = 'spreading decorative stones' AND et.company_id = 'e0c755f1-dc7e-4804-aa20-77359aaeb479'::uuid
);
