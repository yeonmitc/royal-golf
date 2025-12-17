import Modal from '../common/Modal';
import Button from '../common/Button';

function ceilTo50(n) {
  const v = Math.max(0, Number(n) || 0);
  const ceil50 = Math.ceil(v / 50) * 50;
  return Math.max(50, ceil50);
}

export default function CartDiscountModal({ open, onClose, items, onApply }) {
  if (!open) return null;

  const originalTotal = items.reduce((sum, i) => sum + (i.qty || 0) * (i.originalUnitPricePhp ?? i.unitPricePhp ?? 0), 0);
  const discountedPerItem = items.map((i) => {
    const unit = i.originalUnitPricePhp ?? i.unitPricePhp ?? 0;
    const unitDisc = ceilTo50(unit * 0.9);
    return { code: i.code, size: i.size, newUnit: unitDisc };
  });
  const discountedTotal = discountedPerItem.reduce((sum, r, idx) => {
    const qty = items[idx]?.qty || 0;
    return sum + qty * r.newUnit;
  }, 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="할인 적용"
      size="content"
      footer={
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          <Button variant="outline" onClick={onClose} style={{ width: 100 }}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply(discountedPerItem);
            }}
            style={{ width: 120 }}
          >
            Apply
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 14 }}>
          원래 총액:{' '}
          <span style={{ fontWeight: 700 }}>
            {Math.round(originalTotal).toLocaleString('en-PH')} PHP
          </span>
        </div>
        <div style={{ fontSize: 14 }}>
          10% 할인 후(50 최소·50 단위 올림) 총액:{' '}
          <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>
            {Math.round(discountedTotal).toLocaleString('en-PH')} PHP
          </span>
        </div>
      </div>
    </Modal>
  );
}
