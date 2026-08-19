-- ========================================================
-- 가이드 미정산 판매내역 기반 정산 기능 개선
-- ========================================================

-- STEP 1: sales 테이블에 is_settled 컬럼 추가
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS is_settled boolean NOT NULL DEFAULT false;

-- STEP 2: 인덱스 (미정산 조회용)
CREATE INDEX IF NOT EXISTS idx_sales_unsettled
ON public.sales (sale_group_id)
WHERE is_settled = false AND refunded_at IS NULL AND free_gift = false;

-- STEP 3: 미정산 판매그룹 조회
DROP FUNCTION IF EXISTS public.get_guide_unsettled_sales(bigint);
CREATE OR REPLACE FUNCTION public.get_guide_unsettled_sales(p_guide_id bigint)
RETURNS TABLE (
  sale_group_id     uuid,
  sold_at           timestamptz,
  guide_commission  numeric,
  guide_rate        numeric,
  item_count        bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sg.id,
    sg.sold_at,
    sg.guide_commission,
    sg.guide_rate,
    (SELECT COUNT(*) FROM public.sales s
     WHERE s.sale_group_id = sg.id
       AND s.is_settled = false
       AND s.refunded_at IS NULL
       AND s.free_gift = false)
  FROM public.sale_groups sg
  WHERE sg.guide_id = p_guide_id
    AND sg.guide_commission > 0
    AND EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.sale_group_id = sg.id
        AND s.is_settled = false
        AND s.refunded_at IS NULL
        AND s.free_gift = false
    )
  ORDER BY sg.sold_at;
END;
$$;

-- STEP 3-2: 가이드별 미정산 커미션 합계 조회
CREATE OR REPLACE FUNCTION public.get_guide_unsettled_balances()
RETURNS TABLE (
  guide_id          bigint,
  unsettled_amount  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sg.guide_id,
    COALESCE(SUM(sg.guide_commission), 0)
  FROM public.sale_groups sg
  WHERE sg.guide_commission > 0
    AND EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.sale_group_id = sg.id
        AND s.is_settled = false
        AND s.refunded_at IS NULL
        AND s.free_gift = false
    )
  GROUP BY sg.guide_id;
END;
$$;

-- STEP 4: 정산 함수 (is_settled 마킹 + settlements 로그만)
DROP FUNCTION IF EXISTS public.settle_guide_sales(bigint, bigint[], text, timestamptz);
DROP FUNCTION IF EXISTS public.settle_guide_sales(bigint, uuid[], text, timestamptz);
CREATE OR REPLACE FUNCTION public.settle_guide_sales(
  p_guide_id       bigint,
  p_sale_group_ids uuid[],
  p_note           text DEFAULT NULL,
  p_paid_at        timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_commission numeric;
  v_settled_groups   int;
  v_settlement_id    uuid;
BEGIN
  PERFORM 1 FROM public.guides WHERE id = p_guide_id FOR UPDATE;

  SELECT
    COALESCE(SUM(sg.guide_commission), 0),
    COUNT(DISTINCT sg.id)
  INTO v_total_commission, v_settled_groups
  FROM public.sale_groups sg
  WHERE sg.id = ANY(p_sale_group_ids)
    AND sg.guide_id = p_guide_id
    AND sg.guide_commission > 0
    AND EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.sale_group_id = sg.id
        AND s.is_settled = false
        AND s.refunded_at IS NULL
        AND s.free_gift = false
    );

  IF v_total_commission <= 0 OR v_settled_groups = 0 THEN
    RAISE EXCEPTION 'No unsettled commission found';
  END IF;

  -- 정산 로그
  INSERT INTO public.guide_commission_settlements (
    guide_id, amount, settlement_type, balance_before, balance_after, paid_at, note
  ) VALUES (
    p_guide_id, v_total_commission, 'full', 0, 0, p_paid_at, p_note
  ) RETURNING id INTO v_settlement_id;

  -- is_settled 마킹
  UPDATE public.sales s
  SET is_settled = true
  WHERE s.sale_group_id = ANY(p_sale_group_ids)
    AND s.is_settled = false;

  RETURN jsonb_build_object(
    'settlement_id', v_settlement_id,
    'total_commission', v_total_commission,
    'settled_groups', v_settled_groups
  );
END;
$$;
