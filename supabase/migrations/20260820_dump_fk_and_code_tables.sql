-- ==================================================================================
-- 🔍 [스키마 확인용 v2 - 구문오류 FIX 완료!] 20260820_dump_fk_and_code_tables.sql
-- Supabase DB에서 진짜 code 컬럼 관련 FK 제약조건을 100% 정확하게 덤프
--
-- ✅ 수정 사항:
--   - AS "한글 별칭" 에 큰 따옴표("") 를 꼭 붙임 (PostgreSQL 규칙)
--   - Section 2 products PK 가 없어도 빈결과 대신에 "products.code가 PK가 아님"을 NOTICE로 명확히 출력
-- ==================================================================================

-- ----------------------------------------------------------------------------------
-- 1️⃣ code 컬럼을 가진 모든 테이블 목록
-- ----------------------------------------------------------------------------------
SELECT
    '[1/3] code 컬럼 있는 테이블'  AS section,
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name  = 'code'
ORDER BY table_name;


-- ----------------------------------------------------------------------------------
-- 2️⃣ PK (기본키) 목록 → products.code가 PK인지 확인!
-- ----------------------------------------------------------------------------------
DO $$
DECLARE
    v_cnt integer;
BEGIN
    SELECT count(*)
      INTO v_cnt
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_catalog = kcu.constraint_catalog
       AND tc.constraint_schema  = kcu.constraint_schema
       AND tc.constraint_name    = kcu.constraint_name
     WHERE tc.table_schema    = 'public'
       AND tc.table_name      = 'products'
       AND tc.constraint_type = 'PRIMARY KEY'
       AND kcu.column_name    = 'code';

    IF v_cnt > 0 THEN
        RAISE NOTICE '✅ [2/3] products.code 는 정상적으로 기본키(PK) 로 설정되어 있음';
    ELSE
        RAISE NOTICE '⚠️ [2/3] products.code 는 기본키(PK) 가 아님! 다른 컬럼이 PK 일 가능성';
    END IF;
END $$;

SELECT
    '[2/3] code 컬럼을 PK로 가진 테이블' AS section,
    tc.table_name,
    string_agg(kcu.column_name, ', ') AS pk_columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_catalog = kcu.constraint_catalog
 AND tc.constraint_schema  = kcu.constraint_schema
 AND tc.constraint_name    = kcu.constraint_name
WHERE tc.table_schema    = 'public'
  AND tc.constraint_type = 'PRIMARY KEY'
  AND kcu.column_name    = 'code'
GROUP BY tc.table_name
ORDER BY tc.table_name;


-- ----------------------------------------------------------------------------------
-- 3️⃣ ✅ 가장 중요! FK (외래키) 제약조건 전체 목록
--   → 여기서 products.code 를 참조하는 자식 테이블과, FK 이름, ON UPDATE / ON DELETE 규칙을
--     100% 정확히 확인합니다.
--   → ON UPDATE CASCADE 로 바꿀 제약조건 이름을 알 수 있음!
-- ----------------------------------------------------------------------------------
SELECT
    '[3/3] code 관련 FK 외래키'          AS section,
    tc.constraint_name                   AS "fk_name",
    kcu.table_name                       AS "child_table (FK 있는 테이블)",
    string_agg(kcu.column_name, ', ')    AS "child_columns",
    ccu.table_name                       AS "parent_table (참조 대상 테이블)",
    string_agg(ccu.column_name, ', ')    AS "parent_columns",
    rc.update_rule                       AS "on_update_rule",   -- ✅ 이게 NO ACTION or RESTRICT 면 CASCADE 로 바꿀 대상!
    rc.delete_rule                       AS "on_delete_rule"
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_catalog = kcu.constraint_catalog
 AND tc.constraint_schema  = kcu.constraint_schema
 AND tc.constraint_name    = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_catalog = ccu.constraint_catalog
 AND tc.constraint_schema  = ccu.constraint_schema
 AND tc.constraint_name    = ccu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_catalog = rc.constraint_catalog
 AND tc.constraint_schema  = rc.constraint_schema
 AND tc.constraint_name    = rc.constraint_name
WHERE tc.table_schema    = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND (kcu.column_name = 'code' OR ccu.column_name = 'code')
GROUP BY
    tc.constraint_name,
    kcu.table_name,
    ccu.table_name,
    rc.update_rule,
    rc.delete_rule
ORDER BY ccu.table_name, kcu.table_name, tc.constraint_name;
