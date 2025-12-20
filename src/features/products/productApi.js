// src/features/products/productApi.js
import { sbDelete, sbSelect, sbUpsert } from '../../db/supabaseRest';
import db from '../../db/dexieClient';
import { requireAdminOrThrow } from '../../utils/admin';

const SIZE_ORDER = ['S', 'M', 'L', 'XL', '2XL', '3XL', 'Free'];
const SIZE_TO_COLUMN = {
  S: 's',
  M: 'm',
  L: 'l',
  XL: 'xl',
  '2XL': '2xl',
  '3XL': '3xl',
  Free: 'free',
};

function isNetworkFailure(err) {
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return true;
  const msg = String(err?.message || '');
  return (
    msg === 'SUPABASE_CONFIG_MISSING' ||
    err?.name === 'TypeError' ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed')
  );
}

function normalizeSizeKey(size) {
  const s = String(size ?? '').trim();
  if (!s) return 'Free';
  const upper = s.toUpperCase();
  if (upper === 'FREE') return 'Free';
  if (upper === '2XL' || upper === '3XL') return upper;
  if (upper === 'XL') return 'XL';
  if (upper === 'S' || upper === 'M' || upper === 'L') return upper;
  return 'Free';
}

function sumInventoriesRow(row) {
  if (!row) return 0;
  return SIZE_ORDER.reduce((sum, sizeKey) => {
    const col = SIZE_TO_COLUMN[sizeKey];
    return sum + (Number(row?.[col] ?? 0) || 0);
  }, 0);
}

function inventoriesRowToInventoryList(code, row) {
  const c = String(code ?? row?.code ?? '').trim();
  if (!c) return [];
  return SIZE_ORDER.map((sizeKey) => {
    const col = SIZE_TO_COLUMN[sizeKey];
    return {
      id: `${c}|${sizeKey}`,
      code: c,
      size: sizeKey,
      stockQty: Number(row?.[col] ?? 0) || 0,
      sizeDisplay: sizeKey,
      location: null,
    };
  });
}

function normalizeProductRow(r) {
  if (!r) return null;
  const parsed = parseCode(r.code);
  return {
    code: r.code,
    nameKo: String(r.nameKo ?? r.name_ko ?? r.name ?? '').trim(),
    categoryCode: r.categoryCode ?? r.category_code ?? parsed.categoryCode,
    genderCode: r.genderCode ?? r.gender_code ?? parsed.genderCode,
    typeCode: r.typeCode ?? r.type_code ?? parsed.typeCode,
    brandCode: r.brandCode ?? r.brand_code ?? parsed.brandCode,
    colorCode: r.colorCode ?? r.color_code ?? parsed.colorCode,
    modelNo: r.modelNo ?? r.model_no ?? parsed.modelNo,
    priceCny: Number(r.priceCny ?? r.price_cny ?? 0) || 0,
    basePricePhp: Number(r.basePricePhp ?? r.base_price_php ?? 0) || 0,
    salePricePhp: Number(r.salePricePhp ?? r.sale_price_php ?? r.sale_price ?? 0) || 0,
    totalStock: Number(r.totalStock ?? r.total_stock ?? 0) || 0,
  };
}

function parseCode(code) {
  const [cg, typeCode, brandCode, colorCode, modelNo] = String(code || '').split('-');
  return {
    categoryCode: cg?.[0] ?? null,
    genderCode: cg?.[1] ?? null,
    typeCode: typeCode ?? null,
    brandCode: brandCode ?? null,
    colorCode: colorCode ?? null,
    modelNo: modelNo ?? null,
  };
}

function toDbProductRow(payload) {
  const code = String(payload?.code || '').trim();
  return {
    code,
    name: String(payload?.nameKo ?? payload?.name ?? '').trim(),
    sale_price: Number(payload?.salePricePhp ?? payload?.sale_price ?? 0) || 0,
    free_gift: Boolean(payload?.freeGift ?? payload?.free_gift ?? false),
  };
}

/**
 * 단일 상품 마스터
 */
export async function getProductByCode(code) {
  if (!code) return null;
  const c = String(code).trim();
  try {
    const rows = await sbSelect('products', {
      select: 'code,name,sale_price,free_gift',
      filters: [{ column: 'code', op: 'eq', value: c }],
      limit: 1,
    });
    return normalizeProductRow(rows?.[0]);
  } catch (e) {
    if (isNetworkFailure(e)) {
      return db.products.get(c);
    }
    throw e;
  }
}

/**
 * 단일 상품의 사이즈별 재고 목록
 */
export async function getInventoryByCode(code) {
  if (!code) return [];
  const c = String(code).trim();
  try {
    const rows = await sbSelect('inventories', {
      select: '*',
      filters: [{ column: 'code', op: 'eq', value: c }],
      limit: 1,
    });
    const row = rows?.[0];
    return inventoriesRowToInventoryList(c, row);
  } catch (e) {
    if (isNetworkFailure(e)) {
      return db.inventory.where('code').equals(c).toArray();
    }
    throw e;
  }
}

