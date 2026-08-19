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
 * Returns array of { guide_id, name, is_active, guide_type, fixed_commission_rate, employee_id, balance, last_tx_at }
 */
export async function getGuideStats() {
  const guides = await sbSelect('guides', {
    select: 'id, name, is_active, guide_type, normalized_name, commission_enabled, fixed_commission_rate, employee_id',
    filters: [{ column: 'is_active', op: 'eq', value: true }],
    order: { column: 'name', ascending: true },
  });

  const ledger = await sbSelect('guide_point_ledger', { select: 'guide_id, delta, created_at, reason' });

  const balanceMap = {};
  const lastTxMap = {};

  (ledger || []).forEach((l) => {
    if (!l.guide_id) return;
    const val = Number(l.delta) || 0;
    balanceMap[l.guide_id] = (balanceMap[l.guide_id] || 0) + val;

    if (!lastTxMap[l.guide_id] || new Date(l.created_at) > new Date(lastTxMap[l.guide_id])) {
      lastTxMap[l.guide_id] = l.created_at;
    }
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
    last_tx_at: lastTxMap[g.id] || null,
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
 * Settle all commission for a guide (full settlement)
 * Calls settle_all_guide_commission RPC
 */
export async function settleAllGuideCommission(guideId, { paymentMethod, note, paidAt } = {}) {
  return sbRpc('settle_all_guide_commission', {
    p_guide_id: Number(guideId),
    p_payment_method: paymentMethod || null,
    p_note: note || null,
    p_paid_at: paidAt || new Date().toISOString(),
  });
}

/**
 * Settle commission to target balance (partial settlement)
 * Calls settle_guide_commission_to_balance RPC
 */
export async function settleGuideCommissionToBalance(guideId, targetBalance, expectedCurrentBalance, { paymentMethod, note, paidAt } = {}) {
  return sbRpc('settle_guide_commission_to_balance', {
    p_guide_id: Number(guideId),
    p_target_balance: Number(targetBalance),
    p_expected_current_balance: Number(expectedCurrentBalance),
    p_payment_method: paymentMethod || null,
    p_note: note || null,
    p_paid_at: paidAt || new Date().toISOString(),
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
    select: 'id, guide_id, amount, settlement_type, balance_before, balance_after, payment_method, paid_at, note, created_by, created_at',
    filters,
    order: { column: 'created_at', ascending: false },
    limit: 200,
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
