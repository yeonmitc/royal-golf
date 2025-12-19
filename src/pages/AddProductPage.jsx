import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import FormSection from '../components/common/FormSection';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import db from '../db/dexieClient';
import codePartsSeed from '../db/seed/seed-code-parts.json';
import {
  useUpdateInventoryMutation,
  useUpsertProductMutation,
} from '../features/products/productHooks';
import { generateProductCode } from '../utils/codeGenerator';
import { useToast } from '../context/ToastContext';

export default function AddProductPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [category, setCategory] = useState('');
  const [gender, setGender] = useState('');
  const [type, setType] = useState('');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [serial, setSerial] = useState('01');

  const [nameKo, setNameKo] = useState('');
  const [priceCny, setPriceCny] = useState('');
  const [salePricePhp, setSalePricePhp] = useState('');
  const [krwPrice, setKrwPrice] = useState('');

  const [codePreview, setCodePreview] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const [checking, setChecking] = useState(false);

  const { mutateAsync: saveProduct, isPending } = useUpsertProductMutation();
  const { mutateAsync: updateInv } = useUpdateInventoryMutation();

  const categoryOptions = codePartsSeed.category || [];
  const genderOptions = codePartsSeed.gender || [];
  const typeOptions = codePartsSeed.type || [];
  const brandOptions = codePartsSeed.brand || [];
  const colorOptions = codePartsSeed.color || [];

  const [sizeInputs, setSizeInputs] = useState({
    S: '',
    M: '',
    L: '',
    XL: '',
    '2XL': '',
    '3XL': '',
    Free: '',
  });

  function getLabel(group, code) {
    const arr = codePartsSeed[group] || [];
    const found = arr.find((i) => i.code === code);
    return (found?.label || code || '').trim();
  }

  async function recomputeCode(next = {}) {
    const c = next.category ?? category;
    const g = next.gender ?? gender;
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
      const rows = await db.products
        .where('code')
        .startsWith(prefix + '-')
        .toArray();
      let maxN = 0;
      for (const r of rows) {
        const parts = String(r.code || '').split('-');
        const s = parts[parts.length - 1];
        const n = parseInt(s, 10);
        if (!Number.isNaN(n)) maxN = Math.max(maxN, n);
      }
      nextSerial = String(maxN + 1).padStart(2, '0');
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

    const exists = preview ? await db.products.where('code').equals(preview).first() : null;
    setDuplicate(!!exists);

    const name = `${getLabel('category', c)}-${getLabel('gender', g)}-${getLabel(
      'brand',
      b
    )}-${getLabel('color', k)}-${nextSerial}`;
    setNameKo(name);
  }

  async function handleSubmit(e) {
    e.preventDefault();
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

    const payload = {
      code: codePreview,
      nameKo: nameKo.trim(),
      priceCny: Number(priceCny || 0) || 0,
      salePricePhp: Number(salePricePhp || 0) || 0,
    };

    const savedCode = await saveProduct(payload);

    const changes = Object.fromEntries(
      Object.entries(sizeInputs).map(([k, v]) => [k, Number(v || 0) || 0])
    );
    await updateInv({ code: savedCode, changes });
    showToast(`Product added: ${savedCode}`);
    navigate('/inventory');
  }

  function handleRecalcClick() {
    // 현재 state 기준으로 다시 계산
    recomputeCode({});
  }

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <div className="page-title">Add Product</div>
          <div className="page-subtitle">
            Auto code generation and duplicate check based on seed-code-parts
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
                    value={gender}
                    onChange={(e) => {
                      setGender(e.target.value);
                      recomputeCode({ gender: e.target.value });
                    }}
                  >
                    <option value="">Select</option>
                    {genderOptions.map((item) => (
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
                <div className={`code-box ${duplicate ? 'code-box-error' : 'code-box-ok'}`}>
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
                    label="KRW Price"
                    type="number"
                    value={krwPrice}
                    onChange={(e) => setKrwPrice(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    label="Sale Price (PHP)"
                    type="number"
                    value={salePricePhp}
                    onChange={(e) => setSalePricePhp(e.target.value)}
                  />
                </div>
              </FormSection>

              <FormSection columns={2}>
                <div style={{ flex: 1 }}>
                  <Input
                    label="Product Name"
                    value={nameKo}
                    onChange={(e) => setNameKo(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    label="Cost (CNY)"
                    type="number"
                    value={priceCny}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setPriceCny(raw);
                      const v = Number(raw || 0) || 0;
                      setKrwPrice(String(Math.round(v * 220)));
                    }}
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
