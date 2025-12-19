// src/features/sales/components/SalesTable.jsx
import { useState } from 'react';
import DataTable from '../../../components/common/DataTable';
import Button from '../../../components/common/Button';
import RefundModal from '../../../components/sales/RefundModal';
import { useToast } from '../../../context/ToastContext';

export default function SalesTable({ rows = [], pagination, isLoading = false, isError = false, error = null }) {
  const [refundOpen, setRefundOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const { showToast } = useToast();

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">판매 내역을 불러오는 중…</div>;
  }

  if (isError) {
    return (
      <div className="p-4 text-sm text-red-600">
        판매 내역을 불러오지 못했습니다: {String(error)}
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className="p-4 text-sm text-gray-500">검색 결과 없습니다.</div>;
  }

  return (
    <div className="p-2 overflow-x-auto">
      <DataTable
        columns={[
          { key: 'soldAt', header: 'Date / Time' },
          { key: 'code', header: 'Code' },
          { key: 'nameKo', header: 'Name' },
          {
            key: 'sizeDisplay',
            header: 'Size',
            className: 'text-center',
            tdClassName: 'text-center',
          },
          { key: 'qty', header: 'Qty', className: 'text-right', tdClassName: 'text-right' },
          {
            key: 'unitPricePhp',
            header: 'Price (PHP)',
            className: 'text-right',
            tdClassName: 'text-right',
          },
          { key: 'action', header: 'Action' },
        ]}
        rows={rows.map((row) => {
          const dt = row.soldAt ? new Date(row.soldAt) : null;
          const dateStr = dt
            ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
                dt.getDate()
              ).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(
                dt.getMinutes()
              ).padStart(2, '0')}`
            : '';

          const original = Number(row.unitPricePhp || 0);
          const discounted = row.discountUnitPricePhp != null ? Number(row.discountUnitPricePhp) : null;
          const isDiscounted = discounted !== null && discounted !== original;
          const priceForCopy = isDiscounted ? discounted.toLocaleString('en-US') : original.toLocaleString('en-US');

          return {
            id: `${row.saleId}-${row.code}-${row.sizeDisplay}-${row.qty}-${row.unitPricePhp}`,
            soldAt: dateStr,
            code: row.code,
            nameKo: row.nameKo,
            sizeDisplay: row.sizeDisplay,
            qty: row.qty,
            unitPricePhp: isDiscounted ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
                <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: '0.75rem' }}>
                  {original.toLocaleString('en-US')}
                </span>
                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                  {discounted.toLocaleString('en-US')}
                </span>
              </div>
            ) : (
              original.toLocaleString('en-US')
            ),
            __copyText: [dateStr, row.code, row.nameKo, row.sizeDisplay, row.qty, priceForCopy].join('\t'),
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(row);
                  setRefundOpen(true);
                }}
              >
                Refund
              </Button>
            ),
          };
        })}
        emptyMessage="검색 결과 없습니다."
        onRowClick={async (r) => {
          const text = String(r.__copyText || '');
          if (!text) return;
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          showToast('Row copied.');
        }}
        pagination={pagination}
      />
      {refundOpen && (
        <RefundModal
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
          saleItem={selected}
        />
      )}
    </div>
  );
}
