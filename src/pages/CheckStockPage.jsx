import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import codePartsSeed from '../db/seed/seed-code-parts.json';
import {
  useBatchUpdateInventoryStatusMutation,
  // useUpdateInventoryStatusMutation,
  useDeleteErroStockMutation,
  useProductInventoryList,
  useResetAllInventoryStatusMutation,
  useUpsertErroStockMutation,
} from '../features/products/productHooks';

const BRAND_LABEL_MAP = new Map((codePartsSeed.brand || []).map((b) => [b.code, b.label]));

export default function CheckStockPage() {
  const { data: allProducts = [], isLoading } = useProductInventoryList();
  const { mutate: batchUpdateStatus, isPending: isSaving } =
    useBatchUpdateInventoryStatusMutation();
  const { mutate: resetAllStatus, isPending: isResetting } = useResetAllInventoryStatusMutation();
  const { mutate: upsertErroStock, isPending: isUpsertingError } = useUpsertErroStockMutation();
  const { mutate: deleteErroStock, isPending: isDeletingError } = useDeleteErroStockMutation();
  // const { mutate: updateStatus } = useUpdateInventoryStatusMutation();

  // Local state for pending changes: { [code]: 'checked' | 'error' | 'unchecked' }
  const [pendingChanges, setPendingChanges] = useState({});

  // Error Modal State
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [editingError, setEditingError] = useState(null); // { code, memo }

  const hasChanges = Object.keys(pendingChanges).length > 0;

  const handleSaveAll = () => {
    if (!hasChanges) return;
    if (!window.confirm(`Save ${Object.keys(pendingChanges).length} changes?`)) return;

    batchUpdateStatus(pendingChanges, {
      onSuccess: () => {
        setPendingChanges({});
        alert('Saved successfully!');
      },
      onError: (err) => {
        console.error(err);
        alert(`Failed to save: ${err.message}`);
      },
    });
  };

  const handleResetAll = () => {
    if (!window.confirm('Are you sure you want to reset ALL check statuses to Unchecked?')) {
      return;
    }
    resetAllStatus(null, {
      onSuccess: () => {
        setPendingChanges({}); // Clear local changes too
      },
      onError: (err) => {
        console.error(err);
        alert(`Failed to reset statuses: ${err.message}`);
      },
    });
  };

  const [selectedType, setSelectedType] = useState(null);
  const [showCheckedOnly, setShowCheckedOnly] = useState(false);
  const [showErrorOnly, setShowErrorOnly] = useState(false);
  const [showUncheckedOnly, setShowUncheckedOnly] = useState(false);

  // 1. Filter products that have at least 1 stock
  const stockedProducts = useMemo(() => {
    return allProducts.filter((p) => (p.totalStock || 0) > 0);
  }, [allProducts]);

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

  const productBrands = useMemo(() => {
    const brands = new Set();
    baseFilteredProducts.forEach((p) => {
      const brandCode = getBrandCode(p);
      if (brandCode) {
        brands.add(brandCode);
      }
    });
    return Array.from(brands).sort();
  }, [baseFilteredProducts]);

  const brandFilteredProducts = useMemo(() => {
    if (!filterBrand) return baseFilteredProducts;
    return baseFilteredProducts.filter((p) => getBrandCode(p) === filterBrand);
  }, [baseFilteredProducts, filterBrand]);

  // 3. Extract unique types from BASE filtered products (so buttons update based on context)
  // OR should we show ALL types always? User asked to filter "g, l...".
  // If I pick "Man", I probably only want to see Man types.
  const productTypes = useMemo(() => {
    const types = new Set();
    brandFilteredProducts.forEach((p) => {
      const parts = (p.code || '').split('-');
      if (parts.length >= 2) {
        const typeCode = parts[1];
        if (typeCode !== 'GC') {
          types.add(typeCode);
        }
      }
    });
    return Array.from(types).sort();
  }, [brandFilteredProducts]);

  // 4. Filter by selected type
  const typeFilteredProducts = useMemo(() => {
    if (!selectedType) return [];
    return brandFilteredProducts.filter((p) => {
      const parts = (p.code || '').split('-');
      return parts[1] === selectedType;
    });
  }, [brandFilteredProducts, selectedType]);

  // 4. Filter by checked/error status (if enabled)
  const finalRows = useMemo(() => {
    let base;

    // Helper to get effective status (pending > db)
    const getStatus = (p) => pendingChanges[p.code] ?? p.check_status ?? 'unchecked';

    if (showCheckedOnly) {
      base = brandFilteredProducts.filter((p) => getStatus(p) === 'checked');
    } else if (showErrorOnly) {
      base = brandFilteredProducts.filter((p) => getStatus(p) === 'error');
    } else if (showUncheckedOnly) {
      base = brandFilteredProducts.filter((p) => {
        const s = getStatus(p);
        return !s || s === 'unchecked';
      });
    } else {
      base = typeFilteredProducts;
    }

    return base.map((p) => ({
      ...p,
      check_status: getStatus(p), // Override for UI
      type: (p.code || '').split('-')[1],
    }));
  }, [
    typeFilteredProducts,
    brandFilteredProducts,
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
    const currentStatus = pendingChanges[code] ?? product.check_status ?? 'unchecked';

    // Always open modal to allow Edit/Delete
    let memoToEdit = product.error_memo || '';
    if (currentStatus !== 'error' && !memoToEdit) {
      // Generate default memo from sizes for new errors
      memoToEdit = (product.sizes || []).map((s) => `${s.sizeDisplay}(${s.stockQty})`).join(', ');
    }

    setEditingError({ code, memo: memoToEdit });
    setErrorModalOpen(true);
  };

  const handleSaveErrorMemo = () => {
    if (!editingError) {
      console.warn('No editingError state found');
      return;
    }

    // Optimistic update: Close modal and update local state immediately
    const targetCode = editingError.code;
    setPendingChanges((prev) => ({ ...prev, [targetCode]: 'error' }));
    setErrorModalOpen(false);
    setEditingError(null);

    // Fire and forget (but handle errors quietly or via toast if needed)
    upsertErroStock(editingError, {
      onError: (err) => {
        console.error('Save failed:', err);
        // We might want to alert the user or revert the state here
        alert(`Failed to save error memo for ${targetCode}: ${err.message}`);
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
        alert(`Failed to delete error for ${targetCode}: ${err.message}`);
      },
    });
  };

  const handleDownloadTsv = () => {
    if (finalRows.length === 0) {
      alert('No data to download.');
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

  // Focus textarea when error modal opens
  useEffect(() => {
    if (errorModalOpen && editingError) {
      // Small timeout to override Modal's default focus behavior
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [errorModalOpen, editingError]);

  if (isLoading) return <div className="p-4">Loading stock data...</div>;

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex flex-col gap-2 sticky top-0 bg-[var(--bg-main)] z-10 p-2 shadow-sm -mx-2">
        <div className="flex flex-wrap items-center gap-2 w-full">
          <Button
            variant={showCheckedOnly ? 'primary' : 'outline'}
            size="compact"
            className="flex-1 font-medium border-yellow-400 text-yellow-400 hover:bg-yellow-400/10 text-[11px]"
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
            onClick={handleDownloadTsv}
          >
            Download
          </Button>
          <Button
            variant="outline"
            size="compact"
            className="flex-1 font-medium border-yellow-400 text-yellow-400 hover:bg-yellow-400/10 text-[11px]"
            onClick={handleSaveAll}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? 'Saving...' : `Save Checks (${Object.keys(pendingChanges).length})`}
          </Button>
          <Button
            variant="danger"
            size="compact"
            className="flex-1 font-medium border-red-500 text-red-500 hover:bg-red-500/10 text-[11px]"
            onClick={handleResetAll}
            disabled={isResetting}
          >
            {isResetting ? 'Resetting...' : 'Reset All Checks'}
          </Button>
        </div>
        <hr className="border-t-2 border-[var(--gold)]" />
        <div className="flex flex-col gap-2 border-b pb-2">
          <div className="flex gap-1 flex-wrap">
            {['G', 'L'].map((line) => (
              <Button
                key={line}
                onClick={() => setFilterLine(filterLine === line ? null : line)}
                variant={filterLine === line ? 'primary' : 'outline'}
                size="compact"
                className="text-[11px]"
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
              >
                {label}
              </Button>
            ))}
          </div>
          <hr className="border-t-2 border-[var(--gold)]" />
          {productBrands.length > 0 && (
            <div
              className="flex gap-1 overflow-x-auto pb-1 no-scrollbar pt-1"
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
                >
                  {getBrandLabel(b)}
                </Button>
              ))}
            </div>
          )}

          <hr className="border-t-2 border-[var(--gold)]" />
        </div>

        <div
          className="flex gap-1 overflow-x-auto pb-1 no-scrollbar pt-1"
          style={{ flexWrap: 'nowrap' }}
        >
          {productTypes.map((t) => (
            <Button
              key={t}
              onClick={() => {
                setSelectedType(selectedType === t ? null : t); // Toggle functionality
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
            >
              {getTypeName(t)}
            </Button>
          ))}
        </div>

        <hr className="border-t-2 border-[var(--gold)] mt-1" />
      </div>

      {finalRows.length === 0 && !selectedType && !showCheckedOnly ? (
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
                const availableSizes = (item.sizes || [])
                  .filter((s) => s.stockQty > 0)
                  .map((s) => `${s.size}(${s.stockQty})`)
                  .join(', ');

                return (
                  <tr key={item.code} className={isChecked ? 'bg-[rgba(34,197,94,0.10)]' : ''}>
                    <td
                      className={`font-mono text-[11px] pr-2 pl-2 align-top border-l border-r border-white/20 whitespace-nowrap ${isError ? 'cursor-pointer hover:underline text-red-400 font-bold' : ''}`}
                      onClick={() => {
                        if (isError) {
                          setEditingError({ code: item.code, memo: item.error_memo || '' });
                          setErrorModalOpen(true);
                        }
                      }}
                    >
                      {item.code}
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
            Code: <span className="font-mono text-[var(--gold)]">{editingError?.code}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Error Memo (Sizes)
            </label>
            <textarea
              ref={textareaRef}
              className="w-full bg-[#0f0f15] border border-[var(--border-soft)] rounded p-2 text-sm text-white h-24 focus:ring-1 focus:ring-red-500 focus:border-red-500 placeholder-gray-600"
              value={editingError?.memo || ''}
              onKeyDown={(e) => {
                e.stopPropagation();
              }}
              onKeyUp={(e) => {
                e.stopPropagation();
              }}
              onChange={(e) =>
                setEditingError((prev) => ({ ...(prev ?? {}), memo: e.target.value }))
              }
              placeholder="Enter details about the stock error..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
