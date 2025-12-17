import { useState } from 'react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Button from '../common/Button';
import { useProcessRefundMutation } from '../../features/sales/salesHooks';
import { useAdminStore } from '../../store/adminStore';

export default function RefundModal({ open, onClose, saleItem }) {
  const isAdmin = useAdminStore((s) => s.isAuthorized());
  const openLoginModal = useAdminStore((s) => s.openLoginModal);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  
  const { mutateAsync: processRefund, isPending } = useProcessRefundMutation();

  if (!open || !saleItem) return null;

  const qty = Number(saleItem.qty || 0) || 0;
  const unit =
    Number(saleItem.discountUnitPricePhp ?? (saleItem.unitPricePhp ?? 0)) || 0;
  const amount = qty * unit;

  async function handleSubmit() {
    setErr('');
    if (!isAdmin) {
      openLoginModal();
      return;
    }
    const v = String(reason || '').trim();
    if (!v) {
      setErr('사유를 입력하세요.');
      return;
    }
    if (v.length > 50) {
      setErr('사유는 50자 이하여야 합니다.');
      return;
    }
    
    try {
      await processRefund({
        saleId: saleItem.saleId,
        code: saleItem.code,
        size: saleItem.sizeDisplay,
        qty,
        reason: v,
      });
      onClose?.();
      alert('Refund processed.');
    } catch (e) {
      console.error('Refund failed:', e);
      setErr('환불 처리 실패: ' + (e.message || 'Unknown error'));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="환불 처리"
      size="content"
      footer={
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          <Button variant="outline" onClick={onClose} style={{ width: 100 }}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending} style={{ width: 120 }}>
            {isPending ? 'Processing...' : 'Submit'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 13 }}>
          코드 {saleItem.code} · 사이즈 {saleItem.sizeDisplay} · 수량 {qty} · 금액{' '}
          <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>
            {amount.toLocaleString('en-PH')} PHP
          </span>
        </div>
        <Input
          label="환불 사유"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="최대 50자"
          error={err || undefined}
        />
      </div>
    </Modal>
  );
}
