import { useMemo, useState, useEffect } from 'react';
import BarcodeListener from '../../../components/common/BarcodeListener';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import codePartsSeed from '../../../db/seed/seed-code-parts.json';
import {
  useProductWithInventory,
  useUpdateInventoryMutation,
  useUpsertProductMutation,
  useRenameProductCodeMutation,
} from '../productHooks';
import { useToast } from '../../../context/ToastContext';
import { useAdminStore } from '../../../store/adminStore';
import { validateProductCode, isProductCodeExists } from '../productApi';
import { getSizeOptionsByCode } from '../../../utils/sizeMapper';

export default function ProductLookup({
  code,
  onCodeChange,
  autoEdit = false,
  showEditToggle = true,
  onSaved,
  codeInputReadOnly = true,
  editMode,
}) {
  const { data: prod, refetch } = useProductWithInventory(code);
  const [editLocal, setEditLocal] = useState(Boolean(autoEdit));
  const edit = editMode !== undefined ? Boolean(editMode) : editLocal;
  const { showToast } = useToast();
  const openLoginModal = useAdminStore((s) => s.openLoginModal);
  const isAdmin = useAdminStore((s) => s.isAuthorized());

  const [originalCode, setOriginalCode] = useState('');
  const [editCodeOpen, setEditCodeOpen] = useState(false);
  const [editCodeValue, setEditCodeValue] = useState('');
  const [editCodeError, setEditCodeError] = useState('');
  const [editCodeValid, setEditCodeValid] = useState(false);
  const [editCodeChecking, setEditCodeChecking] = useState(false);

  const [localName, setLocalName] = useState('');
  const [localPrice, setLocalPrice] = useState('');
  const [localCprice, setLocalCprice] = useState('');
  const [localKprice, setLocalKprice] = useState('');
  const [localP1price, setLocalP1price] = useState('');
  const [localP2price, setLocalP2price] = useState('');
  const [localP3price, setLocalP3price] = useState('');

  const [sizeChanges, setSizeChanges] = useState({});

  const { mutateAsync: updateInv, isPending: isInvPending } = useUpdateInventoryMutation();
  const { mutateAsync: upsertProd, isPending: isProdPending } = useUpsertProductMutation();
  const { mutateAsync: renameCode, isPending: isRenamePending } = useRenameProductCodeMutation();

  const isPending = isInvPending || isProdPending || isRenamePending || editCodeChecking;

  useEffect(() => {
    const c = String(code || '')
      .trim()
      .toUpperCase();
    if (c && prod && String(prod.code || '').toUpperCase() === c && !originalCode) {
      setOriginalCode(c);
    }
  }, [code, prod, originalCode]);

  useEffect(() => {
    if (prod) {
      setLocalName(prod.nameKo || '');
      setLocalPrice(prod.salePricePhp ?? 0);
      setLocalCprice(prod.cprice ?? prod.priceCny ?? 0);
      setLocalKprice(prod.kprice ?? 0);
      setLocalP1price(prod.p1price ?? 0);
      setLocalP2price(prod.p2price ?? 0);
      setLocalP3price(prod.p3price ?? 0);
    } else {
      setLocalName('');
      setLocalPrice('');
      setLocalCprice('');
      setLocalKprice('');
      setLocalP1price('');
      setLocalP2price('');
      setLocalP3price('');
    }
  }, [prod]);

  function handleCpriceChange(val) {
    setLocalCprice(val);
    const cnyValue = Number(val || 0);
    const kp = Math.round(cnyValue * 220);
    const p1 = Math.round(kp / 25);
    const p2 = Math.ceil(((kp / 25) * 2) / 100) * 100;
    const p3 = Math.ceil(((kp / 25) * 3) / 100) * 100;
    setLocalKprice(kp);
    setLocalP1price(p1);
    setLocalP2price(p2);
    setLocalP3price(p3);
  }

  const sizes = useMemo(() => {
    const codeForSize = String(prod?.code || code || '').trim();
    const sizeOpts = getSizeOptionsByCode(codeForSize);
    const bySize = new Map(
      (prod?.inventory || []).map((r) => [String(r.size || 'Free').trim(), r])
    );
    return sizeOpts.map((opt) => {
      const r = bySize.get(opt.key);
      return r
        ? {
            size: r.size ?? opt.key,
            display: opt.label,
            qty: typeof r.stockQty === 'number' ? r.stockQty : Number(r.stockQty ?? 0) || 0,
          }
        : { size: opt.key, display: opt.label, qty: 0 };
    });
  }, [prod, code]);

  function setQty(size, val) {
    setSizeChanges((prev) => ({ ...prev, [size]: String(val).trim() === '' ? 0 : Number(val) }));
  }

  function handleMainCodeChange(val) {
    const upper = String(val || '')
      .trim()
      .toUpperCase();
    onCodeChange?.(upper);
  }

  function openEditCode() {
    if (!isAdmin) {
      openLoginModal();
      return;
    }
    const c = String(prod?.code || originalCode || code || '')
      .trim()
      .toUpperCase();
    setEditCodeValue(c);
    setEditCodeError('');
    setEditCodeValid(false);
    setEditCodeOpen(true);
  }

  function closeEditCode() {
    setEditCodeOpen(false);
    setEditCodeValue('');
    setEditCodeError('');
    setEditCodeValid(false);
  }

  async function checkEditCodeValid() {
    const val = String(editCodeValue || '')
      .trim()
      .toUpperCase();
    setEditCodeChecking(true);
    setEditCodeError('');
    setEditCodeValid(false);
    try {
      validateProductCode(val);
      const orig = String(prod?.code || originalCode || code || '').toUpperCase();
      if (val === orig) {
        setEditCodeError('기존 코드와 동일합니다.');
        setEditCodeChecking(false);
        return;
      }
      const dup = await isProductCodeExists(val);
      if (dup) {
        setEditCodeError(`이미 존재하는 상품 코드입니다: ${val}`);
        setEditCodeChecking(false);
        return;
      }
      setEditCodeValid(true);
      showToast('Code format valid.');
    } catch (ve) {
      setEditCodeError(String(ve.message || ve));
    } finally {
      setEditCodeChecking(false);
    }
  }

  async function applyEditCode() {
    const val = String(editCodeValue || '')
      .trim()
      .toUpperCase();
    const orig = String(prod?.code || originalCode || code || '').toUpperCase();
    if (val === orig) return;
    try {
      setEditCodeChecking(true);
      await renameCode({ oldCode: orig, newCode: val });
      setOriginalCode(val);
      onCodeChange?.(val);
      showToast('Update code.');
      closeEditCode();
      await refetch();
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg === 'ADMIN_REQUIRED') openLoginModal();
      showToast(msg === 'ADMIN_REQUIRED' ? 'Admin required.' : `Update code failed: ${msg}`);
    } finally {
      setEditCodeChecking(false);
    }
  }

  async function saveChanges() {
    if (!code) return;

    try {
      const trimmedCode = String(code).trim().toUpperCase();

      if (Object.keys(sizeChanges).length > 0) {
        await updateInv({ code: trimmedCode, changes: sizeChanges });
      }

      const newName = localName.trim();
      const newPrice = Number(localPrice) || 0;

      await upsertProd({
        code: trimmedCode,
        nameKo: newName,
        salePricePhp: newPrice,
        cprice: Number(localCprice || 0),
        kprice: Number(localKprice || 0),
        p1price: Number(localP1price || 0),
        p2price: Number(localP2price || 0),
        p3price: Number(localP3price || 0),
      });

      setEditLocal(false);
      setSizeChanges({});
      onSaved?.(trimmedCode);
      sessionStorage.setItem('lastLookupCode', trimmedCode);
      await refetch();
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg === 'ADMIN_REQUIRED') openLoginModal();
      showToast(msg === 'ADMIN_REQUIRED' ? 'Admin required.' : `Update failed: ${msg}`);
    }
  }

  return (
    <div>
      <BarcodeListener onCode={handleMainCodeChange} enabled={!codeInputReadOnly} />
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
        <section
          className="page-card"
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
        >
          <div className="mb-4">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
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
            </div>
            <div className="flex gap-2" style={{ marginTop: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  onClick={async () => {
                    const v = String(code || '').trim();
                    if (!v) return;
                    try {
                      await navigator.clipboard.writeText(v);
                    } catch {
                      const ta = document.createElement('textarea');
                      ta.value = v;
                      ta.setAttribute('readonly', '');
                      ta.style.position = 'fixed';
                      ta.style.left = '-9999px';
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand('copy');
                      document.body.removeChild(ta);
                    }
                    showToast('Code copied.');
                  }}
                  style={{
                    width: '100%',
                    minHeight: 56,
                    padding: '12px 16px',
                    border: '1.5px solid var(--gold-soft)',
                    borderRadius: 10,
                    backgroundColor: 'rgba(var(--gold-rgb, 212, 175, 55), 0.05)',
                    color: 'var(--gold-soft)',
                    fontSize: 18,
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    overflowWrap: 'anywhere',
                    lineHeight: 1.4,
                    userSelect: 'all',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Click to copy code"
                >
                  {String(code || '').trim() || '—'}
                </div>
                {!codeInputReadOnly && (
                  <div style={{ marginTop: 8 }}>
                    <Input
                      label={null}
                      value={code}
                      onChange={(e) => handleMainCodeChange(e.target.value)}
                      placeholder="Scan barcode or enter code"
                      readOnly={codeInputReadOnly}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {prod && isAdmin && !editCodeOpen && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <Button
                variant="outline"
                size="sm"
                onClick={openEditCode}
                disabled={isRenamePending}
                style={{
                  borderColor: 'var(--gold-soft)',
                  color: 'var(--gold-soft)',
                  minWidth: 100,
                }}
              >
                ✏️ Edit
              </Button>
            </div>
          )}

          {editCodeOpen && (
            <div
              style={{
                margin: '4px 0 14px 0',
                padding: 14,
                border: '1.5px dashed var(--gold-soft)',
                borderRadius: 10,
                backgroundColor: 'rgba(var(--gold-rgb, 212, 175, 55), 0.04)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--gold-soft)',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                🔄 Change Product Code
              </div>
              <Input
                label={null}
                value={editCodeValue}
                onChange={(e) => {
                  const v = String(e.target.value || '')
                    .trim()
                    .toUpperCase();
                  setEditCodeValue(v);
                  setEditCodeValid(false);
                  setEditCodeError('');
                }}
                placeholder="Enter new code (CK-TY-BR-CL-NN)"
                style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
              />
              {editCodeError && (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#ef4444',
                    marginTop: 6,
                    lineHeight: 1.4,
                  }}
                >
                  {editCodeError}
                </div>
              )}
              {editCodeValid && (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#10b981',
                    marginTop: 6,
                  }}
                >
                  ✅ Valid code format & not duplicated.
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginTop: 10,
                  justifyContent: 'flex-end',
                }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={closeEditCode}
                  disabled={editCodeChecking}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkEditCodeValid}
                  disabled={editCodeChecking || !editCodeValue}
                >
                  {editCodeChecking ? 'Checking...' : 'Check Valid'}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={applyEditCode}
                  disabled={!editCodeValid || editCodeChecking}
                >
                  {editCodeChecking ? 'Updating...' : 'Update Code'}
                </Button>
              </div>
            </div>
          )}

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
                    <span>
                      <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>DB No</span>{' '}
                      <span style={{ color: 'var(--gold-soft)', fontWeight: 700 }}>{prod.no}</span>
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

              {edit && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: 12,
                    border: '1px solid var(--border-color, #333)',
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--gold-soft)',
                      marginBottom: 8,
                      textTransform: 'uppercase',
                    }}
                  >
                    Admin Pricing
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                    <Input
                      label="Cost (CNY)"
                      type="number"
                      value={localCprice}
                      onChange={(e) => handleCpriceChange(e.target.value)}
                    />
                    <Input label="KRW Price" value={localKprice} readOnly />
                    <Input
                      label="P1 Price"
                      type="number"
                      value={localP1price}
                      onChange={(e) => setLocalP1price(e.target.value)}
                    />
                    <Input label="P2 Price" value={localP2price} readOnly />
                    <Input label="P3 Price" value={localP3price} readOnly />
                  </div>
                </div>
              )}

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
                        Save Changes
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
