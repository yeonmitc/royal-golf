import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { useChecklistDaily, useUpsertChecklistDailyMutation } from '../../features/checklist/checklistHooks';
import { useToast } from '../../context/ToastContext';
import { useAdminStore } from '../../store/adminStore';
import { normalizeAppError } from '../../utils/errorHandler';
import { isBrowserOnline } from '../../features/offline/offlineDB';

const DEFAULT_ITEMS = [
  'Open the door and turn air fresh device and check attendance stamp (Priority)',
  'Sweep the floor and wipe the shelves with a cloth',
  'Check yesterday’s sales in the system, count the products, and update the Google Sheet',
  'Clean the glass at the entrance, shelves, mirrors, and display',
  'Check each item of clothing, steam out wrinkles, trim loose threads, and inspect the inside',
  'Steam and arrange products by color and brand, and restock sold items if needed',
  'Record sales in the system and Google Sheet, issue receipts, and send a screenshot to KakaoTalk',
  'Count the cash and verify it in the system: ₱5,000 total (15 × ₱100 and 7 × ₱500)',
  'Mop the floor using the mop from the toilet area, then turn off all electrical devices',
  'Count all gloves and make sure the displayed quantity is correct',
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

function storageKey(dateStr) {
  return `checklist:${dateStr}:shared`;
}

function toSharedRecord(dayRow, maxItems) {
  const employees = dayRow?.employees;
  if (!employees || typeof employees !== 'object') {
    return { checkedMap: {}, metaMap: {} };
  }

  const shared = employees._shared;
  if (shared && typeof shared === 'object') {
    const checkedMap = {};
    const metaMap = {};
    const checkedItems = Array.isArray(shared.checked_items) ? shared.checked_items : [];
    const times = shared.times && typeof shared.times === 'object' ? shared.times : {};
    checkedItems.forEach((idxRaw) => {
      const idx = Number(idxRaw);
      if (!Number.isFinite(idx) || idx < 0 || idx >= maxItems) return;
      checkedMap[idx] = true;
      const raw = times?.[String(idx)];
      if (raw && typeof raw === 'object') {
        const by = String(raw.by || '').trim();
        const time = String(raw.time || '').trim();
        if (time) metaMap[idx] = { by, time };
      } else {
        const time = String(raw || '').trim();
        if (time) metaMap[idx] = { by: '', time };
      }
    });
    return { checkedMap, metaMap };
  }

  // Backward compatibility: merge old per-employee records into one shared state.
  const checkedMap = {};
  const metaMap = {};
  Object.entries(employees).forEach(([name, rec]) => {
    if (name === '_shared' || !rec || typeof rec !== 'object') return;
    const checkedItems = Array.isArray(rec.checked_items) ? rec.checked_items : [];
    const times = rec.times && typeof rec.times === 'object' ? rec.times : {};
    checkedItems.forEach((idxRaw) => {
      const idx = Number(idxRaw);
      if (!Number.isFinite(idx) || idx < 0 || idx >= maxItems) return;
      checkedMap[idx] = true;
      const raw = times?.[String(idx)];
      if (raw && typeof raw === 'object') {
        const by = String(raw.by || '').trim();
        const time = String(raw.time || '').trim();
        metaMap[idx] = { by: by || name, time };
      } else {
        const time = String(raw || '').trim();
        metaMap[idx] = { by: name, time };
      }
    });
  });
  return { checkedMap, metaMap };
}

export default function ChecklistModal({ open, onClose, employeeNames }) {
  const { mutateAsync: upsertChecklist, isPending } = useUpsertChecklistDailyMutation();
  const { showToast, showToastTyped } = useToast();
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
  const actorName = useMemo(
    () =>
      employeeKey
        .split(',')
        .map((s) => String(s || '').trim())
        .filter(Boolean)[0] || '',
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

  const { data: dayRow, isLoading: isDayRowLoading, isFetching: isDayRowFetching } = useChecklistDaily(
    dateStr,
    { enabled: open, refetchOnMount: 'always' }
  );

  const [items, setItems] = useState(DEFAULT_ITEMS);
  const [checkedMap, setCheckedMap] = useState({}); // {index: true/false}
  const [metaMap, setMetaMap] = useState({}); // {index: { by, time }}
  const restoredRef = useRef({ key: '', source: '' });
  const saveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem('checklist_items_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          Array.isArray(parsed) &&
          parsed.length === DEFAULT_ITEMS.length &&
          parsed.every((x) => typeof x === 'string' && x.trim())
        ) {
          setItems(parsed.map((s) => String(s).trim()).filter(Boolean));
        } else {
          localStorage.removeItem('checklist_items_v1');
          setItems(DEFAULT_ITEMS);
        }
      } else {
        setItems(DEFAULT_ITEMS);
      }
    } catch {
      localStorage.removeItem('checklist_items_v1');
      setItems(DEFAULT_ITEMS);
    }
    const key = storageKey(dateStr);
    if (isBrowserOnline()) {
      setCheckedMap({});
      setMetaMap({});
      restoredRef.current = { key: dateStr, source: 'waiting-db' };
      return;
    }
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
            nextMeta[idx] = { by: actorName, time: v };
            return;
          }
          if (v && typeof v === 'object') {
            const by = String(v.by || '').trim();
            const time = String(v.time || '').trim();
            if (time) nextMeta[idx] = { by: by || actorName, time };
          }
        });
        setMetaMap(nextMeta);
        restoredRef.current = { key: dateStr, source: 'local' };
      } else {
        setCheckedMap({});
        setMetaMap({});
        restoredRef.current = { key: dateStr, source: 'none' };
      }
    } catch {
      setCheckedMap({});
      setMetaMap({});
      restoredRef.current = { key: dateStr, source: 'none' };
    }
  }, [open, actorName, dateStr]);

  useEffect(() => {
    if (!open) return;
    if (restoredRef.current.key !== dateStr) return;
    if (restoredRef.current.source !== 'waiting-db' || isDayRowLoading || isDayRowFetching) return;

    const { checkedMap: nextChecked, metaMap: nextMeta } = toSharedRecord(dayRow, items.length);
    setCheckedMap(nextChecked);
    setMetaMap(nextMeta);
    localStorage.setItem(storageKey(dateStr), JSON.stringify({ checkedMap: nextChecked, metaMap: nextMeta }));
    restoredRef.current = { key: dateStr, source: 'db' };
  }, [open, dateStr, dayRow, isDayRowLoading, isDayRowFetching, items.length]);

  useEffect(() => {
    if (!open) return;
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
        next[idx] = { by: by || actorName, time };
        if (v.by !== next[idx].by || v.time !== next[idx].time) changed = true;
      });
      if (!changed && Object.keys(next).length === Object.keys(prev || {}).length) return prev;
      return next;
    });
  }, [items.length, open, actorName, dateStr]);

  useEffect(() => {
    if (!open) return;
    if (restoredRef.current.key !== dateStr || restoredRef.current.source === 'waiting-db') return;
    const key = storageKey(dateStr);
    localStorage.setItem(key, JSON.stringify({ checkedMap, metaMap }));
  }, [open, dateStr, checkedMap, metaMap]);

  const totalCount = items.length;
  const checkedCount = useMemo(
    () => Object.values(checkedMap).filter(Boolean).length,
    [checkedMap]
  );
  const percent = Math.round((checkedCount / totalCount) * 100);

  const persistChecklistState = (nextCheckedMap, nextMetaMap, { closeOnSuccess = false, notify = false } = {}) => {
    const baseEmployees =
      dayRow && dayRow.employees && typeof dayRow.employees === 'object' ? { ...dayRow.employees } : {};
    const checkedItems = [];
    const times = {};
    Object.keys(nextCheckedMap || {}).forEach((key) => {
      const index = Number(key);
      if (!nextCheckedMap[key] || !Number.isInteger(index) || index < 0 || index >= totalCount) return;
      const by = String(nextMetaMap?.[index]?.by || '').trim();
      const time = String(nextMetaMap?.[index]?.time || '').trim();
      checkedItems.push(index);
      if (by || time) times[String(index)] = { by: by || actorName, time };
    });
    checkedItems.sort((a, b) => a - b);
    baseEmployees._shared = { checked_items: checkedItems, times };

    const save = () => upsertChecklist({ checkDate: dateStr, totalCount, employees: baseEmployees });
    saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(save);
    saveQueueRef.current.then(() => {
      if (notify) showToast('Checklist saved.');
      if (closeOnSuccess) onClose?.();
    }).catch((err) => {
      const msg = String(err?.message || '');
      if (msg === 'CHECKLIST_DAILY_TABLE_MISSING' || msg.startsWith('SUPABASE_HTTP_404') || msg.includes('404')) {
        showToast('DB에 checklist_daily 테이블이 없습니다. SQL 실행 후 다시 저장하세요.');
        return;
      }
      console.error(err);
      showToastTyped(normalizeAppError(err, { code: 'CHECKLIST_SAVE_FAILED', fallbackMessage: 'Checklist save failed.' }));
    });
  };

  const CheckIcon = ({ checked }) => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M7.9 13.4 4.6 10.1a1 1 0 0 0-1.4 1.4l4 4a1 1 0 0 0 1.4 0l8.2-8.2a1 1 0 1 0-1.4-1.4L7.9 13.4Z"
        fill={checked ? '#0b0b12' : 'rgba(255,255,255,0.0)'}
      />
    </svg>
  );

  const toggleItem = (idx) => {
    if (!actorName) {
      showToast('Select employee first.');
      return;
    }
    const timeStr = formatHHSS(new Date());
    const isChecked = Boolean(checkedMap[idx]);
    const currentBy = String(metaMap?.[idx]?.by || '').trim();
    const transferOwner = isChecked && currentBy && currentBy !== actorName;
    const nextChecked = { ...checkedMap, [idx]: !isChecked || transferOwner };
    const nextMeta = { ...metaMap };
    if (nextChecked[idx]) nextMeta[idx] = { by: actorName, time: timeStr };
    else delete nextMeta[idx];
    setCheckedMap(nextChecked);
    setMetaMap(nextMeta);
    persistChecklistState(nextChecked, nextMeta);
  };


  const saveSummary = () => {
    if (!actorName) {
      showToast('Select employee first.');
      return;
    }

    persistChecklistState(checkedMap, metaMap, { closeOnSuccess: true, notify: true });
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
                    <div style={{ color: 'var(--text-main)', fontSize: 13 }}>{idx + 1}. {t}</div>
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
                  gridTemplateColumns: isMobile ? '44px 1fr' : '44px 1fr auto',
                  gridTemplateRows: isMobile ? 'auto auto' : 'auto',
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
                    fontSize: isMobile ? 16 : 15,
                    lineHeight: isMobile ? 1.4 : 1.35,
                    textAlign: 'left',
                    textDecoration: checked ? 'line-through' : 'none',
                    textDecorationThickness: checked ? '2px' : undefined,
                    textDecorationColor: checked ? 'rgba(255,255,255,0.6)' : undefined,
                  }}
                >
                  {idx + 1}. {text}
                </div>

                <div
                  style={{
                    gridColumn: isMobile ? '2 / -1' : 'auto',
                    gridRow: isMobile ? 2 : 'auto',
                    justifySelf: isMobile ? 'start' : 'end',
                    marginTop: isMobile ? 6 : 0,
                    textAlign: isMobile ? 'left' : 'right',
                    color: checked ? '#FACC15' : 'transparent',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    paddingLeft: isMobile ? 0 : 10,
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
