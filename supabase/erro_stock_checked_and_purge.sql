ALTER TABLE public.erro_stock
ADD COLUMN IF NOT EXISTS is_checked boolean NOT NULL DEFAULT false;

ALTER TABLE public.erro_stock
ADD COLUMN IF NOT EXISTS checked_at timestamptz;

CREATE INDEX IF NOT EXISTS erro_stock_is_checked_idx ON public.erro_stock (is_checked);
CREATE INDEX IF NOT EXISTS erro_stock_checked_at_idx ON public.erro_stock (checked_at);

CREATE OR REPLACE FUNCTION public.purge_checked_erro_stock()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.erro_stock
  WHERE is_checked = true
    AND checked_at IS NOT NULL
    AND checked_at < now() - interval '7 days';
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'purge_checked_erro_stock_daily',
  '0 3 * * *',
  $$select public.purge_checked_erro_stock();$$
)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'purge_checked_erro_stock_daily'
);
