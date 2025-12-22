import fs from 'node:fs';

function readEnvValue(envText, key) {
  const m = envText.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return (m?.[1] ?? '').trim();
}

const envText = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
const baseUrl = readEnvValue(envText, 'VITE_SUPABASE_URL').replace(/\/+$/, '');
const anonKey = readEnvValue(envText, 'VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY');

if (!baseUrl || !anonKey) {
  process.stdout.write('Missing Supabase config in .env.local\n');
  process.exit(1);
}

const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
};

async function fetchAllCodes(table) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const u = new URL(`${baseUrl}/rest/v1/${table}`);
    u.searchParams.set('select', 'code');
    u.searchParams.set('limit', '1000');
    u.searchParams.set('offset', String(offset));
    const res = await fetch(u, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${table} ${res.status} ${text}`);
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) out.push(String(r?.code ?? ''));
  }
  return out;
}

function normalize(code) {
  return String(code ?? '').trim();
}

function duplicates(arr) {
  const m = new Map();
  for (const v of arr) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
}

const [productsRaw, inventoriesRaw] = await Promise.all([
  fetchAllCodes('products'),
  fetchAllCodes('inventories'),
]);

const products = productsRaw.map(normalize).filter(Boolean);
const inventories = inventoriesRaw.map(normalize).filter(Boolean);
const productsSet = new Set(products);
const inventoriesSet = new Set(inventories);

const onlyInProducts = [...productsSet].filter((c) => !inventoriesSet.has(c)).sort();
const onlyInInventories = [...inventoriesSet].filter((c) => !productsSet.has(c)).sort();
const productsDup = duplicates(products);
const inventoriesDup = duplicates(inventories);

const summary = {
  products_total_rows: productsRaw.length,
  products_nonempty_codes: products.length,
  products_unique_codes: productsSet.size,
  inventories_total_rows: inventoriesRaw.length,
  inventories_nonempty_codes: inventories.length,
  inventories_unique_codes: inventoriesSet.size,
  only_in_products_unique: onlyInProducts.length,
  only_in_inventories_unique: onlyInInventories.length,
  products_duplicate_codes: productsDup.length,
  inventories_duplicate_codes: inventoriesDup.length,
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`only_in_products_sample: ${onlyInProducts.slice(0, 30).join(' | ')}\n`);
process.stdout.write(`only_in_inventories_sample: ${onlyInInventories.slice(0, 30).join(' | ')}\n`);
process.stdout.write(
  `products_dups_sample: ${productsDup
    .slice(0, 15)
    .map(([c, n]) => `${c}(${n})`)
    .join(' | ')}\n`
);
process.stdout.write(
  `inventories_dups_sample: ${inventoriesDup
    .slice(0, 15)
    .map(([c, n]) => `${c}(${n})`)
    .join(' | ')}\n`
);

