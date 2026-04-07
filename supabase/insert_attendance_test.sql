-- JESHEICA (9AM Shift) -> 09:00 Arrival (Local Time)
-- Store as 2026-02-27 09:00:00+00 (Local time value in UTC)
INSERT INTO public.attendance_logs (employee_name, shift_type, attendance_time, is_tardy, location)
VALUES (
  'JESHEICA', 
  '9AM', 
  '2026-02-27 09:00:00+00', 
  FALSE,
  '{"latitude": 15.19, "longitude": 120.52}'::jsonb
)
ON CONFLICT (employee_name, ((attendance_time AT TIME ZONE 'UTC')::date)) 
DO UPDATE SET attendance_time = EXCLUDED.attendance_time, is_tardy = EXCLUDED.is_tardy;

-- BERLYN (6AM Shift) -> 05:58 Arrival (Local Time)
-- Store as 2026-02-27 05:58:00+00 (Local time value in UTC)
INSERT INTO public.attendance_logs (employee_name, shift_type, attendance_time, is_tardy, location)
VALUES (
  'BERLYN', 
  '6AM', 
  '2026-02-27 05:58:00+00', 
  FALSE,
  '{"latitude": 15.19, "longitude": 120.52}'::jsonb
)
ON CONFLICT (employee_name, ((attendance_time AT TIME ZONE 'UTC')::date)) 
DO UPDATE SET attendance_time = EXCLUDED.attendance_time, is_tardy = EXCLUDED.is_tardy;
