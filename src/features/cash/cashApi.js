import { sbDelete, sbInsert, sbRpc, sbSelect, sbUpdate } from '../../db/supabaseRest';

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

export async function updateCashTransactionAmount({ id, amount, memo, occurredAt } = {}) {
  const txId = Number(id);
  const nextAmount = Number(amount);
  if (!txId) throw new Error('INVALID_ID');
  if (!Number.isFinite(nextAmount) || nextAmount === 0) throw new Error('INVALID_AMOUNT');
  const occurredAtIso = occurredAt ? String(occurredAt).trim() : null;

  try {
    await sbRpc('update_cash_tx_amount', {
      p_id: txId,
      p_amount: nextAmount,
      p_memo: memo ?? null,
      p_occurred_at: occurredAtIso ?? null,
    });
    const check = await sbSelect('cash_tx', {
      select: 'id,amount,memo,occurred_at',
      filters: [{ column: 'id', op: 'eq', value: txId }],
      limit: 1,
    });
    const row = check?.[0];
    const amt = Number(row?.amount);
    if (!Number.isFinite(amt) || amt !== nextAmount) throw new Error('CASH_TX_UPDATE_VERIFY_FAILED');
    if (memo != null && String(row?.memo ?? '') !== String(memo ?? '')) {
      throw new Error('CASH_TX_UPDATE_VERIFY_FAILED');
    }
    if (occurredAtIso) {
      const expected = Date.parse(occurredAtIso);
      const actual = Date.parse(String(row?.occurred_at || ''));
      if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected !== actual) {
        throw new Error('CASH_TX_UPDATE_VERIFY_FAILED');
      }
    }
    return { ok: true };
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.toLowerCase().includes('update_cash_tx_amount')) throw e;
  }

  const oldRows = await sbSelect('cash_tx', {
    select: 'id,account,amount',
    filters: [{ column: 'id', op: 'eq', value: txId }],
    limit: 1,
  });
  const old = oldRows?.[0];
  if (!old) throw new Error('NOT_FOUND');

  const delta = nextAmount - (Number(old.amount) || 0);
  if (!Number.isFinite(delta)) throw new Error('INVALID_DELTA');

  const balRows = await sbSelect('cash_balances', {
    select: 'account,balance',
    filters: [{ column: 'account', op: 'eq', value: old.account }],
    limit: 1,
  });
  const bal = balRows?.[0];
  const current = Number(bal?.balance) || 0;
  const nextBalance = current + delta;

  await sbUpdate(
    'cash_tx',
    {
      amount: nextAmount,
      ...(memo != null ? { memo } : {}),
      ...(occurredAtIso ? { occurred_at: occurredAtIso } : {}),
    },
    { filters: [{ column: 'id', op: 'eq', value: txId }], returning: 'minimal' }
  );
  await sbUpdate(
    'cash_balances',
    { balance: nextBalance },
    { filters: [{ column: 'account', op: 'eq', value: old.account }], returning: 'minimal' }
  );

  const check = await sbSelect('cash_tx', {
    select: 'id,amount,memo,occurred_at',
    filters: [{ column: 'id', op: 'eq', value: txId }],
    limit: 1,
  });
  const row = check?.[0];
  const amt = Number(row?.amount);
  if (!Number.isFinite(amt) || amt !== nextAmount) throw new Error('CASH_TX_UPDATE_VERIFY_FAILED');
  if (memo != null && String(row?.memo ?? '') !== String(memo ?? '')) {
    throw new Error('CASH_TX_UPDATE_VERIFY_FAILED');
  }
  if (occurredAtIso) {
    const expected = Date.parse(occurredAtIso);
    const actual = Date.parse(String(row?.occurred_at || ''));
    if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected !== actual) {
      throw new Error('CASH_TX_UPDATE_VERIFY_FAILED');
    }
  }

  return { ok: true };
}
