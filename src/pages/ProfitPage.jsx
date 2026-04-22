import { useCallback, useEffect, useState } from 'react';
import Button from '../components/common/Button';
import DataTable from '../components/common/DataTable';
import { sbSelect } from '../db/supabaseRest';
import { getExpenseCategories, getExpensesLite } from '../features/expenses/expensesApi';
import { getSalesSummaryRows } from '../features/sales/salesApiClient';

// Helper for date formatting without date-fns
function formatDate(dateStr, fmt = 'yyyy-MM-dd') {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';

  const yyyy = d.getFullYear();
  const yy = String(yyyy).slice(2);
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  if (fmt === 'yy-MM-dd') return `${yy}-${MM}-${dd}`;
  return `${yyyy}-${MM}-${dd}`;
}

function buildInList(values) {
  const unique = [...new Set((values || []).map((v) => String(v ?? '').trim()).filter(Boolean))];
  return `(${unique.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')})`;
}

function getDateKeysBetween(start, end) {
  const out = [];
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return out;
  const cur = new Date(s);
  while (cur <= e) {
    out.push(formatDate(cur, 'yyyy-MM-dd'));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function toExpensePhp(expense) {
  const amountPhp = Number(expense?.amount_php || 0) || 0;
  const amountKrw = Number(expense?.amount_krw || 0) || 0;
  return amountPhp + amountKrw / 25;
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}

async function fetchGiftCostByCode(codes, onProgress) {
  const out = new Map();
  const uniqueCodes = [
    ...new Set((codes || []).map((v) => String(v || '').trim()).filter(Boolean)),
  ];
  const chunkSize = 200;
  const totalChunks = Math.max(1, Math.ceil(uniqueCodes.length / chunkSize));

  for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
    const chunk = uniqueCodes.slice(i, i + chunkSize);
    const inList = buildInList(chunk);
    if (inList === '()') continue;
    const rows = await sbSelect('products', {
      select: 'code,kprice,p1price',
      filters: [{ column: 'code', op: 'in', value: inList }],
    });
    (rows || []).forEach((row) => {
      const code = String(row?.code || '').trim();
      const p1price = Number(row?.p1price || 0) || 0;
      const kprice = Number(row?.kprice || 0) || 0;
      const unitPhp = p1price > 0 ? p1price : kprice > 0 ? kprice / 25 : 0;
      if (code) out.set(code, unitPhp);
    });
    if (typeof onProgress === 'function') {
      onProgress({
        currentChunk: Math.floor(i / chunkSize) + 1,
        totalChunks,
      });
    }
  }

  if (uniqueCodes.length === 0 && typeof onProgress === 'function') {
    onProgress({ currentChunk: 1, totalChunks: 1 });
  }

  return out;
}

export default function ProfitPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPercent, setLoadingPercent] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('손익 데이터 준비 중...');
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('2025-12-16');
  const [endDate, setEndDate] = useState(formatDate(new Date(), 'yyyy-MM-dd'));

  const fetchData = useCallback(async () => {
    const reportProgress = (percent, message) => {
      setLoadingPercent(clampProgress(percent));
      if (message) setLoadingMessage(message);
    };

    setLoading(true);
    reportProgress(0, '손익 데이터 준비 중...');
    setError(null);
    try {
      const from = startDate || '2025-12-16';
      const to = endDate || formatDate(new Date(), 'yyyy-MM-dd');

      let fetchDone = 0;
      const updateFetchProgress = (label) => {
        fetchDone += 1;
        reportProgress(10 + (fetchDone / 3) * 30, label);
      };

      const [salesRows, expenses, expenseCategories] = await Promise.all([
        getSalesSummaryRows({
          fromDate: from,
          toDate: to,
        }).then((result) => {
          updateFetchProgress('판매 데이터 불러오는 중...');
          return result;
        }),
        getExpensesLite({ from, to }).then((result) => {
          updateFetchProgress('지출 데이터 불러오는 중...');
          return result;
        }),
        getExpenseCategories().then((result) => {
          updateFetchProgress('지출 카테고리 불러오는 중...');
          return result;
        }),
      ]);

      const giftCodes = salesRows
        .filter((row) => Boolean(row?.freeGift) && !row?.isRefunded)
        .map((row) => row?.code);
      reportProgress(45, '선물 원가 계산 준비 중...');
      const giftCostByCode = await fetchGiftCostByCode(
        giftCodes,
        ({ currentChunk, totalChunks }) => {
          reportProgress(
            45 + (currentChunk / totalChunks) * 20,
            `선물 원가 조회 중... ${currentChunk}/${totalChunks}`
          );
        }
      );

      const dailyMap = new Map();
      const expenseCategoryMap = new Map(
        (expenseCategories || []).map((row) => [
          String(row?.id || '').trim(),
          String(row?.name || '').trim(),
        ])
      );
      const ensureEntry = (key) => {
        if (!dailyMap.has(key)) {
          dailyMap.set(key, {
            grossSales: 0,
            ellaSales: 0,
            guideCommission: 0,
            giftCost: 0,
            expense: 0,
          });
        }
        return dailyMap.get(key);
      };
      reportProgress(70, '일별 매출 집계 중...');

      for (const row of salesRows) {
        const key = String(row?.soldAt || '').slice(0, 10);
        if (!key) continue;
        const entry = ensureEntry(key);
        const lineTotal = Number(row?.lineTotalPhp || 0) || 0;
        const commission = Number(row?.commission || 0) || 0;
        const qty = Number(row?.qty || 0) || 0;
        const code = String(row?.code || '').trim();
        const giftUnitCost = giftCostByCode.get(code) || 0;

        entry.grossSales += lineTotal;

        if (row?.isElla) {
          entry.ellaSales += lineTotal;
        }

        if (!row?.isElla && !row?.isPeter && !row?.isMrMoon) {
          entry.guideCommission += commission;
        }

        if (row?.freeGift && !row?.isRefunded) {
          entry.giftCost += giftUnitCost * qty;
        }
      }
      reportProgress(84, '일별 지출 집계 중...');

      for (const expense of expenses || []) {
        const key = String(expense?.expense_date || '').slice(0, 10);
        if (!key) continue;
        const categoryName = String(
          expenseCategoryMap.get(String(expense?.category_id || '').trim()) || ''
        ).trim();
        if (categoryName.includes('기타')) continue;
        const entry = ensureEntry(key);
        entry.expense += toExpensePhp(expense);
      }

      reportProgress(94, '누적 손익 계산 중...');
      let cumulative = 0;
      const rows = getDateKeysBetween(from, to).map((date) => {
        const entry = dailyMap.get(date) || {
          grossSales: 0,
          ellaSales: 0,
          guideCommission: 0,
          giftCost: 0,
          expense: 0,
        };
        const revenue = Math.round(
          entry.grossSales - entry.ellaSales - entry.guideCommission - entry.giftCost
        );
        const expense = Math.round(entry.expense);
        const profit = revenue - expense;
        cumulative += profit;
        return {
          date,
          daily_revenue_php: revenue,
          daily_expense_php: expense,
          daily_profit_php: profit,
          cumulative_profit_php: cumulative,
        };
      });

      reportProgress(100, '손익 로딩 완료');
      setData(rows.slice().reverse());
    } catch (err) {
      console.error('Error fetching profit data:', err);
      setError(err?.message || 'Failed to calculate profit.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tableRows = data.map((row) => ({
    ...row,
    date: formatDate(row.date, 'yy-MM-dd'),
    daily_revenue_php: (
      <span
        style={{
          color: 'white',
          backgroundColor: 'rgba(34, 197, 94, 0.1)', // green 10%
          display: 'block',
          width: '100%',
          height: '100%',
          padding: '4px',
        }}
      >
        {Number(row.daily_revenue_php).toLocaleString()}
      </span>
    ),
    daily_expense_php: (
      <span
        style={{
          color: 'white',
          backgroundColor: 'rgba(239, 68, 68, 0.1)', // red 10%
          display: 'block',
          width: '100%',
          height: '100%',
          padding: '4px',
        }}
      >
        {Number(row.daily_expense_php).toLocaleString()}
      </span>
    ),
    daily_profit_php: (
      <span style={{ color: row.daily_profit_php >= 0 ? 'var(--gold)' : '#ef4444' }}>
        {Number(row.daily_profit_php).toLocaleString()}
      </span>
    ),
    cumulative_profit_php: (
      <span
        style={{
          color: row.cumulative_profit_php >= 0 ? 'var(--gold)' : '#ef4444',
          fontWeight: 'bold',
        }}
      >
        {Number(row.cumulative_profit_php).toLocaleString()}
      </span>
    ),
  }));

  const handleDownloadTSV = () => {
    if (!data || data.length === 0) return;
    const headers = [
      '날짜',
      '일일 수익 (PHP)',
      '일일 지출 (PHP)',
      '일일 순손익 (PHP)',
      '누적 순손익 (PHP)',
    ];
    const rows = data.map((row) =>
      [
        formatDate(row.date, 'yy-MM-dd'),
        row.daily_revenue_php,
        row.daily_expense_php,
        row.daily_profit_php,
        row.cumulative_profit_php,
      ].join('\t')
    );
    const tsvContent = [headers.join('\t'), ...rows].join('\n');
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `profit_loss_${startDate}_${endDate}.tsv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns = [
    {
      key: 'date',
      header: '날짜',
    },
    {
      key: 'daily_revenue_php',
      header: '일일 수익 (PHP)',
      className: 'text-right p-0',
      tdClassName: 'p-0',
    },
    {
      key: 'daily_expense_php',
      header: '일일 지출 (PHP)',
      className: 'text-right p-0',
      tdClassName: 'p-0',
    },
    {
      key: 'daily_profit_php',
      header: '일일 순손익 (PHP)',
      className: 'text-right',
    },
    {
      key: 'cumulative_profit_php',
      header: '누적 순손익 (PHP)',
      className: 'text-right',
    },
  ];

  return (
    <div className="page-container">
      <div className="flex justify-between items-center mb-6">
        <h1 className="page-title">Profit & Loss</h1>
        <div className="page-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="date-control">
            <span className="date-control-label">From</span>
            <div className="date-control-box">
              <input
                type="date"
                className="input-field date-control-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
          <div className="date-control">
            <span className="date-control-label">To</span>
            <div className="date-control-box">
              <input
                type="date"
                className="input-field date-control-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <Button
            variant="primary"
            onClick={fetchData}
            disabled={loading}
            style={{
              width: '30px',
              height: '30px',
              minWidth: '30px',
              flex: '0 0 30px',
              borderRadius: '50%',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Search"
            icon="search"
            iconSize={16}
          />
          <Button
            variant="primary"
            onClick={handleDownloadTSV}
            disabled={loading || !data.length}
            style={{
              width: '30px',
              height: '30px',
              minWidth: '30px',
              flex: '0 0 30px',
              borderRadius: '50%',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Download TSV"
            icon="download"
            iconSize={16}
          />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ marginBottom: 14, display: 'grid', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <span>{loadingMessage || '손익 로딩 중...'}</span>
              <strong style={{ color: 'var(--gold-soft)' }}>
                {clampProgress(loadingPercent)}%
              </strong>
            </div>
            <div
              style={{
                position: 'relative',
                height: 8,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${clampProgress(loadingPercent)}%`,
                  borderRadius: 999,
                  background:
                    'linear-gradient(90deg, rgba(212,175,55,0.55), rgba(212,175,55,0.95), rgba(245,215,110,0.9))',
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
          </div>
        ) : null}
        {error && (
          <div
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4"
            role="alert"
          >
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        <DataTable
          columns={columns}
          rows={tableRows}
          loading={loading}
          keyField="date"
          defaultSort={{ key: 'date', direction: 'desc' }}
        />
      </div>
    </div>
  );
}
