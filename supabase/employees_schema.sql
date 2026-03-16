CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  korean_name TEXT NOT NULL,
  english_name TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable select for all users" ON public.employees;
CREATE POLICY "Enable select for all users" ON public.employees FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable insert for all users" ON public.employees;
CREATE POLICY "Enable insert for all users" ON public.employees FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update for all users" ON public.employees;
CREATE POLICY "Enable update for all users" ON public.employees FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable delete for all users" ON public.employees;
CREATE POLICY "Enable delete for all users" ON public.employees FOR DELETE USING (true);
