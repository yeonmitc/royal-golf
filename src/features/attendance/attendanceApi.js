import { sbDelete, sbInsert, sbSelect, sbUpdate } from '../../db/supabaseRest';

// Helper: Convert a Date object to an ISO string representing the local time as UTC.
// Example: If local time is 14:00 (UTC+8), this returns "...T14:00:00.000Z"
function getLocalAsUtcISOString(date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(date.getTime() - offsetMs);
  return localDate.toISOString();
}

// 1. Check if employee already stamped today
export async function checkDailyAttendance(employeeName) {
  if (!employeeName) return null;

  const now = new Date();
  // Set start of day in local time
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  // Use Local-as-UTC for query to match stored format
  const startIso = getLocalAsUtcISOString(start);

  const logs = await sbSelect('attendance_logs', {
    select: '*',
    filters: [
      { column: 'employee_name', op: 'eq', value: employeeName },
      { column: 'attendance_time', op: 'gte', value: startIso },
    ],
    order: { column: 'attendance_time', ascending: false },
    limit: 1,
  });
  return logs && logs.length > 0 ? logs[0] : null;
}

// 2. Record attendance
export async function recordAttendance({ employeeName, shiftType, location, isTardy, attendanceTime }) {
  const at = attendanceTime instanceof Date ? attendanceTime : new Date();
  const attendanceTimeIso = getLocalAsUtcISOString(at);

  const payload = {
    employee_name: employeeName,
    shift_type: shiftType,
    location: location || {},
    is_tardy: isTardy,
    attendance_time: attendanceTimeIso,
  };

  const result = await sbInsert('attendance_logs', [payload]);
  return result;
}

export async function updateAttendanceLog({ id, employeeName, shiftType, attendanceTime }) {
  if (!id) throw new Error('ID is required.');
  const values = {};
  if (employeeName != null) values.employee_name = employeeName;
  if (shiftType != null) values.shift_type = shiftType;
  if (attendanceTime instanceof Date) values.attendance_time = getLocalAsUtcISOString(attendanceTime);
  if (arguments?.[0]?.location != null) values.location = arguments[0].location;
  if (arguments?.[0]?.isTardy != null) values.is_tardy = Boolean(arguments[0].isTardy);
  if (Object.keys(values).length === 0) return null;

  await sbUpdate('attendance_logs', values, {
    filters: [{ column: 'id', op: 'eq', value: id }],
    returning: 'representation',
  });
  return { ok: true };
}

export async function deleteAttendanceLog({ id }) {
  if (!id) throw new Error('ID is required.');
  await sbDelete('attendance_logs', {
    filters: [{ column: 'id', op: 'eq', value: id }],
    returning: 'minimal',
  });
  return { ok: true };
}

// 3. Fetch monthly attendance for all employees
export async function fetchMonthlyAttendance(year, month) {
  // Start of month
  const start = new Date(year, month - 1, 1);
  start.setHours(0, 0, 0, 0);

  // End of month
  const end = new Date(year, month, 0);
  end.setHours(23, 59, 59, 999);

  // Use Local-as-UTC for query
  const startIso = getLocalAsUtcISOString(start);
  const endIso = getLocalAsUtcISOString(end);

  const logs = await sbSelect('attendance_logs', {
    select: '*',
    filters: [
      { column: 'attendance_time', op: 'gte', value: startIso },
      { column: 'attendance_time', op: 'lte', value: endIso },
    ],
    limit: 1000, 
  });
  
  return logs || [];
}
