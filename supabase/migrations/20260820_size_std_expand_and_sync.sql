-- ==================================================================================
-- 🧵 [Size Mapping & DB Sync v1] 20260820_size_std_expand_and_sync.sql
--   요구사항: size-mapping-and-db-sync-spec.md v1
--   기능:
--     1) size_std ENUM 에 4XL / 5XL / 6XL / 7XL / 8XL 값 추가
--     2) inventories 테이블에 "4xl" ~ "8xl" integer 컬럼 추가 (DEFAULT 0)
--     3) inv_apply_delta(p_code, p_size, p_qty) 함수 → 4XL~8XL 분기 추가
--     4) trg_sales_apply_stock_on_insert() 함수 → 4XL~8XL 재고 체크/차감 분기 추가
--     +) set_inventory_total_qty() / trg_sales_restore_stock_on_refund() 함수도 같이 업데이트
-- ==================================================================================


-- ============================================================
-- 1️⃣  size_std ENUM 타입 확장 (M~8XL / S~4XL / 장갑용 추가된 4XL~8XL)
--   - 멱등성: 이미 존재하면 SKIP
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type typ
        JOIN pg_enum enm ON typ.oid = enm.enumtypid
        WHERE typ.typname = 'size_std'
          AND enm.enumlabel = '4XL'
    ) THEN
        ALTER TYPE public.size_std ADD VALUE '4XL';
        RAISE NOTICE '✅ [1/4] size_std ENUM: 4XL 값 추가 성공';
    ELSE
        RAISE NOTICE 'ℹ️  [1/4] size_std ENUM: 4XL 값은 이미 존재';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type typ
        JOIN pg_enum enm ON typ.oid = enm.enumtypid
        WHERE typ.typname = 'size_std'
          AND enm.enumlabel = '5XL'
    ) THEN
        ALTER TYPE public.size_std ADD VALUE '5XL';
        RAISE NOTICE '✅ [1/4] size_std ENUM: 5XL 값 추가 성공';
    ELSE
        RAISE NOTICE 'ℹ️  [1/4] size_std ENUM: 5XL 값은 이미 존재';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type typ
        JOIN pg_enum enm ON typ.oid = enm.enumtypid
        WHERE typ.typname = 'size_std'
          AND enm.enumlabel = '6XL'
    ) THEN
        ALTER TYPE public.size_std ADD VALUE '6XL';
        RAISE NOTICE '✅ [1/4] size_std ENUM: 6XL 값 추가 성공';
    ELSE
        RAISE NOTICE 'ℹ️  [1/4] size_std ENUM: 6XL 값은 이미 존재';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type typ
        JOIN pg_enum enm ON typ.oid = enm.enumtypid
        WHERE typ.typname = 'size_std'
          AND enm.enumlabel = '7XL'
    ) THEN
        ALTER TYPE public.size_std ADD VALUE '7XL';
        RAISE NOTICE '✅ [1/4] size_std ENUM: 7XL 값 추가 성공';
    ELSE
        RAISE NOTICE 'ℹ️  [1/4] size_std ENUM: 7XL 값은 이미 존재';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type typ
        JOIN pg_enum enm ON typ.oid = enm.enumtypid
        WHERE typ.typname = 'size_std'
          AND enm.enumlabel = '8XL'
    ) THEN
        ALTER TYPE public.size_std ADD VALUE '8XL';
        RAISE NOTICE '✅ [1/4] size_std ENUM: 8XL 값 추가 성공';
    ELSE
        RAISE NOTICE 'ℹ️  [1/4] size_std ENUM: 8XL 값은 이미 존재';
    END IF;
END $$;


-- ============================================================
-- 2️⃣  inventories 테이블에 4xl ~ 8xl 컬럼 추가
--   - IF NOT EXISTS 로 재실행 안전!
-- ============================================================
ALTER TABLE public.inventories
    ADD COLUMN IF NOT EXISTS "4xl" integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "5xl" integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "6xl" integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "7xl" integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "8xl" integer DEFAULT 0;


DO $$ BEGIN RAISE NOTICE '✅ [2/4] inventories 테이블: 4xl~8xl 컬럼 추가 완료 (이미 있으면 SKIP)'; END $$;


-- ============================================================
-- 3️⃣  inv_apply_delta(p_code, p_size, p_qty) 함수 교체
--     4XL~8XL 분기 추가!
-- ============================================================
CREATE OR REPLACE FUNCTION public.inv_apply_delta(
    p_code text,
    p_size public.size_std,
    p_qty  integer
) RETURNS void
    LANGUAGE plpgsql
