-- ==================================================================================
-- 🧹 [최종 v4! 100% 구문오류 FIX] 20260820_cleanup_duplicate_indexes_final_touch.sql
--
-- ✅ 수정: DO $$ 블록 밖에서 RAISE NOTICE 를 써서 42601 에러 났었음 → 전부 DO $$ 블록 안으로 통합!
-- ==================================================================================

DO $$
BEGIN
    -- ------------------------------------------------------------------------------
    -- 🗑️ 1. refunds.sale_id 중복 INDEX 삭제
    --    refunds_sale_id_unique (UNIQUE) 가 이미 있으므로, idx_refunds_sale_id (일반) 는 불필요!
    -- ------------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname='public' AND tablename='refunds' AND indexname='idx_refunds_sale_id'
    ) THEN
        EXECUTE 'DROP INDEX public.idx_refunds_sale_id';
        RAISE NOTICE '✅ idx_refunds_sale_id (refunds.sale_id 일반 INDEX 중복) 삭제 완료';
    ELSE
        RAISE NOTICE 'ℹ️  idx_refunds_sale_id 는 이미 삭제된 상태';
    END IF;

    -- ------------------------------------------------------------------------------
    -- 🗑️ 2. (옵션!) erro_stock.code 의 잘못된 UNIQUE 규칙 삭제
    --   기본 OFF! 필요시 아래 IF 블록 주석 제거 후 실행
    -- ------------------------------------------------------------------------------
    -- IF EXISTS (
    --     SELECT 1 FROM information_schema.table_constraints
    --     WHERE table_schema='public' AND table_name='erro_stock' AND constraint_name='erro_stock_code_unique'
    -- ) THEN
    --     EXECUTE 'ALTER TABLE public.erro_stock DROP CONSTRAINT erro_stock_code_unique';
    --     RAISE NOTICE '✅ erro_stock_code_unique (UNIQUE 제약) 삭제 완료';
    -- ELSE
    --     RAISE NOTICE 'ℹ️  erro_stock_code_unique 는 이미 삭제됨';
    -- END IF;

    -- ------------------------------------------------------------------------------
    -- 🗑️ 3. (옵션!) employee_schedules.work_date 단독 INDEX 삭제
    --   기본 OFF! 필요시 아래 IF 블록 주석 제거 후 실행
    -- ------------------------------------------------------------------------------
    -- IF EXISTS (
    --     SELECT 1 FROM pg_indexes
    --     WHERE schemaname='public' AND tablename='employee_schedules' AND indexname='idx_employee_schedules_work_date'
    -- ) THEN
    --     EXECUTE 'DROP INDEX public.idx_employee_schedules_work_date';
    --     RAISE NOTICE '✅ idx_employee_schedules_work_date 삭제 완료';
    -- END IF;

    RAISE NOTICE '';
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '  ✅ Index 중복 정리 마무리 성공!';
    RAISE NOTICE '     - refunds.sale_id 일반 INDEX 중복 해소';
    RAISE NOTICE '========================================================================';
END $$;


-- ----------------------------------------------------------------------------------
-- 🔍 마지막 최종 검증 (깔끔해진 INDEX 개수 집계)
-- ----------------------------------------------------------------------------------
SELECT
    tablename  AS table_name,
    count(*)   AS total_index_cnt,
    sum(CASE WHEN indexdef LIKE '%UNIQUE%' OR indexdef LIKE '%PRIMARY KEY%' THEN 1 ELSE 0 END) AS pk_unique_cnt,
    sum(CASE WHEN indexdef LIKE '%UNIQUE%' OR indexdef LIKE '%PRIMARY KEY%' THEN 0 ELSE 1 END) AS normal_index_cnt
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('code_parts','employee_schedules','erro_stock','guide_point_ledger','refunds','sales')
GROUP BY tablename
ORDER BY tablename;
