-- ==================================================================================
-- 🚀 [One-Shot] 특정 상품 코드 3개 일괄 변경 (FK CASCADE 로 전 테이블 자동 동기화!)
--   사용자 요청:
--     1) GA-GG-FJ-BK-01 → GM-GG-FJ-BK-01
--     2) GA-GG-FJ-WH-01 → GM-GG-FJ-WH-01
--     3) GA-GG-FJ-WH-02 → GW-FJ-WH-02  (※ GW- 로 시작 / GG 빠짐. 사용자 요청 그대로 적용!)
--   특징:
--     - 멱등성 보장: 이미 바꼈거나 (old_code 없거나 / new_code 이미 있으면) SKIP + NOTICE
--     - FK ON UPDATE CASCADE 로 인해 자동으로 아래 테이블 code 컬럼 전부 같이 바뀜!
--       → public.sales, public.inventories, public.erro_stock, public.code_parts
-- ==================================================================================

DO $$
DECLARE
    v_old text;
    v_new text;
    v_exists_old boolean;
    v_exists_new boolean;
    v_cnt integer;
BEGIN
    -- ──────────────────────────────────────────────────────────────────────────
    -- 🔹 Case 1. GA-GG-FJ-BK-01 → GM-GG-FJ-BK-01
    -- ──────────────────────────────────────────────────────────────────────────
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
        RAISE WARNING '⚠️  [1/3] old_code(%) 도 존재하고 new_code(%) 도 존재합니다! 충돌로 SKIP! 둘 중 하나를 먼저 다른 코드로 바꾸세요.', v_old, v_new;
    ELSE
        RAISE WARNING '⚠️  [1/3] old_code(%) 가 존재하지 않습니다! SKIP!', v_old;
    END IF;


    -- ──────────────────────────────────────────────────────────────────────────
    -- 🔹 Case 2. GA-GG-FJ-WH-01 → GM-GG-FJ-WH-01
    -- ──────────────────────────────────────────────────────────────────────────
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
        RAISE WARNING '⚠️  [2/3] old_code(%) 도 존재하고 new_code(%) 도 존재합니다! 충돌로 SKIP! 둘 중 하나를 먼저 다른 코드로 바꾸세요.', v_old, v_new;
    ELSE
        RAISE WARNING '⚠️  [2/3] old_code(%) 가 존재하지 않습니다! SKIP!', v_old;
    END IF;


    -- ──────────────────────────────────────────────────────────────────────────
    -- 🔹 Case 3. GA-GG-FJ-WH-02 → GW-FJ-WH-02
    --   ※ 주의! 사용자 요청대로 GW- 로 시작하고 중간 GG 가 빠진 코드로 적용!
    --      (원래 코드가 6마디였는데 바꿀 코드는 5마디 → GW-FJ-WH-02)
    -- ──────────────────────────────────────────────────────────────────────────
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
        RAISE WARNING '⚠️  [3/3] old_code(%) 도 존재하고 new_code(%) 도 존재합니다! 충돌로 SKIP! 둘 중 하나를 먼저 다른 코드로 바꾸세요.', v_old, v_new;
    ELSE
        RAISE WARNING '⚠️  [3/3] old_code(%) 가 존재하지 않습니다! SKIP!', v_old;
    END IF;
END $$;


-- ==================================================================================
-- 🔍 [검증 Step 1/2] products 테이블에서 3개 코드가 잘 바뀌었는지 확인
--   (new code 3개가 products 테이블에 이제 존재하고, old code 3개는 더이상 없어야 함!)
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
-- 🔍 [검증 Step 2/2] 모든 자식 테이블 (sales / inventories / erro_stock / code_parts)
--   에서 old code 는 0건 이고, new code 는 자동으로 바뀌어서 잘 나오는지 Cross Check!
-- ==================================================================================
SELECT
    '[검증 2/2] 자식 테이블 별 old/new 코드 카운트 (FK CASCADE 잘 되었는지 확인)' AS section,
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
