/*
  # Project (event) member assignments

  - event_members: links profiles to events; unique (event_id, user_id)
  - Visibility: users with role user see an event only if it has no assignments OR they are listed.
    Elevated roles (Admin, boss, project_manager, Team_Leader) see all company events.
  - Legacy: zero rows in event_members for an event => all company members still see the event.
*/

CREATE TABLE IF NOT EXISTS public.event_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now(),
  CONSTRAINT event_members_event_user_unique UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_members_event_id ON public.event_members(event_id);
CREATE INDEX IF NOT EXISTS idx_event_members_user_id ON public.event_members(user_id);

ALTER TABLE public.event_members ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.event_members TO authenticated;

-- SELECT: anyone in the company can read assignments for company events
CREATE POLICY "event_members_select_company"
  ON public.event_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_members.event_id
        AND e.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- INSERT
CREATE POLICY "event_members_insert_managers"
  ON public.event_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'boss', 'project_manager', 'Team_Leader')
    )
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_members.event_id
        AND e.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = event_members.user_id
        AND p2.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- UPDATE (e.g. role)
CREATE POLICY "event_members_update_managers"
  ON public.event_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'boss', 'project_manager', 'Team_Leader')
    )
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_members.event_id
        AND e.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'boss', 'project_manager', 'Team_Leader')
    )
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_members.event_id
        AND e.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = event_members.user_id
        AND p2.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- DELETE
CREATE POLICY "event_members_delete_managers"
  ON public.event_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'boss', 'project_manager', 'Team_Leader')
    )
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_members.event_id
        AND e.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Restrict event visibility for role user when assignments exist
DROP POLICY IF EXISTS "Users can view events for their company" ON public.events;

CREATE POLICY "Users can view events for their company"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('Admin', 'boss', 'project_manager', 'Team_Leader')
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.event_members em WHERE em.event_id = id
      )
      OR EXISTS (
        SELECT 1 FROM public.event_members em
        WHERE em.event_id = id AND em.user_id = auth.uid()
      )
    )
  );
