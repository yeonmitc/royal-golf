WITH
설정 AS (
  SELECT DATE '2025-12-16' AS 시작일
),

-- 1) 전체 사입수량(전체 재고 합) : 개당운영비 계산용
전체사입수량 AS (
  SELECT
    SUM(s + m + l + xl + "2xl" + "3xl" + free)::numeric AS 전체_사입수량
  FROM public.inventories
),

-- 2) 사입비 제외 운영지출(PHP 환산: PHP + KRW/25.5), CNY 무시
운영지출 AS (
  SELECT
    SUM(
      COALESCE(e.amount_php, 0)
      + (COALESCE(e.amount_krw, 0) / 25.5)
    )::numeric AS 운영지출_php
  FROM public.expenses e
  LEFT JOIN public.expense_categories c ON c.id = e.category_id
  WHERE e.expense_date >= (SELECT 시작일 FROM 설정)
    AND (
      c.name IS NULL
      OR NOT (
        c.name ILIKE '%사입%'
        OR c.name ILIKE '%의류%'
        OR c.name ILIKE '%매입%'
        OR c.name ILIKE '%원가%'
        OR c.name ILIKE '%구매%'
      )
    )
),

-- 3) 개당 운영비(PHP)
개당운영비 AS (
  SELECT
    CASE
      WHEN (SELECT 전체_사입수량 FROM 전체사입수량) > 0 THEN
        (SELECT 운영지출_php FROM 운영지출) / (SELECT 전체_사입수량 FROM 전체사입수량)
      ELSE 0
    END AS 개당운영비_php
),

-- 4) 제품별 판매 요약(환불 제외): 팔린갯수 / 총매출 / 평균판매가(올림)
판매요약 AS (
  SELECT
    s.code AS 제품코드,
    SUM(s.qty)::numeric AS 팔린갯수,
    SUM(s.price * s.qty)::numeric AS 실제총매출_php,
    CASE
      WHEN SUM(s.qty) > 0 THEN CEILING(SUM(s.price * s.qty) / SUM(s.qty))::bigint
      ELSE 0
    END AS 평균판매가_php
  FROM public.sales s
  WHERE s.refunded_at IS NULL
    AND s.sold_at::date >= (SELECT 시작일 FROM 설정)
  GROUP BY 1
),

-- 5) 제품별 재고 요약: 구매한갯수(사입수량 추정) / 현재재고
재고요약 AS (
  SELECT
    i.code AS 제품코드,
    (COALESCE(i.s,0) + COALESCE(i.m,0) + COALESCE(i.l,0) + COALESCE(i.xl,0)
     + COALESCE(i."2xl",0) + COALESCE(i."3xl",0) + COALESCE(i.free,0))::bigint AS 구매한갯수,
    COALESCE(i.total_qty,
      (COALESCE(i.s,0) + COALESCE(i.m,0) + COALESCE(i.l,0) + COALESCE(i.xl,0)
       + COALESCE(i."2xl",0) + COALESCE(i."3xl",0) + COALESCE(i.free,0))
    )::bigint AS 현재재고
  FROM public.inventories i
)

SELECT
  p.code AS "제품코드",

  -- ✅ 추가 컬럼
  COALESCE(inv.구매한갯수, 0) AS "구매한갯수",
  COALESCE(inv.현재재고, 0) AS "현재재고",
  COALESCE(sa.팔린갯수, 0)::bigint AS "팔린갯수",
  COALESCE(sa.평균판매가_php, 0) AS "평균판매가_php",
  CEILING(COALESCE(sa.실제총매출_php, 0))::bigint AS "실제총매출_php",

  -- 기존 컬럼(판매가/원가/오버헤드/실질원가/이익/이익률)
  CEILING(COALESCE(p.sale_price, 0))::bigint AS "현재판매가_php(설정)",
  CEILING(COALESCE(p.p1price, 0))::bigint AS "사입원가_php(p1price)",
  CEILING((SELECT 개당운영비_php FROM 개당운영비))::bigint AS "개당운영비_php",
  CEILING(COALESCE(p.p1price, 0)::numeric + (SELECT 개당운영비_php FROM 개당운영비))::bigint AS "실질원가_php",

  (
    CEILING(COALESCE(p.sale_price, 0))
    - CEILING(COALESCE(p.p1price, 0)::numeric + (SELECT 개당운영비_php FROM 개당운영비))
  )::bigint AS "개당이익_php(설정가 기준)",

  CASE
    WHEN COALESCE(p.sale_price, 0) > 0 THEN
      ROUND(
        (
          COALESCE(p.sale_price, 0)::numeric
          - (COALESCE(p.p1price, 0)::numeric + (SELECT 개당운영비_php FROM 개당운영비))
        )
        / COALESCE(p.sale_price, 0)::numeric * 100
      , 2)
    ELSE NULL
  END AS "이익률_%(설정가 기준)"

FROM public.products p
LEFT JOIN 재고요약 inv ON inv.제품코드 = p.code
LEFT JOIN 판매요약 sa ON sa.제품코드 = p.code
ORDER BY "이익률_%(설정가 기준)" DESC NULLS LAST, p.code;
