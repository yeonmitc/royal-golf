import React, { useCallback, useMemo, useState, useEffect } from 'react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Modal from '../components/common/Modal';
import ExportActions from '../components/common/ExportActions';
import { useToast } from '../context/ToastContext';
import {
  useCreateExpenseMutation,
  useDeleteExpenseMutation,
  useUpdateExpenseMutation,
  useExpenseCategories,
  useExpenses,
} from '../features/expenses/expensesHooks';

const PAYMENT_METHODS = [
  { value: 'cindy_card', label: 'Cindy Card' },
  { value: 'bankTranse', label: 'Bank Transe' },
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
];

function toInputDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------- UI constants (shorten JSX) ----------
const overlayStyle = {
  zIndex: 9999,
  backgroundColor: 'rgba(0,0,0,0.65)',
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

const selectCls =
  'w-full rounded-md px-3 py-2 bg-zinc-900 text-white border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-500';
const labelCls = 'block text-sm font-medium text-zinc-200 mb-1';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="p-4 bg-red-100 text-red-700 border border-red-300 rounded">
        <h3 className="font-bold">Something went wrong in the form.</h3>
        <p>{this.state.error?.message}</p>
        <button className="mt-2 text-sm underline" onClick={() => this.setState({ hasError: false })}>
          Try again
        </button>
      </div>
    );
  }
}

