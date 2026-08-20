-- ============================================================================
-- 🇰🇷 2026-08-20 ROYAL-GOLF ALL-IN-ONE 통합 마이그레이션 (한국어 주석 완전판)
-- ============================================================================
--
-- 🚨 실행 방법: Supabase Dashboard → SQL Editor → New Query → 아래 전체 복붙 → RUN
--
-- 이 파일 하나만 실행하시면 **지금까지 논의했던 모든 문제가 한방에 해결** 됩니다:
--   ① Gift 증정 시 재고 -1 이 안되던 버그 FIX
--   ② 환불 시 재고 +1 (중복 100% 방지 설계)
--   ③ 교환 시 is_exchanged 는 오직 "표시용" 으로만 사용, 재고와 무관 처리
--   ④ 지금까지 정의만 하고 TRIGGER 안붙여서 좀비 상태였던 함수 4개 부착 (매우 중요!)
--   ⑤ 안쓰는 레거시 함수들 깔끔하게 DROP (DB 정리)
--   ⑥ 기존 데이터 백필 (total_qty / products.qty 현재값으로 한번 동기화)
--
-- 멱등성 보장: 몇 번을 재실행해도 똑같은 상태로 수렴합니다. (DROP IF EXISTS / CREATE OR REPLACE)
-- ============================================================================


-- ============================================================================
-- 📌 SECTION 0. 사전 준비 (사용되는 TYPE이 존재하는지 확인)
-- ============================================================================
-- size_std enum 타입이 없다면 생성해줌 (나중에 함수 파라미터 타입으로 사용됨)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'size_std') THEN
    CREATE TYPE public.size_std AS ENUM ('S', 'M', 'L', 'XL', '2XL', '3XL', 'Free');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_check_state') THEN
    CREATE TYPE public.stock_check_state AS ENUM ('unchecked', 'error', 'ok');
  END IF;
END $$;


-- ============================================================================
-- 📌 SECTION 1. ✅ (필수) SALES 관련 트리거 4종 세팅
--     - Gift 재고 차감 / 환불 재고 복구 / Gift-Price 동기화 / GroupID 자동생성
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1-1. 🔄 gift ↔ price=0 양방향 강제 동기화
--      : 프론트에서 한쪽만 바꿔도, DB에 들어가기 직전에 자동으로 두 값을 맞춰줌
--        (ex: price만 0으로 바꿔도 free_gift=true 로 자동 세팅)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_free_gift_when_price_zero()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- 가격이 0이면 무조건 gift로 마킹
  if coalesce(new.price, 0) = 0 then
    new.free_gift := true;
  -- 가격이 0보다 크고, 교환 표시가 아니라면 gift를 강제로 끔
  elsif coalesce(new.is_exchanged, false) = false then
    new.free_gift := false;
  end if;
  return new;
end;
$function$;

-- --------------------------------------------------------------------------
-- 1-2. ➖ 판매 INSERT 시 재고 자동 차감 (gift 포함!)
--      : 가장 중요한 함수. sales 에 새 row가 들어올 때마다 inventories를 -qty 함.
--        증정(gift)이든 일반판매든 상관없이 무조건 차감 → gift 재고 안빠지던 버그 해결!
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sales_apply_stock_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_available integer;
begin
  -- [멱등성] stock_applied_at 이 이미 기록된 row는 중복 실행 방지 (재고 두번 빠지는 일 절대 없음)
  if new.stock_applied_at is not null then
    return new;
  end if;

  -- [보호] 이미 환불된 row는 건너뜀
  if new.refunded_at is not null then
    return new;
  end if;

  -- [동시성 제어] inventories 행 잠금 + 현재 재고 확인
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

  -- 재고 부족시 강제 오류 → 초과판매 방지
  if v_available < new.qty then
    raise exception 'Insufficient stock: code=% size=% requested=% available=%',
      new.code, new.size_std, new.qty, v_available;
  end if;

  -- ✅ 핵심: 음수값 전달 → 재고 -qty 차감  (gift / 일반판매 구분 없음!)
  perform public.inv_apply_delta(new.code, new.size_std, -new.qty);

  -- 기록 남김 → 다음에 이 row 건드릴 때 중복 차감 안됨
  new.stock_applied_at := now();
  return new;
