import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Input from '../components/common/Input'; // Keeping for Add Modal
import { useExpenses, useExpenseCategories, useCreateExpenseMutation, useCreateExpenseCategoryMutation, useDeleteExpenseMutation } from '../features/expenses/expensesHooks';
import { useToast } from '../context/ToastContext';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'g-cash', label: 'G-Cash' },
];

const DEFAULT_CATEGORIES = [
  '부자재',
  '의류 사입비',
  '물류비',
  '직원 월급',
  '가게 운영비',
  '기타',
];

function toInputDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
  const { data: expenses, isLoading } = useExpenses({
    from: filters.from,
    to: filters.to,
  });

  // Helper to get category name safely
  const getCategoryName = useCallback((item) => {
    if (item.expense_categories?.name) return item.expense_categories.name;
    if (item.category_id && categories) {
      const cat = categories.find(c => c.id === item.category_id);
      if (cat) return cat.name;
    }
    return '-';
  }, [categories]);

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
        const match = (
          item.title?.toLowerCase().includes(lower) ||
          item.note?.toLowerCase().includes(lower) ||
          catName.toLowerCase().includes(lower)
        );
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
  const grandTotalKrw = totalKrw + (totalPhp * 25.5);
  // KRW / 25.5 + PHP
  const grandTotalPhp = totalPhp + (totalKrw / 25.5);

  const displayTotalPhp = totalPhp > 0 ? roundUpTo10(totalPhp) : 0;
  const displayTotalKrw = totalKrw > 0 ? roundUpTo10(totalKrw) : 0;
  const displayGrandTotalPhp = roundUpTo10(grandTotalPhp);
  const displayGrandTotalKrw = roundUpTo10(grandTotalKrw);

  return (
    <div style={{ padding: 16 }}>
      <div className="flex justify-between items-center mb-3">
        <h2 style={{ margin: 0 }}>Expenses</h2>
        {/* Add Expense Button (Top Right for visibility) */}
        <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
          + Add Expense
        </Button>
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
            style={{ flex: '1 1 0', minWidth: 0, height: 36, padding: '0 12px', borderRadius: 4, border: '1px solid #ccc' }}
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
      <Card title="EXPENSE RECORDS">
        {/* Category Filter Buttons (Card Actions) */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button 
            variant={selectedCategory === 'All' ? 'primary' : 'outline'} 
            onClick={() => setSelectedCategory('All')}
            size="sm"
            style={{ minWidth: 60 }}
          >
            All
          </Button>
          {categories?.map((cat) => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.name ? 'primary' : 'outline'}
              onClick={() => setSelectedCategory(cat.name)}
              size="sm"
              style={{ minWidth: 60 }}
            >
              {cat.name}
            </Button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center table-fixed">
            <thead className="sticky top-0 z-20 shadow-sm">
              <tr className="bg-gray-900 font-bold border-b-2 border-yellow-600 text-xs" style={{ color: '#FACC15' }}>
                <td colSpan={2} className="px-2 py-3 text-center">
                  TOTAL ({filteredExpenses?.length || 0})
                </td>
                <td className="px-2 py-3 text-center">
                  {displayTotalPhp > 0 ? displayTotalPhp.toLocaleString() : '-'}
                </td>
                <td className="px-2 py-3 text-center">
                  {displayTotalKrw > 0 ? displayTotalKrw.toLocaleString() : '-'}
                </td>
                <td colSpan={2} className="px-2 py-3 text-center">
                  ( PHP : {displayGrandTotalPhp.toLocaleString()} / KRW : {displayGrandTotalKrw.toLocaleString()} )
                </td>
              </tr>
              <tr className="bg-gray-50 border-b">
                <th className="px-2 py-2 w-[10%]">Date</th>
                <th className="px-2 py-2 w-[30%]">Title</th>
                <th className="px-2 py-2 w-[15%]">PHP</th>
                <th className="px-2 py-2 w-[15%]">KRW</th>
                <th className="px-2 py-2 w-[20%]">Note</th>
                <th className="px-2 py-2 w-[10%]">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y overflow-y-auto">
              {isLoading ? (
                <tr><td colSpan={6} className="px-2 py-2 text-center">Loading...</td></tr>
              ) : filteredExpenses?.length === 0 ? (
                <tr><td colSpan={6} className="px-2 py-2 text-center text-gray-500">No expenses found.</td></tr>
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
      </Card>

      {/* Add Expense Modal */}
      {isAddModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold">Add Expense</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-500 hover:text-gray-700 p-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="p-6">
               <ExpenseFormContent 
                 categories={categories || []} 
                 onSuccess={() => setIsAddModalOpen(false)}
                 onCancel={() => setIsAddModalOpen(false)}
               />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function ExpenseFormContent({ categories, onSuccess, onCancel }) {
  const { showToast } = useToast();
  const createMutation = useCreateExpenseMutation();
  const createCategoryMutation = useCreateExpenseCategoryMutation();
  
  const [formData, setFormData] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    category_id: '',
    title: '',
    amount: '',
    currency: 'PHP',
    method: 'cash',
    note: '',
  });

  const [categorySearch, setCategorySearch] = useState('');
  
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  // Set default category to '부자재' when categories load
  useEffect(() => {
    if (categories?.length && !formData.category_id) {
      const defaultCat = categories.find(c => c.name === '부자재');
      if (defaultCat) {
        setFormData(prev => ({ ...prev, category_id: defaultCat.id }));
      }
    }
  }, [categories, formData.category_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title) return showToast('Title is required.');
    
    try {
      const amountVal = Number(formData.amount) || 0;
      await createMutation.mutateAsync({
        ...formData,
        category_id: formData.category_id ? Number(formData.category_id) : null,
        amount_php: formData.currency === 'PHP' ? amountVal : 0,
        amount_krw: formData.currency === 'KRW' ? amountVal : 0,
        amount_cny: formData.currency === 'CNY' ? amountVal : 0,
      });
      showToast('Expense added.');
      // Reset form (keep date and category)
      setFormData(prev => ({
        ...prev,
        title: '',
        amount: '',
        note: '',
      }));
      if (onSuccess) onSuccess();
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Failed to add expense.');
    }
  };
  
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const res = await createCategoryMutation.mutateAsync(newCategoryName);
      setFormData(prev => ({ ...prev, category_id: res.id }));
      setIsAddingCategory(false);
      setNewCategoryName('');
      setCategorySearch(''); // Reset search
    } catch (e) {
      console.error(e);
      showToast('Failed to create category.');
    }
  };

  const handleAddDefaults = async () => {
    if (!window.confirm('Add default categories?')) return;
    try {
      let addedCount = 0;
      for (const name of DEFAULT_CATEGORIES) {
        if (!categories.find(c => c.name === name)) {
           await createCategoryMutation.mutateAsync(name);
           addedCount++;
        }
      }
      if (addedCount > 0) showToast(`${addedCount} categories added.`);
      else showToast('All default categories already exist.');
    } catch (e) {
      console.error(e);
      showToast('Error adding categories.');
    }
  };

  const missingDefaults = DEFAULT_CATEGORIES.some(def => !categories.find(c => c.name === def));

  // Filter categories based on search
  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input 
        label="Date" 
        type="date" 
        value={formData.expense_date} 
        onChange={(e) => setFormData({...formData, expense_date: e.target.value})}
        required
      />
      
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">Category</label>
        {!isAddingCategory ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
               <Input 
                 placeholder="Search category..." 
                 value={categorySearch} 
                 onChange={(e) => setCategorySearch(e.target.value)}
                 containerStyle={{ flex: 1 }}
               />
               <Button type="button" variant="outline" onClick={() => setIsAddingCategory(true)}>+</Button>
            </div>
            <select 
              className="w-full border rounded px-3 py-2 text-sm"
              value={formData.category_id}
              onChange={(e) => setFormData({...formData, category_id: e.target.value})}
              size={5} // Show multiple options to simulate a list box after search
            >
              <option value="">Select Category</option>
              {filteredCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {missingDefaults && (
               <Button type="button" variant="ghost" size="sm" onClick={handleAddDefaults} style={{fontSize: 10}}>Add Defaults</Button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <Input 
              label={null}
              placeholder="New Category Name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              containerStyle={{ flex: 1 }}
            />
            <Button type="button" variant="primary" onClick={handleAddCategory}>Save</Button>
            <Button type="button" variant="outline" onClick={() => setIsAddingCategory(false)}>Cancel</Button>
          </div>
        )}
      </div>
      
      <Input 
        label="Title / Item" 
        placeholder="Lunch, Taxi, etc."
        value={formData.title}
        onChange={(e) => setFormData({...formData, title: e.target.value})}
        required
      />
      
      <div className="grid grid-cols-2 gap-2">
        <Input 
          label="Amount" 
          type="number" 
          value={formData.amount}
          onChange={(e) => setFormData({...formData, amount: e.target.value})}
          required
        />
        <div>
           <label className="text-xs font-semibold text-gray-500 mb-1 block">Currency</label>
           <select 
             className="w-full border rounded px-3 py-2 text-sm"
             value={formData.currency}
             onChange={(e) => setFormData({...formData, currency: e.target.value})}
           >
             <option value="PHP">PHP (Peso)</option>
             <option value="KRW">KRW (Won)</option>
             <option value="CNY">CNY (Yuan)</option>
           </select>
        </div>
      </div>
      
      <div>
         <label className="text-xs font-semibold text-gray-500 mb-1 block">Payment Method</label>
         <select 
           className="w-full border rounded px-3 py-2 text-sm"
           value={formData.method}
           onChange={(e) => setFormData({...formData, method: e.target.value})}
         >
           {PAYMENT_METHODS.map(m => (
             <option key={m.value} value={m.value}>{m.label}</option>
           ))}
         </select>
      </div>
      
      <Input 
        label="Note" 
        value={formData.note}
        onChange={(e) => setFormData({...formData, note: e.target.value})}
      />
      
      <div className="pt-2 flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        )}
        <Button type="submit" variant="primary">Save Expense</Button>
      </div>
    </form>
  );
}
