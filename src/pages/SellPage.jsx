// src/pages/SellPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import BarcodeListener from '../components/common/BarcodeListener';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import DataTable from '../components/common/DataTable';
import Input from '../components/common/Input';
import ProductScanResult from '../features/products/components/ProductScanResult';
import { useCheckoutCartMutation } from '../features/sales/salesHooks';
import codePartsSeed from '../db/seed/seed-code-parts.json';
import { useCartStore } from '../store/cartStore';
import { useToast } from '../context/ToastContext';
import { getGuides } from '../features/guides/guideApi';
import Select from '../components/common/Select';
import ReceiptModal from '../components/sales/ReceiptModal';

export default function SellPage() {
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: guides } = useQuery({ queryKey: ['guides'], queryFn: getGuides });

  const cartItems = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const totalQty = useCartStore((s) => s.totalQty);
  const totalPrice = useCartStore((s) => s.totalPrice);
  const togglePromo = useCartStore((s) => s.togglePromo);
  const setItemColor = useCartStore((s) => s.setItemColor);
  const removeItem = useCartStore((s) => s.removeItem);
  const guideId = useCartStore((s) => s.guideId);
  const setGuideId = useCartStore((s) => s.setGuideId);

  const { mutateAsync: checkoutCart, isPending: isCheckoutPending } = useCheckoutCartMutation();

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  const handleCheckout = async () => {
    // Get latest items from store directly to ensure we have the updated prices (e.g. after discount)
    const currentItems = useCartStore.getState().items;
    const currentGuideId = useCartStore.getState().guideId;
    if (currentItems.length === 0) return;
    try {
      const result = await checkoutCart({ items: currentItems, guideId: currentGuideId });
      
      // Prepare receipt data
      setReceiptData({
        id: result.saleId.toString(), // Assuming saleId is returned
        soldAt: result.soldAt || new Date().toISOString(),
        items: currentItems.map(item => ({
          code: item.code,
          name: item.name || item.nameKo,
          color: item.color,
          size: item.sizeDisplay || item.size,
          qty: item.qty,
          price: item.unitPricePhp || item.price,
        })),
        totalAmount: result.totalAmount,
        totalQty: result.itemCount,
        guideId: currentGuideId,
      });
      setReceiptOpen(true);
      
      clearCart();
      showToast('Sale completed successfully.');
      // navigate('/sales'); // Stay on page to print receipt
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Payment failed.');
    }
  };

  const handleReceiptClose = () => {
    setReceiptOpen(false);
    setReceiptData(null);
    navigate('/sales');
  };

  return (
    <div className="page-root">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Sell</div>
          <div className="page-subtitle">scan for sale product</div>
        </div>

        <div className="page-actions gap-2">
          <BarcodeListener onCode={setCode} />
          <Input
            label={null}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Scan barcode or enter code"
          />
        </div>
      </div>

      {/* Body: scan result + cart (row layout, stacked on mobile) */}
      <div className="stack-mobile" style={{ display: 'flex', flexDirection: 'row', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Card title="Scan Result">
            <ProductScanResult code={code} />
          </Card>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Card title="Cart">
            {cartItems.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)]">Cart is empty.</div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <DataTable
                  columns={[
                    { key: 'name', header: 'Item' },
                    { key: 'size', header: 'Size' },
                    { key: 'color', header: 'Color' },
                    {
                      key: 'qty',
                      header: 'Qty',
                      className: 'text-right',
                      tdClassName: 'text-right',
                    },
                    {
                      key: 'amount',
                      header: 'Amount',
                      className: 'text-right',
                      tdClassName: 'text-right',
                    },
                    { key: 'action', header: 'Action', className: 'text-center', tdClassName: 'text-center' },
                  ]}
                  rows={cartItems.map((item, idx) => {
                    const isFree = item.unitPricePhp === 0;
                    return {
                      id: `${item.code}-${item.size}-${idx}`,
                      name: (
                        <div className="flex items-center gap-2">
                          <span>{item.nameKo || item.code}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePromo(item.code, item.size);
                            }}
                            className="heart-toggle-btn"
                            style={{
                              margin: '0 5px',
                              background: 'transparent',
                              border: 'none',
                              padding: 0,
                              lineHeight: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            title="Toggle Free Gift"
                          >
                            <span style={{ color: isFree ? 'var(--gold-soft)' : '#ef4444', lineHeight: 0 }}>
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                                focusable="false"
                                style={{ display: 'block' }}
                              >
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                              </svg>
                            </span>
                          </button>
                        </div>
                      ),
                      size: item.sizeDisplay || item.size,
                      color: (
                        <select
                          className="select-gold"
                          value={item.color || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            setItemColor(item.code, item.size, e.target.value);
                          }}
                          style={{
                            width: '100%',
                            maxWidth: 160,
                            padding: '6px 8px',
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        >
                          <option value="">Select</option>
                          {(codePartsSeed.color || []).map((c) => (
                            <option key={c.code} value={String(c.label || '').trim()}>
                              {String(c.label || '').trim()}
                            </option>
                          ))}
                        </select>
                      ),
                      qty: item.qty,
                      amount: (item.qty * item.unitPricePhp).toLocaleString('en-PH'),
                      action: (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeItem(item.code, item.size);
                          }}
                        >
                          Delete
                        </Button>
                      ),
                    };
                  })}
                />
              </div>
            )}

            {cartItems.length > 0 && (
              <div className="mt-4 px-1">
                <div className="mb-2">
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">
                    Guide (Commission 10%)
                  </label>
                  <select
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    value={guideId || ''}
                    onChange={(e) => setGuideId(e.target.value)}
                    style={{ borderColor: 'var(--border-soft)' }}
                  >
                    <option value="">No Guide</option>
                    {(guides || [])
                      .slice()
                      .sort((a, b) => {
                        const nameA = String(a.name || '').toLowerCase();
                        const nameB = String(b.name || '').toLowerCase();
                        if (nameA === 'mr.moon') return -1;
                        if (nameB === 'mr.moon') return 1;
                        return nameA.localeCompare(nameB);
                      })
                      .map((g) => {
                        const isMrMoon = String(g.name || '').toLowerCase() === 'mr.moon';
                        return (
                          <option
                            key={g.id}
                            value={g.id}
                            style={isMrMoon ? { backgroundColor: 'rgba(212,175,55,0.5)', color: '#000' } : {}}
                          >
                            {g.name}
                          </option>
                        );
                      })}
                  </select>
                </div>

                <div
                  style={{
                    display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginTop: 8,
                }}
              >
                <Button variant="outline" size="sm" onClick={clearCart}>
                  Clear
                </Button>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  <span
                    className="text-sm"
                    style={{
                      padding: '6px 12px',
                      borderRadius: 999,
                      background: '#141420',
                      border: '1px solid var(--border-soft)',
                      color: 'var(--text-main)',
                      fontWeight: 600,
                      fontSize: 15,
                    }}
                  >
                    Total{' '}
                    <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>{totalQty}</span>{' '}
                    items ·{' '}
                    <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>
                      {totalPrice.toLocaleString('en-PH')}
                    </span>{' '}
                    PHP
                  </span>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isCheckoutPending}
                  onClick={handleCheckout}
                >
                  {isCheckoutPending ? 'Processing payment...' : 'Payment'}
                </Button>
              </div>
              </div>
            )}
          </Card>
        </div>
      </div>
      <ReceiptModal
        open={receiptOpen}
        receiptData={receiptData}
        onClose={handleReceiptClose}
      />
    </div>
  );
}
