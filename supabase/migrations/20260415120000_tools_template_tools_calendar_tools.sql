/*
  tools_template — global catalog (bilingual)
  tools — per-company rows (template_id links to template)
  calendar_tools — day requirements per event (no notes; quantity only)
*/

-- Template catalog
CREATE TABLE IF NOT EXISTS public.tools_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_pl text NOT NULL,
  unit text NOT NULL DEFAULT 'pieces',
  description_en text,
  description_pl text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tools_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tools_template"
  ON public.tools_template FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.tools_template TO authenticated;

-- Company tools
CREATE TABLE IF NOT EXISTS public.tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.tools_template(id) ON DELETE SET NULL,
  name_en text NOT NULL,
  name_pl text NOT NULL,
  unit text NOT NULL DEFAULT 'pieces',
  is_deletable boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tools_company_template_unique
  ON public.tools (company_id, template_id)
  WHERE template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tools_company_id ON public.tools(company_id);

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tools for their company"
  ON public.tools FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert tools for their company"
  ON public.tools FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update tools for their company"
  ON public.tools FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can delete tools for their company"
  ON public.tools FOR DELETE TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

GRANT ALL ON public.tools TO authenticated;

-- Calendar day tool requirements
CREATE TABLE IF NOT EXISTS public.calendar_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  tool_id uuid NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  date date NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_tools_date_event_company
  ON public.calendar_tools(date, event_id, company_id);

ALTER TABLE public.calendar_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_tools_select_authenticated"
  ON public.calendar_tools FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "calendar_tools_insert_authenticated"
  ON public.calendar_tools FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "calendar_tools_update_authenticated"
  ON public.calendar_tools FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'project_manager', 'Team_Leader', 'boss')
    )
  );

CREATE POLICY "calendar_tools_delete_authenticated"
  ON public.calendar_tools FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'project_manager', 'Team_Leader', 'boss')
    )
  );

DROP TRIGGER IF EXISTS set_updated_at ON public.calendar_tools;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.calendar_tools
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON public.calendar_tools TO authenticated;

