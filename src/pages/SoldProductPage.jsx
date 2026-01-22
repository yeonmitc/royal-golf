import { useMemo, useState, useEffect } from 'react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import DataTable from '../components/common/DataTable';
import Input from '../components/common/Input';
import { sbRpc } from '../db/supabaseRest';
import Modal from '../components/common/Modal';
import ProductLookup from '../features/products/components/ProductLookup';
import { useToast } from '../context/ToastContext';
import { useAdminStore } from '../store/adminStore';

export default function SoldProductPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCode, setModalCode] = useState('');
  const [editMode, setEditMode] = useState(false);

  const { showToast } = useToast();
  const isAdmin = useAdminStore((s) => s.isAuthorized());

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      // Note: This RPC function needs to be created in Supabase using the SQL provided.
      const result = await sbRpc('get_sold_product_stats');
      
      // Map keys to English for easier handling
      const mapped = (result || []).map(row => {
        const currentStock = Number(row['현재재고'] || 0);
        const soldQty = Number(row['팔린갯수'] || 0);
        
        return {
          code: row['제품코드'],
          purchasedQty: currentStock + soldQty,
          currentStock,
          soldQty,
          avgSalePrice: Number(row['평균판매가_php'] || 0),
          realTotalSales: Number(row['실제총매출_php'] || 0),
          setSalePrice: Number(row['현재판매가_php(설정)'] || 0),
          p1Price: Number(row['사입원가_php(p1price)'] || 0),
          opCost: Number(row['개당운영비_php'] || 0),
          realCost: Number(row['실질원가_php'] || 0),
          unitProfit: Number(row['개당이익_php(설정가 기준)'] || 0),
          profitMargin: Number(row['이익률_%(설정가 기준)'] || 0),
        };
      });

      setData(mapped);
    } catch (err) {
      console.error('Error fetching sold product stats:', err);
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

    // Sort by soldQty desc
    processed.sort((a, b) => b.soldQty - a.soldQty);

    return processed;
  }, [data, searchQuery]);

  const columns = [
    { key: 'index', header: 'No.', className: 'text-center font-bold text-gray-500 w-12' },
    {
      key: 'code',
      header: '제품코드',
      className: 'font-bold',
      tdClassName: 'font-bold cursor-pointer hover:underline text-blue-400'
    },
    { key: 'purchasedQty', header: '구매한갯수', className: 'text-right' },
    { key: 'currentStock', header: '현재재고', className: 'text-right' },
    { key: 'soldQty', header: '팔린갯수', className: 'text-right font-bold text-blue-600' },
    { key: 'avgSalePrice', header: '평균판매가', className: 'text-right' },
    { key: 'realTotalSales', header: '실제총매출', className: 'text-right' },
    { key: 'setSalePrice', header: '현재판매가', className: 'text-right' },
    { key: 'p1Price', header: '사입원가', className: 'text-right' },
    { key: 'opCost', header: '개당운영비', className: 'text-right' },
    { key: 'realCost', header: '실질원가', className: 'text-right font-semibold' },
    { key: 'unitProfit', header: '개당이익', className: 'text-right' },
    { key: 'profitMargin', header: '이익률(%)', className: 'text-right' },
  ];

  const tableRows = filteredData.map((row, i) => ({
    ...row,
    index: i + 1,
    purchasedQty: row.purchasedQty.toLocaleString(),
    currentStock: row.currentStock.toLocaleString(),
    soldQty: row.soldQty.toLocaleString(),
    avgSalePrice: row.avgSalePrice.toLocaleString(),
    realTotalSales: row.realTotalSales.toLocaleString(),
    setSalePrice: row.setSalePrice.toLocaleString(),
    p1Price: row.p1Price.toLocaleString(),
    opCost: row.opCost.toLocaleString(),
    realCost: row.realCost.toLocaleString(),
    unitProfit: (
      <span className={row.unitProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
        {row.unitProfit.toLocaleString()}
      </span>
    ),
    profitMargin: (
      <span className={row.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}>
        {row.profitMargin.toFixed(2)}%
      </span>
    ),
  }));

  const summary = useMemo(() => {
    const totalCount = filteredData.length;
    const totalPurchased = filteredData.reduce((sum, row) => sum + row.purchasedQty, 0);
    const totalStock = filteredData.reduce((sum, row) => sum + row.currentStock, 0);
    const totalSold = filteredData.reduce((sum, row) => sum + row.soldQty, 0);
    const totalMarginSum = filteredData.reduce((sum, row) => sum + row.profitMargin, 0);
    const avgProfitMargin = totalCount > 0 ? totalMarginSum / totalCount : 0;
    const totalRealSales = filteredData.reduce((sum, row) => sum + row.realTotalSales, 0);
    const totalPurchaseCost = filteredData.reduce((sum, row) => sum + (row.p1Price * row.purchasedQty), 0);

    return { totalCount, totalPurchased, totalStock, totalSold, avgProfitMargin, totalRealSales, totalPurchaseCost };
  }, [filteredData]);

  const handleDownloadTSV = () => {
    if (!filteredData || filteredData.length === 0) {
      showToast('No data to download', 'warning');
      return;
    }

    const headers = [
      'No.', '제품코드', '구매한갯수', '현재재고', '팔린갯수', 
      '평균판매가', '실제총매출', '현재판매가', '사입원가', 
      '개당운영비', '실질원가', '개당이익', '이익률(%)'
    ];

    const rows = filteredData.map((row, i) => [
      i + 1,
      row.code,
      row.purchasedQty,
      row.currentStock,
      row.soldQty,
      row.avgSalePrice,
      row.realTotalSales,
      row.setSalePrice,
      row.p1Price,
      row.opCost,
      row.realCost,
      row.unitProfit,
      row.profitMargin ? `${row.profitMargin.toFixed(2)}%` : '0%'
    ].join('\t'));

    const tsvContent = [headers.join('\t'), ...rows].join('\n');
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sold_product_analysis_${new Date().toISOString().slice(0, 10)}.tsv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="page-container">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="page-title">Sold Product Analysis</h1>
          <p className="text-gray-500 text-sm mt-1">실질원가 분석 (Real Cost Analysis)</p>
        </div>
      </div>

      <div className="card mb-6">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                maxWidth: 560,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ flex: 1 }}>
                <Input
                  placeholder="Search (Start with # for partial code search)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="md"
                onClick={fetchData}
                title="Refresh"
                icon="refresh"
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
                iconSize={16}
              />
              <Button
                variant="outline"
                size="md"
                onClick={handleDownloadTSV}
                title="Download TSV"
                icon="download"
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
                iconSize={16}
              />
            </div>
          </div>
          
          <div 
            className="p-4 bg-gray-900/50 rounded-lg flex flex-wrap gap-6 border border-gray-700 text-yellow-400 font-bold text-lg" 
            style={{ margin: '5px 0', color: 'yellow-400' }}
          >
            <span  style={{ margin: '0 5px' }}>
              Total Products: {summary.totalCount.toLocaleString()}
            </span>
             <span  style={{ margin: '0 5px' }}>
              Total Purchased: {summary.totalPurchased.toLocaleString()}
            </span>
             <span  style={{ margin: '0 5px' }}>
              Total Stock: {summary.totalStock.toLocaleString()}
            </span>
             <span  style={{ margin: '0 5px' }}>
              Total Sold: {summary.totalSold.toLocaleString()}
            </span>
             <span  style={{ margin: '0 5px' }}>
              Avg Margin: {summary.avgProfitMargin.toFixed(2)}%
            </span>
            <span  style={{ margin: '0 5px' }}>
              Total Sales: {summary.totalRealSales.toLocaleString()}
            </span>
            <span  style={{ margin: '0 5px' }}>
              Total Purchase Cost: {summary.totalPurchaseCost.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
            <div className="mt-2 text-sm">
              <p>DB 함수가 생성되지 않았을 수 있습니다. 아래 SQL을 실행해주세요.</p>
            </div>
          </div>
        )}
        
        <DataTable
          columns={columns}
          rows={tableRows}
          loading={loading}
          keyField="code"
          defaultSort={{ key: 'soldQty', direction: 'desc' }}
          onRowClick={(row) => {
            setModalCode(row.code);
            setModalOpen(true);
          }}
        />
      </div>

      <Modal
        open={modalOpen}
        title="Product Detail"
        size="content"
        onClose={() => {
          setModalOpen(false);
          setEditMode(false);
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              variant={editMode ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                if (editMode) {
                  setEditMode(false);
                } else {
                  if (!isAdmin) return;
                  setEditMode(true);
                }
              }}
            >
              {editMode ? 'Done Editing' : 'Edit'}
            </Button>
          </div>
        }
      >
        <ProductLookup
          code={modalCode}
          onCodeChange={setModalCode}
          autoEdit={false}
          showEditToggle={false}
          editMode={editMode}
          codeInputReadOnly={true}
          onSaved={() => {
            showToast('Product updated.');
            setModalOpen(false);
            fetchData();
          }}
        />
      </Modal>
    </div>
  );
}
