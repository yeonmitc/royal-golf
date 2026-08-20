-- ==================================================================================
-- 🔧 [응급 진단 + 수정] sales.code FK 생성 실패시 이 파일만 실행!
-- Step1 실행 후 최종결과에 sales_code_fkey 가 안나올때 사용
-- ==================================================================================

-- ----------------------------------------------------------------------------------
-- 1️⃣ 1차 진단: sales 테이블 구조를 보자
--   - code 컬럼 데이터 타입이 products.code 와 일치하는지? (둘다 text 여야 함)
--   - 기존에 이상한 제약조건이 걸려있진 않은지?
-- ----------------------------------------------------------------------------------
SELECT
    '[1/4] sales 테이블 컬럼 정보'       AS section,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'sales'
  AND column_name  = 'code';

SELECT
    '[2/4] products 테이블 code 컬럼 정보' AS section,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'products'
  AND column_name  = 'code';


-- ----------------------------------------------------------------------------------
-- 2️⃣ 2차 진단: sales.code 에 기존에 UNIQUE / PK 같은 다른 제약이 걸려있진 않은지?
--   (만약 UNIQUE 라도 FK는 생성 가능하지만, 혹시 모를 제약 충돌 확인)
-- ----------------------------------------------------------------------------------
SELECT
    '[3/4] sales.code 관련 모든 기존 제약조건' AS section,
    tc.constraint_name,
    tc.constraint_type,
    string_agg(kcu.column_name, ', ') AS columns
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_catalog = kcu.constraint_catalog
 AND tc.constraint_schema  = kcu.constraint_schema
 AND tc.constraint_name    = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name   = 'sales'
  AND (kcu.column_name = 'code' OR kcu.column_name IS NULL)
GROUP BY tc.constraint_name, tc.constraint_type
ORDER BY tc.constraint_type, tc.constraint_name;


-- ----------------------------------------------------------------------------------
-- 3️⃣ 3차 진단: 혹시 FK 생성 실패 원인이 "sales 테이블에 products에 없는 이상한 code 값"이
--              들어있어서 (무결성 위반) 생성이 실패했을 가능성이 제일 높음!
--   → sales 테이블에 products.code 에 존재하지 않는 "orphan(고아)" 코드가 있는지 검사
--   → 만약 1개라도 나오면 그것들이 FK 생성을 막고 있는것!
-- ----------------------------------------------------------------------------------
SELECT
    '[4/4] sales에만 있고 products에는 없는 고아코드 (orphan code) 목록' AS section,
    s.code            AS sales_code,
    count(*)          AS sales_row_cnt
FROM public.sales s
LEFT JOIN public.products p
  ON s.code = p.code
WHERE p.code IS NULL
GROUP BY s.code
ORDER BY sales_row_cnt DESC;


-- ----------------------------------------------------------------------------------
-- 💡 [결과 해석 가이드]
--
-- Case A. [4/4] 고아코드가 1건 이상 나온다?
--   → FK를 생성하려면 "sales.code 가 반드시 products.code 에 존재해야 하는데"
--      과거에 FK가 없었던 시절에 삭제된 상품코드가 sales에 남아있는 상태!
--   → 이럴때 해결법 2가지:
--      1) (추천) 고아코드 → 대체코드로 UPDATE: 아래 /* [Case A 해결] */ 주석 풀고 실행
--      2) (위험) 그냥 FK 없이 살기 → ON UPDATE CASCADE 기능 포기
--
-- Case B. [4/4] 고아코드가 0건 (No rows) 인데 FK가 안생긴다?
--   → 문법/권한 문제일 가능성. 아래 /* [Case B 해결] */ 강제 생성 구문 실행
-- ----------------------------------------------------------------------------------


-- /* [Case A 해결] 고아코드가 있을때: 임시로 전부 'ZZ-ORPHAN-00' 코드로 몰아넣기
--    👉 실행 전에 products에 'ZZ-ORPHAN-00' 상품 1개를 먼저 코드만 만들어두고 실행!
--    👉 (아니면 NULL 허용시 NULL로 업데이트)
-- DO $$
-- BEGIN
--     -- 1. 먼저 products에 임시 더미코드 생성 (없을때만)
--     IF NOT EXISTS (SELECT 1 FROM public.products WHERE code = 'ZZ-ORPHAN-00') THEN
--         INSERT INTO public.products (code, name, sale_price)
--         VALUES ('ZZ-ORPHAN-00', '(구)삭제된 상품 - 정리필요', 0)
--         ON CONFLICT DO NOTHING;
--     END IF;
--
--     -- 2. 고아코드 전부 임시코드로 변경
--     UPDATE public.sales s
--        SET code = 'ZZ-ORPHAN-00'
--      WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.code = s.code);
--
--     RAISE NOTICE '✅ 고아코드 정리 완료! 이제 맨 아래 [Case B 강제 생성] 실행!';
-- END $$;
-- */


-- /* [Case B 해결] sales FK 강제 생성 (정보계 스킵하고 직접 이름 지정)
--    👉 고아코드가 0건일때 / 위 Case A 실행 후에 이 부분만 Run!
DO $$
BEGIN
    -- 혹시 모르게 있을지도 모르는 이상한 이름의 FK 전부 삭제
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
        RAISE NOTICE 'DELETE 기존 사유 FK: %', r.constraint_name;
    END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 👉 직접 FK 생성 (PL/pgSQL 없이 순수 SQL)
ALTER TABLE public.sales
    ADD CONSTRAINT sales_code_fkey
    FOREIGN KEY (code)
    REFERENCES public.products(code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;

-- 👉 마지막 확인
SELECT
    tc.constraint_name,
    kcu.table_name   AS child,
    ccu.table_name   AS parent,
    rc.update_rule   AS on_update
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu USING (constraint_catalog, constraint_schema, constraint_name)
JOIN information_schema.constraint_column_usage ccu USING (constraint_catalog, constraint_schema, constraint_name)
JOIN information_schema.referential_constraints rc USING (constraint_catalog, constraint_schema, constraint_name)
WHERE tc.table_name = 'sales' AND tc.constraint_type = 'FOREIGN KEY';
-- */
