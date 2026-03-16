import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { useChecklistDaily, useUpsertChecklistDailyMutation } from '../../features/checklist/checklistHooks';
import { useToast } from '../../context/ToastContext';
import { useAdminStore } from '../../store/adminStore';

const DEFAULT_ITEMS = [
  'Open the door for 2 hours and check attendance stamp (MUST FIRST)',
  'Mop the floor (opening cleaning)',
  "Count products from yesterday’s sales using the system (stock check)",
  'Clean glass surfaces (entrance, shelves, mirrors, display)',
  'Check clothes condition (steam wrinkles / cut loose threads / check inside)',
  'Organize displays by color and brand (restock sold products if needed)',
  'Record sales in the system, receipts, and Google Sheet and send a screenshot to KakaoTalk',
  'Count cash and verify with the system (₱5000 original: 100×15, 500×7)',
  'Sweep the floor and remove trash if full (closing cleaning)',
];

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function businessDateKey(d, resetHour = 5) {
  const x = new Date(d);
  if (x.getHours() < resetHour) x.setDate(x.getDate() - 1);
  return dateKey(x);
}

function formatHHSS(d) {
  const hh = String(d.getHours()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${ss}`;
}

function storageKey(dateStr, employeeNames) {
  return `checklist:${dateStr}:${employeeNames}`;
}

export default function ChecklistModal({ open, onClose, employeeNames }) {
  const { mutate: upsertChecklist, isPending } = useUpsertChecklistDailyMutation();
  const { showToast } = useToast();
  const isAdmin = useAdminStore((s) => s.isAuthorized());

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!open) return undefined;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, [open]);

  const dateStr = businessDateKey(now, 5);
  const employeeKey = String(employeeNames || '').trim();
  const selectedEmployees = useMemo(
    () =>
      employeeKey
        .split(',')
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .slice(0, 2),
    [employeeKey]
  );

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      const ua = navigator.userAgent;
      const isMobileUA =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet|Kindle|Silk|PlayBook/i.test(
          ua
        );
      const isIOSDesktop = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
      setIsMobile(isMobileUA || isIOSDesktop || window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const { data: dayRow } = useChecklistDaily(dateStr, { enabled: open });

  const [items, setItems] = useState(DEFAULT_ITEMS);
  const [checkedMap, setCheckedMap] = useState({}); // {index: true/false}
  const [metaMap, setMetaMap] = useState({}); // {index: { by, time }}
  const restoredRef = useRef({ key: '', source: '' });

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem('checklist_items_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string') && parsed.length > 0) {
          setItems(parsed.map((s) => String(s).trim()).filter(Boolean));
        } else {
          setItems(DEFAULT_ITEMS);
        }
      } else {
        setItems(DEFAULT_ITEMS);
      }
    } catch {
      setItems(DEFAULT_ITEMS);
    }
    if (!employeeKey) return;
    const key = storageKey(dateStr, employeeKey);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        setCheckedMap(parsed?.checkedMap || {});
        const incoming = parsed?.metaMap || parsed?.timeMap || {};
        const nextMeta = {};
        Object.keys(incoming || {}).forEach((k) => {
          const idx = Number(k);
          if (!Number.isFinite(idx)) return;
          const v = incoming[k];
          if (typeof v === 'string') {
            nextMeta[idx] = { by: employeeKey, time: v };
            return;
          }
          if (v && typeof v === 'object') {
            const by = String(v.by || '').trim();
            const time = String(v.time || '').trim();
            if (time) nextMeta[idx] = { by: by || employeeKey, time };
          }
        });
        setMetaMap(nextMeta);
        restoredRef.current = { key: employeeKey, source: 'local' };
      } else {
        setCheckedMap({});
        setMetaMap({});
        restoredRef.current = { key: employeeKey, source: 'none' };
      }
    } catch {
      setCheckedMap({});
      setMetaMap({});
      restoredRef.current = { key: employeeKey, source: 'none' };
    }
  }, [open, employeeKey, dateStr]);

  useEffect(() => {
    if (!open) return;
    if (!employeeKey) return;
    if (!dayRow || !dayRow.employees) return;
    if (restoredRef.current.key !== employeeKey) return;
    if (restoredRef.current.source !== 'none') return;

    const dbEmployees = dayRow.employees || {};
    const nextChecked = {};
    const nextMeta = {};

    selectedEmployees.forEach((name) => {
      const rec = dbEmployees?.[name];
      if (!rec || typeof rec !== 'object') return;
      const checkedItems = Array.isArray(rec.checked_items) ? rec.checked_items : [];
      const times = rec.times && typeof rec.times === 'object' ? rec.times : {};
      checkedItems.forEach((idx) => {
        const i = Number(idx);
        if (!Number.isFinite(i) || i < 0 || i >= items.length) return;
        nextChecked[i] = true;
        const t = String(times?.[String(i)] || '').trim();
        nextMeta[i] = { by: name, time: t };
      });
    });

    setCheckedMap(nextChecked);
    setMetaMap(nextMeta);
    localStorage.setItem(storageKey(dateStr, employeeKey), JSON.stringify({ checkedMap: nextChecked, metaMap: nextMeta }));
    restoredRef.current = { key: employeeKey, source: 'db' };
  }, [open, employeeKey, dateStr, dayRow, items.length, selectedEmployees]);

  useEffect(() => {
    if (!open) return;
    if (!employeeKey) return;
    const max = items.length;

    setCheckedMap((prev) => {
      const next = {};
      let changed = false;
      Object.keys(prev || {}).forEach((k) => {
        const idx = Number(k);
        if (!Number.isFinite(idx) || idx < 0 || idx >= max) {
          changed = true;
          return;
        }
        if (prev[k]) next[idx] = true;
        else changed = true;
      });
      if (!changed && Object.keys(next).length === Object.keys(prev || {}).length) return prev;
      return next;
    });

    setMetaMap((prev) => {
      const next = {};
      let changed = false;
      Object.keys(prev || {}).forEach((k) => {
        const idx = Number(k);
        if (!Number.isFinite(idx) || idx < 0 || idx >= max) {
          changed = true;
          return;
        }
        const v = prev[k];
        if (!v || typeof v !== 'object') {
          changed = true;
          return;
        }
        const by = String(v.by || '').trim();
        const time = String(v.time || '').trim();
        if (!time) {
          changed = true;
          return;
        }
        next[idx] = { by: by || employeeKey, time };
        if (v.by !== next[idx].by || v.time !== next[idx].time) changed = true;
      });
      if (!changed && Object.keys(next).length === Object.keys(prev || {}).length) return prev;
      return next;
    });
  }, [items.length, open, employeeKey, dateStr]);

  useEffect(() => {
    if (!open) return;
    if (!employeeKey) return;
    const key = storageKey(dateStr, employeeKey);
    localStorage.setItem(key, JSON.stringify({ checkedMap, metaMap }));
  }, [open, employeeKey, dateStr, checkedMap, metaMap]);

  const totalCount = items.length;
  const checkedCount = useMemo(
    () => Object.values(checkedMap).filter(Boolean).length,
    [checkedMap]
  );
  const percent = Math.round((checkedCount / totalCount) * 100);

  const CheckIcon = ({ checked }) => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M7.9 13.4 4.6 10.1a1 1 0 0 0-1.4 1.4l4 4a1 1 0 0 0 1.4 0l8.2-8.2a1 1 0 1 0-1.4-1.4L7.9 13.4Z"
        fill={checked ? '#0b0b12' : 'rgba(255,255,255,0.0)'}
      />
    </svg>
  );

  const toggleItem = (idx) => {
    if (!employeeKey) {
      showToast('Select employee first.');
      return;
    }
    setCheckedMap((prev) => {
      const next = { ...prev, [idx]: !prev[idx] };
      const timeStr = formatHHSS(new Date());
      setMetaMap((t) => {
        const copy = { ...t };
        if (next[idx]) copy[idx] = { by: employeeKey, time: timeStr };
        else delete copy[idx];
        const copy = { ...t };
        if (next[idx]) copy[idx] = { by: employeeKey, time: timeStr };
        else delete copy[idx];
        return copy;
      });
      return next;
    });
  };


  const saveSummary = () => {
    if (!employeeKey) {
      showToast('Select employee first.');
      return;
    }

    const baseEmployees =
      dayRow && dayRow.employees && typeof dayRow.employees === 'object' ? { ...dayRow.employees } : {};

    const groups = {};
    Object.keys(checkedMap || {}).forEach((k) => {
      const idx = Number(k);
      if (!checkedMap[k]) return;
      const by = String(metaMap?.[idx]?.by || '').trim();
      const time = String(metaMap?.[idx]?.time || '').trim();
      const owner = by || selectedEmployees[0] || employeeKey;
      if (!groups[owner]) groups[owner] = { checked_items: [], times: {} };
      groups[owner].checked_items.push(idx);
      if (time) groups[owner].times[String(idx)] = time;
    });

    selectedEmployees.forEach((name) => {
      if (!groups[name]) groups[name] = { checked_items: [], times: {} };
    });

    Object.keys(groups).forEach((name) => {
      const rec = groups[name];
      const unique = Array.from(new Set((rec.checked_items || []).map((n) => Number(n)).filter((n) => Number.isFinite(n))));
      unique.sort((a, b) => a - b);
      baseEmployees[name] = { checked_items: unique, times: rec.times || {} };
    });

    upsertChecklist(
      { checkDate: dateStr, totalCount, employees: baseEmployees },
      {
        onSuccess: () => {
          showToast('Checklist saved.');
          onClose?.();
        },
        onError: (err) => {
          const msg = String(err?.message || '');
          if (msg === 'CHECKLIST_DAILY_TABLE_MISSING') {
            showToast('DB에 checklist_daily 테이블이 없습니다. SQL 실행 후 다시 저장하세요.');
            return;
          }
          if (msg.startsWith('SUPABASE_HTTP_404') || msg.includes('404')) {
            showToast('DB에 checklist_daily 테이블이 없습니다. SQL 실행 후 다시 저장하세요.');
            return;
          }
          showToast(msg || 'Save failed.');
        },
      }
    );
  };

  const [adminOpen, setAdminOpen] = useState(false);
  const [newText, setNewText] = useState('');
  const [editIdx, setEditIdx] = useState(-1);
  const [editText, setEditText] = useState('');

  const normalize = (s) => String(s || '').trim();
  const isDup = (candidate, excludeIdx = -1) => {
    const c = normalize(candidate).toLowerCase();
    if (!c) return false;
    return items.some((t, i) => i !== excludeIdx && normalize(t).toLowerCase() === c);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Daily Checklist"
      size="content"
      hideCloseButton={true}
      fullScreen={isMobile}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button variant="success" size="sm" disabled={isPending || !employeeKey} onClick={saveSummary}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div style={{ width: isMobile ? '100%' : 'min(720px, 90vw)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
            <div>Date: {dateStr}</div>
            <div>Employee: {employeeKey || '-'}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
            <div>Completed: {checkedCount} / {totalCount}</div>
            <div>Progress: {percent}%</div>
          </div>
          <div
            style={{
              height: 8,
              width: '100%',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}
          >
            <div style={{ height: '100%', width: `${percent}%`, background: '#22c55e' }} />
          </div>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <Button variant="outline" size="sm" onClick={() => setAdminOpen((v) => !v)}>
              {adminOpen ? 'Hide Admin' : 'Admin Edit'}
            </Button>
          </div>
        )}

        {isAdmin && adminOpen && (
          <div
            style={{
              border: '1px solid var(--border-soft)',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
              background: 'rgba(255,255,255,0.03)',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ display: 'grid', gap: 8 }}>
              {items.map((t, idx) => (
                <div
                  key={`${idx}-${t}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  {editIdx === idx ? (
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      style={{
                        height: 36,
                        borderRadius: 10,
                        padding: '0 10px',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.18)',
                        color: 'white',
                      }}
                    />
                  ) : (
                    <div style={{ color: 'var(--text-main)', fontSize: 13 }}>{t}</div>
                  )}

                  {editIdx === idx ? (
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => {
                        const next = normalize(editText);
                        if (!next) return;
                        if (isDup(next, idx)) return;
                        const updated = items.slice();
                        updated[idx] = next;
                        setItems(updated);
                        localStorage.setItem('checklist_items_v1', JSON.stringify(updated));
                        setEditIdx(-1);
                        setEditText('');
                      }}
                    >
                      Save
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditIdx(idx);
                        setEditText(t);
                      }}
                    >
                      ✎
                    </Button>
                  )}

                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      const updated = items.filter((_, i) => i !== idx);
                      if (updated.length === 0) return;
                      setItems(updated);
                      localStorage.setItem('checklist_items_v1', JSON.stringify(updated));
                      if (editIdx === idx) {
                        setEditIdx(-1);
                        setEditText('');
                      }
                    }}
                  >
                    🗑
                  </Button>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8 }}>
              <input
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="New checklist item"
                style={{
                  height: 36,
                  borderRadius: 10,
                  padding: '0 10px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: 'white',
                }}
              />
              <Button
                variant="success"
                size="sm"
                onClick={() => {
                  const next = normalize(newText);
                  if (!next) return;
                  if (isDup(next)) return;
                  const updated = [...items, next];
                  setItems(updated);
                  localStorage.setItem('checklist_items_v1', JSON.stringify(updated));
                  setNewText('');
                }}
              >
                + Add
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setItems(DEFAULT_ITEMS);
                  localStorage.removeItem('checklist_items_v1');
                  setEditIdx(-1);
                  setEditText('');
                  setNewText('');
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        )}

        {/* Checklist */}
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((text, idx) => {
            const checked = !!checkedMap[idx];
            const meta = metaMap[idx];
            return (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 1fr auto',
                  alignItems: 'center',
                  columnGap: 12,
                  background: checked ? 'rgba(250,204,21,0.10)' : 'rgba(255,255,255,0.05)',
                  border: checked ? '1px solid rgba(250,204,21,0.30)' : '1px solid var(--border-soft)',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleItem(idx)}
                  aria-checked={checked}
                  role="checkbox"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    border: checked ? '1px solid rgba(250,204,21,0.55)' : '1px solid rgba(255,255,255,0.22)',
                    background: checked ? '#FACC15' : 'rgba(255,255,255,0.08)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    marginBottom: 2,
                    justifySelf: 'start',
                  }}
                >
                  <CheckIcon checked={checked} />
                </button>

                <div
                  style={{
                    color: checked ? 'rgba(255,255,255,0.65)' : 'var(--text-main)',
                    fontSize: 15,
                    lineHeight: 1.35,
                    textAlign: 'left',
                    textDecoration: checked ? 'line-through' : 'none',
                    textDecorationThickness: checked ? '2px' : undefined,
                    textDecorationColor: checked ? 'rgba(255,255,255,0.6)' : undefined,
                  }}
                >
                  {text}
                </div>

                <div
                  style={{
                    minWidth: 160,
                    textAlign: 'right',
                    color: checked ? '#FACC15' : 'transparent',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    paddingLeft: 10,
                  }}
                >
                  {checked ? `${meta?.by || employeeKey} : ${meta?.time || ''}` : '-'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
