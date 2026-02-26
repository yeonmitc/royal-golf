-- Update attendance_logs table constraint to allow both Uppercase and Title Case names
-- This fixes the error: violates check constraint "attendance_logs_employee_name_check"

-- First, drop the existing constraint
ALTER TABLE public.attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_employee_name_check;

-- Then, add the new constraint allowing uppercase and mixed case variations
ALTER TABLE public.attendance_logs 
ADD CONSTRAINT attendance_logs_employee_name_check 
CHECK (employee_name IN ('JESHEICA', 'BERLYN', 'Jesheica', 'Berlyn', 'Berlin'));

-- Comment: Constraint updated to support uppercase names sent from the frontend.