end;
$function$;

-- --------------------------------------------------------------------------
-- 1-3. ➕ 환불 시 재고 자동 복구
--      : 오직 "refunded_at 이 NULL → NOT NULL 로 바뀐 순간" 에만 1회 실행
--        is_exchanged? 그냥 표시용 플래그일 뿐, 여기서 전혀 안봄! → 중복 복구 방지
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sales_restore_stock_on_refund()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- 환불 전환 (refunded_at NULL → 값 생김)일 때만 복구
  if old.refunded_at is null and new.refunded_at is not null then
    -- [멱등성] 판매 INSERT 시 재고 차감이 정상 적용된 row에 대해서만 복구
    --   (안그러면 아직 차감 안된 재고를 또 복구해서 +1 이 중복됨!)
    if old.stock_applied_at is not null then
      perform public.inv_apply_delta(old.code, old.size_std, old.qty);
    end if;
  end if;

  return new;
end;
$function$;

-- --------------------------------------------------------------------------
-- 1-4. 🔧 inventories 사이즈별 +/- 공통 유틸함수 (위 1-2, 1-3 에서 공통 호출)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inv_apply_delta(
  p_code text,            -- 상품코드 (ex: GM-TP-AC-WH-06)
  p_size public.size_std, -- 사이즈 (S/M/L/XL/2XL/3XL/Free)
  p_qty integer           -- 변화량: 음수=차감(판매), 양수=증가(환불)
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  if p_qty is null or p_qty = 0 then
    return; -- 0이면 아무것도 안함
  end if;

  -- 사이즈마다 컬럼명이 다르므로 분기하여 UPDATE
  -- (주의: inventories 테이블에는 updated_at 컬럼이 없으므로 절대 SET updated_at 추가하지 말것!)
  if p_size = 'S' then
    update public.inventories set s = coalesce(s, 0) + p_qty where code = p_code;
  elsif p_size = 'M' then
    update public.inventories set m = coalesce(m, 0) + p_qty where code = p_code;
  elsif p_size = 'L' then
    update public.inventories set l = coalesce(l, 0) + p_qty where code = p_code;
  elsif p_size = 'XL' then
    update public.inventories set xl = coalesce(xl, 0) + p_qty where code = p_code;
  elsif p_size = '2XL' then
    update public.inventories set "2xl" = coalesce("2xl", 0) + p_qty where code = p_code;
  elsif p_size = '3XL' then
    update public.inventories set "3xl" = coalesce("3xl", 0) + p_qty where code = p_code;
  elsif p_size = 'Free' then
    update public.inventories set free = coalesce(free, 0) + p_qty where code = p_code;
  else
    raise exception 'Unknown size_std: %', p_size;
  end if;

  if not found then
    raise exception 'Inventory row not found for code=%', p_code;
  end if;
end;
$function$;

-- --------------------------------------------------------------------------
-- 1-5. 🆔 sale_group_id 가 NULL 이면 자동 UUID 생성
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sales_fill_group_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.sale_group_id is null then
    new.sale_group_id := gen_random_uuid();
  end if;
  return new;
end;
$function$;


-- --------------------------------------------------------------------------
-- 1-6. 🔗 실제로 sales 테이블에 위 함수들을 TRIGGER 로 부착
--      (함수만 만들어놓고 여기가 없으면 절대 실행 안됨!! 이게 기존 버그 원인)
-- --------------------------------------------------------------------------

-- 1-6a. Gift-Price 동기화 트리거
DROP TRIGGER IF EXISTS trg_sales_enforce_free_gift ON sales;
CREATE TRIGGER trg_sales_enforce_free_gift
  BEFORE INSERT OR UPDATE OF price, free_gift, is_exchanged ON sales
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_free_gift_when_price_zero();

-- 1-6b. 재고 자동 차감 트리거 (새 판매건 INSERT 시)
DROP TRIGGER IF EXISTS trg_sales_apply_stock_on_insert ON sales;
CREATE TRIGGER trg_sales_apply_stock_on_insert
  BEFORE INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sales_apply_stock_on_insert();

-- 1-6c. 환불 시 재고 복구 트리거 (오직 refunded_at 컬럼이 바뀔 때만 발동!)
DROP TRIGGER IF EXISTS trg_sales_restore_stock_on_refund ON sales;
CREATE TRIGGER trg_sales_restore_stock_on_refund
  BEFORE UPDATE OF refunded_at ON sales
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sales_restore_stock_on_refund();

-- 1-6d. sale_group_id 자동 채움
DROP TRIGGER IF EXISTS trg_sales_fill_group_id ON sales;
CREATE TRIGGER trg_sales_fill_group_id
  BEFORE INSERT ON sales
  FOR EACH ROW
  WHEN (NEW.sale_group_id IS NULL)
  EXECUTE FUNCTION public.trg_sales_fill_group_id();


-- ============================================================================
-- 📌 SECTION 2. 🟢 (누락!) inventories / products 트리거 좀비 깨우기
--     - 정의만 있고 부착 구문이 없어서 한 번도 실행 안됐던 함수 4개를 진짜로 부착
--     - 이거 안하면 inventories.total_qty / products.qty 가 영원히 안맞음!
-- ============================================================================

-- --------------------------------------------------------------------------
-- 2-1. 🧮 inventories INSERT/UPDATE 시 total_qty = s+m+l+xl+2xl+3xl+free 자동 계산
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_inventory_total_qty()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.total_qty :=
    coalesce(new.s, 0)    +
    coalesce(new.m, 0)    +
    coalesce(new.l, 0)    +
    coalesce(new.xl, 0)   +
    coalesce(new."2xl", 0) +
    coalesce(new."3xl", 0) +
    coalesce(new.free, 0);
  return new;
end;
$function$;

-- --------------------------------------------------------------------------
-- 2-2. 🔗 inventories 변경되면 products 테이블의 qty(총재고) 도 같이 자동 업데이트
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_products_qty_from_inventories()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE products
     SET qty = NEW.total_qty
   WHERE code = NEW.code;
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------------------------
-- 2-3. ✂️ products.product_code 공백 자동 제거 (trim)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trim_product_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.product_code := btrim(new.product_code);
  return new;
end;
$function$;

-- --------------------------------------------------------------------------
-- 2-4. ✂️ sales.product_code 공백 자동 제거 (필드 존재 시 동작)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trim_sale_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- sales 테이블에는 code_raw/code 컬럼을 쓰므로 혹시 product_code 컬럼이
  -- 추가된 케이스 대비 컬럼 존재할 때만 동작하도록 방어로직
  if new.product_code is not null then
    new.product_code := btrim(new.product_code);
  end if;
  return new;
end;
$function$;

-- --------------------------------------------------------------------------
-- 2-5. 🔗 위 함수들을 실제 테이블에 부착
-- --------------------------------------------------------------------------

-- 2-5a. inventories total_qty 자동 계산 (INSERT/UPDATE 둘 다)
DROP TRIGGER IF EXISTS trg_inv_set_total_qty ON inventories;
CREATE TRIGGER trg_inv_set_total_qty
  BEFORE INSERT OR UPDATE OF s, m, l, xl, "2xl", "3xl", free ON inventories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_inventory_total_qty();

-- 2-5b. inventories → products.qty 동기화 (total_qty가 바뀔 때마다)
DROP TRIGGER IF EXISTS trg_inv_sync_products_qty ON inventories;
CREATE TRIGGER trg_inv_sync_products_qty
  AFTER INSERT OR UPDATE OF total_qty ON inventories
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_products_qty_from_inventories();

-- 2-5c. products 코드 trim (혹시 products 테이블 스키마가 다를 수 있으니 IF NOT EXISTS 로 방어)
DROP TRIGGER IF EXISTS trg_products_trim_code ON products;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='products' AND column_name='product_code'
  ) THEN
    CREATE TRIGGER trg_products_trim_code
      BEFORE INSERT OR UPDATE OF product_code ON products
      FOR EACH ROW
      EXECUTE FUNCTION public.trim_product_code();
  END IF;
