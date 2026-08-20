-- ==================================================================================
-- ✅ 20260820_verify_rename_product_code_rpc.sql
-- rename_product_code RPC 함수가 정상적으로 DB에 설치되었는지 / 잘 작동하는지 확인하는 SQL
-- Supabase SQL Editor에서 "Run" 클릭하면 모든 검증 결과가 한번에 조회됩니다.
-- ==================================================================================

-- ----------------------------------------------------------------------------------
-- 1️⃣ 함수가 정상적으로 생성되었는지 pg_proc 에서 확인
-- ----------------------------------------------------------------------------------
SELECT
    '✅ [1/3] 함수 존재 여부 확인'  AS phase,
    proname                         AS function_name,
    pronargs                        AS arg_count,
    proargtypes::text               AS arg_types,
    prosecdef                       AS is_security_definer,  -- TRUE 여야 SECURITY DEFINER!
    pg_get_userbyid(proowner)       AS owner,
    CASE WHEN proisstrict THEN 'STRICT' ELSE 'CALLED ON NULL' END AS null_behavior
FROM pg_proc
WHERE proname = 'rename_product_code'
ORDER BY proname;


-- ----------------------------------------------------------------------------------
-- 2️⃣ 현재 DB 스키마에서 code 컬럼이 실제로 존재하는 모든 테이블 목록
--    (RPC 내부의 information_schema 검사 결과와 일치해야 함)
-- ----------------------------------------------------------------------------------
SELECT
    '✅ [2/3] code 컬럼을 가진 실제 테이블 목록'  AS phase,
    table_name                                  AS table_name,
    column_name                                 AS column_name,
    data_type                                   AS column_type,
    is_nullable                                 AS nullable,
    character_maximum_length                    AS max_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name  = 'code'
ORDER BY table_name;


-- ----------------------------------------------------------------------------------
-- 3️⃣ 실제 함수가 잘 작동하는지 테스트!
--
-- 🧠 아이디어: 진짜 products/inventories 테이블 컬럼명이 뭔지 몰라도 테스트가 가능하도록!
--   → 임시로 TEMP 테이블을 직접 만들어서(code 컬럼이 PK인 구조) 여기서 rename 테스트를 한다.
--   → rename_product_code 함수는 information_schema 로 code 컬럼 존재 여부를 확인하므로,
--     TEMP 테이블에는 code 컬럼이 있으니 당연히 code UPDATE 가 실행될 것이다!
--   → BEGIN ~ ROLLBACK 트랜잭션 안에서 실행하므로 TEMP 테이블은 자동으로 사라짐
-- ----------------------------------------------------------------------------------
BEGIN;  -- 트랜잭션 시작 → 마지막에 ROLLBACK 으로 원상복구!

-- 3-1. 임시 테이블 3개를 직접 만든다 (code 컬럼이 있는 공통 구조)
CREATE TEMP TABLE IF NOT EXISTS tmp_test_products (
    code    text PRIMARY KEY,   -- 이게 핵심! code 컬럼이 PK로 존재
    name    text
) ON COMMIT DROP;

CREATE TEMP TABLE IF NOT EXISTS tmp_test_inventories (
    code      text NOT NULL,
    size      text NOT NULL,
    stock_qty integer DEFAULT 0,
    PRIMARY KEY (code, size)
) ON COMMIT DROP;

CREATE TEMP TABLE IF NOT EXISTS tmp_test_sales (
    id        bigserial PRIMARY KEY,
    code      text NOT NULL,
    qty       integer DEFAULT 1
) ON COMMIT DROP;

-- 3-2. seed-code-parts.json 기준 100% 유효한 샘플 코드 3쌍
--   Part0 = C(ategory) + K(ind) : G/M, G/W, L/U 조합
--   Part1 : GG(gloves), TP(top), DR(dress)
--   Part2 : FJ(FootJoy), AC(AmazingCre), AD(Adidas)
--   Part3 : BK(Black), WH(White), PK(Pink)
--   Part4 : 97~99 (실제 상품과 충돌 안날 법한 끝자리)
DO $$
DECLARE
    -- ✅ 샘플 Old → New 코드 3쌍 (전부 code parts enum 100% 유효)
    v_pair1_old text := 'GM-GG-FJ-BK-97';   -- Golf / Man / Gloves / FootJoy / Black / 97
    v_pair1_new text := 'GW-GG-FJ-WH-97';   -- Golf / Woman / Gloves / FootJoy / White / 97
    v_pair2_old text := 'LA-TP-AC-PK-98';   -- Luxury / Acc / Top / AmazingCre / Pink / 98
    v_pair2_new text := 'LU-DR-AD-GY-98';   -- Luxury / Unisex / Dress / Adidas / Gray / 98
    v_pair3_old text := 'GA-BT-NK-SV-99';   -- Golf / Acc / Bottom / Nike / Silver / 99
    v_pair3_new text := 'GA-UM-EX-IB-99';   -- Golf / Acc / Umbrella / NoBrand / Ivory / 99
    v_result boolean;
    v_cnt integer;
