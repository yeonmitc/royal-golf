-- Create attendance_logs table
CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name TEXT NOT NULL CHECK (employee_name IN ('JESHEICA', 'BERLYN')),
  attendance_time TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('6AM', '9AM')),
  location JSONB, -- Stores { latitude, longitude, ... }
  is_tardy BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to insert (since it's an internal app without strict user auth for staff)
-- Adjust this if you have specific auth requirements
CREATE POLICY "Enable insert for all users" ON public.attendance_logs FOR INSERT WITH CHECK (true);

-- Create policy to allow reading own logs or admin reading all
CREATE POLICY "Enable read for all users" ON public.attendance_logs FOR SELECT USING (true);

-- Create index to ensure one attendance per employee per day
-- Using UTC+8 (Philippines Time) to determine "Daily" uniqueness
-- 6AM and 9AM shifts must fall on the same day.
-- (attendance_time AT TIME ZONE 'UTC' + interval '8 hours')::date is immutable.
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_daily_unique 
ON public.attendance_logs (employee_name, ((attendance_time AT TIME ZONE 'UTC' + interval '8 hours')::date));
