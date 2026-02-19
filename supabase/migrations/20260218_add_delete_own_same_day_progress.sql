-- Allow users to delete their own task progress entries from the same calendar day.
-- Uses Europe/Warsaw timezone for day boundary calculation.

CREATE POLICY "Users can delete own task progress entries same day"
  ON task_progress_entries FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (created_at::date = (now() AT TIME ZONE 'Europe/Warsaw')::date)
    AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can delete own additional task progress entries same day"
  ON additional_task_progress_entries FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (created_at::date = (now() AT TIME ZONE 'Europe/Warsaw')::date)
    AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
