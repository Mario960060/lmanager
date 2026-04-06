-- Canvas ↔ event sync: stable element ids, soft-removed folders, material linkage

ALTER TABLE task_folders
  ADD COLUMN IF NOT EXISTS canvas_element_id UUID,
  ADD COLUMN IF NOT EXISTS removed_from_project_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS progress_locked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE materials_delivered
  ADD COLUMN IF NOT EXISTS canvas_element_id UUID;

COMMENT ON COLUMN task_folders.canvas_element_id IS 'Stable id of layer-2 canvas shape; null for manual/system folders (e.g. Digging and Preparation)';
COMMENT ON COLUMN task_folders.removed_from_project_at IS 'Element removed from canvas or folder deleted with history; folder kept for billing';
COMMENT ON COLUMN task_folders.progress_locked IS 'No further progress entries when true (removed from project)';
COMMENT ON COLUMN materials_delivered.canvas_element_id IS 'Links material row to canvas element when created from calculator';

CREATE UNIQUE INDEX IF NOT EXISTS task_folders_event_canvas_element_active_uid
  ON task_folders (event_id, canvas_element_id)
  WHERE canvas_element_id IS NOT NULL AND removed_from_project_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_materials_delivered_canvas_element
  ON materials_delivered (event_id, canvas_element_id)
  WHERE canvas_element_id IS NOT NULL;
