import { useEffect, useMemo, useState } from 'react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import DataTable from '../components/common/DataTable';
import { sbSelect } from '../db/supabaseRest';
import { getExpenseCategories } from '../features/expenses/expensesApi';
import { getSalesHistoryFilteredResult } from '../features/sales/salesApiClient';

const START_YEAR = 2025;
const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

function pad2(v) {
  return String(v).padStart(2, '0');
}

function formatMonthKey(year, month) {
  return `${year}-${pad2(month)}`;
}

function buildYearRange(year) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const to =
    Number(year) === currentYear
      ? `${currentYear}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`
      : `${year}-12-31`;

  return {
    from: `${year}-01-01`,
    to,
  };
}

function buildInList(values) {
  const unique = [...new Set((values || []).map((v) => String(v ?? '').trim()).filter(Boolean))];
  return `(${unique.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')})`;
}

function formatNumber(value) {
  return Math.round(Number(value || 0)).toLocaleString();
}

function formatPhp(value) {
  return `PHP ${formatNumber(value)}`;
}

function classifyExpenseCategory(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'other';
  if (raw.replace(/\s+/g, '') === '의류사입비') return 'inventory_purchase_cost';
  if (raw === '직원 월급') return 'salary_cost';
  if (raw === '가게 운영비') return 'operation_cost';
  if (raw === '물류비') return 'logistics_cost';
  if (raw === '부자재') return 'supplies_cost';
  return 'other';
}

function KpiCard({ label, value, tone = 'gold', formula = '' }) {
  const toneMap = {
    gold: {
      border: 'rgba(212,175,55,0.22)',
      glow: 'rgba(212,175,55,0.18)',
      text: 'var(--gold-soft)',
    },
    blue: {
      border: 'rgba(59,130,246,0.24)',
      glow: 'rgba(59,130,246,0.18)',
      text: '#93c5fd',
    },
    green: {
      border: 'rgba(34,197,94,0.24)',
      glow: 'rgba(34,197,94,0.18)',
      text: '#86efac',
    },
    red: {
      border: 'rgba(239,68,68,0.24)',
      glow: 'rgba(239,68,68,0.18)',
      text: '#fca5a5',
    },
  };
  const style = toneMap[tone] || toneMap.gold;
  return (
    <div
      className="page-card"
      style={{
        borderColor: style.border,
        boxShadow: `0 12px 28px ${style.glow}`,
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 'clamp(1.3rem, 2.6vw, 2rem)',
          fontWeight: 800,
          color: style.text,
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      {formula ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.45,
            wordBreak: 'keep-all',
          }}
        >
          {formula}
        </div>
      ) : null}
    </div>
  );
}

