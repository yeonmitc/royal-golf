-- Supabase RPC Function Creation
-- Run this SQL in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_staff_sold_stats()
RETURNS TABLE (
  "제품코드" text,
  "총제품갯수" bigint,
  "현재재고" bigint,
  "판매갯수" bigint,
  "판매가" bigint,
  "실제판매가" bigint,
  "총팔린사이즈" text
)
LANGUAGE sql
SECURITY DEFINER -- Allows users to bypass RLS to see these stats
SET search_path = public
AS $$
WITH
-- 1) 판매 요약 (환불 제외)
판매요약 AS (
  SELECT
    s.code AS 제품코드,
    SUM(s.qty)::bigint AS 판매갯수,
    SUM(s.price * s.qty)::numeric AS 총판매금액_php,
    CASE
      WHEN SUM(s.qty) > 0
        THEN CEILING(SUM(s.price * s.qty) / SUM(s.qty))::bigint
      ELSE 0
    END AS 실제판매가
  FROM public.sales s
  WHERE s.refunded_at IS NULL
  GROUP BY s.code
),

-- 2) 사이즈별 판매수량
사이즈별판매 AS (
  SELECT
    s.code AS 제품코드,
    s.size_std::text AS 사이즈,
    SUM(s.qty)::bigint AS 사이즈판매갯수
  FROM public.sales s
  WHERE s.refunded_at IS NULL
  GROUP BY s.code, s.size_std
),

-- 3) 사이즈 요약 텍스트
판매사이즈요약 AS (
  SELECT
    제품코드,
    string_agg(
      사이즈 || '(' || 사이즈판매갯수::text || ')',
      ', '
      ORDER BY 사이즈
    ) AS 총팔린사이즈
  FROM 사이즈별판매
  GROUP BY 제품코드
),

-- 4) 재고 요약
재고요약 AS (
  SELECT
    i.code AS 제품코드,
    COALESCE(
      i.total_qty,
      (COALESCE(i.s,0)+COALESCE(i.m,0)+COALESCE(i.l,0)+COALESCE(i.xl,0)
       +COALESCE(i."2xl",0)+COALESCE(i."3xl",0)+COALESCE(i.free,0))
    )::bigint AS 현재재고
  FROM public.inventories i
)

SELECT
  p.code AS "제품코드",
  (COALESCE(s.판매갯수, 0) + COALESCE(i.현재재고, 0))::bigint AS "총제품갯수",
  COALESCE(i.현재재고, 0)::bigint AS "현재재고",
  COALESCE(s.판매갯수, 0)::bigint AS "판매갯수",
  CEILING(COALESCE(p.sale_price, 0))::bigint AS "판매가",
  COALESCE(s.실제판매가, 0)::bigint AS "실제판매가",
  COALESCE(sz.총팔린사이즈, '-') AS "총팔린사이즈"
FROM public.products p
LEFT JOIN 판매요약 s ON s.제품코드 = p.code
LEFT JOIN 재고요약 i ON i.제품코드 = p.code
LEFT JOIN 판매사이즈요약 sz ON sz.제품코드 = p.code
ORDER BY
  COALESCE(s.판매갯수, 0) DESC,
  p.code;
$$;

-- Grant permissions to allow everyone (including anon) to execute this function
GRANT EXECUTE ON FUNCTION get_staff_sold_stats() TO anon, authenticated, service_role;
