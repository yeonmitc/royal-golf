-- ==================================================================================
-- 🚀 [One-Shot Rename v3! ✅ 100% FK CASCADE 유지!] 상품 코드 3개 일괄 변경
--
--   v1 실패 원인 : sales.code UPDATE → trg_sales_recalc_commission (고아 sale_group_id)
--                 → P0001 EXCEPTION → 전체 롤백
--   v2 실패 원인 : session_replication_role = replica 는
--                 "FK CASCADE 내부 시스템 트리거" 까지 모조리 꺼버려서
--                 products.code 만 바뀌고 sales/inventories code는 안바뀜! 💀
--
--   ✅ v3 FIX 방식 (개별 USER 트리거만 DISABLE! FK CASCADE 는 정상 유지!)
--     1. ALTER TABLE sales DISABLE TRIGGER [문제트리거이름] 으로
--        - trg_sales_recalc (커미션 재계산 / P0001 원인)
--        - trg_sales_apply_stock_on_insert (재고차감 / 코드변경과 무관)
--        - trg_sales_restore_stock_on_refund (재고복구 / 코드변경과 무관)
--        → 3개의 "USER 트리거"만 개별로 끔!
--     2. products.code UPDATE 3회 실행 → 🔥 FK ON UPDATE CASCADE 는 정상 작동!
--        → sales / inventories / erro_stock / code_parts 전부 따라 바뀜!
--     3. ALTER TABLE sales ENABLE TRIGGER [이름들] → 트리거 3개 다시 복구!
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
    -- 🔒 STEP 0. 문제를 일으키는 sales의 USER 트리거 3개만 개별 비활성화!
    --    (FK CASCADE 제약은 시스템 트리거라 절대 꺼지지 않음! → 정상 작동!)
    -- ======================================================================
    ALTER TABLE public.sales DISABLE TRIGGER trg_sales_recalc;
    ALTER TABLE public.sales DISABLE TRIGGER trg_sales_apply_stock_on_insert;
    ALTER TABLE public.sales DISABLE TRIGGER trg_sales_restore_stock_on_refund;
    RAISE NOTICE '🔒 [Step 0/4] sales 테이블 문제 트리거 3개 DISABLE 성공 (FK CASCADE는 그대로!)';


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
        RAISE NOTICE '✅ [1/3] % → % 변경 성공! (products %건 → FK CASCADE 로 sales/inventories 자동 변경!)', v_old, v_new, v_cnt;
    ELSIF v_exists_old AND v_exists_new THEN
        RAISE WARNING '⚠️  [1/3] old/new 코드가 둘다 존재합니다! 충돌로 SKIP!', v_old, v_new;
    ELSE
        RAISE WARNING '⚠️  [1/3] old 코드(%) 가 products에 없습니다! SKIP!', v_old;
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
        RAISE NOTICE '✅ [2/3] % → % 변경 성공! (products %건 → FK CASCADE 로 자식테이블 자동 변경!)', v_old, v_new, v_cnt;
    ELSIF v_exists_old AND v_exists_new THEN
        RAISE WARNING '⚠️  [2/3] old/new 코드가 둘다 존재합니다! 충돌로 SKIP!', v_old, v_new;
    ELSE
        RAISE WARNING '⚠️  [2/3] old 코드(%) 가 products에 없습니다! SKIP!', v_old;
    END IF;


    -- ======================================================================
    -- 🔹 Case 3. GA-GG-FJ-WH-02 → GW-FJ-WH-02
    --   ※ 사용자 요청 그대로! GW- 시작 / 중간 GG 빠진 5마디 코드!
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
        RAISE NOTICE '✅ [3/3] % → % 변경 성공! (products %건 → FK CASCADE 로 자식테이블 자동 변경!)', v_old, v_new, v_cnt;
    ELSIF v_exists_old AND v_exists_new THEN
        RAISE WARNING '⚠️  [3/3] old/new 코드가 둘다 존재합니다! 충돌로 SKIP!', v_old, v_new;
    ELSE
        RAISE WARNING '⚠️  [3/3] old 코드(%) 가 products에 없습니다! SKIP!', v_old;
    END IF;


    -- ======================================================================
    -- 🔓 STEP 4. 트리거 3개 100% 다시 활성화! (절대 빼먹지 않음!)
    -- ======================================================================
    ALTER TABLE public.sales ENABLE TRIGGER trg_sales_recalc;
    ALTER TABLE public.sales ENABLE TRIGGER trg_sales_apply_stock_on_insert;
    ALTER TABLE public.sales ENABLE TRIGGER trg_sales_restore_stock_on_refund;
    RAISE NOTICE '🔓 [Step 4/4] sales 트리거 3개 복구 완료! (이제 판매등록/환불시 정상 작동!)';
END $$;


-- ==================================================================================
-- 🔍 [검증 1/2] products 테이블 코드 변경 확인
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
-- 🔍 [검증 2/2] 자식 테이블 전부 Code가 잘 따라 바뀌었는지 Cross Check!
--   ✅ 성공 기준:
--     - OLD_사라졌어야_함 row_count = 전부 0!
--     - NEW_있어야_함 row_count = 실제 건수 (sales는 44 / 114 / 18, inventories는 1/1/1)
-- ==================================================================================
SELECT
    '[검증 2/2] 자식 테이블 별 old/new 코드 카운트 (FK CASCADE 제대로 작동!)' AS section,
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

    UNION ALL
    SELECT 'code_parts'   AS child_table, 'OLD_사라졌어야_함' AS check_type, code AS code_check, COUNT(*) AS row_count
    FROM public.code_parts   WHERE code IN ('GA-GG-FJ-BK-01','GA-GG-FJ-WH-01','GA-GG-FJ-WH-02') GROUP BY 1,2,3
    UNION ALL
    SELECT 'code_parts'   AS child_table, 'NEW_있어야_함'     AS check_type, code AS code_check, COUNT(*) AS row_count
    FROM public.code_parts   WHERE code IN ('GM-GG-FJ-BK-01','GM-GG-FJ-WH-01','GW-FJ-WH-02') GROUP BY 1,2,3
) t
ORDER BY child_table, check_type, code_check;
