// src/pages/InventoryPage.jsx
import { useEffect, useMemo, useState } from 'react';
import soldoutSvg from '../assets/soldout.svg';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import ExportActions from '../components/common/ExportActions';
import Input from '../components/common/Input';
import Modal from '../components/common/Modal';
import { useToast } from '../context/ToastContext';
import ProductListTable from '../features/products/components/ProductListTable';
import ProductLookup from '../features/products/components/ProductLookup';
import { useProductInventoryList } from '../features/products/productHooks';
import { useAdminStore } from '../store/adminStore';

export default function InventoryPage() {
  const [gender, setGender] = useState(''); // '', 'M', 'W', 'A'
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCode, setModalCode] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [onlyZeroStock, setOnlyZeroStock] = useState(false);
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
        filtered = filtered.filter((p) =>
          String(p.code || '')
            .toLowerCase()
            .includes(q)
        );
      } else {
        filtered = filtered.filter((p) => {
          const inCode = String(p.code || '')
            .toLowerCase()
            .includes(q);
          const inName = String(p.nameKo || '')
            .toLowerCase()
            .includes(q);
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
    if (onlyZeroStock) {
      filtered = filtered.filter((p) => (p.totalStock || 0) === 0);
    } else {
      filtered = filtered.filter((p) => (p.totalStock || 0) > 0);
    }
    return filtered;
  }, [allProducts, gender, searchApplied, onlyZeroStock]);

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
          <div
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                maxWidth: 560,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
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
              <Button
                variant="outline"
                size="md"
                onClick={clearSearch}
                title="Reset"
                icon="refresh"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOnlyZeroStock(!onlyZeroStock)}
                title="Only 0 Stock"
                style={{
                  width: 40,
                  height: 40,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  backgroundColor: 'transparent',
                  boxShadow: 'none',
                  marginTop: 0,
                }}
              >
                <div
                  style={{
                    marginTop: 0,
                    width: 40,
                    height: 40,
                    backgroundColor: onlyZeroStock ? '#ef4444' : 'var(--gold-soft)',
                    maskImage: `url(${soldoutSvg})`,
                    WebkitMaskImage: `url(${soldoutSvg})`,
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskPosition: 'center',
                  }}
                />
              </Button>
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
