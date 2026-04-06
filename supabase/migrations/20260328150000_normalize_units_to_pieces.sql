/*
  Legacy stored unit value was 'units' (see 20250205111959_super_wave.sql).
  Normalize to 'pieces' so DB exports and API payloads match app wording.
*/

UPDATE additional_materials SET unit = 'pieces' WHERE unit = 'units';
UPDATE additional_task_materials SET unit = 'pieces' WHERE unit = 'units';
UPDATE additional_tasks SET unit = 'pieces' WHERE unit = 'units';
UPDATE event_tasks SET unit = 'pieces' WHERE unit = 'units';
UPDATE event_tasks_template SET unit = 'pieces' WHERE unit = 'units';
UPDATE materials SET unit = 'pieces' WHERE unit = 'units';
UPDATE materials_template SET unit = 'pieces' WHERE unit = 'units';
UPDATE materials_delivered SET unit = 'pieces' WHERE unit = 'units';
UPDATE tasks_done SET unit = 'pieces' WHERE unit = 'units';

ALTER TABLE additional_materials
  ALTER COLUMN unit SET DEFAULT 'pieces';