AS $function$
BEGIN
    IF p_qty IS NULL OR p_qty = 0 THEN
        RETURN;
    END IF;

    IF p_size = 'S' THEN
        UPDATE public.inventories SET s    = COALESCE(s,   0) + p_qty WHERE code = p_code;
    ELSIF p_size = 'M' THEN
        UPDATE public.inventories SET m    = COALESCE(m,   0) + p_qty WHERE code = p_code;
    ELSIF p_size = 'L' THEN
        UPDATE public.inventories SET l    = COALESCE(l,   0) + p_qty WHERE code = p_code;
    ELSIF p_size = 'XL' THEN
        UPDATE public.inventories SET xl   = COALESCE(xl,  0) + p_qty WHERE code = p_code;
    ELSIF p_size = '2XL' THEN
        UPDATE public.inventories SET "2xl" = COALESCE("2xl", 0) + p_qty WHERE code = p_code;
    ELSIF p_size = '3XL' THEN
        UPDATE public.inventories SET "3xl" = COALESCE("3xl", 0) + p_qty WHERE code = p_code;
    ELSIF p_size = '4XL' THEN
        UPDATE public.inventories SET "4xl" = COALESCE("4xl", 0) + p_qty WHERE code = p_code;
    ELSIF p_size = '5XL' THEN
        UPDATE public.inventories SET "5xl" = COALESCE("5xl", 0) + p_qty WHERE code = p_code;
    ELSIF p_size = '6XL' THEN
        UPDATE public.inventories SET "6xl" = COALESCE("6xl", 0) + p_qty WHERE code = p_code;
    ELSIF p_size = '7XL' THEN
        UPDATE public.inventories SET "7xl" = COALESCE("7xl", 0) + p_qty WHERE code = p_code;
    ELSIF p_size = '8XL' THEN
        UPDATE public.inventories SET "8xl" = COALESCE("8xl", 0) + p_qty WHERE code = p_code;
    ELSIF p_size = 'Free' THEN
        UPDATE public.inventories SET free = COALESCE(free, 0) + p_qty WHERE code = p_code;
    ELSE
        RAISE EXCEPTION 'Unknown size_std: %', p_size;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory row not found for code=%', p_code;
    END IF;
END;
$function$;


DO $$ BEGIN RAISE NOTICE '✅ [3/4] inv_apply_delta() 함수 4XL~8XL 분기 추가 성공'; END $$;


-- ============================================================
-- 4️⃣  trg_sales_apply_stock_on_insert() 함수 교체
--     INSERT/UPDATE 전에 재고 확인하고 차감 → 4XL~8XL 분기 추가!
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_sales_apply_stock_on_insert()
    RETURNS trigger
    LANGUAGE plpgsql
AS $function$
DECLARE
    v_available integer;
BEGIN
    -- 🛡️ 멱등성: 이미 재고 차감 적용된 건이면 SKIP
    IF NEW.stock_applied_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- 🛡️ 환불된 건은 재고 차감 스킵 (나중에 restore_stock_on_refund 가 처리)
    IF NEW.refunded_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- 📦 사이즈별 현재 재고 잠금 조회 (FOR UPDATE 로 동시성 방지)
    IF NEW.size_std = 'S' THEN
        SELECT s    INTO v_available FROM public.inventories WHERE code = NEW.code FOR UPDATE;
    ELSIF NEW.size_std = 'M' THEN
        SELECT m    INTO v_available FROM public.inventories WHERE code = NEW.code FOR UPDATE;
    ELSIF NEW.size_std = 'L' THEN
        SELECT l    INTO v_available FROM public.inventories WHERE code = NEW.code FOR UPDATE;
    ELSIF NEW.size_std = 'XL' THEN
        SELECT xl   INTO v_available FROM public.inventories WHERE code = NEW.code FOR UPDATE;
    ELSIF NEW.size_std = '2XL' THEN
        SELECT "2xl" INTO v_available FROM public.inventories WHERE code = NEW.code FOR UPDATE;
    ELSIF NEW.size_std = '3XL' THEN
        SELECT "3xl" INTO v_available FROM public.inventories WHERE code = NEW.code FOR UPDATE;
    ELSIF NEW.size_std = '4XL' THEN
        SELECT "4xl" INTO v_available FROM public.inventories WHERE code = NEW.code FOR UPDATE;
    ELSIF NEW.size_std = '5XL' THEN
        SELECT "5xl" INTO v_available FROM public.inventories WHERE code = NEW.code FOR UPDATE;
    ELSIF NEW.size_std = '6XL' THEN
        SELECT "6xl" INTO v_available FROM public.inventories WHERE code = NEW.code FOR UPDATE;
    ELSIF NEW.size_std = '7XL' THEN
        SELECT "7xl" INTO v_available FROM public.inventories WHERE code = NEW.code FOR UPDATE;
    ELSIF NEW.size_std = '8XL' THEN
        SELECT "8xl" INTO v_available FROM public.inventories WHERE code = NEW.code FOR UPDATE;
    ELSIF NEW.size_std = 'Free' THEN
        SELECT free INTO v_available FROM public.inventories WHERE code = NEW.code FOR UPDATE;
    ELSE
        RAISE EXCEPTION 'Invalid size_std=%', NEW.size_std;
    END IF;

    IF v_available IS NULL THEN
        RAISE EXCEPTION 'Inventory row missing for code=%', NEW.code;
    END IF;

    IF v_available < NEW.qty THEN
        RAISE EXCEPTION 'Insufficient stock: code=% size=% requested=% available=%',
            NEW.code, NEW.size_std, NEW.qty, v_available;
    END IF;

    -- ✂️ 재고 차감 실행 (위에서 정의한 inv_apply_delta 재사용)
    PERFORM public.inv_apply_delta(NEW.code, NEW.size_std, -NEW.qty);

    NEW.stock_applied_at := NOW();
    RETURN NEW;
