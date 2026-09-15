-- Add constraints for offline sync idempotency
-- These prevent duplicate sales from being created during retry syncs.

-- Unique constraint on sales.offline_sale_id (partial: only when not null)
-- Each individual sale line item has its own unique offline_sale_id.
-- This ensures that if an offline sale was already synced, a retry won't create a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_offline_sale_id_unique
  ON public.sales (offline_sale_id)
  WHERE offline_sale_id IS NOT NULL;

-- Regular index on sale_groups.offline_group_id for lookup performance.
-- NOTE: This must NOT be unique — multiple sale rows in the same cart/checkout
-- share the same offline_group_id (one group contains many items).
CREATE INDEX IF NOT EXISTS idx_sale_groups_offline_group_id
  ON public.sale_groups (offline_group_id)
  WHERE offline_group_id IS NOT NULL;
