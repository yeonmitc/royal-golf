-- Migration: 20260102_refactor_guide_balances.sql

-- 1. Create View for Official Guide Balances
-- This view aggregates all delta transactions to provide the current balance.
CREATE OR REPLACE VIEW public.v_guide_balances AS
SELECT 
    g.id as guide_id,
    g.name,
    g.is_active,
    COALESCE(SUM(l.delta), 0) as balance,
    MAX(l.created_at) as last_tx_at
FROM 
    public.guides g
LEFT JOIN 
    public.guide_point_ledger l ON g.id = l.guide_id
GROUP BY 
    g.id, g.name, g.is_active;

-- 2. Create RPC function for Admin Point Adjustment
-- This ensures all manual adjustments are recorded with 'admin_adjust' reason.
CREATE OR REPLACE FUNCTION public.adjust_guide_points(
  p_guide_id UUID,
  p_delta NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'delta must be non-zero';
  END IF;

  INSERT INTO public.guide_point_ledger (guide_id, delta, reason, note)
  VALUES (p_guide_id, p_delta, 'admin_adjust', p_note);
END;
$$;
