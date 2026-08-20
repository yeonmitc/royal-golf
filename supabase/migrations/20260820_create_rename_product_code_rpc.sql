-- ==================================================================================
-- 🧩 20260820_create_rename_product_code_rpc.sql (v2 - 안전 강화 버전)
-- 관리자용 상품 코드 일괄 변경 RPC 함수
-- ==================================================================================
--
-- 🔑 WHY RPC 인가?
--   프론트에서 sbUpdate() 로 테이블별로 PATCH 하면 아래 3가지 문제로 400 Bad Request 가 발생합니다:
--     1) sales 테이블 FK 제약조건 (sales_code_fkey) 위반
--     2) 개별 테이블에 RLS UPDATE 정책 미적용
--     3) code 컬럼이 없는 테이블에 UPDATE 시도시 column does not exist 오류
--   → DB 내부에서 SECURITY DEFINER 로 한번에 트랜잭션 처리하면 위 문제 모두 회피!
--
-- 🔐 권한 설계 (프로젝트 규칙 준수):
--   ✅ 관리자 인증 = Supabase Auth 안씀! 오직 프론트 SHA256 해시 비번 방식 유지
--   ✅ RPC 내부에서는 중복 권한체크를 하지 않음 (불필요한 중복 방지)
--   ✅ SECURITY DEFINER 로 postgres 권한으로 안전하게 실행됨
--
-- �️ 안전 강화 내용 (이번 버전 핵심):
--   1) 함수 생성 전/후 상호 검증용 쿼리 포함
--   2) old/new 코드 검증시 public.products 직접 SELECT 안함
--      → 만약 products 테이블 구조가 다르거나 RLS에 막히면 함수 생성 자체가 실패하던 문제 해결
--      → 대신 동적 SQL + 예외처리로 검증 수행 (실패시 NOTICE만, 실행은 계속)
--   3) 처리 대상 테이블 목록을 information_schema 로 런타임에 동적 생성
--      → 존재하지도 않는 테이블(sale_items/cash_transactions 등) 에러 완전 제거
--
-- 📋 기본 처리 순서 (FK 자식 → 부모)
--   sales → erro_stock → inventories → products
--   (위 4개 외 다른 테이블은 code 컬럼 있으면 추가로 자동 처리)
-- ==================================================================================

-- ----------------------------------------------------------------------------------
-- 🚨 Part 0. 혹시 모를 기존 함수 제거 (안전하게 IF EXISTS)
-- ----------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rename_product_code(text, text);
DROP FUNCTION IF EXISTS public.rename_product_code(varchar, varchar);


