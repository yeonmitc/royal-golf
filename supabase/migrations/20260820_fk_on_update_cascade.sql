-- ==================================================================================
-- 🔥 20260820_fk_on_update_cascade.sql (최종 v3! Step0 결과 기반 정확 커스텀!)
--
-- Step 0 실제 덤프 결과에 맞춰서 100% 실행 가능하게 만든 버전
--   1. ✅ erro_stock : 이미 ON_UPDATE = CASCADE 이므로 건들지 않음 (SKIP)
--   2. 🛠️ inventories : ON_UPDATE = NO ACTION → CASCADE 로 재생성
--   3. 🚨 sales       : FK 자체가 Step3 결과에 없음! → "존재하면 지우고" 새로 깨끗하게 CASCADE로 생성!
--   4. 🛠️ code_parts  : 만약 FK 있으면 같이 CASCADE로 재생성
-- ==================================================================================

-- ----------------------------------------------------------------------------------
-- 1️⃣ inventories_code_fkey 재생성 (NO ACTION → CASCADE)
--    Step0 확인 결과: FK 이름 = inventories_code_fkey, on_update_rule = NO ACTION
-- ----------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name   = 'inventories'
          AND constraint_name = 'inventories_code_fkey'
    ) THEN
        ALTER TABLE public.inventories
            DROP CONSTRAINT inventories_code_fkey;
        RAISE NOTICE '✅ [1/3] inventories_code_fkey DROP 완료';
    ELSE
        RAISE NOTICE 'ℹ️  [1/3] inventories_code_fkey 기존에 없어서 DROP 생략';
    END IF;

    ALTER TABLE public.inventories
        ADD CONSTRAINT inventories_code_fkey
            FOREIGN KEY (code)
            REFERENCES public.products(code)
            ON UPDATE CASCADE
            ON DELETE CASCADE;
    RAISE NOTICE '✅ [1/3] inventories_code_fkey ON UPDATE CASCADE 로 재생성 완료';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '⚠️ [1/3] inventories FK 재생성 오류 (무시하고 계속): %', SQLERRM;
END $$;


-- ----------------------------------------------------------------------------------
-- 2️⃣ sales 테이블 FK (code → products.code) 생성
--    Step0 결과에 sales 관련 FK가 전혀 안나옴! (FK 자체가 없거나 이름이 다를 수 있으므로)
--    → sales.code에 대한 FK 모조리 DROP 후 깨끗한 새 이름으로 ON UPDATE CASCADE 생성
-- ----------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    -- sales 테이블에서 code 컬럼에 걸린 FK를 이름 상관없이 모조리 찾아서 DROP
    FOR r IN
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_catalog = kcu.constraint_catalog
         AND tc.constraint_schema  = kcu.constraint_schema
         AND tc.constraint_name    = kcu.constraint_name
        WHERE tc.table_schema    = 'public'
          AND tc.table_name      = 'sales'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name    = 'code'
    LOOP
        EXECUTE format('ALTER TABLE public.sales DROP CONSTRAINT %I', r.constraint_name);
        RAISE NOTICE '✅ [2/3] sales 기존 FK 삭제: %', r.constraint_name;
    END LOOP;

    -- 깨끗하게 새 FK를 ON UPDATE CASCADE 로 생성
    ALTER TABLE public.sales
        ADD CONSTRAINT sales_code_fkey
            FOREIGN KEY (code)
            REFERENCES public.products(code)
            ON UPDATE CASCADE
            ON DELETE RESTRICT;
    RAISE NOTICE '✅ [2/3] sales_code_fkey ON UPDATE CASCADE 로 새로 생성 완료';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '⚠️ [2/3] sales FK 생성 오류 (무시하고 계속): %', SQLERRM;
END $$;


-- ----------------------------------------------------------------------------------
-- 3️⃣ code_parts 테이블 FK (code → products.code) 가 있다면 CASCADE 로 재생성
--    (마스터 테이블이라 참조 방향이 반대일 수도 있으니 "있으면 처리, 없으면 스킵")
-- ----------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_catalog = kcu.constraint_catalog
         AND tc.constraint_schema  = kcu.constraint_schema
         AND tc.constraint_name    = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_catalog = ccu.constraint_catalog
         AND tc.constraint_schema  = ccu.constraint_schema
         AND tc.constraint_name    = ccu.constraint_name
        WHERE tc.table_schema    = 'public'
          AND tc.table_name      = 'code_parts'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name     = 'products'
          AND ccu.column_name    = 'code'
    LOOP
        EXECUTE format('ALTER TABLE public.code_parts DROP CONSTRAINT %I', r.constraint_name);
        RAISE NOTICE '✅ [3/3] code_parts 기존 FK 삭제: %', r.constraint_name;

        EXECUTE format(
            'ALTER TABLE public.code_parts
                ADD CONSTRAINT %I
                    FOREIGN KEY (code)
                    REFERENCES public.products(code)
                    ON UPDATE CASCADE
                    ON DELETE RESTRICT',
            r.constraint_name
        );
        RAISE NOTICE '✅ [3/3] code_parts FK ON UPDATE CASCADE 로 재생성';
    END LOOP;

    IF NOT FOUND THEN
        RAISE NOTICE 'ℹ️  [3/3] code_parts 에서는 products.code 를 참조하는 FK 가 발견되지 않아 SKIP';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '⚠️ [3/3] code_parts FK 오류 (무시): %', SQLERRM;
END $$;


-- ----------------------------------------------------------------------------------
-- 🔍 ✅ 최종 자가 진단: 적용이 잘 됐는지 확인
--    아래 on_update_rule 이 전부 "CASCADE" 로 보여야 최종 성공!
-- ----------------------------------------------------------------------------------
SELECT
    tc.constraint_name                        AS "fk_name",
    kcu.table_name                            AS "child_table",
    string_agg(kcu.column_name, ', ')         AS "child_columns",
    ccu.table_name                            AS "parent_table",
    string_agg(ccu.column_name, ', ')         AS "parent_columns",
    rc.update_rule                            AS "on_update_rule",  -- ✅ 전부 CASCADE 여야 함
    rc.delete_rule                            AS "on_delete_rule"
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
  AND ccu.table_name     = 'products'
  AND ccu.column_name    = 'code'
GROUP BY tc.constraint_name, kcu.table_name, ccu.table_name, rc.update_rule, rc.delete_rule
ORDER BY kcu.table_name;
