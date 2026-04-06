/*
  Canvas „Utwórz projekt” tworzy task_folders dla każdego elementu + „Digging and Preparation”.
  Poprzednia polityka INSERT zezwalała tylko Team_Leader / project_manager / Admin — zwykły
  członek firmy dostawał cichy błąd RLS i foldery w ogóle nie powstawały (tasks_done z folder_id NULL).
  Ujednolicenie z tasks_done: każdy zalogowany użytkownik z danej firmy może dodawać foldery.
*/

DROP POLICY IF EXISTS "Team_Leader project_manager Admin can insert task folders" ON task_folders;

CREATE POLICY "Company members can insert task folders"
  ON task_folders FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
