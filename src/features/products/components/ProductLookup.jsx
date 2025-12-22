import { useMemo, useState, useEffect } from 'react';
import BarcodeListener from '../../../components/common/BarcodeListener';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import codePartsSeed from '../../../db/seed/seed-code-parts.json';
import { useProductWithInventory, useUpdateInventoryMutation, useUpsertProductMutation } from '../productHooks';
import { useToast } from '../../../context/ToastContext';
import { useAdminStore } from '../../../store/adminStore';

export default function ProductLookup({
  code,
  onCodeChange,
  autoEdit = false,
  showEditToggle = true,
  onSaved,
  codeInputReadOnly = false,
  editMode,
}) {
  const { data: prod, refetch } = useProductWithInventory(code);
  const [editLocal, setEditLocal] = useState(Boolean(autoEdit));
  const edit = editMode !== undefined ? Boolean(editMode) : editLocal;
  const { showToast } = useToast();
  const openLoginModal = useAdminStore((s) => s.openLoginModal);
  
  // Local state for product details
  const [localName, setLocalName] = useState('');
  const [localPrice, setLocalPrice] = useState('');

  const [sizeChanges, setSizeChanges] = useState({});
  
  const { mutateAsync: updateInv, isPending: isInvPending } = useUpdateInventoryMutation();
  const { mutateAsync: upsertProd, isPending: isProdPending } = useUpsertProductMutation();
  
  const isPending = isInvPending || isProdPending;

  useEffect(() => {
    if (prod) {
      setLocalName(prod.nameKo || '');
      setLocalPrice(prod.salePricePhp ?? 0);
    } else {
      setLocalName('');
      setLocalPrice('');
    }
  }, [prod]);

  const sizes = useMemo(() => {
    const standard = ['S', 'M', 'L', 'XL', '2XL', '3XL', 'Free'];
    const bySize = new Map((prod?.inventory || []).map((r) => [r.size || 'Free', r]));
    return standard.map((sz) => {
      const r = bySize.get(sz);
      return r
        ? { size: r.size ?? sz, display: r.sizeDisplay || r.size || sz, qty: r.stockQty ?? 0 }
        : { size: sz, display: sz, qty: 0 };
    });
  }, [prod]);

  function setQty(size, val) {
    setSizeChanges((prev) => ({ ...prev, [size]: String(val).trim() === '' ? 0 : Number(val) }));
  }

  async function saveChanges() {
    if (!code) return;

    try {
      if (Object.keys(sizeChanges).length > 0) {
        await updateInv({ code, changes: sizeChanges });
      }

      if (prod) {
        const currentName = prod.nameKo || '';
        const currentPrice = prod.salePricePhp ?? 0;

        const newName = localName.trim();
        const newPrice = Number(localPrice) || 0;

        if (newName !== currentName || newPrice !== currentPrice) {
          await upsertProd({
            code,
            nameKo: newName,
            salePricePhp: newPrice,
          });
        }
      }

      setEditLocal(false);
      setSizeChanges({});
      onSaved?.(code);
      sessionStorage.setItem('lastLookupCode', code);
      await refetch();
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg === 'ADMIN_REQUIRED') openLoginModal();
      showToast(msg === 'ADMIN_REQUIRED' ? 'Admin required.' : `Update failed: ${msg}`);
    }
  }

  return (
    <div>
      <BarcodeListener onCode={onCodeChange} enabled={!codeInputReadOnly} />
      <div
        className="stack-mobile"
        style={{
          display: 'flex',
          gap: 16,
          width: '100%',
          minHeight: 0,
          flexWrap: 'nowrap',
          alignItems: 'stretch',
        }}
      >
        {/* Left card: lookup + metadata */}
        <section className="page-card" style={{ flex: 1, minWidth: 0 }}>
          <div className="flex justify-between items-center mb-4">
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-main)',
              }}
            >
              Product Lookup
            </div>
            <div className="flex gap-2" style={{ marginBottom: 12 }}>
              <Input
                label={null}
                value={code}
                onChange={(e) => {
                  if (codeInputReadOnly) return;
                  onCodeChange?.(e.target.value);
                }}
                placeholder="Scan barcode or enter code"
                readOnly={codeInputReadOnly}
              />
            </div>
          </div>
          {(() => {
            const last = sessionStorage.getItem('lastLookupCode') || '';
            if (!last) return null;
            return (
              <div
                className="text-[11px]"
                style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: 8 }}
              >
                Last updated:{' '}
                <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>{last}</span>
              </div>
            );
          })()}

          {prod && (
            <>
              {(() => {
                const findLabel = (group, code) => {
                  const arr = codePartsSeed[group] || [];
                  return (arr.find((i) => i.code === (code || ''))?.label || '-').trim();
                };
                const serial =
                  prod.modelNo ||
                  String(prod.code || '')
                    .split('-')
                    .pop();
                return (
                  <div
                    className="text-sm"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 16,
                      alignItems: 'baseline',
                      justifyContent: 'center',
                      textAlign: 'center',
                      marginTop: 8,
                      marginBottom: 10,
                    }}
                  >
                    <span>
                      <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>Category</span>{' '}
                      <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>
                        {findLabel('category', prod.categoryCode)}
                      </span>
                    </span>
                    <span>
                      <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>Kind</span>{' '}
                      <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>
                        {findLabel('gender', prod.genderCode)}
                      </span>
                    </span>
                    <span>
                      <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>Type</span>{' '}
                      <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>
                        {findLabel('type', prod.typeCode)}
                      </span>
                    </span>
                    <span>
                      <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>Brand</span>{' '}
                      <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>
                        {findLabel('brand', prod.brandCode)}
                      </span>
                    </span>
                    <span>
                      <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>Color</span>{' '}
                      <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>
                        {findLabel('color', prod.colorCode)}
                      </span>
                    </span>
                    <span>
                      <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>Number</span>{' '}
                      <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>{serial}</span>
                    </span>
                  </div>
                );
              })()}
            </>
          )}
        </section>

        {/* Right card: price + size stock */}
        <section className="page-card" style={{ flex: 2, minWidth: 0 }}>
          {prod ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ marginBottom: 10 }}>
                <Input
                  label="Product Name"
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  readOnly={!edit}
                />
                <Input
                  label="Sale Price (PHP)"
                  type="number"
                  value={localPrice}
                  onChange={(e) => setLocalPrice(e.target.value)}
                  readOnly={!edit}
                />
              </div>

              <div>
                <div className="text-[11px] font-medium tracking-wide text-[var(--text-muted)] mb-1">
                  Stock by Size
                </div>
                <div
                  className="size-stock-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                    gap: 8,
                    alignItems: 'start',
                    marginBottom: 5,
                  }}
                >
                  {sizes.map((s) => (
                    <div key={s.size} style={{ minWidth: 0 }}>
                      <div className="text-center text-[11px] text-[var(--text-muted)]">
                        {s.display}
                      </div>
                      <Input
                        label={null}
                        type="number"
                        className="w-full"
                        disabled={!edit}
                        defaultValue={Math.max(0, s.qty)}
                        min={0}
                        onChange={(e) => {
                          const v = Math.max(0, Number(e.target.value || 0));
                          setQty(s.size, v);
                        }}
                      />
                    </div>
                  ))}
                </div>
                {(edit || showEditToggle) && (
                  <div
                    style={{
                      marginTop: 8,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    {edit && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isPending}
                        onClick={saveChanges}
                      >
                        Product updated.
                      </Button>
                    )}
                    {showEditToggle && (
                      <Button
                        variant={edit ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setEditLocal((v) => !v)}
                      >
                        {edit ? 'Edit Mode' : 'Edit Product'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-xs text-[var(--text-muted)]">No product selected.</div>
          )}
        </section>
      </div>
    </div>
  );
}
