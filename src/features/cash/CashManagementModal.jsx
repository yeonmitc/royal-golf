import { useState } from 'react';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Modal from '../../components/common/Modal';
import { useToast } from '../../context/ToastContext';
import { useAddCashTransactionMutation, useCashBalances, useCashTransactions } from './cashHooks';
import './CashManagementModal.css';

const ACCOUNT_LABELS = {
  php_cash: 'PHP',
  usd_cash: 'USD',
  krw_cash: 'KRW',
  krw_bank: 'KRW(BANK)',
};

const ACCOUNT_OPTIONS = Object.keys(ACCOUNT_LABELS).map((key) => ({
  value: key,
  label: ACCOUNT_LABELS[key],
}));

export default function CashManagementModal({ open, onClose }) {
  const { showToast } = useToast();
  const { data: balances, isLoading: loadingBalances } = useCashBalances();
  const { data: transactions, isLoading: loadingTransactions } = useCashTransactions();
  const addMutation = useAddCashTransactionMutation();

  const [form, setForm] = useState({
    account: 'php_cash',
    type: 'deposit', // deposit | withdrawal
    amount: '',
    memo: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      showToast('Amount must be greater than 0');
      return;
    }

    try {
      const finalAmount = form.type === 'withdrawal' ? -Number(form.amount) : Number(form.amount);

      await addMutation.mutateAsync({
        account: form.account,
        amount: finalAmount,
        memo: form.memo,
      });

      showToast('Transaction saved');
      setForm((prev) => ({ ...prev, amount: '', memo: '' }));
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to save transaction');
    }
  };

  const formatNumber = (num) => {
    return Number(num || 0).toLocaleString();
  };

  const getBalance = (key) => balances?.find((b) => b.account === key)?.balance || 0;

  const totalEstPhp = (() => {
    const php = getBalance('php_cash');
    const krw = getBalance('krw_cash') + getBalance('krw_bank');
    const usd = getBalance('usd_cash');
    // Formula: PHP + (KRW Total / 25.5) + (USD * 57)
    return php + krw / 25.5 + usd * 57;
  })();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="text-amber-500 font-bold uppercase tracking-wider">Cash Management</span>
      }
      size="lg"
      className="cash-management-modal"
      footer={<></>}
    >
      <div className="space-y-6 p-2">
        {/* 1. Balances Grid - Card Style (Analyze Style) */}
        <div>
          {loadingBalances ? (
            <div className="text-center py-4">Loading balances...</div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
              }}
            >
              {/* Total Card */}
              <div className="page-card" style={{ padding: '16px', marginBottom: '15px' }}>
                <div
                  style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}
                >
                  Total Cash (Est.)
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--gold-soft)' }}>
                  ₱ {formatNumber(Math.round(totalEstPhp))}
                </div>
              </div>

              {/* PHP Card */}
              <div className="page-card" style={{ padding: '16px' }}>
                <div
                  style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}
                >
                  PHP
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                  {formatNumber(getBalance('php_cash'))}
                </div>
              </div>

              {/* USD Card */}
              <div className="page-card" style={{ padding: '16px' }}>
                <div
                  style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}
                >
                  USD
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                  $ {formatNumber(getBalance('usd_cash'))}
                </div>
              </div>

              {/* KRW Card */}
              <div className="page-card" style={{ padding: '16px' }}>
                <div
                  style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}
                >
                  KRW
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                  ₩ {formatNumber(getBalance('krw_cash'))}
                </div>
              </div>

              {/* KRW Bank Card */}
              <div className="page-card" style={{ padding: '16px' }}>
                <div
                  style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}
                >
                  KRW (Bank)
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                  ₩ {formatNumber(getBalance('krw_bank'))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. Add Transaction Form */}
        <div>
          <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded border border-gray-200">
            {/* Account Selection - Modern Checkbox Style */}
            <div className="space-y-1" style={{ marginBottom: '10px' }}>
              <div className="account-selection-row">
                {ACCOUNT_OPTIONS.map((opt) => {
                  const isSelected = form.account === opt.value;
                  return (
                    <div
                      key={opt.value}
                      className="account-selection-item"
                      onClick={() => setForm({ ...form, account: opt.value })}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        height: '48px',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        border: isSelected ? '1px solid #f59e0b' : '1px solid #e5e7eb',
                        backgroundColor: isSelected ? '#fffbeb' : '#fff',
                        transition: 'all 0.2s',
                        boxShadow: isSelected ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
                      }}
                    >
                      {/* Modern Checkbox (Square) */}
                      <div
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '4px',
                          border: isSelected ? '1px solid #f59e0b' : '1px solid #d1d5db',
                          backgroundColor: isSelected ? '#f59e0b' : '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background-color 0.2s, border-color 0.2s',
                        }}
                      >
                        {isSelected && (
                          <div
                            style={{
                              width: '4px',
                              height: '8px',
                              borderRight: '2px solid white',
                              borderBottom: '2px solid white',
                              transform: 'rotate(45deg) translate(-1px, -1px)',
                            }}
                          />
                        )}
                      </div>

                      <span
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: isSelected ? 700 : 500,
                          color: isSelected ? '#111827' : '#4b5563',
                        }}
                      >
                        {opt.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Type Selection - UI Buttons */}
            <div className="space-y-1" style={{ marginBottom: '10px' }}>
              <div className="flex gap-2" style={{ maxWidth: '50%' }}>
                <Button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'deposit' })}
                  variant={form.type === 'deposit' ? 'primary' : 'outline'}
                  className={form.type === 'deposit' ? '!bg-green-600 !border-green-600' : ''}
                  style={{ flex: 1 }}
                >
                  입금
                </Button>
                <Button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'withdrawal' })}
                  variant={form.type === 'withdrawal' ? 'primary' : 'outline'}
                  className={form.type === 'withdrawal' ? '!bg-red-600 !border-red-600' : ''}
                  style={{ flex: 1 }}
                >
                  출금
                </Button>
              </div>
            </div>
            {/* Amount, Memo, Save - Responsive Flex Layout */}
            <div className="input-row-container">
              <div className="input-item-amount">
                <Input
                  type="number"
                  placeholder="Amount"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  containerStyle={{ marginBottom: 0, width: '100%' }}
                  style={{ height: '42px' }}
                  required
                />
              </div>

              <div className="input-item-memo">
                <Input
                  type="text"
                  placeholder="Memo"
                  value={form.memo}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  containerStyle={{ marginBottom: 0, width: '100%' }}
                  style={{ height: '42px' }}
                />
              </div>

              <div className="input-item-save">
                <Button
                  type="submit"
                  variant="primary"
                  loading={addMutation.isPending}
                  style={{ height: '42px', width: '100%', padding: 0 }}
                >
                  Save
                </Button>
              </div>
            </div>
          </form>
        </div>

        <hr className="border-gray-200" />

        {/* 3. Recent History */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
            Recent History (Last 3)
          </h3>
          {loadingTransactions ? (
            <div className="text-center py-4">Loading history...</div>
          ) : transactions?.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-4">No transactions found.</div>
          ) : (
            <div
              className="overflow-x-auto border border-gray-200 rounded"
              style={{ width: '90%', margin: '0 auto' }}
            >
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600 font-semibold border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Memo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-500">
                        {(() => {
                          if (!tx.occurred_at) return '-';
                          const date = new Date(tx.occurred_at);
                          const yy = String(date.getFullYear()).slice(-2);
                          const mm = String(date.getMonth() + 1).padStart(2, '0');
                          const dd = String(date.getDate()).padStart(2, '0');
                          return `${yy}-${mm}-${dd}`;
                        })()}
                      </td>
                      <td className="px-3 py-2">{ACCOUNT_LABELS[tx.account] || tx.account}</td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {tx.amount > 0 ? '+' : ''}
                        {formatNumber(tx.amount)}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{tx.memo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
