
-- Function to get current balances for all guides
CREATE OR REPLACE FUNCTION get_guide_balances()
RETURNS TABLE (guide_id UUID, balance NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT l.guide_id, COALESCE(SUM(l.amount), 0) as balance
  FROM guide_point_ledger l
  GROUP BY l.guide_id;
END;
$$ LANGUAGE plpgsql;