export default function ExpensesPage() {
  const { showToast } = useToast();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const todayStr = toInputDate(new Date());
  const [fromInput, setFromInput] = useState(todayStr.slice(0, 7) + '-01');
  const [toInput, setToInput] = useState(todayStr);
  const [searchInput, setSearchInput] = useState('');

  const [filters, setFilters] = useState({ from: todayStr.slice(0, 7) + '-01', to: todayStr });
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const { data: categories } = useExpenseCategories();
  const { data: expenses, isLoading } = useExpenses({ from: filters.from, to: filters.to });
  const [editingExpense, setEditingExpense] = useState(null);

  const getCategoryName = useCallback(
    (item) => {
      if (item.expense_categories?.name) return item.expense_categories.name;
      const cat = categories?.find((c) => c.id === item.category_id);
      return cat?.name ?? '-';
    },
    [categories]
  );

  const applyRange = (from, to) => {
    setFromInput(from);
    setToInput(to);
    setFilters({ from, to });
  };

  const setAllRange = () => {
    setFromInput('');
    setToInput('');
    setFilters({ from: '', to: '' });
  };

  const setToday = () => {
    const t = toInputDate(new Date());
    applyRange(t, t);
  };

  const setWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const diffToMon = (day + 6) % 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon);
    applyRange(toInputDate(start), toInputDate(now));
  };

  const setMonth = () => {
    const d = new Date();
    const to = toInputDate(d);
    d.setDate(1);
    applyRange(toInputDate(d), to);
  };

  const applySearch = () => {
    setFilters({ from: fromInput, to: toInput });
    setAppliedSearch(searchInput);
  };

  const resetSearch = () => {
    setSearchInput('');
    setAppliedSearch('');
    setAllRange();
  };

  const filteredExpenses = useMemo(() => {
    return expenses?.filter((item) => {
      const catName = getCategoryName(item);
      if (appliedSearch) {
        const lower = appliedSearch.toLowerCase();
        const match =
          item.title?.toLowerCase().includes(lower) ||
          item.note?.toLowerCase().includes(lower) ||
          catName.toLowerCase().includes(lower);
        if (!match) return false;
      }
      if (selectedCategory !== 'All' && catName !== selectedCategory) return false;
      return true;
    });
  }, [expenses, appliedSearch, selectedCategory, getCategoryName]);

  const deleteMutation = useDeleteExpenseMutation();
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      showToast('Expense deleted.');
    } catch (e) {
      console.error(e);
      showToast('Failed to delete expense.');
    }
  };

  const handleRowClick = (item) => {
    setEditingExpense(item);
    setIsAddModalOpen(true);
  };

  const totalPhp = filteredExpenses?.reduce((sum, e) => sum + (Number(e.amount_php) || 0), 0) || 0;
  const totalKrw = filteredExpenses?.reduce((sum, e) => sum + (Number(e.amount_krw) || 0), 0) || 0;

  const roundUpTo10 = (val) => Math.ceil(val / 10) * 10;
  const displayTotalPhp = totalPhp > 0 ? roundUpTo10(totalPhp) : 0;
  const displayTotalKrw = totalKrw > 0 ? roundUpTo10(totalKrw) : 0;

  const grandTotalKrw = totalKrw + totalPhp * 25.5;
  const grandTotalPhp = totalPhp + totalKrw / 25.5;
  const displayGrandTotalPhp = roundUpTo10(grandTotalPhp);
  const displayGrandTotalKrw = roundUpTo10(grandTotalKrw);

  return (
    <div style={{ margin: '30px' }}>
      <div className="flex justify-between items-center mb-3">
        <h2 style={{ margin: 0 }}>Expenses</h2>
      </div>

      <div style={{ marginBottom: 12 }}>
        {/* Date Controls Row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
          <div className="date-controls">
            <div className="date-control">
              <span className="date-control-label">From</span>
              <div className="date-control-box">
                <input
                  type="date"
                  className="input-field date-control-input"
                  value={fromInput}
                  onChange={(e) => setFromInput(e.target.value)}
                />
              </div>
            </div>
            <div className="date-control">
              <span className="date-control-label">To</span>
              <div className="date-control-box">
                <input
                  type="date"
                  className="input-field date-control-input"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Button type="button" onClick={setAllRange} size="sm" variant="outline" style={{ height: 28, padding: '0 10px', fontSize: 11, minWidth: 50 }}>
              All
            </Button>
            <Button type="button" onClick={setToday} size="sm" variant="outline" style={{ height: 28, padding: '0 10px', fontSize: 11, minWidth: 50 }}>
              Today
            </Button>
            <Button type="button" onClick={setWeek} size="sm" variant="outline" style={{ height: 28, padding: '0 10px', fontSize: 11, minWidth: 50 }}>
              Week
            </Button>
            <Button type="button" onClick={setMonth} size="sm" variant="outline" style={{ height: 28, padding: '0 10px', fontSize: 11, minWidth: 50 }}>
              Month
            </Button>
            <button
              type="button"
              onClick={() => {
                setEditingExpense(null);
                setIsAddModalOpen(true);
              }}
              style={{
                height: '28px',
                minWidth: '50px',
                padding: 0,
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#ca8a04',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              +
            </button>
          </div>
        </div>

        {/* Search Row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, flexWrap: 'nowrap' }}>
          <input
            type="text"
            placeholder="Search by title, note, category..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            style={{ flex: '1 1 0', minWidth: 0, height: 36, padding: '0 12px', borderRadius: 4, border: '1px solid #ccc' }}
            className="input-field"
          />
          <Button 
            type="button" 
            onClick={applySearch} 
            variant="primary" 
            title="Search" 
            icon="search" 
            iconSize={16}
            style={{ 
              width: '30px',
              height: '30px',
              minWidth: '30px',
              flex: '0 0 30px',
              borderRadius: '50%',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
          <Button type="button" onClick={resetSearch} size="sm" variant="outline" title="Reset" icon="reset" />
        </div>
      </div>

      {/* Expense List Table */}
      <div className="page-card !rounded-none !border-x-0 !shadow-none !mb-0" style={{ width: '100%', padding: '16px' }}>
    

        {/* Category Filter Buttons */}
        <div className="flex flex-nowrap gap-2 mb-4" style={{ overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: 4 }}>
          <Button variant={selectedCategory === 'All' ? 'primary' : 'outline'} onClick={() => setSelectedCategory('All')} size="sm" style={{ width: 'auto', flexShrink: 0 }}>
            All
          </Button>
          {categories?.map((cat) => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.name ? 'primary' : 'outline'}
              onClick={() => setSelectedCategory(cat.name)}
              size="sm"
              style={{ width: 'auto', flexShrink: 0 }}
            >
              {cat.name}
            </Button>
          ))}
          <ExportActions
            columns={[
              { key: 'date', header: 'Date' },
              { key: 'category', header: 'Category' },
              { key: 'title', header: 'Title' },
              { key: 'php', header: 'PHP' },
              { key: 'krw', header: 'KRW' },
              { key: 'note', header: 'Note' },
            ]}
            rows={filteredExpenses?.map((item) => ({
              date: item.expense_date?.slice(0, 10) || '',
              category: getCategoryName(item),
              title: item.title || '',
              php: item.amount_php || 0,
              krw: item.amount_krw || 0,
              note: item.note || '',
            })) || []}
            filename={`expenses_${filters.from}_${filters.to}.csv`}
            showDrive={false}
          />
        </div>

        <div className="overflow-x-auto" style={{ width: '100%' }}>
          <table className="w-full text-sm text-center" style={{ width: '100%', tableLayout: 'fixed' }}>
            <thead className="sticky top-0 z-20 shadow-sm">
              <tr className="bg-gray-900 font-bold text-xs" style={{ color: '#FACC15' }}>
                <td colSpan={7} style={{ padding: 0 }}>
                  <div style={{ margin: '10px 0', display: 'flex', alignItems: 'center', borderBottom: '2px solid #ca8a04', paddingBottom: '10px' }}>
                    <div style={{ flex: '0 0 auto', padding: '0 8px', fontWeight: 'bold' }}>
                      TOTAL ({filteredExpenses?.length || 0})
                    </div>
                    <div style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center', gap: '20px' }}>
                      <span>PHP: {displayTotalPhp > 0 ? displayTotalPhp.toLocaleString() : '-'}</span>
                      <span>KRW: {displayTotalKrw > 0 ? displayTotalKrw.toLocaleString() : '-'}</span>
                    </div>
                    <div style={{ flex: '0 0 auto', padding: '0 8px', color: '#9ca3af' }}>
                      ( PHP : {displayGrandTotalPhp.toLocaleString()} / KRW : {displayGrandTotalKrw.toLocaleString()} )
                    </div>
                  </div>
                </td>
              </tr>
              <tr className="bg-gray-50 border-b">
                <th className="px-2 py-2 w-[10%]">Date</th>
                <th className="px-2 py-2 w-[15%]">Category</th>
                <th className="px-2 py-2 w-[20%]">Title</th>
                <th className="px-2 py-2 w-[10%]">PHP</th>
                <th className="px-2 py-2 w-[10%]">KRW</th>
                <th className="px-2 py-2 w-[25%]">Note</th>
                <th className="px-2 py-2 w-[10%]">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y overflow-y-auto">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-2 py-2 text-center">Loading...</td>
                </tr>
              ) : filteredExpenses?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-2 text-center text-gray-500">No expenses found.</td>
                </tr>
              ) : (
                filteredExpenses?.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleRowClick(item)}>
                    <td className="px-2 py-2">{item.expense_date?.slice(2, 10)}</td>
                    <td className="px-2 py-2 text-gray-600 truncate">{getCategoryName(item)}</td>
                    <td className="px-2 py-2 font-medium">{item.title}</td>
                    <td className="px-2 py-2 text-gray-600">{item.amount_php ? Number(item.amount_php).toLocaleString() : '-'}</td>
                    <td className="px-2 py-2 text-gray-600">{item.amount_krw ? Number(item.amount_krw).toLocaleString() : '-'}</td>
                    <td className="px-2 py-2 text-gray-500 truncate">{item.note}</td>
                    <td className="px-2 py-2 flex justify-center items-center">
                      <Button
                        variant="danger"
                        size="sm"
                        icon="trash"
                        iconSize={14}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                        className="icon-only"
                        style={{ width: 28, height: 28, padding: 0 }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isAddModalOpen}
        title={<span className="text-amber-500 font-bold uppercase tracking-wider">{editingExpense ? 'Edit Expense' : 'Add Expense'}</span>}
        onClose={() => setIsAddModalOpen(false)}
        size="content"
        containerStyle={{ width: '50vw', minWidth: '350px', maxWidth: '100vw' }}
        footer={<></>}
      >
        <div className="p-1">
          <ErrorBoundary>
            <ExpenseFormContent
              categories={categories || []}
              initialData={editingExpense}
              onSuccess={() => setIsAddModalOpen(false)}
              onCancel={() => setIsAddModalOpen(false)}
            />
          </ErrorBoundary>
        </div>
      </Modal>
    </div>
  );
}

