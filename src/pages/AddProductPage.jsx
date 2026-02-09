import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import FormSection from '../components/common/FormSection';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import { useCodeParts } from '../features/codes/codeHooks';
import {
  useUpdateInventoryMutation,
  useUpsertProductMutation,
} from '../features/products/productHooks';
import { getNextProductNo, getNextSerialForPrefix, isProductCodeExists } from '../features/products/productApi';
import { generateProductCode } from '../utils/codeGenerator';
import { useToast } from '../context/ToastContext';
import { useAdminStore } from '../store/adminStore';

export default function AddProductPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isAdmin = useAdminStore((s) => s.isAuthorized());
  const openLoginModal = useAdminStore((s) => s.openLoginModal);

  // Fetch code parts from Supabase (or Dexie fallback)
  const { data: allCodeParts = [] } = useCodeParts();
  const restoredRef = useRef(false);

  const [category, setCategory] = useState('');
  const [kind, setKind] = useState('');
  const [type, setType] = useState('');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [serial, setSerial] = useState('01');
  const [productNo, setProductNo] = useState('');

  const [nameKo, setNameKo] = useState('');
  const [priceCny, setPriceCny] = useState('');
  const [salePricePhp, setSalePricePhp] = useState('');
  const [salePriceManual, setSalePriceManual] = useState(false);

  const [codePreview, setCodePreview] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const [checking, setChecking] = useState(false);

  const { mutateAsync: saveProduct, isPending } = useUpsertProductMutation();
  const { mutateAsync: updateInv } = useUpdateInventoryMutation();

  const categoryOptions = allCodeParts
    .filter((p) => p.group === 'category')
    .sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  const kindOptions = allCodeParts
    .filter((p) => p.group === 'kind')
    .sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  const typeOptions = allCodeParts
    .filter((p) => p.group === 'type')
    .sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  const brandOptions = allCodeParts
    .filter((p) => p.group === 'brand')
    .sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  const colorOptions = allCodeParts
    .filter((p) => p.group === 'color')
    .sort((a, b) => (a.label || '').localeCompare(b.label || ''));

  const [sizeInputs, setSizeInputs] = useState({
    S: '',
    M: '',
    L: '',
    XL: '',
    '2XL': '',
    '3XL': '',
    Free: '',
  });

  async function refreshProductNo() {
    try {
      const next = await getNextProductNo();
      setProductNo(String(Number(next) || ''));
    } catch {
      setProductNo('');
    }
  }

  useEffect(() => {
    refreshProductNo();
  }, []);

  function getLabel(group, code) {
    const found = allCodeParts.find((p) => p.group === group && p.code === code);
    return (found?.label || found?.labelKo || code || '').trim();
  }

  function ceilToUnit(value, unit) {
    const v = Number(value);
    const u = Number(unit);
    if (!Number.isFinite(v) || !Number.isFinite(u) || u <= 0) return 0;
    return Math.ceil(v / u) * u;
  }

  const cnyValue = String(priceCny ?? '').trim();
  const cnyNumber = Number(cnyValue);
  const computedKrwPrice =
    cnyValue === '' ? '' : String(Math.round((Number.isFinite(cnyNumber) ? cnyNumber : 0) * 220));
  const computedP1PricePhp =
    computedKrwPrice === ''
      ? ''
      : String(Math.round(Number(computedKrwPrice) / 25));
  const computedP2PricePhp =
    computedKrwPrice === ''
      ? ''
      : String(ceilToUnit((Number(computedKrwPrice) * 2) / 25, 100));
  const computedP3PricePhp =
    computedKrwPrice === ''
      ? ''
      : String(ceilToUnit((Number(computedKrwPrice) * 3) / 25, 100));

  const effectiveSalePricePhp = salePriceManual ? salePricePhp : computedP3PricePhp;
  const p1PriceForDb = computedP1PricePhp;
  const p3PriceForDb = computedP3PricePhp;

  async function recomputeCode(next = {}) {
    const c = next.category ?? category;
    const g = next.kind ?? kind;
    const t = next.type ?? type;
    const b = next.brand ?? brand;
    const k = next.color ?? color;

    if (!(c && g && t && b && k)) {
      setCodePreview('');
      setDuplicate(false);
      return;
    }

    const prefix = `${c}${g}-${t}-${b}-${k}`;

    let nextSerial = serial;
    try {
      setChecking(true);
      nextSerial = await getNextSerialForPrefix(prefix);
      setSerial(nextSerial);
    } finally {
      setChecking(false);
    }

    const preview = generateProductCode({
      category1: c,
      category2: g,
      type: t,
      brand: b,
      color: k,
      serial: nextSerial,
    });
    setCodePreview(preview);

    const exists = preview ? await isProductCodeExists(preview) : false;
    setDuplicate(exists);

    const name = `${getLabel('category', c)}-${getLabel('kind', g)}-${getLabel(
      'brand',
      b
    )}-${getLabel('color', k)}-${nextSerial}`;
    setNameKo(name);
  }

  useEffect(() => {
    if (allCodeParts.length > 0 && !restoredRef.current) {
      restoredRef.current = true;
      try {
        const saved = localStorage.getItem('royal_golf_last_selection');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.category || parsed.kind || parsed.type || parsed.brand || parsed.color) {
            setCategory(parsed.category || '');
            setKind(parsed.kind || '');
            setType(parsed.type || '');
            setBrand(parsed.brand || '');
            setColor(parsed.color || '');

            recomputeCode({
              category: parsed.category,
              kind: parsed.kind,
              type: parsed.type,
              brand: parsed.brand,
              color: parsed.color,
            });
          }
        }
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCodeParts]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isAdmin) {
      openLoginModal();
      showToast('Admin required.');
      return;
    }
    if (!codePreview) {
      showToast('Code not generated. Please select all options.');
      return;
    }
    if (duplicate) {
      showToast('Code already exists. Please change options.');
      return;
    }
    if (!nameKo.trim()) {
      showToast('Please enter product name.');
      return;
    }

    const changes = Object.fromEntries(
      Object.entries(sizeInputs).map(([k, v]) => [k, Number(v || 0) || 0])
    );
    const totalQty = Object.values(changes).reduce((sum, n) => sum + (Number(n) || 0), 0);

    const payload = {
      code: codePreview,
      nameKo: nameKo.trim(),
      priceCny: Number(priceCny || 0) || 0,
      salePricePhp: Number(effectiveSalePricePhp || 0) || 0,
      qty: totalQty,
      kprice: Number(computedKrwPrice || 0) || 0,
      cprice: Number(priceCny || 0) || 0,
      p1price: Number(p1PriceForDb || 0) || 0,
      p2price: Number(computedP2PricePhp || 0) || 0,
      p3price: Number(p3PriceForDb || 0) || 0,
    };
    const noValue = Number(productNo) || 0;
    if (noValue > 0) payload.no = noValue;

    try {
      const savedCode = await saveProduct(payload);

      // Save last selection for consecutive adds
      localStorage.setItem('royal_golf_last_selection', JSON.stringify({
        category,
        kind,
        type,
        brand,
        color,
      }));

      await updateInv({ code: savedCode, changes });
      showToast(`Product added: ${savedCode}`);
      navigate('/inventory');
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg === 'ADMIN_REQUIRED') openLoginModal();
      showToast(msg === 'ADMIN_REQUIRED' ? 'Admin required.' : `Add failed: ${msg}`);
    }
  }

  function handleRecalcClick() {
    // 현재 state 기준으로 다시 계산
    refreshProductNo();
    recomputeCode({});
  }

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <div className="page-title">Add Product</div>
          <div className="page-subtitle">
            Auto code generation and duplicate check based on Supabase code-parts
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="page-form">
        <div
          className="stack-mobile"
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 16,
            width: '100%',
            minHeight: 0,
            flexWrap: 'nowrap',
            alignItems: 'stretch',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Card
              title="Code Setup"
              subtitle="Selecting Category/Kind/Type/Brand/Color generates code automatically."
            >
              <FormSection columns={3}>
                <div style={{ marginBottom: 8 }}>
                  <Select
                    label="Category"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      recomputeCode({ category: e.target.value });
                    }}
                  >
                    <option value="">Select</option>
                    {categoryOptions.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <Select
                    label="Kind"
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value);
                      recomputeCode({ kind: e.target.value });
                    }}
                  >
                    <option value="">Select</option>
                    {kindOptions.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <Select
                    label="Type"
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value);
                      recomputeCode({ type: e.target.value });
                    }}
                  >
                    <option value="">Select</option>
                    {typeOptions.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </FormSection>

              <FormSection columns={2}>
                <div style={{ marginBottom: 8 }}>
                  <Select
                    label="Brand"
                    value={brand}
                    onChange={(e) => {
                      setBrand(e.target.value);
                      recomputeCode({ brand: e.target.value });
                    }}
                  >
                    <option value="">Select</option>
                    {brandOptions.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <Select
                    label="Color"
                    value={color}
                    onChange={(e) => {
                      setColor(e.target.value);
                      recomputeCode({ color: e.target.value });
                    }}
                  >
                    <option value="">Select</option>
                    {colorOptions.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </FormSection>

              <FormSection columns={2}>
                <Input label="Serial" value={serial} readOnly />
                <Input label="Product No" value={productNo} readOnly />
                <div
                  className={`code-box ${duplicate ? 'code-box-error' : 'code-box-ok'}`}
                  style={{ gridColumn: '1 / -1' }}
                >
                  Code: {codePreview || '-'}
                </div>
              </FormSection>

              <div style={{ marginTop: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Button type="button" variant="outline" size="sm" onClick={handleRecalcClick}>
                    Recalculate Code
                  </Button>
                </div>
                {checking && (
                  <div className="muted" style={{ marginTop: 6 }}>
                    Checking duplicates and calculating serial…
                  </div>
                )}
                {codePreview && !checking && (
                  <div
                    className={`muted ${duplicate ? 'code-status-error' : 'code-status-ok'}`}
                    style={{ marginTop: 6 }}
                  >
                    {duplicate ? 'Code already exists.' : 'Code is available.'}
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div style={{ flex: 2, minWidth: 0 }}>
            {/* 카드 2 : 가격 / 수량 */}
            <Card title="Price & Inventory">
              <FormSection columns={2}>
                <div style={{ flex: 1 }}>
                  <Input
                    label="Cost (CNY)"
                    type="number"
                    value={priceCny}
                    onChange={(e) => {
                      setPriceCny(e.target.value);
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    label="KRW Price"
                    type="number"
                    value={computedKrwPrice}
                    readOnly
                  />
                </div>
              </FormSection>

              <FormSection columns={3}>
                <div style={{ flex: 1 }}>
                  <Input
                    label="P1 Price"
                    type="number"
                    value={computedP1PricePhp}
                    readOnly
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    label="P2 Price"
                    type="number"
                    value={computedP2PricePhp}
                    readOnly
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    label="P3 Price"
                    type="number"
                    value={computedP3PricePhp}
                    readOnly
                  />
                </div>
              </FormSection>

              <FormSection columns={2}>
                <div style={{ flex: 1 }}>
                  <Input
                    label="Sale Price (PHP)"
                    type="number"
                    value={effectiveSalePricePhp}
                    readOnly={!salePriceManual}
                    onChange={(e) => setSalePricePhp(e.target.value)}
                  />
                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      type="button"
                      variant={salePriceManual ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setSalePriceManual((v) => {
                          const next = !v;
                          if (next) setSalePricePhp((prev) => (String(prev ?? '').trim() ? prev : computedP3PricePhp));
                          return next;
                        });
                      }}
                    >
                      {salePriceManual ? 'Manual' : 'Auto'}
                    </Button>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    label="Product Name"
                    value={nameKo}
                    onChange={(e) => setNameKo(e.target.value)}
                  />
                </div>
              </FormSection>

              <FormSection title="" columns={7}>
                {['S', 'M', 'L', 'XL', '2XL', '3XL', 'Free'].map((sz) => (
                  <div key={sz}>
                    <Input
                      className="size-label"
                      label={sz.toUpperCase()}
                      type="number"
                      min={0}
                      value={sizeInputs[sz]}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const num = Number(raw);
                        const next = raw === '' ? '' : Math.max(0, Number.isNaN(num) ? 0 : num);
                        setSizeInputs((prev) => ({ ...prev, [sz]: next }));
                      }}
                    />
                  </div>
                ))}
              </FormSection>
              <div style={{ flex: 1 }} />
              <div
                style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between', gap: 8 }}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/inventory')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isPending || !codePreview || duplicate}
                >
                  Save
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
