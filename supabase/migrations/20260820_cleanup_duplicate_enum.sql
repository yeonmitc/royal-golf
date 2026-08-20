-- ==================================================================================
-- 🧹 [최종 안전 버전] 20260820_cleanup_duplicate_enum.sql
--
--   Step 0. size_std_enum이 진짜로 아무 데도 안쓰이는지 100% 검증!
--     ① 컬럼 타입으로 사용하는지? ② 함수 파라미터로 사용하는지?
--   Step 1. 하나도 안쓰이면 → 안전하게 DROP TYPE
--   Step 2. 최종 목록 조회
-- ==================================================================================

-- ----------------------------------------------------------------------------------
-- Step 0-1 ✅ 검증: size_std_enum 을 컬럼 타입으로 사용하는 테이블이 있는지?
--   (만약 1건이라도 나오면 DROP 하면 안됨!)
-- ----------------------------------------------------------------------------------
SELECT
    '[검증1] size_std_enum 을 타입으로 쓰는 컬럼 있나?' AS check_section,
    table_schema,
    table_name,
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND udt_name  = 'size_std_enum';


-- ----------------------------------------------------------------------------------
-- Step 0-2 ✅ 검증: size_std_enum 을 파라미터 타입 / 리턴 타입으로 쓰는 함수가 있는지?
--   (만약 1건이라도 나오면 DROP 하면 안됨!)
-- ----------------------------------------------------------------------------------
SELECT
    '[검증2] size_std_enum 을 타입으로 쓰는 함수 있나?' AS check_section,
    proname            AS function_name,
    proargtypes        AS arg_type_oids,
    prosrc             AS function_body_preview
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND (
    proargtypes::text LIKE '%' || (SELECT oid FROM pg_type WHERE typname='size_std_enum' LIMIT 1)::text || '%'
    OR prorettype = (SELECT oid FROM pg_type WHERE typname='size_std_enum' LIMIT 1)
  );


-- ----------------------------------------------------------------------------------
-- Step 1 ✅ 안전 삭제: 검증 결과 0건일때만 DROP 실행
--   (만약 위 검증에서 뭐가 나왔는데도 강제로 지우고 싶으면 아래 주석 지우고 직접 DROP)
-- ----------------------------------------------------------------------------------
DO $$
DECLARE
    v_col_usage_cnt integer;
    v_func_usage_cnt integer;
BEGIN
    -- 컬럼 사용량 count
    SELECT count(*) INTO v_col_usage_cnt
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND udt_name  = 'size_std_enum';

    -- 함수 사용량 count
    SELECT count(*) INTO v_func_usage_cnt
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND (
        proargtypes::text LIKE '%' || (SELECT oid FROM pg_type WHERE typname='size_std_enum' LIMIT 1)::text || '%'
        OR prorettype = (SELECT oid FROM pg_type WHERE typname='size_std_enum' LIMIT 1)
      );

    IF v_col_usage_cnt = 0 AND v_func_usage_cnt = 0 THEN
        RAISE NOTICE '✅ [안전검증 통과] size_std_enum은 아무 데도 사용되지 않음 → DROP 진행!';
        DROP TYPE IF EXISTS public.size_std_enum;
        RAISE NOTICE '🗑️  size_std_enum DROP 성공!';
    ELSE
        RAISE WARNING '⚠️  [중단] size_std_enum 사용처 발견! DROP 취소 (컬럼=%건, 함수=%건)',
            v_col_usage_cnt, v_func_usage_cnt;
    END IF;
END $$;


-- ----------------------------------------------------------------------------------
-- Step 2 ✅ 최종 확인
-- ----------------------------------------------------------------------------------
SELECT
    n.nspname           AS schema_name,
    t.typname           AS enum_name,
    string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_enum e
  ON t.oid = e.enumtypid
JOIN pg_namespace n
  ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typtype  = 'e'
GROUP BY n.nspname, t.typname
ORDER BY t.typname;
