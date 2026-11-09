import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
  useDeleteAttendanceMutation,
  useMonthlyAttendance,
  useRecordAttendanceMutation,
  useUpdateAttendanceMutation,
} from '../../features/attendance/attendanceHooks';
import { useChecklistDaily, useChecklistDailyMonth } from '../../features/checklist/checklistHooks';
import { useEmployees } from '../../features/employees/employeesHooks';
import { useAdminStore } from '../../store/adminStore';
import Button from '../common/Button';
import DateInput from '../common/DateInput';
import Modal from '../common/Modal';
import { normalizeAppError } from '../../utils/errorHandler';

// Helper to get score based on time diff with discrete buckets
// Rules:
// - <=3 mins late: 100
// - 4~6 mins: 90
// - 7~10 mins: 80
// - 11~13 mins: 70
// - 14~15 mins: 60
// - >=16 mins: 0
const getPunctualityScore = (targetTime, checkTime) => {
  const diffMs = checkTime - targetTime;
  const lateMins = Math.max(0, Math.floor(diffMs / 60000));
  if (lateMins <= 3) return 100;
  if (lateMins <= 6) return 90;
  if (lateMins <= 10) return 80;
  if (lateMins <= 13) return 70;
  if (lateMins <= 15) return 60;
  return 0;
};

const formatTimeForDisplay = (date) => {
  if (!date) return null;
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const parts = timeStr.split(' ');
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  return timeStr;
};

const toLocalDateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const toUtcDateKey = (d) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const normalizeShiftType = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

const CurrentTimeDisplay = () => {
  const [now, setNow] = useState(new Date());

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center mb-6">
      <div className="text-purple-900 bg-yellow-300 text-2xl font-bold tracking-wide px-3 py-1 rounded-lg shadow-md">
        {now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}{' '}
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
};

