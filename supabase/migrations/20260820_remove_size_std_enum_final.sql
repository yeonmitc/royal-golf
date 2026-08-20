-- ==================================================================================
-- 🧹 [최종! size_std_enum 삭제 3단계 ALL-IN-ONE] 20260820_remove_size_std_enum_final.sql
--
-- 🔍 원인: size_map 테이블의 size_std 컬럼이 size_std_enum 타입을 사용중이라 DROP 불가
-- ✅ 해결:
--   1. size_map.size_std 컬럼 타입을 size_std (정상 enum) 으로 ALTER
--   2. 이제 size_std_enum 을 아무도 안쓰니까 안전하게 DROP
--   3. 최종 검증
-- ==================================================================================

-- ----------------------------------------------------------------------------------
-- Step 1. size_map.size_std 의 enum 타입을 size_std_enum → size_std 로 변경
--   - USING 절로 Free (대문자) → Free (소문자f) 자동 캐스팅 (values가 대소문자만 다르고 똑같아서 안전!)
-- ----------------------------------------------------------------------------------
DO $$
BEGIN
    -- 현재 타입 확인
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='size_map' AND column_name='size_std' AND udt_name='size_std_enum'
    ) THEN
        RAISE NOTICE '🔄 [1/3] size_map.size_std 컬럼 타입을 size_std_enum → size_std 로 변경중...';

        -- enum values가 S/M/L/XL/2XL/3XL 까지는 완전 같고 마지막만 Free vs FREE 라서 완벽히 호환!
        -- USING 절로 자동 캐스팅
        ALTER TABLE public.size_map
            ALTER COLUMN size_std TYPE size_std
            USING (
                CASE size_std::text
                    WHEN 'FREE' THEN 'Free'::size_std   -- 대문자 FREE → 표준 size_std의 Free 로 변환
                    ELSE size_std::text::size_std       -- 나머지 S/M/L/XL/2XL/3XL 은 그대로 캐스팅
                END
            );

        RAISE NOTICE '✅ [1/3] size_map.size_std 컬럼 타입 변경 성공! (이제 size_std_enum 아무도 안씀)';
    ELSE
        RAISE NOTICE 'ℹ️  [1/3] size_map.size_std 는 이미 size_std 타입으로 되어있어 SKIP';
    END IF;
END $$;


-- ----------------------------------------------------------------------------------
-- Step 2. 이제 size_std_enum을 아무도 안쓰니까 안전하게 DROP!
-- ----------------------------------------------------------------------------------
DO $$
DECLARE
    v_remaining_usage integer;
BEGIN
    -- 진짜 아무도 안쓰는지 최종 검증 (컬럼)
    SELECT count(*) INTO v_remaining_usage
    FROM information_schema.columns
    WHERE table_schema='public' AND udt_name='size_std_enum';

    IF v_remaining_usage > 0 THEN
        RAISE WARNING '⚠️  [2/3] 중단! size_std_enum 을 여전히 %건의 컬럼에서 사용중. 먼저 위 컬럼부터 타입 변경하세요!', v_remaining_usage;
    ELSE
        RAISE NOTICE '🧹 [2/3] size_std_enum 사용처 0건 확인. 안전하게 DROP 진행!';
        DROP TYPE IF EXISTS public.size_std_enum;
        RAISE NOTICE '🗑️  [2/3] size_std_enum DROP 성공!';
    END IF;
END $$;


-- ----------------------------------------------------------------------------------
-- Step 3. 최종 검증: Enum 4개만 남았는지 + size_map 컬럼 타입 정상인지
-- ----------------------------------------------------------------------------------
SELECT
    '[3/3] Size Map 컬럼 타입 검증' AS section,
    table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='size_map' AND column_name='size_std';

SELECT
    '[3/3] 최종 Enum 목록' AS section,
    n.nspname           AS schema_name,
    t.typname           AS enum_name,
    string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_enum e
  ON t.oid = e.enumtypid
JOIN pg_namespace n
  ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype = 'e'
GROUP BY n.nspname, t.typname
ORDER BY t.typname;
