-- Backfill Peter paid price using list_price without double-discounting.
-- Requires sales.list_price column (run add_sales_list_price.sql first).
--
-- Logic:
-- - Keep list_price as the original price at time of sale.
-- - Set price to discounted price ONLY if price == list_price (i.e., not discounted yet).
-- - Do not touch refunded items or free gifts.
--
-- Run in Supabase SQL Editor.

WITH peter_guides AS (
  SELECT id
  FROM public.guides
  WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) LIKE '%peter%'
),
targets AS (
  SELECT
    s.id AS sale_id,
    s.sale_group_id,
    s.list_price AS list_price,
    s.price AS current_price,
    CEIL((s.list_price * 0.8) / 100) * 100 AS discounted_price
  FROM public.sales s
  JOIN public.sale_groups sg ON sg.id = s.sale_group_id
  JOIN peter_guides pg ON pg.id = sg.guide_id
  WHERE s.refunded_at IS NULL
    AND (s.free_gift IS FALSE OR s.free_gift IS NULL)
    AND COALESCE(s.list_price, 0) > 0
    AND COALESCE(s.price, 0) > 0
    AND s.price = s.list_price
)
UPDATE public.sales s
SET price = t.discounted_price
FROM targets t
WHERE s.id = t.sale_id;

-- Ensure Peter has 0% guide commission (optional safety)
WITH peter_guides AS (
  SELECT id
  FROM public.guides
  WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) LIKE '%peter%'
)
UPDATE public.sale_groups
SET guide_rate = 0, guide_commission = 0
WHERE guide_id IN (SELECT id FROM peter_guides);

-- Recalculate totals for affected groups
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT s.sale_group_id AS gid
    FROM public.sales s
    JOIN public.sale_groups sg ON sg.id = s.sale_group_id
    WHERE sg.guide_id IN (SELECT id FROM public.guides WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) LIKE '%peter%')
  LOOP
    PERFORM public.finalize_sale_group(r.gid);
  END LOOP;
END $$;
