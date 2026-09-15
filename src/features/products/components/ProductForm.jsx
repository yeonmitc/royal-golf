// src/features/products/components/ProductForm.jsx
import { useState } from 'react';
import Input from '../../../components/common/Input';
import { useProductCodeExists, useUpsertProductMutation } from '../productHooks';
import { useToast } from '../../../context/ToastContext';
import { normalizeAppError } from '../../../utils/errorHandler';

/**
 * 상품 등록/수정 폼
 *
 * props:
 * - initialProduct?: { code, nameKo, salePricePhp, priceCny }
 * - onSaved?: (code) => void
 * - onCancel?: () => void
 *
 * ⚠️ React 19: effect 안에서 setState 금지 경고 때문에
 *   useEffect로 값 동기화하지 않고,
 *   useState 초기값 + 부모 컴포넌트의 key로 리마운트 패턴을 사용.
 */
export default function ProductForm({ initialProduct, onSaved, onCancel }) {
  const isEdit = !!initialProduct;

  // 👉 mount 시점에만 initialProduct를 읽어서 초기값 설정
  const [code, setCode] = useState(initialProduct?.code || '');
  const [nameKo, setNameKo] = useState(initialProduct?.nameKo || '');
  const [salePricePhp, setSalePricePhp] = useState(initialProduct?.salePricePhp ?? '');

  const { data: codeExists } = useProductCodeExists(code);
  const { mutateAsync: saveProduct, isPending, error: saveError } = useUpsertProductMutation();
  const { showToast, showToastTyped } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!code.trim()) {
      showToast('Product code is required.');
      return;
    }

    if (!nameKo.trim()) {
      showToast('Please enter product name.');
      return;
    }

    // 신규 등록일 때만 중복 체크
    if (!isEdit && codeExists) {
      showToast('Product code already exists.');
      return;
    }

    const payload = {
      code: code.trim(),
      nameKo: nameKo.trim(),
      salePricePhp: Number(salePricePhp || 0) || 0,
    };

    try {
      const savedCode = await saveProduct(payload);
      if (onSaved) onSaved(savedCode);
    } catch (e) {
      console.error(e);
      showToastTyped(normalizeAppError(e, {
        code: isEdit ? 'PRODUCT_UPDATE_FAILED' : 'PRODUCT_CREATE_FAILED',
        fallbackMessage: isEdit ? 'Product could not be updated.' : 'Product could not be created.',
      }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 border rounded-md bg-white">
      <div>
        <Input
          label="Product Code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={isEdit}
        />
        {!isEdit && code && codeExists && (
          <p className="mt-1 text-xs text-red-600">Code already exists.</p>
        )}
      </div>

      <div>
        <Input
          label="Product Name"
          type="text"
          value={nameKo}
          onChange={(e) => setNameKo(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Sale Price (PHP)"
          type="number"
          value={salePricePhp}
          onChange={(e) => setSalePricePhp(e.target.value)}
        />
      </div>

      {saveError && <p className="text-xs text-red-600">Error while saving: {String(saveError)}</p>}

      <div className="flex justify-end space-x-2 pt-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-3 py-1 text-xs border rounded">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="px-3 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-60"
        >
          {isEdit ? 'Save Changes' : 'Create'}
        </button>
      </div>
    </form>
  );
}
