// src/features/products/components/ProductListTable.jsx
import { useState } from 'react';
import Button from '../../../components/common/Button';
import DataTable from '../../../components/common/DataTable';
import Modal from '../../../components/common/Modal';
import { useToast } from '../../../context/ToastContext';
import codePartsSeed from '../../../db/seed/seed-code-parts.json';
import { useAdminStore } from '../../../store/adminStore';
import { useDeleteProductMutation } from '../productHooks';

/**
 * 전체 상품 + 재고 리스트 테이블
 *
 * props:
 * - onSelect?: (product) => void
 * - products?: array
 * - isLoading?: boolean
 * - isError?: boolean
 * - error?: any
 * - onClearFilter?: () => void
 * - isFiltered?: boolean
 */
export default function ProductListTable({
  onSelect,
  products,
  isLoading,
  isError,
  error,
  onClearFilter: _onClearFilter,
  isFiltered: _isFiltered,
}) {
  // If products are provided, use them. Otherwise, we could fetch, but for now we assume they are passed if we want filtering from parent.
  // To maintain backward compatibility if needed, we could fetch if products is undefined.
  // But based on refactoring plan, we are passing products.

  // const { data, isLoading, isError, error } = useProductInventoryList(); // Removed internal fetch

  const { mutate: deleteProduct, isPending: isDeleting } = useDeleteProductMutation();
  const isAdmin = useAdminStore((s) => s.isAuthorized());
  const openLoginModal = useAdminStore((s) => s.openLoginModal);
  const { showToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState(null);

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading product list…</div>;
  }

  if (isError) {
    return (
      <div className="p-4 text-sm text-red-600">Failed to load product list: {String(error)}</div>
    );
  }

  const filtered = products ?? [];

  if (filtered.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No products found.</div>;
  }

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteProduct(deleteTarget, {
        onSuccess: () => {
          showToast('Product deleted.');
        },
        onError: (e) => {
          const msg = String(e?.message || e);
          if (msg === 'ADMIN_REQUIRED') openLoginModal();
          showToast(msg === 'ADMIN_REQUIRED' ? 'Admin required.' : `Deletion failed: ${msg}`);
        },
      });
      setDeleteTarget(null);
    }
  };

  const handleDelete = (code) => {
    if (!isAdmin) {
      openLoginModal();
      return;
    }
    setDeleteTarget(code);
  };

  const totalCodes = filtered.length;
  const totalQty = filtered.reduce((sum, p) => sum + (Number(p.totalStock ?? 0) || 0), 0);
  const tableRows = filtered.map((p) => {
    const getLabel = (group, code) => {
      const arr = codePartsSeed[group] || [];
      const found = arr.find((i) => i.code === code);
      return found?.label || code || '';
    };
    const fallbackName = [
      getLabel('category', p.categoryCode),
      getLabel('type', p.typeCode),
      getLabel('brand', p.brandCode),
      getLabel('color', p.colorCode),
      p.modelNo,
    ]
      .filter(Boolean)
      .join(' - ');

    const visibleSizes = Array.isArray(p.sizes)
      ? p.sizes.filter((s) => Number(s.stockQty || 0) > 0)
      : [];

    const isOutOfStock = (p.totalStock || 0) <= 0;

    return {
      id: p.code,
      style: isOutOfStock ? { color: '#ef4444' } : undefined,
      code: (
        <span
          className={`underline decoration-dotted underline-offset-2 ${
            isOutOfStock ? 'text-[#ef4444]' : 'text-[var(--gold-soft)]'
          }`}
        >
          {p.code}
        </span>
      ),
      name: p.nameKo && p.nameKo.trim() ? p.nameKo : fallbackName || '-',
      totalStock: p.totalStock,
      salePrice: (p.salePricePhp || 0).toLocaleString('en-US'),
      sizes:
        visibleSizes.length > 0
          ? visibleSizes
              .map((s) => `${s.sizeDisplay || s.size || ''} x ${s.stockQty ?? 0}`)
              .join(', ')
          : '-',
      manage: (
        <Button
          variant="danger"
          size="sm"
          icon="trash"
          iconSize={14}
          disabled={isDeleting}
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(p.code);
          }}
          className="icon-only"
          style={{ width: 28, height: 28, padding: 0 }}
        />
      ),
    };
  });

  tableRows.push({
    id: '__product_total__',
    clickable: false,
    code: 'TOTAL',
    name: `${totalCodes.toLocaleString('en-US')} codes`,
    totalStock: totalQty.toLocaleString('en-US'),
    salePrice: '',
    sizes: '',
    manage: '',
    style: { color: 'var(--gold-soft)', fontWeight: 700 },
  });

  return (
    <div className="p-2" style={{ maxHeight: '70vh', overflowY: 'auto', overflowX: 'auto' }}>
      <DataTable
        columns={[
          {
            key: 'code',
            header: 'Code',
            className: 'productlist-col-code',
            tdClassName: 'productlist-col-code',
          },
          {
            key: 'name',
            header: 'Name',
            className: 'productlist-col-name',
            tdClassName: 'productlist-col-name',
          },
          {
            key: 'totalStock',
            header: 'Total Stock',
            className: 'text-right',
            tdClassName: 'text-right',
          },
          {
            key: 'salePrice',
            header: 'Price (PHP)',
            className: 'text-right',
            tdClassName: 'text-right',
          },
          { key: 'sizes', header: 'Size Stock' },
          {
            key: 'manage',
            header: 'Manage',
            className: 'text-center productlist-col-manage',
            tdClassName: 'productlist-col-manage',
          },
        ]}
        rows={tableRows}
        onRowClick={(row) => {
          // Allow viewing details without admin, but edit actions inside will be protected
          const selected = filtered.find((p) => p.code === row.id);
          if (onSelect && selected) onSelect(selected);
        }}
        emptyMessage="No products found."
      />
      <Modal
        open={!!deleteTarget}
        title="Confirm Deletion"
        onClose={() => setDeleteTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              disabled={isDeleting}
              icon="trash"
              iconSize={14}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        }
      >
        <p>
          Are you sure you want to delete product <strong>{deleteTarget}</strong>?
        </p>
      </Modal>
    </div>
  );
}
