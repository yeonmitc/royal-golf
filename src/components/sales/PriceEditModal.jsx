import { useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { useUpdateSalePriceMutation } from '../../features/sales/salesHooks';
import { useAdminStore } from '../../store/adminStore';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';

export default function PriceEditModal({ open, onClose, saleItem }) {
  const isAdmin = useAdminStore((s) => s.isAuthorized());
  const openLoginModal = useAdminStore((s) => s.openLoginModal);
  const [price, setPrice] = useState('');
  const [err, setErr] = useState('');
  const { showToast } = useToast();

  const { mutateAsync: updatePrice, isPending } = useUpdateSalePriceMutation();

  useEffect(() => {
    if (!open) return;
    if (saleItem) {
      const original = Number(saleItem.unitPricePhp || 0);
      const discounted =
        saleItem.discountUnitPricePhp != null ? Number(saleItem.discountUnitPricePhp) : null;
      const isDiscounted = discounted !== null && discounted !== original;
      const finalUnit = isDiscounted ? discounted : original;

      setPrice(String(finalUnit));
    } else {
      setPrice('');
    }
    setErr('');
  }, [open, saleItem]);

  if (!open || !saleItem) return null;

  async function handleSubmit() {
    setErr('');
    if (!isAdmin) {
      openLoginModal();
      return;
    }

    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) {
      setErr('Please enter a valid price.');
      return;
    }

    try {
      // Use saleId (raw ID) if available, otherwise fallback to id (but id might be composite in SalesTable)
      const sid = saleItem.saleId || saleItem.id;
      await updatePrice({
        saleId: sid,
        price: p,
      });
      onClose?.();
      showToast('Price updated.');
    } catch (e) {
      console.error('Update failed:', e);
      setErr('Update failed: ' + (e.message || 'Unknown error'));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Sale Price"
      size="content"
      footer={
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          <Button variant="outline" onClick={onClose} style={{ width: 100 }}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isPending}
            style={{ width: 120 }}
          >
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 12, minWidth: 300 }}>
        <div style={{ fontSize: 13, color: 'var(--text-sub)' }}>
          Update the final sale price for this item.
        </div>
        <Input
          label="New Price (PHP)"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0"
          error={err || undefined}
        />
      </div>
    </Modal>
  );
}
