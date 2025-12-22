import { useState } from 'react';
import ProductLookup from '../features/products/components/ProductLookup';
import ProductScanResult from '../features/products/components/ProductScanResult';

export default function HomePage() {
  const [code, setCode] = useState(() => sessionStorage.getItem('lastLookupCode') || '');
  const handleCodeChange = (val) => {
    setCode(val);
    sessionStorage.setItem('lastLookupCode', val || '');
  };
  return (
    <div className="page-root">
      <ProductLookup code={code} onCodeChange={handleCodeChange} />

      <section className="page-card">
        <ProductScanResult code={code} />
      </section>
    </div>
  );
}
