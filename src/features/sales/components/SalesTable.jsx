// src/features/sales/components/SalesTable.jsx
import { useState } from 'react';
import DataTable from '../../../components/common/DataTable';
import Button from '../../../components/common/Button';
import RefundModal from '../../../components/sales/RefundModal';
import ReceiptModal from '../../../components/sales/ReceiptModal';
import { useToast } from '../../../context/ToastContext';
import codePartsSeed from '../../../db/seed/seed-code-parts.json';

export default function SalesTable({ rows = [], pagination, isLoading = false, isError = false, error = null }) {
  const { showToast } = useToast();
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

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
    const dateHit = s.match(/\d{4}-\d{2}-\d{2}/);
    const timeHit = s.match(/[T\s](\d{2}:\d{2})/);
    const date = dateHit ? dateHit[0] : '';
    const time = timeHit ? timeHit[1] : '';
    if (!date) return { date: s, time: '' };

    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dow = days[dt.getUTCDay()] || '';
    const mm = String(m || '').padStart(2, '0');
    const dd = String(d || '').padStart(2, '0');
    return { date: `${mm}-${dd} ${dow}`.trim(), time };
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

  const visibleRows = (rows || []).filter((r) => !r?.isRefunded && !r?.refundedAt);

  if (visibleRows.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No results found.</div>;
  }

  const { totalQty, totalPrice, totalCommission } = visibleRows.reduce(
    (acc, row) => {
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

      return {
        totalQty: acc.totalQty + qtyForTotal,
        totalPrice: acc.totalPrice + finalUnit * qtyForTotal,
        totalCommission: acc.totalCommission + commissionForTotal,
      };
    },
    { totalQty: 0, totalPrice: 0, totalCommission: 0 }
  );

  const tableRows = visibleRows.map((row) => {
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
    const commission = Number(row.commission || 0);
    const commissionForTotal = isRefunded ? 0 : commission;

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
      commission: commissionForTotal > 0 ? commissionForTotal.toLocaleString('en-US') : '-',
      unitPricePhp: (
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'center', paddingRight: '12px' }}>
          <span>{finalUnit.toLocaleString('en-US')}</span>
          {isRefunded && refundReason ? (
            <span style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {refundReason}
            </span>
          ) : null}
        </div>
      ),
      action: (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <Button
            variant="outline"
            icon="receipt"
            title="Receipt"
            disabled={isRefunded}
            style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', minWidth: '28px', flex: '0 0 28px' }}
            onClick={(e) => {
              e.stopPropagation();
              const groupItems = row.saleGroupId
                ? visibleRows.filter((r) => r.saleGroupId === row.saleGroupId)
                : visibleRows.filter((r) => r.soldAt === row.soldAt && r.guideId === row.guideId);

              const items = groupItems.map((r) => {
                const rIsRefunded = Boolean(r?.isRefunded) || Boolean(r?.refundedAt);
                const rOriginal = Number(r.unitPricePhp || 0);
                const rDiscounted = r.discountUnitPricePhp != null ? Number(r.discountUnitPricePhp) : null;
                const rIsDiscounted = rDiscounted !== null && rDiscounted !== rOriginal;
                const rFinalRaw = rIsDiscounted ? rDiscounted : rOriginal;
                const rFinal = rIsRefunded ? 0 : rFinalRaw;
                return {
                  code: r.code,
                  name: r.nameKo || r.name,
                  color: r.color,
                  size: r.sizeDisplay,
                  qty: Number(r.qty || 0),
                  price: rFinal,
                };
              });
              
              const totalAmt = items.reduce((sum, i) => sum + i.price * i.qty, 0);
              const totalQ = items.reduce((sum, i) => sum + i.qty, 0);

              setReceiptData({
                id: row.saleGroupId || row.saleId.toString(),
                soldAt: row.soldAt,
                items,
                totalAmount: totalAmt,
                totalQty: totalQ,
                guideId: row.guideId,
              });
              setReceiptOpen(true);
            }}
          />
          <Button
            variant="outline"
            icon="refund"
            title={isRefunded ? 'Refunded' : 'Refund'}
            disabled={isRefunded}
            style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', minWidth: '28px', flex: '0 0 28px' }}
            onClick={(e) => {
              e.stopPropagation();
              if (isRefunded) return;
              setRefundTarget(row);
              setRefundOpen(true);
            }}
          />
        </div>
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
    commission: totalCommission > 0 ? totalCommission.toLocaleString('en-US') : '-',
    unitPricePhp: totalPrice.toLocaleString('en-US'),
    action: '',
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
              className: 'text-left',
              tdClassName: 'text-left',
            },
            {
              key: 'commission',
              header: 'comm.',
              className: 'text-right text-xs',
              tdClassName: 'text-right text-xs text-muted',
            },
            { key: 'action', header: 'receipt / refund', className: 'text-center', tdClassName: 'text-center' },
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
      <ReceiptModal
        open={receiptOpen}
        receiptData={receiptData}
        onClose={() => {
          setReceiptOpen(false);
          setReceiptData(null);
        }}
      />
    </>
  );
}
