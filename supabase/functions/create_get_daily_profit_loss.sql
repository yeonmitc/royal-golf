-- Supabase SQL Editor에서 실행하세요.
CREATE OR REPLACE FUNCTION get_daily_profit_loss(
  start_date date DEFAULT '2025-12-16',
  end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  date date,
  daily_revenue_php bigint,
  daily_expense_php bigint,
  daily_profit_php bigint,
  cumulative_profit_php bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
  params AS (
    SELECT
      start_date AS s_date,
      end_date AS e_date
  ),
  daily_sales AS (
    SELECT
      s.sold_at::date AS d_date,
      CEILING(SUM(COALESCE(s.price, 0) * COALESCE(s.qty, 0)))::bigint AS revenue
    FROM public.sales s
    WHERE s.refunded_at IS NULL
      AND s.sold_at::date >= (SELECT s_date FROM params)
      AND s.sold_at::date <= (SELECT e_date FROM params)
    GROUP BY 1
  ),
  daily_expenses AS (
    SELECT
      e.expense_date AS d_date,
      CEILING(
        SUM(
          COALESCE(e.amount_php, 0)
          + CEILING(COALESCE(e.amount_krw, 0) / 25.5)
        )
      )::bigint AS expense
    FROM public.expenses e
    WHERE e.expense_date >= (SELECT s_date FROM params)
      AND e.expense_date <= (SELECT e_date FROM params)
    GROUP BY 1
  ),
  date_series AS (
    SELECT generate_series(
      (SELECT s_date FROM params),
      (SELECT e_date FROM params),
      interval '1 day'
    )::date AS d_date
  ),
  daily_stats AS (
    SELECT
      d.d_date,
      COALESCE(r.revenue, 0)::bigint AS revenue,
      COALESCE(x.expense, 0)::bigint AS expense
    FROM date_series d
    LEFT JOIN daily_sales r ON r.d_date = d.d_date
    LEFT JOIN daily_expenses x ON x.d_date = d.d_date
  )
  SELECT
    ds.d_date AS date,
    ds.revenue AS daily_revenue_php,
    ds.expense AS daily_expense_php,
    (ds.revenue - ds.expense)::bigint AS daily_profit_php,
    SUM(ds.revenue - ds.expense) OVER (ORDER BY ds.d_date)::bigint AS cumulative_profit_php
  FROM daily_stats ds
  ORDER BY ds.d_date DESC; -- 최신 날짜가 위로 오도록 기본 정렬
END;
$$;
