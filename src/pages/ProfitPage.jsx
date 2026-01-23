import { useCallback, useEffect, useState } from 'react';
import Button from '../components/common/Button';
import DataTable from '../components/common/DataTable';
import { sbRpc } from '../db/supabaseRest';

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

export default function ProfitPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('2025-12-16');
  const [endDate, setEndDate] = useState(formatDate(new Date(), 'yyyy-MM-dd'));

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await sbRpc('get_daily_profit_loss', {
        start_date: startDate || '2025-12-16',
        end_date: endDate || formatDate(new Date(), 'yyyy-MM-dd'),
      });
      console.log('Profit data:', result);
      setData(result || []);
    } catch (err) {
      console.error('Error fetching profit data:', err);
      setError(err.message);
      // Fallback for when RPC is not created yet
      // alert('데이터를 불러오지 못했습니다. DB 함수가 생성되었는지 확인해주세요.');
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
        {error && (
          <div
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4"
            role="alert"
          >
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
            <div className="mt-2 text-sm">
              <p>
                DB 함수가 생성되지 않았을 수 있습니다. 아래 SQL을 Supabase SQL Editor에서
                실행해주세요:
              </p>
              <code className="block bg-red-50 p-2 mt-1 rounded text-xs select-all">
                get_daily_profit_loss
              </code>
            </div>
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
