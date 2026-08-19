-- ============================================================
-- 로얄골프 가이드 커미션·정산 시스템 전체 마이그레이션
-- 실행 전 반드시 백업하세요!
-- Supabase SQL Editor에서 순서대로 입력하세요.
-- ============================================================


-- ============================================================
-- STEP 1: guides 테이블에 새 컬럼 추가
-- ============================================================

-- guide_type (regular / local / employee)
ALTER TABLE public.guides
ADD COLUMN IF NOT EXISTS guide_type text NOT NULL DEFAULT 'regular'
CHECK (guide_type IN ('regular', 'local', 'employee'));

-- normalized_name (로컬 가이드 이름 정규화, 소문자+공백정리)
ALTER TABLE public.guides
ADD COLUMN IF NOT EXISTS normalized_name text;

-- commission_enabled
ALTER TABLE public.guides
ADD COLUMN IF NOT EXISTS commission_enabled boolean NOT NULL DEFAULT true;

-- fixed_commission_rate (특수 고정 커미션율, 기본 null)
ALTER TABLE public.guides
ADD COLUMN IF NOT EXISTS fixed_commission_rate numeric;

-- employee_id (직원 연결)
ALTER TABLE public.guides
ADD COLUMN IF NOT EXISTS employee_id uuid
REFERENCES public.employees(id);

-- 직원-가이드 1:1 매핑 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS guides_one_employee_link
ON public.guides(employee_id)
WHERE employee_id IS NOT NULL;


-- ============================================================
-- STEP 2: sale_groups에 sale_channel 추가
-- ============================================================

ALTER TABLE public.sale_groups
ADD COLUMN IF NOT EXISTS sale_channel text NOT NULL DEFAULT 'no_guide'
CHECK (
  sale_channel IN ('no_guide', 'guide', 'local_guide', 'kakao', 'online')
);


-- ============================================================
-- STEP 3: guide_commission_settlements 정산 테이블 생성
-- ============================================================

CREATE TABLE IF NOT EXISTS public.guide_commission_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id bigint NOT NULL REFERENCES public.guides(id),
  amount numeric NOT NULL CHECK (amount > 0),
  settlement_type text NOT NULL CHECK (settlement_type IN ('partial', 'full')),
  balance_before numeric NOT NULL,
  balance_after numeric NOT NULL CHECK (balance_after >= 0),
  payment_method text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- guide_point_ledger에 settlement_id 추가
ALTER TABLE public.guide_point_ledger
ADD COLUMN IF NOT EXISTS settlement_id uuid
REFERENCES public.guide_commission_settlements(id);


-- ============================================================
-- STEP 4: 이름 정규화 함수
-- ============================================================

CREATE OR REPLACE FUNCTION public.normalize_guide_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'));
END;
$$;


