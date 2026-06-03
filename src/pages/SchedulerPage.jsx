import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Modal from '../components/common/Modal';
import { useToast } from '../context/ToastContext';
import { sbDelete, sbInsert, sbSelect, sbUpdate } from '../db/supabaseRest';
import { useEmployees } from '../features/employees/employeesHooks';
import { useAdminStore } from '../store/adminStore';

export default function SchedulerPage() {
  const { showToast } = useToast();
  const isAdmin = useAdminStore((s) => s.isAuthorized());
  const { data: employees = [] } = useEmployees();

  const toDateKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const parseDateKey = (key) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || '').trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  };

  const parseMonthKey = (key) => {
    const m = /^(\d{4})-(\d{2})$/.exec(String(key || '').trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const dt = new Date(y, mo, 1);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  };

  const toMonthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const addDays = (d, days) => {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  };

  const getWeekMonday = (d) => {
    const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = base.getDay();
    const diff = (dow + 6) % 7;
    base.setDate(base.getDate() - diff);
    return base;
  };

  const getWeekParity = (monday) => {
    const epochMonday = new Date(1970, 0, 5);
    const a = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()).getTime();
    const b = epochMonday.getTime();
    const weeks = Math.floor((a - b) / (7 * 24 * 60 * 60 * 1000));
    return Math.abs(weeks) % 2;
  };

  const isPeakDay = (d) => {
    const dow = d.getDay();
    return dow === 5 || dow === 6 || dow === 0;
  };

  const parseHoursValue = (value) => {
    const n = Number(String(value ?? '').trim());
    if (!Number.isFinite(n)) return null;
    const rounded = Math.round(n * 2) / 2;
    if (rounded <= 0) return null;
    return rounded;
  };

  const timeToMinutes = (value) => {
    const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value || '').trim());
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  };

  const minutesToTimeLabel = (minutes) => {
    if (!Number.isFinite(minutes)) return '';
    const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
    const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
    const mm = String(normalized % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const getManualRangeLabel = (startTime, hours) => {
    const startMinutes = timeToMinutes(startTime);
    const parsedHours = parseHoursValue(hours);
    if (startMinutes == null || !parsedHours) return '';
    const endMinutes = startMinutes + parsedHours * 60;
    return `${minutesToTimeLabel(startMinutes)} ~ ${minutesToTimeLabel(endMinutes)}`;
  };

  const shiftTimeLabel = (d, shift) => {
    const peak = isPeakDay(d);
    if (shift === 'all_day') return '7:00 ~ 16:00';
    if (shift === 'morning') return peak ? '06:00~12:30' : '06:00~12:00';
    if (shift === 'manual') return 'manual';
    return peak ? '10:30~17:00' : '11:30~17:00';
  };

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      const ua = navigator.userAgent;
      const isMobileUA =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet|Kindle|Silk|PlayBook/i.test(
          ua
        );
      const isIOSDesktop = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
      setIsMobile(isMobileUA || isIOSDesktop || window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [monthStr, setMonthStr] = useState(() => toMonthKey(new Date()));
  const monthDate = useMemo(
    () => parseMonthKey(monthStr) || new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    [monthStr]
  );
  const monthStart = useMemo(
    () => new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
    [monthDate]
  );
  const monthEnd = useMemo(
    () => new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0),
    [monthDate]
  );
  const monthStartKey = toDateKey(monthStart);
  const monthEndKey = toDateKey(monthEnd);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [selectedShift, setSelectedShift] = useState('morning');
  const [manualStartTime, setManualStartTime] = useState('07:00');
  const [manualHours, setManualHours] = useState('9');
  const [manualScheduleAvailable, setManualScheduleAvailable] = useState(true);
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()));
  const [dragOverDateKey, setDragOverDateKey] = useState(null);

  const normalizeName = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');

  const employeeOptions = useMemo(() => {
    return (employees || [])
      .slice()
      .sort((a, b) => String(a?.english_name || '').localeCompare(String(b?.english_name || '')));
  }, [employees]);

  const employeeNameById = useMemo(() => {
    const m = new Map();
    (employees || []).forEach((e) => {
      if (!e?.id) return;
      m.set(e.id, String(e.english_name || '').trim() || e.id);
    });
    return m;
  }, [employees]);

  const employeeKeyById = useMemo(() => {
    const m = new Map();
    (employees || []).forEach((e) => {
      if (!e?.id) return;
      m.set(e.id, normalizeName(e.english_name));
    });
    return m;
  }, [employees]);

  const loadMonth = useCallback(async () => {
    try {
      setLoading(true);
      const baseQuery = {
        filters: [
          { column: 'work_date', op: 'gte', value: monthStartKey },
          { column: 'work_date', op: 'lte', value: monthEndKey },
        ],
        orders: [
          { column: 'work_date', ascending: true },
          { column: 'shift_type', ascending: true },
        ],
        limit: 3000,
      };
      try {
        const data = await sbSelect('employee_schedules', {
          select: 'id,employee_id,work_date,shift_type,manual_start_time,manual_hours',
          ...baseQuery,
        });
        setManualScheduleAvailable(true);
        setRows(Array.isArray(data) ? data : []);
      } catch (innerError) {
        const innerMsg = String(innerError?.message || innerError || '').toLowerCase();
        const missingManualColumn =
          innerMsg.includes('manual_start_time') || innerMsg.includes('manual_hours');
        if (!missingManualColumn) throw innerError;

        const legacyData = await sbSelect('employee_schedules', {
          select: 'id,employee_id,work_date,shift_type',
          ...baseQuery,
        });
        setManualScheduleAvailable(false);
        setRows(
          (Array.isArray(legacyData) ? legacyData : []).map((row) => ({
            ...row,
            manual_start_time: null,
            manual_hours: null,
          }))
        );
      }
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg === 'SUPABASE_CONFIG_MISSING') {
        showToast(
          'Supabase 설정이 없습니다. .env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 넣어주세요.'
        );
        return;
      }
      showToast(msg);
    } finally {
      setLoading(false);
    }
  }, [monthStartKey, monthEndKey, showToast]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  const scheduleByDate = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => {
      const k = String(r.work_date || '');
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    const order = { morning: 0, evening: 1, all_day: 2, manual: 3 };
    m.forEach((list) => {
      list.sort((a, b) => {
        const ao = order[String(a.shift_type || '')] ?? 99;
        const bo = order[String(b.shift_type || '')] ?? 99;
        if (ao !== bo) return ao - bo;
        return String(a.employee_id || '').localeCompare(String(b.employee_id || ''));
      });
    });
    return m;
  }, [rows]);

  const getDayList = (dateKey) => scheduleByDate.get(dateKey) || [];
  const getDayCount = (dateKey) => getDayList(dateKey).length;
  const getDayHasEmployee = (dateKey, employeeId) =>
    getDayList(dateKey).some((r) => String(r.employee_id) === String(employeeId));
  const getDayHasShift = (dateKey, shiftType) =>
    getDayList(dateKey).some((r) => String(r.shift_type) === String(shiftType));

  const buildManualSchedulePayload = useCallback(() => {
    if (!manualScheduleAvailable) {
      return {
        ok: false,
        message: '현재 DB에는 manual schedule 컬럼이 없어 수동 스케줄을 사용할 수 없습니다.',
      };
    }
    const startTime = String(manualStartTime || '').trim();
    const hours = parseHoursValue(manualHours);
    if (!startTime || timeToMinutes(startTime) == null) {
      return { ok: false, message: '수동 스케줄 시작 시간을 입력해주세요.' };
    }
    if (!hours) {
      return { ok: false, message: '수동 스케줄 시간을 0.5시간 단위 이상으로 입력해주세요.' };
    }
    return {
      ok: true,
      values: {
        manual_start_time: startTime,
        manual_hours: hours,
      },
    };
  }, [manualHours, manualScheduleAvailable, manualStartTime]);

  const getScheduleTimeLabel = (date, row) => {
    const shiftType = String(row?.shift_type || '');
    if (shiftType === 'manual') {
      const label = getManualRangeLabel(row?.manual_start_time, row?.manual_hours);
      return label || '';
    }
    return shiftTimeLabel(date, shiftType);
  };

  const getScheduleMetaLabel = (date, row) => {
    const shiftType = String(row?.shift_type || '');
    const timeLabel = getScheduleTimeLabel(date, row);
    if (shiftType === 'manual') return timeLabel;
    return [shiftType, timeLabel].filter(Boolean).join(' ');
  };

  const filterVisibleSchedules = useCallback(
    (list) => {
      if (isAdmin) return list || [];
      if (!employees || employees.length === 0) return [];
      return (list || []).filter((r) => employeeKeyById.get(r.employee_id) !== 'maeshi');
    },
    [isAdmin, employeeKeyById, employees]
  );

  const getDayCapacity = (dateKey) => {
    const d = parseDateKey(dateKey);
    if (!d) return 2;
    return 2;
  };

  const validateShiftRules = ({ dateKey, shiftType, employeeId }) => {
    const d = parseDateKey(dateKey);
    if (!d) return { ok: false, message: 'Invalid date.' };

    const empKey = employeeKeyById.get(employeeId);
    if (shiftType === 'manual') {
      return { ok: true };
    }
    if (shiftType === 'all_day') return { ok: true };

    if (empKey === 'berlyn' || empKey === 'janice') {
      const otherKey = (k) => (k === 'berlyn' ? 'janice' : 'berlyn');
      const weekMonday = getWeekMonday(d);
      const weekMorningKeys = new Set();
      const weekEveningKeys = new Set();
      for (let i = 0; i < 7; i += 1) {
        const wk = toDateKey(addDays(weekMonday, i));
        (scheduleByDate.get(wk) || []).forEach((r) => {
          const k = employeeKeyById.get(r.employee_id);
          if (k !== 'berlyn' && k !== 'janice') return;
          if (r.shift_type === 'morning') weekMorningKeys.add(k);
          if (r.shift_type === 'evening') weekEveningKeys.add(k);
        });
      }

      const existingMorning = Array.from(weekMorningKeys);
      const existingEvening = Array.from(weekEveningKeys);

      if (existingMorning.length > 1) {
        return {
          ok: false,
          message: '해당 주(월요일 기준)의 morning 배정이 이미 섞여있습니다. 먼저 정리해주세요.',
        };
      }
      if (existingEvening.length > 1) {
        return {
          ok: false,
          message: '해당 주(월요일 기준)의 evening 배정이 이미 섞여있습니다. 먼저 정리해주세요.',
        };
      }

      let weekMorning = existingMorning[0] || null;
      let weekEvening = existingEvening[0] || null;

      if (!weekMorning && !weekEvening) {
        if (shiftType === 'morning') {
          weekMorning = empKey;
          weekEvening = otherKey(empKey);
        } else if (shiftType === 'evening') {
          weekEvening = empKey;
          weekMorning = otherKey(empKey);
        }
      } else if (weekMorning && !weekEvening) {
        weekEvening = otherKey(weekMorning);
      } else if (!weekMorning && weekEvening) {
        weekMorning = otherKey(weekEvening);
      }

      if (weekMorning && weekEvening && weekMorning === weekEvening) {
        return {
          ok: false,
          message: '해당 주(월요일 기준)의 morning/evening 규칙이 깨져있습니다. 먼저 정리해주세요.',
        };
      }

      if (shiftType === 'morning' && weekMorning && weekMorning !== empKey) {
        return { ok: false, message: '해당 주는 morning 담당이 고정입니다. (월요일 기준)' };
      }
      if (shiftType === 'evening' && weekEvening && weekEvening !== empKey) {
        return { ok: false, message: '해당 주는 evening 담당이 고정입니다. (월요일 기준)' };
      }
      if (shiftType === 'morning' && weekEvening && weekEvening === empKey) {
        return { ok: false, message: '해당 주에서 morning/evening 담당이 서로 바뀔 수 없습니다.' };
      }
      if (shiftType === 'evening' && weekMorning && weekMorning === empKey) {
        return { ok: false, message: '해당 주에서 morning/evening 담당이 서로 바뀔 수 없습니다.' };
      }
    }

    return { ok: true };
  };

  const grid = useMemo(() => {
    const blanks = Array.from({ length: monthStart.getDay() }).map((_, i) => ({
      kind: 'blank',
      key: `b:${i}`,
    }));
    const daysInMonth = monthEnd.getDate();
    const days = Array.from({ length: daysInMonth }).map((_, i) => {
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
      const dateKey = toDateKey(d);
      return { kind: 'day', date: d, dateKey, dayNum: i + 1, key: `d:${dateKey}` };
    });
    return blanks.concat(days);
  }, [monthStart, monthEnd]);

  const autoGenerateMonthForRange = async ({ startDate, endDate, startMorningKey }) => {
    const byName = new Map();
    (employees || []).forEach((e) => {
      const n = normalizeName(e?.english_name);
      if (!n) return;
      if (!byName.has(n)) byName.set(n, e);
    });

    const berlyn = byName.get(normalizeName('Berlyn'));
    const janice = byName.get(normalizeName('Janice'));

    if (!berlyn || !janice) {
      const missing = [
        !berlyn ? 'Berlyn' : null,
        !janice ? 'Janice' : null,
      ].filter(Boolean);
      showToast(`employees 테이블에 영어 이름이 없습니다: ${missing.join(', ')}`);
      return;
    }

    const startKey = toDateKey(startDate);
    const endKey = toDateKey(endDate);

    const otherEmp = (emp) => (String(emp?.id) === String(berlyn.id) ? janice : berlyn);
    const defaultMorningForWeek = (monday) => (getWeekParity(monday) === 0 ? berlyn : janice);

    const firstWeekMonday = getWeekMonday(startDate);
    const prevWeekMonday = addDays(firstWeekMonday, -7);
    const prevWeekStartKey = toDateKey(prevWeekMonday);
    const prevWeekEndKey = toDateKey(addDays(prevWeekMonday, 6));

    let firstWeekMorning = null;
    if (startMorningKey === 'berlyn') firstWeekMorning = berlyn;
    if (startMorningKey === 'janice') firstWeekMorning = janice;
    try {
      const prevRows = await sbSelect('employee_schedules', {
        select: 'employee_id,work_date,shift_type',
        filters: [
          { column: 'work_date', op: 'gte', value: prevWeekStartKey },
          { column: 'work_date', op: 'lte', value: prevWeekEndKey },
          { column: 'shift_type', op: 'eq', value: 'morning' },
        ],
        orders: [{ column: 'work_date', ascending: true }],
        limit: 50,
      });
      const hit = (Array.isArray(prevRows) ? prevRows : []).find(
        (r) =>
          String(r.employee_id) === String(berlyn.id) || String(r.employee_id) === String(janice.id)
      );
      if (hit) {
        const isBerlyn = String(hit.employee_id) === String(berlyn.id);
        const isJanice = String(hit.employee_id) === String(janice.id);
        if (isBerlyn) firstWeekMorning = otherEmp(berlyn);
        if (isJanice) firstWeekMorning = otherEmp(janice);
      }
    } catch {
      firstWeekMorning = null;
    }
    if (!firstWeekMorning) firstWeekMorning = defaultMorningForWeek(firstWeekMonday);

    const weekMorningByMondayKey = new Map();

    const rowsToInsert = [];
    for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
      const dateKey = toDateKey(d);
      const dow = d.getDay();
      const weekMonday = getWeekMonday(d);
      const weekMondayKey = toDateKey(weekMonday);
      if (!weekMorningByMondayKey.has(weekMondayKey)) {
        const prevMondayKey = toDateKey(addDays(weekMonday, -7));
        if (weekMorningByMondayKey.has(prevMondayKey)) {
          weekMorningByMondayKey.set(weekMondayKey, otherEmp(weekMorningByMondayKey.get(prevMondayKey)));
        } else if (weekMondayKey === toDateKey(firstWeekMonday)) {
          weekMorningByMondayKey.set(weekMondayKey, firstWeekMorning);
        } else {
          weekMorningByMondayKey.set(weekMondayKey, defaultMorningForWeek(weekMonday));
        }
      }
      const weekMorning = weekMorningByMondayKey.get(weekMondayKey);
      const weekEvening = otherEmp(weekMorning);

      if (dow === 3) {
        continue;
      }

      if (dow === 4) {
        continue;
      }

      rowsToInsert.push({ employee_id: weekMorning.id, work_date: dateKey, shift_type: 'morning' });
      rowsToInsert.push({ employee_id: weekEvening.id, work_date: dateKey, shift_type: 'evening' });
    }

    await sbDelete('employee_schedules', {
      filters: [
        { column: 'work_date', op: 'gte', value: startKey },
        { column: 'work_date', op: 'lte', value: endKey },
      ],
    });
    await sbInsert('employee_schedules', rowsToInsert, { returning: 'minimal' });
    showToast(`Auto 생성 완료 (Month): ${startKey} ~ ${endKey}`);
  };

  const upsertSchedule = async ({ dateKey, shiftType, employeeId, manualValues }) => {
    if (!employeeId) return;
    const v = validateShiftRules({ dateKey, shiftType, employeeId });
    if (!v.ok) {
      showToast(v.message);
      return;
    }

    const cap = getDayCapacity(dateKey);
    if (cap <= 0) {
      showToast('해당 날짜는 휴무입니다.');
      return;
    }
    if (getDayCount(dateKey) >= cap) {
      showToast(`하루 최대 ${cap}명까지만 배정 가능합니다.`);
      return;
    }
    if (getDayHasEmployee(dateKey, employeeId)) {
      showToast('같은 직원이 같은 날짜에 중복 배정될 수 없습니다.');
      return;
    }
    if (shiftType !== 'manual' && getDayHasShift(dateKey, shiftType)) {
      showToast(`이미 ${shiftType} 배정이 있습니다.`);
      return;
    }
    const payload =
      shiftType === 'manual'
        ? { employee_id: employeeId, work_date: dateKey, shift_type: shiftType, ...manualValues }
        : {
            employee_id: employeeId,
            work_date: dateKey,
            shift_type: shiftType,
            manual_start_time: null,
            manual_hours: null,
          };
    await sbInsert(
      'employee_schedules',
      [payload],
      { returning: 'minimal' }
    );
  };

  const moveSchedule = async ({
    scheduleId,
    fromDateKey,
    toDateKey: targetDateKey,
    employeeId,
    nextShift,
    manualValues,
  }) => {
    if (!scheduleId) return;
    const v = validateShiftRules({ dateKey: targetDateKey, shiftType: nextShift, employeeId });
    if (!v.ok) {
      showToast(v.message);
      return;
    }
    if (fromDateKey !== targetDateKey) {
      const cap = getDayCapacity(targetDateKey);
      if (cap <= 0) {
        showToast('해당 날짜는 휴무입니다.');
        return;
      }
      if (getDayCount(targetDateKey) >= cap) {
        showToast(`하루 최대 ${cap}명까지만 배정 가능합니다.`);
        return;
      }
      if (getDayHasEmployee(targetDateKey, employeeId)) {
        showToast('같은 직원이 같은 날짜에 중복 배정될 수 없습니다.');
        return;
      }
    }
    const existsSameShift = nextShift === 'manual' ? false : getDayHasShift(targetDateKey, nextShift);
    const current = getDayList(targetDateKey).find((r) => String(r.id) === String(scheduleId));
    const isSameDateAndShift =
      fromDateKey === targetDateKey && String(current?.shift_type) === String(nextShift);
    if (existsSameShift && !isSameDateAndShift) {
      showToast(`이미 ${nextShift} 배정이 있습니다.`);
      return;
    }
    const updateValues =
      nextShift === 'manual'
        ? { work_date: targetDateKey, shift_type: nextShift, ...manualValues }
        : {
            work_date: targetDateKey,
            shift_type: nextShift,
            manual_start_time: null,
            manual_hours: null,
          };
    await sbUpdate(
      'employee_schedules',
      updateValues,
      { filters: [{ column: 'id', op: 'eq', value: scheduleId }], returning: 'minimal' }
    );
  };

  const deleteSchedule = async (scheduleId) => {
    if (!scheduleId) return;
    await sbDelete('employee_schedules', {
      filters: [{ column: 'id', op: 'eq', value: scheduleId }],
    });
  };

  const setDragData = (e, obj) => {
    try {
      e.dataTransfer.setData('application/x-royal-scheduler', JSON.stringify(obj));
    } catch {
      e.dataTransfer.setData('text/plain', JSON.stringify(obj));
    }
    e.dataTransfer.effectAllowed = 'move';
  };

  const getDragData = (e) => {
    const raw =
      e.dataTransfer.getData('application/x-royal-scheduler') ||
      e.dataTransfer.getData('text/plain');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const onDropDate = async (e, dateKey) => {
    e.preventDefault();
    if (!isAdmin) return;
    const data = getDragData(e);
    if (!data) return;
    try {
      setBusy(true);
      const manualPayload =
        selectedShift === 'manual' ? buildManualSchedulePayload() : { ok: true, values: null };
      if (!manualPayload.ok) {
        showToast(manualPayload.message);
        return;
      }
      if (data.kind === 'employee') {
        await upsertSchedule({
          dateKey,
          shiftType: selectedShift,
          employeeId: data.employeeId,
          manualValues: manualPayload.values,
        });
        await loadMonth();
        return;
      }
      if (data.kind === 'schedule') {
        await moveSchedule({
          scheduleId: data.scheduleId,
          fromDateKey: data.workDate,
          toDateKey: dateKey,
          employeeId: data.employeeId,
          nextShift: selectedShift,
          manualValues: manualPayload.values,
        });
        await loadMonth();
      }
    } catch (err) {
      showToast(String(err?.message || err));
    } finally {
      setBusy(false);
      setDragOverDateKey(null);
    }
  };

  const monthLabel = `${monthDate.getFullYear()}.${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
  const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const badgeStyle = (shiftType, employeeId) => {
    if (shiftType === 'manual') {
      return {
        bg: 'rgba(236, 72, 153, 0.22)',
        border: 'rgba(244, 114, 182, 0.58)',
      };
    }
    const employeeKey = employeeKeyById.get(employeeId);
    if (employeeKey === 'maeshi') {
      return {
        bg: 'rgba(168, 85, 247, 0.18)',
        border: 'rgba(168, 85, 247, 0.45)',
      };
    }
    const bg =
      shiftType === 'morning'
        ? 'rgba(250, 204, 21, 0.18)'
        : shiftType === 'evening'
          ? 'rgba(59, 130, 246, 0.18)'
          : 'rgba(168, 85, 247, 0.18)';
    const border =
      shiftType === 'morning'
        ? 'rgba(250, 204, 21, 0.45)'
        : shiftType === 'evening'
          ? 'rgba(59, 130, 246, 0.45)'
          : 'rgba(168, 85, 247, 0.45)';
    return { bg, border };
  };

  const ShiftButton = ({ value, label }) => {
    const active = selectedShift === value;
    return (
      <button
        type="button"
        onClick={() => setSelectedShift(value)}
        disabled={!isAdmin || busy || loading}
        style={{
          width: '100%',
          height: 44,
          borderRadius: 14,
          border: `1px solid ${active ? 'rgba(250, 204, 21, 0.6)' : 'rgba(255,255,255,0.16)'}`,
          background: active ? 'rgba(250, 204, 21, 0.14)' : 'rgba(255,255,255,0.06)',
          color: 'white',
          fontWeight: 900,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 14px',
          whiteSpace: 'nowrap',
          cursor: !isAdmin ? 'default' : 'pointer',
          opacity: !isAdmin ? 0.7 : 1,
        }}
      >
        {label}
      </button>
    );
  };

  const ScheduleBadge = ({ row, date, dateKey, compact = false }) => {
    const shiftType = String(row.shift_type || '');
    const { bg, border } = badgeStyle(shiftType, row.employee_id);
    const name = employeeNameById.get(row.employee_id) || row.employee_id;
    const metaTextColor =
      shiftType === 'manual' ? 'rgba(255, 232, 244, 0.98)' : 'var(--text-muted)';
    if (isMobile && compact) {
      return (
        <div
          className="text-xs"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 6px',
            borderRadius: 10,
            border: `1px solid ${border}`,
            background: bg,
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
          title={name}
        >
          <div
            style={{
              color: 'rgba(255,255,255,0.98)',
              fontWeight: 1000,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 10,
              lineHeight: 1.05,
              letterSpacing: '0.01em',
              textShadow: '0 1px 1px rgba(0,0,0,0.35)',
              minWidth: 0,
            }}
          >
            {name}
          </div>
        </div>
      );
    }
    if (isMobile) {
      return (
        <div
          className="text-xs"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            padding: '6px 8px',
            borderRadius: 12,
            border: `1px solid ${border}`,
            background: bg,
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
          title={name}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 950,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 11,
                lineHeight: 1.1,
                minWidth: 0,
              }}
            >
              {name}
            </div>
            <div style={{ fontSize: 10, color: metaTextColor, fontWeight: 800 }}>
              {getScheduleMetaLabel(date, row)}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div
        draggable={isAdmin}
        onDragStart={(e) =>
          setDragData(e, {
            kind: 'schedule',
            scheduleId: row.id,
            employeeId: row.employee_id,
            workDate: dateKey,
            shiftType: row.shift_type,
          })
        }
        onContextMenu={async (e) => {
          if (!isAdmin) return;
          e.preventDefault();
          try {
            setBusy(true);
            await deleteSchedule(row.id);
            await loadMonth();
          } catch (err) {
            showToast(String(err?.message || err));
          } finally {
            setBusy(false);
          }
        }}
        className="text-xs"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 8px',
          borderRadius: 12,
          border: `1px solid ${border}`,
          background: bg,
          cursor: isAdmin ? 'grab' : 'default',
          userSelect: 'none',
          maxWidth: '100%',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
            <div
              style={{
                fontWeight: 950,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flex: 1,
              }}
            >
              {name}
            </div>
          </div>
          <div style={{ fontSize: 11, color: metaTextColor, fontWeight: 800 }}>
            {getScheduleMetaLabel(date, row)}
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                setBusy(true);
                await deleteSchedule(row.id);
                await loadMonth();
              } catch (err) {
                showToast(String(err?.message || err));
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || loading}
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(0,0,0,0.25)',
              color: 'white',
              fontWeight: 900,
              cursor: 'pointer',
              flex: '0 0 auto',
            }}
            aria-label="Delete schedule"
          >
            ✕
          </button>
        )}
      </div>
    );
  };

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDateKey, setDetailDateKey] = useState(null);
  const detailDate = useMemo(
    () => (detailDateKey ? parseDateKey(detailDateKey) : null),
    [detailDateKey]
  );
  const detailList = useMemo(() => {
    if (!detailDateKey) return [];
    return filterVisibleSchedules(scheduleByDate.get(detailDateKey) || []);
  }, [detailDateKey, scheduleByDate, filterVisibleSchedules]);

  const openDetail = (dateKey) => {
    setSelectedDateKey(dateKey);
    setDetailDateKey(dateKey);
    if (isMobile || !isAdmin) setDetailOpen(true);
  };

  const [autoMonthStartMorning, setAutoMonthStartMorning] = useState('berlyn');

  const [resetMonthOpen, setResetMonthOpen] = useState(false);
  const handleResetMonth = async () => {
    if (!isAdmin) return;
    try {
      setBusy(true);
      await sbDelete('employee_schedules', {
        filters: [
          { column: 'work_date', op: 'gte', value: monthStartKey },
          { column: 'work_date', op: 'lte', value: monthEndKey },
        ],
      });
      showToast(`월 스케줄 초기화 완료: ${monthStartKey} ~ ${monthEndKey}`);
      await loadMonth();
    } catch (err) {
      showToast(String(err?.message || err));
    } finally {
      setBusy(false);
      setResetMonthOpen(false);
    }
  };

  const handleAutoMonth = async () => {
    if (!isAdmin) return;
    try {
      setBusy(true);
      await autoGenerateMonthForRange({
        startDate: monthStart,
        endDate: monthEnd,
        startMorningKey: autoMonthStartMorning,
      });
      await loadMonth();
    } catch (err) {
      showToast(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const isTodayInView = todayKey >= monthStartKey && todayKey <= monthEndKey;
  const todayDate = useMemo(() => parseDateKey(todayKey), [todayKey]);
  const todayList = useMemo(
    () => filterVisibleSchedules(scheduleByDate.get(todayKey) || []),
    [filterVisibleSchedules, scheduleByDate, todayKey]
  );

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <div className="page-title">Scheduler</div>
          <div className="page-subtitle">{isAdmin ? 'Admin: drag & drop' : 'Staff: view only'}</div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            disabled={busy || loading}
            onClick={() =>
              setMonthStr(
                toMonthKey(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))
              )
            }
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--gold-soft)',
              fontSize: 26,
              fontWeight: 1000,
              cursor: busy || loading ? 'not-allowed' : 'pointer',
              padding: '4px 10px',
              borderRadius: 999,
              lineHeight: 1,
              opacity: busy || loading ? 0.55 : 1,
            }}
            aria-label="Previous month"
          >
            &lt;
          </button>
          <div
            style={{
              fontWeight: 1000,
              letterSpacing: '0.12em',
              color: 'var(--text-main)',
              textTransform: 'uppercase',
              padding: '4px 6px',
              whiteSpace: 'nowrap',
            }}
          >
            {monthLabel}
          </div>
          <button
            type="button"
            disabled={busy || loading}
            onClick={() =>
              setMonthStr(
                toMonthKey(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))
              )
            }
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--gold-soft)',
              fontSize: 26,
              fontWeight: 1000,
              cursor: busy || loading ? 'not-allowed' : 'pointer',
              padding: '4px 10px',
              borderRadius: 999,
              lineHeight: 1,
              opacity: busy || loading ? 0.55 : 1,
            }}
            aria-label="Next month"
          >
            &gt;
          </button>
        </div>
      </div>

      <section className="page-card">
        <div
          className="flex gap-4 stack-mobile"
          style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}
        >
          {isAdmin && !isMobile && (
            <div
              style={{
                width: 320,
                flex: '0 0 320px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ fontWeight: 1000, letterSpacing: '0.08em', color: 'var(--gold-soft)' }}>
                SCHEDULER CONTROL
              </div>
              <div className="text-sm" style={{ color: 'var(--text-muted)', fontWeight: 800 }}>
                1. 배정할 Shift 선택
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <ShiftButton value="morning" label="Morning" />
                <ShiftButton value="evening" label="Evening" />
                <ShiftButton value="all_day" label="All Day" />
              </div>
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: 12,
                  borderRadius: 14,
                  border:
                    selectedShift === 'manual'
                      ? '1px solid rgba(250, 204, 21, 0.6)'
                      : '1px solid rgba(255,255,255,0.12)',
                  background:
                    selectedShift === 'manual' ? 'rgba(250, 204, 21, 0.08)' : 'rgba(255,255,255,0.03)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedShift('manual')}
                  disabled={!isAdmin || busy || loading || !manualScheduleAvailable}
                  style={{
                    width: '100%',
                    height: 42,
                    borderRadius: 12,
                    border:
                      selectedShift === 'manual'
                        ? '1px solid rgba(250, 204, 21, 0.65)'
                        : '1px solid rgba(255,255,255,0.16)',
                    background:
                      selectedShift === 'manual'
                        ? 'rgba(250, 204, 21, 0.14)'
                        : 'rgba(255,255,255,0.06)',
                    color: 'white',
                    fontWeight: 950,
                    cursor:
                      !isAdmin || busy || loading || !manualScheduleAvailable
                        ? 'not-allowed'
                        : 'pointer',
                    opacity: !isAdmin || !manualScheduleAvailable ? 0.7 : 1,
                  }}
                >
                  Manual Schedule
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Input
                    label="시작 시간"
                    type="time"
                    value={manualStartTime}
                    onChange={(e) => setManualStartTime(e.target.value)}
                    disabled={!isAdmin || busy || loading || !manualScheduleAvailable}
                  />
                  <Input
                    label="몇 시간"
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={manualHours}
                    onChange={(e) => setManualHours(e.target.value)}
                    disabled={!isAdmin || busy || loading || !manualScheduleAvailable}
                    placeholder="4"
                  />
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)', fontWeight: 800 }}>
                  {manualScheduleAvailable
                    ? 'Manual 선택 후 직원을 드래그하면 입력한 시간대로 배정됩니다.'
                    : '현재 DB에는 manual schedule 컬럼이 없어 수동 스케줄이 비활성화되었습니다.'}
                  {manualScheduleAvailable && getManualRangeLabel(manualStartTime, manualHours)
                    ? ` (${getManualRangeLabel(manualStartTime, manualHours)})`
                    : ''}
                </div>
              </div>
              <div className="text-sm" style={{ color: 'var(--text-muted)', fontWeight: 800 }}>
                Auto month 시작 Morning
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                }}
              >
                {[
                  { key: 'berlyn', label: 'Berlyn' },
                  { key: 'janice', label: 'Janice' },
                ].map((opt) => {
                  const active = autoMonthStartMorning === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setAutoMonthStartMorning(opt.key)}
                      disabled={busy || loading}
                      style={{
                        width: '100%',
                        height: 44,
                        borderRadius: 14,
                        border: `1px solid ${
                          active ? 'rgba(250, 204, 21, 0.65)' : 'rgba(255,255,255,0.16)'
                        }`,
                        background: active ? 'rgba(250, 204, 21, 0.14)' : 'rgba(255,255,255,0.06)',
                        color: 'white',
                        fontWeight: 950,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '0 14px',
                        whiteSpace: 'nowrap',
                        cursor: busy || loading ? 'not-allowed' : 'pointer',
                        opacity: busy || loading ? 0.6 : 1,
                      }}
                      aria-pressed={active}
                    >
                      <span style={{ width: 14, textAlign: 'center', opacity: active ? 1 : 0.25 }}>
                        ✓
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAutoMonth}
                disabled={busy || loading}
                style={{ width: '100%', whiteSpace: 'nowrap', justifyContent: 'center' }}
              >
                Auto month
              </Button>
              <div
                className="text-sm"
                style={{ color: 'var(--text-muted)', fontWeight: 800, marginTop: 4 }}
              >
                2. 직원 목록 (드래그 하세요)
              </div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
                {employeeOptions.map((e) => (
                  <div
                    key={e.id}
                    draggable
                    onDragStart={(evt) => setDragData(evt, { kind: 'employee', employeeId: e.id })}
                    style={{
                      borderRadius: 14,
                      border: '1px solid rgba(255,255,255,0.16)',
                      background: 'rgba(255,255,255,0.05)',
                      padding: '10px 12px',
                      cursor: 'grab',
                      fontWeight: 900,
                    }}
                  >
                    {e.english_name}
                  </div>
                ))}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setResetMonthOpen(true)}
                disabled={busy || loading}
                style={{ width: '100%', whiteSpace: 'nowrap', justifyContent: 'center' }}
              >
                Reset month
              </Button>
              <div className="text-xs" style={{ color: 'var(--text-muted)', fontWeight: 800 }}>
                Tip: 배지는 드래그로 날짜 이동 가능 · 우클릭 또는 X로 삭제
              </div>
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            {isMobile && (
              <div
                style={{
                  display: 'grid',
                  gap: 8,
                  marginBottom: 10,
                  padding: '10px 12px',
                  borderRadius: 16,
                  border: '1px solid var(--border-soft)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ fontWeight: 1000, letterSpacing: '0.06em' }}>TODAY</div>
                  <div style={{ color: 'var(--text-muted)', fontWeight: 900, fontSize: 12 }}>
                    {todayKey}
                  </div>
                </div>
                {!isTodayInView ? (
                  <div style={{ color: 'var(--text-muted)', fontWeight: 800, fontSize: 12 }}>
                    현재 보고 있는 달에 오늘 날짜가 없습니다.
                  </div>
                ) : todayDate ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {todayList.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontWeight: 800, fontSize: 12 }}>
                        No schedule.
                      </div>
                    ) : (
                      todayList.map((r) => {
                        const name = employeeNameById.get(r.employee_id) || r.employee_id;
                        return (
                          <div
                            key={r.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              fontSize: 12,
                              fontWeight: 900,
                            }}
                          >
                            <div
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {name}
                            </div>
                            <div style={{ color: 'var(--text-muted)', flex: '0 0 auto' }}>
                              {getScheduleMetaLabel(todayDate, r)}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            )}
            {loading ? (
              <div className="text-[var(--text-muted)]">Loading…</div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gap: isMobile ? 6 : 10,
                }}
              >
                {dowLabels.map((l) => (
                  <div
                    key={l}
                    className="text-sm"
                    style={{
                      color: 'var(--text-muted)',
                      fontWeight: 900,
                      textAlign: 'center',
                      paddingBottom: isMobile ? 2 : 4,
                      fontSize: isMobile ? 11 : 14,
                    }}
                  >
                    {l}
                  </div>
                ))}
                {grid.map((cell) => {
                  if (cell.kind === 'blank') return <div key={cell.key} />;
                  const list = filterVisibleSchedules(getDayList(cell.dateKey));
                  const isToday = (() => {
                    const now = new Date();
                    return (
                      now.getFullYear() === cell.date.getFullYear() &&
                      now.getMonth() === cell.date.getMonth() &&
                      now.getDate() === cell.date.getDate()
                    );
                  })();
                  const weekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;
                  const selected = selectedDateKey === cell.dateKey;
                  const dragging = dragOverDateKey === cell.dateKey;
                  return (
                    <div
                      key={cell.key}
                      onClick={() => openDetail(cell.dateKey)}
                      onDragOver={(e) => {
                        if (!isAdmin) return;
                        e.preventDefault();
                        setDragOverDateKey(cell.dateKey);
                      }}
                      onDragLeave={() => {
                        if (dragOverDateKey === cell.dateKey) setDragOverDateKey(null);
                      }}
                      onDrop={(e) => onDropDate(e, cell.dateKey)}
                      style={{
                        borderRadius: isMobile ? 14 : 16,
                        border: `1px solid ${
                          dragging
                            ? 'rgba(250, 204, 21, 0.7)'
                            : isToday
                              ? 'rgba(250, 204, 21, 0.55)'
                              : selected
                                ? 'rgba(59, 130, 246, 0.55)'
                                : 'var(--border-soft)'
                        }`,
                        background: dragging
                          ? 'rgba(250, 204, 21, 0.06)'
                          : 'rgba(255,255,255,0.03)',
                        padding: isMobile ? 6 : 10,
                        minHeight: isMobile ? 92 : 124,
                        maxHeight: isMobile ? 128 : 176,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 1000,
                            letterSpacing: '0.04em',
                            color: weekend ? 'var(--gold-soft)' : 'var(--text-main)',
                          }}
                        >
                          {cell.dayNum}
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: isMobile ? 6 : 8,
                          display: 'grid',
                          gap: isMobile ? 4 : 6,
                          minHeight: 0,
                          flex: 1,
                          overflowY: 'auto',
                          overflowX: 'hidden',
                        }}
                      >
                        {list.map((r) => (
                          <ScheduleBadge
                            key={r.id}
                            row={r}
                            dateKey={cell.dateKey}
                            date={cell.date}
                            compact={isMobile}
                          />
                        ))}
                        {list.length === 0 && (
                          <div
                            className="text-xs"
                            style={{ color: 'var(--text-muted)', fontWeight: 800, opacity: 0.7 }}
                          >
                            -
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={isMobile ? null : detailDateKey ? detailDateKey : 'Schedule'}
        size="content"
      >
        {isMobile ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {detailDate && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  paddingBottom: 4,
                }}
              >
                <div style={{ fontWeight: 1000, fontSize: 18 }}>{detailDate.getDate()}</div>
              </div>
            )}
            {detailDate && (
              <div style={{ display: 'grid', gap: 8 }}>
                {detailList.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontWeight: 800 }}>No schedule.</div>
                ) : (
                  detailList.map((r) => {
                    const shiftType = String(r.shift_type || '');
                    const { bg, border } = badgeStyle(shiftType, r.employee_id);
                    const name = employeeNameById.get(r.employee_id) || r.employee_id;
                    return (
                      <div
                        key={r.id}
                        style={{
                          padding: '12px 12px',
                          borderRadius: 16,
                          border: `1px solid ${border}`,
                          background: bg,
                          display: 'grid',
                          gap: 4,
                        }}
                      >
                        <div style={{ fontWeight: 1000, fontSize: 14 }}>{name}</div>
                        <div style={{ fontWeight: 900, fontSize: 12, color: 'var(--text-muted)' }}>
                          {getScheduleMetaLabel(detailDate, r)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm" style={{ display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--text-muted)', fontWeight: 900 }}>
              {isAdmin ? '관리자는 PC에서 드래그로 배정/수정합니다.' : '조회 전용 화면입니다.'}
            </div>
            {detailDate && (
              <div style={{ display: 'grid', gap: 8 }}>
                {detailList.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontWeight: 800 }}>No schedule.</div>
                ) : (
                  detailList.map((r) => (
                    <ScheduleBadge key={r.id} row={r} dateKey={detailDateKey} date={detailDate} />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={resetMonthOpen}
        onClose={() => setResetMonthOpen(false)}
        title="Reset month"
        size="content"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
            <Button variant="outline" size="sm" onClick={() => setResetMonthOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleResetMonth} disabled={busy || loading}>
              Reset
            </Button>
          </div>
        }
      >
        <div style={{ width: 'min(520px, 90vw)', whiteSpace: 'pre-line', fontWeight: 800 }}>
          {`해당 월 스케줄을 모두 삭제합니다.\n${monthStartKey} ~ ${monthEndKey}`}
        </div>
      </Modal>
    </div>
  );
}
