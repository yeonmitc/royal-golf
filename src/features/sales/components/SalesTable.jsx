// src/features/sales/components/SalesTable.jsx
import { useState } from 'react';
import DataTable from '../../../components/common/DataTable';
import Button from '../../../components/common/Button';
import RefundModal from '../../../components/sales/RefundModal';
import { useToast } from '../../../context/ToastContext';
import codePartsSeed from '../../../db/seed/seed-code-parts.json';

export default function SalesTable({ rows = [], pagination, isLoading = false, isError = false, error = null }) {
  const { showToast } = useToast();
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState(null);

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
    const isRefunded = Boolean(row?.isRefunded) || Boolean(row?.refundedAt);
    const original = Number(row.unitPricePhp || 0);
    const discounted = row.discountUnitPricePhp != null ? Number(row.discountUnitPricePhp) : null;
    const isDiscounted = discounted !== null && discounted !== original;
    const finalUnitRaw = isDiscounted ? discounted : original;
    const finalUnit = isRefunded ? 0 : finalUnitRaw;
    const giftChecked = Boolean(row.freeGift) || finalUnit === 0;
    const priceForCopy = finalUnit.toLocaleString('en-US');
    const { date: soldAtDate, time: soldAtTime } = formatSoldAtParts(row.soldAt);
    const qty = Number(row.qty || 0) || 0;
    const qtyForTotal = isRefunded ? 0 : qty;

    totalQty += qtyForTotal;
    totalPrice += finalUnit * qtyForTotal;

    const brand = brandFromCode(row.code);
    const refundReason = String(row?.refundReason || '').trim();

    return {
      id: `${row.saleId}-${row.code}-${row.sizeDisplay}-${row.qty}-${row.unitPricePhp}`,
      soldAtDate,
      soldAtTime,
      code: row.code,
      color: row.color || '',
      sizeDisplay: row.sizeDisplay,
      qty: qty,
      brand,
      unitPricePhp: (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <span>{finalUnit.toLocaleString('en-US')}</span>
          {isRefunded && refundReason ? (
            <span style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {refundReason}
            </span>
          ) : null}
        </div>
      ),
      refund: (
        <Button
          variant="outline"
          size="sm"
          disabled={isRefunded}
          onClick={(e) => {
            e.stopPropagation();
            if (isRefunded) return;
            setRefundTarget(row);
            setRefundOpen(true);
          }}
        >
          {isRefunded ? 'Refunded' : 'Refund'}
        </Button>
      ),
      style: isRefunded
        ? { backgroundColor: 'rgba(148, 163, 184, 0.18)', color: 'var(--text-main)' }
        : giftChecked
          ? { backgroundColor: 'rgba(239, 68, 68, 0.20)', color: 'var(--text-main)' }
          : undefined,
      __copyText: [
        soldAtDate,
        soldAtTime,
        row.code,
        row.sizeDisplay,
        row.color || '',
        qtyForTotal,
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
    refund: '',
    style: { color: 'var(--gold-soft)', fontWeight: 700 },
  });

  return (
    <>
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
            { key: 'refund', header: 'refund', className: 'text-center', tdClassName: 'text-center' },
          ]}
          rows={tableRows}
          emptyMessage="No results found."
          onRowClick={async (r) => {
            if (r?.clickable === false) return;
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
      <RefundModal
        open={refundOpen}
        saleItem={refundTarget}
        onClose={() => {
          setRefundOpen(false);
          setRefundTarget(null);
        }}
      />
    </>
  );
}
