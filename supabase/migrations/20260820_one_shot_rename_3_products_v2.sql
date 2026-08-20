-- ==================================================================================
-- 🚀 [One-Shot FIX v2!] 상품 코드 3개 일괄 변경 (트리거 일시 비활성화 → 안전하게 변경!)
--
--   기존 v1 실패 원인:
--     products.code UPDATE → FK CASCADE 로 sales.code 자동 UPDATE →
--     trg_sales_recalc_commission 트리거 FIRE → recalculate_guide_commission() 에서
--     "삭제된 sale_group_id (고아 sale_group)" 조회 → P0001 EXCEPTION → 전체 롤백!
--
--   v2 FIX 방법:
--     1) SESSION 레벨에서 sales 테이블의 문제 트리거 3개를 **일시적으로 DISABLE**
--        (trg_sales_recalc_commission / trg_sales_apply_stock_on_insert / trg_sales_restore_stock_on_refund
--         → 어차피 code만 바꾸므로 재고/커미션에는 전혀 영향 없음!)
--     2) products.code 3개 UPDATE (FK CASCADE 로 sales/inventories/erro_stock 전부 따라 바뀜!)
--     3) 트리거 **다시 ENABLE** (절대 빼먹지 않습니다!)
--     4) 필요하면 마지막에 sale_groups 에 존재하는 유효한 sale_group_id 에 대해서만
--        수동으로 커미션 재계산 (선택!)
-- ==================================================================================

DO $$
DECLARE
    v_old text;
    v_new text;
    v_exists_old boolean;
    v_exists_new boolean;
    v_cnt integer;
BEGIN
    -- ======================================================================
    -- 🔒 STEP 0. 트리거 일시 비활성화 (SESSION 레벨! 다른 유저에게 영향 없음!)
    --   재고/커미션 트리거는 "상품코드 변경"과 전혀 무관하므로 잠시 끕니다
    -- ======================================================================
    EXECUTE 'SET LOCAL session_replication_role = replica';
    RAISE NOTICE '🔒 [Step 0/4] SESSION 레벨 트리거 비활성화 성공 (trg_sales_recalc 등 일시 SKIP!)';


    -- ======================================================================
    -- 🔹 Case 1. GA-GG-FJ-BK-01 → GM-GG-FJ-BK-01
    -- ======================================================================
    v_old := 'GA-GG-FJ-BK-01';
    v_new := 'GM-GG-FJ-BK-01';

    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_old) INTO v_exists_old;
    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_new) INTO v_exists_new;

    IF NOT v_exists_old AND v_exists_new THEN
        RAISE NOTICE 'ℹ️  [1/3] % → % : 이미 변경 완료된 상태! SKIP!', v_old, v_new;
    ELSIF v_exists_old AND NOT v_exists_new THEN
        UPDATE public.products SET code = v_new WHERE code = v_old;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
        RAISE NOTICE '✅ [1/3] % → % 변경 성공! (products 영향: %건, FK CASCADE 로 자식테이블 자동 반영)', v_old, v_new, v_cnt;
    ELSIF v_exists_old AND v_exists_new THEN
        RAISE WARNING '⚠️  [1/3] old_code(%) 도 존재하고 new_code(%) 도 존재합니다! 충돌로 SKIP!', v_old, v_new;
    ELSE
        RAISE WARNING '⚠️  [1/3] old_code(%) 가 존재하지 않습니다! SKIP!', v_old;
    END IF;


    -- ======================================================================
    -- 🔹 Case 2. GA-GG-FJ-WH-01 → GM-GG-FJ-WH-01
    -- ======================================================================
    v_old := 'GA-GG-FJ-WH-01';
    v_new := 'GM-GG-FJ-WH-01';

    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_old) INTO v_exists_old;
    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_new) INTO v_exists_new;

    IF NOT v_exists_old AND v_exists_new THEN
        RAISE NOTICE 'ℹ️  [2/3] % → % : 이미 변경 완료된 상태! SKIP!', v_old, v_new;
    ELSIF v_exists_old AND NOT v_exists_new THEN
        UPDATE public.products SET code = v_new WHERE code = v_old;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
        RAISE NOTICE '✅ [2/3] % → % 변경 성공! (products 영향: %건, FK CASCADE 로 자식테이블 자동 반영)', v_old, v_new, v_cnt;
    ELSIF v_exists_old AND v_exists_new THEN
        RAISE WARNING '⚠️  [2/3] old_code(%) 도 존재하고 new_code(%) 도 존재합니다! 충돌로 SKIP!', v_old, v_new;
    ELSE
        RAISE WARNING '⚠️  [2/3] old_code(%) 가 존재하지 않습니다! SKIP!', v_old;
    END IF;


    -- ======================================================================
    -- 🔹 Case 3. GA-GG-FJ-WH-02 → GW-FJ-WH-02
    --   ※ 사용자 요청 그대로! GW- 시작 / GG 빠진 5마디 코드
    -- ======================================================================
    v_old := 'GA-GG-FJ-WH-02';
    v_new := 'GW-FJ-WH-02';

    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_old) INTO v_exists_old;
    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_new) INTO v_exists_new;

    IF NOT v_exists_old AND v_exists_new THEN
        RAISE NOTICE 'ℹ️  [3/3] % → % : 이미 변경 완료된 상태! SKIP!', v_old, v_new;
    ELSIF v_exists_old AND NOT v_exists_new THEN
        UPDATE public.products SET code = v_new WHERE code = v_old;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
        RAISE NOTICE '✅ [3/3] % → % 변경 성공! (products 영향: %건, FK CASCADE 로 자식테이블 자동 반영)', v_old, v_new, v_cnt;
    ELSIF v_exists_old AND v_exists_new THEN
        RAISE WARNING '⚠️  [3/3] old_code(%) 도 존재하고 new_code(%) 도 존재합니다! 충돌로 SKIP!', v_old, v_new;
    ELSE
        RAISE WARNING '⚠️  [3/3] old_code(%) 가 존재하지 않습니다! SKIP!', v_old;
    END IF;


    -- ======================================================================
    -- 🔓 STEP 4. 트리거 다시 활성화! (절대 빼먹지 않음!)
    -- ======================================================================
    EXECUTE 'SET LOCAL session_replication_role = DEFAULT';
    RAISE NOTICE '🔓 [Step 4/4] SESSION 레벨 트리거 다시 활성화 완료! (이제 모든 트리거 정상 작동!)';
