-- Allow deleting rows from public.products even if there is sales history.
-- This keeps sales rows (history) but removes the FK constraint that blocks deletion.
--
-- Current error:
--   violates foreign key constraint "sales_code_fkey" on table "sales"
--
-- Run this in Supabase SQL Editor once.

ALTER TABLE public.sales
DROP CONSTRAINT IF EXISTS sales_code_fkey;

