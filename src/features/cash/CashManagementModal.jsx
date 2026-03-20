import { useMemo, useRef, useState } from 'react';
import Button from '../../components/common/Button';
import { PencilIcon, TrashIcon } from '../../components/common/Icons';
import Input from '../../components/common/Input';
import Modal from '../../components/common/Modal';
import { useToast } from '../../context/ToastContext';
import {
  useAddCashTransactionMutation,
  useCashBalances,
  useCashTransactions,
  useDeleteCashTransactionMutation,
  useUpdateCashTransactionAmountMutation,
} from './cashHooks';
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
  const { data: transactions = [], isLoading: loadingTransactions } = useCashTransactions(200);
  const addMutation = useAddCashTransactionMutation();
  // Delete mutation hook
  const deleteMutation = useDeleteCashTransactionMutation();
  const updateMutation = useUpdateCashTransactionAmountMutation();

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

    const memoTrim = String(form.memo || '').trim();
    if (memoTrim.startsWith('[Expense]')) {
      showToast('지출 자동 생성 거래는 수동으로 추가하지 마세요.');
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

  const handleDelete = async (id) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      showToast('삭제되었습니다.');
    } catch (err) {
      console.error(err);
      showToast('삭제 실패');
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
    // Formula: PHP + (KRW Total / 25) + (USD * 56)
    return php + krw / 25 + usd * 56;
  })();

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const editDateRef = useRef(null);

  const openEdit = (tx) => {
    if (!tx?.id) return;
    setEditTarget(tx);
    const iso = tx?.occurred_at;
    const d = iso ? new Date(iso) : null;
    if (d && Number.isFinite(d.getTime())) {
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      setEditDate(`${yyyy}-${mm}-${dd}`);
    } else {
      setEditDate('');
    }
    setEditAmount(String(tx.amount ?? ''));
    setEditMemo(String(tx.memo ?? ''));
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditTarget(null);
    setEditDate('');
    setEditAmount('');
    setEditMemo('');
  };

  const saveEdit = async () => {
    if (!editTarget?.id) return;
    const nextAmount = Number(String(editAmount || '').replace(/,/g, '').trim());
    if (!Number.isFinite(nextAmount) || nextAmount === 0) {
      showToast('Invalid amount');
      return;
    }
    let occurredAt = null;
    const dateStr = String(editDate || '').trim();
    if (dateStr) {
      const base = editTarget?.occurred_at ? new Date(editTarget.occurred_at) : new Date();
      const [y, m, d] = dateStr.split('-').map((n) => Number(n));
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        const hh = base.getUTCHours();
        const mi = base.getUTCMinutes();
        const ss = base.getUTCSeconds();
        const ms = base.getUTCMilliseconds();
        const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh, mi, ss, ms));
        occurredAt = dt.toISOString();
      }
    }
    try {
      await updateMutation.mutateAsync({
        id: editTarget.id,
        amount: nextAmount,
        memo: editMemo,
        occurredAt,
      });
      showToast('Updated');
      closeEdit();
    } catch (e) {
      showToast(String(e?.message || 'Failed to update'));
    }
  };

  const [historyAccount, setHistoryAccount] = useState('');
  const [historyType, setHistoryType] = useState('');
  const [historySort, setHistorySort] = useState('time_desc');
  const [historyPage, setHistoryPage] = useState(0);
  const pageSize = 10;

  const filteredHistory = useMemo(() => {
    const acc = String(historyAccount || '').trim();
    const type = String(historyType || '').trim();
    const sorted = (transactions || [])
      .filter((t) => (acc ? String(t?.account || '') === acc : true))
      .filter((t) => {
        if (type === 'deposit') return Number(t?.amount || 0) > 0;
        if (type === 'withdrawal') return Number(t?.amount || 0) < 0;
        return true;
      })
      .slice()
      .sort((a, b) => {
        const at = a?.occurred_at ? new Date(a.occurred_at).getTime() : 0;
        const bt = b?.occurred_at ? new Date(b.occurred_at).getTime() : 0;
        const aa = Number(a?.amount || 0) || 0;
        const bb = Number(b?.amount || 0) || 0;
        if (historySort === 'time_asc') return at - bt;
        if (historySort === 'time_desc') return bt - at;
        if (historySort === 'amount_asc') return aa - bb;
        if (historySort === 'amount_desc') return bb - aa;
        return bt - at;
      });
    return sorted;
  }, [transactions, historyAccount, historyType, historySort]);

  const maxPage = Math.max(0, Math.ceil((filteredHistory.length || 0) / pageSize) - 1);
  const currentPage = Math.min(historyPage, maxPage);
  const pageItems = filteredHistory.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const cellPad = { padding: '14px 18px' };
  const noWrap = { whiteSpace: 'nowrap' };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          <span className="text-amber-500 font-bold uppercase tracking-wider">Cash Management</span>
        }
        size="lg"
        className="cash-management-modal"
        containerStyle={{ width: '75vw', height: '75vh', maxWidth: '1100px', maxHeight: '75vh' }}
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
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-0">Recent History</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setHistoryPage(0);
                  setHistorySort((p) => {
                    const order = ['time_desc', 'time_asc', 'amount_desc', 'amount_asc'];
                    const idx = Math.max(0, order.indexOf(p));
                    return order[(idx + 1) % order.length];
                  });
                }}
              >
                {historySort === 'time_desc'
                  ? 'Newest'
                  : historySort === 'time_asc'
                    ? 'Oldest'
                    : historySort === 'amount_desc'
                      ? 'Amount↓'
                      : 'Amount↑'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage <= 0}
                onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
              >
                Prev
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage >= maxPage}
                onClick={() => setHistoryPage((p) => Math.min(maxPage, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
          {loadingTransactions ? (
            <div className="text-center py-4">Loading history...</div>
          ) : filteredHistory?.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-4">No transactions found.</div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  width: '100%',
                  margin: '8px auto 10px',
                }}
              >
                {[
                  { key: 'php_cash', label: 'PHP' },
                  { key: 'krw_cash', label: 'KRW' },
                  { key: 'krw_bank', label: 'KRW(BANK)' },
                  { key: 'usd_cash', label: 'Dollar' },
                ].map((b) => {
                  const active = historyAccount === b.key;
                  return (
                    <Button
                      key={b.key}
                      type="button"
                      size="sm"
                      variant={active ? 'primary' : 'outline'}
                      onClick={() => {
                        setHistoryPage(0);
                        setHistoryAccount((p) => (p === b.key ? '' : b.key));
                      }}
                      style={{ width: 'fit-content' }}
                    >
                      {b.label}
                    </Button>
                  );
                })}
                {[
                  { key: 'deposit', label: '입금' },
                  { key: 'withdrawal', label: '출금' },
                ].map((b) => {
                  const active = historyType === b.key;
                  return (
                    <Button
                      key={b.key}
                      type="button"
                      size="sm"
                      variant={active ? 'primary' : 'outline'}
                      onClick={() => {
                        setHistoryPage(0);
                        setHistoryType((p) => (p === b.key ? '' : b.key));
                      }}
                      style={{ width: 'fit-content' }}
                    >
                      {b.label}
                    </Button>
                  );
                })}
              </div>
              <div
                className="overflow-x-auto border border-gray-200 rounded"
                style={{ width: '100%', margin: '0 auto' }}
              >
                <div style={{ width: '90%', maxWidth: 1200, margin: '0 auto', padding: 8 }}>
                  <table className="w-full text-sm" style={{ tableLayout: 'auto' }}>
                    <thead className="bg-gray-100 text-gray-600 font-semibold border-b border-gray-200">
                      <tr>
                        <th className="w-[120px] text-center" style={cellPad}>
                          Time
                        </th>
                        <th className="w-[110px] text-center" style={cellPad}>
                          Account
                        </th>
                        <th className="w-[140px] text-center" style={cellPad}>
                          Amount
                        </th>
                        <th style={cellPad}>Memo</th>
                        <th className="w-[92px] text-center" style={cellPad}>
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pageItems.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50">
                          <td className="text-gray-500 text-center" style={cellPad}>
                            <span style={noWrap}>
                              {(() => {
                                if (!tx.occurred_at) return '-';
                                const date = new Date(tx.occurred_at);
                                const yy = String(date.getFullYear()).slice(-2);
                                const mm = String(date.getMonth() + 1).padStart(2, '0');
                                const dd = String(date.getDate()).padStart(2, '0');
                                return `${yy}-${mm}-${dd}`;
                              })()}
                            </span>
                          </td>
                          <td className="text-center" style={cellPad}>
                            <span style={noWrap}>{ACCOUNT_LABELS[tx.account] || tx.account}</span>
                          </td>
                          <td
                            className={`text-center font-medium ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}
                            style={cellPad}
                          >
                            <span style={noWrap}>
                              {tx.amount > 0 ? '+' : ''}
                              {formatNumber(tx.amount)}
                            </span>
                          </td>
                          <td
                            className="text-gray-600"
                            style={{
                              ...cellPad,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {tx.memo}
                          </td>
                          <td className="text-center" style={cellPad}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              <Button
                                variant="outline"
                                size="sm"
                                icon={<PencilIcon size={16} />}
                                onClick={() => openEdit(tx)}
                                title="수정"
                                disabled={updateMutation.isPending}
                              />
                              <Button
                                variant="danger"
                                size="sm"
                                icon={<TrashIcon size={16} />}
                                onClick={() => handleDelete(tx.id)}
                                title="삭제"
                                disabled={deleteMutation.isPending}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {pageItems.length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-center text-gray-400" colSpan={5}>
                            -
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      </Modal>
      <Modal
        open={editOpen}
        onClose={closeEdit}
        title={
          <span className="text-amber-500 font-bold uppercase tracking-wider">Edit Transaction</span>
        }
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <Button type="button" variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={updateMutation.isPending}
              onClick={saveEdit}
            >
              Save
            </Button>
          </div>
        }
      >
        <div style={{ padding: 12 }}>
          <div className="page-card" style={{ padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-1">Account</div>
                <div style={{ fontWeight: 800 }}>
                  {editTarget ? ACCOUNT_LABELS[editTarget.account] || editTarget.account : '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-1">Date</div>
                <div className="input-wrapper" style={{ marginBottom: 0 }}>
                  <input
                    ref={editDateRef}
                    type="date"
                    className="input-field"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    onClick={() => {
                      try {
                        editDateRef.current?.showPicker?.();
                      } catch {
                        void 0;
                      }
                    }}
                    onFocus={() => {
                      try {
                        editDateRef.current?.showPicker?.();
                      } catch {
                        void 0;
                      }
                    }}
                  />
                </div>
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginTop: 12,
              }}
            >
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-1">Amount</div>
                <Input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  containerStyle={{ marginBottom: 0 }}
                />
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-1">Memo</div>
                <Input
                  type="text"
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  containerStyle={{ marginBottom: 0 }}
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
