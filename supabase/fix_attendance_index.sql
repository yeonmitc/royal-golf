
-- Drop the potentially incorrect or existing index
DROP INDEX IF EXISTS public.idx_attendance_daily_unique;

-- Recreate index using IMMUTABLE expression
-- We must specify a time zone (UTC) to cast timestamptz to date immutably.
-- Since we store "Local Time as UTC" (e.g. 09:00 PH time is stored as 09:00 UTC),
-- extracting the date at UTC gives us the correct local date.
CREATE UNIQUE INDEX idx_attendance_daily_unique 
ON public.attendance_logs (employee_name, ((attendance_time AT TIME ZONE 'UTC')::date));

-- Ensure RLS is correct
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable insert for all users" ON public.attendance_logs;
CREATE POLICY "Enable insert for all users" ON public.attendance_logs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Enable read for all users" ON public.attendance_logs;
CREATE POLICY "Enable read for all users" ON public.attendance_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable update for all users" ON public.attendance_logs;
CREATE POLICY "Enable update for all users" ON public.attendance_logs FOR UPDATE USING (true);
