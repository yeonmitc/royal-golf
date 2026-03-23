import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
  useCheckDailyAttendance,
  useMonthlyAttendance,
  useRecordAttendanceMutation,
  useDeleteAttendanceMutation,
  useUpdateAttendanceMutation,
} from '../../features/attendance/attendanceHooks';
import { useEmployees } from '../../features/employees/employeesHooks';
import { useAdminStore } from '../../store/adminStore';
import Modal from '../common/Modal';
import Button from '../common/Button';

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
  if (lateMins <= 5) return 100;
  if (lateMins <= 8) return 90;
  if (lateMins <= 11) return 80;
  if (lateMins <= 13) return 70;
  if (lateMins <= 15) return 60;
  return 0;
};

const getMoodEmoji = (score) => {
  if (score === 100) return { emoji: '🥰', label: 'Perfect', color: 'text-red-500' };
  if (score >= 90) return { emoji: '😄', label: '좋음', color: 'text-green-500' };
  if (score >= 80) return { emoji: '🙂', label: '미소', color: 'text-yellow-400' };
  if (score >= 70) return { emoji: '😐', label: '보통', color: 'text-gray-400' };
  if (score >= 50) return { emoji: '😖', label: '찡그림', color: 'text-orange-500' };
  return { emoji: '😭', label: '우는 중', color: 'text-blue-500' };
};

const formatTimeForDisplay = (date) => {
  if (!date) return null;
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
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

const AttendanceCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const { data: logs = [] } = useMonthlyAttendance(year, month);

  // Calculate days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0 = Sun

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  const [selectedDateLogs, setSelectedDateLogs] = useState(null); // { dateStr, details }

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
      return { score: null, isFuture, hasLog: true, details: [], noAttendance: true };
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
      if (l.shift_type === '6AM') target.setHours(6, 0, 0, 0);
      else target.setHours(9, 0, 0, 0);

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

    const scores = details.map((d) => Number(d.score ?? 0) || 0);
    const avg = scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 100;
    const finalScore = Math.max(0, Math.min(100, avg));
    return { score: Math.round(finalScore), isFuture, hasLog: true, details, noAttendance: false };
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
          const { score, hasLog, details, noAttendance } = getDayScore(day);
          const isToday =
            day === new Date().getDate() &&
            month === new Date().getMonth() + 1 &&
            year === new Date().getFullYear();

          // Use inline styles to ensure size is applied regardless of Tailwind config
          // Reduced to approx 1/3 of previous size (140px -> 48px)
          const emojiStyle = {
            width: '48px',
            height: '48px',
            fontSize: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            cursor: hasLog ? 'pointer' : 'default',
          };

          let faceContent = (
            <div className="bg-[#805AD5] text-purple-900/50" style={emojiStyle}>
              ☻
            </div>
          );

          if (hasLog && score === null && noAttendance) {
            const isSelected = selectedDateLogs?.dateStr === `${year}-${month}-${day}`;
            faceContent = (
              <div
                className={`bg-[#F87171] text-gray-800 transition-transform duration-300 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 ${isSelected ? 'scale-[1.4]' : 'hover:scale-[1.4]'}`}
                style={{ ...emojiStyle, cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSelected) {
                    setSelectedDateLogs(null);
                  } else {
                    setSelectedDateLogs({
                      dateStr: `${year}-${month}-${day}`,
                      details,
                    });
                  }
                }}
              >
                ❤️
              </div>
            );
          } else
          if (hasLog && score !== null) {
            const emojiData = getMoodEmoji(score);
            // Custom colors based on score to match image style
            let bgColorClass = 'bg-[#A3E635]'; // Greenish
            if (score < 50)
              bgColorClass = 'bg-[#F87171]'; // Red
            else if (score < 80) bgColorClass = 'bg-[#FACC15]'; // Yellow

            const isSelected = selectedDateLogs?.dateStr === `${year}-${month}-${day}`;

            faceContent = (
              <div
                className={`${bgColorClass} text-gray-800 transition-transform duration-300 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 ${isSelected ? 'scale-[1.4]' : 'hover:scale-[1.4]'}`}
                style={{ ...emojiStyle }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSelected) {
                    setSelectedDateLogs(null);
                  } else {
                    setSelectedDateLogs({
                      dateStr: `${year}-${month}-${day}`,
                      details,
                    });
                  }
                }}
              >
                {emojiData.emoji}
              </div>
            );
          }

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
              {selectedDateLogs.details
                .map((d) => {
                  return `${d.name} : ${d.time}`;
                })
                .join(' / ')}
            </div>
          </div>
        ) : (
          <div className="text-purple-300/30 text-sm font-medium italic">
            Click an emoji to view details
          </div>
        )}
      </div>
    </div>
  );
};

