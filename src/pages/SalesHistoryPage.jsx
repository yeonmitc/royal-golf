// src/pages/SalesHistoryPage.jsx
import { useMemo, useState } from 'react';
import SalesTable from '../features/sales/components/SalesTable';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import ExportActions from '../components/common/ExportActions';
import { useSalesHistoryFiltered } from '../features/sales/salesHooks';

function toInputDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function SalesHistoryPage() {
  const today = useMemo(() => new Date(), []);

  // UI 입력값
  const [fromInput, setFromInput] = useState(toInputDate(today));
  const [toInput, setToInput] = useState(toInputDate(today));
  const [qInput, setQInput] = useState('');

  // 실제 적용된 필터(검색 버튼 누른 후 반영)
  const [filters, setFilters] = useState({
    fromDate: toInputDate(today),
    toDate: toInputDate(today),
    query: '',
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const applySearch = () => {
    setFilters({
      fromDate: fromInput || '',
      toDate: toInput || '',
      query: qInput.trim(),
    });
    setCurrentPage(1);
  };

  const resetSearch = () => {
    setQInput('');
    setTodayRange();
    setCurrentPage(1);
  };

  const setTodayRange = () => {
    const t = toInputDate(new Date());
    setFromInput(t);
    setToInput(t);
    setFilters((prev) => ({ ...prev, fromDate: t, toDate: t }));
  };

  const { data: salesData } = useSalesHistoryFiltered({
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    query: filters.query,
  });

  const allRows = salesData?.rows || [];
  const totalPages = Math.ceil(allRows.length / itemsPerPage);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return allRows.slice(start, start + itemsPerPage);
  }, [allRows, currentPage]);

  const exportActions = useMemo(() => {
    const rows = salesData?.rows || [];
    if (!rows.length) return null;
    const columns = [
      { key: 'soldAt', header: 'Date / Time' },
      { key: 'code', header: 'Code' },
      { key: 'nameKo', header: 'Name' },
      { key: 'sizeDisplay', header: 'Size' },
      { key: 'qty', header: 'Qty' },
      { key: 'unitPricePhp', header: 'Unit (PHP)' },
      { key: 'discountUnitPricePhp', header: 'Discount Unit' },
    ];
    const csvRows = rows.map((row) => {
      const dt = row.soldAt ? new Date(row.soldAt) : null;
      const dateStr = dt
        ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
            dt.getDate()
          ).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(
            dt.getMinutes()
          ).padStart(2, '0')}`
        : '';
      return {
        soldAt: dateStr,
        code: row.code,
        nameKo: row.nameKo,
        sizeDisplay: row.sizeDisplay,
        qty: row.qty,
        unitPricePhp: Number(row.unitPricePhp || 0).toLocaleString('en-PH'),
        discountUnitPricePhp:
          row.discountUnitPricePhp != null
            ? Number(row.discountUnitPricePhp || 0).toLocaleString('en-PH')
            : '',
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
  }, [salesData]);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 12 }}>판매 기록</h2>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>From</label>
          <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>To</label>
          <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} />
        </div>

        <Button type="button" onClick={setTodayRange} size="sm" variant="outline" title="Today" icon="today" />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 240 }}>
          <input
            type="text"
            placeholder="제품코드/제품명/사이즈 검색 (부분검색)"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
            style={{ flex: 1 }}
          />
          <Button type="button" onClick={applySearch} size="sm" variant="primary" title="Search" icon="search" />
          <Button type="button" onClick={resetSearch} size="sm" variant="outline" title="Reset" icon="reset" />
        </div>
      </div>

      <Card
        title="판매 내역"
        actions={exportActions}
      >
        <SalesTable
          fromDate={filters.fromDate}
          toDate={filters.toDate}
          query={filters.query}
          rows={paginatedRows}
          pagination={{
            current: currentPage,
            totalPages,
            onPageChange: setCurrentPage,
          }}
        />
      </Card>
    </div>
  );
}
