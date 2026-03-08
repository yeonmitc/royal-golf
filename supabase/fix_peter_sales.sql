-- 1. Find Peter's ID
-- (Run this first to verify the ID, then replace 'PETER_ID_HERE' below)
SELECT id, name FROM public.guides WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) = 'peter';

-- 2. Update sale_groups for Peter to have 0% commission
UPDATE public.sale_groups
SET guide_rate = 0, guide_commission = 0
WHERE guide_id IN (
  SELECT id FROM public.guides WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) = 'peter'
);

-- 3. Update sales prices for Peter (20% discount logic: ceil(price * 0.8 / 100) * 100)
-- CAUTION: This assumes the current price in DB is the FULL PRICE (undiscounted).
-- If some are already discounted, this will double-discount them.
-- Use with care or filter by specific date range if needed.

UPDATE public.sales s
SET price = CEIL((s.price * 0.8) / 100) * 100
FROM public.sale_groups sg
WHERE s.sale_group_id = sg.id
  AND sg.guide_id IN (
    SELECT id FROM public.guides WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) = 'peter'
  )
  AND s.price > 0; -- Only discount non-free items

-- 4. Recalculate group totals (optional but recommended)
-- You can run `finalize_sale_group` for affected groups, or just trust the individual updates if simple.
-- Ideally, re-sum the totals.
UPDATE public.sale_groups sg
SET total = (
  SELECT SUM(s.price * s.qty)
  FROM public.sales s
  WHERE s.sale_group_id = sg.id
)
WHERE sg.guide_id IN (
  SELECT id FROM public.guides WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) = 'peter'
);