-- ============================================================
-- STEP 5: resolve_or_create_local_guide RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_or_create_local_guide(
  p_name text DEFAULT NULL,
  p_existing_guide_id bigint DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guide_id bigint;
  v_norm text;
  v_guide_type text;
BEGIN
  -- 기존 ID가 제공된 경우: 로컬 가이드인지 검증 후 반환
  IF p_existing_guide_id IS NOT NULL THEN
    SELECT id, guide_type INTO v_guide_id, v_guide_type
    FROM public.guides
    WHERE id = p_existing_guide_id;

    IF v_guide_id IS NULL THEN
      RAISE EXCEPTION 'Guide not found: %', p_existing_guide_id;
    END IF;
    IF v_guide_type != 'local' THEN
      RAISE EXCEPTION 'Guide % is not a local guide (type: %)', p_existing_guide_id, v_guide_type;
    END IF;
    RETURN v_guide_id;
  END IF;

  -- 이름 기반 검색/생성
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Guide name is required';
  END IF;

  v_norm := public.normalize_guide_name(p_name);

  -- 기존 로컬 가이드 검색
  SELECT id INTO v_guide_id
  FROM public.guides
  WHERE normalized_name = v_norm
    AND guide_type = 'local'
  LIMIT 1;

  IF v_guide_id IS NOT NULL THEN
    RETURN v_guide_id;
  END IF;

  -- 없으면 새로 생성
  INSERT INTO public.guides (name, guide_type, normalized_name, commission_enabled)
  VALUES (p_name, 'local', v_norm, true)
  RETURNING id INTO v_guide_id;

  RETURN v_guide_id;
END;
$$;


-- ============================================================
-- STEP 6: 기존 local_guide_name → 로컬 가이드 레코드 마이그레이션
-- ============================================================

DO $$
DECLARE
  rec RECORD;
  norm text;
  existing_guide_id bigint;
BEGIN
  FOR rec IN
    SELECT DISTINCT local_guide_name
    FROM public.sale_groups
    WHERE local_guide_name IS NOT NULL
      AND local_guide_name != ''
      AND local_guide_name != '__ONLINE__'
      AND local_guide_name != '__KAKAO_FRIEND__'
  LOOP
    norm := public.normalize_guide_name(rec.local_guide_name);

    SELECT id INTO existing_guide_id
    FROM public.guides
    WHERE normalized_name = norm
      AND guide_type = 'local'
    LIMIT 1;

    IF existing_guide_id IS NULL THEN
      INSERT INTO public.guides (name, guide_type, normalized_name, commission_enabled)
      VALUES (rec.local_guide_name, 'local', norm, true)
      RETURNING id INTO existing_guide_id;
    END IF;

    -- sale_groups의 guide_id 연결 (이미 일반 가이드가 연결된 경우 제외)
    UPDATE public.sale_groups
    SET guide_id = existing_guide_id
    WHERE local_guide_name = rec.local_guide_name
      AND guide_id IS NULL;
  END LOOP;
END $$;


-- ============================================================
-- STEP 7: sale_channel 기존 데이터 마이그레이션
-- ============================================================

UPDATE public.sale_groups
SET sale_channel = CASE
  WHEN local_guide_name = '__KAKAO_FRIEND__' THEN 'kakao'
  WHEN local_guide_name = '__ONLINE__' THEN 'online'
  WHEN guide_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.guides WHERE id = guide_id AND guide_type = 'local'
  ) THEN 'local_guide'
  WHEN guide_id IS NOT NULL THEN 'guide'
  ELSE 'no_guide'
END
WHERE sale_channel = 'no_guide';


-- ============================================================
-- STEP 8: 직원 마이그레이션 (Peter, Ella → employee 유형)
-- ============================================================

-- Peter
UPDATE public.guides
SET guide_type = 'employee',
    commission_enabled = false,
    employee_id = (
      SELECT id FROM public.employees
      WHERE lower(english_name) LIKE '%peter%'
      LIMIT 1
    )
WHERE lower(regexp_replace(trim(name), '\s+', '', 'g')) LIKE '%peter%'
  AND guide_type = 'regular';

-- Ella
UPDATE public.guides
SET guide_type = 'employee',
    commission_enabled = false,
    employee_id = (
      SELECT id FROM public.employees
      WHERE lower(english_name) LIKE '%ella%'
      LIMIT 1
    )
WHERE lower(regexp_replace(trim(name), '\s+', '', 'g')) LIKE '%ella%'
  AND guide_type = 'regular';

-- Mr.Moon: 현금 할인 10%, 커미션 0%
UPDATE public.guides
SET commission_enabled = false,
    fixed_commission_rate = NULL
WHERE lower(regexp_replace(trim(name), '\s+', '', 'g')) LIKE '%mrmoon%';


