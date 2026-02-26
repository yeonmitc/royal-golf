import { sbInsert, sbSelect } from '../../db/supabaseRest';

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
    limit: 1,
  });
  return logs && logs.length > 0 ? logs[0] : null;
}

// 2. Record attendance
export async function recordAttendance({ employeeName, shiftType, location, isTardy }) {
  // Store Local Time as UTC so it appears correctly in Supabase dashboard
  const now = new Date();
  const attendanceTime = getLocalAsUtcISOString(now);

  const payload = {
    employee_name: employeeName,
    shift_type: shiftType,
    location: location || {},
    is_tardy: isTardy,
    attendance_time: attendanceTime,
  };

  const result = await sbInsert('attendance_logs', [payload]);
  return result;
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
