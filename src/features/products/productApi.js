// src/features/products/productApi.js
import db from '../../db/dexieClient';
import { sbDelete, sbInsert, sbSelect, sbUpdate, sbRpc } from '../../db/supabaseRest';
import { requireAdminOrThrow } from '../../utils/admin';
import codePartsSeed from '../../db/seed/seed-code-parts.json';
import { getSizeOptionsByCode } from '../../utils/sizeMapper';

const SIZE_ORDER = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL', 'Free'];

/**
 * 🧪 상품 코드 Part 검증 (5개 파트)
 * 코드 형식: {CK}-{TP}-{BR}-{CL}-{NN} (대시 4개 = 5파트)
 *   Part0 (2글자): 첫글자=category, 두번째=kind
 *   Part1 (2글자): type (TP, BT, GG, DR, ...)
 *   Part2 (2글자): brand (AC, VS, AD, ...)
 *   Part3 (2글자): color (WH, BK, SB, ...)
 *   Part4 (2자리): serial 번호 (01~99)
 *
 * 유효하지 않을 경우 에러 메시지 throw, 아니면 true 반환
 */
export function validateProductCode(rawCode) {
  const code = String(rawCode || '')
    .trim()
    .toUpperCase();
  if (!code) throw new Error('코드를 입력해주세요.');

  const parts = code.split('-');
  if (parts.length !== 5) {
    throw new Error(`코드 형식 오류: 5개 파트(대시 4개)로 구성되어야 합니다. (예: GM-TP-AC-WH-06)`);
  }

  const [pCk, pType, pBrand, pColor, pSerial] = parts;

  if (pCk.length !== 2) throw new Error(`Part0 (카테고리+성별)은 2글자여야 합니다. (현재: ${pCk})`);
  const catList = (codePartsSeed.category || []).map((i) => String(i.code || '').toUpperCase());
  const kindList = (codePartsSeed.kind || []).map((i) => String(i.code || '').toUpperCase());
  if (!catList.includes(pCk[0])) {
    throw new Error(`Part0 첫글자(카테고리) 오류. 허용: [${catList.join(', ')}] (현재: ${pCk[0]})`);
  }
  if (!kindList.includes(pCk[1])) {
    throw new Error(
      `Part0 두번째글자(종류) 오류. 허용: [${kindList.join(', ')}] (현재: ${pCk[1]})`
    );
  }

  const typeList = (codePartsSeed.type || []).map((i) => String(i.code || '').toUpperCase());
  if (!typeList.includes(pType)) {
    throw new Error(`Part1 (타입) 오류. 허용: [${typeList.join(', ')}] (현재: ${pType})`);
  }

  const brandList = (codePartsSeed.brand || []).map((i) => String(i.code || '').toUpperCase());
  if (!brandList.includes(pBrand)) {
    throw new Error(`Part2 (브랜드) 오류. 허용: [${brandList.join(', ')}] (현재: ${pBrand})`);
  }

  const colorList = (codePartsSeed.color || []).map((i) => String(i.code || '').toUpperCase());
  if (!colorList.includes(pColor)) {
    throw new Error(`Part3 (색상) 오류. 허용: [${colorList.join(', ')}] (현재: ${pColor})`);
  }

  if (!/^\d{2}$/.test(pSerial)) {
    throw new Error(`Part4 (일련번호) 오류. 2자리 숫자여야 합니다. (현재: ${pSerial})`);
  }

  return true;
}
const SIZE_TO_COLUMN = {
  S: 's',
  M: 'm',
  L: 'l',
  XL: 'xl',
  '2XL': '2xl',
  '3XL': '3xl',
  '4XL': '4xl',
  '5XL': '5xl',
  '6XL': '6xl',
  '7XL': '7xl',
  '8XL': '8xl',
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
  if (['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'].includes(upper)) {
    return upper;
  }
  return 'Free';
}

function sumInventoriesRow(row, code) {
  if (!row) return 0;
  const baseCode = String(code ?? row?.code ?? '').trim();
  const allowedKeys = baseCode
    ? new Set(getSizeOptionsByCode(baseCode).map((opt) => String(opt.key || '').toUpperCase()))
    : null;
  return SIZE_ORDER.reduce((sum, sizeKey) => {
    if (allowedKeys && !allowedKeys.has(String(sizeKey || '').toUpperCase())) {
      return sum;
    }
    const col = SIZE_TO_COLUMN[sizeKey];
    return sum + (Number(row?.[col] ?? 0) || 0);
  }, 0);
}

