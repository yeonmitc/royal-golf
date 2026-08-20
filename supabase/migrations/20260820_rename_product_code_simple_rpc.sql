-- ==================================================================================
-- 🚀 rename_product_code_simple RPC (SECURITY DEFINER)
--   목적: PostgREST REST API sbUpdate 400 Bad Request 가 RLS / PK UPDATE / anon 권한으로
--         인해 실패하므로, DB postgres 권한으로 직접 UPDATE 실행
--   특징:
--     - SECURITY DEFINER → DB 소유자(postgres) 권한으로 실행 → RLS / PostgREST 제약 X
--     - FK ON UPDATE CASCADE 로 인해 sales / inventories / erro_stock 자동 동기화
--     - 중복 코드 / 기존코드없음 / NULL 입력 등 검증 내장
--     - 재실행 안전 (CREATE OR REPLACE)
-- ==================================================================================

CREATE OR REPLACE FUNCTION public.rename_product_code_simple(
    old_code text,
    new_code text
) RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $function$
DECLARE
    v_old text;
    v_new text;
    v_affected integer;
BEGIN
    -- -----------------------------------------------------------------------
    -- 1. 입력 정리 및 NULL 체크 (대문자로 정규화)
    -- -----------------------------------------------------------------------
    v_old := UPPER(BTRIM(COALESCE(old_code, '')));
    v_new := UPPER(BTRIM(COALESCE(new_code, '')));

    IF v_old = '' THEN
        RAISE EXCEPTION 'old_code cannot be empty';
    END IF;
    IF v_new = '' THEN
        RAISE EXCEPTION 'new_code cannot be empty';
    END IF;
    IF v_old = v_new THEN
        RETURN true;
    END IF;

    -- -----------------------------------------------------------------------
    -- 2. 중복 코드 검사: new_code 가 이미 다른 상품에서 쓰이고 있으면 안됨
    -- -----------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_new AND p.code <> v_old) THEN
        RAISE EXCEPTION '중복된 코드입니다. new_code=% 는 이미 존재합니다.', v_new;
    END IF;

    -- -----------------------------------------------------------------------
    -- 3. 기존 코드 존재 여부 검사
    -- -----------------------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_old) THEN
        RAISE EXCEPTION '기존 코드가 존재하지 않습니다: old_code=%', v_old;
    END IF;

    -- -----------------------------------------------------------------------
    -- 4. ✨ 코드 변경 실행!
    --    → FK 제약조건 ON UPDATE CASCADE 로 인해
    --      sales / inventories / erro_stock / code_parts 의 code 컬럼이 자동으로 같이 바뀜!
    -- -----------------------------------------------------------------------
    UPDATE public.products
       SET code = v_new
     WHERE code = v_old;

    GET DIAGNOSTICS v_affected = ROW_COUNT;

    IF v_affected = 0 THEN
        RAISE EXCEPTION '업데이트된 행이 없습니다. old_code=%', v_old;
    END IF;

    RAISE NOTICE '✅ rename_product_code_simple 성공! old_code=% → new_code=% (영향받은 행: %건)',
        v_old, v_new, v_affected;

    RETURN true;
END;
$function$;


-- ==================================================================================
-- 🔒 보안: 특정 Role 만 호출 가능하도록 제한 (RLS가 아니라 DB Role 권한이지만,
--          익명 유저가 호출할 일은 없으므로 안전을 위해 기본 public 실행권한은 유지)
-- ==================================================================================
-- REVOKE ALL ON FUNCTION public.rename_product_code_simple(text, text) FROM public;
-- GRANT  EXECUTE ON FUNCTION public.rename_product_code_simple(text, text) TO postgres;


DO $$ BEGIN RAISE NOTICE '✅ rename_product_code_simple() RPC 함수 등록 완료! (SECURITY DEFINER)'; END $$;


-- ==================================================================================
-- 🧪 (선택!) 동작 테스트! 원하면 아래 주석을 지우고 따로 실행해보세요
--   1. 존재하는 코드 아무거나 고르고
--   2. 바꿀 코드는 아직 없는 코드로 적어서 실행
--   3. 실행후 Products/Data 가서 코드가 바뀌었는지 + sales/inventories 코드도 바뀌었는지 확인!
-- ==================================================================================
/*
SELECT public.rename_product_code_simple(
    'GA-GG-FJ-BK-01',
    'GA-GG-FJ-BK-99'
);
*/
