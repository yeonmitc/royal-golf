-- Fix erro_stock triggers for enum-typed inventories.check_status
-- Current DB uses stock_check_state enum, so trigger assignments must cast literals.

CREATE OR REPLACE FUNCTION public.handle_erro_stock_upsert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.inventories
  SET check_status = CASE
        WHEN NEW.checked_at IS NULL THEN 'error'::stock_check_state
        ELSE 'unchecked'::stock_check_state
      END,
      check_updated_at = NOW()
  WHERE code = NEW.code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.handle_erro_stock_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.inventories
  SET check_status = 'unchecked'::stock_check_state,
      check_updated_at = NOW()
  WHERE code = OLD.code;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
