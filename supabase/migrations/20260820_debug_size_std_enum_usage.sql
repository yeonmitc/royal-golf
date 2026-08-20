-- ==================================================================================
-- 🔍 size_std_enum 사용처 추적 SQL (도대체 어디서 쓰이고 있나?)
-- enum 이 지워지지 않을때 이것만 실행!
-- ==================================================================================

-- 1️⃣ 컬럼으로 사용되는지?
SELECT '[1/3] 컬럼으로 사용됨' AS check_type, table_schema, table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema='public' AND udt_name='size_std_enum';

-- 2️⃣ 함수 파라미터 / 리턴타입으로 사용되는지?
SELECT
    '[2/3] 함수로 사용됨' AS check_type,
    p.oid::regprocedure AS func_oid,
    p.proname AS func_name,
    pg_get_function_identity_arguments(p.oid) AS func_args,
    t.typname AS return_type,
    p.prosrc
FROM pg_proc p
LEFT JOIN pg_type t ON p.prorettype = t.oid
WHERE p.pronamespace='public'::regnamespace
  AND (
    -- 파라미터 타입이 size_std_enum 이거나
    EXISTS (
        SELECT 1 FROM unnest(p.proallargtypes) arg_oid
        JOIN pg_type at ON at.oid = arg_oid
        WHERE at.typname = 'size_std_enum'
    )
    -- 리턴타입이 size_std_enum 이거나
    OR t.typname = 'size_std_enum'
  );

-- 3️⃣ 트리거 함수 내부 로직에서 size_std_enum 문자열 자체를 참조하는지?
SELECT
    '[3/3] 함수 내부 문자열로 size_std_enum 참조' AS check_type,
    proname AS function_name,
    prosrc AS function_body
FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND prosrc ILIKE '%size_std_enum%';

-- 4️⃣ DO $$ 블록을 사용해서 size_std 를 그냥 강제로 지우기 (만약 1,2,3 모두 No rows 라면 사용자 실행)!
/*
DO $$
BEGIN
    RAISE NOTICE '강제로 size_std_enum 삭제 시도중...';
    DROP TYPE IF EXISTS public.size_std_enum CASCADE;
    RAISE NOTICE '✅ size_std_enum 강제 삭제 성공!';
END $$;
*/
