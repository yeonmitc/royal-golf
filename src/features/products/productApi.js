// src/features/products/productApi.js
import db from '../../db/dexieClient';
import { sbDelete, sbInsert, sbSelect, sbUpdate, sbUpsert } from '../../db/supabaseRest';
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
    no: Number(r.no ?? 0) || 0,
    nameKo: String(r.nameKo ?? r.name_ko ?? r.name ?? '').trim(),
    categoryCode: r.categoryCode ?? r.category_code ?? parsed.categoryCode,
    genderCode: r.genderCode ?? r.gender_code ?? parsed.genderCode,
    typeCode: r.typeCode ?? r.type_code ?? parsed.typeCode,
    brandCode: r.brandCode ?? r.brand_code ?? parsed.brandCode,
    colorCode: r.colorCode ?? r.color_code ?? parsed.colorCode,
    modelNo: r.modelNo ?? r.model_no ?? parsed.modelNo,
    priceCny: Number(r.priceCny ?? r.price_cny ?? r.cprice ?? 0) || 0, // cprice alias
    cprice: Number(r.cprice ?? r.priceCny ?? r.price_cny ?? 0) || 0,
    kprice: Number(r.kprice ?? r.krwPrice ?? 0) || 0,
    p1price: Number(r.p1price ?? 0) || 0,
    p2price: Number(r.p2price ?? 0) || 0,
    p3price: Number(r.p3price ?? 0) || 0,
    basePricePhp: Number(r.basePricePhp ?? r.base_price_php ?? 0) || 0,
    salePricePhp: Number(r.salePricePhp ?? r.sale_price_php ?? r.sale_price ?? 0) || 0,
    totalStock: Number(r.totalStock ?? r.total_stock ?? 0) || 0,
    freeGift: Boolean(r.freeGift ?? r.free_gift ?? false),
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

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function toDbProductRow(payload) {
  const code = String(payload?.code || '').trim();
  const out = {
    code,
    name: String(payload?.nameKo ?? payload?.name ?? '').trim(),
    free_gift:
      hasOwn(payload, 'freeGift') || hasOwn(payload, 'free_gift')
        ? Boolean(payload?.freeGift ?? payload?.free_gift)
        : undefined,
  };
  if (hasOwn(payload, 'salePricePhp') || hasOwn(payload, 'sale_price')) {
    out.sale_price = Number(payload?.salePricePhp ?? payload?.sale_price ?? 0) || 0;
  }
  if (hasOwn(payload, 'no')) out.no = Number(payload?.no ?? 0) || 0;
  if (hasOwn(payload, 'qty')) out.qty = Number(payload?.qty ?? 0) || 0;
  if (hasOwn(payload, 'kprice') || hasOwn(payload, 'krwPrice')) {
    out.kprice = Number(payload?.kprice ?? payload?.krwPrice ?? 0) || 0;
  }
  if (hasOwn(payload, 'cprice') || hasOwn(payload, 'priceCny')) {
    out.cprice = Number(payload?.cprice ?? payload?.priceCny ?? 0) || 0;
  }
  if (hasOwn(payload, 'p1price')) out.p1price = Number(payload?.p1price ?? 0) || 0;
  if (hasOwn(payload, 'p2price')) out.p2price = Number(payload?.p2price ?? 0) || 0;
  if (hasOwn(payload, 'p3price')) out.p3price = Number(payload?.p3price ?? 0) || 0;
  return out;
}

async function getNextNo(table) {
  const topRows = await sbSelect(table, {
    select: 'no',
    filters: [{ column: 'no', op: 'not.is', value: 'null' }],
    order: { column: 'no', ascending: false, nulls: 'last' },
    limit: 1,
  });
  const topNo = Number(topRows?.[0]?.no ?? 0) || 0;
  if (topNo > 0) return topNo + 1;

  const anyRows = await sbSelect(table, { select: 'no', limit: 1 });
  if (!Array.isArray(anyRows) || anyRows.length === 0) return 1;

  let offset = 0;
  let maxNo = 0;
  while (true) {
    const rows = await sbSelect(table, { select: 'no', limit: 1000, offset });
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) {
      const n = Number(r?.no ?? 0) || 0;
      if (n > maxNo) maxNo = n;
    }
    if (rows.length < 1000) break;
    offset += 1000;
    if (offset > 50000) break;
  }
  return (maxNo || 0) + 1;
}

