CREATE TABLE IF NOT EXISTS public.checklist_daily (
  check_date DATE PRIMARY KEY,
  total_count INTEGER NOT NULL,
  employees JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.checklist_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable select for all users" ON public.checklist_daily;
CREATE POLICY "Enable select for all users" ON public.checklist_daily FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable insert for all users" ON public.checklist_daily;
CREATE POLICY "Enable insert for all users" ON public.checklist_daily FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update for all users" ON public.checklist_daily;
CREATE POLICY "Enable update for all users" ON public.checklist_daily FOR UPDATE USING (true) WITH CHECK (true);

