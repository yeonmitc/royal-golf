-- Allow updating and deleting attendance logs (required for Admin Edit UI).
-- Run once in Supabase SQL Editor.

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable update for all users" ON public.attendance_logs;
CREATE POLICY "Enable update for all users"
ON public.attendance_logs
FOR UPDATE
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Enable delete for all users" ON public.attendance_logs;
CREATE POLICY "Enable delete for all users"
ON public.attendance_logs
FOR DELETE
USING (true);

