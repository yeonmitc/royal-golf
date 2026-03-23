import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../components/common/Button';
import { CalendarIcon } from '../components/common/Icons';
import Modal from '../components/common/Modal';
import { useToast } from '../context/ToastContext';
import codePartsSeed from '../db/seed/seed-code-parts.json';
import {
  useBatchUpdateInventoryStatusMutation,
  useDeleteErroStockMutation,
  useProductInventoryList,
  useResetAllInventoryStatusMutation,
  useUpsertErroStockMutation,
} from '../features/products/productHooks';
import { getSalesHistoryFilteredResult } from '../features/sales/salesApiClient';

const BRAND_LABEL_MAP = new Map((codePartsSeed.brand || []).map((b) => [b.code, b.label]));

const SIZE_ORDER = ['S', 'M', 'L', 'XL', '2XL', '3XL', 'Free'];

function toLocalDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyCounts() {
  return Object.fromEntries(SIZE_ORDER.map((k) => [k, 0]));
}

function normSize(raw) {
  const s = String(raw || '').trim();
  const k = s.toLowerCase().replace(/\s+/g, '');
  if (k === 's') return 'S';
  if (k === 'm') return 'M';
  if (k === 'l') return 'L';
  if (k === 'xl') return 'XL';
  if (k === '2xl') return '2XL';
  if (k === '3xl') return '3XL';
  if (k === 'free') return 'Free';
  return s;
}

function sizesToCounts(sizes) {
  const base = Object.fromEntries(SIZE_ORDER.map((k) => [k, 0]));
  (sizes || []).forEach((s) => {
    const k = normSize(s?.sizeDisplay ?? s?.size);
    if (!SIZE_ORDER.includes(k)) return;
    base[k] = Number(s?.stockQty ?? 0) || 0;
  });
  return base;
}

function buildSizeText(counts) {
  const parts = SIZE_ORDER.map((k) => [k, Number(counts?.[k] ?? 0) || 0]).filter(([, v]) => v > 0);
  return parts.map(([k, v]) => `${k}(${v})`).join(', ');
}

function parseMemo(memo) {
  const m = String(memo || '').trim();
  const mNorm = m.toLowerCase();
  const reason =
    mNorm.startsWith('[missing cnt]') || mNorm.startsWith('missing cnt')
      ? 'missing_cnt'
      : mNorm.startsWith('[size error]') || mNorm.startsWith('size error')
        ? 'size_error'
        : mNorm.startsWith('[no data]') || mNorm.startsWith('no data')
          ? 'no_data'
        : 'other';

  const counts = {};
  const re = /\b(2XL|3XL|XL|Free|S|M|L)\((\d+)\)/gi;
  let match;
  while ((match = re.exec(m))) {
    const k = normSize(match[1]);
    const v = Number(match[2] || 0) || 0;
    if (SIZE_ORDER.includes(k)) counts[k] = v;
  }
  return { reason, otherText: reason === 'other' ? m : '', countsFromMemo: counts };
}

const StockCodeCell = ({ item, isError, isSold, setEditingError, setErrorModalOpen, showToast }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <span
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        cursor: 'pointer',
        display: 'inline-block',
        color: isError ? '#f87171' : isHovered ? '#22c55e' : isSold ? 'var(--gold-soft)' : 'inherit',
        fontWeight: isError || isHovered ? 'bold' : 'normal',
        textDecoration: isError && isHovered ? 'underline' : 'none',
        transition: 'color 0.2s, font-weight 0.2s',
      }}
      title={isError ? 'Edit Error' : 'Click to copy'}
      onClick={async (e) => {
        e.stopPropagation(); // Prevent row click if any
        if (isError) {
          setEditingError({ code: item.code, memo: item.error_memo || '', sizes: item.sizes || [] });
          setErrorModalOpen(true);
        } else {
          try {
            await navigator.clipboard.writeText(item.code);
            showToast(`Copied: ${item.code}`, 300);
          } catch (err) {
            console.error('Failed to copy!', err);
          }
        }
      }}
    >
      {item.code}
    </span>
  );
};

