import { sbSelect, sbInsert } from '../../db/supabaseRest';

/**
 * Get all active guides
 */
export async function getGuides() {
  // sbSelect returns the data array directly or throws error
  return sbSelect('guides', {
    select: '*',
    filters: [{ column: 'is_active', op: 'eq', value: true }],
    order: { column: 'name', ascending: true },
  });
}

/**
 * Get guide stats (includes balance) from official view
 * Returns array of { guide_id, name, is_active, balance, last_tx_at }
 */
export async function getGuideStats() {
  try {
    return await sbSelect('v_guide_balances', {
      order: { column: 'name', ascending: true },
    });
  } catch (err) {
    console.warn('v_guide_balances view missing or error, falling back to manual calc:', err);
    
    // Fallback: Fetch guides + ledger manually
    const guides = await sbSelect('guides', {
      select: 'id, name, is_active',
      filters: [{ column: 'is_active', op: 'eq', value: true }],
      order: { column: 'name', ascending: true },
    });

    const ledger = await sbSelect('guide_point_ledger', { select: 'guide_id, delta, created_at' });
    
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
      balance: balanceMap[g.id] || 0,
      last_tx_at: lastTxMap[g.id] || null,
    }));
  }
}

/**
 * Adjust guide points (manual edit)
 * Inserts directly into ledger (delta)
 */
export async function adjustGuidePoints(guideId, amount, note) {
  return sbInsert('guide_point_ledger', {
    guide_id: guideId,
    delta: Number(amount),
    reason: 'admin_adjust',
    note: note || 'Manual update',
  });
}
