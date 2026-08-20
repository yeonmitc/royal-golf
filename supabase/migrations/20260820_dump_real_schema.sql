-- ==================================================================================
-- 🔍 [긴급] Supabase 실제 테이블 & 컬럼명 풀 덤프 SQL
-- 원인: products 테이블에 code 컬럼이 없다? 실제 스키마가 예상과 완전 다를 수 있음
-- 실행: Supabase SQL Editor → Run → 결과를 복사해서 보내주세요!
-- ==================================================================================

-- ----------------------------------------------------------------------------------
-- 1️⃣ public 스키마에 존재하는 모든 테이블 목록 + 행 개수
-- ----------------------------------------------------------------------------------
SELECT
    '[1/3] 전체 테이블 목록'       AS phase,
    table_name                        AS table_name,
    (xpath('/row/cnt/text()',
        query_to_xml(format('SELECT COUNT(*) AS cnt FROM public.%I', table_name),
        false, true, '')))[1]::text::bigint AS approx_rows
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;


-- ----------------------------------------------------------------------------------
-- 2️⃣ 모든 테이블의 "컬럼 전체 목록" → 컬럼명 하나하나를 전부 나열!
--    이걸 보면 진짜 products 테이블의 실제 PK 컬럼명이 뭔지 100% 알 수 있음
-- ----------------------------------------------------------------------------------
SELECT
    '[2/3] 각 테이블 컬럼 전체 목록'  AS phase,
    table_name,
    ordinal_position                  AS col_order,
    column_name,
    data_type,
    CASE WHEN is_nullable = 'NO' THEN 'NOT NULL' ELSE 'NULL' END AS nullable,
    CASE WHEN column_default IS NOT NULL THEN 'DEFAULT: ' || column_default ELSE '-' END AS default_val
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;


-- ----------------------------------------------------------------------------------
-- 3️⃣ 기본키(PK)와 외래키(FK) 제약조건 전체 목록 → PK 컬럼명이 뭔지 바로 확인!
-- ----------------------------------------------------------------------------------
SELECT
    '[3/3] PK / FK 제약조건 목록' AS phase,
    tc.table_name,
    tc.constraint_type,
    tc.constraint_name,
    kcu.column_name                   AS key_column,
    ccu.table_name                    AS foreign_table_name,
    ccu.column_name                   AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
       ON tc.constraint_catalog = kcu.constraint_catalog
      AND tc.constraint_schema = kcu.constraint_schema
      AND tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_catalog = ccu.constraint_catalog
      AND tc.constraint_schema = ccu.constraint_schema
      AND tc.constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
ORDER BY tc.table_name, tc.constraint_type, kcu.ordinal_position;
