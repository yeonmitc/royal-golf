import { useMemo, useState, useEffect } from 'react';
import Button from '../components/common/Button';
import DataTable from '../components/common/DataTable';
import Input from '../components/common/Input';
import { sbRpc } from '../db/supabaseRest';
import { useToast } from '../context/ToastContext';

export default function StaffSoldProductPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hideUnsold, setHideUnsold] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      // Note: This RPC function needs to be created in Supabase using the SQL provided in '직원용.sql'
      const result = await sbRpc('get_staff_sold_stats');
      
      const mapped = (result || []).map(row => ({
        code: row['제품코드'],
        totalQty: Number(row['총제품갯수'] || 0),
        currentStock: Number(row['현재재고'] || 0),
        soldQty: Number(row['판매갯수'] || 0),
        salePrice: Number(row['판매가'] || 0),
        realSalePrice: Number(row['실제판매가'] || 0),
        soldSizes: row['총팔린사이즈'] || '-'
      }));

      setData(mapped);
    } catch (err) {
      console.error('Error fetching staff sold product stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = useMemo(() => {
    let processed = [...data];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      processed = processed.filter(row => 
        row.code?.toLowerCase().includes(q)
      );
    }

    // Filter unsold if enabled
    if (hideUnsold) {
      processed = processed.filter(row => row.soldQty > 0);
    }

    // Sort by soldQty desc by default (matching SQL order)
    return processed;
  }, [data, searchQuery, hideUnsold]);

  const handleDownloadTSV = () => {
    if (!filteredData || filteredData.length === 0) {
      showToast('No data to download', 'warning');
      return;
    }
    const headers = ['No.', 'Product Code', 'Total Qty', 'Stock', 'Sold', 'Price', 'Real Price', 'Sold Sizes'];
    const rows = filteredData.map((row, i) => [
      i + 1,
      row.code,
      row.totalQty,
      row.currentStock,
      row.soldQty,
      row.salePrice,
      row.realSalePrice,
      row.soldSizes
    ].join('\t'));

    const tsvContent = [headers.join('\t'), ...rows].join('\n');
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `staff_sold_analysis_${new Date().toISOString().slice(0, 10)}.tsv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const circularStyles = {
    width: '30px',
    height: '30px',
    minWidth: '30px',
    flex: '0 0 30px',
    borderRadius: '50%',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const columns = [
    { key: 'index', header: 'No.', className: 'text-center font-bold text-gray-500 w-12' },
    {
      key: 'code',
      header: 'Product Code',
      className: 'font-bold text-left',
      tdClassName: 'font-bold text-blue-400'
    },
    { key: 'totalQty', header: 'Total Qty', className: 'text-right' },
    { key: 'currentStock', header: 'Stock', className: 'text-right' },
    { key: 'soldQty', header: 'Sold', className: 'text-right font-bold text-blue-600' },
    { key: 'salePrice', header: 'Price', className: 'text-right' },
    { key: 'realSalePrice', header: 'Real Price', className: 'text-right' },
    { key: 'soldSizes', header: 'Sold Sizes', className: 'text-left' },
  ];

  const tableRows = filteredData.map((row, i) => ({
    ...row,
    index: i + 1,
    totalQty: row.totalQty.toLocaleString(),
    currentStock: row.currentStock.toLocaleString(),
    soldQty: row.soldQty.toLocaleString(),
    salePrice: row.salePrice.toLocaleString(),
    realSalePrice: row.realSalePrice.toLocaleString(),
    // soldSizes is already a string
  }));

  const summary = useMemo(() => {
    const totalCount = filteredData.length;
    const totalQtySum = filteredData.reduce((sum, row) => sum + row.totalQty, 0);
    const totalStock = filteredData.reduce((sum, row) => sum + row.currentStock, 0);
    const totalSold = filteredData.reduce((sum, row) => sum + row.soldQty, 0);

    return { totalCount, totalQtySum, totalStock, totalSold };
  }, [filteredData]);

  return (
    <div className="page-container">
      <div className="flex justify-center items-center mb-6">
        <div className="text-center">
          <h1 className="page-title">Sold Product Analysis</h1>
        </div>
      </div>

      <div className="card mb-6">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ flex: 1, minWidth: 0, maxWidth: 560, display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button
                variant={hideUnsold ? 'primary' : 'outline'}
                size="md"
                onClick={() => setHideUnsold(!hideUnsold)}
                title={hideUnsold ? "Show All" : "Hide Unsold"}
                icon="zore"
                style={circularStyles}
                iconSize={16}
              />
              <Button
                variant="outline"
                size="md"
                onClick={fetchData}
                title="Refresh"
                icon="refresh"
                style={circularStyles}
                iconSize={16}
              />
              <Button
                variant="outline"
                size="md"
                onClick={handleDownloadTSV}
                title="Download TSV"
                icon="download"
                style={circularStyles}
                iconSize={16}
              />
            </div>
          </div>
          
          <div 
            className="p-4 bg-gray-900/50 rounded-lg flex flex-wrap border border-gray-700 text-yellow-400 font-bold text-lg justify-center" 
            style={{ margin: '5px 0', color: '#facc15' }}
          >
            <span style={{ margin: '0 5px' }}>Total Products: {summary.totalCount.toLocaleString()}</span>
            <span style={{ margin: '0 5px' }}>Total Qty: {summary.totalQtySum.toLocaleString()}</span>
            <span style={{ margin: '0 5px' }}>Total Stock: {summary.totalStock.toLocaleString()}</span>
            <span style={{ margin: '0 5px' }}>Total Sold: {summary.totalSold.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="card">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
            <div className="mt-2 text-sm">
              <p>DB 함수가 생성되지 않았을 수 있습니다. Supabase에서 'get_staff_sold_stats' 함수를 생성해주세요.</p>
            </div>
          </div>
        )}
        
        <div className="product-table-container">
          <DataTable
            columns={columns}
            rows={tableRows}
            loading={loading}
            keyField="code"
          />
        </div>
      </div>
    </div>
  );
}
