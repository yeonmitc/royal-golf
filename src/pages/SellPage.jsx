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
import CartDiscountModal from '../components/sales/CartDiscountModal';

export default function SellPage() {
  const [code, setCode] = useState('');
  const setUnitPrice = useCartStore((s) => s.setUnitPrice);
  const items = useCartStore((s) => s.items);
  const navigate = useNavigate();
  const [cartDiscountOpen, setCartDiscountOpen] = useState(false);

  const cartItems = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const totalQty = useCartStore((s) => s.totalQty);
  const totalPrice = useCartStore((s) => s.totalPrice);

  const { mutateAsync: checkoutCart, isPending: isCheckoutPending } = useCheckoutCartMutation();

  const handleCheckout = async () => {
    // Get latest items from store directly to ensure we have the updated prices (e.g. after discount)
    const currentItems = useCartStore.getState().items;
    if (currentItems.length === 0) return;
    try {
      await checkoutCart(currentItems);
      clearCart();
      alert('Sale completed successfully.');
      navigate('/sales');
    } catch (e) {
      console.error(e);
      alert(e.message || 'Payment failed.');
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
          <Card
            title="Cart"
            actions={
              cartItems.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCartDiscountOpen(true)}
                  title="할인"
                  aria-label="할인"
                >
                  ♥
                </Button>
              ) : null
            }
          >
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
                  rows={cartItems.map((item, idx) => ({
                    id: `${item.code}-${item.size}-${idx}`,
                    name: item.nameKo || item.code,
                    size: item.sizeDisplay || item.size,
                    qty: item.qty,
                    amount: (item.qty * item.unitPricePhp).toLocaleString('en-PH'),
                  }))}
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
      <CartDiscountModal
        open={cartDiscountOpen}
        onClose={() => setCartDiscountOpen(false)}
        items={items}
        onApply={(updates) => {
          updates.forEach((u) => setUnitPrice(u.code, u.size, u.newUnit));
          setCartDiscountOpen(false);
          handleCheckout();
        }}
      />
    </div>
  );
}
