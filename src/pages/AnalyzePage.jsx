import { useMemo, useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import DataTable from '../components/common/DataTable';
import { getAnalytics } from '../features/sales/salesApiClient';
import ExportActions from '../components/common/ExportActions';
import BarChart from '../components/common/BarChart';

function toInputDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function AnalyzePage() {
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(toInputDate(today));
  const [toDate, setToDate] = useState(toInputDate(today));
  const [data, setData] = useState(null);
  const [pending, setPending] = useState(false);

  async function load() {
    setPending(true);
    try {
      const res = await getAnalytics({ fromDate, toDate });
      setData(res);
    } finally {
      setPending(false);
    }
  }

  function setToday() {
    const t = toInputDate(new Date());
    setFromDate(t);
    setToDate(t);
  }
  function setWeek() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    setFromDate(toInputDate(start));
    setToDate(toInputDate(end));
  }
  function setMonth() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    setFromDate(toInputDate(start));
    setToDate(toInputDate(end));
  }

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <div className="page-title">Analyze</div>
          <div className="page-subtitle">Sales summary and analysis by category/brand/size/color</div>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="date-control">
            <span className="date-control-label">From</span>
            <div className="date-control-box">
              <input
                type="date"
                className="input-field date-control-input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
          </div>
          <div className="date-control">
            <span className="date-control-label">To</span>
            <div className="date-control-box">
              <input
                type="date"
                className="input-field date-control-input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>
          <Button variant="outline" size="sm" className="icon" title="Today" onClick={setToday} icon="today" />
          <Button variant="outline" size="sm" onClick={setWeek}>
            7D
          </Button>
          <Button variant="outline" size="sm" onClick={setMonth}>
            30D
          </Button>
          <Button variant="primary" size="sm" onClick={load} disabled={pending}>
            {pending ? 'Loading…' : 'Analyze'}
          </Button>
        </div>
      </div>

      <Card title="Sales Summary">
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">Please select a period and click Analyze.</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <div className="page-card">
              <div>Total Sales</div>
              <div style={{ fontWeight: 700, color: 'var(--gold-soft)' }}>
                {Math.round(data.summary.grossAmount).toLocaleString('en-PH')} PHP
              </div>
            </div>
            <div className="page-card">
              <div>Cost</div>
              <div style={{ fontWeight: 700 }}>
                {Math.round(data.summary.costAmount || 0).toLocaleString('en-PH')} PHP
              </div>
            </div>
            <div className="page-card">
              <div>Gross Profit</div>
              <div style={{ fontWeight: 700, color: 'var(--gold-soft)' }}>
                {Math.round(data.summary.grossProfit || 0).toLocaleString('en-PH')} PHP
              </div>
            </div>
            <div className="page-card">
              <div>Rent (10%)</div>
              <div style={{ fontWeight: 700 }}>
                {Math.round(data.summary.rentAmount || 0).toLocaleString('en-PH')} PHP
              </div>
            </div>
            <div className="page-card">
              <div>My Profit (90%)</div>
              <div style={{ fontWeight: 700, color: 'var(--gold-soft)' }}>
                {Math.round(data.summary.ownerProfit || 0).toLocaleString('en-PH')} PHP
              </div>
            </div>
            <div className="page-card">
              <div>Transactions</div>
              <div style={{ fontWeight: 700 }}>{data.summary.transactionCount}</div>
            </div>
            <div className="page-card">
              <div>AOV</div>
              <div style={{ fontWeight: 700 }}>
                {Math.round(data.summary.aov).toLocaleString('en-PH')} PHP
              </div>
            </div>
            <div className="page-card">
              <div>Mr. Moon Discount</div>
              <div style={{ fontWeight: 700 }}>
                {Math.round(data.summary.discountAmount).toLocaleString('en-PH')} PHP
              </div>
            </div>
            <div className="page-card">
              <div>Mr. Moon Sales</div>
              <div style={{ fontWeight: 700 }}>
                {Math.round(data.summary.mrMoonRevenue || 0).toLocaleString('en-PH')} PHP
              </div>
            </div>
            <div className="page-card">
              <div>Rent (5%)</div>
              <div style={{ fontWeight: 700 }}>
                {Math.round(data.summary.mrMoonRent || 0).toLocaleString('en-PH')} PHP
              </div>
            </div>
            <div className="page-card">
              <div>Discount Rate</div>
              <div style={{ fontWeight: 700 }}>
                {(data.summary.discountRate * 100).toFixed(1)}%
              </div>
            </div>
            <div className="page-card">
              <div>Refund Count</div>
              <div style={{ fontWeight: 700 }}>{data.summary.refundCount}</div>
            </div>
            <div className="page-card">
              <div>Refund Amount</div>
              <div style={{ fontWeight: 700 }}>
                {Math.round(data.summary.refundAmount).toLocaleString('en-PH')} PHP
              </div>
            </div>
            <div className="page-card">
              <div>Total Commission</div>
              <div style={{ fontWeight: 700 }}>
                {Math.round(data.summary.totalCommission || 0).toLocaleString('en-PH')} PHP
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Color × Type (Qty)"
        actions={
          data
            ? [
                <ExportActions
                  key="color-type-pivot"
                  label="Color×Type (Qty)"
                  columns={[
                    { key: 'color', header: 'Color' },
                    ...(data.colorTypePivotColumns || []).map((t) => ({
                      key: t,
                      header: t,
                    })),
                  ]}
                  rows={(data.colorTypePivotRows || []).map((r) => ({
                    ...r,
                  }))}
                  filename="color-type-pivot.csv"
                  gdriveName="color-type-pivot.csv"
                  csvLabel="ColorTypePivot CSV"
                  driveLabel="ColorTypePivot Drive"
                />,
              ]
            : null
        }
      >
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">Please run Analyze first.</div>
        ) : (
          (() => {
            const pivotCols = (data.colorTypePivotColumns || []).filter((t) => {
              const allow = new Set(['top','bottom','bag','hat','golfbag','pouch','belt'].map((s) => s.toLowerCase()));
              return allow.has(String(t || '').toLowerCase());
            });
            const pivotRows = data.colorTypePivotRows || [];
            const topByCol = {};
            for (const c of pivotCols) {
              const sorted = pivotRows
                .map((r) => ({ color: r.color, qty: Number(r[c] || 0) || 0 }))
                .sort((a, b) => b.qty - a.qty)
                .slice(0, 3)
                .filter((x) => x.qty > 0);
              topByCol[c] = new Set(sorted.map((x) => x.color));
            }
            const columns = [
              { key: 'color', header: 'Color' },
              ...pivotCols.map((t) => ({
                key: t,
                header: t,
                className: 'text-right',
                tdClassName: 'text-right',
              })),
            ];
            const rows = pivotRows.map((r) => {
              const base = { id: r.color, color: r.color };
              for (const c of pivotCols) {
                const val = r[c] ?? 0;
                base[c] = topByCol[c]?.has(r.color) ? (
                  <div
                    style={{
                      background: 'rgba(212,175,55,0.5)',
                      borderRadius: 4,
                      padding: '0 6px',
                      display: 'inline-block',
                      minWidth: 24,
                      textAlign: 'right',
                    }}
                  >
                    {val}
                  </div>
                ) : (
                  val
                );
              }
              return base;
            });
            return <DataTable columns={columns} rows={rows} />;
          })()
        )}
      </Card>

      <Card
        title="Sales by Guide"
        actions={
          data && data.byGuide.length > 0 ? [
            <ExportActions
              key="by-guide"
              label="Guide"
              columns={[
                { key: 'label', header: 'Guide' },
                { key: 'qty', header: 'Qty' },
                { key: 'revenue', header: 'Revenue (PHP)' },
                { key: 'commission', header: 'Commission (PHP)' },
              ]}
              rows={data.byGuide.map((r) => ({
                label: r.label,
                qty: r.qty,
                revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                commission: Math.round(r.commission).toLocaleString('en-PH'),
              }))}
              filename="sales-by-guide.csv"
              gdriveName="sales-by-guide.csv"
              csvLabel="Guide CSV"
              driveLabel="Guide Drive"
            />
          ] : null
        }
      >
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">Please run Analyze first.</div>
        ) : (
          <DataTable
            columns={[
              { key: 'label', header: 'Guide' },
              { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
              { key: 'revenue', header: 'Revenue (PHP)', className: 'text-right', tdClassName: 'text-right' },
              { key: 'commission', header: 'Commission (PHP)', className: 'text-right', tdClassName: 'text-right' },
            ]}
            rows={data.byGuide.map((r) => ({
              id: r.key,
              ...r,
              revenue: Math.round(r.revenue).toLocaleString('en-PH'),
              commission: Math.round(r.commission).toLocaleString('en-PH'),
            }))}
          />
        )}
      </Card>

      <Card
        title="Best by Category"
        actions={
          data
            ? [
                <ExportActions
                  key="best-by-category"
                  label="Best by Category"
                  columns={[
                    { key: 'category', header: 'Category' },
                    { key: 'code', header: 'Code' },
                    { key: 'qty', header: 'Qty' },
                    { key: 'revenue', header: 'Revenue (PHP)' },
                  ]}
                  rows={(data.bestByCategory || []).map((r) => ({
                    category: r.category,
                    code: r.code,
                    qty: r.qty,
                    revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                  }))}
                  filename="best-by-category.csv"
                  gdriveName="best-by-category.csv"
                  csvLabel="BestByCategory CSV"
                  driveLabel="BestByCategory Drive"
                />,
              ]
            : null
        }
      >
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">Please run Analyze first.</div>
        ) : (
          <DataTable
            columns={[
              { key: 'category', header: 'Category' },
              { key: 'code', header: 'Code' },
              { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
              { key: 'revenue', header: 'Revenue (PHP)', className: 'text-right', tdClassName: 'text-right' },
            ]}
            rows={(data.bestByCategory || []).map((r) => ({
              id: r.code,
              ...r,
              revenue: Math.round(r.revenue).toLocaleString('en-PH'),
            }))}
          />
        )}
      </Card>

      {/* Removed: Best Color by Category */}

      <Card
        title="Revenue by Category/Brand/Gender/Size/Type"
        actions={
          data
            ? [
                <ExportActions
                  key="by-category"
                  label="Category"
                  columns={[
                    { key: 'key', header: 'Category' },
                    { key: 'qty', header: 'Qty' },
                    { key: 'revenue', header: 'Revenue (PHP)' },
                  ]}
                  rows={data.byCategory.map((r) => ({
                    key: r.key,
                    qty: r.qty,
                    revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                  }))}
                  filename="sales-by-category.csv"
                  gdriveName="sales-by-category.csv"
                  csvLabel="Category CSV"
                  driveLabel="Category Drive"
                />,
                <ExportActions
                  key="by-brand"
                  label="Brand"
                  columns={[
                    { key: 'key', header: 'Brand' },
                    { key: 'qty', header: 'Qty' },
                    { key: 'revenue', header: 'Revenue (PHP)' },
                  ]}
                  rows={data.byBrand.map((r) => ({
                    key: r.key,
                    qty: r.qty,
                    revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                  }))}
                  filename="sales-by-brand.csv"
                  gdriveName="sales-by-brand.csv"
                  csvLabel="Brand CSV"
                  driveLabel="Brand Drive"
                />,
                <ExportActions
                  key="by-gender"
                  label="Gender"
                  columns={[
                    { key: 'key', header: 'Gender' },
                    { key: 'qty', header: 'Qty' },
                    { key: 'revenue', header: 'Revenue (PHP)' },
                  ]}
                  rows={data.byGender.map((r) => ({
                    key: r.key,
                    qty: r.qty,
                    revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                  }))}
                  filename="sales-by-gender.csv"
                  gdriveName="sales-by-gender.csv"
                  csvLabel="Gender CSV"
                  driveLabel="Gender Drive"
                />,
                <ExportActions
                  key="by-size"
                  label="Size"
                  columns={[
                    { key: 'key', header: 'Size' },
                    { key: 'qty', header: 'Qty' },
                    { key: 'revenue', header: 'Revenue (PHP)' },
                  ]}
                  rows={data.bySize.map((r) => ({
                    key: r.key,
                    qty: r.qty,
                    revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                  }))}
                  filename="sales-by-size.csv"
                  gdriveName="sales-by-size.csv"
                  csvLabel="Size CSV"
                  driveLabel="Size Drive"
                />,
                <ExportActions
                  key="by-type"
                  label="Type"
                  columns={[
                    { key: 'key', header: 'Type' },
                    { key: 'qty', header: 'Qty' },
                    { key: 'revenue', header: 'Revenue (PHP)' },
                  ]}
                  rows={(data.byType || []).map((r) => ({
                    key: r.key,
                    qty: r.qty,
                    revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                  }))}
                  filename="sales-by-type.csv"
                  gdriveName="sales-by-type.csv"
                  csvLabel="Type CSV"
                  driveLabel="Type Drive"
                />,
              ]
            : null
        }
      >
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">Please run Analyze first.</div>
        ) : (
          <div
            className="grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 12,
            }}
          >
            <DataTable
              columns={[
                { key: 'key', header: 'Category' },
                { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
                { key: 'revenue', header: 'Revenue (PHP)', className: 'text-right', tdClassName: 'text-right' },
              ]}
              rows={data.byCategory.map((r) => ({
                id: r.key,
                ...r,
                revenue: Math.round(r.revenue).toLocaleString('en-PH'),
              }))}
            />
            <DataTable
              columns={[
                { key: 'key', header: 'Brand' },
                { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
                { key: 'revenue', header: 'Revenue (PHP)', className: 'text-right', tdClassName: 'text-right' },
              ]}
              rows={data.byBrand.map((r) => ({
                id: r.key,
                ...r,
                revenue: Math.round(r.revenue).toLocaleString('en-PH'),
              }))}
            />
            <DataTable
              columns={[
                { key: 'key', header: 'Gender' },
                { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
                { key: 'revenue', header: 'Revenue (PHP)', className: 'text-right', tdClassName: 'text-right' },
              ]}
              rows={data.byGender.map((r) => ({
                id: r.key,
                ...r,
                revenue: Math.round(r.revenue).toLocaleString('en-PH'),
              }))}
            />
            <DataTable
              columns={[
                { key: 'key', header: 'Size' },
                { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
                { key: 'revenue', header: 'Revenue (PHP)', className: 'text-right', tdClassName: 'text-right' },
              ]}
              rows={data.bySize.map((r) => ({
                id: r.key,
                ...r,
                revenue: Math.round(r.revenue).toLocaleString('en-PH'),
              }))}
            />
            <DataTable
              columns={[
                { key: 'key', header: 'Type' },
                { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
                { key: 'revenue', header: 'Revenue (PHP)', className: 'text-right', tdClassName: 'text-right' },
              ]}
              rows={(data.byType || []).map((r) => ({
                id: r.key,
                ...r,
                revenue: Math.round(r.revenue).toLocaleString('en-PH'),
              }))}
            />
          </div>
        )}
      </Card>

      <Card
        title="Sales by Weekday and Hour"
        actions={
          data
            ? [
                <ExportActions
                  key="by-weekday-qty"
                  label="Weekday Qty"
                  columns={[
                    { key: 'key', header: 'Weekday' },
                    { key: 'qty', header: 'Qty' },
                  ]}
                  rows={(data.byWeekdayQty || []).map((r, idx) => ({
                    id: `wd-${idx}`,
                    ...r,
                  }))}
                  filename="sales-by-weekday-qty.csv"
                  gdriveName="sales-by-weekday-qty.csv"
                  csvLabel="WeekdayQty CSV"
                  driveLabel="WeekdayQty Drive"
                />,
                <ExportActions
                  key="by-hour-qty"
                  label="Hour Qty"
                  columns={[
                    { key: 'hour', header: 'Hour' },
                    { key: 'qty', header: 'Qty' },
                  ]}
                  rows={(data.byHourQty || []).map((r) => ({
                    id: `hr-${r.hour}`,
                    ...r,
                  }))}
                  filename="sales-by-hour-qty.csv"
                  gdriveName="sales-by-hour-qty.csv"
                  csvLabel="HourQty CSV"
                  driveLabel="HourQty Drive"
                />,
              ]
            : null
        }
      >
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">Please run Analyze first.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div className="page-card">
              <div>Best Weekday</div>
              <div style={{ fontWeight: 700, color: 'var(--gold-soft)' }}>
                {(data.bestWeekday?.key || '')} / {Number(data.bestWeekday?.qty || 0)}
              </div>
            </div>
            <div className="page-card">
              <div>Best Hour (6–17)</div>
              <div style={{ fontWeight: 700, color: 'var(--gold-soft)' }}>
                {(() => {
                  const h = Number(data.bestHour?.hour || 0);
                  const hh = h % 12 || 12;
                  const suf = h >= 12 ? 'PM' : 'AM';
                  return `${hh}${suf}`;
                })()} / {Number(data.bestHour?.qty || 0)}
              </div>
            </div>
            <div className="page-card" style={{ gridColumn: '1 / -1' }}>
              <div className="font-semibold text-sm text-[var(--gold-soft)]">Weekday (Qty)</div>
              <DataTable
                columns={[
                  { key: 'key', header: 'Weekday' },
                  { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
                ]}
                rows={(data.byWeekdayQty || []).map((r, idx) => ({
                  id: `wd-${idx}`,
                  ...r,
                }))}
              />
            </div>
            <div className="page-card" style={{ gridColumn: '1 / -1' }}>
              <div className="font-semibold text-sm text-[var(--gold-soft)]">Hour 6–17 (Qty)</div>
              <DataTable
                columns={[
                  { key: 'hourLabel', header: 'Hour' },
                  { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
                ]}
                rows={(data.byHourQty || []).map((r) => ({
                  id: `hr-${r.hour}`,
                  hourLabel: (() => {
                    const h = Number(r.hour || 0);
                    const hh = h % 12 || 12;
                    const suf = h >= 12 ? 'PM' : 'AM';
                    return `${hh}${suf}`;
                  })(),
                  ...r,
                }))}
              />
            </div>
          </div>
        )}
      </Card>

      <Card title="Refund Report">
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">Please run Analyze first.</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <div className="page-card" style={{ flex: 1 }}>
              <div>Refund Count</div>
              <div style={{ fontWeight: 700 }}>{data.summary.refundCount}</div>
              <div className="muted">Refund Amount</div>
              <div style={{ fontWeight: 700 }}>
                {Math.round(data.summary.refundAmount).toLocaleString('en-PH')} PHP
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
