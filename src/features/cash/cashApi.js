import { sbDelete, sbInsert, sbSelect } from '../../db/supabaseRest';

/**
 * Fetch current balances for all accounts
 */
export async function getCashBalances() {
  const rows = await sbSelect('cash_balances', {
    order: { column: 'account', ascending: true },
  });
  return rows || [];
}

/**
 * Fetch recent transactions (default 3)
 */
export async function getCashTransactions(limit = 10) {
  const rows = await sbSelect('cash_tx', {
    order: { column: 'occurred_at', ascending: false },
    limit,
  });
  return rows || [];
}

/**
 * Add a new transaction
 * @param {Object} payload { account, amount, memo }
 */
export async function addCashTransaction(payload) {
  if (!payload.account) throw new Error('Account is required');
  if (payload.amount === 0) throw new Error('Amount cannot be 0');

  const [inserted] = await sbInsert('cash_tx', [payload]);
  return inserted;
}

/**
 * Delete a transaction
 * @param {string|number} id
 */
export async function deleteCashTransaction(id) {
  await sbDelete('cash_tx', {
    filters: [{ column: 'id', op: 'eq', value: id }],
  });
  return true;
}
