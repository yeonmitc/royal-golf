// src/pages/SellPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function SellPage() {
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const { showToast } = useToast();

  const cartItems = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const totalQty = useCartStore((s) => s.totalQty);
  const totalPrice = useCartStore((s) => s.totalPrice);
  const togglePromo = useCartStore((s) => s.togglePromo);
  const setItemColor = useCartStore((s) => s.setItemColor);

  const { mutateAsync: checkoutCart, isPending: isCheckoutPending } = useCheckoutCartMutation();

  const handleCheckout = async () => {
    // Get latest items from store directly to ensure we have the updated prices (e.g. after discount)
    const currentItems = useCartStore.getState().items;
    if (currentItems.length === 0) return;
    try {
      await checkoutCart(currentItems);
      clearCart();
      showToast('Sale completed successfully.');
      navigate('/sales');
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Payment failed.');
    }
  };

  return (
    <div className="page-root">
      {/* 상단 헤더 */}
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

      {/* 본문: 스캔 결과 + 장바구니 (가로 배치, 모바일에서는 세로 스택) */}
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
                            <span style={{ color: isFree ? 'var(--gold-soft)' : '#ef4444', fontSize: 16 }}>
                              ♥
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
                    };
                  })}
                />
              </div>
            )}

            {cartItems.length > 0 && (
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
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
