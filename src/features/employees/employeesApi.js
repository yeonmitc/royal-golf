import { sbSelect } from '../../db/supabaseRest';

const EMPLOYEE_CACHE_KEY = 'rg_employees_cache_v1';

function getCachedEmployees() {
  try {
    const cached = localStorage.getItem(EMPLOYEE_CACHE_KEY);
    const parsed = cached ? JSON.parse(cached) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveEmployeesToCache(employees) {
  try {
    localStorage.setItem(EMPLOYEE_CACHE_KEY, JSON.stringify(employees));
  } catch {
    // A local cache failure must not prevent employee data from being used.
  }
}

export async function fetchEmployees({ refresh = false } = {}) {
  const cached = getCachedEmployees();
  if (!refresh && cached) return cached;

  try {
    const rows = await sbSelect('employees', {
      select: 'id,korean_name,english_name,phone',
      order: { column: 'english_name', ascending: true },
      limit: 1000,
    });
    const employees = Array.isArray(rows) ? rows : [];
    saveEmployeesToCache(employees);
    return employees;
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('does not exist') && msg.includes('employees')) {
      saveEmployeesToCache([]);
      return [];
    }
    if (!refresh && cached) return cached;
    throw e;
  }
}

