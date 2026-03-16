-- Summary-only daily checklist logs
CREATE TABLE IF NOT EXISTS public.checklist_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_date DATE NOT NULL,
  employee_names TEXT NOT NULL, -- e.g., "Berlyn" or "Berlyn, Ella"
  total_count INTEGER NOT NULL,
  checked_count INTEGER NOT NULL
);

-- One record per (date + employee_names)
CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_logs_unique
ON public.checklist_logs (check_date, employee_names);

ALTER TABLE public.checklist_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable select for all users" ON public.checklist_logs;
CREATE POLICY "Enable select for all users" ON public.checklist_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable upsert for all users" ON public.checklist_logs;
CREATE POLICY "Enable upsert for all users" ON public.checklist_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.checklist_logs FOR UPDATE USING (true) WITH CHECK (true);
