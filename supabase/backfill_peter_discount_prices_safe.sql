-- Safe backfill for Peter 20% discount prices.
-- This updates ONLY rows that still have the full list price stored in sales.price.
-- It avoids double-discounting by comparing against products.sale_price.
--
-- Run in Supabase SQL Editor.

-- 1) Peter guide ids
WITH peter_guides AS (
  SELECT id
  FROM public.guides
  WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) LIKE '%peter%'
),

-- 2) Target sales rows: Peter guide + not refunded + not free gift + price equals list price
targets AS (
  SELECT
    s.id AS sale_id,
    s.sale_group_id,
    s.price AS current_price,
    p.sale_price AS list_price,
    CEIL((p.sale_price * 0.8) / 100) * 100 AS discounted_price
  FROM public.sales s
  JOIN public.sale_groups sg ON sg.id = s.sale_group_id
  JOIN peter_guides pg ON pg.id = sg.guide_id
  JOIN public.products p ON p.code = s.code
  WHERE s.refunded_at IS NULL
    AND (s.free_gift IS FALSE OR s.free_gift IS NULL)
    AND COALESCE(s.price, 0) > 0
    AND COALESCE(p.sale_price, 0) > 0
    AND s.price = p.sale_price
)

UPDATE public.sales s
SET price = t.discounted_price
FROM targets t
WHERE s.id = t.sale_id;

-- 3) Ensure Peter has 0% guide commission
UPDATE public.sale_groups
SET guide_rate = 0, guide_commission = 0
WHERE guide_id IN (SELECT id FROM public.guides WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) LIKE '%peter%');

-- 4) Re-finalize affected groups (recompute totals/ledger)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT s.sale_group_id AS gid
    FROM public.sales s
    JOIN public.sale_groups sg ON sg.id = s.sale_group_id
    WHERE sg.guide_id IN (
      SELECT id FROM public.guides WHERE lower(regexp_replace(name, '[\s.]', '', 'g')) LIKE '%peter%'
    )
  LOOP
    PERFORM public.finalize_sale_group(r.gid);
  END LOOP;
END $$;