function ComboTrendChart({ data = [] }) {
  const width = 960;
  const height = 320;
  const padding = { top: 24, right: 24, bottom: 48, left: 56 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const salesVals = data.map((d) => Number(d.total_sales || 0) || 0);
  const netVals = data.map((d) => Number(d.net_profit || 0) || 0);
  const finalVals = data.map((d) => Number(d.final_net_profit || 0) || 0);
  const maxVal = Math.max(1, ...salesVals, ...netVals, ...finalVals);
  const minVal = Math.min(0, ...salesVals, ...netVals, ...finalVals);
  const range = Math.max(1, maxVal - minVal);
  const zeroY = padding.top + ((maxVal - 0) / range) * innerH;
  const stepX = data.length > 1 ? innerW / data.length : innerW;
  const barW = Math.min(42, Math.max(16, stepX * 0.48));

  const yPos = (v) => padding.top + ((maxVal - v) / range) * innerH;
  const linePath = (vals) =>
    vals
      .map((v, i) => {
        const x = padding.left + stepX * i + stepX / 2;
        const y = yPos(Number(v || 0));
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 760, display: 'block' }}>
        <rect x="0" y="0" width={width} height={height} rx="18" fill="rgba(255,255,255,0.02)" />
        {[0, 0.25, 0.5, 0.75, 1].map((r) => {
          const y = padding.top + innerH * r;
          const label = Math.round(maxVal - range * r);
          return (
            <g key={r}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.08)" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
                {formatNumber(label)}
              </text>
            </g>
          );
        })}
        <line x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY} stroke="rgba(255,255,255,0.18)" />

        {data.map((row, i) => {
          const x = padding.left + stepX * i + stepX / 2 - barW / 2;
          const value = Number(row.total_sales || 0) || 0;
          const top = yPos(Math.max(0, value));
          const bottom = yPos(Math.min(0, value));
          return (
            <g key={row.month}>
              <rect
                x={x}
                y={Math.min(top, bottom)}
                width={barW}
                height={Math.max(2, Math.abs(bottom - top))}
                rx="10"
                fill="rgba(59,130,246,0.78)"
              />
              <text
                x={padding.left + stepX * i + stepX / 2}
                y={height - 16}
                textAnchor="middle"
                fontSize="12"
                fill="var(--text-muted)"
              >
                {row.month.slice(5)}
              </text>
            </g>
          );
        })}

        <path d={linePath(netVals)} fill="none" stroke="#22c55e" strokeWidth="3" />
        <path
          d={linePath(finalVals)}
          fill="none"
          stroke="#86efac"
          strokeWidth="3"
          strokeDasharray="8 6"
        />

        {data.map((row, i) => {
          const x = padding.left + stepX * i + stepX / 2;
          const netY = yPos(Number(row.net_profit || 0));
          const finalY = yPos(Number(row.final_net_profit || 0));
          return (
            <g key={`${row.month}-dots`}>
              <circle cx={x} cy={netY} r="4" fill="#22c55e" />
              <circle cx={x} cy={finalY} r="4" fill="#86efac" />
            </g>
          );
        })}
      </svg>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, color: 'var(--text-muted)', fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 4, background: 'rgba(59,130,246,0.78)' }} />
          총매출
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 18, height: 0, borderTop: '3px solid #22c55e' }} />
          순수익
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 18, height: 0, borderTop: '3px dashed #86efac' }} />
          최종순수익
        </div>
      </div>
    </div>
  );
}

