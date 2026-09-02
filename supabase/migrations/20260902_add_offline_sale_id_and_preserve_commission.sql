-- ============================================================================
-- 오프라인 판매 동기화 지원 마이그레이션 (최소 컬럼 추가)
--
-- 1) sales.offline_sale_id: UUID unique → 중복 INSERT 방지 식별자
--    오프라인에서 생성한 local_id를 그대로 저장. 중복 동기화 시 DB에서 unique
--    violation 이 나도록 하여 안전하게 막는다.
--
-- 2) sale_groups.offline_group_id: UUID unique → 그룹 단위 중복 방지
--
-- NOTES:
--  - guide_rate / guide_commission 은 오프라인 판매시 sale_price 와 함께
--    그 당시 값 그대로 클라이언트에서 계산해서 넣어준다.
--    (finalize_sale_group 을 나중에 타더라도 값이 그대로 유지되어야 하므로
--     finalize_sale_group 은 이미 값이 채워져 있으면 덮어쓰지 않도록 하는
--     패치는 이 파일 마지막에 추가)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sales' AND column_name='offline_sale_id'
  ) THEN
    ALTER TABLE public.sales ADD COLUMN offline_sale_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_offline_sale_id_key'
  ) THEN
    CREATE UNIQUE INDEX sales_offline_sale_id_key ON public.sales (offline_sale_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sale_groups' AND column_name='offline_group_id'
  ) THEN
    ALTER TABLE public.sale_groups ADD COLUMN offline_group_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_groups_offline_group_id_key'
  ) THEN
    CREATE UNIQUE INDEX sale_groups_offline_group_id_key ON public.sale_groups (offline_group_id);
  END IF;
END $$;

-- NOTE: finalize_sale_group MUST NOT be overridden here.
-- The original version from 20260818_guide_commission_system.sql uses
-- recalculate_guide_commission which correctly handles guide_type,
-- clothing 20%/10% split, local guide 10%, employee 0%, etc.
--
-- Offline sale commission preservation is handled by the SEPARATE
-- RPC: finalize_offline_sale_group (see 20260902_add_finalize_offline_sale_group_rpc.sql)
-- which calls recalculate_guide_commission first, then overwrites with
-- the snapshot values from the client.
