// src/features/sales/components/SalesTable.jsx
import DataTable from '../../../components/common/DataTable';
import { useToast } from '../../../context/ToastContext';

export default function SalesTable({ rows = [], pagination, isLoading = false, isError = false, error = null }) {
  const { showToast } = useToast();

  function formatSoldAt(iso) {
    const s = String(iso || '').trim();
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading sales history…</div>;
  }

  if (isError) {
    return (
      <div className="p-4 text-sm text-red-600">
        Failed to load sales history: {String(error)}
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No results found.</div>;
  }

  return (
    <div className="p-2 overflow-x-auto">
      <DataTable
        columns={[
          { key: 'soldAt', header: 'Date / Time' },
          { key: 'nameKo', header: 'Name' },
          { key: 'color', header: 'Color' },
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
          { key: 'gift', header: 'Gift', className: 'text-center', tdClassName: 'text-center' },
        ]}
        rows={rows.map((row) => {
          const original = Number(row.unitPricePhp || 0);
          const discounted = row.discountUnitPricePhp != null ? Number(row.discountUnitPricePhp) : null;
          const isDiscounted = discounted !== null && discounted !== original;
          const finalUnit = isDiscounted ? discounted : original;
          const giftChecked = Boolean(row.freeGift) || finalUnit === 0;
          const priceForCopy = finalUnit.toLocaleString('en-US');
          const soldAtText = formatSoldAt(row.soldAt);

          return {
            id: `${row.saleId}-${row.code}-${row.sizeDisplay}-${row.qty}-${row.unitPricePhp}`,
            soldAt: soldAtText,
            nameKo: row.nameKo,
            color: row.color || '',
            sizeDisplay: row.sizeDisplay,
            qty: row.qty,
            unitPricePhp: finalUnit.toLocaleString('en-US'),
            gift: giftChecked ? 'gift' : '',
            __copyText: [
              soldAtText,
              row.nameKo,
              row.color || '',
              row.sizeDisplay,
              row.qty,
              priceForCopy,
              giftChecked ? 'gift' : '',
            ]
              .filter(Boolean)
              .join('\t'),
          };
        })}
        emptyMessage="No results found."
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
    </div>
  );
}