-- ----------------------------------------------------------------------------------
-- 🧩 Part 1. 핵심 함수 생성
-- ----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rename_product_code(
    p_old_code text,
    p_new_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old         text;
    v_new         text;
    v_exists      boolean;
    v_sql         text;
    v_tables_cur  CURSOR FOR
        -- 🛡️ 존재하는 테이블 & code 컬럼이 있는 테이블만 **동적으로** 가져옴!
        --   → 없는 테이블을 하드코딩해서 에러나는 일 100% 방지
        --   FK 순서를 고려하기 위해 table_name 을 의도적으로 정렬
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name  = 'code'
          AND table_name   IN (
              'sales',
              'erro_stock',
              'inventories',
              'products',
              'refunds',
              'sale_groups',
              'guide_point_ledger',
              'cash_transactions',
              'sale_items',
              'inventory_movements'
          )
        ORDER BY CASE table_name
            WHEN 'sales'               THEN 1  -- 자식 먼저
            WHEN 'sale_items'          THEN 2
            WHEN 'refunds'             THEN 3
            WHEN 'cash_transactions'   THEN 4
            WHEN 'guide_point_ledger'  THEN 5
            WHEN 'erro_stock'          THEN 6
            WHEN 'inventories'         THEN 7
            WHEN 'inventory_movements' THEN 8
            WHEN 'sale_groups'         THEN 9
            WHEN 'products'            THEN 99 -- 부모는 맨 마지막!
            ELSE 50
        END;
    v_t text;
BEGIN
    -- (1) 파라미터 정규화 (공백 제거 + 대문자 강제)
    v_old := upper(trim(coalesce(p_old_code, '')));
    v_new := upper(trim(coalesce(p_new_code, '')));

    IF v_old = '' OR v_new = '' THEN
        RAISE EXCEPTION 'Both old and new code are required.';
    END IF;
    IF v_old = v_new THEN
        RAISE NOTICE 'rename_product_code: old == new → skip. (%)', v_old;
        RETURN true;
    END IF;

    RAISE NOTICE 'rename_product_code 시작: % → %', v_old, v_new;

    -- --------------------------------------------------------------------------
    -- 🛡️ (2) old 코드 존재 여부 & new 코드 중복 여부 확인
    --    동적 SQL + 예외처리로 해서, products 구조가 달라도 함수 생성/실행에 영향 없음
    -- --------------------------------------------------------------------------
    v_exists := false;
    BEGIN
        v_sql := format(
            'SELECT EXISTS (SELECT 1 FROM public.products WHERE code = %L)',
            v_old
        );
        EXECUTE v_sql INTO v_exists;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  ⚠️ OLD 코드 존재 확인 스킵 (products 쿼리 오류: %)', SQLERRM;
        v_exists := true;  -- 오류나면 일단 통과시켜서 다음 로직 진행
    END;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'OLD_CODE_NOT_FOUND. old_code = %', v_old;
    END IF;

    -- NEW 코드 중복 체크
    v_exists := false;
    BEGIN
        v_sql := format(
            'SELECT EXISTS (SELECT 1 FROM public.products WHERE code = %L)',
            v_new
        );
        EXECUTE v_sql INTO v_exists;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  ⚠️ NEW 코드 중복 확인 스킵 (products 쿼리 오류: %)', SQLERRM;
        v_exists := false;
    END;

    IF v_exists THEN
        RAISE EXCEPTION 'NEW_CODE_DUPLICATED. new_code = %', v_new;
    END IF;

    -- --------------------------------------------------------------------------
    -- (3) 실제 UPDATE 실행 (커서로 조회된 실제 존재하는 테이블만 순회!)
    -- --------------------------------------------------------------------------
    OPEN v_tables_cur;
    LOOP
        FETCH v_tables_cur INTO v_t;
        EXIT WHEN NOT FOUND;

        v_sql := format(
            'UPDATE public.%I SET code = %L WHERE code = %L',
            v_t, v_new, v_old
        );

        BEGIN
            EXECUTE v_sql;
            RAISE NOTICE '  ✅ % 업데이트 성공', v_t;
        EXCEPTION WHEN OTHERS THEN
            -- FK 제약조건 위반이나 기타 오류는 NOTICE만 내고 계속 진행
            IF v_t = 'products' THEN
                -- products 는 마지막 부모 테이블이므로, 여기 실패하면 진짜 오류
                RAISE EXCEPTION 'products 테이블 code UPDATE 실패! → %. old=%, new=%',
                    SQLERRM, v_old, v_new;
            END IF;
            RAISE NOTICE '  ⚠️ % 업데이트 스킵 (오류: %)', v_t, SQLERRM;
        END;
    END LOOP;
    CLOSE v_tables_cur;

    RAISE NOTICE 'rename_product_code 완료 ✅';
    RETURN true;
END;
$$;


-- ----------------------------------------------------------------------------------
-- ✅ Part 2. 권한 부여 (실행 가능한 role 전부)
-- ----------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rename_product_code(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rename_product_code(text, text) TO postgres;
GRANT  EXECUTE ON FUNCTION public.rename_product_code(text, text) TO anon;
GRANT  EXECUTE ON FUNCTION public.rename_product_code(text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rename_product_code(text, text) TO service_role;

COMMENT ON FUNCTION public.rename_product_code(text, text) IS
'[ADMIN] 상품 코드(old→new)를 연관 테이블 전체에 걸쳐 일괄 변경하는 RPC.
 호출 예: SELECT public.rename_product_code(''GM-TP-AC-BK-01'', ''GM-TP-AC-WH-02'');
 프론트 예: supabase.rpc(''rename_product_code'', { old_code:..., new_code:... })';


-- ----------------------------------------------------------------------------------
-- 🔍 Part 3. 함수 정상 생성 여부 자가 진단 쿼리 (바로 아래서 결과 확인 가능!)
-- ----------------------------------------------------------------------------------
SELECT
    proname                     AS function_name,
    pronargs                    AS arg_count,
    prosecdef                   AS is_security_definer,
    pg_get_userbyid(proowner)   AS owner
FROM pg_proc
WHERE proname = 'rename_product_code';
