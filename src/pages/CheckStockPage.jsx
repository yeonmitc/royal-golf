import { useEffect, useMemo, useState } from 'react';
import Button from '../components/common/Button';
import codePartsSeed from '../db/seed/seed-code-parts.json';
import { useProductInventoryList } from '../features/products/productHooks';

const BRAND_LABEL_MAP = new Map((codePartsSeed.brand || []).map((b) => [b.code, b.label]));

export default function CheckStockPage() {
  const { data: allProducts = [], isLoading } = useProductInventoryList();

  // Local state for checked items (Set of product codes)
  const [checkedCodes, setCheckedCodes] = useState(() => {
    // Load from localStorage if available to persist during session
    const saved = localStorage.getItem('checkStock_checkedCodes');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  const [errorCodes, setErrorCodes] = useState(() => {
    const saved = localStorage.getItem('checkStock_errorCodes');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  const [selectedType, setSelectedType] = useState(null);
  const [showCheckedOnly, setShowCheckedOnly] = useState(false);
  const [showErrorOnly, setShowErrorOnly] = useState(false);
  const [showUncheckedOnly, setShowUncheckedOnly] = useState(false);

  // Persist checked items
  useEffect(() => {
    localStorage.setItem('checkStock_checkedCodes', JSON.stringify([...checkedCodes]));
  }, [checkedCodes]);

  useEffect(() => {
    localStorage.setItem('checkStock_errorCodes', JSON.stringify([...errorCodes]));
  }, [errorCodes]);

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

    if (showCheckedOnly) {
      base = brandFilteredProducts.filter((p) => checkedCodes.has(p.code));
    } else if (showErrorOnly) {
      base = brandFilteredProducts.filter((p) => errorCodes.has(p.code));
    } else if (showUncheckedOnly) {
      base = brandFilteredProducts.filter((p) => !checkedCodes.has(p.code));
    } else {
      base = typeFilteredProducts;
    }

    return base.map((p) => ({
      ...p,
      type: (p.code || '').split('-')[1],
    }));
  }, [
    typeFilteredProducts,
    brandFilteredProducts,
    showCheckedOnly,
    showErrorOnly,
    showUncheckedOnly,
    checkedCodes,
    errorCodes,
  ]);

  const toggleCheck = (code) => {
    setCheckedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleError = (code) => {
    setErrorCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleDownloadTsv = () => {
    if (finalRows.length === 0) {
      alert('No data to download.');
      return;
    }

    const header = ['Code', 'Sizes', 'Checked', 'Error'];
    const rows = finalRows.map((item) => {
      const isChecked = checkedCodes.has(item.code) ? 'Y' : '';
      const isError = errorCodes.has(item.code) ? 'Y' : '';
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

  if (isLoading) return <div className="p-4">Loading stock data...</div>;

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex flex-col gap-2 sticky top-0 bg-[var(--bg-main)] z-10 p-2 shadow-sm -mx-2">
        <div className="flex flex-wrap items-center gap-2 w-full">
          <h2 className="text-base font-semibold flex-none">Stock Check</h2>
          <div className="flex flex-wrap items-center gap-1 ml-auto">
            <Button
              variant={showCheckedOnly ? 'danger' : 'outline'}
              onClick={() => {
                setShowCheckedOnly(!showCheckedOnly);
                if (!showCheckedOnly) {
                  setShowErrorOnly(false);
                  setShowUncheckedOnly(false);
                }
              }}
              size="compact"
            >
              {showCheckedOnly ? 'Show All' : 'Checked'}
            </Button>
            <Button
              variant={showUncheckedOnly ? 'danger' : 'outline'}
              onClick={() => {
                setShowUncheckedOnly(!showUncheckedOnly);
                if (!showUncheckedOnly) {
                  setShowCheckedOnly(false);
                  setShowErrorOnly(false);
                }
              }}
              size="compact"
            >
              {showUncheckedOnly ? 'Show All' : 'Unchecked'}
            </Button>
            <Button
              variant={showErrorOnly ? 'danger' : 'outline'}
              onClick={() => {
                setShowErrorOnly(!showErrorOnly);
                if (!showErrorOnly) {
                  setShowCheckedOnly(false);
                  setShowUncheckedOnly(false);
                }
              }}
              size="compact"
            >
              {showErrorOnly ? 'Show All' : 'Err'}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadTsv}
              size="compact"
              icon="download"
              title="Download TSV"
            >
              TSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCheckedCodes(new Set());
                setErrorCodes(new Set());
                setShowCheckedOnly(false);
                setShowErrorOnly(false);
                setShowUncheckedOnly(false);
              }}
              size="compact"
            >
              All Reset
            </Button>
          </div>
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
                const isChecked = checkedCodes.has(item.code);
                const isError = errorCodes.has(item.code);
                const availableSizes = (item.sizes || [])
                  .filter((s) => s.stockQty > 0)
                  .map((s) => `${s.size}(${s.stockQty})`)
                  .join(', ');

                return (
                  <tr key={item.code} className={isChecked ? 'bg-[rgba(34,197,94,0.10)]' : ''}>
                    <td className="font-mono text-[11px] pr-2 pl-2 align-top border-l border-r border-white/20 whitespace-nowrap">
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
                          onClick={() => toggleCheck(item.code)}
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
                          onClick={() => toggleError(item.code)}
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
    </div>
  );
}
