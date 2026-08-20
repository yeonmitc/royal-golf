-- ==================================================================================
-- 🔄 [Step 1] 원상복구 SQL!
--   v2 session_replication_role 방식은 FK CASCADE 까지 막아서 자식테이블 code가 안바뀜.
--   → products 테이블 코드를 먼저 원래대로 (GA-GG-FJ-...) 로 되돌려 놓는 작업!
--   → 자식테이블은 아직 OLD 코드 그대로 남아있으니 여기까지만 해도 다시 FK 일치!
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
    -- 🔹 Case 1. GM-GG-FJ-BK-01 → GA-GG-FJ-BK-01 (원상 복구!)
    -- ──────────────────────────────────────────────────────────────────────────
    v_old := 'GM-GG-FJ-BK-01';
    v_new := 'GA-GG-FJ-BK-01';

    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_old) INTO v_exists_old;
    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_new) INTO v_exists_new;

    IF NOT v_exists_old AND v_exists_new THEN
        RAISE NOTICE 'ℹ️  [복구 1/3] % → % : 이미 원래 코드로 복구된 상태! SKIP!', v_old, v_new;
    ELSIF v_exists_old AND NOT v_exists_new THEN
        UPDATE public.products SET code = v_new WHERE code = v_old;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
        RAISE NOTICE '✅ [복구 1/3] % → % 원상복구 성공! (products 영향: %건)', v_old, v_new, v_cnt;
    ELSIF v_exists_old AND v_exists_new THEN
        RAISE WARNING '⚠️  [복구 1/3] old/new 코드가 둘다 존재합니다. 충돌!';
    ELSE
        RAISE WARNING '⚠️  [복구 1/3] old 코드(%) 가 products에 없습니다 (이미 원상복구 되었거나 없었음)', v_old;
    END IF;


    -- ──────────────────────────────────────────────────────────────────────────
    -- 🔹 Case 2. GM-GG-FJ-WH-01 → GA-GG-FJ-WH-01 (원상 복구!)
    -- ──────────────────────────────────────────────────────────────────────────
    v_old := 'GM-GG-FJ-WH-01';
    v_new := 'GA-GG-FJ-WH-01';

    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_old) INTO v_exists_old;
    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_new) INTO v_exists_new;

    IF NOT v_exists_old AND v_exists_new THEN
        RAISE NOTICE 'ℹ️  [복구 2/3] % → % : 이미 원래 코드로 복구된 상태! SKIP!', v_old, v_new;
    ELSIF v_exists_old AND NOT v_exists_new THEN
        UPDATE public.products SET code = v_new WHERE code = v_old;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
        RAISE NOTICE '✅ [복구 2/3] % → % 원상복구 성공! (products 영향: %건)', v_old, v_new, v_cnt;
    ELSIF v_exists_old AND v_exists_new THEN
        RAISE WARNING '⚠️  [복구 2/3] old/new 코드가 둘다 존재합니다. 충돌!';
    ELSE
        RAISE WARNING '⚠️  [복구 2/3] old 코드(%) 가 products에 없습니다 (이미 원상복구 되었거나 없었음)', v_old;
    END IF;


    -- ──────────────────────────────────────────────────────────────────────────
    -- 🔹 Case 3. GW-FJ-WH-02 → GA-GG-FJ-WH-02 (원상 복구!)
    -- ──────────────────────────────────────────────────────────────────────────
    v_old := 'GW-FJ-WH-02';
    v_new := 'GA-GG-FJ-WH-02';

    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_old) INTO v_exists_old;
    SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.code = v_new) INTO v_exists_new;

    IF NOT v_exists_old AND v_exists_new THEN
        RAISE NOTICE 'ℹ️  [복구 3/3] % → % : 이미 원래 코드로 복구된 상태! SKIP!', v_old, v_new;
    ELSIF v_exists_old AND NOT v_exists_new THEN
        UPDATE public.products SET code = v_new WHERE code = v_old;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
        RAISE NOTICE '✅ [복구 3/3] % → % 원상복구 성공! (products 영향: %건)', v_old, v_new, v_cnt;
    ELSIF v_exists_old AND v_exists_new THEN
        RAISE WARNING '⚠️  [복구 3/3] old/new 코드가 둘다 존재합니다. 충돌!';
    ELSE
        RAISE WARNING '⚠️  [복구 3/3] old 코드(%) 가 products에 없습니다 (이미 원상복구 되었거나 없었음)', v_old;
    END IF;
END $$;


-- ==================================================================================
-- 🔍 [원상복구 검증] products 테이블에 GA-GG-... 3개 코드가 다시 돌아왔는지 확인
-- ==================================================================================
SELECT
    '[원상복구 검증] products 코드 상태' AS section,
    code,
    'OK_있어야함' AS status
FROM public.products
WHERE code IN (
    'GA-GG-FJ-BK-01',
    'GA-GG-FJ-WH-01',
    'GA-GG-FJ-WH-02'
)
ORDER BY code;
