import { useMemo, useState } from 'react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useToast } from '../context/ToastContext';
import { getSupabaseConfigSummary, sbDelete, sbInsert, sbSelect } from '../db/supabaseRest';
import { useEmployees } from '../features/employees/employeesHooks';
import { getProductInventoryList } from '../features/products/productApi';
import * as csvExport from '../utils/csvExport';

export default function SettingsPage() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const cfg = getSupabaseConfigSummary();
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

  const getWeekMonday = (d) => {
    const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = base.getDay();
    const diff = (dow + 6) % 7;
    base.setDate(base.getDate() - diff);
    return base;
  };

  const addDays = (d, days) => {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  };

  const getWeekParity = (monday) => {
    const epochMonday = new Date(1970, 0, 5);
    const a = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()).getTime();
    const b = epochMonday.getTime();
    const weeks = Math.floor((a - b) / (7 * 24 * 60 * 60 * 1000));
    return Math.abs(weeks) % 2;
  };

  const [scheduleDateStr, setScheduleDateStr] = useState(() => toDateKey(new Date()));
  const [scheduleRows, setScheduleRows] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const scheduleWeek = useMemo(() => {
    const picked = parseDateKey(scheduleDateStr) || new Date();
    const monday = getWeekMonday(picked);
    const sunday = addDays(monday, 6);
    return { monday, sunday };
  }, [scheduleDateStr]);

  const scheduleWeekType = useMemo(() => {
    const parity = getWeekParity(scheduleWeek.monday);
    return parity === 0 ? 'A' : 'B';
  }, [scheduleWeek.monday]);

  const handleExportProducts = async () => {
    const rows = await getProductInventoryList();
    const header = ['code', 'nameKo', 'salePricePhp', 'totalStock'];
    const csvRows = [header].concat(
      rows.map((p) => [p.code, p.nameKo, p.salePricePhp, p.totalStock])
    );
    csvExport.exportToTsv('products.tsv', csvRows);
  };

  const exportToJson = (filename, data) => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportSalesBackup = async () => {
    try {
      setBusy(true);
      const [sales, saleItems, refunds] = await Promise.all([
        sbSelect('sales', { select: '*', order: { column: 'sold_at', ascending: false } }),
        sbSelect('sale_items', { select: '*', order: { column: 'id', ascending: true } }),
        sbSelect('refunds', { select: '*', order: { column: 'time', ascending: false } }),
      ]);
      exportToJson('sales-backup.json', {
        version: 1,
        exportedAt: new Date().toISOString(),
        sales: sales || [],
        saleItems: saleItems || [],
        refunds: refunds || [],
      });
      showToast('Sales backup downloaded.');
    } catch (e) {
      showToast(e?.message || 'Supabase request failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleTestSupabase = async () => {
    try {
      setBusy(true);
      await sbSelect('products', { select: 'code', limit: 1 });
      showToast('Supabase connected.');
    } catch (e) {
      const msg = String(e?.message || '').trim();
      if (msg === 'SUPABASE_CONFIG_MISSING') {
        showToast(
          'Supabase 설정이 없습니다. .env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 넣어주세요.'
        );
      } else {
        showToast(msg || 'Supabase request failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const loadEmployeeSchedulesForWeek = async () => {
    try {
      setScheduleLoading(true);
      const rows = await sbSelect('employee_schedules', {
        select: 'id,employee_id,work_date,shift_type',
        filters: [
          { column: 'work_date', op: 'gte', value: toDateKey(scheduleWeek.monday) },
          { column: 'work_date', op: 'lte', value: toDateKey(scheduleWeek.sunday) },
        ],
        orders: [
          { column: 'work_date', ascending: true },
          { column: 'shift_type', ascending: true },
        ],
        limit: 200,
      });
      setScheduleRows(Array.isArray(rows) ? rows : []);
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
      setScheduleLoading(false);
    }
  };

  const handleAutoGenerateScheduleWeek = async () => {
    const normalizeName = (s) =>
      String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');

    const byName = new Map();
    (employees || []).forEach((e) => {
      const n = normalizeName(e?.english_name);
      if (!n) return;
      if (!byName.has(n)) byName.set(n, e);
    });

    const berlyn = byName.get(normalizeName('Berlyn'));
    const janice = byName.get(normalizeName('Janice'));
    const maeshi = byName.get(normalizeName('Maeshi'));

    if (!berlyn || !janice) {
      const missing = [
        !berlyn ? 'Berlyn' : null,
        !janice ? 'Janice' : null,
      ].filter(Boolean);
      showToast(`employees 테이블에 영어 이름이 없습니다: ${missing.join(', ')}`);
      return;
    }

    const monday = scheduleWeek.monday;
    const sunday = scheduleWeek.sunday;
    const mondayStr = toDateKey(monday);
    const sundayStr = toDateKey(sunday);

    const otherEmp = (emp) => (String(emp?.id) === String(berlyn.id) ? janice : berlyn);
    const prevMonday = addDays(monday, -7);
    const prevMondayStr = toDateKey(prevMonday);
    const prevSundayStr = toDateKey(addDays(prevMonday, 6));

    let morningEmp = null;
    try {
      const prevRows = await sbSelect('employee_schedules', {
        select: 'employee_id,work_date,shift_type',
        filters: [
          { column: 'work_date', op: 'gte', value: prevMondayStr },
          { column: 'work_date', op: 'lte', value: prevSundayStr },
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
        if (isBerlyn) morningEmp = otherEmp(berlyn);
        if (isJanice) morningEmp = otherEmp(janice);
      }
    } catch {
      morningEmp = null;
    }
    if (!morningEmp) {
      morningEmp = scheduleWeekType === 'A' ? berlyn : janice;
    }
    const eveningEmp = otherEmp(morningEmp);
    const rowsToInsert = [];
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(monday, i);
      const dow = d.getDay();
      const dateStr = toDateKey(d);
      if (dow === 3) {
        if (maeshi?.id) {
          rowsToInsert.push({ employee_id: maeshi.id, work_date: dateStr, shift_type: 'all_day' });
        }
        continue;
      }
      if (dow === 4) {
        rowsToInsert.push({ employee_id: morningEmp.id, work_date: dateStr, shift_type: 'morning' });
        if (maeshi?.id) {
          rowsToInsert.push({ employee_id: maeshi.id, work_date: dateStr, shift_type: 'evening' });
        }
        continue;
      }
      rowsToInsert.push({ employee_id: morningEmp.id, work_date: dateStr, shift_type: 'morning' });
      rowsToInsert.push({ employee_id: eveningEmp.id, work_date: dateStr, shift_type: 'evening' });
    }

    try {
      setBusy(true);
      await sbDelete('employee_schedules', {
        filters: [
          { column: 'work_date', op: 'gte', value: mondayStr },
          { column: 'work_date', op: 'lte', value: sundayStr },
        ],
      });
      await sbInsert('employee_schedules', rowsToInsert, { returning: 'minimal' });
      showToast(
        `Auto 생성 완료 (Week): ${mondayStr} ~ ${sundayStr} (Morning: ${String(
          morningEmp?.english_name || ''
        ).trim()})`
      );
      await loadEmployeeSchedulesForWeek();
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
      setBusy(false);
    }
  };

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Exports (Supabase).</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="page-card space-y-3">
          <div className="font-semibold text-sm text-[var(--gold-soft)]">Supabase</div>
          <div className="text-sm text-[var(--text-muted)]">
            Host: {cfg.host || '-'} · Key: {cfg.hasAnonKey ? 'set' : 'missing'} · Type:{' '}
            {cfg.keyType} · Len: {cfg.keyLength}
          </div>
          <Button variant="outline" size="sm" onClick={handleTestSupabase} disabled={busy}>
            Test connection
          </Button>
        </section>

        <section className="page-card space-y-3">
          <div className="font-semibold text-sm text-[var(--gold-soft)]">Export</div>
          <Button variant="outline" size="sm" onClick={handleExportProducts} disabled={busy}>
            Download product list TSV
          </Button>
        </section>

        <section className="page-card space-y-3">
          <div className="font-semibold text-sm text-[var(--gold-soft)]">Sales</div>
          <Button variant="outline" size="sm" onClick={handleExportSalesBackup} disabled={busy}>
            Download sales backup JSON
          </Button>
        </section>

        <section className="page-card space-y-3 md:col-span-2">
          <div className="font-semibold text-sm text-[var(--gold-soft)]">
            Employee Schedules (Auto)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <Input
              label="Week (any date)"
              type="date"
              value={scheduleDateStr}
              onChange={(e) => setScheduleDateStr(e.target.value)}
            />
            <div className="text-sm text-[var(--text-muted)]">
              <div>
                Range: {toDateKey(scheduleWeek.monday)} ~ {toDateKey(scheduleWeek.sunday)}
              </div>
              <div>
                Week {scheduleWeekType} · 월요일 기준으로 주 단위로 Berlyn/Janice가 morning/evening을 유지하며,
                전 주와 반대로 자동 배치됩니다. (Wed: Maeshi all_day · Thu: evening은 Maeshi가 있으면 고정)
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadEmployeeSchedulesForWeek}
                disabled={busy || scheduleLoading}
              >
                Load week
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAutoGenerateScheduleWeek}
                disabled={busy || scheduleLoading}
              >
                Auto generate
              </Button>
            </div>
          </div>

          <div className="text-sm">
            {scheduleLoading ? (
              <div className="text-[var(--text-muted)]">Loading…</div>
            ) : scheduleRows.length === 0 ? (
              <div className="text-[var(--text-muted)]">No rows.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {scheduleRows.map((r) => {
                  const emp = (employees || []).find((e) => e.id === r.employee_id);
                  const name = emp?.english_name || r.employee_id;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-xl border border-[#262637] px-3 py-2"
                      style={{ background: 'rgba(255,255,255,0.04)' }}
                    >
                      <div className="font-semibold">{r.work_date}</div>
                      <div className="text-[var(--text-muted)]">{r.shift_type}</div>
                      <div className="font-semibold">{name}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
