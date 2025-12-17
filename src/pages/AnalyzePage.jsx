import { useMemo, useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import DataTable from '../components/common/DataTable';
import { getAnalytics } from '../features/sales/salesApi';
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
          <div className="page-subtitle">매출 요약 및 카테고리/브랜드/사이즈/색상 분석</div>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <label>To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <Button variant="outline" size="sm" className="icon" title="오늘" onClick={setToday}>
            ☀️
          </Button>
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

      <Card title="매출 요약">
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">기간을 선택하고 Analyze를 눌러주세요.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
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
        title="상품별 매출 (베스트/워스트)"
        actions={
          data
            ? [
                <ExportActions
                  key="best"
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
                />,
                <ExportActions
                  key="worst"
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
                />,
              ]
            : null
        }
      >
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">Analyze를 먼저 실행하세요.</div>
        ) : (
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
        title="SKU별 판매수량/매출"
        actions={
          data
            ? [
                <ExportActions
                  key="sku"
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
                />,
              ]
            : null
        }
      >
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">Analyze를 먼저 실행하세요.</div>
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
        title="카테고리/브랜드/성별/사이즈/색상별 매출"
        actions={
          data
            ? [
                <ExportActions
                  key="by-category"
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
                />,
                <ExportActions
                  key="by-gender"
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
                />,
                <ExportActions
                  key="by-size"
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
                />,
                <ExportActions
                  key="by-color"
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
                />,
              ]
            : null
        }
      >
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">Analyze를 먼저 실행하세요.</div>
        ) : (
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
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

      <Card title="주간/월간 매출">
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">Analyze를 먼저 실행하세요.</div>
        ) : (
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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

      <Card title="할인/환불 리포트">
        {!data ? (
          <div className="text-sm text-[var(--text-muted)]">Analyze를 먼저 실행하세요.</div>
        ) : (
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="page-card" style={{ flex: 1 }}>
              <div>할인금액 합계</div>
              <div style={{ fontWeight: 700 }}>
                {Math.round(data.summary.discountAmount).toLocaleString('en-PH')} PHP
              </div>
              <div className="muted">할인 거래 비중</div>
              <div style={{ fontWeight: 700 }}>
                {data.discountShare.totalTransactions
                  ? ((data.discountShare.discountedTransactions / data.discountShare.totalTransactions) * 100).toFixed(1)
                  : '0.0'}
                %
              </div>
            </div>
            <div className="page-card" style={{ flex: 1 }}>
              <div>환불건수</div>
              <div style={{ fontWeight: 700 }}>{data.summary.refundCount}</div>
              <div className="muted">환불액</div>
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
