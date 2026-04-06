/*
  # Fix RLS infinite recursion between events and event_members (HTTP 500 on /rest/v1/events)

  event_members policies referenced public.events while events SELECT referenced event_members.
  PostgreSQL evaluates nested RLS and can error.

  Fix: denormalize company_id on event_members and rewrite policies to use only company_id + profiles.
  A SECURITY DEFINER trigger sets company_id from events on insert/update of event_id (bypasses RLS safely).
*/

-- 1) Column + backfill
ALTER TABLE public.event_members
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.event_members em
SET company_id = e.company_id
FROM public.events e
WHERE e.id = em.event_id
  AND em.company_id IS NULL
  AND e.company_id IS NOT NULL;

-- Rows that could not be tied to an event company (bad data) are removed
DELETE FROM public.event_members WHERE company_id IS NULL;

ALTER TABLE public.event_members
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_members_company_id ON public.event_members(company_id);

-- 2) Trigger: fill company_id without going through events RLS in policy checks
CREATE OR REPLACE FUNCTION public.event_members_set_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT e.company_id INTO NEW.company_id
  FROM public.events e
  WHERE e.id = NEW.event_id;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'event not found for event_members';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_members_set_company_id ON public.event_members;
CREATE TRIGGER trg_event_members_set_company_id
  BEFORE INSERT OR UPDATE OF event_id ON public.event_members
  FOR EACH ROW
  EXECUTE FUNCTION public.event_members_set_company_id();

-- 3) Replace event_members policies (no subqueries to public.events)
DROP POLICY IF EXISTS "event_members_select_company" ON public.event_members;
DROP POLICY IF EXISTS "event_members_insert_managers" ON public.event_members;
DROP POLICY IF EXISTS "event_members_update_managers" ON public.event_members;
DROP POLICY IF EXISTS "event_members_delete_managers" ON public.event_members;

CREATE POLICY "event_members_select_company"
  ON public.event_members FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "event_members_insert_managers"
  ON public.event_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'boss', 'project_manager', 'Team_Leader')
    )
    AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = event_members.user_id
        AND p2.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "event_members_update_managers"
  ON public.event_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'boss', 'project_manager', 'Team_Leader')
    )
    AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'boss', 'project_manager', 'Team_Leader')
    )
    AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = event_members.user_id
        AND p2.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "event_members_delete_managers"
  ON public.event_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'boss', 'project_manager', 'Team_Leader')
    )
    AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );
