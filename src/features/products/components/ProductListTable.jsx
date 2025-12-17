// src/features/products/components/ProductListTable.jsx
import Button from '../../../components/common/Button';
import DataTable from '../../../components/common/DataTable';
import codePartsSeed from '../../../db/seed/seed-code-parts.json';
import { useAdminStore } from '../../../store/adminStore';
import { useDeleteProductMutation, useProductInventoryList } from '../productHooks';

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
  onClearFilter,
  isFiltered,
}) {
  // If products are provided, use them. Otherwise, we could fetch, but for now we assume they are passed if we want filtering from parent.
  // To maintain backward compatibility if needed, we could fetch if products is undefined.
  // But based on refactoring plan, we are passing products.

  // const { data, isLoading, isError, error } = useProductInventoryList(); // Removed internal fetch

  const { mutate: deleteProduct, isPending: isDeleting } = useDeleteProductMutation();
  const isAdmin = useAdminStore((s) => s.isAuthorized());
  const openLoginModal = useAdminStore((s) => s.openLoginModal);

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
    return (
      <div className="p-4 text-sm text-gray-500 flex items-center gap-2">
        <span>No products found.</span>
        {isFiltered && onClearFilter && (
          <Button variant="outline" size="xs" onClick={onClearFilter}>
            Show All Products
          </Button>
        )}
      </div>
    );
  }

  const handleDelete = (code) => {
    if (!isAdmin) {
      openLoginModal();
      return;
    }
    if (!window.confirm(`Delete product ${code}?`)) return;
    deleteProduct(code);
  };

  return (
    <div className="p-2 overflow-x-auto">
      <DataTable
        columns={[
          { key: 'code', header: 'Code' },
          { key: 'name', header: 'Name' },
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
          { key: 'manage', header: 'Manage', className: 'text-center' },
        ]}
        rows={filtered.map((p) => {
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
            style: isOutOfStock ? { color: '#ef4444' } : undefined, // Red if no stock
            code: (
              <span className={`underline decoration-dotted underline-offset-2 ${isOutOfStock ? 'text-[#ef4444]' : 'text-[var(--gold-soft)]'}`}>
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
                variant="outline"
                size="sm"
                disabled={isDeleting}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(p.code);
                }}
              >
                Delete
              </Button>
            ),
          };
        })}
        onRowClick={(row) => {
          // Allow viewing details without admin, but edit actions inside will be protected
          const selected = filtered.find((p) => p.code === row.id);
          if (onSelect && selected) onSelect(selected);
        }}
        emptyMessage="No products found."
      />
    </div>
  );
}
