-- 1. Restore Base Price from Products Table
-- This resets all sales to the current catalog price.
UPDATE public.sales s
SET price = p.sale_price
FROM public.products p
WHERE s.code = p.code
  AND p.sale_price IS NOT NULL
  AND p.sale_price > 0;

-- 2. Handle Free Gifts (Set Price to 0)
UPDATE public.sales
SET price = 0
WHERE free_gift = true;

-- 3. Re-apply Mr. Moon Discount (10%)
-- Condition: Guide is 'Mr. Moon' AND Price > 1000
-- Logic: 10% discount, rounded UP to nearest 100 (Ceiling)
UPDATE public.sales s
SET price = CEIL((s.price * 0.9) / 100) * 100
FROM public.sale_groups sg
JOIN public.guides g ON sg.guide_id = g.id
WHERE s.sale_group_id = sg.id
  AND lower(regexp_replace(g.name, '[\s.]', '', 'g')) = 'mrmoon'
  AND s.price > 1000
  AND (s.free_gift IS NULL OR s.free_gift = false);

-- 4. Re-apply Peter Discount (20%)
-- Condition: Guide is 'Peter' AND Price > 0
-- Logic: 20% discount, rounded UP to nearest 100 (Ceiling)
UPDATE public.sales s
SET price = CEIL((s.price * 0.8) / 100) * 100
FROM public.sale_groups sg
JOIN public.guides g ON sg.guide_id = g.id
WHERE s.sale_group_id = sg.id
  AND lower(regexp_replace(g.name, '[\s.]', '', 'g')) LIKE '%peter%'
  AND s.price > 0
  AND (s.free_gift IS NULL OR s.free_gift = false);

-- 5. Recalculate Sale Group Totals (Subtotal & Total)
UPDATE public.sale_groups sg
SET subtotal = (
  SELECT COALESCE(SUM(s.price * s.qty), 0)
  FROM public.sales s
  WHERE s.sale_group_id = sg.id
    AND s.refunded_at IS NULL
),
total = (
  SELECT COALESCE(SUM(s.price * s.qty), 0)
  FROM public.sales s
  WHERE s.sale_group_id = sg.id
    AND s.refunded_at IS NULL
);

-- 6. Recalculate Guide Commissions
-- (Commission = Total * Guide Rate)
UPDATE public.sale_groups
SET guide_commission = round(total * guide_rate, 2)
WHERE guide_id IS NOT NULL;
