import { sbSelect, sbInsert, sbRpc } from '../../db/supabaseRest';

/**
 * Get all active guides (with guide_type, fixed_commission_rate, employee_id)
 */
export async function getGuides() {
  return sbSelect('guides', {
    select: 'id, name, is_active, guide_type, normalized_name, commission_enabled, fixed_commission_rate, employee_id',
    filters: [{ column: 'is_active', op: 'eq', value: true }],
    order: { column: 'name', ascending: true },
  });
}

/**
 * Get guide stats (includes balance, guide_type, etc.)
 * Balance = unsettled commission from sale_groups (not ledger)
 */
export async function getGuideStats() {
  const guides = await sbSelect('guides', {
    select: 'id, name, is_active, guide_type, normalized_name, commission_enabled, fixed_commission_rate, employee_id',
    filters: [{ column: 'is_active', op: 'eq', value: true }],
    order: { column: 'name', ascending: true },
  });

  // 가이드별 미정산 커미션 합계 (RPC)
  const balances = await sbRpc('get_guide_unsettled_balances');
  const balanceMap = {};
  (balances || []).forEach((b) => {
    balanceMap[b.guide_id] = Number(b.unsettled_amount) || 0;
  });

  return (guides || []).map((g) => ({
    guide_id: g.id,
    name: g.name,
    is_active: g.is_active,
    guide_type: g.guide_type || 'regular',
    commission_enabled: g.commission_enabled !== false,
    fixed_commission_rate: g.fixed_commission_rate,
    employee_id: g.employee_id,
    balance: balanceMap[g.id] || 0,
  }));
}

/**
 * Adjust guide points (manual admin_adjust via ledger)
 * Used for admin point increase or non-settlement decrease
 */
export async function adjustGuidePoints(guideId, amount, note) {
  return sbInsert('guide_point_ledger', {
    guide_id: guideId,
    delta: Number(amount),
    reason: 'admin_adjust',
    note: note || 'Manual update',
  });
}

/**
 * Get settlement history for a guide (or all guides)
 */
export async function getSettlementHistory({ guideId } = {}) {
  const filters = [];
  if (guideId) {
    filters.push({ column: 'guide_id', op: 'eq', value: Number(guideId) });
  }
  return sbSelect('guide_commission_settlements', {
    select: 'id, guide_id, amount, paid_at, note, created_at',
    filters,
    order: { column: 'created_at', ascending: false },
    limit: 200,
  });
}

/**
 * Get unsettled sale groups for a guide
 * Calls get_guide_unsettled_sales RPC
 */
export async function getGuideUnsettledSales(guideId) {
  return sbRpc('get_guide_unsettled_sales', {
    p_guide_id: Number(guideId),
  });
}

/**
 * Settle selected sale groups for a guide
 * Calls settle_guide_sales RPC
 */
export async function settleGuideSales(guideId, saleGroupIds, { note, paidAt } = {}) {
  return sbRpc('settle_guide_sales', {
    p_guide_id: Number(guideId),
    p_sale_group_ids: saleGroupIds,
    p_note: note || null,
    p_paid_at: paidAt || new Date().toISOString(),
  });
}

/**
 * Resolve or create local guide via RPC
 */
export async function resolveOrCreateLocalGuide({ name, existingGuideId } = {}) {
  return sbRpc('resolve_or_create_local_guide', {
    p_name: name || null,
    p_existing_guide_id: existingGuideId || null,
  });
}
