-- ============================================================================
-- finalize_offline_sale_group RPC
--
-- 오프라인 판매 snapshot을 최종 반영하는 전용 RPC.
-- 기존 finalize_sale_group(p_group_id) 은 수정하지 않고,
-- 오프라인 sync 성공 후 이 RPC를 한 번 호출하여 snapshot 값을 보존한다.
--
-- 동작:
--   1. p_offline_group_id가 해당 sale_group과 일치하는지 확인
--   2. 기존 recalculate_guide_commission으로 올바른 commission 계산
--   3. 클라이언트가 snapshot으로 보낸 guide_rate / guide_commission 으로 최종 덮어쓰기
--   4. guide_point_ledger 장부 동기화 (기존 UPSERT 정책과 동일)
--   5. 중복 호출 시 장부가 중복 생성되지 않음 (멱등)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalize_offline_sale_group(
  p_group_id         uuid,
  p_offline_group_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_group  RECORD;
  v_guide_id    bigint;
  v_offline_rate numeric;
  v_offline_comm numeric;
  v_comm        numeric;
  v_is_settled  boolean := false;
BEGIN
  IF p_group_id IS NULL OR p_offline_group_id IS NULL THEN RETURN; END IF;

  -- 1. 해당 sale_group이 실제로 이 offline_group_id 인지 확인
  SELECT * INTO v_sale_group
  FROM public.sale_groups
  WHERE id = p_group_id AND offline_group_id = p_offline_group_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  v_guide_id     := v_sale_group.guide_id;
  v_offline_rate := COALESCE(v_sale_group.guide_rate, 0);
  v_offline_comm := COALESCE(v_sale_group.guide_commission, 0);

  -- 2. 기존 recalculate_guide_commission으로 올바른 commission 계산
  PERFORM public.recalculate_guide_commission(p_group_id);

  -- 3. 클라이언트 snapshot 값으로 guide_rate / guide_commission 최종 덮어쓰기
  --    (recalculate_guide_commission이 온라인 정책으로 계산한 값을
  --     오프라인 snapshot으로 교체)
  IF v_offline_rate > 0 OR v_offline_comm > 0 THEN
    UPDATE public.sale_groups
       SET guide_rate       = v_offline_rate,
           guide_commission = v_offline_comm
     WHERE id = p_group_id;

    v_comm := v_offline_comm;
  ELSE
    -- snapshot에 commission 정보가 없으면 recalculate 결과 사용
    SELECT guide_commission INTO v_comm
    FROM public.sale_groups WHERE id = p_group_id;
  END IF;

  -- 4. guide_point_ledger 동기화 (기존 UPSERT 정책과 동일)
  IF v_guide_id IS NULL THEN RETURN; END IF;

  -- 정산 완료 여부 확인
  SELECT EXISTS (
    SELECT 1 FROM public.guide_point_ledger gpl
     WHERE gpl.sale_group_id = p_group_id AND gpl.reason = 'earn_from_sale'
       AND EXISTS (
         SELECT 1 FROM public.guide_point_ledger payout
          WHERE payout.guide_id = gpl.guide_id
            AND payout.reason = 'commission_payout'
            AND payout.created_at >= gpl.created_at
       )
  ) INTO v_is_settled;

  IF COALESCE(v_comm, 0) > 0 THEN
    -- commission > 0: 장부 UPSERT
    IF EXISTS (
      SELECT 1 FROM public.guide_point_ledger
       WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale'
    ) THEN
      IF NOT v_is_settled THEN
        UPDATE public.guide_point_ledger
           SET delta    = v_comm,
               guide_id = v_guide_id,
               note     = 'Offline sale snapshot commission'
         WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale';
      END IF;
      -- 이미 정산 완료면 delta=0 유지 (기존 정산 보호)
    ELSE
      INSERT INTO public.guide_point_ledger (guide_id, delta, reason, sale_group_id, note)
      VALUES (v_guide_id, v_comm, 'earn_from_sale', p_group_id, 'Offline sale snapshot commission');
    END IF;
  ELSE
    -- commission = 0: 정산 완료건이면 delta=0으로만, 아니면 삭제
    IF v_is_settled THEN
      UPDATE public.guide_point_ledger
         SET delta = 0,
             note  = 'Zeroed (settled, offline commission=0)'
       WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale';
    ELSE
      DELETE FROM public.guide_point_ledger
       WHERE sale_group_id = p_group_id AND reason = 'earn_from_sale';
    END IF;
  END IF;
END;
$$;

-- 권한: authenticated + service_role 만. anon 불가.
REVOKE EXECUTE ON FUNCTION public.finalize_offline_sale_group(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_offline_sale_group(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_offline_sale_group(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
