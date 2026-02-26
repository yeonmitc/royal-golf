import { useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import {
  useCheckDailyAttendance,
  useMonthlyAttendance,
  useRecordAttendanceMutation,
} from '../../features/attendance/attendanceHooks';
import Modal from '../common/Modal';

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

const getMoodEmoji = (score) => {
  if (score === 100) return { emoji: '❤️', label: '아주 좋음', color: 'text-red-500' };
  if (score >= 90) return { emoji: '😄', label: '좋음', color: 'text-green-500' };
  if (score >= 80) return { emoji: '🙂', label: '미소', color: 'text-yellow-400' };
  if (score >= 70) return { emoji: '😐', label: '보통', color: 'text-gray-400' };
  if (score >= 50) return { emoji: '😖', label: '찡그림', color: 'text-orange-500' };
  return { emoji: '😡', label: '화남', color: 'text-red-700' };
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

const CurrentTimeDisplay = () => {
  const [now, setNow] = useState(new Date());

  // Update time every second
  useState(() => {
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
    const result = { score: null, isFuture, hasLog: false, details: [] };

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

    const jLog = dayLogs.find((l) => l.employee_name === 'JESHEICA');
    const bLog = dayLogs.find((l) => l.employee_name === 'BERLYN');

    if (!jLog && !bLog) return result;

    let totalScore = 0;
    const details = [];

    // ... scoring logic ...
    // Jesheica (50%)
    if (jLog) {
      // Parse Local-as-UTC
      const stored = new Date(jLog.attendance_time);
      const checkTime = new Date(
        stored.getUTCFullYear(),
        stored.getUTCMonth(),
        stored.getUTCDate(),
        stored.getUTCHours(),
        stored.getUTCMinutes()
      );

      const target = new Date(checkTime);
      if (jLog.shift_type === '6AM') target.setHours(6, 0, 0, 0);
      else target.setHours(9, 0, 0, 0);

      const score = getPunctualityScore(target, checkTime);
      totalScore += score / 2;

      const diffMs = checkTime - target;
      const lateMins = Math.max(0, Math.floor(diffMs / 1000 / 60));
      const timeStr = formatTimeForDisplay(checkTime);

      details.push({
        name: 'JESHEICA',
        score,
        lateMins,
        time: timeStr,
      });
    } else {
      details.push({ name: 'JESHEICA', score: 0, lateMins: 'N/A', time: 'No Show' });
    }

    // Berlin (50%)
    if (bLog) {
      // Parse Local-as-UTC
      const stored = new Date(bLog.attendance_time);
      const checkTime = new Date(
        stored.getUTCFullYear(),
        stored.getUTCMonth(),
        stored.getUTCDate(),
        stored.getUTCHours(),
        stored.getUTCMinutes()
      );

      const target = new Date(checkTime);
      if (bLog.shift_type === '6AM') target.setHours(6, 0, 0, 0);
      else target.setHours(9, 0, 0, 0);

      const score = getPunctualityScore(target, checkTime);
      totalScore += score / 2;

      const diffMs = checkTime - target;
      const lateMins = Math.max(0, Math.floor(diffMs / 1000 / 60));
      const timeStr = formatTimeForDisplay(checkTime);

      details.push({
        name: 'BEN',
        score,
        lateMins,
        time: timeStr,
      });
    } else {
      details.push({ name: 'BERLYN', score: 0, lateMins: 'N/A', time: 'No Show' });
    }

    return { score: Math.round(totalScore), isFuture, hasLog: true, details };
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
          const { score, hasLog, details } = getDayScore(day);
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
                  const shortName = d.name.charAt(0);
                  return `${shortName} : ${d.time}`;
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

      // Force close if open on mobile/tablet
      if (open && mobile) {
        onClose();
        showToast('Attendance check is only available on PC.');
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [open, onClose, showToast]);

  // Check attendance status for both employees
  const { data: jesheicaLog, isLoading: jLoading } = useCheckDailyAttendance('JESHEICA');
  const { data: berlynLog, isLoading: bLoading } = useCheckDailyAttendance('BERLYN');

  const { mutate: recordAttendance, isPending } = useRecordAttendanceMutation();

  // Get time strings for buttons
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

  const jDate = parseLogTime(jesheicaLog);
  const bDate = parseLogTime(berlynLog);

  const jTime = formatTimeForDisplay(jDate);
  const bTime = formatTimeForDisplay(bDate);

  const handleShiftChange = (shift) => {
    if (selectedShift === shift) {
      setSelectedShift(null);
    } else {
      setSelectedShift(shift);
    }
  };

  const handleStaffChange = (staff) => {
    // If already checked in, don't allow selection (or maybe just show status)
    if (staff === 'JESHEICA' && jesheicaLog) return;
    if (staff === 'BERLYN' && berlynLog) return;

    if (selectedStaff === staff) {
      setSelectedStaff(null);
    } else {
      setSelectedStaff(staff);
    }
  };

  const handleSave = () => {
    if (!selectedShift) {
      showToast('Please select a shift time.');
      return;
    }
    if (!selectedStaff) {
      showToast('Please select a staff member.');
      return;
    }

    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.');
      return;
    }

    // Request location
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const location = { latitude, longitude };

        // Tardiness check logic
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        let isTardy = false;
        if (selectedShift === '6AM') {
          if (hours > 6 || (hours === 6 && minutes >= 15)) {
            isTardy = true;
          }
        } else if (selectedShift === '9AM') {
          if (hours > 9 || (hours === 9 && minutes >= 15)) {
            isTardy = true;
          }
        }

        recordAttendance(
          { employeeName: selectedStaff, shiftType: selectedShift, location, isTardy },
          {
            onSuccess: () => {
              showToast(`${selectedStaff} checked in successfully!`);
              // Reset selection
              setSelectedStaff(null);
              setSelectedShift(null);
              onClose(); // Close modal on success
            },
            onError: (err) => {
              showToast(err.message || 'Failed to check in.');
            },
          }
        );
      },
      (error) => {
        showToast('Unable to retrieve your location. Please allow location access.');
        console.error(error);
      }
    );
  };

  return (
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
        <AttendanceCalendar />

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
              onClick={() => handleShiftChange('6AM')}
              className={`
                flex items-center justify-center font-black transition-all duration-300 transform
                ${
                  selectedShift === '6AM'
                    ? 'text-black scale-105 ring-4 ring-yellow-300 translate-y-[-4px] shadow-[0_10px_20px_rgba(250,204,21,0.5)]'
                    : 'text-white hover:bg-white/20 hover:scale-105 shadow-[0_4px_6px_rgba(0,0,0,0.3)]'
                }
              `}
              style={{
                height: '60px',
                fontSize: '1.5rem',
                backgroundColor: selectedShift === '6AM' ? '#FACC15' : 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                width: '100%',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '30px',
                cursor: 'pointer',
              }}
            >
              6 AM
            </button>

            {/* 9AM Button */}
            <button
              onClick={() => handleShiftChange('9AM')}
              className={`
                flex items-center justify-center font-black transition-all duration-300 transform
                ${
                  selectedShift === '9AM'
                    ? 'text-black scale-105 ring-4 ring-yellow-300 translate-y-[-4px] shadow-[0_10px_20px_rgba(250,204,21,0.5)]'
                    : 'text-white hover:bg-white/20 hover:scale-105 shadow-[0_4px_6px_rgba(0,0,0,0.3)]'
                }
              `}
              style={{
                height: '60px',
                fontSize: '1.5rem',
                backgroundColor: selectedShift === '9AM' ? '#FACC15' : 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                width: '100%',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '30px',
                cursor: 'pointer',
              }}
            >
              9 AM
            </button>

            {/* JESHEICA Button */}
            <button
              onClick={() => handleStaffChange('JESHEICA')}
              disabled={!!jesheicaLog || isPending || jLoading}
              className={`
                flex items-center justify-center font-black transition-all duration-300 transform relative overflow-hidden
                ${
                  jesheicaLog
                    ? 'text-white cursor-default shadow-none opacity-80'
                    : selectedStaff === 'JESHEICA'
                      ? 'text-white scale-105 ring-4 ring-orange-300 translate-y-[-4px] shadow-[0_10px_20px_rgba(249,115,22,0.5)]'
                      : 'text-white hover:bg-white/20 hover:scale-105 shadow-[0_4px_6px_rgba(0,0,0,0.3)]'
                }
              `}
              style={{
                height: '60px',
                fontSize: jesheicaLog ? '1.2rem' : '1.5rem',
                backgroundColor: jesheicaLog
                  ? '#22c55e'
                  : selectedStaff === 'JESHEICA'
                    ? '#F97316'
                    : 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                width: '100%',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '30px',
                cursor: 'pointer',
              }}
            >
              {jesheicaLog ? (
                <div className="text-center leading-tight">
                  JESHEICA
                  <br />
                  <span className="text-sm font-medium opacity-90">{jTime}</span>
                </div>
              ) : (
                'JESHEICA'
              )}
            </button>

            {/* BERLYN Button */}
            <button
              onClick={() => handleStaffChange('BERLYN')}
              disabled={!!berlynLog || isPending || bLoading}
              className={`
                flex items-center justify-center font-black transition-all duration-300 transform relative overflow-hidden
                ${
                  berlynLog
                    ? 'text-white cursor-default shadow-none opacity-80'
                    : selectedStaff === 'BERLYN'
                      ? 'text-white scale-105 ring-4 ring-orange-300 translate-y-[-4px] shadow-[0_10px_20px_rgba(249,115,22,0.5)]'
                      : 'text-white hover:bg-white/20 hover:scale-105 shadow-[0_4px_6px_rgba(0,0,0,0.3)]'
                }
              `}
              style={{
                height: '60px',
                fontSize: berlynLog ? '1.2rem' : '1.5rem',
                backgroundColor: berlynLog
                  ? '#22c55e'
                  : selectedStaff === 'BERLYN'
                    ? '#F97316'
                    : 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                width: '100%',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '30px',
                cursor: 'pointer',
              }}
            >
              {berlynLog ? (
                <div className="text-center leading-tight">
                  BERLYN
                  <br />
                  <span className="text-sm font-medium opacity-90">{bTime}</span>
                </div>
              ) : (
                'BERLYN'
              )}
            </button>
          </div>

          <div className="text-red-300 text-lg font-bold bg-red-900/40 px-6 py-2 rounded-full border border-red-500/30 text-center w-fit mx-auto shadow-lg">
            ⚠️ Attendance score will be 0 if late by more than 15 minutes.
          </div>

          {/* SAVE Button */}
          <button
            onClick={handleSave}
            disabled={!selectedShift || !selectedStaff || isPending}
            className={`
                w-full mt-4 font-black tracking-widest uppercase transition-all duration-300
                ${
                  !selectedShift || !selectedStaff
                    ? 'text-gray-400 cursor-not-allowed shadow-none bg-black/20'
                    : 'text-white bg-[#10B981] hover:bg-white hover:text-[#10B981] hover:scale-[1.02] shadow-[0_10px_30px_rgba(16,185,129,0.4)] hover:shadow-[0_15px_35px_rgba(16,185,129,0.6)] active:scale-95'
                }
              `}
            style={{
              height: '60px',
              fontSize: '1.5rem',
              fontWeight: '900',
              maxWidth: '100%',
              margin: '20px auto 5px auto',
              border: !selectedShift || !selectedStaff ? '1px solid rgba(255,255,255,0.1)' : 'none',
              borderRadius: '30px',
              cursor: !selectedShift || !selectedStaff ? 'not-allowed' : 'pointer',
              display: 'block', // Ensure block display for margin auto to work
            }}
          >
            {isPending ? 'Saving...' : 'SAVE ATTENDANCE'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
