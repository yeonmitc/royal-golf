-- ==================================================================================
-- 🧹 [최종!] 20260820_cleanup_duplicate_triggers_final_touch.sql
--   Triggers 청소 마무리: 남은 1개 중복 trg_sales_enforce_free_gift_price_zero 삭제
--
-- ✅ 확인 결과:
--   - inventories_set_total_qty      → 이미 삭제 성공 (trg_inv_set_total_qty 1개만 남음)
--   - trg_sync_products_qty          → 이미 삭제 성공 (trg_inv_sync_products_qty 1개만 남음)
--   - trg_sales_enforce_free_gift_price_zero → ❗ 아직 남아있음. 지금 삭제!
-- ==================================================================================

-- ----------------------------------------------------------------------------------
-- 🗑️ 유일하게 남은 중복 트리거 삭제
--    trg_sales_enforce_free_gift 와 완전 중복 (동일 테이블, 동일 함수, 동일 INSERT/UPDATE BEFORE 이벤트)
--    → gift price=0 ↔ free_gift=true 동기화가 2번 실행되던 버그 원인!
-- ----------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sales_enforce_free_gift_price_zero ON public.sales;


-- ----------------------------------------------------------------------------------
-- 🔍 최종 검증: sales 테이블의 enforce_free_gift 트리거가 1개만 남았는지 확인
-- ----------------------------------------------------------------------------------
DO $$
DECLARE
    v_cnt integer;
BEGIN
    SELECT count(*) INTO v_cnt
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND event_object_table = 'sales'
      AND trigger_name LIKE '%enforce_free_gift%';
    IF v_cnt = 1 THEN
        RAISE NOTICE '✅ sales에 enforce_free_gift 트리거가 정상적으로 1개만 남음! 성공.';
    ELSIF v_cnt = 0 THEN
        RAISE WARNING '⚠️  sales에 enforce_free_gift 트리거가 0개! gift 동기화가 안됨!';
    ELSE
        RAISE WARNING '⚠️  sales에 enforce_free_gift 트리거가 여전히 %개 남음. 중복!', v_cnt;
    END IF;
END $$;

SELECT
    event_object_table    AS table_name,
    trigger_name,
    event_manipulation    AS event,
    action_timing         AS timing,
    action_statement      AS function_call
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('inventories','sales','erro_stock')
ORDER BY event_object_table, trigger_name, event_manipulation;
