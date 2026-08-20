DO $$
DECLARE
    v_old text;
    v_new text;
    v_exists_old boolean;
    v_exists_new boolean;
    v_cnt integer;
    v_msg text;
BEGIN
    ALTER TABLE public.sales DISABLE TRIGGER trg_sales_recalc;
    ALTER TABLE public.sales DISABLE TRIGGER trg_sales_apply_stock_on_insert;
    ALTER TABLE public.sales DISABLE TRIGGER trg_sales_restore_stock_on_refund;
    RAISE NOTICE '%', '🔒 [Step 0/4] sales 테이블 문제 트리거 3개 DISABLE 성공 (FK CASCADE는 그대로!)';

    -- 1/3
    v_old := 'GA-GG-FJ-BK-01';
    v_new := 'GM-GG-FJ-BK-01';
    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_old) INTO v_exists_old;
    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_new) INTO v_exists_new;
    IF NOT v_exists_old AND v_exists_new THEN
        v_msg := 'ℹ️  [1/3] ' || v_old || ' → ' || v_new || ' : 이미 변경 완료된 상태! SKIP!';
        RAISE NOTICE '%', v_msg;
    ELSIF v_exists_old AND NOT v_exists_new THEN
        UPDATE public.products SET code = v_new WHERE code = v_old;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
        v_msg := '✅ [1/3] ' || v_old || ' → ' || v_new || ' 변경 성공! (products 영향: ' || v_cnt || '건 → FK CASCADE 로 자동 변경!)';
        RAISE NOTICE '%', v_msg;
    ELSIF v_exists_old AND v_exists_new THEN
        v_msg := '⚠️  [1/3] old=' || v_old || ' / new=' || v_new || ' 둘다 존재! 충돌 SKIP!';
        RAISE WARNING '%', v_msg;
    ELSE
        v_msg := '⚠️  [1/3] old 코드 ' || v_old || ' 가 products에 없습니다. SKIP!';
        RAISE WARNING '%', v_msg;
    END IF;

    -- 2/3
    v_old := 'GA-GG-FJ-WH-01';
    v_new := 'GM-GG-FJ-WH-01';
    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_old) INTO v_exists_old;
    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_new) INTO v_exists_new;
    IF NOT v_exists_old AND v_exists_new THEN
        v_msg := 'ℹ️  [2/3] ' || v_old || ' → ' || v_new || ' : 이미 변경 완료된 상태! SKIP!';
        RAISE NOTICE '%', v_msg;
    ELSIF v_exists_old AND NOT v_exists_new THEN
        UPDATE public.products SET code = v_new WHERE code = v_old;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
        v_msg := '✅ [2/3] ' || v_old || ' → ' || v_new || ' 변경 성공! (products 영향: ' || v_cnt || '건 → FK CASCADE 로 자동 변경!)';
        RAISE NOTICE '%', v_msg;
    ELSIF v_exists_old AND v_exists_new THEN
        v_msg := '⚠️  [2/3] old=' || v_old || ' / new=' || v_new || ' 둘다 존재! 충돌 SKIP!';
        RAISE WARNING '%', v_msg;
    ELSE
        v_msg := '⚠️  [2/3] old 코드 ' || v_old || ' 가 products에 없습니다. SKIP!';
        RAISE WARNING '%', v_msg;
    END IF;

    -- 3/3
    v_old := 'GA-GG-FJ-WH-02';
    v_new := 'GW-FJ-WH-02';
    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_old) INTO v_exists_old;
    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_new) INTO v_exists_new;
    IF NOT v_exists_old AND v_exists_new THEN
        v_msg := 'ℹ️  [3/3] ' || v_old || ' → ' || v_new || ' : 이미 변경 완료된 상태! SKIP!';
        RAISE NOTICE '%', v_msg;
    ELSIF v_exists_old AND NOT v_exists_new THEN
        UPDATE public.products SET code = v_new WHERE code = v_old;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
        v_msg := '✅ [3/3] ' || v_old || ' → ' || v_new || ' 변경 성공! (products 영향: ' || v_cnt || '건 → FK CASCADE 로 자동 변경!)';
        RAISE NOTICE '%', v_msg;
    ELSIF v_exists_old AND v_exists_new THEN
        v_msg := '⚠️  [3/3] old=' || v_old || ' / new=' || v_new || ' 둘다 존재! 충돌 SKIP!';
        RAISE WARNING '%', v_msg;
    ELSE
        v_msg := '⚠️  [3/3] old 코드 ' || v_old || ' 가 products에 없습니다. SKIP!';
        RAISE WARNING '%', v_msg;
    END IF;

    ALTER TABLE public.sales ENABLE TRIGGER trg_sales_recalc;
    ALTER TABLE public.sales ENABLE TRIGGER trg_sales_apply_stock_on_insert;
    ALTER TABLE public.sales ENABLE TRIGGER trg_sales_restore_stock_on_refund;
    RAISE NOTICE '%', '🔓 [Step 4/4] sales 트리거 3개 복구 완료! (이제 판매등록/환불시 정상 작동!)';
END $$;

SELECT
    '[검증 1/2] products 테이블 변경 후 상태' AS section,
    check_type,
    code
FROM (
    SELECT 'OLD_사라졌어야_함' AS check_type, code FROM public.products WHERE code IN (
        'GA-GG-FJ-BK-01','GA-GG-FJ-WH-01','GA-GG-FJ-WH-02'
    )
    UNION ALL
    SELECT 'NEW_있어야_함'     AS check_type, code FROM public.products WHERE code IN (
        'GM-GG-FJ-BK-01','GM-GG-FJ-WH-01','GW-FJ-WH-02'
    )
) t
ORDER BY check_type, code;

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
