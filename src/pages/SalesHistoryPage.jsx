// src/pages/SalesHistoryPage.jsx
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import ellaIcon from '../assets/ella.svg';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import ExportActions from '../components/common/ExportActions';
import codePartsSeed from '../db/seed/seed-code-parts.json';
import { getGuides } from '../features/guides/guideApi';
import SalesTable from '../features/sales/components/SalesTable';
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
  const today = toInputDate(new Date());
  const [fromInput, setFromInput] = useState(today);
  const [toInput, setToInput] = useState(today);
  const [qInput, setQInput] = useState('');
  const [sortAscending, setSortAscending] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'no-guide', 'guide', 'mr-moon'
  const [refundOnly, setRefundOnly] = useState(false);

  // 실제 적용된 필터(검색 버튼 누른 후 반영)
  const [filters, setFilters] = useState({
    fromDate: today,
    toDate: today,
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

  const { data: guides = [] } = useQuery({ queryKey: ['guides', 'active'], queryFn: getGuides });

  const allRows = salesData?.rows ?? EMPTY_ROWS;
  const visibleRows = useMemo(() => {
    const base = (allRows || []).filter((r) => {
      const isRefunded = Boolean(r?.isRefunded) || Boolean(r?.refundedAt);
      if (refundOnly && isRefunded) return false;
      return true;
    });

    const mrMoonGuideIds = new Set(
      (guides || [])
        .filter((g) => String(g.name || '').toLowerCase() === 'mr.moon')
        .map((g) => String(g.id))
    );

    const ellaGuideIds = new Set(
      (guides || [])
        .filter((g) =>
          String(g.name || '')
            .toLowerCase()
            .includes('ella')
        )
        .map((g) => String(g.id))
    );

    const filtered = base.filter((r) => {
      const gid = r.guideId;
      const isMrMoon = gid && mrMoonGuideIds.has(String(gid));
      const isElla = gid && ellaGuideIds.has(String(gid));

      if (filterMode === 'no-guide') {
        return !gid;
      }
      if (filterMode === 'guide') {
        return gid && !isMrMoon && !isElla;
      }
      if (filterMode === 'mr-moon') {
        return isMrMoon;
      }
      if (filterMode === 'no-ella') {
        return !isElla;
      }
      return true;
    });

    if (!sortAscending) return filtered;
    return [...filtered].sort((a, b) => {
      const at = new Date(a.soldAt || 0).getTime();
      const bt = new Date(b.soldAt || 0).getTime();
      return at - bt;
    });
  }, [allRows, sortAscending, filterMode, guides, refundOnly]);

  const exportActions = useMemo(() => {
    const rows = visibleRows || [];
    if (!rows.length) return null;
    /*
    const mrMoonGuideIds = new Set(
      (guides || [])
        .filter((g) => String(g.name || '').toLowerCase() === 'mr.moon')
        .map((g) => String(g.id))
    );
    */
    const brandFromCode = (code) => {
      const parts = String(code || '').split('-');
      const brandCode = String(parts[2] || '').trim();
      if (!brandCode) return '';
      const arr = codePartsSeed.brand || [];
      const hit = arr.find((i) => i.code === brandCode);
      const label = String(hit?.label || brandCode).trim();
      return label === 'NoBrand' ? 'nobrand' : label;
    };
    const columns = [
      { key: 'no', header: 'no' },
      { key: 'date', header: 'date' },
      { key: 'time', header: 'time' },
      { key: 'code', header: 'code' },
      { key: 'size', header: 'size' },
      { key: 'color', header: 'color' },
      { key: 'qty', header: 'qty' },
      { key: 'brand', header: 'brand' },
      { key: 'price', header: 'price' },
      { key: 'commission', header: 'comm.' },
    ];
    const csvRows = rows.map((row, index) => {
      const isRefunded = Boolean(row?.isRefunded) || Boolean(row?.refundedAt);
      const original = Number(row.unitPricePhp || 0);
      const discounted = row.discountUnitPricePhp != null ? Number(row.discountUnitPricePhp) : null;
      const isDiscounted = discounted !== null && discounted !== original;
      const finalUnitRaw = isDiscounted ? discounted : original;
      const finalUnit = isRefunded ? 0 : finalUnitRaw;
      const qty = Number(row.qty || 0) || 0;
      const qtyForTotal = isRefunded ? 0 : qty;
      const commission = Number(row.commission || 0);
      const commissionForTotal = isRefunded ? 0 : commission;
      // const isMrMoon = row.guideId != null && mrMoonGuideIds.has(String(row.guideId));
      const lineTotalForTotal = finalUnit * qtyForTotal;
      const s = String(row.soldAt || '').trim();
      const dateHit = s.match(/\d{4}-\d{2}-\d{2}/);
      const timeHit = s.match(/(\d{2}:\d{2})/);
      const dateRaw = dateHit ? dateHit[0] : '';
      let dateDisp = dateRaw;
      let timeDisp = timeHit ? timeHit[0] : '';
      if (dateRaw) {
        const [y, m, d] = dateRaw.split('-').map(Number);
        const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dow = days[dt.getUTCDay()] || '';
        const mm = String(m || '').padStart(2, '0');
        const dd = String(d || '').padStart(2, '0');
        dateDisp = `${mm}-${dd} ${dow}`.trim();
      }
      return {
        no: index + 1,
        date: dateDisp,
        time: timeDisp,
        code: row.code,
        size: row.sizeDisplay,
        color: row.color || '',
        qty: qtyForTotal,
        brand: brandFromCode(row.code),
        price: lineTotalForTotal.toLocaleString('en-US'),
        commission: commissionForTotal > 0 ? commissionForTotal.toLocaleString('en-US') : '-',
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

  const summary = useMemo(() => {
    const rows = visibleRows || [];
    const count = rows.length;
    const totalQty = rows.reduce((acc, r) => acc + (Number(r.qty) || 0), 0);
    const totalAmount = rows.reduce((acc, r) => {
      if (typeof r.lineTotalPhp === 'number') return acc + r.lineTotalPhp;
      const price = Number(r.price ?? r.unitPricePhp ?? 0);
      const qty = Number(r.qty ?? 0);
      return acc + price * qty;
    }, 0);
    return { count, totalQty, totalAmount };
  }, [visibleRows]);

  const cardActions = useMemo(() => {
    const actions = [
      <Button
        key="ascending-toggle"
        type="button"
        onClick={() => setSortAscending((prev) => !prev)}
        size="sm"
        variant={sortAscending ? 'primary' : 'outline'}
        style={{ minWidth: 90 }}
      >
        Ascending
      </Button>,
      <Button
        key="guide-toggle"
        type="button"
        onClick={() => setFilterMode((prev) => (prev === 'guide' ? 'all' : 'guide'))}
        size="sm"
        variant={filterMode === 'guide' ? 'primary' : 'outline'}
        style={{ minWidth: 90 }}
      >
        Guide
      </Button>,
      <Button
        key="mr-moon-toggle"
        type="button"
        onClick={() => setFilterMode((prev) => (prev === 'mr-moon' ? 'all' : 'mr-moon'))}
        size="sm"
        variant={filterMode === 'mr-moon' ? 'primary' : 'outline'}
        style={{ minWidth: 90 }}
      >
        Mr.Moon
      </Button>,
      <Button
        key="no-guide-toggle"
        type="button"
        onClick={() => setFilterMode((prev) => (prev === 'no-guide' ? 'all' : 'no-guide'))}
        size="sm"
        variant={filterMode === 'no-guide' ? 'primary' : 'outline'}
        style={{ minWidth: 90 }}
      >
        NoGuide
      </Button>,
      <Button
        key="refund-toggle"
        type="button"
        onClick={() => setRefundOnly((prev) => !prev)}
        size="sm"
        variant={refundOnly ? 'primary' : 'outline'}
        style={{ minWidth: 90 }}
      >
        No Refund
      </Button>,
      <Button
        key="ella-toggle"
        type="button"
        onClick={() => setFilterMode((prev) => (prev === 'no-ella' ? 'all' : 'no-ella'))}
        size="sm"
        variant="outline"
        title="No Ella Sales"
        className="group transition-colors"
        style={{
          width: '32px',
          height: '32px',
          padding: '2px',
          minWidth: '32px',
          flex: '0 0 32px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filterMode === 'no-ella' ? 'var(--gold)' : 'transparent',
          borderColor: filterMode === 'no-ella' ? 'var(--gold)' : 'transparent',
        }}
      >
        <div
          className="transition-colors"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: filterMode === 'no-ella' ? '#000000' : 'var(--gold)',
            mask: `url(${ellaIcon}) no-repeat center / contain`,
            WebkitMask: `url(${ellaIcon}) no-repeat center / contain`,
          }}
          onMouseEnter={(e) => {
            if (filterMode !== 'no-ella') {
              e.currentTarget.style.backgroundColor = '#000000';
              e.currentTarget.parentElement.style.backgroundColor = 'var(--gold)';
            }
          }}
          onMouseLeave={(e) => {
            if (filterMode !== 'no-ella') {
              e.currentTarget.style.backgroundColor = 'var(--gold)';
              e.currentTarget.parentElement.style.backgroundColor = 'transparent';
            }
          }}
        />
      </Button>,
    ];
    if (exportActions) {
      actions.push(exportActions);
    }
    return actions;
  }, [sortAscending, filterMode, refundOnly, exportActions]);

  return (
    <div className="page-container">
      <h2 style={{ marginBottom: 12 }}>Sales History</h2>

      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 8,
            alignItems: 'center',
          }}
        >
          <div className="date-controls">
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
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            minWidth: 0,
            flexWrap: 'nowrap',
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
            style={{ flex: '1 1 0', minWidth: 0 }}
          />
          <Button
            type="button"
            onClick={applySearch}
            variant="primary"
            title="Search"
            icon="search"
            iconSize={16}
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
          />
          <Button
            type="button"
            onClick={resetSearch}
            size="sm"
            variant="outline"
            title="Reset"
            icon="reset"
          />
        </div>
      </div>

      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Sales Records</span>
            <span style={{ fontSize: '0.9em', fontWeight: 'normal', color: 'var(--text-muted)' }}>
              Total: {summary.count} tx / {summary.totalQty} items /{' '}
              <span style={{ color: 'var(--gold-soft)', fontWeight: 'bold' }}>
                {summary.totalAmount.toLocaleString()} PHP
              </span>
            </span>
          </div>
        }
      >
        <div
          className="no-scrollbar"
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            marginBottom: 12,
            flexWrap: 'nowrap',
            overflowX: 'auto',
          }}
        >
          {cardActions}
        </div>
        <SalesTable rows={visibleRows} isLoading={isLoading} isError={isError} error={error} />
      </Card>
    </div>
  );
}
