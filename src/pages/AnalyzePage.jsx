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
          <label>From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <label>To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
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
              <div>Net Sales</div>
              <div style={{ fontWeight: 700, color: 'var(--gold-soft)' }}>
                {Math.round(data.summary.netAmount).toLocaleString('en-PH')} PHP
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
              <div>Discount Amount</div>
              <div style={{ fontWeight: 700 }}>
                {Math.round(data.summary.discountAmount).toLocaleString('en-PH')} PHP
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
          </div>
        )}
      </Card>

      <Card
        title="Sales by Product (Best/Worst)"
        actions={
          data
            ? [
                <ExportActions
                  key="best"
                  label="Best"
                  columns={[
                    { key: 'code', header: 'Code' },
                    { key: 'qty', header: 'Qty' },
                    { key: 'revenue', header: 'Revenue (PHP)' },
                  ]}
                  rows={data.best.map((r) => ({
                    code: r.code,
                    qty: r.qty,
                    revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                  }))}
                  filename="best-products.csv"
                  gdriveName="best-products.csv"
                  csvLabel="Best CSV"
                  driveLabel="Best Drive"
                />,
                <ExportActions
                  key="worst"
                  label="Worst"
                  columns={[
                    { key: 'code', header: 'Code' },
                    { key: 'qty', header: 'Qty' },
                    { key: 'revenue', header: 'Revenue (PHP)' },
                  ]}
                  rows={data.worst.map((r) => ({
                    code: r.code,
                    qty: r.qty,
                    revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                  }))}
                  filename="worst-products.csv"
                  gdriveName="worst-products.csv"
                  csvLabel="Worst CSV"
                  driveLabel="Worst Drive"
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
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Best</div>
              <DataTable
                columns={[
                  { key: 'code', header: 'Code' },
                  { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
                  { key: 'revenue', header: 'Revenue (PHP)', className: 'text-right', tdClassName: 'text-right' },
                ]}
                rows={data.best.map((r) => ({
                  ...r,
                  id: r.code,
                  revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                }))}
              />
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Worst</div>
              <DataTable
                columns={[
                  { key: 'code', header: 'Code' },
                  { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
                  { key: 'revenue', header: 'Revenue (PHP)', className: 'text-right', tdClassName: 'text-right' },
                ]}
                rows={data.worst.map((r) => ({
                  ...r,
                  id: r.code,
                  revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                }))}
              />
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Sales Quantity/Revenue by SKU"
        actions={
          data
            ? [
                <ExportActions
                  key="sku"
                  label="SKU"
                  columns={[
                    { key: 'code', header: 'Code' },
                    { key: 'qty', header: 'Qty' },
                    { key: 'revenue', header: 'Revenue (PHP)' },
                  ]}
                  rows={data.sku.map((r) => ({
                    code: r.code,
                    qty: r.qty,
                    revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                  }))}
                  filename="sku-sales.csv"
                  gdriveName="sku-sales.csv"
                  csvLabel="SKU CSV"
                  driveLabel="SKU Drive"
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
              { key: 'code', header: 'Code' },
              { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
              { key: 'revenue', header: 'Revenue (PHP)', className: 'text-right', tdClassName: 'text-right' },
            ]}
            rows={data.sku.map((r) => ({
              ...r,
              id: r.code,
              revenue: Math.round(r.revenue).toLocaleString('en-PH'),
            }))}
          />
        )}
      </Card>

      <Card
        title="Revenue by Category/Brand/Gender/Size/Color"
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
                  key="by-color"
                  label="Color"
                  columns={[
                    { key: 'key', header: 'Color' },
                    { key: 'qty', header: 'Qty' },
                    { key: 'revenue', header: 'Revenue (PHP)' },
                  ]}
                  rows={data.byColor.map((r) => ({
                    key: r.key,
                    qty: r.qty,
                    revenue: Math.round(r.revenue).toLocaleString('en-PH'),
                  }))}
                  filename="sales-by-color.csv"
                  gdriveName="sales-by-color.csv"
                  csvLabel="Color CSV"
                  driveLabel="Color Drive"
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
                { key: 'key', header: 'Color' },
                { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
                { key: 'revenue', header: 'Revenue (PHP)', className: 'text-right', tdClassName: 'text-right' },
              ]}
              rows={data.byColor.map((r) => ({
                id: r.key,
                ...r,
                revenue: Math.round(r.revenue).toLocaleString('en-PH'),
              }))}
            />
          </div>
        )}
      </Card>

      <Card title="Weekly/Monthly Revenue">
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
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Weekly Revenue</div>
              <BarChart
                data={data.weeklyRevenue.map((r) => ({ key: r.key, amount: r.amount }))}
                title="weekly-revenue"
                height={240}
              />
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Monthly Revenue</div>
              <BarChart
                data={data.monthlyRevenue.map((r) => ({ key: r.key, amount: r.amount }))}
                title="monthly-revenue"
                height={240}
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
