import { sbInsert, sbSelect } from '../../db/supabaseRest';

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
export async function getCashTransactions(limit = 3) {
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
