// src/pages/InventoryPage.jsx
import { useState, useMemo, useEffect } from 'react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import ProductListTable from '../features/products/components/ProductListTable';
import ProductLookup from '../features/products/components/ProductLookup';
import Input from '../components/common/Input';
import ExportActions from '../components/common/ExportActions';
import { useProductInventoryList } from '../features/products/productHooks';
import { useAdminStore } from '../store/adminStore';
import { useToast } from '../context/ToastContext';

export default function InventoryPage() {
  const [gender, setGender] = useState(''); // '', 'M', 'W', 'A'
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCode, setModalCode] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const { data: allProducts = [], isLoading, isError, error } = useProductInventoryList();

  const isAdmin = useAdminStore((s) => s.isAuthorized());
  const openLoginModal = useAdminStore((s) => s.openLoginModal);
  const { showToast } = useToast();

  const applySearch = () => {
    setSearchApplied(searchQ.trim());
  };

  useEffect(() => {
    if (searchApplied) {
      setSearchQ('');
    }
  }, [searchApplied]);

  const clearSearch = () => {
    setSearchApplied('');
    setSearchQ('');
  };

  const filteredProducts = useMemo(() => {
    let filtered = gender ? allProducts.filter((p) => p.genderCode === gender) : allProducts;
    const qRaw = String(searchApplied || '').trim();
    const isCodeSearch = qRaw.startsWith('#');
    const q = (isCodeSearch ? qRaw.slice(1) : qRaw).toLowerCase();
    if (q) {
      if (isCodeSearch) {
        filtered = filtered.filter((p) => String(p.code || '').toLowerCase().includes(q));
      } else {
        filtered = filtered.filter((p) => {
          const inCode = String(p.code || '').toLowerCase().includes(q);
          const inName = String(p.nameKo || '').toLowerCase().includes(q);
          const sizeText = Array.isArray(p.sizes)
            ? p.sizes
                .map((s) => [s.size, s.sizeDisplay, s.location].filter(Boolean).join(' '))
                .join(' ')
                .toLowerCase()
            : '';
          const inSizes = sizeText.includes(q);
          return inCode || inName || inSizes;
        });
      }
    }
    return filtered;
  }, [allProducts, gender, searchApplied]);

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <div className="page-title">Inventory</div>
          <div className="page-subtitle">View and edit overall inventory and product details.</div>
        </div>
        <div className="page-actions inventory-actions">
          <Button
            variant={gender === '' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setGender('')}
          >
            All
          </Button>
          <Button
            variant={gender === 'M' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setGender('M')}
          >
            Men
          </Button>
          <Button
            variant={gender === 'W' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setGender('W')}
          >
            Women
          </Button>
          <Button
            variant={gender === 'A' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setGender('A')}
          >
            Accessories
          </Button>
        </div>
      </div>

      <Card
        title="Product List"
        actions={
          Array.isArray(filteredProducts) && filteredProducts.length > 0
            ? [
                <ExportActions
                  key="products"
                  columns={[
                    { key: 'code', header: 'Code' },
                    { key: 'name', header: 'Name' },
                    { key: 'totalStock', header: 'Total Stock' },
                    { key: 'salePrice', header: 'Sale Price (PHP)' },
                  ]}
                  rows={filteredProducts.map((p) => ({
                    code: p.code,
                    name: p.nameKo || '',
                    totalStock: p.totalStock ?? 0,
                    salePrice: (p.salePricePhp || 0).toLocaleString('en-PH'),
                  }))}
                  filename="product-list-page.csv"
                  gdriveName="product-list-page.csv"
                  showDrive={false}
                />,
              ]
            : null
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0, maxWidth: 560, display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Input
                  placeholder="Search (Start with # for partial code search)"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applySearch();
                    if (e.key === 'Backspace' && searchQ === '') {
                      setSearchApplied('');
                    }
                  }}
                />
              </div>
              <Button variant="outline" size="sm" onClick={clearSearch} title="Reset" icon="refresh" />
            </div>
          </div>
        </div>
        <ProductListTable
          products={filteredProducts}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onSelect={(p) => {
            setModalCode(p.code);
            setModalOpen(true);
          }}
        />
      </Card>

      <Modal
        open={modalOpen}
        title="Product Detail"
        size="content"
        onClose={() => {
          setModalOpen(false);
          setEditMode(false);
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              variant={editMode ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                if (editMode) {
                  // If we are currently in edit mode, just toggle off (no auth needed to stop editing)
                  setEditMode(false);
                } else {
                  // To enter edit mode, require admin auth
                  if (!isAdmin) {
                    openLoginModal();
                    return;
                  }
                  setEditMode(true);
                }
              }}
            >
              {editMode ? 'Done Editing' : 'Edit'}
            </Button>
          </div>
        }
      >
        <ProductLookup
          code={modalCode}
          onCodeChange={setModalCode}
          autoEdit={false}
          showEditToggle={false}
          editMode={editMode}
          codeInputReadOnly={true}
          onSaved={() => {
            showToast('Product updated.');
            setModalOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
