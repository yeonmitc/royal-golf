-- Trigger function to sync inventories.check_status from erro_stock.checked_at
-- - checked_at IS NULL     => unresolved error => inventories.check_status = 'error'
-- - checked_at IS NOT NULL => resolved         => inventories.check_status = 'unchecked'

-- 1. Function to handle insert/update on erro_stock
CREATE OR REPLACE FUNCTION handle_erro_stock_upsert()
RETURNS TRIGGER AS $$
BEGIN
  -- checked_at is the single source of truth for resolved/unresolved state.
  UPDATE inventories
  SET check_status = CASE
        WHEN NEW.checked_at IS NULL THEN 'error'::stock_check_state
        ELSE 'unchecked'::stock_check_state
      END,
      check_updated_at = NOW()
  WHERE code = NEW.code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Function to handle delete on erro_stock
CREATE OR REPLACE FUNCTION handle_erro_stock_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Purged/deleted rows should leave inventory in unchecked state.
  UPDATE inventories
  SET check_status = 'unchecked'::stock_check_state,
      check_updated_at = NOW()
  WHERE code = OLD.code;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 3. Create Triggers
DROP TRIGGER IF EXISTS on_erro_stock_upsert ON erro_stock;
CREATE TRIGGER on_erro_stock_upsert
AFTER INSERT OR UPDATE ON erro_stock
FOR EACH ROW
EXECUTE FUNCTION handle_erro_stock_upsert();

DROP TRIGGER IF EXISTS on_erro_stock_delete ON erro_stock;
CREATE TRIGGER on_erro_stock_delete
AFTER DELETE ON erro_stock
FOR EACH ROW
EXECUTE FUNCTION handle_erro_stock_delete();
