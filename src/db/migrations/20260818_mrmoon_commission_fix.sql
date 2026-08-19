-- ============================================================
-- Mr.Moon 커미션 수정 마이그레이션
-- SPEC: ROYAL_GOLF_ANALYZE_COMMISSION_DISCOUNT_SPEC_KO.md
-- ============================================================

-- Mr.Moon: commission_enabled = false, fixed_commission_rate = NULL
UPDATE public.guides
SET commission_enabled = false,
    fixed_commission_rate = NULL
WHERE lower(regexp_replace(trim(name), '\s+', '', 'g')) LIKE '%mrmoon%';

-- Mr.Moon의 과거 sale_groups에서 earn_from_sale 적립 제거
DELETE FROM public.guide_point_ledger
WHERE reason = 'earn_from_sale'
  AND guide_id IN (
    SELECT id FROM public.guides
    WHERE lower(regexp_replace(trim(name), '\s+', '', 'g')) LIKE '%mrmoon%'
  );

-- Mr.Moon의 과거 sale_groups 커미션 재계산 (0으로 설정)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT sg.id
    FROM public.sale_groups sg
    JOIN public.guides g ON g.id = sg.guide_id
    WHERE lower(regexp_replace(trim(g.name), '\s+', '', 'g')) LIKE '%mrmoon%'
  LOOP
    PERFORM public.recalculate_guide_commission(rec.id);
  END LOOP;
END $$;

-- ============================================================
-- 완료
-- ============================================================