function CostBreakdownChart({ summary }) {
  const items = [
    { key: 'salary_cost', label: '직원월급', color: '#ef4444' },
    { key: 'operation_cost', label: '운영비', color: '#f97316' },
    { key: 'logistics_cost', label: '물류비', color: '#fb7185' },
    { key: 'supplies_cost', label: '부자재', color: '#f59e0b' },
    { key: 'inventory_purchase_cost', label: '의류사입비', color: 'rgba(239,68,68,0.38)' },
  ];
  const maxVal = Math.max(1, ...items.map((i) => Number(summary?.[i.key] || 0) || 0));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {items.map((item) => {
        const value = Number(summary?.[item.key] || 0) || 0;
        const widthPct = (value / maxVal) * 100;
        return (
          <div key={item.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{item.label}</span>
              <span style={{ color: 'var(--text-muted)' }}>{formatPhp(value)}</span>
            </div>
            <div style={{ height: 14, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(widthPct, value > 0 ? 4 : 0)}%`,
                  height: '100%',
                  background: item.color,
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

async function fetchProductCostMap(codes) {
  const costMap = new Map();
  const uniqueCodes = [...new Set((codes || []).map((v) => String(v || '').trim()).filter(Boolean))];
  const chunkSize = 200;

  for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
    const chunk = uniqueCodes.slice(i, i + chunkSize);
    const inList = buildInList(chunk);
    if (inList === '()') continue;
    const rows = await sbSelect('products', {
      select: 'code,p1price',
      filters: [{ column: 'code', op: 'in', value: inList }],
    });
    (rows || []).forEach((row) => {
      const code = String(row?.code || '').trim();
      if (code) costMap.set(code, Number(row?.p1price || 0) || 0);
    });
  }

  return costMap;
}

async function fetchExpensesRaw(range) {
  return (
    (await sbSelect('expenses', {
      select: 'id,category_id,title,amount_php,amount_krw,amount_cny,expense_date',
      filters: [
        { column: 'expense_date', op: 'gte', value: range.from },
        { column: 'expense_date', op: 'lte', value: range.to },
      ],
      order: { column: 'expense_date', ascending: false },
      limit: 5000,
    })) || []
  );
}

async function buildMonthlyReport(year) {
  const range = buildYearRange(year);
  const [salesHistoryResult, expensesRaw, expenseCategories] = await Promise.all([
    getSalesHistoryFilteredResult({ fromDate: range.from, toDate: range.to, query: '' }),
    fetchExpensesRaw(range),
    getExpenseCategories(),
  ]);
  const expenseCategoryMap = new Map(
    (expenseCategories || []).map((row) => [String(row?.id || '').trim(), String(row?.name || '').trim()])
  );

  const salesRows = Array.isArray(salesHistoryResult?.rows) ? salesHistoryResult.rows : [];
  const productCostMap = await fetchProductCostMap(salesRows.map((row) => row?.code));

  const monthMap = new Map();
  for (let month = 1; month <= 12; month += 1) {
    const monthKey = formatMonthKey(year, month);
    monthMap.set(monthKey, {
      month: monthKey,
      total_sales: 0,
      product_cost: 0,
      gift_cost: 0,
      guide_commission: 0,
      sales_profit: 0,
      salary_cost: 0,
      operation_cost: 0,
      logistics_cost: 0,
      supplies_cost: 0,
      operating_cost_total: 0,
      inventory_purchase_cost: 0,
      total_expense_php: 0,
      expense_category_php: '',
      net_profit: 0,
      final_net_profit: 0,
    });
  }

  for (const row of salesRows) {
    const soldKey = String(row?.soldAt || '').slice(0, 7);
    if (!monthMap.has(soldKey)) continue;
    if (row?.isElla) continue;

    const bucket = monthMap.get(soldKey);
    const qty = Number(row?.qty || 0) || 0;
    const salesAmount = Number(row?.lineTotalPhp || 0) || 0;
    const unitCost = Number(productCostMap.get(String(row?.code || '').trim()) || 0) || 0;
    const isGift = Boolean(row?.freeGift);

    bucket.total_sales += isGift ? 0 : salesAmount;
    if (isGift) bucket.gift_cost += unitCost * qty;
    else bucket.product_cost += unitCost * qty;

    bucket.guide_commission += Number(row?.commission || 0) || 0;
  }

  for (const expense of expensesRaw || []) {
    const monthKey = String(expense?.expense_date || '').slice(0, 7);
    if (!monthMap.has(monthKey)) continue;
    const bucket = monthMap.get(monthKey);
    const categoryName = String(
      expenseCategoryMap.get(String(expense?.category_id || '').trim()) || ''
    ).trim();
    const kind = classifyExpenseCategory(categoryName);
    const expensePhp =
      (Number(expense?.amount_php || 0) || 0) + (Number(expense?.amount_krw || 0) || 0) / 25;

    bucket.total_expense_php += expensePhp;
    bucket.expense_category_php = bucket.expense_category_php
      ? `${bucket.expense_category_php} | ${categoryName || 'Uncategorized'}: ${formatNumber(expensePhp)}`
      : `${categoryName || 'Uncategorized'}: ${formatNumber(expensePhp)}`;

    if (kind === 'salary_cost') bucket.salary_cost += expensePhp;
    else if (kind === 'operation_cost') bucket.operation_cost += expensePhp;
    else if (kind === 'logistics_cost') bucket.logistics_cost += expensePhp;
    else if (kind === 'supplies_cost') bucket.supplies_cost += expensePhp;
    else if (kind === 'inventory_purchase_cost') bucket.inventory_purchase_cost += expensePhp;
  }

  return [...monthMap.values()].map((bucket) => {
    const sales_profit =
      bucket.total_sales - bucket.product_cost - bucket.gift_cost - bucket.guide_commission;
    const operating_cost_total =
      bucket.salary_cost + bucket.operation_cost + bucket.logistics_cost + bucket.supplies_cost;
    const net_profit = sales_profit - operating_cost_total;
    const final_net_profit = net_profit - bucket.inventory_purchase_cost;

    return {
      ...bucket,
      sales_profit,
      operating_cost_total,
      net_profit,
      final_net_profit,
    };
  });
}

export default function ReportPage() {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const result = await buildMonthlyReport(selectedYear);
        if (!cancelled) setRows(result);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setRows([]);
          setError(String(err?.message || err || 'Failed to load report.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedYear]);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const out = [];
    for (let y = current; y >= START_YEAR; y -= 1) out.push(y);
    return out;
  }, []);

  const selectedSummary = useMemo(() => {
    return rows.find((row) => row.month === formatMonthKey(selectedYear, selectedMonth)) || null;
  }, [rows, selectedMonth, selectedYear]);

  const tableRows = useMemo(
    () =>
      rows.map((row) => ({
        month: row.month,
        total_sales: formatPhp(row.total_sales),
        product_cost: formatPhp(row.product_cost),
        gift_cost: formatPhp(row.gift_cost),
        guide_commission: formatPhp(row.guide_commission),
        sales_profit: formatPhp(row.sales_profit),
        operating_cost_total: formatPhp(row.operating_cost_total),
        net_profit: formatPhp(row.net_profit),
        final_net_profit: formatPhp(row.final_net_profit),
      })),
    [rows]
  );

  const columns = [
    { key: 'month', header: '월' },
    { key: 'total_sales', header: '총매출' },
    { key: 'product_cost', header: '상품원가' },
    { key: 'gift_cost', header: '선물원가' },
    { key: 'guide_commission', header: '가이드 커미션' },
    { key: 'sales_profit', header: '매출이익' },
    { key: 'operating_cost_total', header: '지출(월별 통합)' },
    { key: 'net_profit', header: '순수익' },
    { key: 'final_net_profit', header: '최종순수익' },
  ];

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <div className="page-title">Report</div>
          <div className="page-subtitle">Monthly owner dashboard for sales, cost, and real remaining profit</div>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="input-field"
            style={{ minWidth: 120 }}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => setSelectedYear(new Date().getFullYear())}>
            This Year
          </Button>
        </div>
      </div>

      <Card title="Month Selector" subtitle="Select a month to update KPI cards and cost breakdown">
        {loading ? (
          <div
            style={{
              position: 'relative',
              height: 6,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: '34%',
                borderRadius: 999,
                background: 'linear-gradient(90deg, rgba(212,175,55,0.25), rgba(212,175,55,0.9), rgba(212,175,55,0.25))',
                animation: 'report-loading-bar 1.2s ease-in-out infinite',
              }}
            />
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {MONTH_LABELS.map((label, idx) => {
            const month = idx + 1;
            const active = month === selectedMonth;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setSelectedMonth(month)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: active ? '1px solid rgba(212,175,55,0.6)' : '1px solid var(--border-soft)',
                  background: active ? 'rgba(212,175,55,0.14)' : 'transparent',
                  color: active ? 'var(--gold-soft)' : 'var(--text-main)',
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Card>

      {error ? (
        <div className="page-card" style={{ borderColor: 'rgba(239,68,68,0.45)', color: '#fca5a5' }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="page-card">Loading monthly report...</div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 14,
            }}
          >
            <KpiCard
              label="총매출"
              value={formatPhp(selectedSummary?.total_sales || 0)}
              tone="blue"
              formula="총매출 = 일반 판매금액 합계 (환불 제외, 선물 제외)"
            />
            <KpiCard
              label="매출이익"
              value={formatPhp(selectedSummary?.sales_profit || 0)}
              tone="gold"
              formula="매출이익 = 총매출 - 원가 - 선물원가 - 가이드커미션"
            />
            <KpiCard
              label="운영비 합계"
              value={formatPhp(selectedSummary?.operating_cost_total || 0)}
              tone="red"
              formula="운영비 합계 = 직원 월급 + 가게 운영비 + 물류비 + 부자재"
            />
            <KpiCard
              label="순수익"
              value={formatPhp(selectedSummary?.net_profit || 0)}
              tone="green"
              formula="순수익 = 매출이익 - 운영비 합계"
            />
            <KpiCard
              label="최종순수익"
              value={formatPhp(selectedSummary?.final_net_profit || 0)}
              tone="green"
              formula="최종순수익 = 순수익 - 의류 사입비"
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            <Card
              title="Monthly Trend"
              subtitle={`${selectedYear} total sales, net profit, and final net profit trend`}
            >
              <ComboTrendChart data={rows} />
            </Card>

            <Card
              title="Cost Breakdown"
              subtitle={`${formatMonthKey(selectedYear, selectedMonth)} operating vs inventory purchase cost`}
            >
              <CostBreakdownChart summary={selectedSummary || {}} />
            </Card>
          </div>

          <Card
            title="월별 상세"
            subtitle="월별 매출과 지출(통합), 순수익을 한 번에 확인"
            actions={
              <Button variant="outline" size="sm" onClick={() => setSelectedMonth(new Date().getMonth() + 1)}>
                This Month
              </Button>
            }
          >
            <DataTable columns={columns} rows={tableRows} emptyMessage="No monthly report data." />
          </Card>
        </>
      )}
    </div>
  );
}
