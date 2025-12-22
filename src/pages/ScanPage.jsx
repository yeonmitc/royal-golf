import { useMemo, useState } from 'react';
import BarcodeListener from '../components/common/BarcodeListener';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import codePartsSeed from '../db/seed/seed-code-parts.json';
import ProductScanResult from '../features/products/components/ProductScanResult';
import {
  useProductWithInventory,
  useUpdateInventoryMutation,
} from '../features/products/productHooks';

export default function ScanPage() {
  const [code, setCode] = useState('');
  const [edit, setEdit] = useState(false);
  const { data: prod } = useProductWithInventory(code);
  const [sizeChanges, setSizeChanges] = useState({});
  const { mutateAsync: updateInv, isPending } = useUpdateInventoryMutation();
  const sizes = useMemo(
    () =>
      (prod?.inventory || []).map((r) => ({
        size: r.size ?? '',
        display: r.sizeDisplay || r.size || 'Free',
        qty: r.stockQty ?? 0,
      })),
    [prod]
  );
  function setQty(size, val) {
    setSizeChanges((prev) => ({ ...prev, [size]: String(val).trim() === '' ? 0 : Number(val) }));
  }
  async function saveChanges() {
    if (!code) return;
    await updateInv({ code, changes: sizeChanges });
    setEdit(false);
    setSizeChanges({});
  }
  return (
    <div className="page-root">
      <BarcodeListener onCode={setCode} />

      <section className="page-card">
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-semibold text-[var(--gold-soft)]">Product Lookup & Edit</div>
          <div className="flex gap-2">
            <Input
              label={null}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Scan barcode or enter code"
            />
          </div>
        </div>

        {!prod && <div className="text-xs text-[var(--text-muted)]">Scan or enter a code.</div>}
        {prod && (
          <div className="space-y-4">
            {(() => {
              const findLabel = (group, code) => {
                const arr = codePartsSeed[group] || [];
                return (arr.find((i) => i.code === (code || ''))?.label || '-').trim();
              };
              const classText = [
                `Category ${findLabel('category', prod.categoryCode)}`,
                `Kind ${findLabel('gender', prod.genderCode)}`,
                `Type ${findLabel('type', prod.typeCode)}`,
                `Brand ${findLabel('brand', prod.brandCode)}`,
                `Color ${findLabel('color', prod.colorCode)}`,
              ].join('   ');
              return <div className="text-sm text-[var(--text-muted)]">{classText}</div>;
            })()}

            <div className="mt-2">
              <Input label="Code" value={prod.code} readOnly />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Sale Price (PHP)"
                type="number"
                value={prod.salePricePhp ?? 0}
                readOnly
              />
            </div>

            <div>
              <div className="text-[11px] font-medium tracking-wide text-[var(--text-muted)] mb-1">
                Stock by Size
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.length === 0 && <div className="text-xs text-[var(--text-muted)]">0</div>}
                {sizes.map((s) => (
                  <div key={s.size} className="flex items-center gap-2">
                    <span className="w-12 text-right text-xs">{s.display}</span>
                    <Input
                      label={null}
                      type="number"
                      className="w-20"
                      disabled={!edit}
                      defaultValue={s.qty}
                      onChange={(e) => setQty(s.size, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              {edit && (
                <div className="mt-3 flex justify-end">
                  <Button variant="primary" size="sm" disabled={isPending} onClick={saveChanges}>
                    Save Inventory
                  </Button>
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <Button
                  variant={edit ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setEdit((v) => !v)}
                >
                  {edit ? 'Edit Mode' : 'Edit Product'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="page-card">
        <ProductScanResult code={code} />
      </section>
    </div>
  );
}
