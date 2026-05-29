import { useMemo, useState } from 'react';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import { useToast } from '../context/ToastContext';
import { useEmployees } from '../features/employees/employeesHooks';
import {
  useCreateEmployeeScheduleMutation,
  useDeleteEmployeeScheduleMutation,
  useEmployeeSchedules,
} from '../features/schedules/schedulesHooks';
import { useAdminStore } from '../store/adminStore';

function pad2(v) {
  return String(v).padStart(2, '0');
}

function toDateKey(d) {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function monthRange(d) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: toDateKey(start), to: toDateKey(end) };
}

function buildCalendarCells(d) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(d.getFullYear(), d.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftBadgeStyle(shiftType, faded) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 999,
    padding: '2px 8px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--text-main)',
    opacity: faded ? 0.35 : 1,
    whiteSpace: 'nowrap',
  };
  if (shiftType === '6AM') {
    return {
      ...base,
      background: 'rgba(59,130,246,0.18)',
      border: '1px solid rgba(59,130,246,0.35)',
      color: '#bfdbfe',
    };
  }
  if (shiftType === '9AM') {
    return {
      ...base,
      background: 'rgba(249,115,22,0.18)',
      border: '1px solid rgba(249,115,22,0.35)',
      color: '#fed7aa',
    };
  }
  return base;
}

