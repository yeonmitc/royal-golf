-- 1. Find Peter's ID
-- (Run this first to verify the ID, then replace 'PETER_ID_HERE' below)
SELECT id, name FROM public.guides WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) = 'peter';

-- 2. Shift sale dates for Peter's sales by -1 day
-- This updates the 'sold_at' column in the 'sales' table for all transactions linked to Peter.
UPDATE public.sales s
SET sold_at = s.sold_at - INTERVAL '1 day'
FROM public.sale_groups sg
WHERE s.sale_group_id = sg.id
  AND sg.guide_id IN (
    SELECT id FROM public.guides WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) = 'peter'
  );

-- 3. Also shift the 'sold_at' in 'sale_groups' table if necessary (for consistency)
UPDATE public.sale_groups sg
SET sold_at = sg.sold_at - INTERVAL '1 day'
WHERE sg.guide_id IN (
  SELECT id FROM public.guides WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) = 'peter'
);