-- Seed template (English / Polish); idempotent by name_en
INSERT INTO public.tools_template (name_en, name_pl, unit, sort_order)
SELECT v.name_en, v.name_pl, v.unit, v.sort_order
FROM (
  VALUES
  ('Rubber mallet', 'Młotek gumowy', 'pieces', 10),
  ('Steel hammer', 'Młotek stalowy', 'pieces', 20),
  ('Club hammer / lump hammer', 'Młotek brukarski', 'pieces', 30),
  ('Sledgehammer', 'Młot burak', 'pieces', 40),
  ('Cold chisel', 'Przecinak', 'pieces', 50),
  ('Bolster chisel', 'Przecinak szeroki (bolster)', 'pieces', 60),
  ('Brick jointer', 'Kielnia fugowa', 'pieces', 70),
  ('Pointing trowel', 'Kielnia szpiczasta', 'pieces', 80),
  ('Finishing trowel', 'Kielnia płaska (zacieraczka)', 'pieces', 90),
  ('Notched trowel', 'Kielnia zębata', 'pieces', 100),
  ('Margin trowel', 'Kielnia wąska', 'pieces', 110),
  ('Brick trowel', 'Kielnia murarska', 'pieces', 120),
  ('Plastering hawk', 'Packa (deska do tynków)', 'pieces', 130),
  ('Hand tamper', 'Ubijak ręczny', 'pieces', 140),
  ('Paving maul', 'Ubijak do kostki', 'pieces', 150),
  ('Pickaxe / mattock', 'Kilof', 'pieces', 160),
  ('Axe', 'Siekiera', 'pieces', 170),
  ('Hatchet', 'Toporek', 'pieces', 180),
  ('Shovel (round point)', 'Łopata szpiczasta', 'pieces', 190),
  ('Shovel (square)', 'Łopata prosta', 'pieces', 200),
  ('Drainage shovel', 'Łopata rynsztokowa', 'pieces', 210),
  ('Post hole digger', 'Szpadel do słupów', 'pieces', 220),
  ('Spade', 'Szpadel', 'pieces', 230),
  ('Garden fork', 'Widły ogrodnicze', 'pieces', 240),
  ('Pitchfork', 'Widły (siano)', 'pieces', 250),
  ('Rake (leaf rake)', 'Grabie (do liści)', 'pieces', 260),
  ('Bow rake / landscape rake', 'Grabie metalowe (grunt)', 'pieces', 270),
  ('Hand rake', 'Grabki ręczne', 'pieces', 280),
  ('Hoe (draw hoe)', 'Motyka', 'pieces', 290),
  ('Edging iron / edging spade', 'Obkładak / siekierka do krawędzi', 'pieces', 300),
  ('Wheelbarrow', 'Taczka', 'pieces', 310),
  ('Spirit level (600 mm)', 'Poziomica 60 cm', 'pieces', 320),
  ('Spirit level (1200 mm)', 'Poziomica 120 cm', 'pieces', 330),
  ('Line level', 'Poziomica na sznurek', 'pieces', 340),
  ('Mason line / brick line', 'Sznurek murarski', 'pieces', 350),
  ('Line pins / pins', 'Szpilki do sznurka', 'pieces', 360),
  ('Measuring tape (5 m)', 'Miarka zwijana 5 m', 'pieces', 370),
  ('Measuring tape (8 m)', 'Miarka zwijana 8 m', 'pieces', 380),
  ('Laser measure', 'Dalmierz laserowy', 'pieces', 390),
  ('Carpenter square', 'Kątownik stolarski', 'pieces', 400),
  ('Combination square', 'Kątownik uniwersalny', 'pieces', 410),
  ('Chalk line', 'Sznurek traserski (kredowy)', 'pieces', 420),
  ('Utility knife', 'Nóż z łamanym ostrzem', 'pieces', 430),
  ('Handsaw (wood)', 'Piła ręczna do drewna', 'pieces', 440),
  ('Hacksaw', 'Piła do metalu', 'pieces', 450),
  ('Pruning shears', 'Sekator', 'pieces', 460),
  ('Loppers', 'Sekator dwuręczny', 'pieces', 470),
  ('Wire brush', 'Szczotka druciana', 'pieces', 480),
  ('Broom (hard)', 'Miotła sztywna', 'pieces', 490),
  ('Push broom', 'Zmiotka szeroka', 'pieces', 500),
  ('Bucket (20 L)', 'Wiadro 20 l', 'pieces', 510),
  ('Watering can', 'Konewka', 'pieces', 520),
  ('Pressure sprayer', 'Opryskiwacz ciśnieniowy', 'pieces', 530),
  ('Stiff hand brush', 'Szczotka ręczna (sztywna)', 'pieces', 540),
  ('Rubber float (grouting)', 'Paca gumowa (fuga)', 'pieces', 550),
  ('Sponge float', 'Paca gąbkowa', 'pieces', 560),
  ('Grout sponge', 'Gąbka do fug', 'pieces', 570),
  ('Jointing iron', 'Fugówka metalowa', 'pieces', 580),
  ('Pin punch', 'Przebijak', 'pieces', 590),
  ('Crowbar / pry bar', 'Łom', 'pieces', 600),
  ('Screwdriver set', 'Zestaw śrubokrętów', 'pieces', 610),
  ('Socket set', 'Klucze nasadowe', 'pieces', 620),
  ('Adjustable wrench', 'Klucz nastawny', 'pieces', 630),
  ('Pliers (combination)', 'Kombinerki', 'pieces', 640),
  ('Tin snips', 'Nożyce do blachy', 'pieces', 650),
  ('Bolt cutters', 'Nożyce do prętów', 'pieces', 660),
  ('Safety glasses', 'Okulary ochronne', 'pieces', 670),
  ('Work gloves', 'Rękawice robocze', 'pieces', 680),
  ('Knee pads', 'Nakolanniki', 'pieces', 690),
  ('Ear protection', 'Ochronniki słuchu', 'pieces', 700),
  ('Dust mask (FFP2)', 'Maska przeciwpyłowa FFP2', 'pieces', 710)
) AS v(name_en, name_pl, unit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.tools_template t WHERE t.name_en = v.name_en);

-- Backfill tools for all existing companies
INSERT INTO public.tools (company_id, template_id, name_en, name_pl, unit, is_deletable)
SELECT c.id, tt.id, tt.name_en, tt.name_pl, tt.unit, true
FROM public.companies c
CROSS JOIN public.tools_template tt
WHERE NOT EXISTS (
  SELECT 1 FROM public.tools x
  WHERE x.company_id = c.id AND x.template_id = tt.id
);