function inventoriesRowToInventoryList(code, row) {
  const c = String(code ?? row?.code ?? '').trim();
  if (!c) return [];
  const allowedKeys = new Set(
    getSizeOptionsByCode(c).map((opt) => String(opt.key || '').toUpperCase())
  );
  return SIZE_ORDER.filter((sizeKey) => allowedKeys.has(String(sizeKey || '').toUpperCase())).map(
    (sizeKey) => {
      const col = SIZE_TO_COLUMN[sizeKey];
      return {
        id: `${c}|${sizeKey}`,
        code: c,
        size: sizeKey,
        stockQty: Number(row?.[col] ?? 0) || 0,
        sizeDisplay: sizeKey,
        location: null,
      };
    }
  );
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
    archived: Boolean(r.archived ?? r.is_archived ?? false),
    archivedAt: r.archivedAt ?? r.archived_at ?? null,
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

  const forceOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (forceOffline) {
    try {
      const cached = await db.table('product_cache').get(c);
      if (cached) {
        return normalizeProductRow({
          code: cached.code,
          name: cached.name,
          sale_price: cached.sale_price,
          free_gift: Boolean(cached.free_gift ?? false),
        });
      }
      const legacy = await db.products.get(c);
      if (legacy) return normalizeProductRow(legacy);
    } catch {
      /* fall through; return null at the end if server call also skipped */
    }
    if (forceOffline) return null;
  }

  try {
    const rows = await sbSelect('products', {
      select: '*',
      filters: [{ column: 'code', op: 'eq', value: c }],
      limit: 1,
    });
    return normalizeProductRow(rows?.[0]);
  } catch (e) {
    if (isNetworkFailure(e)) {
      try {
        const cached = await db.table('product_cache').get(c);
        if (!cached) return null;
        // Convert minimal cached product to a normalized row.
        return normalizeProductRow({
          code: cached.code,
          name: cached.name,
          sale_price: cached.sale_price,
          free_gift: Boolean(cached.free_gift ?? false),
        });
      } catch {
        // Legacy fallback on old Dexie products table (if any).
        try {
          const legacy = await db.products.get(c);
          return normalizeProductRow(legacy);
        } catch {
          return null;
        }
      }
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

  const forceOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (forceOffline) {
    try {
      const cached = await db.table('product_cache').get(c);
      if (cached && cached.sizes_json) {
        try {
          const rowObj =
            typeof cached.sizes_json === 'string'
              ? JSON.parse(cached.sizes_json)
              : cached.sizes_json;
          if (rowObj) return inventoriesRowToInventoryList(c, rowObj);
        } catch {
          /* fall through */
        }
      }
      const legacy = await db.inventory.where('code').equals(c).toArray();
      if (Array.isArray(legacy) && legacy.length) return legacy;
    } catch {
      /* fall through */
    }
    return [];
  }

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
      try {
        // 1. Try new product_cache.sizes_json (which stores the inventories row JSON)
        const cached = await db.table('product_cache').get(c);
        if (cached && cached.sizes_json) {
          try {
            const rowObj =
              typeof cached.sizes_json === 'string'
                ? JSON.parse(cached.sizes_json)
                : cached.sizes_json;
            if (rowObj) return inventoriesRowToInventoryList(c, rowObj);
          } catch {
            // fall through
          }
        }
        // 2. Legacy fallback on old Dexie inventory table
        const legacy = await db.inventory.where('code').equals(c).toArray();
        if (Array.isArray(legacy) && legacy.length) return legacy;
      } catch {
        // fall through and return empty
      }
      return [];
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
      (async () => {
        return sbSelect('erro_stock', {
          select: 'id,code,memo,checked_at,created_at',
          filters: [{ column: 'checked_at', op: 'is', value: 'null' }],
          order: { column: 'id', ascending: false },
        });
      })(),
    ]);
    const products = (productsRaw || []).map(normalizeProductRow).filter(Boolean);
    const inventories = inventoriesRaw || [];
    const errorStocks = errorStocksRaw || [];
    const byCode = new Map((inventories || []).map((r) => [String(r?.code || '').trim(), r]));
    const errorByCode = new Map(
      (errorStocks || []).map((r) => [
        String(r?.code || '').trim(),
        {
          id: Number(r?.id ?? 0) || 0,
          memo: String(r?.memo || '').trim(),
          createdAt: r?.created_at ?? null,
        },
      ])
    );
    const productCodes = new Set(products.map((p) => String(p.code || '').trim()));

    const baseRows = products.map((p) => {
      const invRow = byCode.get(p.code);
      const totalStock = invRow ? sumInventoriesRow(invRow, p.code) : 0;
      const sizes = invRow ? inventoriesRowToInventoryList(p.code, invRow) : [];
      const err = errorByCode.get(p.code) || null;
      const memo = String(err?.memo || '').trim();
      const statusFromInv = invRow?.check_status || 'unchecked';
      const checkStatus = memo ? 'error' : statusFromInv;

      return {
        ...p,
        totalStock,
        sizes,
        check_status: checkStatus,
        check_updated_at: invRow?.check_updated_at || null,
        error_memo: memo,
        error_id: Number(err?.id ?? 0) || 0,
        error_created_at: err?.createdAt ?? null,
      };
    });

    // Keep erro_stock-only codes visible in Check Stock even if product/inventory rows are missing.
    const orphanErrorRows = [];
    for (const [codeRaw, errRaw] of errorByCode.entries()) {
      const code = String(codeRaw || '').trim();
      if (!code || productCodes.has(code)) continue;
      const parsed = parseCode(code);
      const invRow = byCode.get(code);
      orphanErrorRows.push({
        code,
        no: 0,
        nameKo: '',
        categoryCode: parsed.categoryCode,
        genderCode: parsed.genderCode,
        typeCode: parsed.typeCode,
        brandCode: parsed.brandCode,
        colorCode: parsed.colorCode,
        modelNo: parsed.modelNo,
        priceCny: 0,
        cprice: 0,
        kprice: 0,
        p1price: 0,
        p2price: 0,
        p3price: 0,
        basePricePhp: 0,
        salePricePhp: 0,
        totalStock: invRow ? sumInventoriesRow(invRow, code) : 0,
        freeGift: false,
        archived: false,
        archivedAt: null,
        sizes: invRow ? inventoriesRowToInventoryList(code, invRow) : [],
        check_status: 'error',
        check_updated_at: invRow?.check_updated_at || null,
        error_memo: String(errRaw?.memo || '').trim(),
        error_id: Number(errRaw?.id ?? 0) || 0,
        error_created_at: errRaw?.createdAt ?? null,
      });
    }

    return [...baseRows, ...orphanErrorRows].sort((a, b) =>
      String(a?.code || '').localeCompare(String(b?.code || ''))
    );
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
      check_updated_at: now,
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

  // If an erro_stock row exists for this code, marking as checked resolves it.
  if (status === 'checked') {
    try {
      await sbUpdate(
        'erro_stock',
        { checked_at: now, updated_at: now },
        {
          filters: [
            { column: 'code', op: 'eq', value: c },
            { column: 'checked_at', op: 'is', value: 'null' },
          ],
          returning: 'minimal',
        }
      );
    } catch (e) {
      if (!isNetworkFailure(e)) console.warn(`Failed to resolve erro_stock for ${c}:`, e);
    }
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
    await Promise.all(
      chunk.map(([code, status]) =>
        sbUpdate(
          'inventories',
          { check_status: status, check_updated_at: now },
          {
            filters: [{ column: 'code', op: 'eq', value: code }],
            returning: 'minimal',
          }
        ).catch((e) => {
          if (!isNetworkFailure(e)) console.error(`Failed to update ${code}:`, e);
        })
      )
    );
  }

  // Resolve unresolved erro_stock rows when a code is saved as checked.
  const checkedCodes = entries
    .filter(([, status]) => status === 'checked')
    .map(([code]) => String(code || '').trim())
    .filter(Boolean);

  if (checkedCodes.length > 0) {
    for (let i = 0; i < checkedCodes.length; i += CHUNK_SIZE) {
      const chunk = checkedCodes.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map((code) =>
          sbUpdate(
            'erro_stock',
            { checked_at: now, updated_at: now },
            {
              filters: [
                { column: 'code', op: 'eq', value: code },
                { column: 'checked_at', op: 'is', value: 'null' },
              ],
              returning: 'minimal',
            }
          ).catch((e) => {
            if (!isNetworkFailure(e)) console.warn(`Failed to resolve erro_stock for ${code}:`, e);
          })
        )
      );
    }
  }
}

