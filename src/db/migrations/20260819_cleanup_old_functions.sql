-- ========================================================
-- 불필요한 함수/트리거 정리
-- 새 settle_guide_sales로 대체된 오래된 함수 삭제
-- ========================================================

-- 기존 전체 정산 함수 삭제 (settle_guide_sales로 대체)
DROP FUNCTION IF EXISTS public.settle_all_guide_commission(bigint, text, text, timestamptz);

-- 기존 부분 정산 함수 삭제 (settle_guide_sales로 대체)
DROP FUNCTION IF EXISTS public.settle_guide_commission_to_balance(bigint, numeric, numeric, text, text, timestamptz);