export default function CheckStockPage() {
  const { showToast } = useToast();
  const { data: allProducts = [], isLoading } = useProductInventoryList();
  const { mutate: batchUpdateStatus, isPending: isSaving } =
    useBatchUpdateInventoryStatusMutation();
  const { mutate: resetAllStatus, isPending: isResetting } = useResetAllInventoryStatusMutation();
  const { mutate: upsertErroStock, isPending: isUpsertingError } = useUpsertErroStockMutation();
  const { mutate: deleteErroStock, isPending: isDeletingError } = useDeleteErroStockMutation();
  // const { mutate: updateStatus } = useUpdateInventoryStatusMutation();

  // Local state for pending changes: { [code]: 'checked' | 'error' | 'unchecked' }
  const [pendingChanges, setPendingChanges] = useState({});
  const dateInputRef = useRef(null);

  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('Alert');
  const [alertMessage, setAlertMessage] = useState('');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('Confirm');
  const [confirmMessage, setConfirmMessage] = useState('');
  const confirmActionRef = useRef(null);

  const showAlert = useCallback(({ title, message } = {}) => {
    setAlertTitle(title || 'Alert');
    setAlertMessage(String(message || '').trim());
    setAlertOpen(true);
  }, []);

  const requestConfirm = useCallback(({ title, message, onConfirm } = {}) => {
    setConfirmTitle(title || 'Confirm');
    setConfirmMessage(String(message || '').trim());
    confirmActionRef.current = typeof onConfirm === 'function' ? onConfirm : null;
    setConfirmOpen(true);
  }, []);

  // Error Modal State
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [editingError, setEditingError] = useState(null); // { code, memo }
  const [errorReason, setErrorReason] = useState('missing_cnt');
  const [errorSizeCounts, setErrorSizeCounts] = useState({});
  const [errorOtherReason, setErrorOtherReason] = useState('');
  const baseErrorCountsRef = useRef(emptyCounts());

  const hasChanges = Object.keys(pendingChanges).length > 0;

  const handleSaveAll = () => {
    if (!hasChanges) return;
    const n = Object.keys(pendingChanges).length;
    requestConfirm({
      title: 'Save Changes',
      message: `Save ${n} changes?`,
      onConfirm: () => {
        batchUpdateStatus(pendingChanges, {
          onSuccess: () => {
            setPendingChanges({});
            showAlert({ title: 'Saved', message: 'Changes saved successfully.' });
          },
          onError: (err) => {
            console.error(err);
            showAlert({ title: 'Save Failed', message: String(err?.message || 'Failed to save.') });
          },
        });
      },
    });
  };

  const handleResetAll = () => {
    requestConfirm({
      title: 'Reset All',
      message: 'Reset ALL check statuses to Unchecked?',
      onConfirm: () => {
        resetAllStatus(null, {
          onSuccess: () => {
            setPendingChanges({});
            showAlert({ title: 'Reset', message: 'All statuses were reset.' });
          },
          onError: (err) => {
            console.error(err);
            showAlert({
              title: 'Reset Failed',
              message: String(err?.message || 'Failed to reset statuses.'),
            });
          },
        });
      },
    });
  };

  const [selectedType, setSelectedType] = useState(null);
  const [showCheckedOnly, setShowCheckedOnly] = useState(false);
  const [showErrorOnly, setShowErrorOnly] = useState(false);
  const [showUncheckedOnly, setShowUncheckedOnly] = useState(false);

  // Sold Items Check Mode
  const [soldDate, setSoldDate] = useState(() => {
    // Default to yesterday
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalDateKey(d);
  });
  const [soldProductCodes, setSoldProductCodes] = useState(null);
  const [soldOnlyView, setSoldOnlyView] = useState(false);
  const [isLoadingSold, setIsLoadingSold] = useState(false);

  const runSoldCheck = useCallback(async (dateStr, { showOnly = false } = {}) => {
    const dateKey = String(dateStr || soldDate || '').trim();
    if (!dateKey) return;
    setIsLoadingSold(true);
    try {
      // Fetch sales for that date (fromDate = toDate = soldDate)
      const result = await getSalesHistoryFilteredResult({
        fromDate: dateKey,
        toDate: dateKey,
      });

      if (!result.rows || result.rows.length === 0) {
        showAlert({ title: 'Sold Check', message: 'No sales found for the selected date.' });
        setSoldProductCodes(null);
        setSoldOnlyView(false);
        setIsLoadingSold(false);
        return;
      }

      const codes = new Set(result.rows.map((r) => r.code));
      setSoldProductCodes(codes);
      setSoldOnlyView(Boolean(showOnly));

      const allSold = Array.from(codes);
      const soldInStock = new Set(
        allProducts.filter((p) => (p.totalStock || 0) > 0 && codes.has(p.code)).map((p) => p.code)
      );
      const missing = allSold.filter((c) => !soldInStock.has(c));
      if (missing.length) {
        showToast(`Sold codes not in stock list: ${missing.length}`, 900);
      }

      setPendingChanges((prev) => {
        const next = { ...prev };
        allProducts.forEach((p) => {
          if (!codes.has(p.code)) return;
          if ((p.totalStock || 0) <= 0) return;
          const dbStatus = p.check_status ?? 'unchecked';
          const effective = prev[p.code] ?? dbStatus;
          if (effective !== 'checked') return;
          if (dbStatus === 'unchecked') {
            delete next[p.code];
          } else {
            next[p.code] = 'unchecked';
          }
        });
        return next;
      });
    } catch (err) {
      console.error(err);
      showAlert({ title: 'Sold Check Failed', message: 'Failed to fetch sales data.' });
    } finally {
      setIsLoadingSold(false);
    }
  }, [allProducts, showAlert, showToast, soldDate]);

  const handleCheckSoldItems = () => {
    if (!soldDate) return;
    requestConfirm({
      title: 'Sold Check',
      message:
        "This will highlight sold codes in yellow, and reset only the sold codes that are currently CHECKED back to UNCHECKED. Continue?",
      onConfirm: () => runSoldCheck(soldDate, { showOnly: false }),
    });
  };

  const clearSoldFilter = () => {
    setSoldProductCodes(null);
    setSoldOnlyView(false);
    setShowUncheckedOnly(false); // Reset view when filter is cleared
    // Don't reset soldDate, keep last selection
  };

  const handleYesterdayFilter = useCallback(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = toLocalDateKey(d);
    setSelectedType(null);
    setFilterLine(null);
    setFilterGender(null);
    setFilterBrand(null);
    setShowCheckedOnly(false);
    setShowUncheckedOnly(false);
    setShowErrorOnly(false);
    setSoldDate(y);
    runSoldCheck(y, { showOnly: true });
  }, [runSoldCheck]);

  // 1. Filter products that have at least 1 stock OR are in the sold list
  const stockedProducts = useMemo(() => {
    if (soldOnlyView && soldProductCodes) {
      return allProducts.filter((p) => soldProductCodes.has(p.code));
    }
    return allProducts.filter((p) => (p.totalStock || 0) > 0);
  }, [allProducts, soldOnlyView, soldProductCodes]);

  const progress = useMemo(() => {
    const all = allProducts.filter((p) => (p.totalStock || 0) > 0);
    const total = all.length;
    let checked = 0;
    let error = 0;
    all.forEach((p) => {
      const s = pendingChanges[p.code] ?? p.check_status ?? 'unchecked';
      if (s === 'checked') checked += 1;
      else if (s === 'error') error += 1;
    });
    const done = checked + error;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, checked, error, done, pct };
  }, [allProducts, pendingChanges]);

  const yesterdayKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalDateKey(d);
  }, []);

  const yesterdayCheck = useMemo(() => {
    if (!soldProductCodes || soldDate !== yesterdayKey) return null;
    const byCode = new Map(allProducts.map((p) => [p.code, p]));
    let total = 0;
    let remaining = 0;
    soldProductCodes.forEach((code) => {
      const p = byCode.get(code);
      if (!p) return;
      if ((p.totalStock || 0) <= 0) return;
      total += 1;
      const s = pendingChanges[code] ?? p.check_status ?? 'unchecked';
      if (s !== 'checked' && s !== 'error') remaining += 1;
    });
    return { total, remaining, done: total > 0 && remaining === 0 };
  }, [allProducts, pendingChanges, soldDate, soldProductCodes, yesterdayKey]);

  const yesterdayDoneVisual = useMemo(() => {
    if (yesterdayCheck) return yesterdayCheck.done;
    try {
      return localStorage.getItem(`checkstock_yesterday_done_v1:${yesterdayKey}`) === '1';
    } catch {
      return false;
    }
  }, [yesterdayCheck, yesterdayKey]);

  useEffect(() => {
    if (!yesterdayCheck) return;
    try {
      localStorage.setItem(
        `checkstock_yesterday_done_v1:${yesterdayKey}`,
        yesterdayCheck.done ? '1' : '0'
      );
    } catch {
      void 0;
    }
  }, [yesterdayCheck, yesterdayKey]);

  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    let data = null;
    try {
      const raw = localStorage.getItem('__checkstock_autorun_v1');
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    if (!data || !data.at) return;
    if (Date.now() - Number(data.at) > 10 * 60 * 1000) {
      try {
        localStorage.removeItem('__checkstock_autorun_v1');
      } catch {
        void 0;
      }
      return;
    }
    autoRanRef.current = true;
    try {
      localStorage.removeItem('__checkstock_autorun_v1');
    } catch {
      void 0;
    }
    const dateKey = String(data?.date || '').trim();
    if (dateKey) {
      setSelectedType(null);
      setFilterLine(null);
      setFilterGender(null);
      setFilterBrand(null);
      setShowCheckedOnly(false);
      setShowUncheckedOnly(false);
      setShowErrorOnly(false);
      setSoldDate(dateKey);
      runSoldCheck(dateKey, { showOnly: true });
      return;
    }
    handleYesterdayFilter();
  }, [handleYesterdayFilter, runSoldCheck]);

  // Filter states
  const [filterLine, setFilterLine] = useState(null); // 'G' or 'L'
  const [filterGender, setFilterGender] = useState(null); // 'M', 'W', 'A', 'U'
  const [filterBrand, setFilterBrand] = useState(null);

  // Type Mapping
  const TYPE_LABELS = {
    TP: 'Top',
    BT: 'Bottom',
    PC: 'Pouch',
    GB: 'Golf Bag',
    BG: 'Bag',
    BL: 'Belt',
    OT: 'Other',
    UM: 'Umbrella',
    GG: 'Gloves',
    HT: 'Hat',
    WL: 'Wallet',
    DR: 'Dress',
    JH: 'Jewel',
    CV: 'Cover',
    SK: 'Socks',
    MA: 'Mask',
  };

  const getTypeName = (code) => TYPE_LABELS[code] || code;
  const getBrandCode = (product) =>
    product.brandCode || String(product.code || '').split('-')[2] || '';
  const getBrandLabel = (code) => {
    const raw = BRAND_LABEL_MAP.get(code) || code || '';
    const label = String(raw).trim();
    return label === 'NoBrand' ? 'nobrand' : label;
  };

  // 2. Filter by Line/Gender first
  const baseFilteredProducts = useMemo(() => {
    return stockedProducts.filter((p) => {
      const parts = (p.code || '').split('-');
      const prefix = parts[0] || '';

      // Line Filter (1st char)
      if (filterLine && prefix[0] !== filterLine) return false;

      // Gender Filter (2nd char)
      if (filterGender && prefix[1] !== filterGender) return false;

      return true;
    });
  }, [stockedProducts, filterLine, filterGender]);

  const productTypes = useMemo(() => {
    const types = new Set();
    baseFilteredProducts.forEach((p) => {
      const parts = (p.code || '').split('-');
      if (parts.length >= 2) {
        const typeCode = parts[1];
        if (typeCode !== 'GC') {
          types.add(typeCode);
        }
      }
    });
    return Array.from(types).sort();
  }, [baseFilteredProducts]);

  const typeFilteredProducts = useMemo(() => {
    if (!selectedType) return [];
    return baseFilteredProducts.filter((p) => {
      const parts = (p.code || '').split('-');
      return parts[1] === selectedType;
    });
  }, [baseFilteredProducts, selectedType]);

  const productBrands = useMemo(() => {
    if (!selectedType) return [];
    const brands = new Set();
    typeFilteredProducts.forEach((p) => {
      const brandCode = getBrandCode(p);
      if (brandCode) {
        brands.add(brandCode);
      }
    });
    return Array.from(brands).sort();
  }, [typeFilteredProducts, selectedType]);

  const brandFilteredProducts = useMemo(() => {
    if (!selectedType) return [];
    if (!filterBrand) return typeFilteredProducts;
    return typeFilteredProducts.filter((p) => getBrandCode(p) === filterBrand);
  }, [typeFilteredProducts, selectedType, filterBrand]);

  // 4. Filter by checked/error status (if enabled)
  const finalRows = useMemo(() => {
    let base;

    // Helper to get effective status (pending > db)
    const getStatus = (p) => pendingChanges[p.code] ?? p.check_status ?? 'unchecked';

    if (soldOnlyView && soldProductCodes) {
      base = stockedProducts;
    } else if (showCheckedOnly) {
      base = brandFilteredProducts.filter((p) => getStatus(p) === 'checked');
    } else if (showErrorOnly) {
      base = brandFilteredProducts.filter((p) => getStatus(p) === 'error');
    } else if (showUncheckedOnly) {
      base = brandFilteredProducts.filter((p) => {
        const s = getStatus(p);
        return !s || s === 'unchecked';
      });
    } else {
      base = brandFilteredProducts;
    }

    return base.map((p) => ({
      ...p,
      check_status: getStatus(p), // Override for UI
      type: (p.code || '').split('-')[1],
    }));
  }, [
    stockedProducts,
    brandFilteredProducts,
    soldOnlyView,
    soldProductCodes,
    showCheckedOnly,
    showErrorOnly,
    showUncheckedOnly,
    pendingChanges, // Re-calc when local changes happen
  ]);

  const toggleCheck = (code, currentStatus) => {
    const next = currentStatus === 'checked' ? 'unchecked' : 'checked';
    setPendingChanges((prev) => ({ ...prev, [code]: next }));
  };

  const toggleError = (product) => {
    const code = product.code;
    const memoToEdit = String(product.error_memo || '').trim();
    setEditingError({ code, memo: memoToEdit, sizes: product.sizes || [] });
    setErrorModalOpen(true);
  };

  const handleSaveErrorMemo = () => {
    if (!editingError) {
      console.warn('No editingError state found');
      return;
    }

    // Optimistic update: Close modal and update local state immediately
    const targetCode = editingError.code;
    const finalMemo =
      errorReason === 'other'
        ? String(errorOtherReason || '').trim()
        : errorReason === 'no_data'
          ? '[No Data]'
          : String(
              `${errorReason === 'missing_cnt' ? '[Missing Cnt]' : '[Size Error]'} ${buildSizeText(errorSizeCounts)}`
            ).trim();
    setPendingChanges((prev) => ({ ...prev, [targetCode]: 'error' }));
    setErrorModalOpen(false);
    setEditingError(null);

    // Fire and forget (but handle errors quietly or via toast if needed)
    upsertErroStock({ code: targetCode, memo: finalMemo }, {
      onError: (err) => {
        console.error('Save failed:', err);
        // We might want to alert the user or revert the state here
        showAlert({
          title: 'Save Failed',
          message: `Failed to save error memo for ${targetCode}: ${String(err?.message || '')}`,
        });
      },
    });
  };

  const handleDeleteError = () => {
    if (!editingError) return;

    // Optimistic update
    const targetCode = editingError.code;
    setPendingChanges((prev) => ({ ...prev, [targetCode]: 'unchecked' }));
    setErrorModalOpen(false);
    setEditingError(null);

    // Fire and forget
    deleteErroStock(targetCode, {
      onError: (err) => {
        console.error(err);
        showAlert({
          title: 'Delete Failed',
          message: `Failed to delete error for ${targetCode}: ${String(err?.message || '')}`,
        });
      },
    });
  };

  const handleDownloadTsv = () => {
    if (finalRows.length === 0) {
      showAlert({ title: 'Export', message: 'No data to download.' });
      return;
    }

    const header = ['Code', 'Sizes', 'Checked', 'Error'];
    const rows = finalRows.map((item) => {
      const isChecked = item.check_status === 'checked' ? 'Y' : '';
      const isError = item.check_status === 'error' ? 'Y' : '';
      const availableSizes = (item.sizes || [])
        .filter((s) => s.stockQty > 0)
        .map((s) => `${s.size}(${s.stockQty})`)
        .join(', ');

      return [item.code, availableSizes, isChecked, isError].join('\t');
    });

    const content = [header.join('\t'), ...rows].join('\n');
    const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `stock_check_${new Date().toISOString().slice(0, 10)}.tsv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const textareaRef = useRef(null);
  const firstSizeRef = useRef(null);

  // Focus textarea when error modal opens
  useEffect(() => {
    if (errorModalOpen && editingError) {
      // Small timeout to override Modal's default focus behavior
      const timer = setTimeout(() => {
        if (errorReason === 'other') textareaRef.current?.focus();
        else firstSizeRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [errorModalOpen, editingError, errorReason]);

  useEffect(() => {
    if (!errorModalOpen || !editingError) return;
    const baseCounts = sizesToCounts(editingError?.sizes || []);
    const parsed = parseMemo(editingError?.memo || '');
    const merged = { ...baseCounts, ...(parsed.countsFromMemo || {}) };
    baseErrorCountsRef.current = merged;
    setErrorSizeCounts(parsed.reason === 'no_data' ? emptyCounts() : merged);
    setErrorReason(parsed.reason);
    setErrorOtherReason(parsed.otherText);
  }, [errorModalOpen, editingError]);

  if (isLoading) return <div className="p-4">Loading stock data...</div>;

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div
        className="flex flex-col gap-2 sticky top-0 bg-[var(--bg-main)] z-10 p-2 shadow-sm -mx-2"
        style={{
          backgroundColor: yesterdayDoneVisual ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.14)',
        }}
      >
        {/* Sold Items Check Control */}
        <div className="flex items-center w-full px-1">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              border: '1px solid var(--gold)',
              borderRadius: '999px',
              overflow: 'hidden',
              height: 28,
              backgroundColor: 'rgba(20, 20, 32, 0.4)',
              width: '100%',
            }}
          >
            <div
              onClick={() => dateInputRef.current?.showPicker()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 6,
                height: '100%',
                cursor: 'pointer',
                color: 'white',
                fontSize: 12,
                gap: 4,
                position: 'relative', // Add relative positioning for child absolute
              }}
            >
              <span>{soldDate}</span>
              <CalendarIcon size={12} color="#9ca3af" />
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  width: 0,
                  height: 0,
                  overflow: 'visible',
                }}
              >
                <input
                  ref={dateInputRef}
                  type="date"
                  value={soldDate}
                  onChange={(e) => setSoldDate(e.target.value)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0, // Starts at center
                    transform: 'translateX(-50%)', // Center the input element itself
                    opacity: 0,
                    pointerEvents: 'none',
                    width: '1px', // Give it non-zero size
                    height: '1px',
                    border: 'none',
                    margin: 0,
                    padding: 0,
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleCheckSoldItems}
              disabled={!soldDate || isLoadingSold}
              style={{
                height: '100%',
                border: 'none',
                backgroundColor: '#2563eb', // Blue background
                color: 'white',
                fontSize: 11,
                fontWeight: 'bold',
                padding: '0 4px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderLeft: '1px solid var(--gold)',
                flex: soldProductCodes ? 2.5 : 4, // Adjust based on Reset button presence
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {isLoadingSold ? '...' : 'Sold Check'}
            </button>
            {soldProductCodes && (
              <>
                <button
                  type="button"
                  onClick={handleYesterdayFilter}
                  disabled={isLoadingSold}
                  style={{
                    height: '100%',
                    border: 'none',
                    backgroundColor: 'rgba(212,175,55,0.95)',
                    color: '#000',
                    fontSize: 11,
                    fontWeight: 900,
                    padding: '0 6px',
                    cursor: 'pointer',
                    borderLeft: '1px solid var(--gold)',
                    flex: 2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={clearSoldFilter}
                  style={{
                    height: '100%',
                    border: 'none',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 900,
                    padding: '0 4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderLeft: '1px solid var(--gold)',
                    flex: 1.5,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  Reset ({soldProductCodes.size})
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ width: '100%', padding: '0 6px', marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>
              Progress: {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
              {progress.error ? ` (Err ${progress.error.toLocaleString()})` : ''}
            </span>
            <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>{progress.pct}%</span>
          </div>
          <div
            style={{
              marginTop: 6,
              height: 11,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress.pct}%`,
                background: 'linear-gradient(90deg, var(--gold) 0%, #22c55e 100%)',
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full">
          <Button
            variant={showCheckedOnly ? 'primary' : 'outline'}
            size="compact"
            className="flex-1 font-medium border-yellow-400 text-yellow-400 hover:bg-yellow-400/10 text-[11px]"
            style={{ marginTop: '6px' }}
            onClick={() => {
              setShowCheckedOnly(!showCheckedOnly);
              setShowErrorOnly(false);
              setShowUncheckedOnly(false);
            }}
          >
            Checked
          </Button>
          <Button
            variant={showUncheckedOnly ? 'primary' : 'outline'}
            size="compact"
            className="flex-1 font-medium border-yellow-400 text-yellow-400 hover:bg-yellow-400/10 text-[11px]"
            style={{ marginTop: '6px' }}
            onClick={() => {
              setShowUncheckedOnly(!showUncheckedOnly);
              setShowCheckedOnly(false);
              setShowErrorOnly(false);
            }}
          >
            Unchecked
          </Button>
          <Button
            variant={showErrorOnly ? 'primary' : 'outline'}
            size="compact"
            className="flex-1 font-medium border-yellow-400 text-yellow-400 hover:bg-yellow-400/10 text-[11px]"
            style={{ marginTop: '6px' }}
            onClick={() => {
              setShowErrorOnly(!showErrorOnly);
              setShowCheckedOnly(false);
              setShowUncheckedOnly(false);
            }}
          >
            Err
          </Button>
        </div>

        <div className="flex gap-2 w-full">
          <Button
            variant="success"
            size="compact"
            className="flex-1 font-medium bg-green-600 border-green-600 text-green-600 hover:bg-green-600/10 text-[11px]"
            style={{ marginTop: '6px' }}
            onClick={handleDownloadTsv}
          >
            Download
          </Button>
          <Button
            variant="outline"
            size="compact"
            className="flex-1 font-medium border-yellow-400 text-yellow-400 hover:bg-yellow-400/10 text-[11px]"
            style={{ marginTop: '6px' }}
            onClick={handleSaveAll}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? 'Saving...' : `Save Checks (${Object.keys(pendingChanges).length})`}
          </Button>
          <Button
            variant="danger"
            size="compact"
            className="flex-1 font-medium border-red-500 text-red-500 hover:bg-red-500/10 text-[11px]"
            style={{ marginTop: '6px' }}
            onClick={handleResetAll}
            disabled={isResetting}
          >
            {isResetting ? 'Resetting...' : 'Reset All Checks'}
          </Button>
        </div>
        <hr className="border-t-2 border-[var(--gold)]" />
        <div className="flex flex-col gap-2 border-b pb-2">
          <div className="flex gap-2 flex-wrap">
            {['G', 'L'].map((line) => (
              <Button
                key={line}
                onClick={() => setFilterLine(filterLine === line ? null : line)}
                variant={filterLine === line ? 'primary' : 'outline'}
                size="compact"
                className="text-[11px]"
                style={{ marginTop: '6px' }}
              >
                {line === 'G' ? 'Golf' : 'Luxury'}
              </Button>
            ))}

            {[
              { code: 'M', label: 'Man' },
              { code: 'W', label: 'Woman' },
              { code: 'A', label: 'Acc' },
            ].map(({ code, label }) => (
              <Button
                key={code}
                onClick={() => setFilterGender(filterGender === code ? null : code)}
                variant={filterGender === code ? 'primary' : 'outline'}
                size="compact"
                className="text-[11px]"
                style={{ marginTop: '6px' }}
              >
                {label}
              </Button>
            ))}
          </div>
          <hr className="border-t-2 border-[var(--gold)]" />
          <div
            className="flex gap-2 overflow-x-auto pb-1 no-scrollbar pt-1"
            style={{ flexWrap: 'nowrap' }}
          >
            {productTypes.map((t) => (
              <Button
                key={t}
                onClick={() => {
                  setSelectedType(selectedType === t ? null : t);
                  setFilterBrand(null);
                  setShowCheckedOnly(false);
                  setShowErrorOnly(false);
                  setShowUncheckedOnly(false);
                }}
                variant={
                  selectedType === t && !showCheckedOnly && !showUncheckedOnly && !showErrorOnly
                    ? 'primary'
                    : 'outline'
                }
                size="compact"
                className="whitespace-nowrap flex-shrink-0 text-[11px]"
                style={{ marginTop: '6px' }}
              >
                {getTypeName(t)}
              </Button>
            ))}
          </div>

          <hr className="border-t-2 border-[var(--gold)]" />

          {selectedType && productBrands.length > 0 && (
            <div
              className="flex gap-2 overflow-x-auto pb-1 no-scrollbar pt-1"
              style={{ flexWrap: 'nowrap' }}
            >
              {productBrands.map((b) => (
                <Button
                  key={b}
                  onClick={() => {
                    const next = filterBrand === b ? null : b;
                    setFilterBrand(next);
                    setShowCheckedOnly(false);
                    setShowErrorOnly(false);
                    setShowUncheckedOnly(false);
                  }}
                  variant={filterBrand === b ? 'primary' : 'outline'}
                  size="compact"
                  className="whitespace-nowrap flex-shrink-0 text-[11px]"
                  style={{ marginTop: '6px' }}
                >
                  {getBrandLabel(b)}
                </Button>
              ))}
            </div>
          )}

          <hr className="border-t-2 border-[var(--gold)]" />
        </div>
      </div>

      {finalRows.length === 0 && !soldOnlyView && !selectedType && !showCheckedOnly ? (
        <div className="text-center text-gray-500 mt-10">
          Select a type to begin checking stock.
        </div>
      ) : (
        <div className="stock-check-table-wrapper">
          {/* Total Count Display */}
          <div className="flex justify-end mb-2 px-2 text-[var(--gold)] text-lg font-extrabold">
            Total: {finalRows.length.toLocaleString()} codes /{' '}
            {finalRows
              .reduce((sum, item) => sum + (Number(item.totalStock) || 0), 0)
              .toLocaleString()}{' '}
            qty
          </div>
          <table className="stock-check-table text-xs">
            <thead>
              <tr className="text-[10px] text-gray-400 border-b border-[var(--gold)]">
                <th className="text-left font-normal border-r border-white/20 pr-2 whitespace-nowrap">
                  Code
                </th>
                <th className="text-left font-normal pl-2 w-full">Size</th>
                <th className="text-right font-normal w-16">Chk / Err</th>
              </tr>
            </thead>
            <tbody>
              {finalRows.map((item) => {
                const isChecked = item.check_status === 'checked';
                const isError = item.check_status === 'error';
                const isSold = soldProductCodes ? soldProductCodes.has(item.code) : false;
                const availableSizes = (item.sizes || [])
                  .filter((s) => s.stockQty > 0)
                  .map((s) => `${s.size}(${s.stockQty})`)
                  .join(', ');

                return (
                  <tr key={item.code} className={isChecked ? 'bg-[rgba(34,197,94,0.10)]' : ''}>
                    <td className="font-mono text-[11px] pr-2 pl-2 align-top border-l border-r border-white/20 whitespace-nowrap">
                      <StockCodeCell
                        item={item}
                        isError={isError}
                        isSold={isSold}
                        setEditingError={setEditingError}
                        setErrorModalOpen={setErrorModalOpen}
                        showToast={showToast}
                      />
                    </td>
                    <td className="text-[11px] text-gray-300 dark:text-gray-400 align-top pl-2">
                      {availableSizes || 'No Stock'}
                    </td>
                    <td className="align-top min-w-[80px]">
                      <div className="flex justify-between gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          icon="check"
                          iconSize={12}
                          onClick={() => toggleCheck(item.code, item.check_status)}
                          className="icon-only flex-shrink-0"
                          style={{
                            width: 26,
                            height: 26,
                            ...(isChecked
                              ? {
                                  background: '#22c55e',
                                  borderColor: '#16a34a',
                                  color: '#ffffff',
                                  boxShadow: '0 0 10px rgba(34,197,94,0.6)',
                                }
                              : {}),
                          }}
                        />
                        <Button
                          variant={isError ? 'danger' : 'outline'}
                          size="sm"
                          icon="x"
                          iconSize={12}
                          onClick={() => toggleError(item)}
                          className="icon-only flex-shrink-0"
                          style={{
                            width: 26,
                            height: 26,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Error Memo Modal */}
      <Modal
        open={errorModalOpen && !!editingError}
        title="Report Error"
        onClose={() => {
          setErrorModalOpen(false);
          setEditingError(null);
        }}
        size="content"
        containerStyle={{
          width: 'min(100% - 20px, 500px)',
        }}
        footer={
          <div className="flex justify-between items-center w-full gap-4" style={{ width: '100%' }}>
            <Button
              variant="danger"
              onClick={handleDeleteError}
              className="px-4 h-10 shadow-md"
              title="Remove error status"
              disabled={isDeletingError}
            >
              {isDeletingError ? 'Deleting...' : 'Delete'}
            </Button>

            <Button
              variant="outline"
              className="h-10 px-4 border-[var(--border-soft)] hover:bg-[var(--bg-card)]"
              onClick={() => {
                setErrorModalOpen(false);
                setEditingError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="solid"
              className="!bg-blue-600 !border-blue-600 !text-white hover:!bg-blue-700 font-bold h-10 px-6 shadow-lg shadow-blue-900/30"
              onClick={handleSaveErrorMemo}
              disabled={isUpsertingError}
            >
              {isUpsertingError ? 'Saving...' : 'Save'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 min-w-[300px]">
          <div className="text-sm text-gray-400">
            Code:{' '}
            <span
              className="font-mono text-[var(--gold)]"
              style={{ cursor: 'pointer' }}
              title="Click to copy"
              onClick={async () => {
                const codeToCopy = editingError?.code;
                if (!codeToCopy) return;
                try {
                  await navigator.clipboard.writeText(codeToCopy);
                  showToast(`Copied: ${codeToCopy}`, 300);
                } catch (err) {
                  console.error('Failed to copy!', err);
                }
              }}
            >
              {editingError?.code}
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', overflowX: 'auto' }}>
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-300 whitespace-nowrap">
                  <input
                    type="radio"
                    name="error_reason"
                    value="missing_cnt"
                    checked={errorReason === 'missing_cnt'}
                    onChange={() => {
                      setErrorReason('missing_cnt');
                      setErrorOtherReason('');
                      setErrorSizeCounts(baseErrorCountsRef.current || emptyCounts());
                    }}
                  />
                  Missing cnt
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-300 whitespace-nowrap">
                  <input
                    type="radio"
                    name="error_reason"
                    value="size_error"
                    checked={errorReason === 'size_error'}
                    onChange={() => {
                      setErrorReason('size_error');
                      setErrorOtherReason('');
                      setErrorSizeCounts(baseErrorCountsRef.current || emptyCounts());
                    }}
                  />
                  Size error
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-300 whitespace-nowrap">
                  <input
                    type="radio"
                    name="error_reason"
                    value="other"
                    checked={errorReason === 'other'}
                    onChange={() => {
                      setErrorReason('other');
                      setErrorOtherReason('');
                      setErrorSizeCounts(emptyCounts());
                    }}
                  />
                  Other reason
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-300 whitespace-nowrap">
                  <input
                    type="radio"
                    name="error_reason"
                    value="no_data"
                    checked={errorReason === 'no_data'}
                    onChange={() => {
                      setErrorReason('no_data');
                      setErrorOtherReason('');
                      setErrorSizeCounts(emptyCounts());
                    }}
                  />
                  No data
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                {SIZE_ORDER.map((k, idx) => (
                  <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 52 }}>
                    <div className="text-[11px] text-gray-400 text-center">{k}</div>
                    <input
                      ref={idx === 0 ? firstSizeRef : undefined}
                      type="number"
                      min={0}
                      value={errorSizeCounts?.[k] ?? 0}
                      onChange={(e) => {
                        const v = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value) || 0);
                        setErrorSizeCounts((p) => ({ ...(p || {}), [k]: v }));
                      }}
                      className="bg-[#0f0f15] border border-[var(--border-soft)] rounded px-2 py-2 text-sm text-white text-center focus:ring-1 focus:ring-red-500 focus:border-red-500"
                      style={{ width: 52 }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-300 mb-1">Error Memo</label>
              <textarea
                ref={textareaRef}
                className="w-full bg-[#0f0f15] border border-[var(--border-soft)] rounded p-2 text-sm text-white h-24 focus:ring-1 focus:ring-red-500 focus:border-red-500 placeholder-gray-600"
                value={
                  errorReason === 'other'
                    ? errorOtherReason
                    : errorReason === 'no_data'
                      ? '[No Data]'
                      : String(
                          `${errorReason === 'missing_cnt' ? '[Missing Cnt]' : '[Size Error]'} ${buildSizeText(errorSizeCounts)}`
                        ).trim()
                }
                readOnly={errorReason !== 'other'}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                onKeyUp={(e) => {
                  e.stopPropagation();
                }}
                onChange={(e) => setErrorOtherReason(e.target.value)}
                placeholder={errorReason === 'other' ? 'Enter other reason...' : ''}
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={confirmTitle}
        size="content"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                const fn = confirmActionRef.current;
                setConfirmOpen(false);
                confirmActionRef.current = null;
                if (typeof fn === 'function') {
                  await fn();
                }
              }}
            >
              OK
            </Button>
          </div>
        }
      >
        <div style={{ width: 'min(520px, 90vw)', whiteSpace: 'pre-line', fontWeight: 700 }}>
          {confirmMessage}
        </div>
      </Modal>

      <Modal
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        title={alertTitle}
        size="content"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="primary" size="sm" onClick={() => setAlertOpen(false)}>
              OK
            </Button>
          </div>
        }
      >
        <div style={{ width: 'min(520px, 90vw)', whiteSpace: 'pre-line', fontWeight: 700 }}>
          {alertMessage}
        </div>
      </Modal>
    </div>
  );
}
