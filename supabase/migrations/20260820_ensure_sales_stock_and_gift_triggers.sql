-- 2026-08-20
-- Ensure sales stock triggers and gift sync are correctly attached to sales table.
-- Also fixes: enforce_free_gift_when_price_zero must fire on UPDATE (not only INSERT).

-- ============================================================
-- 1. Re-create (if needed) the helper that syncs price <-> free_gift
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_free_gift_when_price_zero()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- price = 0 이면 무조건 free_gift = true
  if coalesce(new.price, 0) = 0 then
    new.free_gift := true;
  -- price > 0 이고 is_exchanged 가 아니면 free_gift = false
  elsif coalesce(new.is_exchanged, false) = false then
    new.free_gift := false;
  end if;
  return new;
end;
$function$;

-- ============================================================
-- 2. Re-create the stock-apply-on-insert trigger function
--    (gift/free_gift 여부와 무관하게 재고 차감)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_sales_apply_stock_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_available integer;
begin
  -- 이미 적용된 row면 스킵 (멱등성)
  if new.stock_applied_at is not null then
    return new;
  end if;

  -- 환불된 건은 재고 차감 스킵 (프로텍션)
  if new.refunded_at is not null then
    return new;
  end if;

  -- 사이즈별 현재 재고를 읽고 (for update: 경쟁 방지)
  if new.size_std = 'S' then
    select s into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = 'M' then
    select m into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = 'L' then
    select l into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = 'XL' then
    select xl into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = '2XL' then
    select "2xl" into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = '3XL' then
    select "3xl" into v_available from public.inventories where code = new.code for update;
  elsif new.size_std = 'Free' then
    select free into v_available from public.inventories where code = new.code for update;
  else
    raise exception 'Invalid size_std=%', new.size_std;
  end if;

  if v_available is null then
    raise exception 'Inventory row missing for code=%', new.code;
  end if;

  if v_available < new.qty then
    raise exception 'Insufficient stock: code=% size=% requested=% available=%',
      new.code, new.size_std, new.qty, v_available;
  end if;

  -- gift 여부 무관하게 재고 차감 (판매=감소, 음수값 전달)
  perform public.inv_apply_delta(new.code, new.size_std, -new.qty);

  new.stock_applied_at := now();
  return new;
end $function$;

-- ============================================================
-- 3. Re-create the restock-on-refund trigger function
--    (멱등성: transition 발생시 1번만 실행)
--    ✅ is_exchanged 는 단순 표시용 플래그로, 재고 복구와 무관하게 처리
--       (교환 시 기존건은 환불로 이미 restock 처리함, 새 상품은 별도 INSERT로 재고 차감)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_sales_restore_stock_on_refund()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- 오직 환불 transition (refunded_at NULL -> NOT NULL) 일 때만 복구
  if old.refunded_at is null and new.refunded_at is not null then
    -- 판매 시 재고 차감이 적용된 row에 대해서만 복구 (멱등성 + gift/일반판매 모두 복구)
    if old.stock_applied_at is not null then
      perform public.inv_apply_delta(old.code, old.size_std, old.qty);
    end if;
  end if;

  return new;
end $function$;

-- ============================================================
-- 4. Re-create inv_apply_delta in case the column names are wrong
-- ============================================================
CREATE OR REPLACE FUNCTION public.inv_apply_delta(p_code text, p_size size_std, p_qty integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  if p_qty is null or p_qty = 0 then
    return;
  end if;

  if p_size = 'S' then
    update public.inventories set s = coalesce(s,0) + p_qty where code = p_code;
  elsif p_size = 'M' then
    update public.inventories set m = coalesce(m,0) + p_qty where code = p_code;
  elsif p_size = 'L' then
    update public.inventories set l = coalesce(l,0) + p_qty where code = p_code;
  elsif p_size = 'XL' then
    update public.inventories set xl = coalesce(xl,0) + p_qty where code = p_code;
  elsif p_size = '2XL' then
    update public.inventories set "2xl" = coalesce("2xl",0) + p_qty where code = p_code;
  elsif p_size = '3XL' then
    update public.inventories set "3xl" = coalesce("3xl",0) + p_qty where code = p_code;
  elsif p_size = 'Free' then
    update public.inventories set free = coalesce(free,0) + p_qty where code = p_code;
  else
    raise exception 'Unknown size_std: %', p_size;
  end if;

  if not found then
    raise exception 'Inventory row not found for code=%', p_code;
  end if;
end $function$;

-- ============================================================
-- 5. Attach TRIGGERS (idempotent: drop then create)
-- ============================================================

-- 5a) price = 0  <->  free_gift sync (INSERT + UPDATE 모두)
DROP TRIGGER IF EXISTS trg_sales_enforce_free_gift ON sales;
CREATE TRIGGER trg_sales_enforce_free_gift
BEFORE INSERT OR UPDATE OF price, free_gift, is_exchanged ON sales
FOR EACH ROW
EXECUTE FUNCTION public.enforce_free_gift_when_price_zero();

-- 5b) INSERT 시 재고 차감
DROP TRIGGER IF EXISTS trg_sales_apply_stock_on_insert ON sales;
CREATE TRIGGER trg_sales_apply_stock_on_insert
BEFORE INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION public.trg_sales_apply_stock_on_insert();

-- 5c) UPDATE refunded_at 시 재고 복구 (오직 환불만! 교환 is_exchanged는 표시용으로 재고와 무관)
DROP TRIGGER IF EXISTS trg_sales_restore_stock_on_refund ON sales;
CREATE TRIGGER trg_sales_restore_stock_on_refund
BEFORE UPDATE OF refunded_at ON sales
FOR EACH ROW
EXECUTE FUNCTION public.trg_sales_restore_stock_on_refund();

-- 5d) sale_group_id 채우기 (있다면 교체)
DROP TRIGGER IF EXISTS trg_sales_fill_group_id ON sales;
CREATE TRIGGER trg_sales_fill_group_id
BEFORE INSERT ON sales
FOR EACH ROW
WHEN (NEW.sale_group_id IS NULL)
EXECUTE FUNCTION public.trg_sales_fill_group_id();
