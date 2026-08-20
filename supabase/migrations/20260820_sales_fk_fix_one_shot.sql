-- ==================================================================================
-- 🎯 [3초만에 해결!] sales FK 생성 3단계 All-In-One
--   1. products에 ZZ-ORPHAN-00 더미 상품 자동 생성 (있으면 SKIP)
--   2. sales에 있는 고아코드 전부 ZZ-ORPHAN-00으로 치환
--   3. sales_code_fkey ON UPDATE CASCADE 생성!
-- ==================================================================================

-- ----------------------------------------------------------------------------------
-- Step 1. 더미 상품 ZZ-ORPHAN-00 을 products에 강제 생성
--   (이미 존재하면 ON CONFLICT DO NOTHING 이라 그냥 넘어감)
-- ----------------------------------------------------------------------------------
INSERT INTO public.products (code, name, sale_price, free_gift)
VALUES (
    'ZZ-ORPHAN-00',
    '(구)삭제된 상품 (정리 필요)',
    0,
    true
)
ON CONFLICT (code) DO NOTHING;


-- ----------------------------------------------------------------------------------
-- Step 2. sales 테이블 고아코드 전부 ZZ-ORPHAN-00 으로 몰아넣기
--   (products에 없는 코드는 전부 임시코드로 교체)
-- ----------------------------------------------------------------------------------
UPDATE public.sales s
SET code = 'ZZ-ORPHAN-00'
WHERE NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.code = s.code
);


-- ----------------------------------------------------------------------------------
-- Step 3. 이제 깨끗해졌으니 sales FK 생성! (ON UPDATE CASCADE)
--   기존에 혹시 있을지도 모를 sales FK는 전부 DROP 후 깨끗하게 재생성
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
        WHERE tc.table_schema    = 'public'
          AND tc.table_name      = 'sales'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name    = 'code'
    LOOP
        EXECUTE format('ALTER TABLE public.sales DROP CONSTRAINT %I', r.constraint_name);
    END LOOP;
END $$;

ALTER TABLE public.sales
    ADD CONSTRAINT sales_code_fkey
    FOREIGN KEY (code)
    REFERENCES public.products(code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;


-- ----------------------------------------------------------------------------------
-- 🔍 최종 확인: 아래 결과에 sales_code_fkey / on_update = CASCADE 나오면 SUCCESS!
-- ----------------------------------------------------------------------------------
SELECT
    tc.constraint_name                        AS fk_name,
    kcu.table_name                            AS child_table,
    ccu.table_name                            AS parent_table,
    rc.update_rule                            AS on_update_rule,
    rc.delete_rule                            AS on_delete_rule
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