export async function getNextProductNo() {
  return getNextNo('products');
}

async function getNextInventoryNo() {
  return getNextNo('inventories');
}

/**
 * 단일 상품 마스터
 */
export async function getProductByCode(code) {
  if (!code) return null;
  const c = String(code).trim();
  try {
    const rows = await sbSelect('products', {
      select: '*',
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
    const [productsRaw, inventoriesRaw, errorStocksRaw] = await Promise.all([
      sbSelect('products', {
        select: 'code,name,sale_price,free_gift,no,kprice',
        order: { column: 'code', ascending: true },
      }),
      sbSelect('inventories', {
        select: '*',
        order: { column: 'code', ascending: true },
      }),
      sbSelect('erro_stock', {
        select: 'code,memo',
      }),
    ]);
    const products = (productsRaw || []).map(normalizeProductRow).filter(Boolean);
    const inventories = inventoriesRaw || [];
    const errorStocks = errorStocksRaw || [];
    const byCode = new Map((inventories || []).map((r) => [String(r?.code || '').trim(), r]));
    const memoByCode = new Map((errorStocks || []).map((r) => [String(r?.code || '').trim(), r.memo]));

    return products.map((p) => {
      const invRow = byCode.get(p.code);
      const totalStock = invRow ? sumInventoriesRow(invRow) : 0;
      const sizes = invRow ? inventoriesRowToInventoryList(p.code, invRow) : [];

      return {
        ...p,
        totalStock,
        sizes,
        check_status: invRow?.check_status || 'unchecked',
        check_updated_at: invRow?.check_updated_at || null,
        error_memo: memoByCode.get(p.code) || '',
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
      return { 
        ...p, 
        totalStock, 
        sizes: entry.sizes,
        check_status: p.check_status || 'unchecked',
        check_updated_at: p.check_updated_at || null,
      };
    });
  }
}

export async function updateInventoryStatus(code, status) {
  // requireAdminOrThrow(); // Stock check allowed for staff
  if (!code) throw new Error('Code is required.');
  const c = String(code).trim();
  const now = new Date().toISOString();

  // 1. Optimistically update Dexie (Local First)
  try {
    await db.products.update(c, { 
      check_status: status,
      check_updated_at: now
    });
  } catch (dexieErr) {
    console.warn('Failed to update Dexie:', dexieErr);
  }

  // 2. Update Supabase
  try {
    await sbUpdate(
      'inventories',
      {
        check_status: status,
        check_updated_at: now,
      },
      {
        filters: [{ column: 'code', op: 'eq', value: c }],
        returning: 'minimal',
      }
    );
  } catch (e) {
    if (isNetworkFailure(e)) {
      console.warn('Network failure during status update. Saved to local DB.');
      return;
    }
    throw e;
  }
}

export async function batchUpdateInventoryStatus(changes) {
  // changes: { [code]: status }
  if (!changes || Object.keys(changes).length === 0) return;
  const now = new Date().toISOString();
  
  const entries = Object.entries(changes);
  
  // 1. Update Dexie in bulk (parallel is fine for local IDB)
  try {
    const promises = entries.map(([code, status]) => 
      db.products.update(code, { check_status: status, check_updated_at: now })
    );
    await Promise.all(promises);
  } catch (dexieErr) {
    console.warn('Failed to batch update Dexie:', dexieErr);
  }

  // 2. Update Supabase with concurrency control
  // Since we don't have a bulk update RPC, we run updates in chunks.
  const CHUNK_SIZE = 5; 
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(([code, status]) => 
      sbUpdate(
        'inventories',
        { check_status: status, check_updated_at: now },
        {
          filters: [{ column: 'code', op: 'eq', value: code }],
          returning: 'minimal',
        }
      ).catch(e => {
        if (!isNetworkFailure(e)) console.error(`Failed to update ${code}:`, e);
      })
    ));
  }
}

export async function upsertErroStock({ code, memo }) {
  if (!code) throw new Error('Code is required.');
  const c = String(code).trim();
  const m = String(memo || '').trim();
  const now = new Date().toISOString();

  // Parallel: Local Dexie + Remote erro_stock
  // Note: We rely on DB Triggers to update 'inventories.check_status' on the server.
  await Promise.all([
    // 1. Update Dexie (Local First) - Critical for offline support
    db.products.update(c, { 
      error_memo: m,
      check_status: 'error',
      check_updated_at: now
    }).catch(dexieErr => console.warn('Failed to update Dexie error_memo:', dexieErr)),

    // 2. erro_stock upsert (Supabase)
    (async () => {
      try {
        // Check if record exists
        const existing = await sbSelect('erro_stock', {
          select: 'id',
          filters: [{ column: 'code', op: 'eq', value: c }],
          limit: 1,
        });
        
        if (Array.isArray(existing) && existing.length > 0) {
          // Update
          await sbUpdate('erro_stock', { memo: m, updated_at: now }, {
            filters: [{ column: 'code', op: 'eq', value: c }],
            returning: 'minimal',
          });
        } else {
          // Insert
          await sbInsert('erro_stock', [{ code: c, memo: m, updated_at: now }], {
            returning: 'minimal',
          });
        }
      } catch (e) {
        console.error('Supabase save error:', e);
        throw e;
      }
    })(),

    // 3. Explicitly update inventories (Supabase)
    sbUpdate('inventories', {
      check_status: 'error',
      check_updated_at: now
    }, {
      filters: [{ column: 'code', op: 'eq', value: c }],
      returning: 'minimal',
    }).catch(e => console.warn('Failed to explicit update inventories (upsert error):', e))
  ]);
}

export async function deleteErroStock(code) {
  if (!code) throw new Error('Code is required.');
  const c = String(code).trim();
  const now = new Date().toISOString();

  // Parallel: Local Dexie + Remote erro_stock
  // Note: We rely on DB Triggers to update 'inventories.check_status' on the server.
  // UPDATE: We also explicitly update inventories to ensure consistency even if trigger fails.
  await Promise.all([
    // 1. Update Dexie (Local First)
    db.products.update(c, { 
      error_memo: '',
      check_status: 'unchecked',
      check_updated_at: now
    }).catch(dexieErr => console.warn('Failed to update Dexie error_memo:', dexieErr)),

    // 2. erro_stock delete (Supabase)
    sbDelete('erro_stock', {
      filters: [{ column: 'code', op: 'eq', value: c }],
      returning: 'representation',
    }).then(rows => {
      if (!rows || rows.length === 0) {
        console.warn('DELETE_NO_MATCH: No rows deleted from erro_stock. Check RLS policies.');
      }
      return rows;
    }).catch(e => {
      console.error('Supabase delete error:', e);
      throw e;
    }),

    // 3. Explicitly update inventories (Supabase)
    sbUpdate('inventories', {
      check_status: 'unchecked',
      check_updated_at: now
    }, {
      filters: [{ column: 'code', op: 'eq', value: c }],
      returning: 'minimal',
    }).catch(e => console.warn('Failed to explicit update inventories (delete error):', e))
  ]);
}

export async function getErroStock(code) {
  if (!code) return null;
  const c = String(code).trim();
  try {
    const rows = await sbSelect('erro_stock', {
      select: 'memo',
      filters: [{ column: 'code', op: 'eq', value: c }],
      limit: 1,
    });
    return rows?.[0] || null;
  } catch (e) {
    if (isNetworkFailure(e)) return null; // Offline fallback: cannot fetch memo
    throw e;
  }
}

export async function resetAllInventoryStatus() {
  // requireAdminOrThrow();
  const now = new Date().toISOString();

  // 1. Dexie (Local)
  try {
    await db.products.toCollection().modify({ 
      check_status: 'unchecked',
      check_updated_at: now
    });
  } catch (dexieErr) {
    console.warn('Failed to reset Dexie:', dexieErr);
  }

  // 2. Supabase
  try {
    await sbUpdate(
      'inventories',
      { check_status: 'unchecked', check_updated_at: now },
      {
        filters: [{ column: 'check_status', op: 'neq', value: 'unchecked' }],
        returning: 'minimal',
      }
    );
  } catch (e) {
    if (isNetworkFailure(e)) {
      console.warn('Network failure during reset. Saved to local DB.');
      return;
    }
    throw e;
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
  const values = {};
  if (row.name !== undefined) values.name = row.name;
  if (row.sale_price !== undefined) values.sale_price = row.sale_price;
  if (row.free_gift !== undefined) values.free_gift = row.free_gift;
  if (row.qty !== undefined) values.qty = row.qty;
  if (row.kprice !== undefined) values.kprice = row.kprice;
  if (row.cprice !== undefined) values.cprice = row.cprice;
  if (row.p1price !== undefined) values.p1price = row.p1price;
  if (row.p2price !== undefined) values.p2price = row.p2price;
  if (row.p3price !== undefined) values.p3price = row.p3price;

  const existing = await sbSelect('products', {
    select: 'code',
    filters: [{ column: 'code', op: 'eq', value: code }],
    limit: 1,
  });
  if (Array.isArray(existing) && existing.length > 0) {
    await sbUpdate('products', values, {
      filters: [{ column: 'code', op: 'eq', value: code }],
      returning: 'minimal',
    });
  } else {
    const nextNo = row.no ? row.no : await getNextProductNo();
    const insertValues = { ...values };
    if (row.no !== undefined || nextNo) insertValues.no = nextNo;
    if (insertValues.qty === undefined) insertValues.qty = 0;
    if (insertValues.kprice === undefined) insertValues.kprice = 0;
    if (insertValues.cprice === undefined) insertValues.cprice = 0;
    if (insertValues.p1price === undefined) insertValues.p1price = 0;
    if (insertValues.p2price === undefined) insertValues.p2price = 0;
    if (insertValues.p3price === undefined) insertValues.p3price = 0;
    await sbInsert('products', [{ code, ...insertValues }], { returning: 'minimal' });
  }
  return code;
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
  await sbDelete('inventories', {
    filters: [{ column: 'code', op: 'eq', value: c }],
    returning: 'representation',
  });
  await sbDelete('products', {
    filters: [{ column: 'code', op: 'eq', value: c }],
    returning: 'representation',
  });
  const stillThere = await sbSelect('products', {
    select: 'code',
    filters: [{ column: 'code', op: 'eq', value: c }],
    limit: 1,
  });
  if (Array.isArray(stillThere) && stillThere.length > 0) {
    throw new Error('DELETE_NOT_APPLIED');
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

  const changes = {};
  for (const [sizeRaw, qty] of Object.entries(sizeQtyMap || {})) {
    const sizeKey = normalizeSizeKey(sizeRaw);
    const col = SIZE_TO_COLUMN[sizeKey];
    if (!col) continue;
    changes[col] = Number(qty) || 0;
  }

  const existingRows = await sbSelect('inventories', {
    select: '*',
    filters: [{ column: 'code', op: 'eq', value: c }],
    limit: 1,
  });
  const existingRow = existingRows?.[0];
  const hasExisting = Array.isArray(existingRows) && existingRows.length > 0;

  if (hasExisting) {
    // DB trigger `set_inventory_total_qty` will auto-calculate total_qty
    // DB trigger `sync_products_qty_from_inventories` will auto-update products.qty
    const values = { ...changes };
    const existingNo = Number(existingRow?.no ?? 0) || 0;
    if (!existingNo) {
      values.no = await getNextInventoryNo();
    }
    await sbUpdate('inventories', values, {
      filters: [{ column: 'code', op: 'eq', value: c }],
      returning: 'minimal',
    });
  } else {
    const insertRow = { code: c };
    for (const sizeKey of SIZE_ORDER) {
      const col = SIZE_TO_COLUMN[sizeKey];
      insertRow[col] = 0;
    }
    Object.assign(insertRow, changes);
    // insertRow.total_qty = sumInventoriesRow(insertRow); // Handled by trigger
    insertRow.no = await getNextInventoryNo();
    await sbInsert('inventories', [insertRow], { returning: 'minimal' });
  }

  // Fetch updated row to return correct total
  const invRows = await sbSelect('inventories', {
    select: '*',
    filters: [{ column: 'code', op: 'eq', value: c }],
    limit: 1,
  });
  const row = invRows?.[0];
  return { code: c, totalStock: sumInventoriesRow(row) };
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