-- ============================================================
-- STEP 9: 표준 커미션 계산 함수 (핵심)
-- ============================================================

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
BEGIN
  -- 1. sale_groups 잠금
  SELECT * INTO v_sale_group
  FROM public.sale_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale group not found: %', p_group_id;
  END IF;

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

    DELETE FROM public.guide_point_ledger
    WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale';
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
  -- commission_enabled=false인 경우 커미션 0 (Mr.Moon 등)
  IF NOT COALESCE(v_guide.commission_enabled, true) THEN
    v_guide_rate := 0;
    v_commission := 0;

  ELSIF v_guide.guide_type = 'employee' THEN
    -- 직원: 항상 0%
    v_guide_rate := 0;
    v_commission := 0;

  ELSIF v_guide.fixed_commission_rate IS NOT NULL THEN
    -- 고정 커미션율 (예: 로컬 가이드 10% 등)
    v_guide_rate := v_guide.fixed_commission_rate;
    v_commission := round(v_subtotal * v_guide_rate, 2);

  ELSIF v_guide.guide_type = 'local' THEN
    -- 로컬 가이드: 전 상품 10%
    v_guide_rate := 0.10;
    v_commission := round(v_subtotal * v_guide_rate, 2);

  ELSIF v_guide.guide_type = 'regular' THEN
    -- 일반 가이드: 날짜·상품별 10% 또는 20%
    v_sold_at_manila := (v_sale_group.sold_at AT TIME ZONE 'Asia/Manila');

    IF v_sold_at_manila < '2026-08-13 00:00:00' THEN
      -- 이전: 전 상품 10%
      v_guide_rate := 0.10;
      v_commission := round(v_subtotal * v_guide_rate, 2);
    ELSE
      -- 이후: 의류(TP/BT/DR) 20%, 기타 10%
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
    DELETE FROM public.guide_point_ledger
    WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale';
  END IF;
END;
$$;