/**
 * 상품 + 재고를 합쳐서 반환
 */
export async function getProductWithInventory(code) {
  const [product, inventory] = await Promise.all([
    getProductByCode(code),
    getInventoryByCode(code),
  ]);

  if (!product) return null;

  // 재고 합계가 DB totalStock과 다르면 다시 계산
  const computedTotal = inventory.reduce((sum, r) => sum + (Number(r.stockQty) || 0), 0);

  // If we have inventory records, trust the computed total (even if 0).
  // Otherwise, fall back to product.totalStock.
  const totalStock = inventory.length > 0 ? computedTotal : product.totalStock || 0;

  return {
    ...product,
    totalStock,
    inventory, // [{ id, code, size, sizeDisplay, stockQty, location }]
  };
}

/**
 * 전체 상품 목록 + 각 상품의 사이즈별 재고/합계
 * - ProductListTable 용
 */
export async function getProductInventoryList() {
  try {
    const [productsRaw, inventoriesRaw] = await Promise.all([
      sbSelect('products', {
        select: 'code,name,sale_price,free_gift',
        order: { column: 'code', ascending: true },
      }),
      sbSelect('inventories', {
        select: '*',
        order: { column: 'code', ascending: true },
      }),
    ]);
    const products = (productsRaw || []).map(normalizeProductRow).filter(Boolean);
    const inventories = inventoriesRaw || [];
    const byCode = new Map((inventories || []).map((r) => [String(r?.code || '').trim(), r]));

    return products.map((p) => {
      const invRow = byCode.get(p.code);
      const totalStock = invRow ? sumInventoriesRow(invRow) : 0;
      const sizes = invRow ? inventoriesRowToInventoryList(p.code, invRow) : [];

      return {
        ...p,
        totalStock,
        sizes,
      };
    });
  } catch (e) {
    if (!isNetworkFailure(e)) throw e;

    const [products, inventoryRows] = await Promise.all([
      db.products.orderBy('code').toArray(),
      db.inventory.toArray(),
    ]);

    const map = new Map();
    (inventoryRows || []).forEach((row) => {
      const code = row.code;
      if (!code) return;
      if (!map.has(code)) map.set(code, { totalStock: 0, sizes: [] });
      const entry = map.get(code);
      entry.totalStock += Number(row.stockQty ?? 0) || 0;
      entry.sizes.push(row);
    });

    return (products || []).map((p) => {
      const entry = map.get(p.code) || { totalStock: 0, sizes: [] };
      const totalStock = entry.sizes.length > 0 ? entry.totalStock : p.totalStock || 0;
      return { ...p, totalStock, sizes: entry.sizes };
    });
  }
}

/**
 * 단순 검색 (코드 or 이름에 keyword 포함)
 */
export async function searchProducts(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) {
    return getProductInventoryList();
  }

  const lc = kw.toLowerCase();

  const list = await getProductInventoryList();
  return list.filter((p) => {
    const inCode = p.code.toLowerCase().includes(lc);
    const inName = (p.nameKo || '').toLowerCase().includes(lc);
    return inCode || inName;
  });
}

/**
 * 상품 저장(추가/수정)
 * - inventory는 건드리지 않고 products만 수정
 * - 새로운 코드면 insert, 기존이면 update
 *
 * payload: { code, nameKo?, salePricePhp?, priceCny?, totalStock? ... }
 */
export async function upsertProduct(payload) {
  requireAdminOrThrow();
  const code = String(payload.code || '').trim();
  if (!code) throw new Error('Product code is required.');
  const row = toDbProductRow(payload);
  try {
    await sbUpsert('products', [row], { onConflict: 'code', returning: 'minimal' });
    return code;
  } catch (e) {
    if (!isNetworkFailure(e)) throw e;
    return db.transaction('rw', db.products, db.logs, async () => {
      const existing = await db.products.get(code);
      if (existing) {
        const nextRow = { ...existing, ...payload, code };
        await db.products.put(nextRow);
        await db.logs
          .add({
            type: 'PRODUCT_UPDATE',
            time: new Date().toISOString(),
            code,
            data: JSON.stringify({ payload: nextRow }),
          })
          .catch(() => null);
        return code;
      }

      const parsed = parseCode(code);
      const nextRow = {
        code,
        nameKo: String(payload.nameKo ?? '').trim(),
        categoryCode: parsed.categoryCode,
        genderCode: parsed.genderCode,
        typeCode: parsed.typeCode,
        brandCode: parsed.brandCode,
        colorCode: parsed.colorCode,
        modelNo: parsed.modelNo,
        priceCny: Number(payload.priceCny ?? 0) || 0,
        basePricePhp: Number(payload.basePricePhp ?? 0) || 0,
        salePricePhp: Number(payload.salePricePhp ?? 0) || 0,
        totalStock: Number(payload.totalStock ?? 0) || 0,
      };
      await db.products.add(nextRow);
      await db.logs
        .add({
          type: 'PRODUCT_ADD',
          time: new Date().toISOString(),
          code,
          data: JSON.stringify({ payload: nextRow }),
        })
        .catch(() => null);
      return code;
    });
  }
}

