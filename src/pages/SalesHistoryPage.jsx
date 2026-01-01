// src/pages/SalesHistoryPage.jsx
import { useMemo, useState } from 'react';
import SalesTable from '../features/sales/components/SalesTable';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import ExportActions from '../components/common/ExportActions';
import { useSalesHistoryFiltered } from '../features/sales/salesHooks';

const EMPTY_ROWS = [];

function toInputDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function SalesHistoryPage() {
  // UI 입력값
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [qInput, setQInput] = useState('');

  // 실제 적용된 필터(검색 버튼 누른 후 반영)
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    query: '',
  });

  const applySearch = () => {
    setFilters({
      fromDate: fromInput || '',
      toDate: toInput || '',
      query: qInput.trim(),
    });
  };

  const resetSearch = () => {
    setQInput('');
    setAllRange();
  };

  const setAllRange = () => {
    setFromInput('');
    setToInput('');
    setFilters((prev) => ({ ...prev, fromDate: '', toDate: '' }));
  };

  const setTodayRange = () => {
    const t = toInputDate(new Date());
    setFromInput(t);
    setToInput(t);
    setFilters((prev) => ({ ...prev, fromDate: t, toDate: t, query: qInput.trim() }));
  };

  const setWeekRange = () => {
    const now = new Date();
    const day = now.getDay();
    const diffToMon = (day + 6) % 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon);
    const from = toInputDate(start);
    const to = toInputDate(now);
    setFromInput(from);
    setToInput(to);
    setFilters((prev) => ({ ...prev, fromDate: from, toDate: to, query: qInput.trim() }));
  };

  const setMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = toInputDate(start);
    const to = toInputDate(now);
    setFromInput(from);
    setToInput(to);
    setFilters((prev) => ({ ...prev, fromDate: from, toDate: to, query: qInput.trim() }));
  };

  const {
    data: salesData,
    isLoading,
    isError,
    error,
  } = useSalesHistoryFiltered({
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    query: filters.query,
  });

  const allRows = salesData?.rows ?? EMPTY_ROWS;
  const visibleRows = useMemo(() => {
    return (allRows || []).filter((r) => !r?.isRefunded && !r?.refundedAt);
  }, [allRows]);

  const exportActions = useMemo(() => {
    const rows = visibleRows || [];
    if (!rows.length) return null;
    const columns = [
      { key: 'soldAt', header: 'Date / Time' },
      { key: 'nameKo', header: 'Name' },
      { key: 'color', header: 'Color' },
      { key: 'sizeDisplay', header: 'Size' },
      { key: 'qty', header: 'Qty' },
      { key: 'unitPricePhp', header: 'Price (PHP)' },
      { key: 'gift', header: 'Gift' },
    ];
    const csvRows = rows.map((row) => {
      const original = Number(row.unitPricePhp || 0);
      const discounted = row.discountUnitPricePhp != null ? Number(row.discountUnitPricePhp) : null;
      const isDiscounted = discounted !== null && discounted !== original;
      const finalUnit = isDiscounted ? discounted : original;
      const giftChecked = Boolean(row.freeGift) || finalUnit === 0;
      return {
        soldAt: row.soldAt || '',
        nameKo: row.nameKo,
        color: row.color || '',
        sizeDisplay: row.sizeDisplay,
        qty: row.qty,
        unitPricePhp: finalUnit.toLocaleString('en-PH'),
        gift: giftChecked ? 'gift' : '',
      };
    });
    return (
      <ExportActions
        key="sales-csv"
        columns={columns}
        rows={csvRows}
        filename="sales-history.csv"
        gdriveName="sales-history.csv"
      />
    );
  }, [visibleRows]);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 12 }}>Sales History</h2>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="date-control">
          <span className="date-control-label">From</span>
          <div className="date-control-box">
            <input
              type="date"
              className="input-field date-control-input"
              value={fromInput}
              onChange={(e) => {
                const v = e.target.value;
                setFromInput(v);
                setFilters((prev) => ({ ...prev, fromDate: v || '' }));
              }}
            />
          </div>
        </div>

        <div className="date-control">
          <span className="date-control-label">To</span>
          <div className="date-control-box">
            <input
              type="date"
              className="input-field date-control-input"
              value={toInput}
              onChange={(e) => {
                const v = e.target.value;
                setToInput(v);
                setFilters((prev) => ({ ...prev, toDate: v || '' }));
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Button
            type="button"
            onClick={setAllRange}
            size="sm"
            variant="outline"
            style={{ height: 28, padding: '0 10px', fontSize: 11, minWidth: 50 }}
          >
            All
          </Button>
          <Button
            type="button"
            onClick={setTodayRange}
            size="sm"
            variant="outline"
            style={{ height: 28, padding: '0 10px', fontSize: 11, minWidth: 50 }}
          >
            Today
          </Button>
          <Button
            type="button"
            onClick={setWeekRange}
            size="sm"
            variant="outline"
            style={{ height: 28, padding: '0 10px', fontSize: 11, minWidth: 50 }}
          >
            Week
          </Button>
          <Button
            type="button"
            onClick={setMonthRange}
            size="sm"
            variant="outline"
            style={{ height: 28, padding: '0 10px', fontSize: 11, minWidth: 50 }}
          >
            Month
          </Button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flex: 1,
            minWidth: 0,
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            placeholder="Search by product code/name/size (partial)"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
            style={{ flex: '1 1 240px', minWidth: 180 }}
          />
          <Button type="button" onClick={applySearch} size="sm" variant="primary" title="Search" icon="search" />
          <Button type="button" onClick={resetSearch} size="sm" variant="outline" title="Reset" icon="reset" />
        </div>
      </div>

      <Card
        title="Sales Records"
        actions={exportActions}
      >
        <SalesTable
          rows={visibleRows}
          isLoading={isLoading}
          isError={isError}
          error={error}
        />
      </Card>
    </div>
  );
}