export default function SchedulerPage() {
  const isAdmin = useAdminStore((s) => s.isAuthorized());
  const { showToast } = useToast();
  const { data: employees = [] } = useEmployees();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [shiftType, setShiftType] = useState('6AM');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() => {
    try {
      return localStorage.getItem('scheduler_employee_id') || '';
    } catch {
      return '';
    }
  });
  const [myOnly, setMyOnly] = useState(() => {
    try {
      return localStorage.getItem('scheduler_my_only') === '1';
    } catch {
      return false;
    }
  });
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDate, setDetailDate] = useState('');

  const range = useMemo(() => monthRange(currentMonth), [currentMonth]);
  const { data: schedules = [], isLoading } = useEmployeeSchedules(range);
  const createMutation = useCreateEmployeeScheduleMutation();
  const deleteMutation = useDeleteEmployeeScheduleMutation();

  const employeeMap = useMemo(() => {
    return new Map((employees || []).map((e) => [String(e.id), String(e.english_name || '')]));
  }, [employees]);

  const schedulesByDate = useMemo(() => {
    const m = new Map();
    for (const s of schedules || []) {
      const date = String(s.work_date || '');
      if (!date) continue;
      const list = m.get(date) || [];
      list.push(s);
      m.set(date, list);
    }
    return m;
  }, [schedules]);

  const monthTitle = useMemo(() => {
    const d = currentMonth;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }, [currentMonth]);

  const cells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);

  const onPickEmployee = (id) => {
    const value = String(id || '');
    setSelectedEmployeeId(value);
    try {
      localStorage.setItem('scheduler_employee_id', value);
    } catch {}
  };

  const onToggleMyOnly = () => {
    const next = !myOnly;
    setMyOnly(next);
    try {
      localStorage.setItem('scheduler_my_only', next ? '1' : '0');
    } catch {}
  };

  const openDetail = (dateKey) => {
    setDetailDate(String(dateKey || ''));
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
  };

  const canAddOnDate = (dateKey) => {
    const list = schedulesByDate.get(dateKey) || [];
    return list.length < 2;
  };

  const createSchedule = async ({ employeeId, dateKey }) => {
    if (!employeeId || !dateKey) return;
    if (!canAddOnDate(dateKey)) {
      showToast('하루 최대 2명까지만 배정할 수 있습니다.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        employee_id: employeeId,
        shift_type: shiftType,
        work_date: dateKey,
      });
      showToast('스케줄이 저장됐습니다.');
    } catch (e) {
      showToast(e?.message || '스케줄 저장 실패');
    }
  };

  const deleteSchedule = async (id) => {
    try {
      await deleteMutation.mutateAsync(id);
      showToast('삭제했습니다.');
    } catch (e) {
      showToast(e?.message || '삭제 실패');
    }
  };

  const renderCell = (dateObj, idx) => {
    const dateKey = dateObj ? toDateKey(dateObj) : '';
    const list = dateKey ? schedulesByDate.get(dateKey) || [] : [];
    const isSelectedDate = Boolean(detailOpen && detailDate && detailDate === dateKey);

    return (
      <div
        key={`${monthTitle}-${idx}`}
        onClick={() => (dateKey ? openDetail(dateKey) : null)}
        onDragOver={(e) => {
          if (!isAdmin || !dateKey) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (!isAdmin || !dateKey) return;
          e.preventDefault();
          const raw = e.dataTransfer?.getData('application/json') || '';
          let payload = null;
          try {
            payload = raw ? JSON.parse(raw) : null;
          } catch {
            payload = null;
          }
          const employeeId = String(payload?.id || '').trim();
          if (!employeeId) return;
          createSchedule({ employeeId, dateKey });
        }}
        style={{
          border: isSelectedDate
            ? '1px solid rgba(212,175,55,0.55)'
            : '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 12,
          minHeight: 92,
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          cursor: dateKey ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800 }}>
            {dateObj ? dateObj.getDate() : ''}
          </div>
          {isAdmin && dateKey ? (
            <div
              style={{
                fontSize: 11,
                color: canAddOnDate(dateKey) ? '#22c55e' : '#ef4444',
                fontWeight: 800,
              }}
            >
              {list.length}/2
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((s) => {
            const empName = employeeMap.get(String(s.employee_id)) || 'Unknown';
            const faded =
              myOnly && selectedEmployeeId
                ? String(s.employee_id) !== String(selectedEmployeeId)
                : false;
            return (
              <div key={String(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={shiftBadgeStyle(String(s.shift_type || ''), faded)}>
                  [{String(s.shift_type || '').toUpperCase()}] {empName}
                </span>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSchedule(s.id);
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: faded ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)',
                      fontWeight: 900,
                      cursor: 'pointer',
                      padding: 0,
                      lineHeight: 1,
                    }}
                    aria-label="Delete schedule"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const detailRows = useMemo(() => {
    if (!detailDate) return [];
    const list = schedulesByDate.get(detailDate) || [];
    return list.map((s) => ({
      id: s.id,
      employee: employeeMap.get(String(s.employee_id)) || 'Unknown',
      shift: String(s.shift_type || ''),
    }));
  }, [detailDate, schedulesByDate, employeeMap]);

  const adminPanel = (
    <div className="page-card" style={{ minWidth: 260, flex: '0 0 320px' }}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontWeight: 900, color: 'var(--gold-soft)' }}>SCHEDULER CONTROL</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800 }}>Shift</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              size="sm"
              variant={shiftType === '6AM' ? 'primary' : 'outline'}
              onClick={() => setShiftType('6AM')}
            >
              6AM
            </Button>
            <Button
              size="sm"
              variant={shiftType === '9AM' ? 'primary' : 'outline'}
              onClick={() => setShiftType('9AM')}
            >
              9AM
            </Button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800 }}>Employees</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {(employees || []).map((e) => (
              <div
                key={String(e.id)}
                draggable
                onDragStart={(ev) => {
                  ev.dataTransfer.setData(
                    'application/json',
                    JSON.stringify({ id: String(e.id), name: String(e.english_name || '') })
                  );
                  ev.dataTransfer.effectAllowed = 'copy';
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: '#0f0f17',
                  color: 'var(--text-main)',
                  fontWeight: 800,
                  cursor: 'grab',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(e.english_name || '')}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>
                  ↔
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const mobileControls = (
    <div className="page-card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 900, color: 'var(--gold-soft)' }}>MY SCHEDULE</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800 }}>
            내 일정만
          </label>
          <input type="checkbox" checked={myOnly} onChange={onToggleMyOnly} />
        </div>
        <select
          value={selectedEmployeeId}
          onChange={(e) => onPickEmployee(e.target.value)}
          style={{
            height: 34,
            padding: '0 10px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.18)',
            background: '#101018',
            color: 'var(--text-main)',
            fontWeight: 700,
          }}
        >
          <option value="">직원 선택</option>
          {(employees || []).map((e) => (
            <option key={String(e.id)} value={String(e.id)}>
              {String(e.english_name || '')}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <div className="page-container">
      <div className="flex justify-between items-center mb-3 page-header">
        <div style={{ display: 'grid', gap: 2 }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            Scheduler
          </h1>
          <div className="page-subtitle">
            {isAdmin ? 'Admin scheduling' : 'Mobile schedule view'}
          </div>
        </div>
        <div className="page-actions">
          <Button
            variant="outline"
            onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          >
            Prev
          </Button>
          <div style={{ fontWeight: 900, color: 'var(--gold)' }}>{monthTitle}</div>
          <Button
            variant="outline"
            onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          >
            Next
          </Button>
        </div>
      </div>

      {!isAdmin ? mobileControls : null}

      <div
        className={`flex gap-3 ${isAdmin ? 'stack-mobile' : ''}`}
        style={{ alignItems: 'flex-start' }}
      >
        {isAdmin ? adminPanel : null}

        <div className="page-card" style={{ flex: 1, minWidth: 0 }}>
          {isLoading ? <div style={{ color: 'var(--text-muted)' }}>Loading...</div> : null}
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 10 }}
          >
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div
                key={d}
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '0 6px',
                }}
              >
                {d}
              </div>
            ))}
            {cells.map((dateObj, idx) => renderCell(dateObj, idx))}
          </div>
        </div>
      </div>

      <Modal
        open={detailOpen}
        title={detailDate ? `Schedule: ${detailDate}` : 'Schedule'}
        onClose={closeDetail}
        size="content"
        align={isAdmin ? 'center' : 'top'}
        containerStyle={
          isAdmin
            ? { width: 'min(520px, 96vw)', maxWidth: '96vw' }
            : {
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                width: '100vw',
                maxWidth: '100vw',
                borderRadius: '18px 18px 0 0',
                maxHeight: '70vh',
              }
        }
        footer={<></>}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {detailRows.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontWeight: 800 }}>No schedules.</div>
          ) : (
            detailRows.map((r) => (
              <div
                key={String(r.id)}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: '#0f0f17',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={shiftBadgeStyle(r.shift, false)}>[{r.shift}]</span>
                  <div style={{ fontWeight: 900 }}>{r.employee}</div>
                </div>
                {isAdmin ? (
                  <Button size="sm" variant="danger" onClick={() => deleteSchedule(r.id)}>
                    Delete
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
