-- ==================================================================================
-- 🔍 Edit Code 400 Bad Request 원인 진단 SQL
--   - products 테이블 RLS 활성화 여부 + RLS 정책 목록
--   - products 테이블 PK 컬럼이 뭔지 (code? no?)
-- ==================================================================================

SELECT
    '[1/3] RLS 활성화 여부' AS section,
    relname         AS table_name,
    relrowsecurity  AS "RLS_ENABLED",
    relforcerowsecurity AS "RLS_FORCED"
FROM pg_class
WHERE oid = 'public.products'::regclass;

SELECT
    '[2/3] RLS 정책 목록' AS section,
    polname         AS policy_name,
    polcmd          AS cmd,
    polroles        AS roles,
    pg_get_expr(polqual, polrelid)       AS using_expression,
    pg_get_expr(polwithcheck, polrelid)  AS with_check_expression
FROM pg_policy
WHERE polrelid = 'public.products'::regclass;

SELECT
    '[3/3] products PK 컬럼' AS section,
    tc.constraint_name,
    kcu.column_name,
    kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'products'
  AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY kcu.ordinal_position;