const ChecklistDayDetailsModal = ({ dateStr, attendanceDetails, onClose }) => {
  const { data: dayRow, isLoading } = useChecklistDaily(dateStr, { enabled: Boolean(dateStr) });
  const [items, setItems] = useState([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('checklist_items_v1') || 'null');
      setItems(Array.isArray(stored) && stored.length > 0 ? stored : []);
    } catch {
      setItems([]);
    }
  }, []);

  const checkedItems = useMemo(() => {
    const shared = dayRow?.employees?._shared;
    if (!shared || !Array.isArray(shared.checked_items)) return [];
    return shared.checked_items
      .map((rawIndex) => {
        const index = Number(rawIndex);
        const detail = shared.times?.[String(index)] || {};
        return {
          index,
          label: items[index] || `Todo #${index + 1}`,
          by: detail.by || 'Unknown',
          time: detail.time || '-',
        };
      })
      .sort((a, b) => a.index - b.index);
  }, [dayRow, items]);

  // Format date nicely
  const formatDate = (ds) => {
    if (!ds || !ds.includes('-')) return ds;
    const parts = ds.split('-');
    if (parts.length < 3) return ds;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${parts[0]}.${parts[1]}.${parts[2]} ${dayNames[d.getDay()]}`;
  };

  return (
    <Modal open={Boolean(dateStr)} onClose={onClose} title={formatDate(dateStr)} size="content">
      <div className="space-y-5 text-white" style={{ minWidth: 320, maxWidth: 440 }}>
        {/* Attendance Section */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-sm">👤</div>
            <h3 className="font-bold text-base text-white/90 tracking-wide">Attendance</h3>
          </div>
          {attendanceDetails.length > 0 ? (
            <div className="space-y-2">
              {attendanceDetails.map((detail) => (
                <div
                  key={`${detail.id}-${detail.name}`}
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black"
                      style={{
                        background: detail.shiftType === 'morning' ? '#fbbf24' : '#818cf8',
                        color: detail.shiftType === 'morning' ? '#000' : '#fff',
                      }}
                    >
                      {detail.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{detail.name || 'Unknown'}</div>
                      <div className="text-xs text-white/50 capitalize">{detail.shiftType}</div>
                    </div>
                  </div>
                  <div className="text-sm font-mono font-bold text-white/80 bg-white/10 rounded-lg px-3 py-1">
                    {detail.time}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="text-center py-6 rounded-xl text-sm text-white/40"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)' }}
            >
              No attendance records
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Checklist Section */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-sm">✅</div>
            <h3 className="font-bold text-base text-white/90 tracking-wide">Checklist</h3>
            {!isLoading && checkedItems.length > 0 && (
              <span className="ml-auto text-xs font-bold bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">
                {checkedItems.length}/10
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="text-center py-6 text-sm text-white/40">Loading...</div>
          ) : checkedItems.length > 0 ? (
            <div className="space-y-1.5">
              {checkedItems.map((item) => (
                <div
                  key={item.index}
                  className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="w-5 h-5 rounded-full bg-green-500/30 flex items-center justify-center flex-shrink-0">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.label}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-white/40 font-semibold">{item.by}</span>
                    <span className="text-xs text-white/30 font-mono">{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="text-center py-6 rounded-xl text-sm text-white/40"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)' }}
            >
              No checklist items completed
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
};

const AttendanceCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const { data: logs = [] } = useMonthlyAttendance(year, month);
  const { data: checklistRows = [] } = useChecklistDailyMonth(year, month);

  // Calculate days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0 = Sun

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  const [selectedDateLogs, setSelectedDateLogs] = useState(null); // { dateStr, details }

  const getChecklistPercent = (day) => {
    const checkDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const row = checklistRows.find((item) => item.check_date === checkDate);
    if (!row) return 0;
    const checked = row.employees?._shared?.checked_items;
    if (!Array.isArray(checked)) return 0;
    return Math.min(100, Math.round((new Set(checked.map(Number)).size / 10) * 100));
  };

  const getDayScore = (day) => {
    const targetDate = new Date(year, month - 1, day);
    const dateStr = targetDate.toDateString();

    // Check if future (strict > today)
    const now = new Date();
    const isFuture = targetDate.setHours(0, 0, 0, 0) > now.setHours(0, 0, 0, 0);

    // Default return for rendering logic
    const result = { score: null, isFuture, hasLog: false, details: [], noAttendance: false };

    if (isFuture) return result;

    const dayLogs = logs.filter((l) => {
      // Parse stored time (Local-as-UTC) to get the date string
      const stored = new Date(l.attendance_time);
      // Use UTC methods because we stored local time as UTC
      const logDateStr = new Date(
        stored.getUTCFullYear(),
        stored.getUTCMonth(),
        stored.getUTCDate()
      ).toDateString();

      return logDateStr === dateStr;
    });

    if (dayLogs.length === 0) {
      return { score: 100, isFuture, hasLog: true, details: [], noAttendance: false };
    }

    const sorted = [...dayLogs].sort(
      (a, b) => new Date(a.attendance_time).getTime() - new Date(b.attendance_time).getTime()
    );

    const details = sorted.map((l) => {
      const stored = new Date(l.attendance_time);
      const checkTime = new Date(
        stored.getUTCFullYear(),
        stored.getUTCMonth(),
        stored.getUTCDate(),
        stored.getUTCHours(),
        stored.getUTCMinutes()
      );

      const target = new Date(checkTime);
      const dow = target.getDay();
      if (l.shift_type === 'morning') {
        target.setHours(dow === 3 ? 8 : 6, 0, 0, 0);
      } else {
        if (dow === 3) {
          target.setHours(8, 0, 0, 0);
        } else {
          const peak = dow === 5 || dow === 6 || dow === 0;
          target.setHours(peak ? 10 : 11, 30, 0, 0);
        }
      }

      const score = getPunctualityScore(target, checkTime);
      const diffMs = checkTime - target;
      const lateMins = Math.max(0, Math.floor(diffMs / 1000 / 60));
      const timeStr = formatTimeForDisplay(checkTime);

      return {
        id: l.id,
        name: String(l.employee_name || '').trim(),
        score,
        lateMins,
        time: timeStr,
        shiftType: l.shift_type,
      };
    });

    const scoreByName = new Map();
    details.forEach((d) => {
      if (!scoreByName.has(d.name)) scoreByName.set(d.name, Number(d.score ?? 0) || 0);
    });
    const scores = Array.from(scoreByName.values());
    const finalScore =
      scores.length === 0 ? 100 : scores.reduce((sum, v) => sum + v, 0) / scores.length;

    return {
      score: Math.round(Math.max(0, Math.min(100, finalScore))),
      isFuture,
      hasLog: true,
      details,
      noAttendance: false,
    };
  };

  return (
    <div
      className="p-2 w-fit mx-auto relative"
      style={{ margin: '5px 0' }}
      onClick={() => setSelectedDateLogs(null)}
    >
      {/* Header */}
      <div
        className="flex items-center justify-center gap-8 mb-4 mt-4"
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
      >
        <button
          onClick={() => setCurrentDate(new Date(year, month - 2, 1))}
          className="text-white hover:text-purple-300 transition-colors"
          style={{
            background: 'none',
            border: 'none',
            fontSize: '3rem',
            cursor: 'pointer',
            lineHeight: '1',
            marginBottom: 2,
          }}
        >
          &lt;
        </button>
        <span className="font-black text-white text-3xl tracking-widest drop-shadow-lg mx-4">
          {year}. {month}
        </span>
        <button
          onClick={() => setCurrentDate(new Date(year, month, 1))}
          className="text-white hover:text-purple-300 transition-colors"
          style={{
            background: 'none',
            border: 'none',
            fontSize: '3rem',
            cursor: 'pointer',
            lineHeight: '1',
            marginBottom: 2,
          }}
        >
          &gt;
        </button>
      </div>

      {/* Grid */}
      <div
        className="grid grid-cols-7 gap-y-4 gap-x-2 mx-auto w-fit"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          justifyItems: 'center',
          alignItems: 'center',
        }}
      >
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div
            key={d}
            className="flex items-center justify-center w-full text-center text-purple-200 font-bold text-lg mb-2 uppercase tracking-wider"
          >
            {d}
          </div>
        ))}

        {blanks.map((b) => (
          <div key={`blank-${b}`} className="w-full" />
        ))}

        {days.map((day) => {
          const { details } = getDayScore(day);
          const checklistPercent = getChecklistPercent(day);
          const isToday =
            day === new Date().getDate() &&
            month === new Date().getMonth() + 1 &&
            year === new Date().getFullYear();

          const isSelected = selectedDateLogs?.dateStr === `${year}-${month}-${day}`;
          const percentColorClass = checklistPercent < 30
            ? 'text-red-400'
            : checklistPercent < 60
              ? 'text-orange-400'
              : 'text-green-400';
          const segmentColor = checklistPercent < 30
            ? '#f87171'
            : checklistPercent < 60
              ? '#fb923c'
              : '#4ade80';
          const filledSegments = Math.min(10, Math.floor(checklistPercent / 10));
          const segmentStops = Array.from({ length: 10 }, (_, index) => {
            const start = index * 36;
            const color = index < filledSegments ? segmentColor : '#d1d5db';
            return `${color} ${start}deg ${start + 33}deg, transparent ${start + 33}deg ${start + 36}deg`;
          }).join(', ');
          const faceContent = (
            <button
              type="button"
              aria-label={`${day}일 체크리스트 ${checklistPercent}%, 상세 보기`}
              className={`relative flex h-12 w-12 items-center justify-center rounded-full ${percentColorClass} hover:text-black focus-visible:text-black transition-all duration-150 ${isSelected ? 'scale-110 ring-2 ring-white' : 'hover:scale-110 hover:shadow-lg'}`}
              style={{ background: `conic-gradient(${segmentStops})`, cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedDateLogs(isSelected ? null : {
                  dateStr: `${year}-${month}-${day}`,
                  details,
                });
              }}
            >
              <span className="absolute inset-[5px] rounded-full bg-white" aria-hidden="true" />
              <span className="relative text-[19px] font-black">{checklistPercent}%</span>
            </button>
          );

          return (
            <div
              key={day}
              className="flex flex-col items-center justify-center gap-1 relative w-full"
            >
              <span
                className={`text-lg font-bold text-center ${isToday ? 'text-white scale-110' : 'text-purple-100'}`}
                style={{ textAlign: 'center', width: '100%', display: 'block' }}
              >
                {day}
              </span>

              <div className="relative rounded-full flex items-center justify-center">
                <div className="rounded-full flex items-center justify-center">
                  {' '}
                  {/* Spacer/Background for ring */}
                  {faceContent}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Day Details Display (Fixed Position Below Calendar) */}
      <div className="mt-6 h-8 flex items-center justify-center">
        {selectedDateLogs ? (
          <div className="bg-gray-900 text-white px-4 py-1.5 rounded-full border border-gray-700 shadow-lg animate-fade-in flex items-center gap-3">
            <span className="text-gray-400 text-xs font-bold uppercase tracking-wider border-r border-gray-700 pr-3 mr-1">
              {selectedDateLogs.dateStr}
            </span>
            <div className="text-sm font-medium text-gray-200 whitespace-nowrap">
              {selectedDateLogs.details.map((d) => `${d.name} : ${d.time}`).join(' / ')}
            </div>
          </div>
        ) : (
          <div className="text-purple-300/30 text-sm font-medium italic">
            Click a date to view attendance and checklist details
          </div>
        )}
      </div>

      {selectedDateLogs && (
        <ChecklistDayDetailsModal
          dateStr={selectedDateLogs.dateStr}
          attendanceDetails={selectedDateLogs.details}
          onClose={() => setSelectedDateLogs(null)}
        />
      )}
    </div>
  );
};

export default function AttendanceModal({ open, onClose }) {
  const [selectedShift, setSelectedShift] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [hoverKey, setHoverKey] = useState(null);
  const { showToast, showToastTyped } = useToast();
  const navigate = useNavigate();
  const isAdmin = useAdminStore((s) => s.isAuthorized());
  const openLoginModal = useAdminStore((s) => s.openLoginModal);
  const savingRef = useRef(false);
  const [isCompact, setIsCompact] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertTone, setAlertTone] = useState('info');

  useEffect(() => {
    const checkMobile = () => {
      const ua = navigator.userAgent;
      // Added 'Tablet|Kindle|Silk|PlayBook' and checked for 'Android' without 'Mobile' which often implies tablet
      const isMobileUA =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet|Kindle|Silk|PlayBook/i.test(
          ua
        );
      const isIOSDesktop = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

      // Additional check: If it has touch points and screen width is relatively small (typical tablet), treat as mobile/tablet
      // But allow large touch screens (like touch laptops) if they don't match mobile OS
      // For now, relying on OS/UA detection is safer to avoid blocking touch laptops.

      const mobile = isMobileUA || isIOSDesktop;
      const coarsePointer =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches;
      setIsCompact(Boolean(mobile || coarsePointer || window.innerWidth < 900));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const { data: monthLogs = [] } = useMonthlyAttendance(year, month);
  const { data: employees = [] } = useEmployees();

  const todayKey = toLocalDateKey(today);

  const isWedToday = today.getDay() === 3;

  const todayShiftTakenSet = useMemo(() => {
    const set = new Set();
    (monthLogs || []).forEach((l) => {
      const stored = new Date(l.attendance_time);
      const logKey = toLocalDateKey(
        new Date(stored.getUTCFullYear(), stored.getUTCMonth(), stored.getUTCDate())
      );
      if (logKey !== todayKey) return;
      const shift = normalizeShiftType(l?.shift_type);
      if (!shift) return;
      set.add(shift);
    });
    return set;
  }, [monthLogs, todayKey]);

  const todayStaffTakenSet = useMemo(() => {
    const set = new Set();
    (monthLogs || []).forEach((l) => {
      const stored = new Date(l.attendance_time);
      const logKey = toLocalDateKey(
        new Date(stored.getUTCFullYear(), stored.getUTCMonth(), stored.getUTCDate())
      );
      if (logKey !== todayKey) return;
      const name = String(l?.employee_name || '').trim();
      if (!name) return;
      set.add(name);
    });
    return set;
  }, [monthLogs, todayKey]);

  const isShiftTaken = (shift) => todayShiftTakenSet.has(normalizeShiftType(shift));
  const isStaffTaken = (name) => todayStaffTakenSet.has(String(name || '').trim());
  const isShiftDisabled = (shift) => {
    const s = normalizeShiftType(shift);
    if (!s) return true;
    if (isPending) return true;
    if (s === 'evening' && isWedToday) return true;
    return isShiftTaken(s);
  };

  const staffOptions = useMemo(() => {
    if ((employees || []).length > 0) {
      return (employees || [])
        .map((e) => String(e?.english_name || '').trim())
        .filter(Boolean);
    }
    return Array.from(
      new Set((monthLogs || []).map((l) => String(l?.employee_name || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [employees, monthLogs]);

  useEffect(() => {
    if (!selectedStaff) return;
    if (!staffOptions.includes(selectedStaff)) {
      setSelectedStaff(null);
    }
  }, [selectedStaff, staffOptions]);

  const { mutate: recordAttendance, isPending } = useRecordAttendanceMutation();
  const { mutate: updateAttendance, isPending: isUpdating } = useUpdateAttendanceMutation();
  const { mutate: deleteAttendance, isPending: isDeleting } = useDeleteAttendanceMutation();

  const parseLogTime = (log) => {
    if (!log) return null;
    const storedDate = new Date(log.attendance_time);
    return new Date(
      storedDate.getUTCFullYear(),
      storedDate.getUTCMonth(),
      storedDate.getUTCDate(),
      storedDate.getUTCHours(),
      storedDate.getUTCMinutes(),
      storedDate.getUTCSeconds()
    );
  };

  const toTimeInput = (d) =>
    d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

  const handleShiftChange = (shift) => {
    const s = normalizeShiftType(shift);
    if (!s) return;
    if (selectedShift === s) return;
    if (isShiftDisabled(s)) return;
    setSelectedShift(s);
    setSelectedStaff(null);
  };

  const handleStaffChange = (staff) => {
    const next = String(staff || '').trim();
    if (!next) return;
    if (!selectedShift) {
      const msg = '먼저 shift를 선택하세요.';
      if (isCompact) {
        setAlertTone('info');
        setAlertTitle('Attendance');
        setAlertMessage(msg);
        setAlertOpen(true);
      } else {
        showToast(msg);
      }
      return;
    }
    if (isShiftDisabled(selectedShift)) {
      const msg = `이미 ${selectedShift} 스탬프가 있습니다.`;
      if (isCompact) {
        setAlertTone('info');
        setAlertTitle('Attendance');
        setAlertMessage(msg);
        setAlertOpen(true);
      } else {
        showToast(msg);
      }
      return;
    }
    if (isStaffTaken(next)) {
      const msg = `${next}는 오늘 이미 출석했습니다.`;
      if (isCompact) {
        setAlertTone('info');
        setAlertTitle('Attendance');
        setAlertMessage(msg);
        setAlertOpen(true);
      } else {
        showToast(msg);
      }
      return;
    }
    setSelectedStaff(next);
  };

  useEffect(() => {
    if (!open) return;
    if (!selectedShift || !selectedStaff) return;
    if (savingRef.current) return;
    if (isPending) return;
    if (todayShiftTakenSet.has(normalizeShiftType(selectedShift))) {
      const msg = `이미 ${selectedShift} 스탬프가 있습니다.`;
      if (isCompact) {
        setAlertTone('info');
        setAlertTitle('Attendance');
        setAlertMessage(msg);
        setAlertOpen(true);
      } else {
        showToast(msg);
      }
      setSelectedStaff(null);
      savingRef.current = false;
      return;
    }
    if (todayStaffTakenSet.has(String(selectedStaff || '').trim())) {
      const msg = `${selectedStaff}는 오늘 이미 출석했습니다.`;
      if (isCompact) {
        setAlertTone('info');
        setAlertTitle('Attendance');
        setAlertMessage(msg);
        setAlertOpen(true);
      } else {
        showToast(msg);
      }
      setSelectedStaff(null);
      savingRef.current = false;
      return;
    }
    savingRef.current = true;

    const now = new Date();
    const shiftStart = new Date(now);
    {
      const dow = now.getDay();
      if (selectedShift === 'morning') {
        shiftStart.setHours(dow === 3 ? 8 : 6, 0, 0, 0);
      } else {
        if (dow === 3) {
          shiftStart.setHours(8, 0, 0, 0);
        } else {
          const peak = dow === 5 || dow === 6 || dow === 0;
          shiftStart.setHours(peak ? 10 : 11, 30, 0, 0);
        }
      }
    }
    const lateMins = Math.max(0, Math.floor((now.getTime() - shiftStart.getTime()) / 60000));
    const isTardy = lateMins >= 15;

    const finish = (location) => {
      recordAttendance(
        {
          employeeName: selectedStaff,
          shiftType: selectedShift,
          location: location || {},
          isTardy,
          attendanceTime: now,
        },
        {
          onSuccess: (res) => {
            const base = `${selectedStaff} checked in successfully!`;
            const extra = `${selectedShift}${isTardy ? ' (Late)' : ''} / ${formatTimeForDisplay(now)}`;
            if (isCompact) {
              setAlertTone('success');
              setAlertTitle('Attendance Saved');
              setAlertMessage(`${base}\n${extra}`);
              setAlertOpen(true);
            } else {
              showToast(base);
            }
            setSelectedStaff(null);
            setSelectedShift(null);
            savingRef.current = false;
            onClose();
            try {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              const y = toLocalDateKey(d);
              localStorage.setItem(
                '__checkstock_autorun_v1',
                JSON.stringify({
                  date: y,
                  at: Date.now(),
                  showUnchecked: true,
                  resetSoldChecked: true,
                  showOnly: true,
                })
              );
            } catch {
              void 0;
            }
            navigate('/check-stock');

            const id = Array.isArray(res) ? res?.[0]?.id : res?.id;
            if (!id) return;
            if (!location || !location.latitude) return;
            updateAttendance({ id, location }, { onError: () => null });
          },
          onError: (err) => {
            savingRef.current = false;
            const raw = String(err?.message || 'Failed to check in.');
            const nameConstraintHit = raw.includes('attendance_logs_employee_name_check');
            const msg = nameConstraintHit
              ? 'Attendance failed because the employee name is restricted by a DB constraint.\nRun attendance_remove_employee_name_check.sql in Supabase SQL Editor to fix it.'
              : raw;
            if (isCompact) {
              setAlertTone('error');
              setAlertTitle('Attendance Failed');
              setAlertMessage(msg);
              setAlertOpen(true);
            } else {
              console.error(err);
              showToastTyped(normalizeAppError(err, { code: 'ATTENDANCE_SAVE_FAILED', fallbackMessage: 'Failed to check in.' }));
            }
          },
        }
      );
    };

    if (!navigator.geolocation || !navigator.permissions?.query) {
      finish(null);
      return;
    }

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((perm) => {
        if (perm?.state !== 'granted') {
          finish(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            finish({ latitude, longitude });
          },
          () => finish(null),
          { enableHighAccuracy: false, timeout: 1200, maximumAge: 5 * 60 * 1000 }
        );
      })
      .catch(() => finish(null));
  }, [
    open,
    onClose,
    recordAttendance,
    navigate,
    selectedShift,
    selectedStaff,
    showToast,
    isPending,
    updateAttendance,
    isCompact,
    todayShiftTakenSet,
    todayStaffTakenSet,
  ]);

  const [adminDate, setAdminDate] = useState(() => toLocalDateKey(today));
  const adminLogs = useMemo(() => {
    return (monthLogs || []).filter((l) => {
      const stored = new Date(l.attendance_time);
      return toUtcDateKey(stored) === adminDate;
    });
  }, [monthLogs, adminDate]);

  const [adminLogId, setAdminLogId] = useState('');
  const [adminShiftType, setAdminShiftType] = useState('morning');
  const [adminTimeStr, setAdminTimeStr] = useState('06:00');
  const adminLoadedKeyRef = useRef('');

  useEffect(() => {
    if (!open) return;
    if (!isAdmin) return;
    if (adminLogId && adminLogs.some((l) => l.id === adminLogId)) return;
    const first = adminLogs?.[0];
    if (!first) return;
    setAdminLogId(first.id);
  }, [open, isAdmin, adminDate, adminLogs, adminLogId]);

  useEffect(() => {
    if (!open) return;
    if (!isAdmin) return;
    if (!adminLogId) return;
    const key = `${adminDate}:${adminLogId}`;
    if (adminLoadedKeyRef.current === key) return;
    const row = adminLogs.find((l) => l.id === adminLogId);
    if (!row) return;
    setAdminShiftType(String(row.shift_type || 'morning'));
    const d = parseLogTime(row);
    setAdminTimeStr(toTimeInput(d) || (row.shift_type === 'evening' ? '09:00' : '06:00'));
    adminLoadedKeyRef.current = key;
  }, [open, isAdmin, adminDate, adminLogId, adminLogs]);

  const applyAdminEdit = () => {
    if (!isAdmin) {
      openLoginModal();
      return;
    }
    if (!adminLogId) return;
    const row = adminLogs.find((l) => l.id === adminLogId);
    const name = String(row?.employee_name || '').trim();
    if (!name) return;
    const [hh, mm] = String(adminTimeStr || '').split(':');
    const h = Math.min(23, Math.max(0, Number(hh) || 0));
    const m = Math.min(59, Math.max(0, Number(mm) || 0));
    const base = new Date(`${adminDate}T00:00:00`);
    base.setHours(h, m, 0, 0);

    updateAttendance(
      { id: adminLogId, employeeName: name, shiftType: adminShiftType, attendanceTime: base },
      {
        onSuccess: () => {
          const msg = 'Attendance updated.';
          if (isCompact) {
            setAlertTone('success');
            setAlertTitle('Admin Edit');
            setAlertMessage(msg);
            setAlertOpen(true);
          } else {
            showToast(msg);
          }
        },
        onError: (err) => {
          const raw = String(err?.message || 'Failed to update attendance.');
          const isPolicy =
            raw.toLowerCase().includes('row level security') ||
            raw.toLowerCase().includes('permission') ||
            raw.toLowerCase().includes('policy') ||
            raw.toLowerCase().includes('supabase_http_401') ||
            raw.toLowerCase().includes('supabase_http_403');
          const msg = isPolicy
            ? 'Admin edit requires UPDATE policy on attendance_logs.\nRun attendance_enable_update_delete_policies.sql in Supabase SQL Editor.'
            : raw;
          if (isCompact) {
            setAlertTone('error');
            setAlertTitle('Admin Edit Failed');
              setAlertMessage(msg);
              setAlertOpen(true);
            } else {
              console.error(err);
              showToastTyped(normalizeAppError(err, { code: 'ATTENDANCE_UPDATE_FAILED', fallbackMessage: 'Failed to update attendance.' }));
            }
        },
      }
    );
  };

  const deleteAdminLog = () => {
    if (!isAdmin) {
      openLoginModal();
      return;
    }
    if (!adminLogId) return;
    if (!window.confirm('Delete this attendance record?')) return;
    deleteAttendance(
      { id: adminLogId },
      {
        onSuccess: () => {
          const msg = 'Attendance deleted.';
          if (isCompact) {
            setAlertTone('success');
            setAlertTitle('Admin Edit');
            setAlertMessage(msg);
            setAlertOpen(true);
          } else {
            showToast(msg);
          }
          setAdminLogId('');
        },
        onError: (err) => {
          const raw = String(err?.message || 'Failed to delete attendance.');
          const isPolicy =
            raw.toLowerCase().includes('row level security') ||
            raw.toLowerCase().includes('permission') ||
            raw.toLowerCase().includes('policy') ||
            raw.toLowerCase().includes('supabase_http_401') ||
            raw.toLowerCase().includes('supabase_http_403');
          const msg = isPolicy
            ? 'Admin delete requires DELETE policy on attendance_logs.\nRun attendance_enable_update_delete_policies.sql in Supabase SQL Editor.'
            : raw;
          if (isCompact) {
            setAlertTone('error');
            setAlertTitle('Admin Delete Failed');
            setAlertMessage(msg);
            setAlertOpen(true);
          } else {
            console.error(err);
            showToastTyped(normalizeAppError(err, { code: 'ATTENDANCE_DELETE_FAILED', fallbackMessage: 'Failed to delete attendance.' }));
          }
        },
      }
    );
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          <span className="text-yellow-400 font-black text-3xl tracking-wider uppercase drop-shadow-md">
            Daily Attendance Check
          </span>
        }
        align="center"
        size="content"
        fullScreen={isCompact}
        containerStyle={{
          backgroundColor: '#5b21b6', // Deep purple (violet-800) for better contrast
          backgroundImage: 'linear-gradient(to bottom right, #6d28d9, #4c1d95)', // Gradient for "prettier" look
          border: '2px solid #8b5cf6', // Lighter purple border
          boxShadow: '0 0 50px rgba(139, 92, 246, 0.3)', // Purple glow
          width: 'fit-content', // Shrink to fit content
          maxWidth: '95vw',
          padding: '25px',
          borderRadius: '32px',
        }}
        footer={<></>}
      >
        <div className="flex flex-col items-center gap-6 w-fit mx-auto text-center">
          <div className="flex flex-col gap-4 w-fit items-center justify-center text-center mx-auto">
            <CurrentTimeDisplay />

            <span className="text-xl font-bold text-white tracking-widest uppercase opacity-90 drop-shadow-sm mb-2 text-center w-full">
              Select Shift & Staff
            </span>

            <div
              className="grid grid-cols-2 gap-2 justify-center items-center w-fit mx-auto"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 180px)',
                gap: '10px',
                justifyContent: 'center',
                margin: '0 auto',
              }}
            >
              {/* Morning Button */}
              <button
                disabled={isShiftDisabled('morning')}
                onClick={() => handleShiftChange('morning')}
                className={`
                flex items-center justify-center font-black transition-all duration-300 transform
                ${selectedShift === 'morning' && !isShiftDisabled('morning')
                  ? 'scale-105 ring-4 ring-pink-200 translate-y-[-4px] shadow-[0_10px_20px_rgba(251,207,232,0.45)]'
                  : 'hover:bg-white/20 hover:scale-105 shadow-[0_4px_6px_rgba(0,0,0,0.3)]'}
              `}
                style={{
                  height: '60px',
                  fontSize: '1.5rem',
                  backgroundColor: isShiftDisabled('morning') ? '#4c1d95' : '#fbcfe8',
                  color: isShiftDisabled('morning') ? '#fff' : '#000',
                  backdropFilter: 'blur(10px)',
                  width: '100%',
                  border:
                    isShiftDisabled('morning')
                      ? '1px solid rgba(255,255,255,0.22)'
                      : '1px solid rgba(0,0,0,0.18)',
                  borderRadius: '30px',
                  cursor: isShiftDisabled('morning') ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.65 : isShiftDisabled('morning') ? 0.55 : 1,
                  marginBottom: 4,
                  ...(hoverKey === 'shift:morning' && !isShiftDisabled('morning')
                    ? { backgroundColor: '#fb923c', borderColor: '#fb923c', color: '#fff' }
                    : {}),
                }}
                onMouseEnter={() => setHoverKey('shift:morning')}
                onMouseLeave={() => setHoverKey(null)}
                aria-label="morning"
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>☀️</span>
                  <span style={{ fontSize: '1.5rem', lineHeight: 1, letterSpacing: '0.04em' }}>
                    morning
                  </span>
                </span>
              </button>

              {/* Evening Button */}
              <button
                disabled={isShiftDisabled('evening')}
                onClick={() => handleShiftChange('evening')}
                className={`
                flex items-center justify-center font-black transition-all duration-300 transform
                ${selectedShift === 'evening' && !isShiftDisabled('evening')
                  ? 'scale-105 ring-4 ring-pink-200 translate-y-[-4px] shadow-[0_10px_20px_rgba(251,207,232,0.45)]'
                  : 'hover:bg-white/20 hover:scale-105 shadow-[0_4px_6px_rgba(0,0,0,0.3)]'}
              `}
                style={{
                  height: '60px',
                  fontSize: '1.5rem',
                  backgroundColor:
                    isShiftDisabled('evening') ? '#4c1d95' : '#fbcfe8',
                  color: isShiftDisabled('evening') ? '#fff' : '#000',
                  backdropFilter: 'blur(10px)',
                  width: '100%',
                  border:
                    isShiftDisabled('evening')
                      ? '1px solid rgba(255,255,255,0.22)'
                      : '1px solid rgba(0,0,0,0.18)',
                  borderRadius: '30px',
                  cursor:
                    isShiftDisabled('evening')
                      ? 'not-allowed'
                      : 'pointer',
                  opacity: isPending ? 0.65 : isShiftDisabled('evening') ? 0.55 : 1,
                  marginBottom: 4,
                  ...(hoverKey === 'shift:evening' &&
                  !isShiftDisabled('evening')
                    ? { backgroundColor: '#fb923c', borderColor: '#fb923c', color: '#fff' }
                    : {}),
                }}
                onMouseEnter={() => setHoverKey('shift:evening')}
                onMouseLeave={() => setHoverKey(null)}
                aria-label="evening"
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>🌙</span>
                  <span style={{ fontSize: '1.5rem', lineHeight: 1, letterSpacing: '0.04em' }}>
                    evening
                  </span>
                </span>
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'nowrap',
                gap: 8,
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                maxWidth: 380,
                overflowX: 'auto',
                paddingBottom: 4,
              }}
            >
              {staffOptions.map((name) =>
                (() => {
                  const disabled =
                    isPending ||
                    !selectedShift ||
                    isShiftDisabled(selectedShift) ||
                    isStaffTaken(name);
                  const isSelected = selectedStaff === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleStaffChange(name)}
                      disabled={disabled}
                      style={{
                        height: 44,
                        fontSize: '1.05rem',
                        lineHeight: 1,
                        borderRadius: 999,
                        border: '1px solid rgba(255,255,255,0.18)',
                        background: disabled ? '#d8b4fe' : '#FACC15',
                        color: '#000',
                        fontWeight: 950,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.6 : 1,
                        padding: '0 14px',
                        whiteSpace: 'nowrap',
                        flex: '0 0 auto',
                        boxShadow:
                          isSelected ? '0 0 0 3px rgba(255,255,255,0.35)' : 'none',
                        marginBottom: 2,
                        ...(hoverKey === `staff:${name}` && !disabled
                          ? { background: '#fb923c', color: '#fff', borderColor: '#fb923c' }
                          : {}),
                      }}
                      onMouseEnter={() => setHoverKey(`staff:${name}`)}
                      onMouseLeave={() => setHoverKey(null)}
                    >
                      {name}
                    </button>
                  );
                })()
              )}
            </div>


          <div className="flex flex-col items-center gap-3">
            <AttendanceCalendar />
          </div>
            <div className="text-red-300 text-lg font-bold bg-red-900/40 px-6 py-2 rounded-full border border-red-500/30 text-center w-fit mx-auto shadow-lg">
              ⚠️ Attendance score will be 0 if late by more than 15 minutes.
            </div>


            {isPending && <div className="text-white/80 text-sm font-bold mt-2">Saving…</div>}

            {isAdmin && (
              <div
                className="mt-4 w-full"
                style={{
                  maxWidth: 380,
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 18,
                  padding: 14,
                }}
              >
                <div className="text-white font-black tracking-widest uppercase text-sm mb-3">
                  Admin Edit
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <DateInput
                    value={adminDate}
                    onChange={(e) => setAdminDate(e.target.value)}
                    style={{
                      height: 40,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: 'white',
                      padding: '0 10px',
                      fontWeight: 800,
                    }}
                  />
                  <select
                    value={adminLogId}
                    onChange={(e) => setAdminLogId(e.target.value)}
                    style={{
                      height: 40,
                      borderRadius: 12,
                      background: '#ffffff',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#000000',
                      padding: '0 10px',
                      fontWeight: 800,
                    }}
                  >
                    <option value="" style={{ color: '#000000', background: '#ffffff' }}>
                      Select log
                    </option>
                    {adminLogs.map((l) => {
                      const d = parseLogTime(l);
                      const t = formatTimeForDisplay(d) || '';
                      const n = String(l.employee_name || '').trim();
                      return (
                        <option
                          key={l.id}
                          value={l.id}
                          style={{ color: '#000000', background: '#ffffff' }}
                        >
                          {n} {t}
                        </option>
                      );
                    })}
                  </select>
                  <input
                    type="time"
                    value={adminTimeStr}
                    onChange={(e) => setAdminTimeStr(e.target.value)}
                    style={{
                      height: 40,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: 'white',
                      padding: '0 10px',
                      fontWeight: 800,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setAdminShiftType('morning')}
                    style={{
                      height: 40,
                      borderRadius: 12,
                      background:
                        adminShiftType === 'morning' ? '#FACC15' : 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: adminShiftType === 'morning' ? '#000' : '#fff',
                      fontWeight: 900,
                      marginBottom: 2,
                    }}
                  >
                    morning
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminShiftType('evening')}
                    style={{
                      height: 40,
                      borderRadius: 12,
                      background:
                        adminShiftType === 'evening' ? '#FACC15' : 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: adminShiftType === 'evening' ? '#000' : '#fff',
                      fontWeight: 900,
                      marginBottom: 2,
                    }}
                  >
                    evening
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={applyAdminEdit}
                    disabled={isUpdating || !adminLogId}
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: 14,
                      background: isUpdating ? 'rgba(59,130,246,0.45)' : '#2563eb',
                      border: '1px solid rgba(255,255,255,0.18)',
                      color: 'white',
                      fontWeight: 900,
                      cursor: isUpdating ? 'not-allowed' : 'pointer',
                      opacity: adminLogId ? 1 : 0.6,
                      marginBottom: 2,
                    }}
                  >
                    {isUpdating ? 'Updating…' : 'Update'}
                  </button>
                  <button
                    type="button"
                    onClick={deleteAdminLog}
                    disabled={isDeleting || !adminLogId}
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: 14,
                      background: isDeleting ? 'rgba(239,68,68,0.45)' : '#ef4444',
                      border: '1px solid rgba(255,255,255,0.18)',
                      color: 'white',
                      fontWeight: 900,
                      cursor: isDeleting ? 'not-allowed' : 'pointer',
                      opacity: adminLogId ? 1 : 0.6,
                      marginBottom: 2,
                    }}
                  >
                    {isDeleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        title={alertTitle || 'Attendance'}
        size="content"
        fullScreen={isCompact}
        footer={<></>}
      >
        <div style={{ display: 'grid', gap: 12, width: isCompact ? '100%' : 'min(520px, 90vw)' }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color:
                alertTone === 'success'
                  ? 'rgba(34,197,94,0.95)'
                  : alertTone === 'error'
                    ? 'rgba(248,113,113,0.95)'
                    : 'var(--text-main)',
              whiteSpace: 'pre-line',
            }}
          >
            {alertMessage}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="primary" size="sm" onClick={() => setAlertOpen(false)}>
              OK
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