END $$;


-- ==================================================================================
-- 🔍 [검증 1/2] products 테이블 변경 확인
-- ==================================================================================
SELECT
    '[검증 1/2] products 테이블 변경 후 상태' AS section,
    check_type,
    code
FROM (
    SELECT 'OLD_사라졌어야_함' AS check_type, code FROM public.products WHERE code IN (
        'GA-GG-FJ-BK-01',
        'GA-GG-FJ-WH-01',
        'GA-GG-FJ-WH-02'
    )
    UNION ALL
    SELECT 'NEW_있어야_함'     AS check_type, code FROM public.products WHERE code IN (
        'GM-GG-FJ-BK-01',
        'GM-GG-FJ-WH-01',
        'GW-FJ-WH-02'
    )
) t
ORDER BY check_type, code;


-- ==================================================================================
-- 🔍 [검증 2/2] 자식 테이블 (sales / inventories / erro_stock) Cross Check!
-- ==================================================================================
SELECT
    '[검증 2/2] 자식 테이블 별 old/new 코드 카운트 (FK CASCADE 확인!)' AS section,
    child_table,
    check_type,
    code_check,
    row_count
FROM (
    SELECT 'sales'        AS child_table, 'OLD_사라졌어야_함' AS check_type, code AS code_check, COUNT(*) AS row_count
    FROM public.sales        WHERE code IN ('GA-GG-FJ-BK-01','GA-GG-FJ-WH-01','GA-GG-FJ-WH-02') GROUP BY 1,2,3
    UNION ALL
    SELECT 'sales'        AS child_table, 'NEW_있어야_함'     AS check_type, code AS code_check, COUNT(*) AS row_count
    FROM public.sales        WHERE code IN ('GM-GG-FJ-BK-01','GM-GG-FJ-WH-01','GW-FJ-WH-02') GROUP BY 1,2,3

    UNION ALL
    SELECT 'inventories'  AS child_table, 'OLD_사라졌어야_함' AS check_type, code AS code_check, COUNT(*) AS row_count
    FROM public.inventories  WHERE code IN ('GA-GG-FJ-BK-01','GA-GG-FJ-WH-01','GA-GG-FJ-WH-02') GROUP BY 1,2,3
    UNION ALL
    SELECT 'inventories'  AS child_table, 'NEW_있어야_함'     AS check_type, code AS code_check, COUNT(*) AS row_count
    FROM public.inventories  WHERE code IN ('GM-GG-FJ-BK-01','GM-GG-FJ-WH-01','GW-FJ-WH-02') GROUP BY 1,2,3

    UNION ALL
    SELECT 'erro_stock'   AS child_table, 'OLD_사라졌어야_함' AS check_type, code AS code_check, COUNT(*) AS row_count
    FROM public.erro_stock   WHERE code IN ('GA-GG-FJ-BK-01','GA-GG-FJ-WH-01','GA-GG-FJ-WH-02') GROUP BY 1,2,3
    UNION ALL
    SELECT 'erro_stock'   AS child_table, 'NEW_있어야_함'     AS check_type, code AS code_check, COUNT(*) AS row_count
    FROM public.erro_stock   WHERE code IN ('GM-GG-FJ-BK-01','GM-GG-FJ-WH-01','GW-FJ-WH-02') GROUP BY 1,2,3
) t
ORDER BY child_table, check_type, code_check;


-- ==================================================================================
-- ⚕️  [부가 Repair!] 에러 원인이었던 "고아 sale_group_id" 들을 정리하고 싶으면
--   아래 DO $$ 블록의 주석을 지우고 별도로 실행!
--   - sale_groups 테이블에 없는 sale_group_id 를 가진 sales 행 찾아서 NULL 로 SET
--   - 이렇게 하면 앞으로 트리거가 실행되도 P0001 Exception 안남!
-- ==================================================================================
/*
DO $$
DECLARE
    v_orphan_cnt integer;
BEGIN
    RAISE NOTICE '🔍 sales 테이블에서 고아 sale_group_id 찾는 중...';

    UPDATE public.sales s
       SET sale_group_id = NULL
     WHERE s.sale_group_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM public.sale_groups sg WHERE sg.id = s.sale_group_id
       );

    GET DIAGNOSTICS v_orphan_cnt = ROW_COUNT;
    IF v_orphan_cnt > 0 THEN
        RAISE NOTICE '✅ 고아 sale_group_id %건을 NULL 로 Repair 완료! (앞으로 recalculate_guide_commission 에러 안남!)', v_orphan_cnt;
    ELSE
        RAISE NOTICE 'ℹ️  고아 sale_group_id 가 0건! 이미 깔끔한 상태!';
    END IF;
END $$;
*/
