import { sbDelete, sbInsert, sbSelect, sbUpdate } from '../../db/supabaseRest';

export async function getExpenseCategories() {
  const categories = await sbSelect('expense_categories', {
    select: '*',
    orders: [{ column: 'name', ascending: true }],
  });
  return categories || [];
}

export async function createExpenseCategory(name) {
  const rows = await sbInsert('expense_categories', [{ name }], { returning: 'representation' });
  return rows?.[0];
}

export async function getExpenses({ from, to, categoryId } = {}) {
  const filters = [];
  if (from) filters.push({ column: 'expense_date', op: 'gte', value: from });
  if (to) filters.push({ column: 'expense_date', op: 'lte', value: to });
  if (categoryId) filters.push({ column: 'category_id', op: 'eq', value: categoryId });

  const expenses = await sbSelect('expenses', {
    select: `
      *,
      expense_categories (
        id,
        name
      )
    `,
    filters,
    orders: [{ column: 'expense_date', ascending: false }],
  });

  return expenses || [];
}

export async function createExpense(payload) {
  // payload: { category_id, title, amount_krw, amount_php, amount_cny, method, expense_date, note }
  const rows = await sbInsert('expenses', [payload], { returning: 'representation' });

  const created = rows?.[0];

  if (created) {
    try {
      let cashAccount = null;
      let cashAmount = 0;

      // Determine account and amount based on payload
      if (Number(payload.amount_php) > 0) {
        cashAccount = 'php_cash';
        cashAmount = -Number(payload.amount_php);
      } else if (Number(payload.amount_krw) > 0) {
        if (payload.method === 'bankTranse') {
          cashAccount = 'krw_bank';
        } else {
          cashAccount = 'krw_cash';
        }
        cashAmount = -Number(payload.amount_krw);
      } else if (Number(payload.amount_usd) > 0) {
        cashAccount = 'usd_cash';
        cashAmount = -Number(payload.amount_usd);
      }

      if (cashAccount && cashAmount !== 0) {
        // Ensure occurred_at is a valid timestamp
        const occurredAt = payload.expense_date
          ? new Date(payload.expense_date).toISOString()
          : new Date().toISOString();

        await addCashTransaction({
          account: cashAccount,
          amount: cashAmount,
          memo: `[Expense] ${payload.title}`,
          occurred_at: occurredAt,
        });
      }
    } catch (err) {
      console.error('Failed to auto-create cash transaction for expense:', err);
      // We don't throw here to avoid rolling back the expense creation (which is already done)
      // Ideally this should be a transaction, but we are doing client-side chaining.
    }
  }

  return created;
}

export async function updateExpense(id, payload) {
  const rows = await sbUpdate('expenses', payload, {
    filters: [{ column: 'id', op: 'eq', value: id }],
    returning: 'representation',
  });
  return rows?.[0];
}

export async function deleteExpense(id) {
  await sbDelete('expenses', {
    filters: [{ column: 'id', op: 'eq', value: id }],
  });
  return true;
}