export async function upsertErroStock({ code, memo }) {
  if (!code) throw new Error('Code is required.');
  const c = String(code).trim();
  const m = String(memo || '').trim();
  const now = new Date().toISOString();

  // Parallel: Local Dexie + Remote erro_stock
  // checked_at = NULL means unresolved error.
  await Promise.all([
    // 1. Update Dexie (Local First) - Critical for offline support
    db.products
      .update(c, {
        error_memo: m,
        check_status: 'error',
        check_updated_at: now,
      })
      .catch((dexieErr) => console.warn('Failed to update Dexie error_memo:', dexieErr)),

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
          await sbUpdate(
            'erro_stock',
            { memo: m, checked_at: null, updated_at: now },
            {
              filters: [{ column: 'code', op: 'eq', value: c }],
              returning: 'minimal',
            }
          );
        } else {
          await sbInsert('erro_stock', [{ code: c, memo: m, checked_at: null, updated_at: now }], {
            returning: 'minimal',
          });
        }
      } catch (e) {
        console.error('Supabase save error:', e);
        throw e;
      }
    })(),

    // 3. Explicitly update inventories (Supabase)
    sbUpdate(
      'inventories',
      {
        check_status: 'error',
        check_updated_at: now,
      },
      {
        filters: [{ column: 'code', op: 'eq', value: c }],
        returning: 'minimal',
      }
    ).catch((e) => console.warn('Failed to explicit update inventories (upsert error):', e)),
  ]);
}

