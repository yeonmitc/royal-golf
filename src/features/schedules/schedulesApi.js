import { sbDelete, sbInsert, sbSelect } from '../../db/supabaseRest';

export async function getEmployeeSchedules({ from, to } = {}) {
  const filters = [];
  if (from) filters.push({ column: 'work_date', op: 'gte', value: from });
  if (to) filters.push({ column: 'work_date', op: 'lte', value: to });

  const rows = await sbSelect('employee_schedules', {
    select: 'id,employee_id,shift_type,work_date,created_at',
    filters,
    orders: [
      { column: 'work_date', ascending: true },
      { column: 'shift_type', ascending: true },
      { column: 'created_at', ascending: true },
    ],
    limit: 2000,
  });

  return Array.isArray(rows) ? rows : [];
}

export async function createEmployeeSchedule(payload) {
  const rows = await sbInsert('employee_schedules', [payload], { returning: 'representation' });
  return rows?.[0];
}

export async function deleteEmployeeSchedule(id) {
  await sbDelete('employee_schedules', { filters: [{ column: 'id', op: 'eq', value: id }] });
  return true;
}

