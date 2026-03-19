-- Add list_price to keep the original (list) price separate from the paid price.
-- - sales.price: paid unit price (what the customer actually paid)
-- - sales.list_price: original/list unit price at the time of sale
--
-- Run in Supabase SQL Editor once.

ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS list_price numeric;

-- Backfill list_price for existing rows if missing
UPDATE public.sales s
SET list_price = COALESCE(p.sale_price, s.price)
FROM public.products p
WHERE s.list_price IS NULL
  AND p.code = s.code;

UPDATE public.sales
SET list_price = price
WHERE list_price IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_list_price ON public.sales(list_price);

