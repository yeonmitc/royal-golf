-- Fix trg_sales_apply_stock_on_insert to distinguish online sale vs offline sync.
--
-- PROBLEM: The trigger validates current stock on every INSERT. When an offline sale
-- is synced later, other sales may have depleted stock, causing the INSERT to fail
-- with "Insufficient stock". This rejects historical sales that already happened.
--
-- SOLUTION:
--   ONLINE SALE (offline_sale_id IS NULL): keep existing stock validation.
--     If stock is insufficient, the sale is blocked (prevents overselling).
--
--   OFFLINE SYNC (offline_sale_id IS NOT NULL): skip stock validation, still deduct.
--     The sale already happened physically. Inventory may go negative to surface
--     the discrepancy for reconciliation.
--
-- The inventories table uses plain integers with no CHECK constraint preventing
-- negative values, so this is safe at the DB level.

CREATE OR REPLACE FUNCTION public.trg_sales_apply_stock_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
declare
  v_available integer;
begin
  -- Already applied (idempotency guard)
  if new.stock_applied_at is not null then
    return new;
  end if;

  -- Refund rows are handled elsewhere
  if new.refunded_at is not null then
    return new;
  end if;

  -- OFFLINE SYNC: skip stock validation, still deduct inventory.
  -- Offline sales are historical facts — the product was already sold to the customer.
  -- Inventory may go negative; this surfaces the discrepancy for reconciliation.
  if new.offline_sale_id is not null then
    perform public.inv_apply_delta(new.code, new.size_std, -new.qty);
    new.stock_applied_at := now();
    return new;
  end if;

  -- ONLINE SALE: validate current stock before allowing the sale.
  case new.size_std
    when 'S'    then select s    into v_available from public.inventories where code = new.code for update;
    when 'M'    then select m    into v_available from public.inventories where code = new.code for update;
    when 'L'    then select l    into v_available from public.inventories where code = new.code for update;
    when 'XL'   then select xl   into v_available from public.inventories where code = new.code for update;
    when '2XL'  then select "2xl" into v_available from public.inventories where code = new.code for update;
    when '3XL'  then select "3xl" into v_available from public.inventories where code = new.code for update;
    when '4XL'  then select "4xl" into v_available from public.inventories where code = new.code for update;
    when '5XL'  then select "5xl" into v_available from public.inventories where code = new.code for update;
    when '6XL'  then select "6xl" into v_available from public.inventories where code = new.code for update;
    when '7XL'  then select "7xl" into v_available from public.inventories where code = new.code for update;
    when '8XL'  then select "8xl" into v_available from public.inventories where code = new.code for update;
    when 'Free' then select free  into v_available from public.inventories where code = new.code for update;
    else
      raise exception 'Invalid size_std=%', new.size_std;
  end case;

  if v_available is null then
    raise exception 'Inventory row missing for code=%', new.code;
  end if;

  if v_available < new.qty then
    raise exception 'Insufficient stock: code=% size=% requested=% available=%',
      new.code, new.size_std, new.qty, v_available;
  end if;

  perform public.inv_apply_delta(new.code, new.size_std, -new.qty);

  if not exists (select 1 from public.inventories where code = new.code) then
    raise exception 'Inventory row missing after inv_apply_delta for code=%', new.code;
  end if;

  new.stock_applied_at := now();
  return new;
end;
$$;
