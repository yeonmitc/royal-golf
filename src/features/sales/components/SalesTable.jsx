// src/features/sales/components/SalesTable.jsx
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../components/common/Button';
import DataTable from '../../../components/common/DataTable';
import Modal from '../../../components/common/Modal';
import ColorChangeModal from '../../../components/sales/ColorChangeModal';
import PriceEditModal from '../../../components/sales/PriceEditModal';
import ReceiptModal from '../../../components/sales/ReceiptModal';
import RefundModal from '../../../components/sales/RefundModal';
import { useToast } from '../../../context/ToastContext';
import codePartsSeed from '../../../db/seed/seed-code-parts.json';
import { useAdminStore } from '../../../store/adminStore';
import { formatRentalName, getRentalMetaForRow, RENTAL_CODE } from '../../../utils/rentalMeta';
import { getGuides } from '../../guides/guideApi';
import {
  useSetSaleGroupGuideMutation,
  useSetSaleTimeMutation,
  useUpdateSaleItemColorMutation,
} from '../salesHooks';

export default function SalesTable({
  rows = [],
  pagination,
  isLoading = false,
  isError = false,
  error = null,
}) {
  const { showToast } = useToast();
  const isAdmin = useAdminStore((s) => s.isAuthorized());
  const openLoginModal = useAdminStore((s) => s.openLoginModal);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideTargetGroup, setGuideTargetGroup] = useState(null);
  const [guideTargetSaleId, setGuideTargetSaleId] = useState(null);
  const [guideTargetCode, setGuideTargetCode] = useState('');
  const [selectedGuide, setSelectedGuide] = useState('');
  const [guideOnlyThisItem, setGuideOnlyThisItem] = useState(false);
  const [priceEditOpen, setPriceEditOpen] = useState(false);
  const [priceEditTarget, setPriceEditTarget] = useState(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeTarget, setTimeTarget] = useState(null);
  const [timeDate, setTimeDate] = useState('');
  const [timeClock, setTimeClock] = useState('');
  const [timeError, setTimeError] = useState('');
  const [colorEditOpen, setColorEditOpen] = useState(false);
  const [colorEditTarget, setColorEditTarget] = useState(null);
  const [rentalContactOpen, setRentalContactOpen] = useState(false);
  const [rentalContact, setRentalContact] = useState(null);
  const { data: guides = [] } = useQuery({ queryKey: ['guides', 'active'], queryFn: getGuides });
  const { mutateAsync: setGroupGuide, isPending: settingGuide } = useSetSaleGroupGuideMutation();
  const { mutateAsync: updateColor } = useUpdateSaleItemColorMutation();
  const { mutateAsync: setSaleTime, isPending: savingTime } = useSetSaleTimeMutation();
  const autoEllaTriedRef = useRef(new Set());
  const autoEllaRunningRef = useRef(false);

  function isEllaPriorityCode(code) {
    const normalized = String(code || '')
      .trim()
      .toUpperCase();
    if (!normalized) return false;
    if (normalized.startsWith('SU-KR')) return true;
    return normalized.split('-').includes('EA');
  }

  async function copyTextToClipboard(text) {
    const v = String(text || '').trim();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = v;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

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

  const visibleRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

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
  const ellaGuideId = (() => {
    const hit = (guides || []).find((g) =>
      String(g.name || '')
        .toLowerCase()
        .includes('ella')
    );
    return hit ? String(hit.id) : '';
  })();

  const peterGuideIds = new Set(
    (guides || [])
      .filter((g) =>
        String(g.name || '')
          .toLowerCase()
          .replace(/[\s.]/g, '')
          .includes('peter')
      )
      .map((g) => String(g.id))
  );

  const guideNameById = new Map(
    (guides || []).map((g) => [String(g.id), String(g.name || '').trim()])
  );

  useEffect(() => {
    if (!isAdmin || !ellaGuideId || autoEllaRunningRef.current) return;
    const candidate = visibleRows.find((row) => {
      const saleId = String(row?.saleId || '').trim();
      return (
        saleId &&
        !autoEllaTriedRef.current.has(saleId) &&
        isEllaPriorityCode(row?.code) &&
        !row?.guideId &&
        !row?.isRefunded &&
        !row?.refundedAt &&
        row?.saleGroupId
      );
    });
    if (!candidate) return;

    const saleId = String(candidate.saleId);
    autoEllaTriedRef.current.add(saleId);
    autoEllaRunningRef.current = true;

    setGroupGuide({
      saleGroupId: candidate.saleGroupId,
      saleId: candidate.saleId,
      guideId: ellaGuideId,
      guideRate: 0.1,
      scope: 'item',
    })
      .catch((e) => {
        console.error(e);
        showToast('Ella 우선 품목 자동 저장에 실패했습니다.');
      })
      .finally(() => {
        autoEllaRunningRef.current = false;
      });
  }, [ellaGuideId, isAdmin, setGroupGuide, showToast, visibleRows]);

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading sales history…</div>;
  }

  if (isError) {
    return (
      <div className="p-4 text-sm text-red-600">Failed to load sales history: {String(error)}</div>
    );
  }

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
      const isMrMoon = row.guideId != null && mrMoonGuideIds.has(String(row.guideId));
      const isPeter = row.guideId != null && peterGuideIds.has(String(row.guideId));
      const isElla = row.guideId != null && ellaGuideIds.has(String(row.guideId));
      const commissionForTotal = isRefunded || isMrMoon || isElla || isPeter ? 0 : commission;
      const lineTotalForTotal = finalUnit * qtyForTotal;

      return {
        totalQty: acc.totalQty + qtyForTotal,
        totalPrice: acc.totalPrice + lineTotalForTotal,
        totalCommission: acc.totalCommission + commissionForTotal,
      };
    },
    { totalQty: 0, totalPrice: 0, totalCommission: 0 }
  );

  async function handleTimeSubmit() {
    if (!timeTarget) return;
    const d = String(timeDate || '').trim();
    const t = String(timeClock || '').trim();
    if (!d || !t) {
      setTimeError('날짜와 시간을 모두 입력하세요.');
      return;
    }
    setTimeError('');
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(d);
    const timeOk = /^\d{2}:\d{2}$/.test(t);
    if (!dateOk || !timeOk) {
      setTimeError('유효한 날짜/시간을 입력하세요.');
      return;
    }
    const iso = `${d}T${t}:00`;
    try {
      await setSaleTime({
        saleGroupId: timeTarget.saleGroupId || null,
        saleId: timeTarget.saleId,
        soldAt: iso,
      });
      setTimeOpen(false);
      setTimeTarget(null);
      setTimeDate('');
      setTimeClock('');
      showToast('판매 시간이 수정되었습니다.');
    } catch (e) {
      console.error(e);
      setTimeError('시간 수정에 실패했습니다.');
    }
  }

  const rentalSeqMap = new Map();
  const tableRows = visibleRows.map((row, index) => {
    const isRefunded = Boolean(row?.isRefunded) || Boolean(row?.refundedAt);
    const original = Number(row.unitPricePhp || 0);
    const discounted = row.discountUnitPricePhp != null ? Number(row.discountUnitPricePhp) : null;
    const isDiscounted = discounted !== null && discounted !== original;
    const finalUnitRaw = isDiscounted ? discounted : original;
    const finalUnit = isRefunded ? 0 : finalUnitRaw;
    const giftChecked = Boolean(row.freeGift) || finalUnit === 0;
    const isMrMoon = row.guideId != null && mrMoonGuideIds.has(String(row.guideId));
    const isElla = row.guideId != null && ellaGuideIds.has(String(row.guideId));
    const isPeter = row.guideId != null && peterGuideIds.has(String(row.guideId));
    const guideName = row.guideId != null ? guideNameById.get(String(row.guideId)) : '';
    const isRental = row.code === RENTAL_CODE;
    const { date: soldAtDate, time: soldAtTime } = formatSoldAtParts(row.soldAt);
    const qty = Number(row.qty || 0) || 0;
    const qtyForDisplay = isRefunded ? 0 : qty;
    const lineTotalDisplay = finalUnit * qtyForDisplay;
    const qtyForTotal = isRefunded || isElla ? 0 : qty;
    const priceForCopy = lineTotalDisplay.toLocaleString('en-US');

    const brand = brandFromCode(row.code);
    let rentalIndex = 0;
    if (isRental) {
      const k = `${soldAtDate}|${soldAtTime}`;
      const prev = rentalSeqMap.get(k) || 0;
      rentalIndex = prev;
      rentalSeqMap.set(k, prev + 1);
    }
    const rentalMeta = isRental ? getRentalMetaForRow(row, { timeIndex: rentalIndex }) : null;
    const rentalName = rentalMeta ? formatRentalName(rentalMeta) : '';
    const rentalNo = rentalMeta ? String(rentalMeta.rentalNo || '').trim() : '';
    const refundReason = String(row?.refundReason || '').trim();
    const isManualPriceLike = row.guideId == null && isDiscounted && !giftChecked && !isRefunded;

    return {
      id: `${row.saleId}-${row.code}-${row.sizeDisplay}-${row.qty}-${row.unitPricePhp}`,
      saleId: row.saleId,
      no: index + 1,
      saleGroupId: row.saleGroupId,
      soldAt: row.soldAt,
      guideId: row.guideId,
      soldAtDate,
      soldAtTime,
      code: row.code,
      color:
        (row.color || '').trim() === 'Mix' &&
        row.code !== 'GA-OT-EX-MX-02' &&
        !String(row.code || '').startsWith('SU') ? (
          <span style={{ color: 'red', fontWeight: 'bold' }}>{row.color}</span>
        ) : (
          row.color || ''
        ),
      sizeDisplay: row.sizeDisplay,
      qty: qty,
      brand:
        isRental && (rentalName || rentalNo) ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              maxWidth: 220,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {rentalNo ? (
              <span style={{ color: 'var(--gold-soft)', fontWeight: 900, flex: '0 0 auto' }}>
                #{rentalNo}
              </span>
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!rentalMeta) return;
                setRentalContact({
                  name: rentalName,
                  contact: String(rentalMeta.customerContact || '').trim(),
                });
                setRentalContactOpen(true);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                color: 'var(--gold-soft)',
                fontWeight: 800,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: '1 1 auto',
                display: 'inline-block',
                transformOrigin: 'left center',
                transition: 'transform 120ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title={rentalName || ''}
            >
              {rentalName || 'Customer'}
            </button>
          </div>
        ) : (
          brand
        ),
      commission: giftChecked ? 'gift' : isElla ? '-' : guideName || '-',
      unitPricePhp: (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            alignItems: 'center',
            height: '100%',
            padding: '8px',
          }}
        >
          <span>{lineTotalDisplay.toLocaleString('en-US')}</span>
          {isRefunded && refundReason ? (
            <span
              style={{
                color: 'var(--text-muted)',
                fontSize: 12,
                maxWidth: 220,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
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
            style={{
              width: '28px',
              height: '28px',
              padding: 0,
              borderRadius: '50%',
              minWidth: '28px',
              flex: '0 0 28px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              const groupItems = row.saleGroupId
                ? visibleRows.filter((r) => r.saleGroupId === row.saleGroupId)
                : visibleRows.filter((r) => r.soldAt === row.soldAt && r.guideId === row.guideId);

              const items = groupItems.map((r) => {
                const rIsRefunded = Boolean(r?.isRefunded) || Boolean(r?.refundedAt);
                const rOriginal = Number(r.unitPricePhp || 0);
                const rDiscounted =
                  r.discountUnitPricePhp != null ? Number(r.discountUnitPricePhp) : null;
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
            style={{
              width: '28px',
              height: '28px',
              padding: 0,
              borderRadius: '50%',
              minWidth: '28px',
              flex: '0 0 28px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (isRefunded) return;
              setRefundTarget(row);
              setRefundOpen(true);
            }}
          />
          <Button
            variant="outline"
            icon="palette"
            title="Change Color"
            disabled={isRefunded}
            style={{
              width: '28px',
              height: '28px',
              padding: 0,
              borderRadius: '50%',
              minWidth: '28px',
              flex: '0 0 28px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              setColorEditTarget(row);
              setColorEditOpen(true);
            }}
          />
          <Button
            variant="outline"
            icon="clock"
            title="Edit time"
            disabled={isRefunded}
            style={{
              width: '28px',
              height: '28px',
              padding: 0,
              borderRadius: '50%',
              minWidth: '28px',
              flex: '0 0 28px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              const s = String(row.soldAt || '').trim();
              const dateHit = s.match(/\d{4}-\d{2}-\d{2}/);
              const timeHit = s.match(/(\d{2}):(\d{2})/);
              setTimeDate(dateHit ? dateHit[0] : '');
              setTimeClock(timeHit ? timeHit[0] : '');
              setTimeTarget(row);
              setTimeError('');
              setTimeOpen(true);
            }}
          />
          <Button
            variant="outline"
            icon="person"
            title="Guide commission"
            disabled={isRefunded || !row.saleGroupId}
            style={{
              width: '28px',
              height: '28px',
              padding: 0,
              borderRadius: '50%',
              minWidth: '28px',
              flex: '0 0 28px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!row.saleGroupId) return;
              if (!isAdmin) {
                openLoginModal();
                showToast('Admin required.');
                return;
              }
              setGuideTargetGroup(row.saleGroupId);
              setGuideTargetSaleId(row.saleId || null);
              setGuideTargetCode(String(row.code || ''));
              setSelectedGuide(
                row.guideId != null
                  ? String(row.guideId)
                  : isEllaPriorityCode(row.code) && ellaGuideId
                    ? ellaGuideId
                    : ''
              );
              setGuideOnlyThisItem(isEllaPriorityCode(row.code));
              setGuideOpen(true);
            }}
          />
          <Button
            variant="outline"
            icon="settings"
            title="Edit Price"
            disabled={isRefunded}
            style={{
              width: '28px',
              height: '28px',
              padding: 0,
              borderRadius: '50%',
              minWidth: '28px',
              flex: '0 0 28px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!isAdmin) {
                openLoginModal();
                return;
              }
              setPriceEditTarget(row);
              setPriceEditOpen(true);
            }}
          />
        </div>
      ),
      style: isRefunded
        ? { backgroundColor: 'rgba(239, 68, 68, 0.30)', color: 'var(--text-main)' }
        : giftChecked
          ? { backgroundColor: 'rgba(239, 68, 68, 0.10)', color: 'var(--text-main)' }
          : isMrMoon
            ? { backgroundColor: 'rgba(253, 239, 183, 0.18)', color: 'var(--text-main)' }
            : isElla
              ? { backgroundColor: 'rgba(255, 182, 193, 0.2)', color: 'var(--text-main)' }
              : isRental
                ? { backgroundColor: 'rgba(255, 165, 0, 0.2)', color: 'var(--text-main)' }
                : row.guideId
                  ? isPeter
                    ? { backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--text-main)' }
                    : { backgroundColor: 'rgba(34, 197, 94, 0.10)', color: 'var(--text-main)' }
                  : isManualPriceLike
                    ? { backgroundColor: 'rgba(139, 92, 246, 0.18)', color: 'var(--text-main)' }
                    : undefined,
      __copyText: [
        soldAtDate ? `\u200B${soldAtDate}` : '',
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
    no: '',
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
      <div
        className="sales-table-container"
        style={{ maxHeight: '70vh', overflowY: 'auto', overflowX: 'auto' }}
      >
        <DataTable
          columns={[
            { key: 'no', header: 'no', className: 'text-center', tdClassName: 'text-center' },
            {
              key: 'soldAtDate',
              header: 'date',
              className: 'text-center sales-col-date',
              tdClassName: 'text-center sales-col-date',
            },
            {
              key: 'soldAtTime',
              header: 'time',
              className: 'text-center sales-col-time',
              tdClassName: 'text-center sales-col-time',
            },
            { key: 'code', header: 'code', className: 'text-center', tdClassName: 'text-center' },
            {
              key: 'sizeDisplay',
              header: 'size',
              className: 'text-center sales-col-size',
              tdClassName: 'text-center sales-col-size',
            },
            {
              key: 'color',
              header: 'color',
              className: 'text-center sales-col-color',
              tdClassName: 'text-center sales-col-color',
            },
            { key: 'qty', header: 'qty', className: 'text-center', tdClassName: 'text-center' },
            {
              key: 'brand',
              header: 'brand',
              className: 'text-center sales-col-brand',
              tdClassName: 'text-center sales-col-brand',
            },
            {
              key: 'unitPricePhp',
              header: 'price',
              className: 'text-center sales-col-price',
              tdClassName: 'text-center sales-col-price',
            },
            {
              key: 'commission',
              header: 'comm.',
              className: 'text-center text-xs sales-col-commission',
              tdClassName: 'text-center text-xs text-muted sales-col-commission',
            },
            {
              key: 'action',
              header: 'actions',
              className: 'text-center sales-col-actions',
              tdClassName: 'text-center sales-col-actions',
            },
          ]}
          rows={tableRows}
          emptyMessage="No results found."
          onRowClick={async (r) => {
            if (r?.clickable === false) return;
            const text = String(r?.__copyText || '').trim();
            if (!text) return;
            await copyTextToClipboard(text);
            showToast('Copied.');
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
      <Modal
        open={rentalContactOpen}
        onClose={() => {
          setRentalContactOpen(false);
          setRentalContact(null);
        }}
        title="Rental Info"
        size="content"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="primary" size="sm" onClick={() => setRentalContactOpen(false)}>
              OK
            </Button>
          </div>
        }
      >
        <div style={{ width: 'min(520px, 90vw)', display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 900 }}>{String(rentalContact?.name || '').trim() || '-'}</div>
          <div style={{ color: 'var(--text-muted)', fontWeight: 700 }}>
            {String(rentalContact?.contact || '').trim() || '-'}
          </div>
        </div>
      </Modal>
      <Modal
        open={timeOpen}
        onClose={() => {
          setTimeOpen(false);
          setTimeTarget(null);
          setTimeDate('');
          setTimeClock('');
          setTimeError('');
        }}
        title="Edit Sold Time"
        size="content"
        footer={
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <Button
              variant="outline"
              onClick={() => {
                setTimeOpen(false);
                setTimeTarget(null);
                setTimeDate('');
                setTimeClock('');
                setTimeError('');
              }}
              style={{ width: 100 }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleTimeSubmit}
              disabled={savingTime}
              style={{ width: 120 }}
            >
              {savingTime ? 'Saving...' : 'Save'}
            </Button>
          </div>
        }
      >
        {timeTarget && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 13 }}>
              Code {timeTarget.code} · Size {timeTarget.sizeDisplay} · Qty {timeTarget.qty}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Date</div>
                <input
                  type="date"
                  className="input-field date-control-input"
                  value={timeDate}
                  readOnly
                  disabled
                />
              </div>
              <div>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Time</div>
                <input
                  type="time"
                  className="input-field date-control-input"
                  value={timeClock}
                  onChange={(e) => setTimeClock(e.target.value)}
                />
              </div>
            </div>
            {timeError ? (
              <div style={{ color: 'var(--error-main)', fontSize: 12 }}>{timeError}</div>
            ) : null}
          </div>
        )}
      </Modal>
      <PriceEditModal
        open={priceEditOpen}
        saleItem={priceEditTarget}
        onClose={() => {
          setPriceEditOpen(false);
          setPriceEditTarget(null);
        }}
      />
      <Modal
        open={guideOpen}
        onClose={() => {
          setGuideOpen(false);
          setGuideTargetGroup(null);
          setGuideTargetSaleId(null);
          setGuideTargetCode('');
          setSelectedGuide('');
          setGuideOnlyThisItem(false);
        }}
        title="Assign Guide (10% Commission)"
        size="content"
        footer={
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <Button
              variant="outline"
              onClick={() => {
                setGuideOpen(false);
                setGuideTargetGroup(null);
                setGuideTargetSaleId(null);
                setGuideTargetCode('');
                setSelectedGuide('');
                setGuideOnlyThisItem(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!guideTargetGroup) return;
                if (!isAdmin) {
                  openLoginModal();
                  showToast('Admin required.');
                  return;
                }
                try {
                  await setGroupGuide({
                    saleGroupId: guideTargetGroup,
                    saleId: guideTargetSaleId,
                    guideId: selectedGuide || null,
                    guideRate: 0.1,
                    scope: guideOnlyThisItem ? 'item' : 'group',
                  });
                  setGuideOpen(false);
                  setGuideTargetGroup(null);
                  setGuideTargetSaleId(null);
                  setGuideTargetCode('');
                  setSelectedGuide('');
                  setGuideOnlyThisItem(false);
                  showToast(
                    guideOnlyThisItem
                      ? 'Guide updated for this item only.'
                      : 'Guide commission applied.'
                  );
                } catch (e) {
                  const msg = String(e?.message || e);
                  if (msg === 'ADMIN_REQUIRED') {
                    openLoginModal();
                    showToast('Admin required.');
                    return;
                  }
                  showToast(msg || 'Failed to set guide.');
                }
              }}
              disabled={settingGuide}
            >
              {settingGuide ? 'Saving...' : 'Apply'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 12 }}>
          {guideTargetCode ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Code {guideTargetCode}</div>
          ) : null}
          <label className="input-label">Guide</label>
          <select
            className="w-full rounded-full border border-[#32324a] bg-[#141420] px-3 py-1.5 text-sm text-[var(--text-main)] pr-8 focus:outline-none focus:border-[var(--gold-soft)] focus:ring-1 focus:ring-[var(--gold-soft)]"
            value={selectedGuide}
            onChange={(e) => setSelectedGuide(e.target.value)}
          >
            <option value="">No Guide</option>
            {(guides || []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <label
            style={{
              display: 'block',
              width: 'fit-content',
              margin: '0 auto',
              padding: '4px 0 2px',
              color: 'var(--text-main)',
              cursor: guideTargetSaleId ? 'pointer' : 'not-allowed',
              opacity: guideTargetSaleId ? 1 : 0.6,
              textAlign: 'center',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <input
                type="checkbox"
                checked={guideOnlyThisItem}
                onChange={(e) => setGuideOnlyThisItem(e.target.checked)}
                disabled={!guideTargetSaleId}
                style={{ width: 16, height: 16, accentColor: 'var(--gold-soft)', margin: 0 }}
              />
              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                Only this item
              </span>
            </span>
          </label>
        </div>
      </Modal>
      <ColorChangeModal
        isOpen={colorEditOpen}
        onClose={() => {
          setColorEditOpen(false);
          setColorEditTarget(null);
        }}
        saleItem={colorEditTarget}
        onSave={async (newColor) => {
          if (!colorEditTarget) return;
          try {
            await updateColor({
              saleId: colorEditTarget.saleId,
              code: colorEditTarget.code,
              size: colorEditTarget.size,
              color: newColor,
            });
            showToast('Color updated.');
          } catch (e) {
            console.error(e);
            showToast('Failed to update color.');
          }
        }}
      />
    </>
  );
}
