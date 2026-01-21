-- Trigger function to update inventories.check_status when erro_stock changes

-- 1. Function to handle insert/update on erro_stock
CREATE OR REPLACE FUNCTION handle_erro_stock_upsert()
RETURNS TRIGGER AS $$
BEGIN
  -- When a record is inserted or updated in erro_stock, set the corresponding inventory status to 'error'
  UPDATE inventories
  SET check_status = 'error',
      check_updated_at = NOW()
  WHERE code = NEW.code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Function to handle delete on erro_stock
CREATE OR REPLACE FUNCTION handle_erro_stock_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- When a record is deleted from erro_stock, reset the corresponding inventory status to 'unchecked'
  -- (Assuming deletion means the error is resolved or removed)
  UPDATE inventories
  SET check_status = 'unchecked',
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