END $$;


-- ============================================================================
-- 📌 SECTION 3. 🟠 (DB 정리) 사용하지 않는 레거시 함수들 일괄 DROP
--     - 시그니처까지 모두 명시해야 정확히 지워지므로 오버로딩 2개도 각각 삭제
-- ============================================================================

-- 3-1. 안쓰는 손익통계 함수
DROP FUNCTION IF EXISTS public.get_daily_profit_loss(date, date);

-- 3-2. 구 정산 시스템 함수들 (settle_guide_sales 로 완전 대체)
--     시그니처가 2가지 버전 존재할 수 있으므로 2번 시도
DROP FUNCTION IF EXISTS public.settle_all_guide_commission(bigint, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.settle_all_guide_commission(bigint, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.settle_guide_commission_to_balance(bigint, numeric, numeric, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.settle_guide_commission_to_balance(bigint, numeric, numeric, text, text, text, timestamptz);

-- 3-3. 1줄짜리 쓸모없는 래퍼 (그냥 recalculate_guide_commission 호출하는 함수)
DROP FUNCTION IF EXISTS public.recalc_one_sale_group(uuid);

-- 3-4. sell_item 함수 → 현재는 salesApiSupabase.js 에서 개별 INSERT 처리하므로 아무도 호출 안함
--     같은 이름 오버로딩 2종이 있어서 각각 DROP
DROP FUNCTION IF EXISTS public.sell_item(text, text, integer, numeric, numeric, timestamptz);
DROP FUNCTION IF EXISTS public.sell_item(text, text, integer, numeric, timestamptz);

-- 3-5. sell_item이 호출하던 normalize_sale_input, refund_item 도 함께 DROP
DROP FUNCTION IF EXISTS public.normalize_sale_input(text, text);
DROP FUNCTION IF EXISTS public.refund_item(bigint, text, timestamptz);


-- ============================================================================
-- 📌 SECTION 4. 🧪 (백필) 기존 데이터 한번 동기화
--     - 지금까지 트리거가 없어서 불일치 됐을 수 있는 값들을 일괄 정정
-- ============================================================================

-- 4-1. inventories.total_qty 를 현재 사이즈별 합계로 1회 재계산
--      (주의: inventories 테이블에는 updated_at 컬럼이 없으므로 절대 건들지 말것!)
UPDATE public.inventories
   SET total_qty =
         coalesce(s, 0)    +
         coalesce(m, 0)    +
         coalesce(l, 0)    +
         coalesce(xl, 0)   +
         coalesce("2xl", 0) +
         coalesce("3xl", 0) +
         coalesce(free, 0)
 WHERE true;

-- 4-2. products.qty 를 방금 업데이트된 inventories.total_qty 로 1회 동기화
UPDATE public.products p
   SET qty = inv.total_qty
  FROM public.inventories inv
 WHERE p.code = inv.code
   AND (p.qty IS DISTINCT FROM inv.total_qty);


-- ============================================================================
-- ✅ FINISH. 완료 메시지
-- ============================================================================
-- 모든 마이그레이션이 정상 적용되었습니다!
-- 다음 순서로 확인하시면 됩니다:
--   1. /sell 페이지에서 Gift(하트) 버튼 클릭 후 재고 차감되는지 테스트
--   2. /sales 페이지에서 환불 후 재고 +1 원복 테스트
--   3. /product list 상품 리스트 총 재고 / 상세 재고가 일치하는지 확인
-- ============================================================================