export async function deleteErroStock(code) {
  if (!code) throw new Error('Code is required.');
  const c = String(code).trim();
  const now = new Date().toISOString();

  // Parallel: Local Dexie + Remote erro_stock
  // checked_at = NOW() means resolved; row is purged 7 days later by cron.
  await Promise.all([
    // 1. Update Dexie (Local First)
    db.products
      .update(c, {
        error_memo: '',
        check_status: 'unchecked',
        check_updated_at: now,
      })
      .catch((dexieErr) => console.warn('Failed to update Dexie error_memo:', dexieErr)),

    // 2. Resolve erro_stock by stamping checked_at.
    (async () => {
      await sbUpdate(
        'erro_stock',
        { checked_at: now, updated_at: now },
        { filters: [{ column: 'code', op: 'eq', value: c }], returning: 'minimal' }
      );
    })(),

    // 3. Explicitly update inventories (Supabase)
    sbUpdate(
      'inventories',
      {
        check_status: 'unchecked',
        check_updated_at: now,
      },
      {
        filters: [{ column: 'code', op: 'eq', value: c }],
        returning: 'minimal',
      }
    ).catch((e) => console.warn('Failed to explicit update inventories (delete error):', e)),
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
      check_updated_at: now,
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
  await sbDelete('erro_stock', {
    filters: [{ column: 'code', op: 'eq', value: c }],
    returning: 'minimal',
  }).catch(() => null);
  await sbDelete('inventories', {
    filters: [{ column: 'code', op: 'eq', value: c }],
    returning: 'representation',
  });
  try {
    await sbDelete('products', {
      filters: [{ column: 'code', op: 'eq', value: c }],
      returning: 'representation',
    });
  } catch (e) {
    const msg = String(e?.message || e);
    const isSalesFk =
      msg.includes('sales_code_fkey') ||
      (msg.includes('violates foreign key constraint') && msg.includes('sales'));
    if (isSalesFk) throw new Error('DELETE_BLOCKED_BY_SALES_FK');
    throw e;
  }
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

  const allowedKeys = new Set(
    getSizeOptionsByCode(c).map((opt) => String(opt.key || '').toUpperCase())
  );

  const changes = {};
  for (const [sizeRaw, qty] of Object.entries(sizeQtyMap || {})) {
    const sizeKey = normalizeSizeKey(sizeRaw);
    const col = SIZE_TO_COLUMN[sizeKey];
    if (!col) continue;
    // ✅ 핵심: 해당 제품에서 지원되지 않는 사이즈는 무조건 0으로 강제 클린징
    //    (고립 재고가 DB에 남는 것을 원천 차단)
    if (!allowedKeys.has(String(sizeKey || '').toUpperCase())) {
      changes[col] = 0;
    } else {
      changes[col] = Number(qty) || 0;
    }
  }

  // ✅ 방어 로직: SIZE_ORDER 전체를 순회하며 지원되지 않는 사이즈 컬럼은
  //    명시적으로 0으로 SET 해주어 이전에 고립된 데이터도 함께 정리
  for (const sizeKey of SIZE_ORDER) {
    const col = SIZE_TO_COLUMN[sizeKey];
    if (!col || col in changes) continue;
    if (!allowedKeys.has(String(sizeKey || '').toUpperCase())) {
      changes[col] = 0;
    }
  }

  const existingRows = await sbSelect('inventories', {
    select: '*',
    filters: [{ column: 'code', op: 'eq', value: c }],
    limit: 1,
  });
  const existingRow = existingRows?.[0];
  const hasExisting = Array.isArray(existingRows) && existingRows.length > 0;

  if (hasExisting) {
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
      const keyOk = allowedKeys.has(String(sizeKey || '').toUpperCase());
      insertRow[col] = keyOk ? Number(changes[col] ?? 0) || 0 : 0;
    }
    Object.assign(insertRow, changes);
    insertRow.no = await getNextInventoryNo();
    await sbInsert('inventories', [insertRow], { returning: 'minimal' });
  }

  const invRows = await sbSelect('inventories', {
    select: '*',
    filters: [{ column: 'code', op: 'eq', value: c }],
    limit: 1,
  });
  const row = invRows?.[0];
  return { code: c, totalStock: sumInventoriesRow(row, c) };
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

/**
 * 🔄 상품 코드 일괄 변경 (oldCode → newCode)
 *
 * 🚀 Supabase 모드 (심플 버전!):
 *   - FK 제약조건에 미리 ON UPDATE CASCADE를 달아놨으므로,
 *     그냥 products.code 만 한 번 UPDATE 하면 PostgreSQL DB가
 *     자동으로 sales / inventories / erro_stock 의 code 를 다 같이 바꿔줌!
 *   - 더 이상 RPC 함수 필요 없음, 여러 테이블 개별 PATCH도 필요 없음.
 *
 * 💾 Dexie Local 모드: 기존대로 products/inventory/saleItems/refunds 테이블 code UPDATE
 */
export async function renameProductCode(oldCodeRaw, newCodeRaw) {
  requireAdminOrThrow();
  const oldCode = String(oldCodeRaw || '')
    .trim()
    .toUpperCase();
  const newCode = String(newCodeRaw || '')
    .trim()
    .toUpperCase();
  if (!oldCode) throw new Error('기존 코드를 입력해주세요.');
  if (oldCode === newCode) return true;

  validateProductCode(newCode);

  const existsNew = await isProductCodeExists(newCode);
  if (existsNew) throw new Error(`이미 존재하는 상품 코드입니다: ${newCode}`);
  const existsOld = await isProductCodeExists(oldCode);
  if (!existsOld) throw new Error(`존재하지 않는 기존 코드입니다: ${oldCode}`);

  // ---------------------------------------------------------------------------
  // ✨ Supabase: SECURITY DEFINER RPC 로 실행 (sbUpdate PATCH 400 Bad Request 방지!)
  //   - sbUpdate 는 REST API anon 권한으로 실행되어 RLS/PK UPDATE 제약으로 400 실패함
  //   - rename_product_code_simple() 은 DB postgres 권한(SECURITY DEFINER)으로 실행되어
  //     RLS 없이 무조건 성공!
  //   - FK ON UPDATE CASCADE 로 인해 sales / inventories / erro_stock 전부 자동 반영
  // ---------------------------------------------------------------------------
  try {
    await sbRpc('rename_product_code_simple', {
      old_code: oldCode,
      new_code: newCode,
    });
  } catch (sbErr) {
    if (isNetworkFailure(sbErr)) {
      // 네트워크 오류면 Dexie 라도 시도 후 종료
    } else {
      throw sbErr;
    }
  }

  // ---------------------------------------------------------------------------
  // 💾 Dexie Local DB: 그대로 code rename
  // ---------------------------------------------------------------------------
  const RELATED_DEXIE_STORES = ['inventory', 'saleItems', 'refunds'];
  try {
    await db.transaction('rw', db.products, db.inventory, db.saleItems, db.refunds, async () => {
      const prodRow = await db.products.get(oldCode);
      if (prodRow) {
        await db.products.delete(oldCode);
        await db.products.add({ ...prodRow, code: newCode });
      }
      for (const storeName of RELATED_DEXIE_STORES) {
        const store = db[storeName];
        if (!store) continue;
        const rows = await store.where('code').equals(oldCode).toArray();
        if (rows.length > 0) {
          await store.where('code').equals(oldCode).delete();
          await store.bulkAdd(rows.map((r) => ({ ...r, code: newCode })));
        }
      }
    });
  } catch (dexieErr) {
    console.warn('Dexie renameProductCode 로컬 저장 실패 (영향 없음):', dexieErr);
  }

  return true;
}