function ExpenseFormContent({ categories, initialData, onSuccess, onCancel }) {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const { showToast } = useToast();
  const createMutation = useCreateExpenseMutation();
  const updateMutation = useUpdateExpenseMutation();

  const readStored = () => {
    try {
      const s = localStorage.getItem('expense_form_last_state');
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  };

  const getDefaultCategoryId = () => {
    const found = safeCategories.find((c) => c?.name === '부자재');
    return found?.id ? String(found.id) : '';
  };

  const makeInitial = () => {
    if (initialData) {
      let cur = 'PHP';
      let amt = '';
      if (initialData.amount_krw && Number(initialData.amount_krw) > 0) {
        cur = 'KRW';
        amt = String(initialData.amount_krw);
      } else if (initialData.amount_cny && Number(initialData.amount_cny) > 0) {
        cur = 'CNY';
        amt = String(initialData.amount_cny);
      } else {
        cur = 'PHP';
        amt = String(initialData.amount_php || '');
      }

      return {
        category_id: String(initialData.category_id || ''),
        title: initialData.title || '',
        currency: cur,
        amount: amt,
        method: initialData.method || 'cash',
        expense_date: initialData.expense_date ? initialData.expense_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
        note: initialData.note || '',
      };
    }

    const stored = readStored();
    return {
      category_id: stored?.category_id || getDefaultCategoryId(), // default 부자재
      title: '',
      currency: stored?.currency || 'PHP', // default PHP
      amount: '',
      method: stored?.method || 'cash', // default cash
      expense_date: new Date().toISOString().slice(0, 10),
      note: stored?.note || '',
    };
  };

  const [formData, setFormData] = useState(makeInitial);

  // Reset form when initialData changes (e.g. switching between add/edit or different items)
  useEffect(() => {
    setFormData(makeInitial());
  }, [initialData]);

  // categories 늦게 로드되면 category_id 비어있을 수 있어서 보정
  useEffect(() => {
    if (!formData.category_id) {
      const id = getDefaultCategoryId();
      if (id) setFormData((p) => ({ ...p, category_id: id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeCategories.length]);

  const savePrefs = (current) => {
    try {
      localStorage.setItem(
        'expense_form_last_state',
        JSON.stringify({
          category_id: current.category_id,
          currency: current.currency,
          method: current.method,
          note: current.note,
        })
      );
    } catch {}
  };

  const pickTemplate = (keyword, defaultNote) => {
    const cat = safeCategories.find((c) => c?.name?.includes(keyword));
    if (!cat) return showToast(`Category matching "${keyword}" not found.`);
    setFormData((p) => ({ ...p, category_id: String(cat.id), note: defaultNote || p.note }));
  };

  const submit = async (closeAfter) => {
    if (!formData.category_id) return showToast('Category is required.');
    if (!formData.title) return showToast('Title is required.');
    const amountVal = Number(formData.amount);
    if (!amountVal || amountVal <= 0) return showToast('Amount must be greater than 0.');
    if (!formData.method) return showToast('Payment method is required.');

    try {
      const payload = {
        category_id: Number(formData.category_id),
        title: formData.title,
        method: formData.method,
        expense_date: formData.expense_date,
        note: formData.note,
        amount_krw: formData.currency === 'KRW' ? amountVal : 0,
        amount_php: formData.currency === 'PHP' ? amountVal : 0,
        amount_cny: formData.currency === 'CNY' ? amountVal : 0,
      };

      if (initialData) {
        await updateMutation.mutateAsync({ id: initialData.id, ...payload });
        showToast('Expense updated.');
      } else {
        await createMutation.mutateAsync(payload);
        showToast(closeAfter ? 'Expense added.' : 'Saved. Ready for next.');
      }

      savePrefs(formData);

      if (closeAfter) onSuccess?.();
      else if (!initialData) setFormData((p) => ({ ...p, title: '', amount: '' }));
    } catch (e) {
      console.error(e);
      showToast(e?.message || (initialData ? 'Failed to update expense.' : 'Failed to add expense.'));
    }
  };

  return (
    <form onSubmit={(e) => (e.preventDefault(), submit(true))} className="space-y-5">
      {/* Quick Templates - Only show in Add mode */}
      {!initialData && (
        <div>
          <label className="block text-xs font-semibold text-zinc-300 mb-2 uppercase tracking-wider">
            Quick Templates
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => pickTemplate('부자재', '부자재')}>
              부자재
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => pickTemplate('물류비', '물류비')}>
              물류비
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => pickTemplate('운영비', '가게 운영비')}>
              운영비
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => pickTemplate('기타', '기타')}>
              기타
            </Button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Category */}
        <div>
          <label className={labelCls}>
            Category <span className="text-red-500">*</span>
          </label>
          <select
            className={selectCls}
            value={formData.category_id}
            onChange={(e) => setFormData((p) => ({ ...p, category_id: e.target.value }))}
            required
          >
            <option value="">Select Category</option>
            {safeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Amount */}
        <div>
          <label className={labelCls}>
            Amount <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <select
              className={`${selectCls} w-24`}
              value={formData.currency}
              onChange={(e) => setFormData((p) => ({ ...p, currency: e.target.value }))}
            >
              <option value="KRW">KRW</option>
              <option value="PHP">PHP</option>
              <option value="CNY">CNY</option>
            </select>
            <Input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
              placeholder="0"
              required
              containerStyle={{ flex: 1, marginBottom: 0 }}
            />
          </div>
        </div>

        {/* Title */}
        <div>
          <label className={labelCls}>
            Title <span className="text-red-500">*</span>
          </label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
            placeholder="Expense Title"
            required
            containerStyle={{ marginBottom: 0 }}
          />
        </div>

        {/* Note */}
        <div>
          <label className={labelCls}>Note</label>
          <Input
            value={formData.note}
            onChange={(e) => setFormData((p) => ({ ...p, note: e.target.value }))}
            placeholder="부자재/물류비..."
            containerStyle={{ marginBottom: 0 }}
          />
        </div>

        {/* Payment Method */}
        <div>
          <label className={labelCls}>
            Payment Method <span className="text-red-500">*</span>
          </label>
          <select
            className={selectCls}
            value={formData.method}
            onChange={(e) => setFormData((p) => ({ ...p, method: e.target.value }))}
            required
          >
            <option value="">Select Method</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className={labelCls}>
            Date <span className="text-red-500">*</span>
          </label>
          <Input
            type="date"
            value={formData.expense_date}
            onChange={(e) => setFormData((p) => ({ ...p, expense_date: e.target.value }))}
            required
            containerStyle={{ marginBottom: 0 }}
          />
        </div>
      </div>

      {/* Buttons aligned */}
      <div className="pt-4 border-t border-zinc-800 mt-6">
        <div className="flex flex-col sm:flex-row gap-3" style={{ marginTop: '15px' }}>
          <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:flex-1 h-11">
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => submit(false)}
            className="w-full sm:flex-1 h-11 bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200"
            disabled={!!initialData}
          >
            {initialData ? 'Save Changes' : 'Save & Add Another'}
          </Button>
          <Button type="submit" variant="primary" className="w-full sm:flex-1 h-11">
            {initialData ? 'Save' : 'Save'}
          </Button>
        </div>
      </div>
    </form>
  );
}
