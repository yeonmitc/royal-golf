-- Allow any employee name (free text) instead of a fixed allowlist.
-- Run once in Supabase SQL Editor.

ALTER TABLE public.attendance_logs
DROP CONSTRAINT IF EXISTS attendance_logs_employee_name_check;

