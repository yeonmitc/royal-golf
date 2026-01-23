// src/features/products/components/ProductScanResult.jsx
import { useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import DataTable from '../../../components/common/DataTable';
import codePartsSeed from '../../../db/seed/seed-code-parts.json';
import { useCartStore } from '../../../store/cartStore';
import { useProductWithInventory } from '../productHooks';

/**
 * 바코드 스캔 결과 영역
 *
 * props:
 * - code: 스캔된 제품코드
 */
export default function ProductScanResult({ code }) {
  const { data, isLoading, isError, error } = useProductWithInventory(code);
  const addItem = useCartStore((s) => s.addItem);
  const [localStocks, setLocalStocks] = useState({});

  useEffect(() => {
    const bySize = new Map((data?.inventory || []).map((r) => [r.size || 'Free', r]));
    const standard = ['S', 'M', 'L', 'XL', '2XL', '3XL', 'Free'];
    const init = {};
    standard.forEach((sz) => {
      const r = bySize.get(sz);
      init[sz] = Number(r?.stockQty ?? 0) || 0;
    });
    setLocalStocks(init);
  }, [data?.code, data?.inventory]);

  if (!code) {
    return (
      <div className="p-3 text-xs text-gray-500">Scan a barcode to see product info here.</div>
    );
  }

  if (isLoading) {
    return <div className="p-3 text-xs text-gray-500">Fetching {code}…</div>;
  }

  if (isError) {
    return <div className="p-3 text-xs text-red-600">Product fetch failed: {String(error)}</div>;
  }

  if (!data) {
    return <div className="p-3 text-xs text-red-600">Product not found for code: {code}</div>;
  }

  const findLabel = (group, c) => {
    const arr = codePartsSeed[group] || [];
    return (arr.find((i) => i.code === (c || ''))?.label || '').trim();
  };
  const serial =
    data.modelNo ||
    String(data.code || '')
      .split('-')
      .pop();
  const derivedName = [
    findLabel('category', data.categoryCode),
    findLabel('type', data.typeCode),
    findLabel('brand', data.brandCode),
    findLabel('color', data.colorCode),
    serial,
  ]
    .filter(Boolean)
    .join(' - ');

  const defaultColor = findLabel('color', data.colorCode);

  const handleAddToCart = (sizeRow) => {
    const sizeKey = sizeRow.size;
    const remaining = Number(localStocks[sizeKey] ?? sizeRow.stockQty ?? 0) || 0;
    if (remaining <= 0) return;
    addItem({
      code: data.code,
      size: sizeRow.size,
      sizeDisplay: sizeRow.sizeDisplay,
      nameKo: data.nameKo || derivedName,
      color: defaultColor,
      unitPricePhp: data.salePricePhp,
      qty: 1,
    });
    setLocalStocks((prev) => ({
      ...prev,
      [sizeKey]: Math.max(0, (Number(prev[sizeKey] ?? sizeRow.stockQty ?? 0) || 0) - 1),
    }));
  };

  return (
    <div className="p-3 border rounded-md bg-white text-xs space-y-2">
      <div style={{ marginBottom: 12 }}>
        <DataTable
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'code', header: 'Code' },
            { key: 'price', header: 'Price', className: 'text-right', tdClassName: 'text-right' },
            {
              key: 'stock',
              header: 'Total Stock',
              className: 'text-right',
              tdClassName: 'text-right',
            },
          ]}
          rows={[
            {
              id: data.code,
              name: data.nameKo || derivedName || data.code,
              code: data.code,
              price: (
                <span style={{ color: 'var(--gold-soft)', fontWeight: 600 }}>
                  {(data.salePricePhp || 0).toLocaleString('en-PH')} PHP
                </span>
              ),
              stock: data.totalStock ?? 0,
            },
          ]}
        />
      </div>

      <div className="border-t pt-2">
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--gold-soft)',
            marginBottom: 6,
          }}
        >
          Size Inventory
        </div>
        {(() => {
          const standard = ['S', 'M', 'L', 'XL', '2XL', '3XL', 'Free'];
          const bySize = new Map((data.inventory || []).map((r) => [r.size || 'Free', r]));
          const rowsAll = standard.map((sz) => {
            const r = bySize.get(sz);
            return r ? r : { code: data.code, size: sz, sizeDisplay: sz, stockQty: 0 };
          });
          const rows = rowsAll.filter((r) => (r.stockQty ?? 0) > 0);
          return (
            <DataTable
              columns={[
                { key: 'size', header: 'Size' },
                {
                  key: 'stock',
                  header: 'Stock',
                  className: 'text-right',
                  tdClassName: 'text-right',
                },
                {
                  key: 'action',
                  header: 'Add',
                  className: 'text-center',
                  tdClassName: 'text-center',
                },
              ]}
              rows={rows.map((row) => ({
                id: `${row.code}-${row.size}`,
                size: row.sizeDisplay || row.size || '-',
                stock: Number(localStocks[row.size] ?? row.stockQty ?? 0) || 0,
                action: (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!((Number(localStocks[row.size] ?? row.stockQty ?? 0) || 0) > 0)}
                    onClick={() => handleAddToCart(row)}
                  >
                    + Add
                  </Button>
                ),
              }))}
              emptyMessage="No inventory."
            />
          );
        })()}
      </div>
    </div>
  );
}
