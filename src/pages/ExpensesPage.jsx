import React, { useCallback, useMemo, useState } from 'react';
import Button from '../components/common/Button';
import Input from '../components/common/Input'; // Keeping for Add Modal
import { useToast } from '../context/ToastContext';
import {
  useCreateExpenseMutation,
  useDeleteExpenseMutation,
  useExpenseCategories,
  useExpenses,
} from '../features/expenses/expensesHooks';

const PAYMENT_METHODS = [
  { value: 'cindy_card', label: 'Cindy Card' },
  { value: 'bankTranse', label: 'Bank Transe' },
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
];

const DEFAULT_CATEGORIES = ['부자재', '의류 사입비', '물류비', '직원 월급', '가게 운영비', '기타'];

function toInputDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-100 text-red-700 border border-red-300 rounded">
          <h3 className="font-bold">Something went wrong in the form.</h3>
          <p>{this.state.error.message}</p>
          <button
            className="mt-2 text-sm underline"
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ExpensesPage() {
  const { showToast } = useToast();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // UI State (Inputs)
  const todayStr = toInputDate(new Date());
  const [fromInput, setFromInput] = useState(todayStr.slice(0, 7) + '-01'); // Default to 1st of current month
  const [toInput, setToInput] = useState(todayStr);
  const [searchInput, setSearchInput] = useState('');

  // Applied Filter State (Triggers Fetch/Filter)
  const [filters, setFilters] = useState({
    from: todayStr.slice(0, 7) + '-01',
    to: todayStr,
  });
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const { data: categories } = useExpenseCategories();

  // DEBUG: Track render and modal state
  console.log('ExpensesPage Render:', { isAddModalOpen, categories });

  const { data: expenses, isLoading } = useExpenses({
    from: filters.from,
    to: filters.to,
  });

  // Helper to get category name safely
  const getCategoryName = useCallback(
    (item) => {
      if (item.expense_categories?.name) return item.expense_categories.name;
      if (item.category_id && categories) {
        const cat = categories.find((c) => c.id === item.category_id);
        if (cat) return cat.name;
      }
      return '-';
    },
    [categories]
  );

  // Range Helpers
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
    const from = toInputDate(start);
    const to = toInputDate(now);
    applyRange(from, to);
  };

  const setMonth = () => {
    const d = new Date();
    const to = toInputDate(d);
    d.setDate(1);
    const from = toInputDate(d);
    applyRange(from, to);
  };

  // Search Actions
  const applySearch = () => {
    setFilters({ from: fromInput, to: toInput });
    setAppliedSearch(searchInput);
  };

  const resetSearch = () => {
    setSearchInput('');
    setAppliedSearch('');
    setAllRange();
  };

  // Filtering
  const filteredExpenses = useMemo(() => {
    return expenses?.filter((item) => {
      const catName = getCategoryName(item);

      // 1. Search term filter
      if (appliedSearch) {
        const lower = appliedSearch.toLowerCase();
        const match =
          item.title?.toLowerCase().includes(lower) ||
          item.note?.toLowerCase().includes(lower) ||
          catName.toLowerCase().includes(lower);
        if (!match) return false;
      }
      // 2. Category filter
      if (selectedCategory !== 'All') {
        if (catName !== selectedCategory) return false;
      }
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

  const totalPhp = filteredExpenses?.reduce((sum, e) => sum + (Number(e.amount_php) || 0), 0) || 0;
  const totalKrw = filteredExpenses?.reduce((sum, e) => sum + (Number(e.amount_krw) || 0), 0) || 0;
  const totalCny = filteredExpenses?.reduce((sum, e) => sum + (Number(e.amount_cny) || 0), 0) || 0;

  // Rounding helper: Ceiling to nearest 10
  const roundUpTo10 = (val) => Math.ceil(val / 10) * 10;

  // PHP * 25.5 + KRW
  const grandTotalKrw = totalKrw + totalPhp * 25.5;
  // KRW / 25.5 + PHP
  const grandTotalPhp = totalPhp + totalKrw / 25.5;

  const displayTotalPhp = totalPhp > 0 ? roundUpTo10(totalPhp) : 0;
  const displayTotalKrw = totalKrw > 0 ? roundUpTo10(totalKrw) : 0;
  const displayGrandTotalPhp = roundUpTo10(grandTotalPhp);
  const displayGrandTotalKrw = roundUpTo10(grandTotalKrw);

  return (
    <div style={{ margin: '30px' }}>
      <div className="flex justify-between items-center mb-3">
        <h2 style={{ margin: 0 }}>Expenses</h2>
      </div>

      <div style={{ marginBottom: 12 }}>
        {/* Date Controls Row */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 8,
            alignItems: 'center',
          }}
        >
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
            <Button
              type="button"
              onClick={setAllRange}
              size="sm"
              variant="outline"
              style={{ height: 28, padding: '0 10px', fontSize: 11, minWidth: 50 }}
            >
              All
            </Button>
            <Button
              type="button"
              onClick={setToday}
              size="sm"
              variant="outline"
              style={{ height: 28, padding: '0 10px', fontSize: 11, minWidth: 50 }}
            >
              Today
            </Button>
            <Button
              type="button"
              onClick={setWeek}
              size="sm"
              variant="outline"
              style={{ height: 28, padding: '0 10px', fontSize: 11, minWidth: 50 }}
            >
              Week
            </Button>
            <Button
              type="button"
              onClick={setMonth}
              size="sm"
              variant="outline"
              style={{ height: 28, padding: '0 10px', fontSize: 11, minWidth: 50 }}
            >
              Month
            </Button>
            <button
              type="button"
              onClick={() => {
                console.log('Plus Button (Native) Clicked');
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
                backgroundColor: '#ca8a04', // Amber-600 approx
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
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            minWidth: 0,
            flexWrap: 'nowrap',
          }}
        >
          <input
            type="text"
            placeholder="Search by title, note, category..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
            style={{
              flex: '1 1 0',
              minWidth: 0,
              height: 36,
              padding: '0 12px',
              borderRadius: 4,
              border: '1px solid #ccc',
            }}
            className="input-field"
          />
          <Button
            type="button"
            onClick={applySearch}
            size="sm"
            variant="primary"
            title="Search"
            icon="search"
          />
          <Button
            type="button"
            onClick={resetSearch}
            size="sm"
            variant="outline"
            title="Reset"
            icon="reset"
          />
        </div>
      </div>

      {/* Expense List Table */}

      <div
        className="page-card !rounded-none !border-x-0 !shadow-none !mb-0"
        style={{ width: '100%', padding: '16px' }}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-amber-500">EXPENSE RECORDS</h3>
        </div>

        {/* Category Filter Buttons (Card Actions) */}
        <div
          className="flex gap-2 mb-4"
          style={{
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            paddingBottom: 4,
          }}
        >
          <Button
            variant={selectedCategory === 'All' ? 'primary' : 'outline'}
            onClick={() => setSelectedCategory('All')}
            size="sm"
            style={{ width: 'auto', flexShrink: 0 }}
          >
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
        </div>

        <div className="overflow-x-auto" style={{ width: '100%' }}>
          <table
            className="w-full text-sm text-center"
            style={{ width: '100%', tableLayout: 'fixed' }}
          >
            <thead className="sticky top-0 z-20 shadow-sm">
              <tr className="bg-gray-900 font-bold text-xs" style={{ color: '#FACC15' }}>
                <td colSpan={6} style={{ padding: 0 }}>
                  <div
                    style={{
                      margin: '10px 0',
                      display: 'flex',
                      alignItems: 'center',
                      borderBottom: '2px solid #ca8a04',
                      paddingBottom: '10px',
                    }}
                  >
                    <div style={{ flex: '0 0 auto', padding: '0 8px', fontWeight: 'bold' }}>
                      TOTAL ({filteredExpenses?.length || 0})
                    </div>
                    <div
                      style={{
                        flex: '1 1 auto',
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '20px',
                      }}
                    >
                      <span>
                        PHP: {displayTotalPhp > 0 ? displayTotalPhp.toLocaleString() : '-'}
                      </span>
                      <span>
                        KRW: {displayTotalKrw > 0 ? displayTotalKrw.toLocaleString() : '-'}
                      </span>
                    </div>
                    <div style={{ flex: '0 0 auto', padding: '0 8px', color: '#9ca3af' }}>
                      ( PHP : {displayGrandTotalPhp.toLocaleString()} / KRW :{' '}
                      {displayGrandTotalKrw.toLocaleString()} )
                    </div>
                  </div>
                </td>
              </tr>
              <tr className="bg-gray-50 border-b">
                <th className="px-2 py-2 w-[10%]">Date</th>
                <th className="px-2 py-2 w-[25%]">Title</th>
                <th className="px-2 py-2 w-[15%]">PHP</th>
                <th className="px-2 py-2 w-[15%]">KRW</th>
                <th className="px-2 py-2 w-[25%]">Note</th>
                <th className="px-2 py-2 w-[10%]">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y overflow-y-auto">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-2 py-2 text-center">
                    Loading...
                  </td>
                </tr>
              ) : filteredExpenses?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-2 text-center text-gray-500">
                    No expenses found.
                  </td>
                </tr>
              ) : (
                filteredExpenses?.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2">{item.expense_date?.slice(5)}</td>
                    <td className="px-2 py-2 font-medium">{item.title}</td>
                    <td className="px-2 py-2 text-gray-600">
                      {item.amount_php ? Number(item.amount_php).toLocaleString() : '-'}
                    </td>
                    <td className="px-2 py-2 text-gray-600">
                      {item.amount_krw ? Number(item.amount_krw).toLocaleString() : '-'}
                    </td>
                    <td className="px-2 py-2 text-gray-500 truncate">{item.note}</td>
                    <td className="px-2 py-2 flex justify-center items-center">
                      <Button
                        variant="danger"
                        size="sm"
                        icon="trash"
                        iconSize={14}
                        onClick={() => handleDelete(item.id)}
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

      {/* Add Expense Modal */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
          style={{
            zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.5)',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {console.log('Rendering Modal DOM')}
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold">Add Expense</h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 p-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="p-6">
              <ErrorBoundary>
                <ExpenseFormContent
                  categories={categories || []}
                  onSuccess={() => setIsAddModalOpen(false)}
                  onCancel={() => setIsAddModalOpen(false)}
                />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpenseFormContent({ categories, onSuccess, onCancel }) {
  console.log('ExpenseFormContent Mounted');
  const safeCategories = Array.isArray(categories) ? categories : [];
  const { showToast } = useToast();
  const createMutation = useCreateExpenseMutation();

  // Safe localStorage access
  const getStoredState = () => {
    try {
      const stored = localStorage.getItem('expense_form_last_state');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.warn('LocalStorage access failed', e);
      return null;
    }
  };

  const [formData, setFormData] = useState(() => {
    const stored = getStoredState();
    return {
      category_id: stored?.category_id || '',
      title: '',
      currency: stored?.currency || 'KRW',
      amount: '',
      method: stored?.method || 'cindy_card',
      expense_date: new Date().toISOString().slice(0, 10),
      note: stored?.note || '',
    };
  });

  const saveStateToStorage = (currentData) => {
    try {
      const stateToSave = {
        category_id: currentData.category_id,
        currency: currentData.currency,
        method: currentData.method,
        note: currentData.note,
      };
      localStorage.setItem('expense_form_last_state', JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('Failed to save state to localStorage', e);
    }
  };

  const handleTemplateClick = (keyword, defaultNote) => {
    // Find category by name containing keyword (safely)
    const cat = categories?.find((c) => c?.name?.includes(keyword));
    if (cat) {
      setFormData((prev) => ({
        ...prev,
        category_id: cat.id,
        note: defaultNote || prev.note,
      }));
    } else {
      showToast(`Category matching "${keyword}" not found.`);
    }
  };

  const processSubmit = async (shouldClose) => {
    if (!formData.category_id) return showToast('Category is required.');
    if (!formData.title) return showToast('Title is required.');
    if (!formData.amount || Number(formData.amount) <= 0)
      return showToast('Amount must be greater than 0.');
    if (!formData.method) return showToast('Payment method is required.');

    try {
      const amountVal = Number(formData.amount);

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

      await createMutation.mutateAsync(payload);
      showToast(shouldClose ? 'Expense added.' : 'Saved. Ready for next.');

      // Save preferences
      saveStateToStorage(formData);

      if (shouldClose) {
        if (onSuccess) onSuccess();
      } else {
        // Reset for next entry (keep category, method, currency, note, date)
        setFormData((prev) => ({
          ...prev,
          title: '',
          amount: '',
        }));
      }
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Failed to add expense.');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    processSubmit(true);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Quick Templates */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
          Quick Templates
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => handleTemplateClick('부자재', '부자재')}
          >
            부자재
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => handleTemplateClick('물류비', '물류비')}
          >
            물류비
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => handleTemplateClick('운영비', '가게 운영비')}
          >
            운영비
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => handleTemplateClick('기타', '기타')}
          >
            기타
          </Button>
        </div>
      </div>

      {/* A. Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Category <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-amber-500 focus:border-amber-500"
          value={formData.category_id}
          onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
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

      {/* B. Title / Note */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Expense Title"
            required
            containerStyle={{ marginBottom: 0 }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
          <Input
            value={formData.note}
            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
            placeholder="부자재/물류비..."
            containerStyle={{ marginBottom: 0 }}
          />
        </div>
      </div>

      {/* C. Amount Input (Currency + Amount) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Amount <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          <select
            className="w-24 border border-gray-300 rounded-md px-3 py-2 bg-gray-50 focus:ring-amber-500 focus:border-amber-500"
            value={formData.currency}
            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
          >
            <option value="KRW">KRW</option>
            <option value="PHP">PHP</option>
            <option value="CNY">CNY</option>
          </select>
          <Input
            type="number"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            placeholder="0"
            required
            containerStyle={{ flex: 1, marginBottom: 0 }}
          />
        </div>
      </div>

      {/* D. Payment Method & E. Date */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Method <span className="text-red-500">*</span>
          </label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-amber-500 focus:border-amber-500"
            value={formData.method}
            onChange={(e) => setFormData({ ...formData, method: e.target.value })}
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date <span className="text-red-500">*</span>
          </label>
          <Input
            type="date"
            value={formData.expense_date}
            onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
            required
            containerStyle={{ marginBottom: 0 }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t mt-6">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => processSubmit(false)}
          className="flex-1 bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200"
        >
          Save & Add Another
        </Button>
        <Button type="submit" variant="primary" className="flex-1">
          Save
        </Button>
      </div>
    </form>
  );
}
