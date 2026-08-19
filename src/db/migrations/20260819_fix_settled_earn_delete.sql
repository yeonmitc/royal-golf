-- ========================================================
-- 수정: 이미 정산된 earn_from_sale 삭제 방지
-- 문제: recalculate_guide_commission이 정산된 판매의 earn을 삭제하면
--       commission_payout만 남아 잔액이 음수가 됨
-- 해결: commission_payout이 연결된 sale_group은 DELETE 대신 delta=0 업데이트
-- ========================================================

CREATE OR REPLACE FUNCTION public.recalculate_guide_commission(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_group RECORD;
  v_guide RECORD;
  v_subtotal numeric := 0;
  v_commission numeric := 0;
  v_guide_rate numeric := 0;
  v_item RECORD;
  v_item_type text;
  v_is_clothing boolean;
  v_sold_at_manila timestamp;
  v_is_settled boolean;
BEGIN
  -- 1. sale_groups 잠금
  SELECT * INTO v_sale_group
  FROM public.sale_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale group not found: %', p_group_id;
  END IF;

  -- 이미 정산된 판매인지 확인
  SELECT EXISTS (
    SELECT 1 FROM public.guide_point_ledger
    WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale'
      AND EXISTS (
        SELECT 1 FROM public.guide_point_ledger payout
        WHERE payout.guide_id = guide_point_ledger.guide_id
          AND payout.reason = 'commission_payout'
          AND payout.created_at >= guide_point_ledger.created_at
      )
  ) INTO v_is_settled;

  -- 가이드 없으면 커미션 0
  IF v_sale_group.guide_id IS NULL THEN
    UPDATE public.sale_groups
    SET subtotal = COALESCE((
      SELECT COALESCE(SUM(price * qty), 0)
      FROM public.sales
      WHERE sale_group_id = p_group_id
        AND refunded_at IS NULL
        AND (free_gift IS FALSE OR free_gift IS NULL)
    ), 0),
    total = COALESCE((
      SELECT COALESCE(SUM(price * qty), 0)
      FROM public.sales
      WHERE sale_group_id = p_group_id
        AND refunded_at IS NULL
        AND (free_gift IS FALSE OR free_gift IS NULL)
    ), 0),
    guide_commission = 0,
    guide_rate = 0
    WHERE id = p_group_id;

    IF v_is_settled THEN
      -- 정산된 판매: 삭제 대신 delta=0 (잔액 보호)
      UPDATE public.guide_point_ledger
      SET delta = 0, note = 'Zeroed (settled, guide removed)'
      WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale';
    ELSE
      DELETE FROM public.guide_point_ledger
      WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale';
    END IF;
    RETURN;
  END IF;

  -- 2. 가이드 정보 조회
  SELECT * INTO v_guide
  FROM public.guides
  WHERE id = v_sale_group.guide_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guide not found: %', v_sale_group.guide_id;
  END IF;

  -- 3. 환불·증정·0원 제외 subtotal 계산
  SELECT COALESCE(SUM(s.price * s.qty), 0) INTO v_subtotal
  FROM public.sales s
  WHERE s.sale_group_id = p_group_id
    AND s.refunded_at IS NULL
    AND (s.free_gift IS FALSE OR s.free_gift IS NULL)
    AND s.price > 0;

  -- 4. 커미션 계산
  IF NOT COALESCE(v_guide.commission_enabled, true) THEN
    v_guide_rate := 0;
    v_commission := 0;

  ELSIF v_guide.guide_type = 'employee' THEN
    v_guide_rate := 0;
    v_commission := 0;

  ELSIF v_guide.fixed_commission_rate IS NOT NULL THEN
    v_guide_rate := v_guide.fixed_commission_rate;
    v_commission := round(v_subtotal * v_guide_rate, 2);

  ELSIF v_guide.guide_type = 'local' THEN
    v_guide_rate := 0.10;
    v_commission := round(v_subtotal * v_guide_rate, 2);

  ELSIF v_guide.guide_type = 'regular' THEN
    v_sold_at_manila := (v_sale_group.sold_at AT TIME ZONE 'Asia/Manila');

    IF v_sold_at_manila < '2026-08-13 00:00:00' THEN
      v_guide_rate := 0.10;
      v_commission := round(v_subtotal * v_guide_rate, 2);
    ELSE
      v_commission := 0;
      FOR v_item IN
        SELECT s.price, s.qty, s.code
        FROM public.sales s
        WHERE s.sale_group_id = p_group_id
          AND s.refunded_at IS NULL
          AND (s.free_gift IS FALSE OR s.free_gift IS NULL)
          AND s.price > 0
      LOOP
        v_item_type := split_part(v_item.code, '-', 2);
        v_is_clothing := v_item_type IN ('TP', 'BT', 'DR');
        IF v_is_clothing THEN
          v_commission := v_commission + round(v_item.price * v_item.qty * 0.20, 2);
        ELSE
          v_commission := v_commission + round(v_item.price * v_item.qty * 0.10, 2);
        END IF;
      END LOOP;

      IF v_subtotal > 0 THEN
        v_guide_rate := v_commission / v_subtotal;
      ELSE
        v_guide_rate := 0;
      END IF;
    END IF;

  ELSE
    v_guide_rate := 0;
    v_commission := 0;
  END IF;

  -- 5. sale_groups 갱신
  UPDATE public.sale_groups
  SET subtotal = v_subtotal,
      total = v_subtotal,
      guide_commission = v_commission,
      guide_rate = v_guide_rate
  WHERE id = p_group_id;

  -- 6. earn_from_sale 장부 upsert
  IF v_commission > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.guide_point_ledger
      WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale'
    ) THEN
      UPDATE public.guide_point_ledger
      SET delta = v_commission,
          guide_id = v_sale_group.guide_id,
          note = 'Auto-calculated commission'
      WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale';
    ELSE
      INSERT INTO public.guide_point_ledger (guide_id, delta, reason, sale_group_id, note)
      VALUES (v_sale_group.guide_id, v_commission, 'earn_from_sale', p_group_id, 'Auto-calculated commission');
    END IF;
  ELSE
    IF v_is_settled THEN
      -- 정산된 판매: 삭제 대신 delta=0 (잔액 보호)
      UPDATE public.guide_point_ledger
      SET delta = 0, note = 'Zeroed (settled, commission=0)'
      WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale';
    ELSE
      DELETE FROM public.guide_point_ledger
      WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale';
    END IF;
  END IF;
