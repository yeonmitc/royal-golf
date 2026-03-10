-- Rename 'Yollow' to 'Yellow' in code_parts table
UPDATE public.code_parts
SET label = 'Yellow'
WHERE label = 'Yollow' AND group_key = 'color';

-- Verify the change
SELECT * FROM public.code_parts WHERE label = 'Yellow' AND group_key = 'color';
