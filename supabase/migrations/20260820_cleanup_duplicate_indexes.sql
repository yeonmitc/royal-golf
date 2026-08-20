-- ==================================================================================
-- 🧹 20260820_cleanup_duplicate_indexes.sql (v2! 에러 FIX!)
--
-- ✅ 주요 수정:
--   1. erro_stock_code_unique 는 INDEX가 아니라 UNIQUE CONSTRAINT 였으므로
--      DROP INDEX 가 아니라 ALTER TABLE ... DROP CONSTRAINT 로 삭제하도록 수정!
--   2. 또한 "정말 이 CONSTRAINT 지워도 괜찮나?" 를 사용자에게 선택권 주기 위해
--      CASE 별로 주석 분리
-- ==================================================================================

-- ----------------------------------------------------------------------------------
-- 🗑️ 1. code_parts 에서 (group_key, code) 동일 컬럼 중복 2개 삭제
--   남길것: code_parts_group_code_uq
--   지울것: code_parts_group_code_uidx, idx_code_parts_color (컬럼 100% 동일)
-- ----------------------------------------------------------------------------------
DROP INDEX IF EXISTS public.code_parts_group_code_uidx;
DROP INDEX IF EXISTS public.idx_code_parts_color;


-- ----------------------------------------------------------------------------------
-- 🗑️ 2. employee_schedules: (employee_id, work_date) 중복
--   남길것: idx_employee_schedules_emp_date_unique (UNIQUE CONSTRAINT 라 가정)
--   지울것: idx_employee_schedules_employee_date
-- ----------------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_employee_schedules_employee_date;


-- ----------------------------------------------------------------------------------
-- 🗑️ 3. erro_stock: code 관련 정리 (여기가 오류났던 부분!)
-- ----------------------------------------------------------------------------------
--
-- ⚠️ ★★ 매우 중요! 사용자 선택이 필요합니다! ★★
--
-- CASE 1. (기본 추천!)  "같은 상품코드로 재고 오류가 여러 번 생길 수 있음" → UNIQUE 규칙이 잘못된 것!
--         아래 [Case 1] 두줄 주석 제거하고 실행
--
-- CASE 2. (절대 보수) "한 상품에는 재고오류 1개만 기록한다" 가 규칙이면 UNIQUE 유지!
--         아래 [Case 1] 은 절대 실행하지 말고 그냥 PASS!
--

/* [Case 1 - 추천!] 잘못된 UNIQUE 규칙 삭제 실행
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name   = 'erro_stock'
          AND constraint_name = 'erro_stock_code_unique'
    ) THEN
        ALTER TABLE public.erro_stock DROP CONSTRAINT erro_stock_code_unique;
        RAISE NOTICE '✅ erro_stock_code_unique (UNIQUE 잘못된 규칙) 삭제 성공!';
    ELSE
        RAISE NOTICE 'ℹ️  erro_stock_code_unique 는 이미 삭제된 상태';
    END IF;
END $$;
*/

-- [Case 2 (공통)] erro_stock_unresolved_code_idx : partial INDEX라 query planner가 거의 안씀 → 그냥 INDEX라 DROP 가능!
DROP INDEX IF EXISTS public.erro_stock_unresolved_code_idx;


-- ----------------------------------------------------------------------------------
-- 🗑️ 4. guide_point_ledger: sale_group_id 단독 인덱스 중복
-- ----------------------------------------------------------------------------------
DROP INDEX IF EXISTS public.guide_point_ledger_sale_group_idx;


-- ----------------------------------------------------------------------------------
-- 🗑️ 5. refunds: sale_id 단독 인덱스 중복
--   refunds_sale_id_unique (UNIQUE INDEX) 가 이미 있으므로 일반 INDEX는 불필요
-- ----------------------------------------------------------------------------------
DROP INDEX IF EXISTS public.refunds_sale_id_idx;


-- ----------------------------------------------------------------------------------
-- 🗑️ 6. sales: sale_group_id 중복 인덱스 2개 정리
--   남길것: sales_sale_group_id_sold_at_idx (복합 인덱스, prefix로 단독검색도 처리)
--   지울것:
--     ① sales_sale_group_id_idx (단독)
--     ② idx_sales_unsettled (단독, ①과 100% 동일)
-- ----------------------------------------------------------------------------------
DROP INDEX IF EXISTS public.sales_sale_group_id_idx;
DROP INDEX IF EXISTS public.idx_sales_unsettled;


-- ----------------------------------------------------------------------------------
-- 🔍 최종 검증: 주요 테이블의 인덱스가 깔끔해졌는지 확인
-- ----------------------------------------------------------------------------------
SELECT
    schemaname AS schema_name,
    tablename  AS table_name,
    indexname  AS index_name,
    CASE WHEN indexdef LIKE '%UNIQUE%' THEN 'UNIQUE/제약'
         WHEN indexdef LIKE '%PRIMARY KEY%' THEN 'PK'
         ELSE '일반 INDEX'
    END AS index_type,
    indexdef   AS definition
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
      'code_parts',
      'employee_schedules',
      'erro_stock',
      'guide_point_ledger',
      'refunds',
      'sales'
  )
ORDER BY tablename, indexname;
