ALTER TABLE sales
DROP CONSTRAINT IF EXISTS chk_sales_price_nonneg;

ALTER TABLE sales
ADD CONSTRAINT chk_sales_price_nonneg
CHECK (price >= 0 OR is_exchanged = true);
