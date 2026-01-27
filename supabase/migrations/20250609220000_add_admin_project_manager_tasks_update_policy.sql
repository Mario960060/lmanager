-- Add RLS policy to allow admins and project managers to update tasks_done records
-- This follows the same pattern as the existing delete policy

create policy "Allow admins and project managers to update tasks"
on "public"."tasks_done"
as permissive
for update
to authenticated
using (
  (EXISTS ( SELECT 1
   FROM profiles
   WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'project_manager'::text])))))
);