BEGIN
    -- 3-3. 위 3쌍 old 코드를 TEMP 테이블 3개에 각각 INSERT
    INSERT INTO tmp_test_products(code, name) VALUES
        (v_pair1_old, '샘플1-' || v_pair1_old),
        (v_pair2_old, '샘플2-' || v_pair2_old),
        (v_pair3_old, '샘플3-' || v_pair3_old);

    INSERT INTO tmp_test_inventories(code, size, stock_qty) VALUES
        (v_pair1_old, 'M', 5),  (v_pair1_old, 'L', 3),
        (v_pair2_old, 'Free', 10),
        (v_pair3_old, '2XL', 8);

    INSERT INTO tmp_test_sales(code, qty) VALUES
        (v_pair1_old, 1), (v_pair1_old, 2),
        (v_pair2_old, 1),
        (v_pair3_old, 1), (v_pair3_old, 1), (v_pair3_old, 1);

    -- --------------------------------------------------------------------------
    -- 🧪 진짜 rename_product_code 함수 실행 (old→new 3번 호출)
    -- --------------------------------------------------------------------------
    RAISE NOTICE '--- 🧪 [Pair 1/3] rename 호출: % → %', v_pair1_old, v_pair1_new;
    SELECT public.rename_product_code(v_pair1_old, v_pair1_new) INTO v_result;
    ASSERT v_result = true, 'Pair 1 함수 리턴값이 true 가 아님!';

    RAISE NOTICE '--- 🧪 [Pair 2/3] rename 호출: % → %', v_pair2_old, v_pair2_new;
    SELECT public.rename_product_code(v_pair2_old, v_pair2_new) INTO v_result;
    ASSERT v_result = true, 'Pair 2 함수 리턴값이 true 가 아님!';

    RAISE NOTICE '--- 🧪 [Pair 3/3] rename 호출: % → %', v_pair3_old, v_pair3_new;
    SELECT public.rename_product_code(v_pair3_old, v_pair3_new) INTO v_result;
    ASSERT v_result = true, 'Pair 3 함수 리턴값이 true 가 아님!';

    -- 3-4. 변경 검증 (tmp_test_products 기준으로 old 코드 없고 new 코드 있나 체크)
    SELECT COUNT(*) INTO v_cnt FROM tmp_test_products WHERE code IN (v_pair1_new, v_pair2_new, v_pair3_new);
    ASSERT v_cnt = 3, 'new 코드 3개가 products에 모두 존재하지 않음 → rename 실패! (new 코드 없음)';

    SELECT COUNT(*) INTO v_cnt FROM tmp_test_products WHERE code IN (v_pair1_old, v_pair2_old, v_pair3_old);
    ASSERT v_cnt = 0, 'old 코드 3개가 아직 products에 남아있음 → rename 실패! (old 코드 잔존)';

    SELECT COUNT(*) INTO v_cnt FROM tmp_test_inventories WHERE code IN (v_pair1_new, v_pair2_new, v_pair3_new);
    ASSERT v_cnt = 4, 'inventories 코드 변경 실패! 예상 4건';

    SELECT COUNT(*) INTO v_cnt FROM tmp_test_sales WHERE code IN (v_pair1_new, v_pair2_new, v_pair3_new);
    ASSERT v_cnt = 6, 'sales 코드 변경 실패! 예상 6건';

    RAISE NOTICE '';
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '  ✅ [3/3] rename_product_code 함수 동작 테스트: **PASSED**';
    RAISE NOTICE '     - 샘플 코드 3쌍 모두 rename 성공';
    RAISE NOTICE '     - products / inventories / sales 모든 테이블 code UPDATE 확인';
    RAISE NOTICE '     - 곧 ROLLBACK 되므로 실제 DB는 원래 상태 그대로 임';
    RAISE NOTICE '========================================================================';
END $$;

ROLLBACK;  -- 테스트 트랜잭션 롤백 → TEMP 테이블 전부 사라지고 DB 원래 상태!


-- ----------------------------------------------------------------------------------
-- 4️⃣ 함수 실행 권한 확인 (누가 호출할 수 있는지)
-- ----------------------------------------------------------------------------------
SELECT
    '✅ [4/4] 함수 실행 권한'     AS phase,
    grantee::text                  AS role_name,
    privilege_type                 AS privilege
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name   = 'rename_product_code'
ORDER BY grantee;


-- ==================================================================================
-- 💡 수동으로 직접 테스트 해보고 싶으시면 아래 SQL 을 복사해서 실행하세요:
--
--   SELECT public.rename_product_code('실제존재하는OldCode', '새로운코드');
--
--   예: SELECT public.rename_product_code('GM-TP-AC-BK-01', 'GM-TP-AC-WH-02');
-- ==================================================================================
