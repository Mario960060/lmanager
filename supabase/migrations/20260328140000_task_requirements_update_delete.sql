-- RLS: allow company members to update and delete their task_requirements (edit/delete in UI)

DROP POLICY IF EXISTS "Users can update task requirements for their company" ON task_requirements;
CREATE POLICY "Users can update task requirements for their company"
  ON task_requirements FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete task requirements for their company" ON task_requirements;
CREATE POLICY "Users can delete task requirements for their company"
  ON task_requirements FOR DELETE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
