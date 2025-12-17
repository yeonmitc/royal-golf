// src/components/products/CodePreviewGenerator.jsx
import { useState } from 'react';
import db from '../../db/dexieClient';
import codeParts from '../../db/seed/seed-code-parts.json';
import { generateProductCode } from '../../utils/codeGenerator';
import Button from '../common/Button';
import Input from '../common/Input';
import Select from '../common/Select';

export default function CodePreviewGenerator() {
  const [category1, setCategory1] = useState('');
  const [category2, setCategory2] = useState('');
  const [type, setType] = useState('');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [serial, setSerial] = useState('01');

  const [duplicateMessage, setDuplicateMessage] = useState('');

  // seed-code-parts 기반 옵션
  const category1Options = codeParts.category1 || [];
  const category2Options = codeParts.category2 || [];
  const typeOptions = codeParts.type || [];
  const brandOptions = codeParts.brand || [];
  const colorOptions = codeParts.color || [];

  // 🔥 실시간 코드 미리보기 (React Compiler 친화적으로: 그냥 파생값)
  const preview = generateProductCode({
    category1,
    category2,
    type,
    brand,
    color,
    serial,
  });

  // 🔥 코드 중복 확인
  const checkDuplicate = async () => {
    if (!preview) {
      setDuplicateMessage('Generate the code first.');
      return;
    }

    const exists = await db.products.where('code').equals(preview).first();

    if (exists) {
      setDuplicateMessage('❌ Code already exists');
    } else {
      setDuplicateMessage('✅ Code is available');
    }
  };

  return (
    <div className="p-4 border rounded shadow bg-white space-y-4">
      <h2 className="text-xl font-semibold">Product Code Generator</h2>

      <div className="grid grid-cols-2 gap-4">
        <Select label="Category 1" value={category1} onChange={(e) => setCategory1(e.target.value)}>
          <option value="">Select</option>
          {category1Options.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label} ({item.code})
            </option>
          ))}
        </Select>

        <Select label="Category 2" value={category2} onChange={(e) => setCategory2(e.target.value)}>
          <option value="">Select</option>
          {category2Options.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label} ({item.code})
            </option>
          ))}
        </Select>

        <Select label="Type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Select</option>
          {typeOptions.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label} ({item.code})
            </option>
          ))}
        </Select>

        <Select label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">Select</option>
          {brandOptions.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label} ({item.code})
            </option>
          ))}
        </Select>

        <Select label="Color" value={color} onChange={(e) => setColor(e.target.value)}>
          <option value="">Select</option>
          {colorOptions.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label} ({item.code})
            </option>
          ))}
        </Select>

        <Input label="Serial Number" value={serial} onChange={(e) => setSerial(e.target.value)} />
      </div>

      <div className="mt-2">
        <div className="font-semibold">Generated Code:</div>
        <div className="text-lg font-mono bg-gray-100 p-2 rounded">{preview || '-'}</div>
      </div>

      <Button onClick={checkDuplicate}>Check Code Duplicate</Button>

      {duplicateMessage && <div className="mt-2 text-sm font-semibold">{duplicateMessage}</div>}
    </div>
  );
}