export default function AttendanceModal({ open, onClose }) {
  const [selectedShift, setSelectedShift] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const { showToast } = useToast();
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
  const [justCheckedSet, setJustCheckedSet] = useState(() => new Set());

  useEffect(() => {
    if (!open) return;
    setJustCheckedSet(new Set());
  }, [open, todayKey]);

  const checkedTodaySet = useMemo(() => {
    const set = new Set();
    (monthLogs || []).forEach((l) => {
      const stored = new Date(l.attendance_time);
      const logKey = toLocalDateKey(
        new Date(stored.getUTCFullYear(), stored.getUTCMonth(), stored.getUTCDate())
      );
      if (logKey !== todayKey) return;
      const name = String(l?.employee_name || '').trim();
      if (name) set.add(name);
    });
    justCheckedSet.forEach((n) => set.add(n));
    return set;
  }, [monthLogs, todayKey, justCheckedSet]);

  const staffOptions = (() => {
    const emp = (employees || [])
      .map((e) => String(e?.english_name || '').trim())
      .filter(Boolean);
    if (emp.length > 0) return emp;
    return Array.from(
      new Set((monthLogs || []).map((l) => String(l?.employee_name || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  })();

  const { data: selectedStaffLog, isLoading: staffCheckLoading } = useCheckDailyAttendance(
    selectedStaff || ''
  );
  const normalizeShiftType = (s) =>
    String(s || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  const checkedShiftType = selectedStaffLog ? normalizeShiftType(selectedStaffLog.shift_type) : '';
  const isAlreadyChecked = Boolean(selectedStaffLog);

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
    if (selectedShift === shift) return;
    setSelectedShift(shift);
  };

  const handleStaffChange = (staff) => {
    const next = String(staff || '').trim();
    if (!next) return;
    if (selectedStaff === next) {
      setSelectedStaff(null);
      setSelectedShift(null);
      return;
    }
    setSelectedStaff(next);
    setSelectedShift(null);
    if (!checkedTodaySet.has(next)) return;
    const msg = `Already checked in today: ${next}`;
    if (isCompact) {
      setAlertTone('info');
      setAlertTitle('Attendance');
      setAlertMessage(msg);
      setAlertOpen(true);
    } else {
      showToast(msg);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (!selectedStaff) return;
    if (staffCheckLoading) return;
    if (!selectedStaffLog) return;
    setSelectedShift(checkedShiftType || null);
  }, [open, selectedStaff, selectedStaffLog, checkedShiftType, staffCheckLoading]);

  useEffect(() => {
    if (!open) return;
    if (!selectedShift || !selectedStaff) return;
    if (savingRef.current) return;
    if (isPending) return;
    if (staffCheckLoading) return;
    if (selectedStaffLog) {
      const d = parseLogTime(selectedStaffLog);
      const msg = `Already checked: ${selectedStaff} (${formatTimeForDisplay(d)})`;
      if (isCompact) {
        setAlertTone('info');
        setAlertTitle('Attendance');
        setAlertMessage(msg);
        setAlertOpen(true);
      } else {
        showToast(msg);
      }
      savingRef.current = false;
      return;
    }
    savingRef.current = true;

    const now = new Date();
    const shiftStart = new Date(now);
    if (selectedShift === '6AM') shiftStart.setHours(6, 0, 0, 0);
    else shiftStart.setHours(9, 0, 0, 0);
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
            setJustCheckedSet((prev) => {
              const next = new Set(prev);
              next.add(selectedStaff);
              return next;
            });
            setSelectedStaff(null);
            setSelectedShift(null);
            savingRef.current = false;
            onClose();
            try {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              const y = toLocalDateKey(d);
              localStorage.setItem('__checkstock_autorun_v1', JSON.stringify({ date: y, at: Date.now() }));
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
              showToast(msg);
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
    staffCheckLoading,
    selectedStaffLog,
    isCompact,
  ]);

  const [adminDate, setAdminDate] = useState(() => toLocalDateKey(today));
  const adminLogs = useMemo(() => {
    return (monthLogs || []).filter((l) => {
      const stored = new Date(l.attendance_time);
      return toUtcDateKey(stored) === adminDate;
    });
  }, [monthLogs, adminDate]);

  const [adminLogId, setAdminLogId] = useState('');
  const [adminShiftType, setAdminShiftType] = useState('6AM');
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
    setAdminShiftType(String(row.shift_type || '6AM'));
    const d = parseLogTime(row);
    setAdminTimeStr(toTimeInput(d) || (row.shift_type === '9AM' ? '09:00' : '06:00'));
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
            showToast(msg);
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
            showToast(msg);
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
        {/* Attendance Calendar (Top) */}
        <div className="flex flex-col items-center gap-3">
          <AttendanceCalendar />
        </div>

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
            {/* 6AM Button */}
            <button
              disabled={isPending || isAlreadyChecked}
              onClick={() => handleShiftChange('6AM')}
              className={`
                flex items-center justify-center font-black transition-all duration-300 transform
                ${
                  selectedShift === '6AM' || (isAlreadyChecked && checkedShiftType === '6AM')
                    ? 'text-black scale-105 ring-4 ring-yellow-300 translate-y-[-4px] shadow-[0_10px_20px_rgba(250,204,21,0.5)]'
                    : 'text-white hover:bg-white/20 hover:scale-105 shadow-[0_4px_6px_rgba(0,0,0,0.3)]'
                }
              `}
              style={{
                height: '60px',
                fontSize: '1.5rem',
                backgroundColor:
                  selectedShift === '6AM' || (isAlreadyChecked && checkedShiftType === '6AM')
                    ? '#FACC15'
                    : 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                width: '100%',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '30px',
                cursor: isPending || isAlreadyChecked ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.65 : isAlreadyChecked ? 0.85 : 1,
                marginBottom: 2,
              }}
            >
              6 AM
            </button>

            {/* 9AM Button */}
            <button
              disabled={isPending || isAlreadyChecked}
              onClick={() => handleShiftChange('9AM')}
              className={`
                flex items-center justify-center font-black transition-all duration-300 transform
                ${
                  selectedShift === '9AM' || (isAlreadyChecked && checkedShiftType === '9AM')
                    ? 'text-black scale-105 ring-4 ring-yellow-300 translate-y-[-4px] shadow-[0_10px_20px_rgba(250,204,21,0.5)]'
                    : 'text-white hover:bg-white/20 hover:scale-105 shadow-[0_4px_6px_rgba(0,0,0,0.3)]'
                }
              `}
              style={{
                height: '60px',
                fontSize: '1.5rem',
                backgroundColor:
                  selectedShift === '9AM' || (isAlreadyChecked && checkedShiftType === '9AM')
                    ? '#FACC15'
                    : 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                width: '100%',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '30px',
                cursor: isPending || isAlreadyChecked ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.65 : isAlreadyChecked ? 0.85 : 1,
                marginBottom: 2,
              }}
            >
              9 AM
            </button>

          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              maxWidth: 380,
            }}
          >
            {staffOptions.map((name) => (
              (() => {
                const isCheckedToday = checkedTodaySet.has(name);
                const disabled = isPending || staffCheckLoading;
                return (
              <button
                key={name}
                type="button"
                onClick={() => handleStaffChange(name)}
                disabled={disabled}
                style={{
                  height: '60px',
                  fontSize: '1.5rem',
                  borderRadius: '30px',
                  border: '1px solid rgba(255,255,255,0.20)',
                  background:
                    isCheckedToday
                      ? '#FACC15'
                      : selectedStaff === name
                        ? '#FACC15'
                        : 'rgba(255, 255, 255, 0.10)',
                  color: isCheckedToday || selectedStaff === name ? '#000' : 'white',
                  fontWeight: 900,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: isCheckedToday ? 0.75 : isPending ? 0.7 : 1,
                  padding: '0 22px',
                  marginBottom: 2,
                }}
              >
                {name}
              </button>
                );
              })()
            ))}
          </div>

          <div className="text-red-300 text-lg font-bold bg-red-900/40 px-6 py-2 rounded-full border border-red-500/30 text-center w-fit mx-auto shadow-lg">
            ⚠️ Attendance score will be 0 if late by more than 15 minutes.
          </div>

          {isPending && (
            <div className="text-white/80 text-sm font-bold mt-2">Saving…</div>
          )}

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
                <input
                  type="date"
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
                      <option key={l.id} value={l.id} style={{ color: '#000000', background: '#ffffff' }}>
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
                  onClick={() => setAdminShiftType('6AM')}
                  style={{
                    height: 40,
                    borderRadius: 12,
                    background: adminShiftType === '6AM' ? '#FACC15' : 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: adminShiftType === '6AM' ? '#000' : '#fff',
                    fontWeight: 900,
                    marginBottom: 2,
                  }}
                >
                  6AM
                </button>
                <button
                  type="button"
                  onClick={() => setAdminShiftType('9AM')}
                  style={{
                    height: 40,
                    borderRadius: 12,
                    background: adminShiftType === '9AM' ? '#FACC15' : 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: adminShiftType === '9AM' ? '#000' : '#fff',
                    fontWeight: 900,
                    marginBottom: 2,
                  }}
                >
                  9AM
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
