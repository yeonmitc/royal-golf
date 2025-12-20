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
import { useCartStore } from '../store/cartStore';
import { useToast } from '../context/ToastContext';

const PROMO_CODES = ['GA-OT-EX-MX-01', 'GA-JH-AC-WH-01', 'GA-JH-AC-BK-02'];

function HeartFilled() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-red-500">
      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3.25 7.75 3.25c2.1 0 3.854 1.252 4.75 3.091C13.396 4.502 15.15 3.25 17.25 3.25c3.036 0 5.5 2.072 5.5 5.002 0 3.926-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
    </svg>
  );
}

function HeartOutline() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400 hover:text-red-500">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

export default function SellPage() {
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const { showToast } = useToast();

  const cartItems = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const totalQty = useCartStore((s) => s.totalQty);
  const totalPrice = useCartStore((s) => s.totalPrice);
  const togglePromo = useCartStore((s) => s.togglePromo);

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
                    const isPromoItem = PROMO_CODES.includes(item.code);
                    const isFree = item.unitPricePhp === 0;
                    return {
                      id: `${item.code}-${item.size}-${idx}`,
                      name: (
                        <div className="flex items-center gap-2">
                          <span>{item.nameKo || item.code}</span>
                          {isPromoItem && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePromo(item.code, item.size);
                              }}
                              className="transition-transform active:scale-95"
                              title="Toggle Promo (Free)"
                            >
                              {isFree ? <HeartFilled /> : <HeartOutline />}
                            </button>
                          )}
                        </div>
                      ),
                      size: item.sizeDisplay || item.size,
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
