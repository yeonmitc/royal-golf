// src/features/sales/components/SalesTable.jsx
import DataTable from '../../../components/common/DataTable';
import { useToast } from '../../../context/ToastContext';
import codePartsSeed from '../../../db/seed/seed-code-parts.json';

export default function SalesTable({ rows = [], pagination, isLoading = false, isError = false, error = null }) {
  const { showToast } = useToast();

  function brandFromCode(code) {
    const parts = String(code || '').split('-');
    const brandCode = String(parts[2] || '').trim();
    if (!brandCode) return '';
    const arr = codePartsSeed.brand || [];
    const hit = arr.find((i) => i.code === brandCode);
    const label = String(hit?.label || brandCode).trim();
    return label === 'NoBrand' ? 'nobrand' : label;
  }

  function formatSoldAtParts(iso) {
    const s = String(iso || '').trim();
    if (!s) return { date: '', time: '' };
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return { date: s, time: '' };
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dow = days[d.getDay()] || '';
    return { date: `${mm}-${dd} ${dow}`, time: `${hh}:${mi}` };
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

  let totalQty = 0;
  let totalPrice = 0;
  const tableRows = rows.map((row) => {
    const original = Number(row.unitPricePhp || 0);
    const discounted = row.discountUnitPricePhp != null ? Number(row.discountUnitPricePhp) : null;
    const isDiscounted = discounted !== null && discounted !== original;
    const finalUnit = isDiscounted ? discounted : original;
    const giftChecked = Boolean(row.freeGift) || finalUnit === 0;
    const priceForCopy = finalUnit.toLocaleString('en-US');
    const { date: soldAtDate, time: soldAtTime } = formatSoldAtParts(row.soldAt);
    const qty = Number(row.qty || 0) || 0;

    totalQty += qty;
    totalPrice += finalUnit * qty;

    const brand = brandFromCode(row.code);

    return {
      id: `${row.saleId}-${row.code}-${row.sizeDisplay}-${row.qty}-${row.unitPricePhp}`,
      soldAtDate,
      soldAtTime,
      code: row.code,
      color: row.color || '',
      sizeDisplay: row.sizeDisplay,
      qty: qty,
      brand,
      unitPricePhp: finalUnit.toLocaleString('en-US'),
      style: giftChecked ? { backgroundColor: 'rgba(239, 68, 68, 0.20)', color: 'var(--text-main)' } : undefined,
      __copyText: [
        soldAtDate,
        soldAtTime,
        row.code,
        row.sizeDisplay,
        row.color || '',
        qty,
        brand,
        priceForCopy,
      ]
        .filter(Boolean)
        .join('\t'),
    };
  });

  tableRows.push({
    id: '__sales_total__',
    clickable: false,
    soldAtDate: 'TOTAL',
    soldAtTime: '',
    code: '',
    color: '',
    sizeDisplay: '',
    brand: '',
    qty: totalQty.toLocaleString('en-US'),
    unitPricePhp: totalPrice.toLocaleString('en-US'),
    style: { color: 'var(--gold-soft)', fontWeight: 700 },
  });

  return (
    <div className="p-2" style={{ maxHeight: '70vh', overflowY: 'auto', overflowX: 'auto' }}>
      <DataTable
        columns={[
          { key: 'soldAtDate', header: 'date' },
          { key: 'soldAtTime', header: 'time', className: 'text-center', tdClassName: 'text-center' },
          { key: 'code', header: 'code' },
          {
            key: 'sizeDisplay',
            header: 'size',
            className: 'text-center',
            tdClassName: 'text-center',
          },
          { key: 'color', header: 'color' },
          { key: 'qty', header: 'qty', className: 'text-right', tdClassName: 'text-right' },
          { key: 'brand', header: 'brand' },
          {
            key: 'unitPricePhp',
            header: 'price',
            className: 'text-right',
            tdClassName: 'text-right',
          },
        ]}
        rows={tableRows}
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