END;
$function$;


DO $$ BEGIN RAISE NOTICE '✅ [4/4] trg_sales_apply_stock_on_insert() 함수 4XL~8XL 반영 성공'; END $$;


-- ============================================================
-- 🔍 5️⃣  (부가!) set_inventory_total_qty 함수 업데이트 (trg_inv_set_total_qty 트리거가 씀!)
--     - Total Qty 합계에 4xl~8xl 도 포함시켜야 함!
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_inventory_total_qty()
    RETURNS trigger
    LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.total_qty :=
        COALESCE(NEW.s,    0) +
        COALESCE(NEW.m,    0) +
        COALESCE(NEW.l,    0) +
        COALESCE(NEW.xl,   0) +
        COALESCE(NEW."2xl", 0) +
        COALESCE(NEW."3xl", 0) +
        COALESCE(NEW."4xl", 0) +
        COALESCE(NEW."5xl", 0) +
        COALESCE(NEW."6xl", 0) +
        COALESCE(NEW."7xl", 0) +
        COALESCE(NEW."8xl", 0) +
        COALESCE(NEW.free, 0);
    RETURN NEW;
END;
$function$;


DO $$ BEGIN RAISE NOTICE '➕ (추가) set_inventory_total_qty() 함수: total_qty 합계에 4xl~8xl 포함 완료'; END $$;


-- ============================================================
-- 🔍 6️⃣  (부가!) trg_sales_restore_stock_on_refund() 함수 업데이트
--     - 환불시 재고 되돌릴때 4xl~8xl 도 되돌려야 함!
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_sales_restore_stock_on_refund()
    RETURNS trigger
    LANGUAGE plpgsql
AS $function$
BEGIN
    -- 🛡️ 환불 발생 상황: NEW.refunded_at 이 NOT NULL 이고, 이전에는 NULL 이었을 때만 실행
    IF NEW.refunded_at IS NOT NULL AND OLD.refunded_at IS NULL THEN
        -- 🔁 차감됐던 재고를 다시 돌려줌 (+qty)
        PERFORM public.inv_apply_delta(NEW.code, NEW.size_std, NEW.qty);
    END IF;
    RETURN NEW;
END;
$function$;


DO $$ BEGIN RAISE NOTICE '➕ (추가) trg_sales_restore_stock_on_refund() 함수: inv_apply_delta 재사용하므로 4xl~8xl 자동 지원'; END $$;


-- ============================================================
-- 📊 최종 검증: size_std enum values / inventories 컬럼 / 함수 정상 등록 확인
-- ============================================================
SELECT
    '[ENUM 검증] size_std values'        AS section,
    string_agg(enm.enumlabel, ', ' ORDER BY enm.enumsortorder) AS size_std_values
FROM pg_type typ
JOIN pg_enum enm ON typ.oid = enm.enumtypid
WHERE typ.typname = 'size_std';

SELECT
    '[컬럼 검증] inventories 사이즈 컬럼' AS section,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'inventories'
  AND column_name IN ('s','m','l','xl','2xl','3xl','4xl','5xl','6xl','7xl','8xl','free','total_qty')
ORDER BY ordinal_position;
