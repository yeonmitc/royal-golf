import { sbSelect, sbUpsert } from '../../db/supabaseRest';

function isMissingChecklistDailyTable(err) {
  const msg = String(err?.message || err || '');
  if (!msg) return false;
  if (msg.startsWith('SUPABASE_HTTP_404')) return true;
  if (msg.toLowerCase().includes('<!doctype html')) return true;
  const lower = msg.toLowerCase();
  const hasTable = lower.includes('checklist_daily');
  const looksMissing =
    msg.includes('Not Found') ||
    msg.includes('404') ||
    lower.includes('does not exist') ||
    msg.includes('PGRST') ||
    lower.includes('could not find');
  return hasTable && looksMissing;
}

export async function upsertChecklistSummary({ checkDate, employeeNames, totalCount, checkedCount }) {
  const row = {
    check_date: checkDate,
    employee_names: employeeNames,
    total_count: Number(totalCount || 0),
    checked_count: Number(checkedCount || 0),
  };
  const res = await sbUpsert('checklist_logs', [row], {
    onConflict: 'check_date,employee_names',
    returning: 'representation',
  });
  return Array.isArray(res) ? res[0] : res;
}

export async function fetchChecklistSummary({ year, month }) {
  // Pull logs for a month for display if needed
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  const rows = await sbSelect('checklist_logs', {
    select: '*',
    filters: [
      { column: 'check_date', op: 'gte', value: start.toISOString().slice(0, 10) },
      { column: 'check_date', op: 'lte', value: end.toISOString().slice(0, 10) },
    ],
    limit: 1000,
  });
  return Array.isArray(rows) ? rows : [];
}

export async function fetchChecklistDaily(checkDate) {
  try {
    const rows = await sbSelect('checklist_daily', {
      select: '*',
      filters: [{ column: 'check_date', op: 'eq', value: checkDate }],
      limit: 1,
    });
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (e) {
    if (isMissingChecklistDailyTable(e)) return null;
    throw e;
  }
}

export async function upsertChecklistDaily({ checkDate, totalCount, employees }) {
  const row = {
    check_date: checkDate,
    total_count: Number(totalCount || 0),
    employees: employees || {},
  };
  try {
    const res = await sbUpsert('checklist_daily', [row], {
      onConflict: 'check_date',
      returning: 'representation',
    });
    return Array.isArray(res) ? res[0] : res;
  } catch (e) {
    if (isMissingChecklistDailyTable(e)) throw new Error('CHECKLIST_DAILY_TABLE_MISSING');
    throw e;
  }
}
