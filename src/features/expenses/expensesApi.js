import { sbSelect, sbInsert, sbUpdate, sbDelete } from '../../db/supabaseRest';

export async function getExpenseCategories() {
  const categories = await sbSelect('expense_categories', {
    select: '*',
    orders: [{ column: 'name', ascending: true }],
  });
  return categories || [];
}

export async function createExpenseCategory(name) {
  const rows = await sbInsert(
    'expense_categories',
    [{ name }],
    { returning: 'representation' }
  );
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
    orders: [{ column: 'expense_date', ascending: false }, { column: 'created_at', ascending: false }],
  });
  
  return expenses || [];
}

export async function createExpense(payload) {
  // payload: { category_id, title, amount_krw, amount_php, amount_cny, method, expense_date, note }
  const rows = await sbInsert(
    'expenses',
    [payload],
    { returning: 'representation' }
  );
  return rows?.[0];
}

export async function updateExpense(id, payload) {
  const rows = await sbUpdate(
    'expenses',
    payload,
    {
      filters: [{ column: 'id', op: 'eq', value: id }],
      returning: 'representation',
    }
  );
  return rows?.[0];
}

export async function deleteExpense(id) {
  await sbDelete('expenses', {
    filters: [{ column: 'id', op: 'eq', value: id }],
  });
  return true;
}
