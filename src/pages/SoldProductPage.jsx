import { useMemo, useState } from 'react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import DataTable from '../components/common/DataTable';
import Input from '../components/common/Input';
import { useProductInventoryList } from '../features/products/productHooks';
import { useSalesHistoryFiltered } from '../features/sales/salesHooks';

const toInputDate = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function SoldProductPage() {
  // Date / Query State
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [codeQuery, setCodeQuery] = useState('');
  const [filters, setFilters] = useState({ fromDate: '', toDate: '', code: '' });

  // Price Filter State: 'all', 'zero', 'nonzero'
  const [priceFilter, setPriceFilter] = useState('all');

  // Data Fetching
  const { data: salesData, isLoading: isSalesLoading } = useSalesHistoryFiltered({
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    query: filters.code,
  });

  const { data: allProducts = [], isLoading: isProductsLoading } = useProductInventoryList();

  // Product Map for Price Lookup
  const productMap = useMemo(() => {
    const map = new Map();
    for (const p of allProducts) {
      map.set(p.code, p);
    }
    return map;
  }, [allProducts]);

  // Aggregation
  const aggregatedRows = useMemo(() => {
    const rows = salesData?.rows || [];
    const grouped = new Map();

    for (const r of rows) {
      // Apply Transaction-level Filter
      const price = Number(r.lineTotalPhp || 0);
      if (priceFilter === 'zero' && price > 0) continue;
      if (priceFilter === 'nonzero' && price === 0) continue;

      const code = r.code;
      const existing = grouped.get(code) || {
        code,
        totalQty: 0,
        totalPrice: 0,
      };

      existing.totalQty += Number(r.qty || 0);
      existing.totalPrice += price;

      grouped.set(code, existing);
    }

    // Convert to array and enrich with product data
    const result = Array.from(grouped.values()).map((item) => {
      const product = productMap.get(item.code);
      return {
        id: item.code,
        productNo: product?.no || 0,
        code: item.code,
        totalQty: item.totalQty,
        totalPrice: item.totalPrice,
        kprice: product?.kprice || 0,
        salePricePhp: product?.salePricePhp || 0,
      };
    });

    // Sort by Total Qty Descending
    return result.sort((a, b) => b.totalQty - a.totalQty);
  }, [salesData, productMap, priceFilter]);

  const handleSearch = () => {
    setFilters({ fromDate: fromInput, toDate: toInput, code: codeQuery.trim() });
  };

  const handleResetDate = () => {
    setFromInput('');
    setToInput('');
    setCodeQuery('');
    setFilters({ fromDate: '', toDate: '', code: '' });
  };

  const setTodayRange = () => {
    const t = toInputDate(new Date());
    setFromInput(t);
    setToInput(t);
    setFilters((prev) => ({ ...prev, fromDate: t, toDate: t }));
  };

  const isLoading = isSalesLoading || isProductsLoading;

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <div className="page-title">Sold Product</div>
          <div className="page-subtitle">Aggregated sales by product code</div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Filters */}
        <Card>
          <div className="flex flex-col gap-3">
            <div className="date-controls">
              <div className="date-control">
                <span className="date-control-label">From</span>
                <div className="date-control-box">
                  <Input
                    type="date"
                    value={fromInput}
                    onChange={(e) => setFromInput(e.target.value)}
                    className="date-control-input"
                  />
                </div>
              </div>
              <div className="date-control">
                <span className="date-control-label">To</span>
                <div className="date-control-box">
                  <Input
                    type="date"
                    value={toInput}
                    onChange={(e) => setToInput(e.target.value)}
                    className="date-control-input"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sold-filter-row">
              <Button onClick={setTodayRange} variant="outline" size="sm">
                Today
              </Button>
              <Input
                type="text"
                value={codeQuery}
                onChange={(e) => setCodeQuery(e.target.value)}
                placeholder="Search by product code"
                className="date-control-input"
              />
              <Button onClick={handleSearch} variant="primary" size="sm">
                Apply Date
              </Button>
              <Button onClick={handleResetDate} variant="outline" size="sm">
                Reset
              </Button>

              <Button
                size="sm"
                variant={priceFilter === 'all' ? 'primary' : 'outline'}
                onClick={() => setPriceFilter('all')}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={priceFilter === 'zero' ? 'primary' : 'outline'}
                onClick={() => setPriceFilter('zero')}
              >
                0 Only
              </Button>
              <Button
                size="sm"
                variant={priceFilter === 'nonzero' ? 'primary' : 'outline'}
                onClick={() => setPriceFilter('nonzero')}
              >
                Exclude 0
              </Button>
            </div>
          </div>
        </Card>

        {/* Table */}
        <Card>
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : (
            <DataTable
              columns={[
                { key: 'rowIndex', header: 'No.', className: 'w-16 text-center' },
                { key: 'proNo', header: 'proNo', className: 'w-20 text-center' },
                { key: 'code', header: 'Product Code' },
                { key: 'salePricePhp', header: 'Sale Price', className: 'text-right' },
                { key: 'totalQty', header: 'Total Sold Qty', className: 'text-right' },
                { key: 'totalPrice', header: 'Total Sold Price', className: 'text-right' },
              ]}
              rows={aggregatedRows.map((r, index) => ({
                id: r.code,
                rowIndex: index + 1,
                proNo: r.productNo,
                code: r.code,
                totalQty: r.totalQty,
                totalPrice: Number(r.totalPrice).toLocaleString(),
                salePricePhp: Number(r.salePricePhp).toLocaleString(),
              }))}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
