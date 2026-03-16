import { sbSelect } from '../../db/supabaseRest';

export async function fetchEmployees() {
  try {
    const rows = await sbSelect('employees', {
      select: 'id,korean_name,english_name,phone',
      order: { column: 'english_name', ascending: true },
      limit: 1000,
    });
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('does not exist') && msg.includes('employees')) return [];
    throw e;
  }
}

