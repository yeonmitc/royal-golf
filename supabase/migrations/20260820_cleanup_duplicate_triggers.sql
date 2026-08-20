-- ==================================================================================
-- 🧹 20260820_cleanup_duplicate_triggers.sql
--
-- Supabase Triggers 목록에서 발견된 **완전 중복 트리거 3개** 일괄 삭제
-- 같은 함수를 같은 테이블 + 같은 이벤트에 2번 부착해서 2번씩 실행되는 문제 방지
-- ==================================================================================

-- ----------------------------------------------------------------------------------
-- 🗑️ [1/3] inventories_set_total_qty 삭제
--       → trg_inv_set_total_qty 와 완전 중복
--         (동일 테이블=inventories, 동일 함수=set_inventory_total_qty,
--          동일 이벤트=BEFORE INSERT,BEFORE UPDATE OF s/m/l/xl/2xl/3xl/free)
-- ----------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS inventories_set_total_qty ON public.inventories;


-- ----------------------------------------------------------------------------------
-- 🗑️ [2/3] trg_sync_products_qty 삭제
--       → trg_inv_sync_products_qty 와 완전 중복
--         (동일 테이블=inventories, 동일 함수=sync_products_qty_from_inventories,
--          동일 이벤트=AFTER INSERT,AFTER UPDATE OF total_qty)
--       💥 이게 가장 위험! inventories 수정시 products.qty 가 2배로 더해지는 버그 유발 가능
-- ----------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sync_products_qty ON public.inventories;


-- ----------------------------------------------------------------------------------
-- 🗑️ [3/3] 이름이 잘린 enforce_free_gift 중복 트리거 삭제
--       Supabase UI 에서는 이름이 "trg_sales_enforce_free_gift_..." 로 잘려보이지만,
--       우리 마이그레이션 파일 기준으로는 구버전 트리거명을 전체 후보에 적어서 안전하게 DROP
-- ----------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sales_enforce_free_gift_old ON public.sales;
DROP TRIGGER IF EXISTS trg_sales_enforce_free_gift_v1 ON public.sales;
DROP TRIGGER IF EXISTS trg_sales_enforce_free_gift_legacy ON public.sales;
-- 혹시 구버전 마이그레이션에서 이름 규칙 다르게 만든게 있을수 있으니 모조리 DROP (실제로 존재하는 것만 IF EXISTS 로 지움)
-- ※ 신규 표준 트리거 trg_sales_enforce_free_gift 는 절대 삭제되지 않으니 안심!


-- ----------------------------------------------------------------------------------
-- 🔍 최종 검증: inventories / sales 테이블의 현재 트리거 목록 조회
--    중복이 사라졌는지 직접 확인
-- ----------------------------------------------------------------------------------
SELECT
    event_object_table    AS table_name,
    trigger_name          AS trigger_name,
    event_manipulation    AS event,
    action_timing         AS timing,
    action_statement      AS function_call
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('inventories', 'sales', 'erro_stock')
ORDER BY event_object_table, trigger_name;
