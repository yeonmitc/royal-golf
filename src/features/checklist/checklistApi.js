import { sbSelect, sbUpsert } from '../../db/supabaseRest';
import {
  getOfflineChecklistDaily,
  getOfflineChecklistDailyMonth,
  isBrowserOnline,
  removeOfflineChecklist,
  saveOfflineChecklistDaily,
} from '../offline/offlineDB';

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

// Detect failures caused by lack of connectivity (vs. real server errors).
function isNetworkError(err) {
  if (!isBrowserOnline()) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused')
  );
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
  const fetchOfflineRow = async () => {
    try {
      return await getOfflineChecklistDaily(checkDate);
    } catch {
      return null;
    }
  };

  if (!isBrowserOnline()) return fetchOfflineRow();

  try {
    const rows = await sbSelect('checklist_daily', {
      select: '*',
      filters: [{ column: 'check_date', op: 'eq', value: checkDate }],
      limit: 1,
    });
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (e) {
    if (isMissingChecklistDailyTable(e)) return null;
    if (isNetworkError(e)) return fetchOfflineRow();
    throw e;
  }
}

export async function fetchChecklistDailyMonth(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);

  let serverRows = [];
  let serverAvailable = isBrowserOnline();
  try {
    if (!serverAvailable) throw new Error('OFFLINE');
    const rows = await sbSelect('checklist_daily', {
      select: '*',
      filters: [
        { column: 'check_date', op: 'gte', value: start },
        { column: 'check_date', op: 'lte', value: end },
      ],
      limit: 100,
    });
    serverRows = Array.isArray(rows) ? rows : [];
  } catch (e) {
    if (isMissingChecklistDailyTable(e) || isNetworkError(e) || String(e?.message) === 'OFFLINE') {
      serverAvailable = false;
    } else {
      throw e;
    }
  }

  if (serverAvailable) return serverRows;

  let offlineRows = [];
  try {
    offlineRows = await getOfflineChecklistDailyMonth(year, month);
  } catch {
    /* ignore */
  }

  const byDate = new Map();
  for (const r of serverRows) byDate.set(r.check_date, r);
  for (const r of offlineRows) byDate.set(r.check_date, r);
  return Array.from(byDate.values());
}

export async function upsertChecklistDaily({ checkDate, totalCount, employees }) {
  const row = {
    check_date: checkDate,
    total_count: Number(totalCount || 0),
    employees: employees || {},
  };

  const queueLocally = async () => {
    await saveOfflineChecklistDaily({ checkDate, payload: row });
    return { ...row, offline: true };
  };

  if (!isBrowserOnline()) {
    return queueLocally();
  }

  try {
    const res = await sbUpsert('checklist_daily', [row], {
      onConflict: 'check_date',
      returning: 'representation',
    });
    await removeOfflineChecklist(`daily||${checkDate}`);
    return Array.isArray(res) ? res[0] : res;
  } catch (e) {
    if (isMissingChecklistDailyTable(e)) throw new Error('CHECKLIST_DAILY_TABLE_MISSING');
    if (isNetworkError(e)) return queueLocally();
    throw e;
  }
}