/**
 * 상품 삭제
 * - products + inventory 모두 제거
 * - 판매 이력은 남겨둔다 (history 보존)
 */
export async function deleteProduct(code) {
  requireAdminOrThrow();
  if (!code) return;
  const c = String(code).trim();
  try {
    await sbDelete('inventories', { filters: [{ column: 'code', op: 'eq', value: c }] });
    await sbDelete('products', { filters: [{ column: 'code', op: 'eq', value: c }] });
  } catch (e) {
    if (!isNetworkFailure(e)) throw e;
    await db.transaction('rw', db.products, db.inventory, db.logs, async () => {
      await db.products.delete(c);
      await db.inventory.where('code').equals(c).delete();
      await db.logs
        .add({ type: 'PRODUCT_DELETE', time: new Date().toISOString(), code: c })
        .catch(() => null);
    });
  }
}

/**
 * 코드 중복 여부 확인
 */
export async function isProductCodeExists(code) {
  if (!code) return false;
  const c = String(code).trim();
  try {
    const rows = await sbSelect('products', {
      select: 'code',
      filters: [{ column: 'code', op: 'eq', value: c }],
      limit: 1,
    });
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    if (isNetworkFailure(e)) {
      const row = await db.products.get(c);
      return !!row;
    }
    throw e;
  }
}

export async function updateInventoryQuantities(code, sizeQtyMap) {
  requireAdminOrThrow();
  if (!code) throw new Error('Code is required.');
  const c = String(code).trim();

  try {
    const changes = {};
    for (const [sizeRaw, qty] of Object.entries(sizeQtyMap || {})) {
      const sizeKey = normalizeSizeKey(sizeRaw);
      const col = SIZE_TO_COLUMN[sizeKey];
      if (!col) continue;
      changes[col] = Number(qty) || 0;
    }

    await sbUpsert('inventories', [{ code: c, ...changes }], { onConflict: 'code', returning: 'minimal' });

    const invRows = await sbSelect('inventories', {
      select: '*',
      filters: [{ column: 'code', op: 'eq', value: c }],
      limit: 1,
    });
    const row = invRows?.[0];
    return { code: c, totalStock: sumInventoriesRow(row) };
  } catch (e) {
    if (!isNetworkFailure(e)) throw e;
    return db.transaction('rw', db.products, db.inventory, db.logs, async () => {
      const entries = Object.entries(sizeQtyMap || {});
      for (const [sizeRaw, qty] of entries) {
        const size = normalizeSizeKey(sizeRaw);
        const invRow = await db.inventory.where('[code+size]').equals([c, size || '']).first();
        if (invRow) {
          await db.inventory.update(invRow.id, { stockQty: Number(qty) || 0 });
        } else {
          await db.inventory.add({
            code: c,
            size,
            stockQty: Number(qty) || 0,
            sizeDisplay: size,
          });
        }
      }
      const inv = await db.inventory.where('code').equals(c).toArray();
      const total = (inv || []).reduce((s, r) => s + (Number(r.stockQty) || 0), 0);
      const product = await db.products.get(c);
      if (product) await db.products.update(c, { totalStock: total });
      await db.logs
        .add({
          type: 'INVENTORY_UPDATE',
          time: new Date().toISOString(),
          code: c,
          data: JSON.stringify({ changes: entries }),
        })
        .catch(() => null);
      return { code: c, totalStock: total };
    });
  }
}

export async function getNextSerialForPrefix(prefix) {
  const p = String(prefix || '').trim();
  if (!p) return '01';
  try {
    const rows = await sbSelect('products', {
      select: 'code',
      filters: [{ column: 'code', op: 'like', value: `${p}-%` }],
    });
    let maxN = 0;
    for (const r of rows || []) {
      const code = String(r?.code || '');
      const parts = code.split('-');
      const s = parts[parts.length - 1];
      const n = parseInt(s, 10);
      if (!Number.isNaN(n)) maxN = Math.max(maxN, n);
    }
    return String(maxN + 1).padStart(2, '0');
  } catch (e) {
    if (!isNetworkFailure(e)) throw e;
    const rows = await db.products.where('code').startsWith(`${p}-`).toArray();
    let maxN = 0;
    for (const r of rows || []) {
      const code = String(r?.code || '');
      const parts = code.split('-');
      const s = parts[parts.length - 1];
      const n = parseInt(s, 10);
      if (!Number.isNaN(n)) maxN = Math.max(maxN, n);
    }
    return String(maxN + 1).padStart(2, '0');
  }
}
