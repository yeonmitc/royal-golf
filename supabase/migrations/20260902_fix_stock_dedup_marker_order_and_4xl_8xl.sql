-- ============================================================================
-- 2026-09-02 패치 1 - 트리거 실행 순서 안전화 + 4XL~8XL 누락 사이즈 추가
-- ============================================================================
-- [문제 1] trg_sales_apply_stock_on_insert 에서 new.stock_applied_at 을 먼저 세팅하고
--          나중에 perform inv_apply_delta() 를 호출함.
--          → 재고차감 perform 실패해도 마커만 남아서 "stock_deducted=true 인데 재고 그대로"
--            버그가 발생할 수 있음. (GA-PC-MB-MX-05 에서 실제 발생 확인)
-- [해결 1] inv_apply_delta() 호출이 성공한 뒤에야 new.stock_applied_at 을 now() 로 세팅.
--          또한 perform 은 리턴값을 체크하지 않으므로, 직접 UPDATE 건수인 FOUND 상태까지 체크.
--
-- [문제 2] size_std ENUM 은 4XL,5XL,6XL,7XL,8XL 을 포함하는데 (이전 마이그레이션에서 확장)
--          trg_sales_apply_stock_on_insert 와 inv_apply_delta 함수 내부 if-elsif 분기에는
--          오직 S,M,L,XL,2XL,3XL,Free 만 처리하고 4XL~8XL 이 누락되어 있음.
--          → 4XL 이상 제품 판매 시 "Invalid size_std" 예외 발생 가능.
-- [해결 2] 두 함수의 if-elsif / case 분기에 4XL~8XL 을 모두 추가.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (A) size_std ENUM 재확장 (혹시나 아직 적용 안된 DB 있을 수 있으니 멱등성 있게)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'size_std') THEN
    CREATE TYPE public.size_std AS ENUM
      ('S','M','L','XL','2XL','3XL','4XL','5XL','6XL','7XL','8XL','Free');
  ELSE
    -- 값이 이미 있으면 아무 일도 안함 (ALTER TYPE ADD VALUE IF NOT EXISTS 는 PG13+)
    BEGIN
      ALTER TYPE public.size_std ADD VALUE '4XL';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE public.size_std ADD VALUE '5XL';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE public.size_std ADD VALUE '6XL';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE public.size_std ADD VALUE '7XL';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE public.size_std ADD VALUE '8XL';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- (B) inv_apply_delta() 리빌드 - 4XL~8XL 분기 추가
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inv_apply_delta(
  p_code text,
  p_size public.size_std,
  p_qty integer
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_dummy integer;
begin
  if p_qty is null or p_qty = 0 then
    return;
  end if;

  case p_size
    when 'S'    then update public.inventories set s    = coalesce(s,0)    + p_qty where code = p_code;
    when 'M'    then update public.inventories set m    = coalesce(m,0)    + p_qty where code = p_code;
    when 'L'    then update public.inventories set l    = coalesce(l,0)    + p_qty where code = p_code;
    when 'XL'   then update public.inventories set xl   = coalesce(xl,0)   + p_qty where code = p_code;
    when '2XL'  then update public.inventories set "2xl"= coalesce("2xl",0)+ p_qty where code = p_code;
    when '3XL'  then update public.inventories set "3xl"= coalesce("3xl",0)+ p_qty where code = p_code;
    when '4XL'  then update public.inventories set "4xl"= coalesce("4xl",0)+ p_qty where code = p_code;
    when '5XL'  then update public.inventories set "5xl"= coalesce("5xl",0)+ p_qty where code = p_code;
    when '6XL'  then update public.inventories set "6xl"= coalesce("6xl",0)+ p_qty where code = p_code;
    when '7XL'  then update public.inventories set "7xl"= coalesce("7xl",0)+ p_qty where code = p_code;
    when '8XL'  then update public.inventories set "8xl"= coalesce("8xl",0)+ p_qty where code = p_code;
    when 'Free' then update public.inventories set free = coalesce(free,0) + p_qty where code = p_code;
    else
      raise exception 'Unknown size_std: %', p_size;
  end case;

  if not found then
    raise exception 'Inventory row not found for code=%', p_code;
  end if;
end;
$function$;


-- ----------------------------------------------------------------------------
-- (C) trg_sales_apply_stock_on_insert() 리빌드
--     - 순서 안전화: 재고 차감이 100% 성공한 뒤에야 stock_applied_at 찍기
--     - 4XL~8XL 분기 추가
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sales_apply_stock_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_available integer;
begin
  if new.stock_applied_at is not null then
    return new;
  end if;

  if new.refunded_at is not null then
    return new;
  end if;

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

  -- ✅ 순서 변경: 먼저 재고 차감 수행. (성공하지 않으면 아래 라인은 도달하지 않음)
  perform public.inv_apply_delta(new.code, new.size_std, -new.qty);

  -- (추가 안전장치) perform 은 리턴값을 주지 않으므로, 직접 UPDATE 결과 FOUND 체크를
  -- 위해 동일 조건으로 다시 한번 row 존재를 확인하여 실패시 즉시 예외 발생
  if not exists (select 1 from public.inventories where code = new.code) then
    raise exception 'Inventory row missing after inv_apply_delta for code=%', new.code;
  end if;

  -- ✅ 이제서야 마커를 찍음 → 재고 차감이 확실히 성공한 sale row 에만 마킹
  new.stock_applied_at := now();
  return new;
end;
$function$;


-- ----------------------------------------------------------------------------
-- (D) trg_inv_set_total_qty() 리빌드 - 4XL~8XL 누락 합산 항목 추가
--     (set_inventory_total_qty 함수가 total_qty = s+m+l+xl+"2xl"+"3xl"+free 만
--      합산하고 4~8xl 을 제외했던 문제 함께 해결)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_inventory_total_qty()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.total_qty :=
    coalesce(new.s,0)       + coalesce(new.m,0)       + coalesce(new.l,0) +
    coalesce(new.xl,0)      + coalesce(new."2xl",0)   + coalesce(new."3xl",0) +
    coalesce(new."4xl",0)   + coalesce(new."5xl",0)   + coalesce(new."6xl",0) +
    coalesce(new."7xl",0)   + coalesce(new."8xl",0)   + coalesce(new.free,0);
  return new;
end;
$function$;


-- ----------------------------------------------------------------------------
-- (E) 트리거 재부착 (DROP + CREATE)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_inv_set_total_qty ON public.inventories;
CREATE TRIGGER trg_inv_set_total_qty
  BEFORE INSERT OR UPDATE OF
    s, m, l, xl, "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", free
  ON public.inventories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_inventory_total_qty();

-- 1-6b 판매 INSERT 재고차감 트리거. 함수는 위에서 교체했으니 리바운드만.
-- (CREATE OR REPLACE FUNCTION 하면 기존 트리거가 자동으로 새 함수 바인딩되므로
--  명시적으로 재부착 안해도 되지만, 혹시나 하는 차원에서 한번 더 클린업)
DROP TRIGGER IF EXISTS trg_sales_apply_stock_on_insert ON public.sales;
CREATE TRIGGER trg_sales_apply_stock_on_insert
  BEFORE INSERT ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sales_apply_stock_on_insert();


-- ============================================================================
-- (F) 전체 inventories 테이블 total_qty 백필 (4~8xl 합산 반영된 값으로 재계산)
-- ============================================================================
UPDATE public.inventories
SET total_qty =
    coalesce(s,0)       + coalesce(m,0)       + coalesce(l,0) +
    coalesce(xl,0)      + coalesce("2xl",0)   + coalesce("3xl",0) +
    coalesce("4xl",0)   + coalesce("5xl",0)   + coalesce("6xl",0) +
    coalesce("7xl",0)   + coalesce("8xl",0)   + coalesce(free,0)
WHERE true;


-- ============================================================================
-- (G) products.qty 도 함께 재동기화
-- ============================================================================
UPDATE public.products p
   SET qty = inv.total_qty
  FROM public.inventories inv
 WHERE p.code = inv.code
   AND (p.qty IS DISTINCT FROM inv.total_qty);