-- ============================================================
-- STEP 10: 기존 함수를 표준 함수로 교체
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalc_one_sale_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_guide_commission(p_group_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_sale_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_guide_commission(p_group_id);
END;
$$;


-- ============================================================
-- STEP 11: 자동 재계산 트리거 (sales)
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_sales_recalc_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_group_id uuid;
  v_new_group_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recalculate_guide_commission(NEW.sale_group_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_guide_commission(OLD.sale_group_id);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_group_id := OLD.sale_group_id;
    v_new_group_id := NEW.sale_group_id;

    IF v_old_group_id IS DISTINCT FROM v_new_group_id THEN
      IF v_old_group_id IS NOT NULL THEN
        PERFORM public.recalculate_guide_commission(v_old_group_id);
      END IF;
      IF v_new_group_id IS NOT NULL THEN
        PERFORM public.recalculate_guide_commission(v_new_group_id);
      END IF;
    ELSE
      IF OLD.price IS DISTINCT FROM NEW.price
         OR OLD.qty IS DISTINCT FROM NEW.qty
         OR OLD.refunded_at IS DISTINCT FROM NEW.refunded_at
         OR OLD.free_gift IS DISTINCT FROM NEW.free_gift
         OR OLD.code IS DISTINCT FROM NEW.code THEN
        PERFORM public.recalculate_guide_commission(NEW.sale_group_id);
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_recalc ON public.sales;
CREATE TRIGGER trg_sales_recalc
  AFTER INSERT OR DELETE OR UPDATE OF sale_group_id, price, qty, refunded_at, free_gift, code
  ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sales_recalc_commission();


-- ============================================================
-- STEP 12: 자동 재계산 트리거 (sale_groups)
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_sale_groups_recalc_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.guide_id IS DISTINCT FROM NEW.guide_id
       OR OLD.sold_at IS DISTINCT FROM NEW.sold_at THEN
      PERFORM public.recalculate_guide_commission(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_groups_recalc ON public.sale_groups;
CREATE TRIGGER trg_sale_groups_recalc
  AFTER UPDATE OF guide_id, sold_at
  ON public.sale_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sale_groups_recalc_commission();


-- ============================================================
-- STEP 13: 중복 earn_from_sale 정리
-- ============================================================

WITH duplicates AS (
  SELECT id,
         sale_group_id,
         ROW_NUMBER() OVER (PARTITION BY sale_group_id ORDER BY created_at DESC) as rn
  FROM public.guide_point_ledger
  WHERE reason = 'earn_from_sale'
    AND sale_group_id IS NOT NULL
)
DELETE FROM public.guide_point_ledger
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);


-- ============================================================
-- STEP 14: 고유 인덱스 생성 (중복 방지)
-- ============================================================

-- earn_from_sale: sale_group_id당 1건만
CREATE UNIQUE INDEX IF NOT EXISTS guide_point_ledger_one_sale_earn
ON public.guide_point_ledger (sale_group_id, reason)
WHERE sale_group_id IS NOT NULL
  AND reason = 'earn_from_sale';

-- settlement_id 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS guide_point_ledger_one_settlement
ON public.guide_point_ledger (settlement_id)
WHERE settlement_id IS NOT NULL;


-- ============================================================
-- STEP 15: 과거 전체 커미션 재계산
-- ============================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.sale_groups ORDER BY sold_at
  LOOP
    PERFORM public.recalculate_guide_commission(rec.id);
  END LOOP;
END $$;


-- ============================================================
-- STEP 16: 전체 정산 RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.settle_all_guide_commission(
  p_guide_id bigint,
  p_payment_method text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guide RECORD;
  v_current_balance numeric;
  v_settlement_id uuid;
  v_balance_before numeric;
  v_balance_after numeric;
BEGIN
  SELECT * INTO v_guide
  FROM public.guides
  WHERE id = p_guide_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guide not found: %', p_guide_id;
  END IF;

  SELECT COALESCE(SUM(delta), 0) INTO v_current_balance
  FROM public.guide_point_ledger
  WHERE guide_id = p_guide_id;

  IF v_current_balance <= 0 THEN
    RAISE EXCEPTION 'No balance to settle (current: %)', v_current_balance;
  END IF;

  v_balance_before := v_current_balance;
  v_balance_after := 0;

  INSERT INTO public.guide_commission_settlements (
    guide_id, amount, settlement_type, balance_before, balance_after,
    payment_method, paid_at, note
  )
  VALUES (
    p_guide_id, v_current_balance, 'full', v_balance_before, v_balance_after,
    p_payment_method, p_paid_at, p_note
  )
  RETURNING id INTO v_settlement_id;

  INSERT INTO public.guide_point_ledger (guide_id, delta, reason, settlement_id, note)
  VALUES (p_guide_id, -v_current_balance, 'commission_payout', v_settlement_id,
          COALESCE(p_note, 'Full settlement'));

  RETURN jsonb_build_object(
    'settlement_id', v_settlement_id,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'amount', v_current_balance
  );
END;
$$;


-- ============================================================
-- STEP 17: 부분 정산 RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.settle_guide_commission_to_balance(
  p_guide_id bigint,
  p_target_balance numeric,
  p_expected_current_balance numeric,
  p_payment_method text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guide RECORD;
  v_current_balance numeric;
  v_settlement_amount numeric;
  v_settlement_type text;
  v_settlement_id uuid;
BEGIN
  SELECT * INTO v_guide
  FROM public.guides
  WHERE id = p_guide_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guide not found: %', p_guide_id;
  END IF;

  SELECT COALESCE(SUM(delta), 0) INTO v_current_balance
  FROM public.guide_point_ledger
  WHERE guide_id = p_guide_id;

  IF v_current_balance != p_expected_current_balance THEN
    RAISE EXCEPTION 'Balance changed. Expected: %, Actual: %. Please refresh.',
      p_expected_current_balance, v_current_balance;
  END IF;

  IF p_target_balance < 0 THEN
    RAISE EXCEPTION 'Target balance cannot be negative';
  END IF;

  IF p_target_balance >= v_current_balance THEN
    RAISE EXCEPTION 'Target balance must be less than current balance';
  END IF;

  v_settlement_amount := v_current_balance - p_target_balance;
  v_settlement_type := CASE WHEN p_target_balance = 0 THEN 'full' ELSE 'partial' END;

  INSERT INTO public.guide_commission_settlements (
    guide_id, amount, settlement_type, balance_before, balance_after,
    payment_method, paid_at, note
  )
  VALUES (
    p_guide_id, v_settlement_amount, v_settlement_type,
    v_current_balance, p_target_balance,
    p_payment_method, p_paid_at, p_note
  )
  RETURNING id INTO v_settlement_id;

  INSERT INTO public.guide_point_ledger (guide_id, delta, reason, settlement_id, note)
  VALUES (p_guide_id, -v_settlement_amount, 'commission_payout', v_settlement_id,
          COALESCE(p_note, 'Partial settlement'));

  RETURN jsonb_build_object(
    'settlement_id', v_settlement_id,
    'balance_before', v_current_balance,
    'balance_after', p_target_balance,
    'amount', v_settlement_amount,
    'settlement_type', v_settlement_type
  );
END;
$$;


-- ============================================================
-- 완료! 모든 마이그레이션이 적용되었습니다.
-- ============================================================