END;
$$;

-- ========================================================
-- Levi 음수 잔액 보정 (기존 정산 오류 수정)
-- ========================================================
INSERT INTO public.guide_point_ledger (guide_id, delta, reason, note)
SELECT g.id, 1070, 'admin_adjust', '정산 오류 보정: earn 삭제 후 payout 잔존 차액'
FROM public.guides g
WHERE g.name ILIKE '%levi%'
  AND (SELECT COALESCE(SUM(delta), 0) FROM public.guide_point_ledger WHERE guide_id = g.id) < 0;

-- ========================================================
-- Machado 음수 잔액 보정 (기존 정산 오류 수정)
-- payout -10,580 시 earn 9,210이 삭제됨 → 보정 +9,210
-- ========================================================
INSERT INTO public.guide_point_ledger (guide_id, delta, reason, note)
SELECT g.id, 9210, 'admin_adjust', '정산 오류 보정: earn 삭제 후 payout 잔존 차액'
FROM public.guides g
WHERE g.name ILIKE '%machado%'
  AND (SELECT COALESCE(SUM(delta), 0) FROM public.guide_point_ledger WHERE guide_id = g.id) < 0;

-- ========================================================
-- 기존 정산 건의 판매건 is_settled 백필
-- 기존 settle_all_guide_commission은 is_settled을 설정하지 않았으므로,
-- 정산 시점 이전의 미정산 판매건을 retrospectively 마킹
-- ========================================================
UPDATE public.sales s
SET is_settled = true
FROM public.sale_groups sg
JOIN public.guide_commission_settlements cs ON cs.guide_id = sg.guide_id
WHERE s.sale_group_id = sg.id
  AND s.is_settled = false
  AND s.sold_at <= cs.paid_at;
