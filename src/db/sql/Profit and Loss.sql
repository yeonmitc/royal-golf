/*
  일별 누적 손익 (PHP 기준)
  - 모든 소수점은 올림 처리 (CEILING)
  - CNY 완전 무시
*/

WITH
params AS (
  SELECT
    DATE '2025-12-16' AS 시작일,
    CURRENT_DATE AS 종료일
),

-- 1) 일별 매출 (PHP)
일별_매출 AS (
  SELECT
    s.sold_at::date AS 날짜,
    CEILING(SUM(COALESCE(s.price, 0) * COALESCE(s.qty, 0)))::bigint AS 수익_php
  FROM public.sales s
  WHERE s.refunded_at IS NULL
  GROUP BY 1
),

-- 2) 일별 지출 (PHP 환산, 올림)
일별_지출 AS (
  SELECT
    e.expense_date AS 날짜,
    CEILING(
      SUM(
        COALESCE(e.amount_php, 0)
        + CEILING(COALESCE(e.amount_krw, 0) / 25.5)
      )
    )::bigint AS 지출_php
  FROM public.expenses e
  GROUP BY 1
),

-- 3) 날짜 스파인 (오픈일부터)
날짜_목록 AS (
  SELECT generate_series(
    (SELECT 시작일 FROM params),
    (SELECT 종료일 FROM params),
    interval '1 day'
  )::date AS 날짜
),

-- 4) 조인
일별_손익 AS (
  SELECT
    d.날짜,
    COALESCE(r.수익_php, 0)::bigint AS 수익_php,
    COALESCE(x.지출_php, 0)::bigint AS 지출_php
  FROM 날짜_목록 d
  LEFT JOIN 일별_매출 r ON r.날짜 = d.날짜
  LEFT JOIN 일별_지출 x ON x.날짜 = d.날짜
)

SELECT
  날짜                                    AS 날짜,
  수익_php                                AS 일일_수익_php,
  지출_php                                AS 일일_지출_php,
  (수익_php - 지출_php)::bigint            AS 일일_순손익_php,
  SUM(수익_php - 지출_php)
    OVER (ORDER BY 날짜)::bigint           AS 누적_순손익_php
FROM 일별_손익
ORDER BY 날짜;
