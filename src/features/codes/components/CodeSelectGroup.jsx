// src/features/codes/components/CodeSelectGroup.jsx
import { useCodePart } from '../codeHooks';

/**
 * CodeSelectGroup
 *
 * props:
 * - label: "상품분류 1" 같은 텍스트
 * - type: "category1" | "category2" | "type" | "brand" | "color"
 * - value: 현재 선택된 값
 * - onChange: (newValue) => void
 */
export default function CodeSelectGroup({ label, type, value, onChange }) {
  const { data: items, isLoading, error } = useCodePart(type);

  return (
    <div className="space-y-1">
      {label && <label className="block text-xs font-semibold text-gray-700">{label}</label>}

      <select
        className="w-full border rounded px-2 py-1 text-sm"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={isLoading}
      >
        <option value="">Select</option>

        {items?.map((part) => (
          <option key={part.id} value={part.code}>
            {part.labelKo} ({part.code})
          </option>
        ))}
      </select>

      {error && <p className="text-red-500 text-xs">Failed to load code info.</p>}
    </div>
  );
}
