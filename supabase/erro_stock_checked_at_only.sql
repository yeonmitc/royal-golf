-- Use `checked_at` as the single source of truth for erro_stock resolution state.
-- - unresolved row: checked_at IS NULL
-- - resolved row:   checked_at IS NOT NULL
-- - purge target:   checked_at < now() - interval '7 days'
--
-- IMPORTANT:
-- The current app code still references `is_checked`.
-- Run this SQL together with the app code update that switches logic to `checked_at`.

BEGIN;

-- 1) Make sure checked_at exists
ALTER TABLE public.erro_stock
ADD COLUMN IF NOT EXISTS checked_at timestamptz;

-- 2) Backfill old resolved rows
UPDATE public.erro_stock
SET checked_at = COALESCE(checked_at, updated_at, created_at, now())
WHERE COALESCE(is_checked, false) = true
  AND checked_at IS NULL;

-- 3) Helpful indexes
CREATE INDEX IF NOT EXISTS erro_stock_checked_at_idx
ON public.erro_stock (checked_at);

CREATE INDEX IF NOT EXISTS erro_stock_unresolved_code_idx
ON public.erro_stock (code)
WHERE checked_at IS NULL;

-- 4) Purge function: delete resolved rows after 7 days
CREATE OR REPLACE FUNCTION public.purge_resolved_erro_stock()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.erro_stock
  WHERE checked_at IS NOT NULL
    AND checked_at < now() - interval '7 days';
END;
$$;

-- 5) Schedule daily purge at 3 AM
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'purge_resolved_erro_stock_daily',
  '0 3 * * *',
  $$select public.purge_resolved_erro_stock();$$
)
WHERE NOT EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'purge_resolved_erro_stock_daily'
);

-- 6) Drop old boolean-based artifacts
DROP INDEX IF EXISTS public.erro_stock_is_checked_idx;
ALTER TABLE public.erro_stock
DROP COLUMN IF EXISTS is_checked;

COMMIT;
