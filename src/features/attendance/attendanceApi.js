import { sbDelete, sbInsert, sbSelect, sbUpdate } from '../../db/supabaseRest';
import {
  addOfflineAttendance,
  getOfflineAttendanceInRange,
  isBrowserOnline,
} from '../offline/offlineDB';

// Helper: Convert a Date object to an ISO string representing the local time as UTC.
// Example: If local time is 14:00 (UTC+8), this returns "...T14:00:00.000Z"
function getLocalAsUtcISOString(date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(date.getTime() - offsetMs);
  return localDate.toISOString();
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

// 1. Check if employee already stamped today (merges locally queued records)
export async function checkDailyAttendance(employeeName) {
  if (!employeeName) return null;

  const now = new Date();
  // Set start of day in local time
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  // Use Local-as-UTC for query to match stored format
  const startIso = getLocalAsUtcISOString(start);
  const endIso = getLocalAsUtcISOString(end);

  let serverLogs = [];
  try {
    serverLogs =
      (await sbSelect('attendance_logs', {
        select: '*',
        filters: [
          { column: 'employee_name', op: 'eq', value: employeeName },
          { column: 'attendance_time', op: 'gte', value: startIso },
        ],
        order: { column: 'attendance_time', ascending: false },
        limit: 1,
      })) || [];
  } catch (e) {
    if (!isNetworkError(e)) throw e;
  }

  let offlineLogs = [];
  try {
    const all = await getOfflineAttendanceInRange(startIso, endIso);
    offlineLogs = all.filter((l) => String(l.employee_name || '').trim() === String(employeeName).trim());
  } catch {
    /* ignore */
  }

  const merged = [...serverLogs, ...offlineLogs];
  if (merged.length === 0) return null;
  merged.sort((a, b) => new Date(b.attendance_time).getTime() - new Date(a.attendance_time).getTime());
  return merged[0];
}

// 2. Record attendance (offline-aware: queues locally when offline)
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

  const queueLocally = async () => {
    const localId = `local-${crypto.randomUUID()}`;
    await addOfflineAttendance({ local_id: localId, ...payload });
    // Return shape compatible with the online insert path (id + flag).
    return { id: localId, offline: true, ...payload };
  };

  if (!isBrowserOnline()) {
    return queueLocally();
  }

  try {
    return await sbInsert('attendance_logs', [payload]);
  } catch (e) {
    if (isNetworkError(e)) {
      return queueLocally();
    }
    throw e;
  }
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

// Get today's attendance logs (any shift) — merges locally queued records.
export async function fetchTodayAttendance() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const startIso = getLocalAsUtcISOString(start);
  const endIso = getLocalAsUtcISOString(end);

  let serverLogs = [];
  try {
    serverLogs =
      (await sbSelect('attendance_logs', {
        select: '*',
        filters: [{ column: 'attendance_time', op: 'gte', value: startIso }],
        order: { column: 'attendance_time', ascending: true },
      })) || [];
  } catch (e) {
    if (!isNetworkError(e)) throw e;
  }

  let offlineLogs = [];
  try {
    offlineLogs = await getOfflineAttendanceInRange(startIso, endIso);
  } catch {
    /* ignore */
  }
  return [...serverLogs, ...offlineLogs];
}

// 3. Fetch monthly attendance for all employees — merges locally queued records.
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

  let serverLogs = [];
  try {
    serverLogs =
      (await sbSelect('attendance_logs', {
        select: '*',
        filters: [
          { column: 'attendance_time', op: 'gte', value: startIso },
          { column: 'attendance_time', op: 'lte', value: endIso },
        ],
        limit: 1000,
      })) || [];
  } catch (e) {
    if (!isNetworkError(e)) throw e;
  }

  let offlineLogs = [];
  try {
    offlineLogs = await getOfflineAttendanceInRange(startIso, endIso);
  } catch {
    /* ignore */
  }

  return [...serverLogs, ...offlineLogs];
}
